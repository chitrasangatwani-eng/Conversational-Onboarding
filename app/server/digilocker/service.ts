// DigiLocker fetch for the PAN and address steps.
//
// The applicant is sent to DigiLocker, signs in there and approves sharing.
// DigiLocker redirects back to /api/digilocker/callback with a one-time code,
// which this server swaps for an access token (OAuth 2.0 with PKCE), reads what
// it needs, and then forgets the token. The browser only ever gets a summary:
// whether a PAN is in the locker, whether the name matches, the last 4
// characters of the PAN, and the address PIN code and state. Full numbers and
// documents never reach the app or the assistant.
//
// Pick the provider with DIGILOCKER_PROVIDER:
//   sandbox (default)  a DigiLocker-style consent page on this server with
//                      sample data. No account needed.
//   setu               DigiLocker through Setu (a licensed KYC provider). Env:
//                      SETU_CLIENT_ID, SETU_CLIENT_SECRET, SETU_PRODUCT_INSTANCE_ID,
//                      optional SETU_DIGILOCKER_BASE_URL (default the sandbox,
//                      https://dg-sandbox.setu.co; production https://dg.setu.co).
//                      Setu returns the e-Aadhaar (name, masked number, address).
//                      Whether a PAN was shared comes from the scope Setu adds
//                      to the redirect (ADHAR, PANCR, DRVLC); its number isn't
//                      returned. Access is revoked right after the data is read.
//   digilocker         the official DigiLocker Requester API. Needs approval as
//                      a DigiLocker partner (via partners.digilocker.gov.in or
//                      API Setu). Env: DIGILOCKER_CLIENT_ID,
//                      DIGILOCKER_CLIENT_SECRET, DIGILOCKER_REDIRECT_URI (exactly
//                      as registered), optional DIGILOCKER_BASE_URL.
//
// The real connector follows the Requester API (authorize, token, issued
// files, e-Aadhaar XML) but has not been run against DigiLocker yet. Check the
// endpoint paths and response fields against the API specification issued
// with your partner credentials before going live; each path is listed below.

import crypto from "node:crypto";
import { clean } from "../otp/providers";

export type Purpose = "pan" | "address";

/** What the connector learns from DigiLocker. Stays on the server. */
interface LockerData {
  name: string;
  aadhaarLast4?: string;
  panIssued: boolean;
  panLast4?: string;
  pincode?: string;
  state?: string;
}

/** What the app receives. */
export interface LockerSummary {
  purpose: Purpose;
  aadhaarLast4: string | null;
  panIssued: boolean;
  panLast4: string | null;
  nameMatch: boolean;
  pincode: string | null;
  state: string | null;
}

interface Provider {
  readonly name: string;
  /** OAuth-style providers build the consent URL directly. */
  authorizeUrl?(p: { state: string; challenge: string; redirectUri: string }): string;
  /** Request-style providers (Setu) create a request first and get its consent URL and id. */
  begin?(p: { redirectUri: string }): Promise<{ url: string; ref: string }>;
  fetch(p: { code: string | null; verifier: string; redirectUri: string; ref?: string; purpose: Purpose; params: URLSearchParams }): Promise<LockerData>;
}

/** The user didn't finish or allow sharing (as opposed to a technical failure). */
class NotShared extends Error {}

// ---- Sandbox ----

const SANDBOX: Record<string, LockerData> = {
  allow: { name: "Chitra Sangatwani", panIssued: true, panLast4: "234F", pincode: "400001", state: "Maharashtra" },
  "name-differs": { name: "C. Sangatwani", panIssued: true, panLast4: "234F", pincode: "400001", state: "Maharashtra" },
  "no-pan": { name: "Chitra Sangatwani", panIssued: false, pincode: "400001", state: "Maharashtra" },
};

class SandboxProvider implements Provider {
  readonly name = "sandbox";
  authorizeUrl({ state }: { state: string }) {
    return "/api/digilocker/sandbox?state=" + encodeURIComponent(state);
  }
  async fetch({ code }: { code: string | null }) {
    const d = SANDBOX[(code ?? "").replace(/^sandbox-/, "")];
    if (!d) throw new Error("sandbox: unknown code");
    return d;
  }
}

// ---- Official DigiLocker Requester API ----

class DigiLockerProvider implements Provider {
  readonly name = "digilocker";
  constructor(private base: string, private clientId: string, private secret: string) {}

  authorizeUrl({ state, challenge, redirectUri }: { state: string; challenge: string; redirectUri: string }) {
    // GET {base}/public/oauth2/1/authorize
    const q = new URLSearchParams({
      response_type: "code", client_id: this.clientId, redirect_uri: redirectUri, state,
      code_challenge: challenge, code_challenge_method: "S256",
    });
    return `${this.base}/public/oauth2/1/authorize?${q}`;
  }

