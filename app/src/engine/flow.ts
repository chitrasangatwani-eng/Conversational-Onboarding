import { get, set, resetFlow, type Ovd, type Screen, type State } from "./store";
import { L, clearFailures, loadLang } from "./i18n";
import { checkOtp, requestOtp } from "./otp";
import { backend, firebaseWeb, otpChannel } from "./api";
import { confirmFirebaseCode, sendFirebaseSms } from "./firebasePhone";
import { fetchFromDigiLocker } from "./digilocker";
import { checkAadhaarOtp, requestAadhaarOtp } from "./aadhaar";
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
  set({ navNote: "" });
  const q = get();
  if (q.mob !== "done") { set({ screen: "mobile", sheet: false, mobStage: "enter", otp: "", otpErr: "", mobErr: "" }); return; }
  if (q.det !== "done") { set({ screen: "details", sheet: false, dErr: "" }); return; }
  if (q.addr === "done" && q.selfie !== "done" && q.selfie !== "pending") { set({ screen: "vkyc", sheet: false, vk: "ready", vkT: 0, muted: false }); return; }
  if (q.selfie === "done") { set({ screen: "review", sheet: false, consent: false }); return; }
  if (q.id === "todo" || q.id === "rejected") { set({ screen: "idchoice", sheet: false, dlErr: "" }); return; }
  if (q.id === "done" && q.addr !== "done" && q.addr !== "pending") { set({ screen: "addrchoice", sheet: false, dlErr: "" }); return; }
  set({ screen: "secure", sheet: false, dlErr: "" });
}

export const backHome = () => set({ screen: "home", navNote: "" });
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
/** Ask the backend (or the local demo) to send a code. Also used for Resend OTP. */
export async function sendOtp(resend = false) {
  const q = get();
  if (q.otpBusy) return;
  // Either is enough: a valid email gets the code by email, otherwise a valid mobile gets it by SMS.
  const typed = otpChannel() === "email" ? q.otpEmail.trim() : "";
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed) ? typed : "";
  const mobile = validMobile(q.mobNum) ? q.mobNum : "";
  if (!email && !mobile) {
    set({ mobErr: typed ? "Enter a valid email address, or a 10-digit mobile number." : otpChannel() === "email" ? "Enter your mobile number or your email." : "Enter a valid 10-digit Indian mobile number." });
    return;
  }
  set({ otpBusy: true, mobErr: "", otpErr: "" });
  // SMS through Firebase Phone Auth: Firebase sends and checks the code in the browser.
  if (!email && firebaseWeb()) {
    const f = await sendFirebaseSms(mobile);
    if (!f.ok) { set(resend ? { otpBusy: false, otpErr: f.message } : { otpBusy: false, mobErr: f.message }); return; }
    set({ otpBusy: false, mobStage: "otp", otp: "", otpReq: "firebase", otpDemo: "", otpSentTo: "", resendAt: Date.now() + 30_000, otpNote: resend ? "A new OTP was sent." : "" });
    return;
  }
  const r = await requestOtp(mobile, email);
  if (!r.ok) { set(resend ? { otpBusy: false, otpErr: r.message } : { otpBusy: false, mobErr: r.message }); return; }
  set({
    otpBusy: false, mobStage: "otp", otp: "", otpReq: r.requestId, otpDemo: r.sandboxCode ?? "",
    resendAt: Date.now() + r.resendIn * 1000, otpNote: resend ? "A new OTP was sent." : "",
    otpSentTo: r.maskedEmail ?? "",
    // The address doubles as the email on the personal details step.
    ...(email && !get().dEmail ? { dEmail: email } : {}),
  });
}

export async function verifyOtp() {
  const q = get();
  if (q.otpBusy) return;
  if (q.otp.length !== 6) { set({ otpErr: "Enter all 6 digits." }); return; }
  set({ otpBusy: true, otpErr: "" });
  const r = q.otpReq === "firebase" ? await confirmFirebaseCode(q.otp) : await checkOtp(q.otpReq, q.otp);
  if (!r.ok) { set({ otpBusy: false, otpErr: r.message, ...(r.expired ? { otp: "", resendAt: 0 } : {}) }); return; }
  set({ otpBusy: false, mob: "done", mobToken: r.token, screen: "home", otpReq: "", otpDemo: "" });
}

