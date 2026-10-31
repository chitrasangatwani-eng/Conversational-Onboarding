import { get, set, resetFlow, type Screen } from "./store";
import { L, clearFailures, loadLang } from "./i18n";
import { ask, greet, intentFix, intentHandoff } from "./assistant";
import { stopListen, stopSpeak } from "./voice";

// The onboarding flow is the system of record. These actions stand in for the
// real verification backend; the "Next failure to simulate" control decides
// which outcome comes back.

const timers = new Set<ReturnType<typeof setTimeout>>();
function later(fn: () => void, ms: number) {
  const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
  timers.add(t);
}

/** Go to whichever secure step is current. */
export function goSecure() {
  const q = get();
  if (q.mob !== "done") { set({ screen: "mobile", sheet: false, mobStage: "enter", otp: "", otpErr: "", mobErr: "" }); return; }
  if (q.det !== "done") { set({ screen: "details", sheet: false, dErr: "" }); return; }
  if (q.addr === "done" && q.selfie !== "done" && q.selfie !== "pending") { set({ screen: "vkyc", sheet: false, vk: "ready", vkT: 0, muted: false }); return; }
  if (q.selfie === "done") { set({ screen: "review", sheet: false, consent: false }); return; }
  set({ screen: "secure", sheet: false });
}

export const backHome = () => set({ screen: "home" });
export const openFees = () => set((s) => ({ screen: "fees", sheet: false, back: s.screen }));
export const backFromFees = () => set((s) => ({ screen: s.back === "review" ? "review" : "home" }));

// ---- Assistant sheet ----

export function openHelp() {
  set({ sheet: true, vmode: true, speak: true });
  setTimeout(() => greet(), 300);
}
export function closeSheet() {
  stopSpeak();
  stopListen();
  set({ sheet: false });
}
export function openBlockerHelp() {
  set({ sheet: true });
  if (!get().msgs.length) ask(L("Why did this fail?", "यह क्यों नहीं हुआ?"), intentFix());
}
export function talkFromHome() {
  set({ sheet: true });
  ask(L("Talk to a person", "किसी व्यक्ति से बात करें"), intentHandoff());
}
export const turnOffHelp = () => { closeSheet(); set({ helpOn: false }); };
export function setLang(code: string) {
  stopSpeak();
  stopListen();
  clearFailures();
  set({ lang: code });
  loadLang(code).catch(() => {}).then(() => {
    const s = get();
    if (s.lang === code && s.vmode && s.sheet) greet();
  });
}

// ---- Mobile ----

export const validMobile = (n: string) => /^[6-9]\d{9}$/.test(n);
export function sendOtp() {
  if (!validMobile(get().mobNum)) { set({ mobErr: "Enter a valid 10-digit Indian mobile number." }); return; }
  set({ mobStage: "otp", otp: "", otpErr: "", otpNote: "" });
}
export function verifyOtp() {
  const otp = get().otp;
  if (otp.length !== 6) { set({ otpErr: "Enter all 6 digits." }); return; }
  if (otp === "000000") { set({ otpErr: "That OTP didn't match. Check the SMS and try again." }); return; }
  set({ mob: "done", screen: "home" });
}

// ---- Personal details ----

export function detailsError(): string {
  const s = get();
  const okName = s.dName.trim().length >= 3;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.dDob);
  const yr = m ? +m[3] : 0;
  const okDob = !!m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12 && yr >= 1900 && yr <= new Date().getFullYear() - 18;
  const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.dEmail);
  const okPin = /^\d{6}$/.test(s.dPin);
  return !okName ? "Enter your full name as on your PAN."
    : !okDob ? "Enter your date of birth as DD/MM/YYYY. You must be 18 or older."
    : !okMail ? "Enter a valid email address."
    : !okPin ? "Enter a 6-digit PIN code." : "";
}
export function saveDetails() {
  const e = detailsError();
  if (e) { set({ dErr: e }); return; }
  set({ det: "done", screen: "home", dErr: "" });
}

// ---- Document capture (PAN, address) ----

/** Which document the secure capture screen is collecting. */
export const captureKind = (): "pan" | "addr" | "vk" => {
  const q = get();
  return q.addr === "done" ? "vk" : q.id === "done" ? "addr" : "pan";
};