  async fetch({ code, verifier, redirectUri }: { code: string | null; verifier: string; redirectUri: string }): Promise<LockerData> {
    if (!code) throw new NotShared("no code");
    // POST {base}/public/oauth2/1/token -> access_token plus the account holder's name and dob
    const tokenRes = await fetch(`${this.base}/public/oauth2/1/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code", code, client_id: this.clientId, client_secret: this.secret,
        redirect_uri: redirectUri, code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; name?: string; error?: string; error_description?: string };
    if (!tokenRes.ok || !tok.access_token) throw new Error(`token ${tokenRes.status}: ${tok.error_description ?? tok.error ?? "no access_token"}`);
    const auth = { authorization: "Bearer " + tok.access_token };

    // GET {base}/public/oauth2/2/files/issued -> { items: [{ doctype, uri, ... }] }; PAN is doctype PANCR
    const issuedRes = await fetch(`${this.base}/public/oauth2/2/files/issued`, { headers: auth, signal: AbortSignal.timeout(15_000) });
    const issued = (await issuedRes.json().catch(() => ({}))) as { items?: { doctype?: string; uri?: string }[] };
    if (!issuedRes.ok) throw new Error(`issued files ${issuedRes.status}`);
    const pan = (issued.items ?? []).find((i) => i.doctype === "PANCR");
    // The PAN document URI ends with the PAN number; keep only the last 4 characters.
    const panLast4 = pan?.uri?.match(/([A-Z0-9]{4})$/i)?.[1]?.toUpperCase();

    // GET {base}/public/oauth2/3/xml/eaadhaar -> e-Aadhaar XML; the address is in the Poa element
    let pincode: string | undefined, state: string | undefined;
    const xmlRes = await fetch(`${this.base}/public/oauth2/3/xml/eaadhaar`, { headers: auth, signal: AbortSignal.timeout(15_000) });
    if (xmlRes.ok) {
      const poa = (await xmlRes.text()).match(/<Poa\b[^>]*>/)?.[0] ?? "";
      pincode = poa.match(/\bpc="(\d{6})"/)?.[1];
      state = poa.match(/\bstate="([^"]+)"/)?.[1];
    }
    return { name: tok.name ?? "", panIssued: !!pan, panLast4, pincode, state };
  }
}

// ---- DigiLocker through Setu ----
//   POST {base}/api/digilocker                 { redirectUrl }  -> { id, status: unauthenticated|authenticated|revoked, url, validUpto }
//   GET  {base}/api/digilocker/{id}/aadhaar                     -> { aadhaar: { name, maskedNumber, address: { pin, state, ... }, verified }, status }
//   GET  {base}/api/digilocker/{id}/revoke                      -> { success: true }
// Headers on every call: x-client-id, x-client-secret, x-product-instance-id.
// Setu redirects to redirectUrl (plus our own ?state=) with:
//   success=True&id=<id>&scope=ADHAR+PANCR+DRVLC    or    success=False&id=<id>&errCode=..&errMessage=..
// Errors look like { error: { code, detail, traceId } }.

class SetuProvider implements Provider {
  readonly name = "setu";
  constructor(private base: string, private clientId: string, private secret: string, private instanceId: string) {}
  private headers() {
    return { "x-client-id": this.clientId, "x-client-secret": this.secret, "x-product-instance-id": this.instanceId, "content-type": "application/json" };
  }
  private static err(j: unknown) {
    const e = (j as { error?: { code?: string; detail?: string } })?.error;
    return e ? `${e.code ?? ""} ${e.detail ?? ""}`.trim() : JSON.stringify(j).slice(0, 200);
  }
  async begin({ redirectUri }: { redirectUri: string }) {
    const r = await fetch(`${this.base}/api/digilocker`, { method: "POST", headers: this.headers(), body: JSON.stringify({ redirectUrl: redirectUri }), signal: AbortSignal.timeout(15_000) });
    const j = (await r.json().catch(() => ({}))) as { id?: string; url?: string };
    if (!r.ok || !j.id || !j.url) throw new Error(`setu create ${r.status}: ${SetuProvider.err(j)}`);
    return { url: j.url, ref: j.id };
  }
  async fetch({ ref, purpose, params }: { ref?: string; purpose: Purpose; params: URLSearchParams }): Promise<LockerData> {
    if (!ref) throw new Error("setu: no request id");
    // Setu's id on the redirect must be the request we created for this flow.
    if (params.get("id") && params.get("id") !== ref) throw new Error("setu: redirect id doesn't match the request");
    if (!/^true$/i.test(params.get("success") ?? "")) throw new NotShared(`setu consent failed: ${params.get("errCode") ?? ""} ${params.get("errMessage") ?? ""}`.trim());
    const scope = (params.get("scope") ?? "").toUpperCase().split(/[+\s,]+/).filter(Boolean);
    if (!scope.includes("ADHAR")) throw new NotShared("setu: Aadhaar not shared (scope: " + (scope.join("+") || "none") + ")");
    try {
      const r = await fetch(`${this.base}/api/digilocker/${encodeURIComponent(ref)}/aadhaar`, { headers: this.headers(), signal: AbortSignal.timeout(20_000) });
      const j = (await r.json().catch(() => ({}))) as { aadhaar?: { name?: string; maskedNumber?: string; address?: { pin?: string; state?: string } } };
      // 400 aadhaar_not_linked, 401 not authenticated or revoked: the person didn't complete sharing.
      if (r.status === 400 || r.status === 401) throw new NotShared(`setu aadhaar ${r.status}: ${SetuProvider.err(j)}`);
      if (!r.ok || !j.aadhaar) throw new Error(`setu aadhaar ${r.status}: ${SetuProvider.err(j)}`);
      const a = j.aadhaar;
      return {
        name: a.name ?? "",
        panIssued: purpose === "pan" && scope.includes("PANCR"),
        aadhaarLast4: a.maskedNumber?.match(/(\d{4})\s*$/)?.[1],
        pincode: a.address?.pin && /^\d{6}$/.test(a.address.pin) ? a.address.pin : undefined,
        state: a.address?.state || undefined,
      };
    } finally {
      // We only need this once: end our access to the person's DigiLocker.
      void fetch(`${this.base}/api/digilocker/${encodeURIComponent(ref)}/revoke`, { headers: this.headers(), signal: AbortSignal.timeout(10_000) }).catch(() => {});
    }
  }
}

function providerFromEnv(): Provider {
  const name = (process.env.DIGILOCKER_PROVIDER || "sandbox").toLowerCase();
  const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`DIGILOCKER_PROVIDER=digilocker needs ${k} to be set`); return v; };
  if (name === "sandbox") return new SandboxProvider();
  if (name === "setu") {
    const req = (k: string) => { const v = clean(process.env[k]); if (!v) throw new Error(`DIGILOCKER_PROVIDER=setu needs ${k} to be set`); return v; };
    return new SetuProvider((clean(process.env.SETU_DIGILOCKER_BASE_URL) || "https://dg-sandbox.setu.co").replace(/\/+$/, ""), req("SETU_CLIENT_ID"), req("SETU_CLIENT_SECRET"), req("SETU_PRODUCT_INSTANCE_ID"));
  }
  if (name === "digilocker") {
    need("DIGILOCKER_REDIRECT_URI");
    return new DigiLockerProvider((process.env.DIGILOCKER_BASE_URL || "https://api.digitallocker.gov.in").replace(/\/+$/, ""), need("DIGILOCKER_CLIENT_ID"), need("DIGILOCKER_CLIENT_SECRET"));
  }
  throw new Error(`Unknown DIGILOCKER_PROVIDER "${name}". Use sandbox, setu or digilocker.`);
}

// ---- Flow state ----

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
const FLOW_TTL_MS = 10 * 60_000;

type Flow = {
  purpose: Purpose; expectedName: string; verifier: string; redirectUri: string; expires: number; ref?: string;
  result?: { status: "done"; summary: LockerSummary } | { status: "denied" | "error" };
};

export class DigiLockerService {
  private provider = providerFromEnv();
  private flows = new Map<string, Flow>();
  get providerName() { return this.provider.name; }

  constructor() { setInterval(() => { const now = Date.now(); for (const [k, f] of this.flows) if (now > f.expires) this.flows.delete(k); }, 60_000).unref(); }

  /** Begin a consent flow. `origin` is this server's public origin, used for the callback unless one is configured. */
  async start(purpose: unknown, expectedName: unknown, origin: string): Promise<{ state: string; url: string } | null> {
    if (purpose !== "pan" && purpose !== "address") return null;
    const name = typeof expectedName === "string" ? expectedName.slice(0, 100) : "";
    const state = crypto.randomBytes(16).toString("base64url");
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const callback = origin + "/api/digilocker/callback";
    if (this.provider.begin) {
      // Setu: our state rides on the redirect URL, so the callback finds this flow.
      const redirectUri = callback + "?state=" + encodeURIComponent(state);
      const { url, ref } = await this.provider.begin({ redirectUri });
      this.flows.set(state, { purpose, expectedName: name, verifier, redirectUri, ref, expires: Date.now() + FLOW_TTL_MS });
      return { state, url };
    }
    const redirectUri = process.env.DIGILOCKER_REDIRECT_URI || callback;
    this.flows.set(state, { purpose, expectedName: name, verifier, redirectUri, expires: Date.now() + FLOW_TTL_MS });
    return { state, url: this.provider.authorizeUrl!({ state, challenge, redirectUri }) };
  }

  /** Handle DigiLocker's redirect. Returns false for an unknown or expired state. */
  async callback(state: string, params: URLSearchParams): Promise<boolean> {
    const f = this.flows.get(state);
    if (!f || Date.now() > f.expires || f.result) return false;
    const code = params.get("code");
    if (params.get("error") || (!code && !f.ref)) { f.result = { status: "denied" }; return true; }
    try {
      const d = await this.provider.fetch({ code, verifier: f.verifier, redirectUri: f.redirectUri, ref: f.ref, purpose: f.purpose, params });
      f.result = {
        status: "done",
        summary: {
          purpose: f.purpose, aadhaarLast4: d.aadhaarLast4 ?? null, panIssued: d.panIssued, panLast4: d.panLast4 ?? null,
          nameMatch: !!f.expectedName && norm(d.name) === norm(f.expectedName),
          pincode: d.pincode ?? null, state: d.state ?? null,
        },
      };
    } catch (e) {
      if (e instanceof NotShared) { console.log(`[digilocker:${this.provider.name}] not shared: ${(e as Error).message}`); f.result = { status: "denied" }; return true; }
      console.error(`[digilocker:${this.provider.name}] fetch failed:`, (e as Error).message);
      f.result = { status: "error" };
    }
    return true;
  }

  /** The app polls this. A finished result is handed out once, then forgotten. */
  result(state: unknown): { status: "pending" | "unknown" } | NonNullable<Flow["result"]> {
    const f = typeof state === "string" ? this.flows.get(state) : undefined;
    if (!f || Date.now() > f.expires) return { status: "unknown" };
    if (!f.result) return { status: "pending" };
    this.flows.delete(state as string);
    return f.result;
  }
}

// ---- Pages served in the consent window ----

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f3f5f9;color:#1d2420}main{max-width:420px;margin:0 auto;padding:24px 20px}
.bar{background:#2b3a8c;color:#fff;padding:14px 20px;font-weight:700;letter-spacing:.02em}.tag{font:12px monospace;background:#ffe9b3;color:#5a4300;border-radius:6px;padding:2px 6px;margin-left:8px}
.card{background:#fff;border:1px solid #d9deea;border-radius:14px;padding:16px;margin:16px 0}button,a.btn{display:block;width:100%;box-sizing:border-box;border:0;border-radius:12px;padding:14px;font:600 16px system-ui;margin-top:10px;cursor:pointer;text-align:center;text-decoration:none}
.go{background:#2b3a8c;color:#fff}.alt{background:#fff;color:#2b3a8c;border:1px solid #2b3a8c}.no{background:none;color:#5b6170;text-decoration:underline}small{color:#5b6170}</style></head><body>${body}</body></html>`;

export function sandboxConsentPage(state: string): string {
  const s = encodeURIComponent(state);
  const go = (code: string) => `/api/digilocker/callback?state=${s}&code=sandbox-${code}`;
  return page("DigiLocker (sandbox)", `<div class="bar">DigiLocker<span class="tag">SANDBOX</span></div><main>
<h2 style="margin:8px 0 4px">Share documents?</h2>
<p><b>Onboarding Assistant</b> is asking to read from your DigiLocker:</p>
<div class="card">• PAN card (PANCR)<br>• Aadhaar address (e-Aadhaar)<br><small>Used only for KYC. You can revoke access in DigiLocker at any time.</small></div>
<p><small>This is a test page with sample data. The real DigiLocker asks you to sign in with your Aadhaar or mobile number and an OTP.</small></p>
<a class="btn go" href="${go("allow")}">Allow</a>
<a class="btn alt" href="${go("name-differs")}">Allow (test: name differs)</a>
<a class="btn alt" href="${go("no-pan")}">Allow (test: no PAN in locker)</a>
<a class="btn no" href="/api/digilocker/callback?state=${s}&error=access_denied">Deny</a></main>`);
}

export function callbackPage(ok: boolean, rawState: string): string {
  const state = rawState.replace(/[^A-Za-z0-9_-]/g, ""); // state is base64url; drop anything else before it goes into the script
  const msg = ok ? "Done. You can go back to the app." : "This DigiLocker link has expired. Go back to the app and try again.";
  return page("DigiLocker", `<div class="bar">DigiLocker</div><main><div class="card">${msg}</div>
<button class="go" onclick="window.close()">Close this window</button></main>
<script>try{if(window.opener)window.opener.postMessage({type:"digilocker",state:${JSON.stringify(state)}},location.origin);}catch(e){}setTimeout(function(){window.close()},800);</script>`);
}
