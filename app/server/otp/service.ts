// One-time codes for mobile verification.
//
// The server makes and checks every code; the browser never decides whether a
// code is right. Codes are kept only as keyed hashes, expire after 5 minutes,
// allow 5 tries, and a number can request a new code every 30 seconds and at
// most 5 times an hour. A successful check returns a signed token that later
// steps (or a real backend) can trust instead of the browser's word.
//
// State lives in memory, which suits one demo server. A production deployment
// with several instances needs a shared store such as Redis.

import crypto from "node:crypto";
import { mask, maskEmail, type OtpProvider } from "./providers";

const CODE_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = 30_000;
const SENDS_PER_HOUR = 5;

interface Pending { mobileKey: string; mobile10: string; codeHash: Buffer; expires: number; attempts: number }

type Providers = { sms: OtpProvider; email: OtpProvider | null };

export type SendResult =
  | { ok: true; requestId: string; maskedMobile: string; maskedEmail?: string; expiresIn: number; resendIn: number; sandboxCode?: string }
  | { ok: false; reason: "invalid_mobile" | "invalid_email" | "email_unavailable" | "too_soon" | "too_many_sends" | "send_failed"; retryIn?: number; hint?: SendHint; provider?: string };

export type VerifyResult =
  | { ok: true; token: string }
  | { ok: false; reason: "wrong_code" | "expired" | "too_many_attempts" | "invalid"; attemptsLeft?: number };

export class OtpService {
  private pending = new Map<string, Pending>();
  private sends = new Map<string, number[]>();
  private secret: Buffer;

  private providers: Providers;

  constructor(providers: Providers | OtpProvider, secret = process.env.OTP_SECRET) {
    this.providers = "send" in providers ? (providers.channel === "email" ? { sms: providers, email: providers } : { sms: providers, email: null }) : providers;
    if (!secret) console.warn("[otp] OTP_SECRET not set; using a random key, so codes and tokens reset on restart");
    this.secret = secret ? Buffer.from(secret) : crypto.randomBytes(32);
    if (this.providers.sms.sandbox) console.warn("[otp] SMS sandbox: SMS codes are shown in the app and no SMS is sent");
    setInterval(() => this.sweep(), 60_000).unref();
  }

  /** The main provider: the email one when email is set up, otherwise SMS. */
  get providerName() { return (this.providers.email ?? this.providers.sms).name; }
  /** "email" when codes can go by email, so the app offers an email field. */
  get channel() { return this.providers.email ? "email" as const : "sms" as const; }

  private hmac(...parts: string[]) {
    return crypto.createHmac("sha256", this.secret).update(parts.join("\u0000")).digest();
  }