export const changeNumber = () => set({ mobStage: "enter", otp: "", otpErr: "", otpReq: "", otpDemo: "", otpNote: "" });

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
export const captureKind = (): "pan" | "ovd" | "addr" | "vk" => {
  const q = get();
  return q.addr === "done" ? "vk" : q.id === "done" ? "addr" : q.ovd === "pan" || !q.ovd ? "pan" : "ovd";
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

// ---- Form 60 (no PAN) ----

export const openForm60 = () => set({ screen: "form60", f60Err: "" });
/** Go back to giving a PAN instead of Form 60. */
export const usePanInstead = () => set({ screen: "idchoice", f60: false, f60Err: "", dlErr: "" });

/** Check a DD/MM/YYYY date that is not in the future. */
function pastDate(v: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  if (!m) return false;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d.getDate() === +m[1] && d.getMonth() === +m[2] - 1 && d <= new Date() && +m[3] >= 1990;
}

export function form60Error(): string {
  const q = get();
  if (!q.f60Reason) return "Choose whether you've applied for a PAN.";
  if (q.f60Reason === "applied") {
    if (!/^\d{9,15}$/.test(q.f60Ack)) return "Enter the acknowledgement number from your PAN application (digits only).";
    if (!pastDate(q.f60AckDate)) return "Enter the application date as DD/MM/YYYY.";
  } else if (!q.f60Income) return "Choose your estimated income for this year.";
  if (!q.f60Agri) return "Tell us whether you have agricultural income.";
  if (!q.f60Consent) return "Tick the declaration to continue.";
  return "";
}

export function submitForm60() {
  const err = form60Error();
  if (err) { set({ f60Err: err }); return; }
  set({ f60: true, taxOk: true, f60Err: "", screen: "idchoice" });
}

// ---- Aadhaar OTP (server mode) ----

export async function sendAadhaarOtp() {
  const q = get();
  if (q.aadBusy) return;
  set({ aadBusy: true, aadErr: "" });
  const r = await requestAadhaarOtp(q.aadNum, q.aadConsent);
  if (!r.ok) { set({ aadBusy: false, aadErr: r.message }); return; }
  set({
    aadBusy: false, aadStage: "otp", aadRef: r.ref, aadLast4: r.last4, aadDemo: r.sandboxCode ?? "", aadOtp: "",
    aadNum: "", // the full number isn't kept in the app once the OTP is requested
    aadResendAt: Date.now() + 30_000,
  });
}

export async function verifyAadhaarOtp() {
  const q = get();
  if (q.aadBusy) return;
  if (q.aadOtp.length !== 6) { set({ aadErr: "Enter all 6 digits." }); return; }
  set({ aadBusy: true, aadErr: "" });
  const r = await checkAadhaarOtp(q.aadRef, q.aadOtp, q.dName);
  if (!r.ok) { set({ aadBusy: false, aadErr: r.message, ...(r.restart ? { aadStage: "enter", aadOtp: "", aadRef: "", aadDemo: "" } : {}) }); return; }
  set({ aadBusy: false, aadRef: "", aadDemo: "", aadOtp: "" });
  if (!r.nameMatch) { set({ screen: "home", id: "rejected", reason: "name" }); return; }
  set({ screen: "home", id: "pending", dlNote: `Aadhaar ending ${r.last4} verified by OTP` + (r.pincode ? ` (PIN ${r.pincode}${r.state ? ", " + r.state : ""})` : "") });
  later(() => set({ id: "done" }), 1500);
}

/** From the Aadhaar screen: use DigiLocker instead (it carries the verified Aadhaar). */
// ---- Identity (step 3): any one identity proof ----

/** Identity proofs offered. Any one is enough; Aadhaar is optional. The address list reuses all but PAN. */
export const ID_PROOFS: { id: Ovd; en: string; hi: string; how: string }[] = [
  { id: "pan", en: "PAN card", hi: "PAN कार्ड", how: "Photo, or fetch from DigiLocker" },
  { id: "aadhaar", en: "Aadhaar", hi: "आधार", how: "OTP to the linked mobile, or DigiLocker" },
  { id: "passport", en: "Passport", hi: "पासपोर्ट", how: "Photo of the photo and address pages" },
  { id: "voter", en: "Voter ID", hi: "वोटर ID", how: "Photo of both sides" },
  { id: "dl", en: "Driving licence", hi: "ड्राइविंग लाइसेंस", how: "Photo of both sides" },
  { id: "nrega", en: "NREGA job card", hi: "NREGA जॉब कार्ड", how: "Signed by a state government officer" },
  { id: "npr", en: "NPR letter", hi: "NPR पत्र", how: "National Population Register letter with your name and address" },
];
/** Officially valid documents that also prove address (PAN doesn't show one). */
export const OVDS = ID_PROOFS.filter((d) => d.id !== "pan");
export const ovdName = (o: Ovd | "", tr: (en: string, hi: string) => string = (en) => en) => {
  const d = ID_PROOFS.find((x) => x.id === o);
  return d ? tr(d.en, d.hi) : tr("ID proof", "पहचान प्रमाण");
};

/** Name of the identity step, shared by Home, the assistant's status card and the handoff summary. */
export function idStepLabel(q: State, tr: (en: string, hi: string) => string = (en) => en): string {
  return q.ovd ? ovdName(q.ovd, tr) : tr("Identity proof", "पहचान प्रमाण");
}

export const chooseIdDoc = () => set({ screen: "idchoice", dlErr: "", aadErr: "" });
export const choosePan = () => set({ ovd: "pan", screen: "secure", dlErr: "" });
/** Pick the identity document (part 2). Aadhaar has its own OTP screen; the rest are photographed. */
export const chooseOvd = (o: Ovd) => o === "pan" ? choosePan() : set(o === "aadhaar"
  ? { ovd: o, screen: "aadhaar", aadStage: "enter", aadOtp: "", aadErr: "", aadRef: "", aadDemo: "", dlErr: "" }
  : { ovd: o, screen: "secure", dlErr: "" });
export const chooseAadhaar = () => chooseOvd("aadhaar");

// ---- Address (step 4): an OVD, or a deemed OVD for a limited time ----

/** Deemed OVDs: accepted for address when the ID proof's address isn't current; an updated OVD is due within 3 months. */
export const DEEMED = ["Utility bill (up to 2 months old)", "Property or municipal tax receipt", "Pension payment order", "Employer accommodation allotment letter"];
export const chooseAddrDoc = (doc: string) => set({ addrDoc: doc, screen: "secure", dlErr: "" });
/** The identity document already shows the current address. */
export function useIdForAddress() {
  const q = get();
  set({ addrDoc: ovdName(q.ovd) + " (same as ID proof)", screen: "home", addr: "pending" });
  later(() => set({ addr: "done" }), 1500);
}
/** Verify Aadhaar through DigiLocker's e-Aadhaar instead of an OTP. Must be called from the click. */
export const aadhaarViaDigiLocker = () => useDigiLocker("aadhaar");

/** "Fetch from DigiLocker instead" on the PAN and address steps. Must be called from the click. */
export function useDigiLocker(kind: "doc" | "aadhaar" = "doc") {
  if (backend() === "local") { simulateDigiLocker(kind); return; }
  const q = get();
  if (q.dlBusy) return;
  const forAadhaar = kind === "aadhaar" && q.id !== "done";
  const purpose = q.id === "done" || forAadhaar ? "address" : "pan";
  set({ dlBusy: true, dlErr: "" });
  fetchFromDigiLocker(purpose, q.dName).then((r) => {
    set({ dlBusy: false });
    if (!r.ok) {
      set({ dlErr: {
        blocked: "Your browser blocked the DigiLocker window. Allow pop-ups for this site and try again.",
        denied: "You didn't allow sharing in DigiLocker. You can try again or upload a photo instead.",
        error: "We couldn't get your documents from DigiLocker. Try again, or upload a photo instead.",
        timeout: "DigiLocker took too long. Try again, or upload a photo instead.",
      }[r.reason] });
      return;
    }
    const d = r.summary;
    if (forAadhaar) {
      if (!d.pincode) { set({ dlErr: "We couldn't find your e-Aadhaar in DigiLocker. Use the Aadhaar OTP or another ID proof instead." }); return; }
      if (!d.nameMatch) { set({ screen: "home", id: "rejected", reason: "name" }); return; }
      set({ screen: "home", id: "pending", dlNote: "Aadhaar fetched from DigiLocker (PIN " + d.pincode + (d.state ? ", " + d.state : "") + ")" });
      later(() => set({ id: "done" }), 1500);
      return;
    }
    if (purpose === "pan") {
      if (!d.panIssued) { set({ dlErr: "No PAN card was found in your DigiLocker. Upload a photo of your PAN instead." }); return; }
      if (!d.nameMatch) { set({ screen: "home", id: "rejected", reason: "name" }); return; }
      set({ screen: "home", id: "pending", ovd: "pan", dlNote: "PAN ending " + (d.panLast4 ?? "") + " fetched from DigiLocker" });
      later(() => set({ id: "done" }), 1500);
      return;
    }
    if (!d.pincode) { set({ dlErr: "Your DigiLocker has no Aadhaar address we can use. Upload an address document instead." }); return; }
    set({ screen: "home", addr: "pending", dlNote: "Address (PIN " + d.pincode + (d.state ? ", " + d.state : "") + ") fetched from DigiLocker" });
    later(() => set({ addr: "done" }), 1500);
  });
}

/** Static demo: no backend, so DigiLocker is simulated and the demo failure control applies. */
function simulateDigiLocker(kind: "doc" | "aadhaar") {
  const q = get();
  if (q.id !== "done") {
    // DigiLocker removes the photo-quality failure, not a name or OTP mismatch.
    if (q.fail === "name" || q.fail === "otp") { set({ screen: "home", id: "rejected", reason: q.fail, fail: "none" }); return; }
    set({ screen: "home", id: "pending", ovd: kind === "aadhaar" ? "aadhaar" : "pan", fail: q.fail === "blur" ? "none" : q.fail });
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
    : id === "rejected" ? "Try identity again" : "Verify your identity";
}

export type { Screen };

// ---- Step navigation (sidebar and step list) ----

const STEP_NAMES = ["Mobile number", "Personal details", "", "Address proof", "Video KYC", "Review and submit"];

/**
 * Open step n (1-6) from the progress list. Finished mobile and details steps
 * reopen for editing; the current step continues; verified and locked steps
 * explain themselves instead of opening.
 */
export function openStep(n: number, look: "done" | "cur" | "bad" | "wait" | "x", label: string) {
  const q = get();
  set({ navNote: "", sheet: false });
  if (look === "cur" || look === "bad") { goSecure(); return; }
  if (look === "done") {
    if (n === 1) { set({ screen: "mobile", mobStage: "enter", otp: "", otpErr: "", mobErr: "", navNote: "Your mobile is verified. Verify again only if you want to change it." }); return; }
    if (n === 2) { set({ screen: "details", dErr: "" }); return; }
    set({ screen: "home", navNote: `${label} is verified. Nothing to do here.` });
    return;
  }
  if (look === "wait") { set({ screen: "home", navNote: `${label} is being checked. We'll update this when it's done.` }); return; }
  const prev = n === 4 ? idStepLabel(q) : STEP_NAMES[n - 2] || idStepLabel(q);
  set({ navNote: `${label} opens after ${prev}.` });
}

/** Demo only: mark earlier steps done and open step n, to show any screen in a presentation. */
export function jumpToStep(n: number) {
  timers.forEach(clearTimeout);
  timers.clear();
  set({
    mob: n > 1 ? "done" : "todo", mobStage: "enter", det: n > 2 ? "done" : "todo",
    id: n > 3 ? "done" : "todo", ovd: n > 3 ? "aadhaar" : "", addrDoc: n > 4 ? "Aadhaar (same as ID proof)" : "", f60: false, reason: "",
    addr: n > 4 ? "done" : "todo", selfie: n > 5 ? "done" : "todo",
    submitted: false, held: false, consent: false, navNote: "", dlNote: "", saved: false,
  });
  goSecure();
}
