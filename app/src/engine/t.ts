import { get } from "./store";
import { LR } from "./i18n";
import { HI } from "../i18n/ui-hi";

/**
 * Translate a page string. Hindi comes from the hand-written table in
 * src/i18n/ui-hi.ts (keyed by the English text); other languages use the live
 * translation queue, like the assistant; English is returned as is.
 * `{name}` placeholders are filled from `vars` after translating.
 * Read the language at render time, so screens switch as soon as it changes.
 */
export function T(en: string, vars?: Record<string, string | number>): string {
  const lang = get().lang;
  let out = lang === "en" ? en : lang === "hi" ? HI[en] ?? en : LR(en, en);
  if (vars) for (const k of Object.keys(vars)) out = out.split("{" + k + "}").join(String(vars[k]));
  return out;
}
