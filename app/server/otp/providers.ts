// SMS delivery for one-time codes. The OTP service creates and checks codes;
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
// The msg91 and twilio connectors follow each provider's documented REST API
// but have not been run against a live account yet: test them with your own
// sandbox or trial keys before going live.

export interface OtpProvider {
  readonly name: string;
  /** True when codes are not really delivered and may be shown in the app. */
  readonly sandbox: boolean;
  /** Deliver `code` to an Indian mobile number given as 10 digits. Throws on failure. */
  send(mobile10: string, code: string): Promise<void>;
}

export const mask = (mobile10: string) => "••••••" + mobile10.slice(-4);

class SandboxProvider implements OtpProvider {
  readonly name = "sandbox";
  readonly sandbox = true;
  async send(mobile10: string): Promise<void> {
    console.log(`[otp:sandbox] code issued for ${mask(mobile10)} (no SMS sent)`);
  }
}

class Msg91Provider implements OtpProvider {
  readonly name = "msg91";
  readonly sandbox = false;
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

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`OTP_PROVIDER needs ${name} to be set`);
  return v;
}

/** Build the provider named by OTP_PROVIDER. Fails at startup if its settings are missing. */
export function providerFromEnv(): OtpProvider {
  const name = (process.env.OTP_PROVIDER || "sandbox").toLowerCase();
  switch (name) {
    case "sandbox": return new SandboxProvider();
    case "msg91": return new Msg91Provider(need("MSG91_AUTH_KEY"), need("MSG91_TEMPLATE_ID"));
    case "twilio": return new TwilioProvider(need("TWILIO_ACCOUNT_SID"), need("TWILIO_AUTH_TOKEN"), need("TWILIO_FROM"));
    default: throw new Error(`Unknown OTP_PROVIDER "${name}". Use sandbox, msg91 or twilio.`);
  }
}
