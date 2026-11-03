import { ApiError, backend, post } from "./api";

// In "local" mode (static demo site) nothing leaves the browser: any valid
// 12-digit number works, the OTP is 123456, and 9876 5009 0000 gives a name mismatch.
const LOCAL_MISMATCH = "987650090000";

// Aadhaar OTP through the backend (see server/aadhaar). The number goes only to
// the server; the app keeps the last 4 digits.

export type AadhaarSend =
  | { ok: true; ref: string; last4: string; sandboxCode?: string }
  | { ok: false; message: string };

export type AadhaarResult =
  | { ok: true; last4: string; nameMatch: boolean; pincode: string | null; state: string | null }
  | { ok: false; message: string; restart?: boolean };

export async function requestAadhaarOtp(aadhaar: string, consent: boolean): Promise<AadhaarSend> {
  if (backend() === "local") {
    if (!/^[2-9]\d{11}$/.test(aadhaar)) return { ok: false, message: "That isn't a valid Aadhaar number. Check the 12 digits on your Aadhaar card." };
    if (!consent) return { ok: false, message: "Tick the consent box to continue." };
    return { ok: true, ref: "local:" + (aadhaar === LOCAL_MISMATCH ? "x" : "") + aadhaar.slice(-4), last4: aadhaar.slice(-4), sandboxCode: "123456" };
  }
  try {
    const r = await post<{ ref: string; last4: string; sandboxCode?: string }>("/api/aadhaar/otp", { aadhaar, consent });
    return { ok: true, ...r };
  } catch (e) {
    const err = e instanceof ApiError ? e.body.error : "";
    if (err === "invalid_number") return { ok: false, message: "That isn't a valid Aadhaar number. Check the 12 digits on your Aadhaar card." };
    if (err === "no_consent") return { ok: false, message: "Tick the consent box to continue." };
    if (err === "too_soon") return { ok: false, message: `Please wait ${Number((e as ApiError).body.retryIn) || 30} seconds before asking for another OTP.` };
    return { ok: false, message: "We couldn't reach the Aadhaar service just now. Try again, or use DigiLocker instead." };
  }
}

export async function checkAadhaarOtp(ref: string, otp: string, expectedName: string): Promise<AadhaarResult> {
  if (ref.startsWith("local:")) {
    if (otp !== "123456") return { ok: false, message: "That OTP didn't match. In this demo the OTP is 123456." };
    return { ok: true, last4: ref.slice(-4), nameMatch: !ref.startsWith("local:x") && !!expectedName, pincode: "560001", state: "Karnataka" };
  }
  try {
    const r = await post<{ verified: boolean; last4?: string; nameMatch?: boolean; pincode?: string | null; state?: string | null; reason?: string; attemptsLeft?: number }>(
      "/api/aadhaar/verify", { ref, otp, expectedName });
    if (r.verified) return { ok: true, last4: r.last4 ?? "", nameMatch: !!r.nameMatch, pincode: r.pincode ?? null, state: r.state ?? null };
    if (r.reason === "wrong_otp") return { ok: false, message: `That OTP didn't match. ${r.attemptsLeft ?? 0} ${r.attemptsLeft === 1 ? "try" : "tries"} left.` };
    if (r.reason === "too_many_attempts") return { ok: false, restart: true, message: "Too many wrong tries. Ask for a new OTP." };
    return { ok: false, restart: true, message: "This OTP has expired. Ask for a new OTP." };
  } catch {
    return { ok: false, message: "We couldn't reach the Aadhaar service just now. Try again in a minute." };
  }
}
