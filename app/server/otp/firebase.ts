// Firebase Phone Authentication for +91 mobile numbers.
//
// Firebase sends and checks the SMS code in the browser (the app loads the
// Firebase web SDK). When the applicant enters the right code, Firebase gives
// the browser an ID token. The app sends that token here; we check Google's
// signature, that it was issued for our Firebase project, and that its phone
// number is an Indian mobile, then issue our own signed "mobile verified"
// token like the other OTP routes do. The server never sees the SMS code.
//
// Settings (all from the Firebase console > Project settings > Your apps):
//   SMS_PROVIDER=firebase (or OTP_PROVIDER=firebase when there's no email route)
//   FIREBASE_PROJECT_ID   required
//   FIREBASE_API_KEY      required (the web app's API key; it is public by design)
//   FIREBASE_APP_ID       required
//   FIREBASE_AUTH_DOMAIN  optional, default <project id>.firebaseapp.com
//   FIREBASE_AUTH_EMULATOR_HOST  testing only: e.g. 127.0.0.1:9099

import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { OtpProvider } from "./providers";

const GOOGLE_KEYS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export interface FirebaseWebConfig { apiKey: string; authDomain: string; projectId: string; appId: string; emulator?: string }

/** The web config the app needs, or null when Firebase isn't set up. */
export function firebaseConfigFromEnv(): FirebaseWebConfig | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  return {
    apiKey: process.env.FIREBASE_API_KEY || (emulator ? "emulator-key" : ""),
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    appId: process.env.FIREBASE_APP_ID || (emulator ? "emulator-app" : ""),
    ...(emulator ? { emulator } : {}),
  };
}

/** Placeholder SMS route: with Firebase, the SMS is sent by the app, never by this server. */
export class FirebaseSmsProvider implements OtpProvider {
  readonly name = "firebase";
  readonly sandbox = false;
  readonly channel = "sms" as const;
  async send(): Promise<void> { throw new Error("firebase: the SMS is sent from the app, not the server"); }
}

export type FirebaseCheck = { ok: true; mobile10: string } | { ok: false; reason: "invalid_token" | "not_indian_mobile" | "not_configured" };

export class FirebasePhoneVerifier {
  private keys: JWTVerifyGetKey | null = null;
  constructor(private projectId = process.env.FIREBASE_PROJECT_ID, private emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST, keys?: JWTVerifyGetKey) {
    if (keys) this.keys = keys;
  }
  get enabled() { return !!this.projectId; }

  /** Check a Firebase ID token from a phone sign-in. Returns the 10-digit Indian mobile it proves. */
  async check(idToken: unknown): Promise<FirebaseCheck> {
    if (!this.projectId) return { ok: false, reason: "not_configured" };
    if (typeof idToken !== "string" || idToken.length > 4096 || idToken.split(".").length !== 3) return { ok: false, reason: "invalid_token" };
    let claims: Record<string, unknown>;
    try {
      if (this.emulator) {
        // The Auth emulator issues unsigned tokens. Accept them only when the emulator is configured.
        claims = decodeJwt(idToken);
        if (claims.aud !== this.projectId) throw new Error("audience");
      } else {
        this.keys ??= createRemoteJWKSet(new URL(GOOGLE_KEYS));
        ({ payload: claims } = await jwtVerify(idToken, this.keys, {
          issuer: `https://securetoken.google.com/${this.projectId}`,
          audience: this.projectId,
          algorithms: ["RS256"],
        }));
      }
    } catch {
      return { ok: false, reason: "invalid_token" };
    }
    if (typeof claims.sub !== "string" || !claims.sub) return { ok: false, reason: "invalid_token" };
    const authTime = Number(claims.auth_time ?? 0) * 1000;
    if (!authTime || Date.now() - authTime > 10 * 60_000) return { ok: false, reason: "invalid_token" }; // the sign-in must be fresh
    const m = /^\+91([6-9]\d{9})$/.exec(String(claims.phone_number ?? ""));
    if (!m) return { ok: false, reason: "not_indian_mobile" };
    return { ok: true, mobile10: m[1] };
  }
}
