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

export async function detectBackend(): Promise<void> {
  const forced = import.meta.env.VITE_BACKEND ?? (import.meta.env.VITE_OTP_MODE === "server" ? "server" : undefined);
  if (forced === "local") { mode = "local"; return; }
  try {
    const r = await fetch(API_BASE + "/api/health", { signal: AbortSignal.timeout(8000) });
    const h = (await r.json()) as { otp?: string; otpChannel?: string; handoff?: string };
    mode = forced === "server" || (r.ok && h.otp && h.handoff) ? "server" : "local";
    channel = h.otpChannel === "email" ? "email" : "sms";
  } catch {
    // A forced server build keeps server mode even if the health check is slow.
    mode = forced === "server" ? "server" : "local";
  }
}
