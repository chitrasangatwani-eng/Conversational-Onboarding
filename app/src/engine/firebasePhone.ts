// SMS OTP for +91 numbers through Firebase Phone Authentication.
//
// Firebase sends the SMS and checks the code in the browser. After a correct
// code we send Firebase's ID token to our server, which checks it and returns
// our own "mobile verified" token, then we sign out of Firebase: the app keeps
// no Firebase session. The Firebase SDK is loaded only when this is used.

import type { Auth, ConfirmationResult, RecaptchaVerifier } from "firebase/auth";
import { ApiError, firebaseWeb, post } from "./api";
import { get } from "./store";

let authP: Promise<Auth> | null = null;
let verifier: RecaptchaVerifier | null = null;
let confirmation: ConfirmationResult | null = null;

async function auth(): Promise<Auth> {
  const cfg = firebaseWeb();
  if (!cfg) throw new Error("firebase not configured");
  authP ??= (async () => {
    const [{ initializeApp }, { getAuth, connectAuthEmulator }] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
    const app = initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId }, "onboarding");
    const a = getAuth(app);
    if (cfg.emulator) connectAuthEmulator(a, "http://" + cfg.emulator, { disableWarnings: true });
    return a;
  })();
  const a = await authP;
  a.languageCode = get().lang === "hi" ? "hi" : "en"; // language of the SMS text
  return a;
}

const MESSAGES: Record<string, string> = {
  "auth/invalid-phone-number": "Enter a valid 10-digit Indian mobile number.",
  "auth/too-many-requests": "Too many tries from this device. Wait a few minutes, or use your email instead.",
  "auth/quota-exceeded": "We can't send more SMS codes today. Use your email instead, or try tomorrow.",
  "auth/billing-not-enabled": "SMS isn't switched on for this app yet (Firebase billing is off). Use your email instead.",
  "auth/operation-not-allowed": "SMS sign-in isn't switched on for this app yet. Use your email instead.",
  "auth/unauthorized-domain": "This website isn't allowed to send SMS codes yet. Use your email instead.",
  "auth/captcha-check-failed": "The security check didn't pass. Reload the page and try again.",
  "auth/network-request-failed": "We couldn't reach the SMS service. Check your connection and try again.",
  "auth/invalid-verification-code": "That code didn't match. Check the SMS and try again.",
  "auth/code-expired": "This code has expired. Tap Resend OTP to get a new one.",
  "auth/missing-verification-code": "Enter all 6 digits.",
};
const message = (e: unknown, fallback: string) => MESSAGES[(e as { code?: string })?.code ?? ""] ?? fallback;

/** Send the SMS code to +91 <mobile10>. */
export async function sendFirebaseSms(mobile10: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const a = await auth();
    const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");
    // Invisible reCAPTCHA: Firebase's check that a person, not a script, is asking for SMS.
    verifier ??= new RecaptchaVerifier(a, "fb-recaptcha", { size: "invisible" });
    confirmation = await signInWithPhoneNumber(a, "+91" + mobile10, verifier);
    return { ok: true };
  } catch (e) {
    try { verifier?.clear(); } catch { /* ignore */ }
    verifier = null;
    console.warn("[firebase] send failed:", (e as { code?: string })?.code ?? e);
    return { ok: false, message: message(e, "We couldn't send the SMS just now. Try again, or use your email instead.") };
  }
}

/** Check the code with Firebase, then exchange Firebase's token for ours. */
export async function confirmFirebaseCode(code: string): Promise<{ ok: true; token: string } | { ok: false; message: string; expired?: boolean }> {
  if (!confirmation) return { ok: false, expired: true, message: "Tap Resend OTP to get a new code." };
  try {
    const cred = await confirmation.confirm(code);
    const idToken = await cred.user.getIdToken();
    const r = await post<{ verified: boolean; token: string }>("/api/otp/firebase", { idToken });
    confirmation = null;
    const { signOut } = await import("firebase/auth");
    void signOut(await auth()); // we keep our own token, not a Firebase session
    return { ok: true, token: r.token };
  } catch (e) {
    if (e instanceof ApiError) {
      return { ok: false, message: e.body.reason === "not_indian_mobile" ? "Only Indian (+91) mobile numbers can be verified here." : "We couldn't confirm your number. Tap Resend OTP and try again.", expired: true };
    }
    const c = (e as { code?: string })?.code;
    return { ok: false, expired: c === "auth/code-expired", message: message(e, "We couldn't check the code just now. Try again.") };
  }
}
