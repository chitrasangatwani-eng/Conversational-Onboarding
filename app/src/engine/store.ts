import { useSyncExternalStore } from "react";
import type { Msg } from "./types";

// One app-wide store. The flow logic reads and writes it outside React
// (timers, speech callbacks), so it is a small external store rather than
// component state.

export type StepState = "todo" | "pending" | "done" | "rejected";
export type Fail = "none" | "blur" | "name" | "otp" | "video" | "security";
export type Ovd = "pan" | "aadhaar" | "passport" | "voter" | "dl" | "nrega" | "npr";
export type Screen = "home" | "mobile" | "details" | "secure" | "idchoice" | "addrchoice" | "aadhaar" | "form60" | "vkyc" | "fees" | "review";
export type WhyKey = "" | "aadhaar" | "mobNum" | "dName" | "dDob" | "dEmail" | "dPin" | "pan" | "addr" | "vk";
export type Field = "mobNum" | "otp" | "dName" | "dDob" | "dEmail" | "dPin";

export interface State {
  mvp: boolean;
  // demo controls
  fail: Fail;
  data: "fresh" | "stale" | "down";
  down: boolean;
  weak: boolean;
  // navigation
  screen: Screen;
  back: Screen;
  sheet: boolean;
  vmode: boolean;
  helpOn: boolean;
  why: WhyKey;
  // flow
  mob: "todo" | "done";
  mobStage: "enter" | "otp";
  mobNum: string;
  otp: string;
  mobErr: string;
  otpErr: string;
  otpNote: string;
  /** Server request id for the code just sent; empty before sending. */
  otpReq: string;
  /** Code to show in sandbox/demo mode only. */
  otpDemo: string;
  otpBusy: boolean;
  /** Time (ms) when Resend OTP becomes available. */
  resendAt: number;
  /** Signed proof from the server that the mobile was verified. */
  mobToken: string;
  /** Email for OTP delivery when the backend sends codes by email. */
  otpEmail: string;
  otpSentTo: string;
  dlBusy: boolean;
  /** Short note after clicking a step that can't open, e.g. "Finish Mobile number first." */
  navNote: string;
  /** Kept for a future full-KYC mode (PAN or Form 60 plus an ID proof). Unused in the one-proof flow. */
  taxOk: boolean;
  /** Step 3: the identity proof chosen. Any one of the listed documents is enough. */
  ovd: "" | Ovd;
  /** Step 4: the address document chosen. */
  addrDoc: string;
  /** Form 60 declared instead of a PAN; the identity step then takes another ID document. */
  f60: boolean;
  f60Reason: "" | "applied" | "none";
  f60Ack: string;
  f60AckDate: string;
  f60Income: string;
  f60Agri: string;
  f60Consent: boolean;
  f60Err: string;
  aadStage: "enter" | "otp";
  aadNum: string;
  aadConsent: boolean;
  aadOtp: string;
  aadRef: string;
  aadLast4: string;
  aadDemo: string;
  aadBusy: boolean;
  aadErr: string;
  aadResendAt: number;
  dlErr: string;
  /** What DigiLocker supplied, shown on the step (masked). */
  dlNote: string;
  det: "todo" | "done";
  dName: string;
  dDob: string;
  dEmail: string;
  dPin: string;
  dErr: string;
  id: StepState;
  reason: "" | "blur" | "name" | "otp";
  addr: StepState;
  selfie: StepState;
  vk: "ready" | "connecting" | "live";
  vkT: number;
  muted: boolean;
  consent: boolean;
  submitted: boolean;
  held: boolean;
  saved: boolean;
  nudgeOff: Record<string, boolean>;
  // assistant
  msgs: Msg[];
  typing: boolean;
  draft: string;
  checks: boolean[];
  hgoal: string;
  feedback: Record<number, "yes" | "no">;
  lang: string;
  translating: boolean;
  trVersion: number;
  // voice
  speak: boolean;
  speaking: boolean;
  listening: boolean;
  live: string;
  micErr: string;
  micBlocked: boolean;
  dictating: Field | "";
}

