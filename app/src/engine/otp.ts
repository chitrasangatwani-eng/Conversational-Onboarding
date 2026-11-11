import { ApiError, backend, post, useEmailChannel } from "./api";

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
        case "email_unavailable": return { ok: false, message: "Email OTP isn't available right now. Use your mobile number instead." };
        case "invalid_email":
          // The server sends OTPs by email even if the app didn't know yet: show the email box.
          if (!email) { useEmailChannel(); return { ok: false, message: "Enter your email address below to get your OTP by email." }; }
          return { ok: false, message: "Enter a valid email address to receive your OTP." };
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
  const base = email ? "We couldn't send the email." : provider === "whatsapp" ? "We couldn't send the WhatsApp message." : "We couldn't send the SMS.";
  const setup: Record<string, string> = {
    smtp_blocked: "Setup: this server can't reach the mail server. Render's free plan blocks SMTP, so use OTP_PROVIDER=resend or brevo.",
    recipient_not_allowed: provider === "whatsapp" ? "Setup: the WhatsApp test number only sends to numbers you added as recipients in Meta's API Setup. Add this number there, or use your own business number." : `Setup: ${provider} is in test mode and only sends to the email address you signed up with. Use that address, or verify a domain with ${provider}.`,
    ip_blocked: `Setup: ${provider} blocked this server's IP address. Turn off IP blocking under Security → Authorised IPs in ${provider}.`,
    sender_not_verified: `Setup: ${provider} rejected the sender address. Remove OTP_EMAIL_FROM to use the provider's test sender, or verify your own domain.`,
    bad_key: provider === "whatsapp" ? "Setup: Meta rejected the WhatsApp access token. Temporary tokens expire after 24 hours: create a new one (or a permanent System User token) and update WHATSAPP_TOKEN." : `Setup: ${provider} rejected the API key or password. Paste it again in Render with no extra spaces.`,
    account_not_active: `Setup: your ${provider} account isn't activated for sending yet. Finish activation in ${provider}.`,
    provider_rate_limit: `${provider} is limiting sends right now. Wait a minute and try again.`,
    not_on_whatsapp: "This number doesn't seem to be on WhatsApp. Check the number, or use your email instead.",
    template_missing: "Setup: the WhatsApp message template isn't found or approved yet. Check WHATSAPP_TEMPLATE and its language in Meta's WhatsApp Manager.",
  };
  return setup[hint] ? `${base} ${setup[hint]}` : email ? `${base} Check the address, or try again in a minute.` : `${base} Try again in a minute.`;
}