export function submitCapture() {
  const q = get();
  const kind = captureKind();
  if (kind === "vk") {
    if (q.fail === "video") { set({ screen: "home", selfie: "rejected", fail: "none" }); return; }
    set({ screen: "home", selfie: "pending" });
    later(() => set({ selfie: "done" }), 4000);
    return;
  }
  if (kind === "addr") {
    set({ screen: "home", addr: "pending" });
    later(() => set({ addr: "done" }), 4000);
    return;
  }
  const f = q.fail;
  if (f === "blur" || f === "name" || f === "otp") { set({ screen: "home", id: "rejected", reason: f, fail: "none" }); return; }
  set({ screen: "home", id: "pending" });
  later(() => set({ id: "done" }), 4000);
}

export function useDigiLocker() {
  const q = get();
  if (q.id !== "done") {
    // DigiLocker removes the photo-quality failure, not a name or OTP mismatch.
    if (q.fail === "name" || q.fail === "otp") { set({ screen: "home", id: "rejected", reason: q.fail, fail: "none" }); return; }
    set({ screen: "home", id: "pending", fail: q.fail === "blur" ? "none" : q.fail });
    later(() => set({ id: "done" }), 2500);
    return;
  }
  set({ screen: "home", addr: "pending" });
  later(() => set({ addr: "done" }), 2500);
}

// ---- Video KYC call (agent side is a placeholder) ----

let tick: ReturnType<typeof setInterval> | null = null;
const clearTick = () => { if (tick) { clearInterval(tick); tick = null; } };

export function joinVk() {
  set({ vk: "connecting" });
  later(() => {
    const q = get();
    if (q.screen !== "vkyc" || q.vk !== "connecting") return;
    set({ vk: "live", vkT: 0 });
    tick = setInterval(() => {
      const t = get().vkT + 1;
      set({ vkT: t });
      if (get().fail === "video" && t >= 5) endCall("drop");
      else if (t >= 13) endCall("done");
    }, 1000);
  }, 3000);
}

export function endCall(kind: "drop" | "done" | "hang") {
  clearTick();
  if (kind === "drop") set({ screen: "home", selfie: "rejected", fail: "none", vk: "ready" });
  else if (kind === "done") { set({ screen: "home", selfie: "pending", vk: "ready" }); later(() => set({ selfie: "done" }), 4000); }
  else set({ screen: "home", vk: "ready" });
}

// ---- Review ----

export function submitApplication() {
  const q = get();
  if (!q.consent) return;
  set({ screen: "home", submitted: true, held: q.fail === "security", fail: q.fail === "security" ? "none" : q.fail });
}

// ---- Demo ----

export function resetPrototype() {
  clearTick();
  timers.forEach(clearTimeout);
  timers.clear();
  stopSpeak();
  stopListen();
  resetFlow();
}

export function stageKey(): "" | "mob" | "det" | "id" | "addr" | "vk" {
  const q = get();
  if (q.mob !== "done") return "mob";
  if (q.det !== "done") return "det";
  if (q.id === "todo" || q.id === "rejected") return "id";
  if (q.id === "done" && q.addr === "todo") return "addr";
  if (q.addr === "done" && (q.selfie === "todo" || q.selfie === "rejected")) return "vk";
  return "";
}

export function ctaLabel(): string | null {
  const q = get(), id = q.id, ad = q.addr, sf = q.selfie;
  const can = q.mob !== "done" || q.det !== "done" || id === "todo" || id === "rejected" || (id === "done" && ad === "todo") ||
    (ad === "done" && (sf === "todo" || sf === "rejected")) || (sf === "done" && !q.submitted);
  if (!can) return null;
  return q.mob !== "done" ? "Verify mobile number" : q.det !== "done" ? "Fill personal details"
    : sf === "rejected" ? "Retry Video KYC" : sf === "done" ? "Review and submit"
    : ad === "done" ? "Start Video KYC" : id === "done" ? "Upload address proof"
    : id === "rejected" ? "Retake PAN photo" : "Upload PAN photo";
}

export type { Screen };