const flowDefaults = {
  data: "fresh", down: false, why: "", hgoal: "", nudgeOff: {}, screen: "home", back: "home", sheet: false,
  helpOn: true, id: "todo", msgs: [], typing: false, draft: "", checks: [false, false, false, false],
  mob: "todo", mobStage: "enter", mobNum: "", otp: "", otpErr: "", mobErr: "", otpNote: "", otpReq: "", otpDemo: "", otpBusy: false, resendAt: 0, mobToken: "", otpEmail: "", otpSentTo: "", dlBusy: false, dlErr: "", dlNote: "", navNote: "", taxOk: false, ovd: "", addrDoc: "", f60: false, f60Reason: "", f60Ack: "", f60AckDate: "", f60Income: "", f60Agri: "", f60Consent: false, f60Err: "", aadStage: "enter", aadNum: "", aadConsent: false, aadOtp: "", aadRef: "", aadLast4: "", aadDemo: "", aadBusy: false, aadErr: "", aadResendAt: 0,
  det: "todo", dName: "Chitra Sangatwani", dDob: "14/08/1994", dEmail: "", dPin: "", dErr: "",
  addr: "todo", selfie: "todo", consent: false, submitted: false, reason: "", held: false, saved: false,
  fail: "blur", vk: "ready", vkT: 0, muted: false, feedback: {},
} satisfies Partial<State>;

const initial: State = {
  ...flowDefaults,
  mvp: initialScope(),
  weak: false,
  vmode: false,
  lang: "en",
  translating: false,
  trVersion: 0,
  speak: true,
  speaking: false,
  listening: false,
  live: "",
  micErr: "",
  micBlocked: false,
  dictating: "",
};

function initialScope(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("scope");
    if (q === "full") return false;
    if (q === "mvp") return true;
  } catch { /* no window */ }
  return true;
}

// Step progress survives a page reload in this browser tab (sessionStorage),
// so "Reload page" or a refresh doesn't send the applicant back to step 1.
// Only step statuses and document names are kept: no personal details, codes or tokens.
const SAVE_KEY = "artha-progress";
const SAVED_KEYS = ["mob", "det", "id", "addr", "selfie", "ovd", "addrDoc", "f60"] as const;
function restore(s: State): State {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY);
    if (!raw) return s;
    const saved = JSON.parse(raw) as Partial<State> & { onVk?: boolean };
    const out = { ...s };
    for (const k of SAVED_KEYS) if (k in saved) (out as Record<string, unknown>)[k] = saved[k];
    // A check that was in progress when the page reloaded can't resume, so treat it as finished (demo).
    (["id", "addr", "selfie"] as const).forEach((k) => { if (out[k] === "pending") (out as Record<string, unknown>)[k] = "done"; });
    if (saved.onVk && out.addr === "done" && out.selfie !== "done") Object.assign(out, { screen: "vkyc", vk: "ready", vkT: 0 });
    return out;
  } catch { return s; }
}
function save(s: State) {
  try {
    const keep: Record<string, unknown> = { onVk: s.screen === "vkyc" };
    for (const k of SAVED_KEYS) keep[k] = s[k];
    sessionStorage.setItem(SAVE_KEY, JSON.stringify(keep));
  } catch { /* storage unavailable: progress just isn't kept */ }
}

let state = typeof window === "undefined" ? initial : restore(initial);
const listeners = new Set<() => void>();

export function get(): State {
  return state;
}

export function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  if (typeof window !== "undefined") save(state);
  listeners.forEach((l) => l());
}

export function resetFlow() {
  set({ ...flowDefaults });
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => pick(state));
}

/** Whole-state hook; fine at this app's size. */
export function useAppState(): State {
  return useSyncExternalStore(subscribe, get);
}
