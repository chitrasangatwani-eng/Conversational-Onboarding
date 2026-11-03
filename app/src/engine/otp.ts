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
        case "send_failed": return { ok: false, message: email ? "We couldn't send the email just now. Check the address, or try again in a minute." : "We couldn't send the SMS just now. Try again in a minute." };
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
