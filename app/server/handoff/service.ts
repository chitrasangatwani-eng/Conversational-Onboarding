// Human handoff: turns "Talk to a person" and "Call me back" into a ticket
// that reaches a support team, carrying the summary the applicant reviewed.
//
// Pick where tickets go with HANDOFF_PROVIDER:
//   sandbox (default)  tickets stay on this server and are logged; nothing leaves it.
//   webhook            POSTs the ticket as JSON to HANDOFF_WEBHOOK_URL. When
//                      HANDOFF_WEBHOOK_SECRET is set, adds an X-Signature header
//                      ("sha256=" + HMAC of the raw body) so the receiver can
//                      check it came from here. Fits a helpdesk, CRM or your own API.
//   slack              posts a readable message to a Slack incoming webhook
//                      (HANDOFF_SLACK_WEBHOOK_URL).
//
// What is never sent: PAN or Aadhaar numbers, documents, photos, OTPs. The
// summary is built by the app from verified state, and text that looks like
// an ID or phone number is refused before anything goes out.
//
// The queue position and wait are estimates from the tickets this server has
// open. A real helpdesk would supply its own.

import crypto from "node:crypto";

export type HandoffKind = "chat" | "callback";

export interface Ticket {
  id: string;
  kind: HandoffKind;
  createdAt: string;
  language: string;
  sharedSummary: boolean;
  summary: string[];
  goal: string | null;
  mobileVerified: string | null; // last 4 digits when the OTP token checks out
}

interface Destination { readonly name: string; deliver(t: Ticket): Promise<void> }

// Long digit runs (Aadhaar, phone, account), PAN format, and 6-digit OTP/PIN-like numbers.
const SENSITIVE = [/\d[\d\s-]{6,}/, /[a-z]{5}\d{4}[a-z]/i, /(^|\D)\d{6}(\D|$)/];
export const looksSensitive = (s: string) => SENSITIVE.some((r) => r.test(s));

class SandboxDestination implements Destination {
  readonly name = "sandbox";
  async deliver(t: Ticket) {
    console.log(`[handoff:sandbox] ${t.id} ${t.kind} lang=${t.language} summary=${t.sharedSummary ? t.summary.length + " lines" : "declined"} mobile=${t.mobileVerified ? "verified" : "not verified"}`);
  }
}

class WebhookDestination implements Destination {
  readonly name = "webhook";
  constructor(private url: string, private secret?: string) {}
  async deliver(t: Ticket) {
    const body = JSON.stringify({ type: "handoff.created", ticket: t });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.secret) headers["x-signature"] = "sha256=" + crypto.createHmac("sha256", this.secret).update(body).digest("hex");
    const res = await fetch(this.url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
  }
}

class SlackDestination implements Destination {
  readonly name = "slack";
  constructor(private url: string) {}
  async deliver(t: Ticket) {
    const lines = [
      `*${t.kind === "callback" ? "Call-back request" : "Chat handoff"}* · ${t.id} · language ${t.language}`,
      t.mobileVerified ? `Mobile verified (••••${t.mobileVerified})` : "Mobile not verified yet",
      ...(t.sharedSummary ? t.summary.map((f) => "• " + f) : ["Applicant declined to share a summary. Ask about their case."]),
      ...(t.goal ? [`Goal: ${t.goal}`] : []),
    ];
    const res = await fetch(this.url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }), signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`slack ${res.status}`);
  }
}

function destinationFromEnv(): Destination {
  const name = (process.env.HANDOFF_PROVIDER || "sandbox").toLowerCase();
  const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`HANDOFF_PROVIDER=${name} needs ${k} to be set`); return v; };
  switch (name) {
    case "sandbox": return new SandboxDestination();
    case "webhook": return new WebhookDestination(need("HANDOFF_WEBHOOK_URL"), process.env.HANDOFF_WEBHOOK_SECRET);
    case "slack": return new SlackDestination(need("HANDOFF_SLACK_WEBHOOK_URL"));
    default: throw new Error(`Unknown HANDOFF_PROVIDER "${name}". Use sandbox, webhook or slack.`);
  }
}

export type CreateResult =
  | { ok: true; ticketId: string; position: number; waitMinutes: number }
  | { ok: false; reason: "invalid" | "sensitive" | "delivery_failed" };

const OPEN_FOR_MS = 15 * 60_000;

export class HandoffService {
  private dest = destinationFromEnv();
  private open: { id: string; at: number }[] = [];
  get providerName() { return this.dest.name; }

  async create(input: {
    kind: unknown; language: unknown; share: unknown; summary: unknown; goal: unknown; mobileVerified: string | null;
  }): Promise<CreateResult> {
    const kind = input.kind === "callback" ? "callback" : input.kind === "chat" ? "chat" : null;
    const language = typeof input.language === "string" && /^[a-z]{2,3}$/.test(input.language) ? input.language : null;
    const share = input.share === true;
    const summary = Array.isArray(input.summary) ? input.summary : [];
    const goal = typeof input.goal === "string" ? input.goal.trim().slice(0, 200) : "";
    if (!kind || !language || summary.length > 10 || summary.some((s) => typeof s !== "string" || s.length > 200)) return { ok: false, reason: "invalid" };
    const texts = share ? [...(summary as string[]), goal] : [];
    if (texts.some(looksSensitive)) return { ok: false, reason: "sensitive" };

    const now = Date.now();
    this.open = this.open.filter((t) => now - t.at < OPEN_FOR_MS);
    const ticket: Ticket = {
      id: "HO-" + crypto.randomBytes(3).toString("hex").toUpperCase(),
      kind, language, createdAt: new Date(now).toISOString(), sharedSummary: share,
      summary: share ? (summary as string[]) : [], goal: share && goal ? goal : null,
      mobileVerified: input.mobileVerified,
    };
    try {
      await this.dest.deliver(ticket);
    } catch (e) {
      console.error(`[handoff:${this.dest.name}] ${ticket.id} delivery failed:`, (e as Error).message);
      return { ok: false, reason: "delivery_failed" };
    }
    this.open.push({ id: ticket.id, at: now });
    const position = this.open.length;
    return { ok: true, ticketId: ticket.id, position, waitMinutes: Math.max(2, position * 3) };
  }
}
