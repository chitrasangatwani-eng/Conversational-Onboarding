import { WhatsAppProvider } from "./whatsapp";
import { FirebaseSmsProvider } from "./firebase";
import nodemailer, { type Transporter } from "nodemailer";

// SMS (or email) delivery for one-time codes. The OTP service creates and checks codes;
// a provider only delivers them. Pick one with OTP_PROVIDER:
//
//   sandbox (default)  no SMS is sent; the code is returned to the app so the
//                      demo works without an account. Never use with real users.
//   msg91              MSG91 Flow API. Needs a DLT-approved template whose OTP
//                      variable is named "otp". Env: MSG91_AUTH_KEY, MSG91_TEMPLATE_ID.
//   twilio             Twilio Messages API. Env: TWILIO_ACCOUNT_SID,
//                      TWILIO_AUTH_TOKEN, TWILIO_FROM. Indian numbers still need
//                      DLT registration for the sender and template.
//
// Email delivery, for demos and projects without DLT registration. The app
// then also asks for an email address on the mobile step:
//   smtp               any SMTP mailbox, e.g. Gmail with an app password.
//                      Env: SMTP_USER, SMTP_PASS, optional SMTP_HOST
//                      (default smtp.gmail.com), SMTP_PORT (default 465),
//                      OTP_EMAIL_FROM (default SMTP_USER).
//   resend             Resend's email API. Env: RESEND_API_KEY, optional
//                      OTP_EMAIL_FROM (default onboarding@resend.dev, which can
//                      only send to your own Resend account address).
//   brevo              Brevo's transactional email API over HTTPS. Works on
//                      hosts that block SMTP ports, such as Render's free plan.
//                      Env: BREVO_API_KEY, OTP_EMAIL_FROM (a sender address
//                      verified in Brevo; defaults to SMTP_USER).
//
// The msg91 and twilio connectors follow each provider's documented REST API
// but have not been run against a live account yet: test them with your own
// sandbox or trial keys before going live.

export interface OtpProvider {
  readonly name: string;
  /** True when codes are not really delivered and may be shown in the app. */
  readonly sandbox: boolean;
  /** Where the code goes. "email" providers need an address from the applicant. */
  readonly channel: "sms" | "email";
  /** Deliver `code` for an Indian mobile number given as 10 digits (by email when channel is "email"). Throws on failure. */
  send(mobile10: string, code: string, email?: string): Promise<void>;
}

export const mask = (mobile10: string) => "••••••" + mobile10.slice(-4);
export const maskEmail = (e: string) => e.replace(/^(.)[^@]*(@.*)$/, "$1••••$2");

const subject = "Your verification code";
const text = (code: string) => `${code} is your OTP to verify your mobile number for opening your account. It expires in 5 minutes. Never share it with anyone.\n\nIf you didn't ask for this, ignore this email.`;
const html = (code: string) => `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#1d2420;max-width:420px">
<p>Your OTP to verify your mobile number for opening your account:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:.2em;margin:12px 0">${code}</p>
<p>It expires in 5 minutes. Never share it with anyone, including our staff.</p>
<p style="color:#6b7370;font-size:13px">If you didn't ask for this, ignore this email.</p></div>`;

class SandboxProvider implements OtpProvider {
  readonly name = "sandbox";
  readonly sandbox = true;
  readonly channel = "sms" as const;
  async send(mobile10: string): Promise<void> {
    console.log(`[otp:sandbox] code issued for ${mask(mobile10)} (no SMS sent)`);
  }
}

class Msg91Provider implements OtpProvider {
  readonly name = "msg91";
  readonly sandbox = false;
  readonly channel = "sms" as const;
  constructor(private authKey: string, private templateId: string) {}
  async send(mobile10: string, code: string): Promise<void> {
    const res = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: this.authKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ template_id: this.templateId, short_url: "0", recipients: [{ mobiles: "91" + mobile10, otp: code }] }),
    });
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || body.type === "error") throw new Error(`msg91 ${res.status}: ${body.message ?? "send failed"}`);
  }
}

class TwilioProvider implements OtpProvider {
  readonly name = "twilio";
  readonly sandbox = false;
  readonly channel = "sms" as const;
  constructor(private sid: string, private token: string, private from: string) {}
  async send(mobile10: string, code: string): Promise<void> {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.sid)}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: "Basic " + Buffer.from(`${this.sid}:${this.token}`).toString("base64"),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: "+91" + mobile10,
        From: this.from,
        Body: `${code} is your OTP to open your account. It expires in 5 minutes. Never share it with anyone.`,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(`twilio ${res.status}: ${body.message ?? "send failed"}`);
    }
  }
}

