// WhatsApp OTP through Meta's WhatsApp Business Cloud API.
//
// WhatsApp messages are outside India's SMS DLT rules, so no DLT registration
// is needed. The code is sent with an approved "Authentication" message
// template (Meta approves it, not TRAI), which shows the code with a
// "Copy code" button. The server still makes and checks every code.
//
// Settings (from Meta: business.facebook.com and developers.facebook.com):
//   SMS_PROVIDER=whatsapp           send mobile OTPs on WhatsApp
//   WHATSAPP_TOKEN                  access token (secret; a System User token for anything long-lived)
//   WHATSAPP_PHONE_NUMBER_ID        the sending number's Phone number ID (not the number itself)
//   WHATSAPP_TEMPLATE               your approved Authentication template's name (default "otp_code"),
//                                   or "none" to send the code as a plain text message instead (see below)
//   WHATSAPP_TEMPLATE_LANG          its language code (default "en_US")
//   WHATSAPP_DISPLAY_NUMBER         the business number shown to applicants in text mode, e.g. "+1 555 181 1262"
//   WHATSAPP_API_VERSION            Graph API version (default "v23.0"; Meta retires old versions)
//   WHATSAPP_API_BASE               tests only (default https://graph.facebook.com)
//
// Without a template (WHATSAPP_TEMPLATE=none): WhatsApp lets a business send
// plain text only within 24 hours of the person messaging the business. So the
// applicant first sends any message (e.g. "hi") to the business number, then
// gets the code as text. Useful for demos before business verification, when
// Meta doesn't allow creating templates. Outside that window Meta refuses with
// code 131047 and the app tells the applicant to message the number first.
//
// Note: Meta accepts the request before delivery; a message to a number that
// isn't on WhatsApp can still fail afterwards (reported to webhooks, which this
// demo doesn't receive). The applicant can then resend or use email.

import { clean, type OtpProvider } from "./providers";

export class WhatsAppProvider implements OtpProvider {
  readonly name = "whatsapp";
  readonly sandbox = false;
  readonly channel = "sms" as const; // keyed by mobile number, like SMS
  constructor(
    private token: string, private phoneNumberId: string,
    private template = clean(process.env.WHATSAPP_TEMPLATE) || "otp_code",
    private lang = clean(process.env.WHATSAPP_TEMPLATE_LANG) || "en_US",
    private base = (process.env.WHATSAPP_API_BASE || "https://graph.facebook.com").replace(/\/+$/, "") + "/" + (clean(process.env.WHATSAPP_API_VERSION) || "v23.0"),
  ) {}

  async send(mobile10: string, code: string): Promise<void> {
    const plain = /^(none|text|off)$/i.test(this.template);
    const payload = plain
      ? {
        messaging_product: "whatsapp", recipient_type: "individual", to: "91" + mobile10, type: "text",
        text: { preview_url: false, body: `${code} is your verification code to open your Artha Inclusive account. It expires in 5 minutes. Never share it with anyone.` },
      }
      : null;
    const res = await fetch(`${this.base}/${encodeURIComponent(this.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { authorization: "Bearer " + this.token, "content-type": "application/json" },
      body: payload ? JSON.stringify(payload) : JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: "91" + mobile10,
        type: "template",
        template: {
          name: this.template,
          language: { code: this.lang },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            // Authentication templates' "Copy code" button takes the code too.
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return;
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } } };
    const e = body.error ?? {};
    // The numeric code goes first so the app can explain it (see sendHint).
    throw new Error(`whatsapp ${res.status} code ${e.code ?? "?"}${e.error_subcode ? "/" + e.error_subcode : ""}: ${e.message ?? "send failed"}${e.error_data?.details ? " (" + e.error_data.details + ")" : ""}`);
  }
}

/** In text mode, the number applicants must message first (for the app to show), else null. */
export function whatsappHelloNumber(): string | null {
  const plain = /^(none|text|off)$/i.test(clean(process.env.WHATSAPP_TEMPLATE));
  const n = clean(process.env.WHATSAPP_DISPLAY_NUMBER).replace(/[^\d+ ]/g, "").trim();
  return plain && n ? n : null;
}

/**
 * Safe setup check for /api/whatsapp/check: asks Meta about the configured
 * phone number with the configured token and reports what went wrong, without
 * ever returning the token (only its length and first 3 characters).
 */
export async function whatsappCheck(): Promise<Record<string, unknown>> {
  const raw = process.env.WHATSAPP_TOKEN ?? "";
  const token = clean(raw);
  const id = clean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const version = clean(process.env.WHATSAPP_API_VERSION) || "v23.0";
  const base = (process.env.WHATSAPP_API_BASE || "https://graph.facebook.com").replace(/\/+$/, "");
  const token_info = {
    set: !!token, length: token.length, starts_with: token.slice(0, 3),
    looks_like_meta_token: /^EA[A-Za-z0-9]{20,}$/.test(token),
    had_quotes_or_spaces: raw !== token,
    has_inner_spaces_or_line_breaks: /\s/.test(token),
  };
  if (!token || !id) return { ok: false, problem: !token ? "WHATSAPP_TOKEN is not set" : "WHATSAPP_PHONE_NUMBER_ID is not set", token: token_info };
  try {
    const r = await fetch(`${base}/${version}/${encodeURIComponent(id)}?fields=display_phone_number,verified_name,quality_rating`, {
      headers: { authorization: "Bearer " + token }, signal: AbortSignal.timeout(10_000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, any>;
    if (r.ok) return { ok: true, token: token_info, phone_number: j.display_phone_number, name: j.verified_name, quality: j.quality_rating, template: clean(process.env.WHATSAPP_TEMPLATE) || "otp_code" };
    const e = j.error ?? {};
    return { ok: false, http: r.status, meta_code: e.code, meta_subcode: e.error_subcode, meta_message: e.message, token: token_info, phone_number_id: id, api_version: version };
  } catch (err) {
    return { ok: false, problem: "couldn't reach Meta: " + (err as Error).message, token: token_info };
  }
}
