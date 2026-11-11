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
  // Setup problems, most common when phone sign-in is first switched on:
  "auth/invalid-app-credential": "Firebase's security check (reCAPTCHA) was rejected. Check that this website is in Firebase's Authorized domains and that the API key allows it.",
  "auth/invalid-api-key": "The Firebase API key is wrong. Check FIREBASE_API_KEY in the server settings.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "The Firebase API key is wrong. Check FIREBASE_API_KEY in the server settings.",
  "auth/requests-from-referer-<empty>-are-blocked.": "The Firebase API key doesn't allow this website. Check its website restrictions in Google Cloud.",
  "auth/admin-restricted-operation": "Phone sign-in is restricted for this Firebase project. Check Authentication settings.",
  "auth/missing-client-identifier": "Firebase's security check didn't load. Reload the page and try again.",
  "auth/error-code:-39": "Firebase blocked SMS for this project, usually because billing (Blaze plan) is off or India isn't allowed in the SMS region policy.",
  "auth/internal-error": "Firebase had a problem sending the SMS. If this keeps happening, check that Phone sign-in is enabled and billing is on.",
};
/** A plain message, plus Firebase's error code for anything not listed, so setup problems can be diagnosed. */
const message = (e: unknown, fallback: string) => {
  const code = (e as { code?: string })?.code ?? "";
  const known = MESSAGES[code] ?? Object.entries(MESSAGES).find(([k]) => code.startsWith(k))?.[1];
  if (known) return known + (code.startsWith("auth/") && !code.startsWith("auth/invalid-verification") && !code.startsWith("auth/code-expired") ? ` (${code})` : "");
  return fallback + (code ? ` (Firebase: ${code})` : "");
};

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
