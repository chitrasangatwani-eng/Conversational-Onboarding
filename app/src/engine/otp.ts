import { ApiError, backend, post } from "./api";

// Mobile OTP for the secure form. In "server" mode the backend creates, sends
// and checks the code (see server/otp). In "local" mode, used for the static
// demo site, nothing leaves the browser: any 6 digits work except 000000.


export type OtpSend =
  | { ok: true; requestId: string; resendIn: number; sandboxCode?: string; maskedEmail?: string }
  | { ok: false; message: string };

export type OtpVerify =
  | { ok: true; token: string }
  | { ok: false; message: string; expired?: boolean };

export async function requestOtp(mobile: string, email = ""): Promise<OtpSend> {
  if (backend() === "local") return { ok: true, requestId: "local", resendIn: 0, sandboxCode: "123456" };
  try {
    const r = await post<{ requestId: string; resendIn: number; sandboxCode?: string; maskedEmail?: string }>("/api/otp/send", { mobile, ...(email ? { email } : {}) });
    return { ok: true, requestId: r.requestId, resendIn: r.resendIn, sandboxCode: r.sandboxCode, maskedEmail: r.maskedEmail };
  } catch (e) {
    if (e instanceof ApiError) {
      const wait = Number(e.body.retryIn) || 0;
      switch (e.body.error) {
        case "invalid_mobile": return { ok: false, message: "Enter a valid 10-digit Indian mobile number." };
        case "invalid_email": return { ok: false, message: "Enter a valid email address to receive your OTP." };
        case "too_soon": return { ok: false, message: `Please wait ${wait} seconds before asking for another OTP.` };
        case "too_many_sends": return { ok: false, message: `Too many OTP requests for this number. Try again in ${Math.ceil(wait / 60)} minutes, or talk to a person.` };
        case "send_failed": return { ok: false, message: sendFailedMessage(email, String(e.body.hint ?? ""), String(e.body.provider ?? "")) };
      }
      if (e.status === 429) return { ok: false, message: "Too many requests. Please wait a minute and try again." };
    }
    return { ok: false, message: "We couldn't reach the server. Check your connection and try again." };
  }
}

export async function checkOtp(requestId: string, code: string): Promise<OtpVerify> {
  if (backend() === "local") {
    return code === "000000" ? { ok: false, message: "That OTP didn't match. Check the SMS and try again." } : { ok: true, token: "local" };
  }
  try {
    const r = await post<{ verified: boolean; token?: string; reason?: string; attemptsLeft?: number }>("/api/otp/verify", { requestId, code });
    if (r.verified && r.token) return { ok: true, token: r.token };
    switch (r.reason) {
      case "wrong_code": return { ok: false, message: `That OTP didn't match. ${r.attemptsLeft ?? 0} ${r.attemptsLeft === 1 ? "try" : "tries"} left.` };
      case "too_many_attempts": return { ok: false, expired: true, message: "Too many wrong tries. Tap Resend OTP to get a new code." };
      default: return { ok: false, expired: true, message: "This OTP has expired. Tap Resend OTP to get a new code." };
    }
  } catch {
    return { ok: false, message: "We couldn't reach the server. Check your connection and try again." };
  }
}

/** Explain a failed send. The setup hints help whoever runs the demo fix the server settings. */
function sendFailedMessage(email: string, hint: string, provider: string): string {
  const base = email ? "We couldn't send the email." : "We couldn't send the SMS.";
  const setup: Record<string, string> = {
    smtp_blocked: "Setup: this server can't reach the mail server. Render's free plan blocks SMTP, so use OTP_PROVIDER=resend or brevo.",
    recipient_not_allowed: `Setup: ${provider} is in test mode and only sends to the email address you signed up with. Use that address, or verify a domain with ${provider}.`,
    ip_blocked: `Setup: ${provider} blocked this server's IP address. Turn off IP blocking under Security → Authorised IPs in ${provider}.`,
    sender_not_verified: `Setup: ${provider} rejected the sender address. Remove OTP_EMAIL_FROM to use the provider's test sender, or verify your own domain.`,
    bad_key: `Setup: ${provider} rejected the API key or password. Paste it again in Render with no extra spaces.`,
    account_not_active: `Setup: your ${provider} account isn't activated for sending yet. Finish activation in ${provider}.`,
    provider_rate_limit: `${provider} is limiting sends right now. Wait a minute and try again.`,
  };
  return setup[hint] ? `${base} ${setup[hint]}` : email ? `${base} Check the address, or try again in a minute.` : `${base} Try again in a minute.`;
}
