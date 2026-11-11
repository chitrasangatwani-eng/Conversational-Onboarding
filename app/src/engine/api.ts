/** Where the backend lives. Empty means the same site; set VITE_API_BASE for a static host such as GitHub Pages. */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) {
    super("api " + status);
  }
}

/** POST JSON to the backend. Throws ApiError with the parsed body on a non-2xx answer. */
export async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(API_BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new ApiError(r.status, data);
  return data as T;
}

/**
 * "server": integrations go through this app's backend (/api/otp, /api/handoff).
 * "local": the static demo (GitHub Pages) simulates them in the browser.
 *
 * Detected when the app starts: if the backend answers /api/health with its
 * integrations, use it. VITE_BACKEND=server or =local forces a mode at build
 * time (VITE_OTP_MODE=server is still accepted).
 */
let mode: "server" | "local" = "local";
export const backend = () => mode;
let channel: "sms" | "email" = "sms";
/** How the backend delivers mobile OTPs. "email" means the app also asks for an email address. */
export const otpChannel = () => (mode === "server" ? channel : "sms");
let ai = false;
export interface FirebaseWebConfig { apiKey: string; authDomain: string; projectId: string; appId: string; emulator?: string }
let fb: FirebaseWebConfig | null = null;
let smsVia = "server";
/** "whatsapp" when mobile codes go on WhatsApp, so the screen says so. */
export const mobileVia = () => (mode === "server" ? smsVia : "server");
/** Firebase web config when SMS OTPs go through Firebase Phone Auth, else null. */
export const firebaseWeb = () => (mode === "server" ? fb : null);
/** True when the server answers free-text questions with the AI (Groq). */
export const aiAnswers = () => mode === "server" && ai;
let onChange: () => void = () => {};
/** Called when a late health answer or the server itself changes the mode or channel, so the UI can re-render. */
export const onBackendChange = (fn: () => void) => { onChange = fn; };
/** The server asked for an email address, so it delivers OTPs by email. */
export const useEmailChannel = () => { if (channel !== "email") { channel = "email"; onChange(); } };

async function readHealth(timeoutMs: number) {
  const r = await fetch(API_BASE + "/api/health", { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const h = (await r.json()) as { otp?: string; otpChannel?: string; handoff?: string; answers?: string; sms?: string; firebase?: FirebaseWebConfig | null };
  ai = h.answers === "groq";
  fb = h.sms === "firebase" && h.firebase?.projectId ? h.firebase : null;
  smsVia = h.sms || "server";
  return { ok: r.ok && !!h.otp && !!h.handoff, email: h.otpChannel === "email" };
}

export async function detectBackend(): Promise<void> {
  const forced = import.meta.env.VITE_BACKEND ?? (import.meta.env.VITE_OTP_MODE === "server" ? "server" : undefined);
  if (forced === "local") { mode = "local"; return; }
  try {
    const h = await readHealth(8000);
    mode = forced === "server" || h.ok ? "server" : "local";
    channel = h.email ? "email" : "sms";
  } catch {
    // A forced server build keeps server mode even if the health check is slow,
    // and keeps asking in the background so the OTP channel is right once it answers.
    mode = forced === "server" ? "server" : "local";
    if (forced === "server") void retryHealth();
  }
}

async function retryHealth() {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const h = await readHealth(10000);
      if (h.email !== (channel === "email")) { channel = h.email ? "email" : "sms"; onChange(); }
      return;
    } catch { /* still waking up */ }
  }
}
