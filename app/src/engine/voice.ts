import { get, set, type Field } from "./store";
import { L, speechLang } from "./i18n";
import type { Msg } from "./types";
import { ask, add, say, routeAsync, maskSensitive } from "./assistant";

// Browser speech: recognition for questions and field dictation, synthesis
// for read-aloud. Both are optional; everything works by typing.

type Rec = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: (e: any) => void; onerror: (e: any) => void; onend: () => void;
  start(): void; stop(): void;
};

function Recognition(): (new () => Rec) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

let rec: Rec | null = null;
let tok = 0;

export function stopSpeak() {
  tok++;
  if (get().speaking) set({ speaking: false });
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

export function stopListen() {
  if (rec) { try { rec.stop(); } catch { /* ignore */ } }
}

/** Text a card would read aloud. */
function spoken(m: Msg, vmode: boolean): string | null {
  switch (m.kind) {
    case "text": case "source": return m.text;
    case "status": return m.rows.map((r) => r.label + ", " + r.state).join(". ");
    case "summary": return m.t!.sm1 + ". " + m.fields.join(". ") + ". " + m.t!.sm5;
    case "secure": return m.t!.s1 + " " + m.t!.s2;
    case "handoff": return m.t!.h1 + ". " + m.t!.h2 + ". " + m.t!.h3;
    case "checklist": return m.items.join(". ");
    case "link": return vmode ? L("You can tap: ", "आप टैप कर सकते हैं: ") + m.label : null;
  }
}

export function speakMsgs(msgs: Msg[], cb?: () => void) {
  if (!get().speak || !window.speechSynthesis) { if (cb) setTimeout(cb, 400); return; }
  const vmode = get().vmode;
  const parts = msgs.map((m) => spoken(m, vmode)).filter((p): p is string => !!p);
  stopSpeak();
  const mine = tok;
  const done = () => { if (mine !== tok) return; set({ speaking: false }); cb?.(); };
  if (!parts.length) { done(); return; }
  set({ speaking: true });
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = speechLang();
    u.rate = 0.95;
    if (i === parts.length - 1) { u.onend = done; u.onerror = done; }
    window.speechSynthesis.speak(u);
  });
}

/** After a reply in voice mode, keep the conversation hands-free. */
export function listenAgain() {
  const s = get();
  if (s.vmode && s.sheet && !s.micBlocked) startListen();
}

export function startListen() {
  const SR = Recognition();
  stopSpeak();
  if (!SR) {
    add(say(L("Voice input isn't supported in this browser. Please type, or try Chrome.", "इस ब्राउज़र में आवाज़ से बोलना उपलब्ध नहीं है। कृपया टाइप करें, या Chrome आज़माएँ।")));
    return;
  }
  const r = new SR();
  rec = r;
  r.lang = speechLang();
  r.interimResults = true;
  r.continuous = false;
  let final = "";
  r.onresult = (e) => {
    let t = "";
    for (let i = 0; i < e.results.length; i++) {
      t += e.results[i][0].transcript;
      if (e.results[i].isFinal) final = t;
    }
    set({ live: t });
  };
  r.onerror = (e) => {
    const blocked = e.error === "not-allowed" || e.error === "service-not-allowed";
    if (e.error !== "aborted") {
      set({
        micErr:
          e.error === "no-speech" ? L("I didn't hear anything. Tap and try again.", "मुझे कुछ सुनाई नहीं दिया। टैप करके फिर कोशिश करें।")
          : e.error === "audio-capture" ? L("No microphone found on this device.", "इस डिवाइस पर माइक्रोफ़ोन नहीं मिला।")
          : e.error === "network" ? L("The speech service is unreachable. Check your connection, or type below.", "स्पीच सेवा नहीं मिल रही। कनेक्शन जाँचें, या नीचे टाइप करें।")
          : blocked ? "" : "Voice error: " + e.error,
      });
    }
    set({ listening: false, live: "" });
    if (blocked) {
      set({ micBlocked: true });
      add(say(L("Microphone access is blocked. Allow it in your browser, or type instead.", "माइक्रोफ़ोन की अनुमति बंद है। ब्राउज़र में अनुमति दें, या टाइप करें।")));
    }
  };
  r.onend = () => {
    const t = (final || get().live || "").trim();
    set({ listening: false, live: "" });
    if (t) ask(maskSensitive(t), routeAsync(t));
  };
  try { r.start(); set({ listening: true, live: "" }); } catch { set({ listening: false }); }
}