class SmtpProvider implements OtpProvider {
  readonly name = "smtp";
  readonly sandbox = false;
  readonly channel = "email" as const;
  private transport: Transporter;
  constructor(private from: string, opts: { host: string; port: number; user: string; pass: string }) {
    this.transport = nodemailer.createTransport({
      host: opts.host, port: opts.port, secure: opts.port === 465,
      auth: { user: opts.user, pass: opts.pass },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    });
  }
  async send(_mobile10: string, code: string, email?: string): Promise<void> {
    if (!email) throw new Error("smtp: no email address");
    await this.transport.sendMail({ from: this.from, to: email, subject, text: text(code), html: html(code) });
  }
}

class ResendProvider implements OtpProvider {
  readonly name = "resend";
  readonly sandbox = false;
  readonly channel = "email" as const;
  constructor(private key: string, private from: string) {}
  async send(_mobile10: string, code: string, email?: string): Promise<void> {
    if (!email) throw new Error("resend: no email address");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + this.key, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [email], subject, text: text(code), html: html(code) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(`resend ${res.status}: ${body.message ?? "send failed"}`);
    }
  }
}

class BrevoProvider implements OtpProvider {
  readonly name = "brevo";
  readonly sandbox = false;
  readonly channel = "email" as const;
  constructor(private key: string, private from: string) {}
  async send(_mobile10: string, code: string, email?: string): Promise<void> {
    if (!email) throw new Error("brevo: no email address");
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": this.key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "Onboarding", email: this.from },
        to: [{ email }],
        subject, textContent: text(code), htmlContent: html(code),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(`brevo ${res.status}: ${body.message ?? "send failed"}`);
    }
  }
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`OTP_PROVIDER needs ${name} to be set`);
  return v;
}

/**
 * The delivery routes the app offers. OTP_PROVIDER picks one provider; if it is
 * an email provider, SMS stays available through SMS_PROVIDER (default sandbox),
 * so applicants can use either their mobile number or their email.
 */
export function providersFromEnv(): { sms: OtpProvider; email: OtpProvider | null } {
  const main = providerFromEnv();
  if (main.channel === "sms") return { sms: main, email: null };
  return { sms: providerFromEnv(process.env.SMS_PROVIDER || "sandbox"), email: main };
}

/** Build the provider named by OTP_PROVIDER (or `name`). Fails at startup if its settings are missing. */
export function providerFromEnv(nameArg?: string): OtpProvider {
  const name = (nameArg ?? process.env.OTP_PROVIDER ?? "sandbox").toLowerCase();
  switch (name) {
    case "sandbox": return new SandboxProvider();
    case "firebase": return new FirebaseSmsProvider();
    case "msg91": return new Msg91Provider(need("MSG91_AUTH_KEY"), need("MSG91_TEMPLATE_ID"));
    case "whatsapp": return new WhatsAppProvider(need("WHATSAPP_TOKEN").trim(), need("WHATSAPP_PHONE_NUMBER_ID").trim());
    case "twilio": return new TwilioProvider(need("TWILIO_ACCOUNT_SID"), need("TWILIO_AUTH_TOKEN"), need("TWILIO_FROM"));
    case "smtp": {
      const user = need("SMTP_USER");
      return new SmtpProvider(process.env.OTP_EMAIL_FROM || user, {
        host: process.env.SMTP_HOST || "smtp.gmail.com", port: Number(process.env.SMTP_PORT || 465),
        user, pass: need("SMTP_PASS").replace(/\s+/g, ""), // Gmail shows app passwords in groups of 4
      });
    }
    case "resend": return new ResendProvider(need("RESEND_API_KEY"), process.env.OTP_EMAIL_FROM || "Onboarding <onboarding@resend.dev>");
    case "brevo": {
      const from = process.env.OTP_EMAIL_FROM || process.env.SMTP_USER;
      if (!from) throw new Error("OTP_PROVIDER=brevo needs OTP_EMAIL_FROM (a sender address verified in Brevo)");
      return new BrevoProvider(need("BREVO_API_KEY").trim(), from.replace(/^.*<([^>]+)>.*$/, "$1").trim());
    }
    default: throw new Error(`Unknown OTP_PROVIDER "${name}". Use sandbox, firebase, whatsapp, msg91, twilio, smtp, resend or brevo.`);
  }
}
