import { API_BASE, post } from "./api";

// Opens DigiLocker in a separate window, waits until the applicant approves or
// denies sharing, and returns the server's summary. The window posts a
// message back when it's done; polling covers phones where the link between
// the two windows is lost.

export interface LockerSummary {
  purpose: "pan" | "address";
  panIssued: boolean;
  panLast4: string | null;
  /** Last 4 digits of the Aadhaar, when the provider returns them (Setu). */
  aadhaarLast4?: string | null;
  nameMatch: boolean;
  pincode: string | null;
  state: string | null;
}

export type LockerResult =
  | { ok: true; summary: LockerSummary }
  | { ok: false; reason: "blocked" | "denied" | "error" | "timeout" };

const WAIT_MS = 5 * 60_000;

/** Must be called straight from a click, so the browser allows the new window. */
export async function fetchFromDigiLocker(purpose: "pan" | "address", expectedName: string): Promise<LockerResult> {
  const win = window.open("", "digilocker", "width=480,height=720");
  if (!win) return { ok: false, reason: "blocked" };
  try {
    win.document.title = "DigiLocker";
    win.document.body.style.font = "16px system-ui, sans-serif";
    win.document.body.textContent = "Opening DigiLocker…";
  } catch { /* cross-origin already: fine */ }

  let state: string;
  try {
    const r = await post<{ state: string; url: string }>("/api/digilocker/start", { purpose, expectedName });
    state = r.state;
    win.location.href = r.url.startsWith("/") ? API_BASE + r.url : r.url;
  } catch {
    win.close();
    return { ok: false, reason: "error" };
  }

  return new Promise<LockerResult>((resolve) => {
    let done = false;
    const finish = (r: LockerResult) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(r);
    };
    const check = async () => {
      try {
        const r = await post<{ status: string; summary?: LockerSummary }>("/api/digilocker/result", { state });
        if (r.status === "done" && r.summary) finish({ ok: true, summary: r.summary });
        else if (r.status === "denied") finish({ ok: false, reason: "denied" });
        else if (r.status === "error" || r.status === "unknown") finish({ ok: false, reason: "error" });
      } catch { /* keep waiting */ }
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "digilocker" && e.data.state === state) check();
    };
    window.addEventListener("message", onMessage);
    const poll = setInterval(check, 2000);
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), WAIT_MS);
  });
}
