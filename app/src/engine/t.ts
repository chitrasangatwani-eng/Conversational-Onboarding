import { get } from "./store";
import { LR } from "./i18n";
import { HI } from "../i18n/ui-hi";

/** Marks a stored message (see TK), so it's translated when shown, not when made. */
const MARK = "⁣";

/**
 * Translate a page string into the current language. Hindi comes from the
 * hand-written table in src/i18n/ui-hi.ts (keyed by the English text); other
 * languages use the live translation queue, like the assistant; English is
 * returned as is. `{name}` placeholders are filled from `vars` after
 * translating, and string values are translated too when the table has them
 * (step and document names). Also accepts a message made by TK.
 * Called while rendering, so the page follows the language as soon as it changes.
 */
export function T(en: string, vars?: Record<string, string | number>): string {
  if (en.startsWith(MARK)) {
    try { const [k, v] = JSON.parse(en.slice(1)) as [string, Record<string, string | number>]; return T(k, v); } catch { return en.slice(1); }
  }
  const lang = get().lang;
  const tr = (s: string) => (lang === "en" ? s : lang === "hi" ? HI[s] ?? s : LR(s, s));
  let out = tr(en);
  if (vars) for (const k of Object.keys(vars)) { const v = vars[k]; out = out.split("{" + k + "}").join(typeof v === "string" && v ? tr(v) : String(v)); }
  return out;
}

/**
 * A message to store in state (errors, notes) and show later with T(). It keeps
 * the English text and values, so it appears in whichever language is chosen
 * when it's shown, even if the applicant switches language afterwards.
 */
export function TK(en: string, vars?: Record<string, string | number>): string {
  return vars ? MARK + JSON.stringify([en, vars]) : en;
}