  /**
   * Send a code by email when an address is given, otherwise by SMS to the mobile.
   * Either one is enough; a mobile given alongside an email is checked and remembered.
   */
  async send(mobile10: string, email = ""): Promise<SendResult> {
    const byEmail = email !== "";
    if (byEmail) {
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: "invalid_email" };
      if (!this.providers.email) return { ok: false, reason: "email_unavailable" };
      if (mobile10 && !/^[6-9]\d{9}$/.test(mobile10)) return { ok: false, reason: "invalid_mobile" };
    } else if (!/^[6-9]\d{9}$/.test(mobile10)) return { ok: false, reason: "invalid_mobile" };
    const provider = byEmail ? this.providers.email! : this.providers.sms;
    // Limits apply to whatever the code is sent to.
    const mobileKey = (byEmail ? this.hmac("email", email.toLowerCase()) : this.hmac("mobile", mobile10)).toString("hex");
    const now = Date.now();
    const recent = (this.sends.get(mobileKey) ?? []).filter((t) => now - t < 3_600_000);
    const last = recent[recent.length - 1];
    if (last && now - last < RESEND_AFTER_MS) return { ok: false, reason: "too_soon", retryIn: Math.ceil((RESEND_AFTER_MS - (now - last)) / 1000) };
    if (recent.length >= SENDS_PER_HOUR) return { ok: false, reason: "too_many_sends", retryIn: Math.ceil((recent[0] + 3_600_000 - now) / 1000) };

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const requestId = crypto.randomUUID();
    try {
      await provider.send(mobile10, code, byEmail ? email : undefined);
      if (byEmail) console.log(`[otp:${provider.name}] code emailed to ${maskEmail(email)}`);
    } catch (e) {
      console.error(`[otp:${provider.name}] send to ${byEmail ? maskEmail(email) : mask(mobile10)} failed:`, (e as Error).message);
      return { ok: false, reason: "send_failed", hint: sendHint(provider.name, (e as Error).message), provider: provider.name };
    }
    // A new code replaces any earlier one for the same number.
    for (const [id, p] of this.pending) if (p.mobileKey === mobileKey) this.pending.delete(id);
    this.pending.set(requestId, { mobileKey, mobile10, codeHash: this.hmac("code", requestId, code), expires: now + CODE_TTL_MS, attempts: 0 });
    this.sends.set(mobileKey, [...recent, now]);
    return {
      ok: true, requestId, maskedMobile: mobile10 ? mask(mobile10) : "", ...(byEmail ? { maskedEmail: maskEmail(email) } : {}), expiresIn: CODE_TTL_MS / 1000, resendIn: RESEND_AFTER_MS / 1000,
      ...(provider.sandbox ? { sandboxCode: code } : {}),
    };
  }

  verify(requestId: string, code: string): VerifyResult {
    const p = typeof requestId === "string" ? this.pending.get(requestId) : undefined;
    if (!p || typeof code !== "string" || !/^\d{6}$/.test(code)) return { ok: false, reason: p ? "wrong_code" : "invalid" };
    if (Date.now() > p.expires) { this.pending.delete(requestId); return { ok: false, reason: "expired" }; }
    p.attempts++;
    const match = crypto.timingSafeEqual(p.codeHash, this.hmac("code", requestId, code));
    if (match) {
      this.pending.delete(requestId);
      return { ok: true, token: this.token(p.mobile10) };
    }
    if (p.attempts >= MAX_ATTEMPTS) { this.pending.delete(requestId); return { ok: false, reason: "too_many_attempts" }; }
    return { ok: false, reason: "wrong_code", attemptsLeft: MAX_ATTEMPTS - p.attempts };
  }

  /** Signed proof that this number was verified: base64url(payload).signature, valid for 1 hour. */
  /** Issue the signed token for a mobile number already proven by another verifier (Firebase). */
  tokenFor(mobile10: string): string { return this.token(mobile10); }

  private token(mobile10: string): string {
    const payload = Buffer.from(JSON.stringify({ sub: mobile10.slice(-4), mk: this.hmac("mobile", mobile10).toString("hex").slice(0, 32), exp: Date.now() + 3_600_000 })).toString("base64url");
    return payload + "." + this.hmac("token", payload).toString("base64url");
  }

  /** Check a token from verify(). Returns the last 4 digits of the verified number (empty if only an email was verified), or null. */
  readToken(token: unknown): { last4: string } | null {
    if (typeof token !== "string" || !token.includes(".")) return null;
    const [payload, sig] = token.split(".", 2);
    const want = this.hmac("token", payload);
    const got = Buffer.from(sig, "base64url");
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
    try {
      const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub: string; exp: number };
      return Date.now() < p.exp ? { last4: p.sub } : null;
    } catch { return null; }
  }

  private sweep() {
    const now = Date.now();
    for (const [id, p] of this.pending) if (now > p.expires) this.pending.delete(id);
    for (const [k, ts] of this.sends) if (!ts.some((t) => now - t < 3_600_000)) this.sends.delete(k);
  }
}

/** Why a provider refused a send, as a fixed category the app can explain. Never includes keys, addresses or provider text. */
export type SendHint = "smtp_blocked" | "recipient_not_allowed" | "ip_blocked" | "sender_not_verified" | "bad_key" | "account_not_active" | "provider_rate_limit" | "other";

export function sendHint(provider: string, message: string): SendHint {
  const m = message.toLowerCase();
  if (provider === "smtp" && /timeout|timed out|etimedout|econnrefused|econnreset|enetunreach|connection|greeting/.test(m)) return "smtp_blocked";
  if (/only send testing emails|own email address|verify a domain|recipient.*not allowed/.test(m)) return "recipient_not_allowed";
  if (/unrecogni[sz]ed ip|authori[sz]ed ip|ip address/.test(m)) return "ip_blocked";
  if (/not yet activated|not activated|suspended|account.*(blocked|disabled)/.test(m)) return "account_not_active";
  if (/sender|from address|from field|domain.*not verified|not verified|dkim|dmarc/.test(m)) return "sender_not_verified";
  if (/\b401\b|unauthori[sz]ed|api key|api-key|key not found|invalid key|invalid_api_key|authentication|535/.test(m)) return "bad_key";
  if (/\b429\b|rate limit|too many/.test(m)) return "provider_rate_limit";
  return "other";
}
