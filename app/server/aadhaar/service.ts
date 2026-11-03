// Aadhaar OTP verification for the PAN step.
//
// The applicant gives their Aadhaar number and explicit consent; an OTP goes
// to the mobile linked to that Aadhaar; on a correct OTP the provider returns
// the verified name and address. Only licensed entities may do this, so a real
// deployment goes through a KYC provider that holds a UIDAI licence (or a
// regulated entity's own AUA/KUA access).
//
// What stays on this server: the Aadhaar number is used once to request the
// OTP and is never stored or logged; only a keyed hash and the last 4 digits
// are kept while the OTP is pending. The app gets the last 4 digits, whether
// the name matches the PAN name, and the address PIN code and state.
//
// Pick the provider with AADHAAR_PROVIDER:
//   sandbox (default)  no UIDAI call; the OTP is shown in the app; sample data.
//   Any other value is refused at startup until that provider's connector is
//   added to `providerFromEnv` below. A connector implements AadhaarProvider:
//   requestOtp(aadhaar) and verifyOtp(ref, otp) against your provider's API.

import crypto from "node:crypto";

/** Verhoeff checksum, which every valid Aadhaar number satisfies. */
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
export function validAadhaar(n: string): boolean {
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  let c = 0;
  n.split("").reverse().forEach((ch, i) => { c = D[c][P[i % 8][+ch]]; });
  return c === 0;
}

export interface AadhaarData { name: string; pincode?: string; state?: string }

export interface AadhaarProvider {
  readonly name: string;
  readonly sandbox: boolean;
  /** Ask for an OTP to the Aadhaar-linked mobile. Returns the provider's reference. */
  requestOtp(aadhaar: string): Promise<{ ref: string; sandboxCode?: string }>;
  /** Check the OTP. Returns the verified data, or null for a wrong OTP. */
  verifyOtp(ref: string, otp: string): Promise<AadhaarData | null>;
}

class SandboxProvider implements AadhaarProvider {
  readonly name = "sandbox";
  readonly sandbox = true;
  private codes = new Map<string, { code: string; last4: string }>();
  async requestOtp(aadhaar: string) {
    const ref = crypto.randomUUID();
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    this.codes.set(ref, { code, last4: aadhaar.slice(-4) });
    return { ref, sandboxCode: code };
  }
  async verifyOtp(ref: string, otp: string) {
    const r = this.codes.get(ref);
    if (!r || r.code !== otp) return null;
    this.codes.delete(ref);
    // Sandbox test numbers: one ending 0000 returns a different name, to try the mismatch path.
    return { name: r.last4 === "0000" ? "C. Sangatwani" : "Chitra Sangatwani", pincode: "400001", state: "Maharashtra" };
  }
}

function providerFromEnv(): AadhaarProvider {
  const name = (process.env.AADHAAR_PROVIDER || "sandbox").toLowerCase();
  if (name === "sandbox") return new SandboxProvider();
  throw new Error(`AADHAAR_PROVIDER "${name}" has no connector yet. Add one in server/aadhaar/service.ts, or use sandbox.`);
}

const TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const RESEND_MS = 30_000;
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");

export type AadhaarStart =
  | { ok: true; ref: string; last4: string; sandboxCode?: string }
  | { ok: false; reason: "invalid_number" | "no_consent" | "too_soon" | "provider_error"; retryIn?: number };

export type AadhaarCheck =
  | { ok: true; last4: string; nameMatch: boolean; pincode: string | null; state: string | null }
  | { ok: false; reason: "wrong_otp" | "expired" | "too_many_attempts" | "provider_error"; attemptsLeft?: number };

export class AadhaarService {
  private provider = providerFromEnv();
  private pending = new Map<string, { providerRef: string; last4: string; key: string; attempts: number; expires: number }>();
  private lastSend = new Map<string, number>();
  private secret = process.env.OTP_SECRET ? Buffer.from(process.env.OTP_SECRET) : crypto.randomBytes(32);
  get providerName() { return this.provider.name; }

  constructor() {
    setInterval(() => { const now = Date.now(); for (const [k, p] of this.pending) if (now > p.expires) this.pending.delete(k); }, 60_000).unref();
  }

  async start(aadhaar: unknown, consent: unknown): Promise<AadhaarStart> {
    const n = typeof aadhaar === "string" ? aadhaar.replace(/\D/g, "") : "";
    if (!validAadhaar(n)) return { ok: false, reason: "invalid_number" };
    if (consent !== true) return { ok: false, reason: "no_consent" };
    const key = crypto.createHmac("sha256", this.secret).update("aadhaar\u0000" + n).digest("hex");
    const last = this.lastSend.get(key);
    if (last && Date.now() - last < RESEND_MS) return { ok: false, reason: "too_soon", retryIn: Math.ceil((RESEND_MS - (Date.now() - last)) / 1000) };
    try {
      const r = await this.provider.requestOtp(n);
      const ref = crypto.randomUUID();
      for (const [k, p] of this.pending) if (p.key === key) this.pending.delete(k);
      this.pending.set(ref, { providerRef: r.ref, last4: n.slice(-4), key, attempts: 0, expires: Date.now() + TTL_MS });
      this.lastSend.set(key, Date.now());
      return { ok: true, ref, last4: n.slice(-4), ...(this.provider.sandbox ? { sandboxCode: r.sandboxCode } : {}) };
    } catch (e) {
      console.error(`[aadhaar:${this.provider.name}] OTP request for ••••${n.slice(-4)} failed:`, (e as Error).message);
      return { ok: false, reason: "provider_error" };
    }
  }

  async verify(ref: unknown, otp: unknown, expectedName: unknown): Promise<AadhaarCheck> {
    const p = typeof ref === "string" ? this.pending.get(ref) : undefined;
    if (!p || Date.now() > p.expires) { if (p) this.pending.delete(ref as string); return { ok: false, reason: "expired" }; }
    if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) return { ok: false, reason: "wrong_otp", attemptsLeft: MAX_ATTEMPTS - p.attempts };
    p.attempts++;
    let data: AadhaarData | null;
    try { data = await this.provider.verifyOtp(p.providerRef, otp); }
    catch (e) { console.error(`[aadhaar:${this.provider.name}] verify failed:`, (e as Error).message); return { ok: false, reason: "provider_error" }; }
    if (!data) {
      if (p.attempts >= MAX_ATTEMPTS) { this.pending.delete(ref as string); return { ok: false, reason: "too_many_attempts" }; }
      return { ok: false, reason: "wrong_otp", attemptsLeft: MAX_ATTEMPTS - p.attempts };
    }
    this.pending.delete(ref as string);
    const want = typeof expectedName === "string" ? expectedName : "";
    return { ok: true, last4: p.last4, nameMatch: !!want && norm(data.name) === norm(want), pincode: data.pincode ?? null, state: data.state ?? null };
  }
}
