import { get, set } from "./store";
import type { Msg } from "./types";

// English and Hindi are hand-written in the code: L(en, hi).
// The other 21 languages are translated live through the /api/translate proxy
// and cached per language. UI labels collect while rendering and go out in one
// batch; assistant replies are translated before they are shown.

export const LANGS: { code: string; label: string; name: string; sr: string }[] = [
  { code: "en", label: "English", name: "English", sr: "en-IN" },
  { code: "as", label: "অসমীয়া", name: "Assamese", sr: "as-IN" },
  { code: "bn", label: "বাংলা", name: "Bengali", sr: "bn-IN" },
  { code: "brx", label: "बड़ो", name: "Bodo", sr: "hi-IN" },
  { code: "doi", label: "डोगरी", name: "Dogri", sr: "hi-IN" },
  { code: "gu", label: "ગુજરાતી", name: "Gujarati", sr: "gu-IN" },
  { code: "hi", label: "हिन्दी", name: "Hindi", sr: "hi-IN" },
  { code: "kn", label: "ಕನ್ನಡ", name: "Kannada", sr: "kn-IN" },
  { code: "ks", label: "کٲشُر", name: "Kashmiri", sr: "ur-IN" },
  { code: "kok", label: "कोंकणी", name: "Konkani", sr: "mr-IN" },
  { code: "mai", label: "मैथिली", name: "Maithili", sr: "hi-IN" },
  { code: "ml", label: "മലയാളം", name: "Malayalam", sr: "ml-IN" },
  { code: "mni", label: "ꯃꯤꯇꯩꯂꯣꯟ", name: "Manipuri (Meitei)", sr: "bn-IN" },
  { code: "mr", label: "मराठी", name: "Marathi", sr: "mr-IN" },
  { code: "ne", label: "नेपाली", name: "Nepali", sr: "ne-NP" },
  { code: "or", label: "ଓଡ଼ିଆ", name: "Odia", sr: "or-IN" },
  { code: "pa", label: "ਪੰਜਾਬੀ", name: "Punjabi", sr: "pa-IN" },
  { code: "sa", label: "संस्कृतम्", name: "Sanskrit", sr: "hi-IN" },
  { code: "sat", label: "ᱥᱟᱱᱛᱟᱲᱤ", name: "Santali", sr: "en-IN" },
  { code: "sd", label: "سنڌي", name: "Sindhi", sr: "ur-IN" },
  { code: "ta", label: "தமிழ்", name: "Tamil", sr: "ta-IN" },
  { code: "te", label: "తెలుగు", name: "Telugu", sr: "te-IN" },
  { code: "ur", label: "اردو", name: "Urdu", sr: "ur-IN" },
];

/** Languages answered without a network call. */
export const isLocal = (lang: string) => lang === "en" || lang === "hi";

/** BCP-47 tag for speech recognition and synthesis. */
export function speechLang(): string {
  return LANGS.find((l) => l.code === get().lang)?.sr ?? "en-IN";
}

const cache: Record<string, Record<string, string>> = {};
const failed = new Set<string>();
const missing = new Set<string>();
let busy = false;
let scheduled = false;

/** Translate text for the current language. Never blocks: returns English until a translation is cached. */
export function L(en: string, hi: string): string {
  const g = get().lang;
  if (g === "hi") return hi;
  if (g === "en") return en;
  return cache[g]?.[en] ?? en;
}

/** Same as L, but also queues a missing string for the next UI batch. Use while rendering. */
export function LR(en: string, hi: string): string {
  const g = get().lang;
  if (isLocal(g)) return L(en, hi);
  const c = cache[g]?.[en];
  if (c) return c;
  if (!failed.has(g + "|" + en)) {
    missing.add(en);
    if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; flushUI(); }); }
  }
  return en;
}

export function clearFailures() {
  failed.clear();
}

/** Where the translation proxy lives. Empty means the same site; set VITE_API_BASE for a static host such as GitHub Pages. */
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(API_BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(path + " " + r.status);
  return (await r.json()) as T;
}

async function tr1(lang: string, arr: string[], tries: number): Promise<(string | null)[] | null> {
  for (let t = 0; t < tries; t++) {
    try {
      const out = await post<{ strings: (string | null)[] }>("/api/translate", { language: lang, strings: arr });
      if (Array.isArray(out.strings) && out.strings.length === arr.length) return out.strings;
    } catch { /* retry below */ }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return null;
}

/** Translate strings in sequential chunks of 24, retrying each once. Failures come back as null. */
export async function translate(lang: string, arr: string[]): Promise<(string | null)[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < arr.length; i += 24) chunks.push(arr.slice(i, i + 24));
  const res: (string | null)[] = [];
  for (const c of chunks) {
    const r = await tr1(lang, c, 2);
    res.push(...(r ?? c.map(() => null)));
  }
  return res;
}

function flushUI() {
  if (busy || !missing.size) return;
  const lang = get().lang;
  if (isLocal(lang)) { missing.clear(); return; }
  const keys = [...missing];
  missing.clear();
  busy = true;
  set({ translating: true });
  translate(lang, keys).then((res) => {
    cache[lang] = cache[lang] || {};
    keys.forEach((k, i) => {
      const v = res[i];
      if (v) cache[lang][k] = v; else failed.add(lang + "|" + k);
    });
    busy = false;
    set((s) => ({ translating: false, trVersion: s.trVersion + 1 }));
    if (missing.size) flushUI();
  });
}

/** Translate every visible string inside assistant messages, in place. */
export async function translateMsgs(msgs: Msg[]): Promise<Msg[]> {
  const lang = get().lang;
  if (isLocal(lang)) return msgs;
  const refs: [Record<string, unknown> | unknown[], string | number][] = [];
  for (const m of msgs) {
    const o = m as unknown as Record<string, unknown>;
    if (m.kind === "text" || m.kind === "source") refs.push([o, "text"]);
    if (m.kind === "status" && m.nextLabel) refs.push([o, "nextLabel"]);
    if (m.kind === "summary") refs.push([o, "goal"]);
    if (m.kind === "link") refs.push([o, "label"]);
    if (m.t) Object.keys(m.t).forEach((k) => refs.push([m.t!, k]));
    if (m.kind === "checklist") m.items.forEach((_, i) => refs.push([m.items, i]));
    if (m.kind === "summary" || m.kind === "handoff") m.fields.forEach((_, i) => refs.push([m.fields, i]));
  }
  if (!refs.length) return msgs;
  const out = await translate(lang, refs.map(([o, k]) => (o as any)[k] as string));
  refs.forEach(([o, k], i) => { if (out[i]) (o as any)[k] = out[i]; });
  return msgs;
}

/** Classify a free-text question in a non-local language. Throws on failure. */
export async function classify(text: string): Promise<string> {
  const out = await post<{ code: string }>("/api/classify", { language: get().lang, text });
  return out.code;
}
