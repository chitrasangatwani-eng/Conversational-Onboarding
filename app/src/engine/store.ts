import { useSyncExternalStore } from "react";
import type { Msg } from "./types";

// One app-wide store. The flow logic reads and writes it outside React
// (timers, speech callbacks), so it is a small external store rather than
// component state.

export type StepState = "todo" | "pending" | "done" | "rejected";
export type Fail = "none" | "blur" | "name" | "otp" | "video" | "security";
export type Screen = "home" | "mobile" | "details" | "secure" | "vkyc" | "fees" | "review";
export type WhyKey = "" | "mobNum" | "dName" | "dDob" | "dEmail" | "dPin" | "pan" | "addr" | "vk";
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
  mob: "todo", mobStage: "enter", mobNum: "", otp: "", otpErr: "", mobErr: "", otpNote: "",
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

let state = initial;
const listeners = new Set<() => void>();

export function get(): State {
  return state;
}

export function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
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
