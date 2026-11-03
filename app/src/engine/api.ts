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
 * VITE_OTP_MODE=server is still accepted for older builds.
 */
export const BACKEND: "server" | "local" =
  import.meta.env.VITE_BACKEND === "server" || import.meta.env.VITE_OTP_MODE === "server" ? "server" : "local";