// ---- Field dictation (full scope only) ----

function wordsToDigits(text: string): string {
  const W: Record<string, number> = {
    zero: 0, oh: 0, o: 0, one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    "शून्य": 0, "जीरो": 0, "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "छे": 6, "सात": 7, "आठ": 8, "नौ": 9,
  };
  let out = "", rep = 1;
  text.toLowerCase().split(/[\s,.\-]+/).forEach((tk) => {
    if (/^(double|डबल)$/.test(tk)) rep = 2;
    else if (/^(triple|ट्रिपल)$/.test(tk)) rep = 3;
    else if (/^\d+$/.test(tk)) { out += tk; rep = 1; }
    else if (tk in W) { out += String(W[tk]).repeat(rep); rep = 1; }
  });
  return out;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  "जनवरी": 1, "फरवरी": 2, "मार्च": 3, "अप्रैल": 4, "मई": 5, "जून": 6, "जुलाई": 7, "अगस्त": 8, "सितंबर": 9, "सितम्बर": 9, "अक्टूबर": 10, "नवंबर": 11, "नवम्बर": 11, "दिसंबर": 12, "दिसम्बर": 12,
};

export function parseVoice(field: Field, text: string): string {
  const t0 = (text || "").trim();
  if (!t0) return "";
  if (field === "mobNum" || field === "otp" || field === "dPin") return wordsToDigits(t0).slice(0, field === "mobNum" ? 10 : 6);
  if (field === "dDob") {
    let t = t0.toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, "$1");
    Object.keys(MONTHS).forEach((k) => { t = t.split(k).join(" " + MONTHS[k] + " "); });
    let n: string[] = t.match(/\d+/g) ?? [];
    if (n.length === 1 && n[0].length === 8) n = [n[0].slice(0, 2), n[0].slice(2, 4), n[0].slice(4)];
    if (n.length < 3) return "";
    return n[0].padStart(2, "0") + "/" + n[1].padStart(2, "0") + "/" + n[2];
  }
  if (field === "dEmail") {
    return t0.toLowerCase()
      .replace(/\s+(at the rate of|at the rate|at|एट)\s+/g, "@")
      .replace(/\s+(dot|डॉट)\s+/g, ".")
      .replace(/\s+underscore\s+/g, "_")
      .replace(/\s+(dash|hyphen)\s+/g, "-")
      .replace(/\s+/g, "")
      .replace(/\.$/, "");
  }
  return t0.replace(/[.,]$/, "").replace(/\s+/g, " ").replace(/\b(\p{L})(\p{L}*)/gu, (_m, a: string, b: string) => a.toUpperCase() + b);
}

export function dictate(field: Field) {
  const SR = Recognition();
  const ek = field === "mobNum" ? "mobErr" : field === "otp" ? "otpErr" : "dErr";
  if (get().dictating === field && rec) { try { rec.stop(); } catch { /* ignore */ } return; }
  if (!SR) { set({ [ek]: "Voice input needs a browser with speech recognition, such as Chrome. Please type." }); return; }
  stopSpeak();
  stopListen();
  const r = new SR();
  rec = r;
  r.lang = speechLang();
  r.interimResults = false;
  let heard = "";
  r.onresult = (e) => { heard = Array.from(e.results as ArrayLike<any>).map((x) => x[0].transcript).join(" "); };
  r.onerror = (e) => set({ dictating: "", [ek]: e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone access is blocked. Allow it in your browser, or type." : "" });
  r.onend = () => {
    const v = parseVoice(field, heard);
    set(v ? { dictating: "", [field]: v, [ek]: "" } : { dictating: "", [ek]: heard ? "Sorry, I couldn't catch that. Try again, or type it." : "" });
    if (v && get().speak && window.speechSynthesis && field !== "dEmail") {
      stopSpeak();
      const u = new SpeechSynthesisUtterance(L("You said ", "आपने कहा ") + (/^(mobNum|otp|dPin)$/.test(field) ? v.split("").join(" ") : v));
      u.lang = speechLang();
      window.speechSynthesis.speak(u);
    }
  };
  try { r.start(); set({ dictating: field }); } catch { set({ dictating: "" }); }
}
