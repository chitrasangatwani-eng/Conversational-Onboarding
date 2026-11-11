import { get, set } from "./store";
import { L, isLocal, translateMsgs, classify } from "./i18n";
import { aiAnswers, post } from "./api";
import { createHandoff } from "./handoff";

const defaultL = L;
import type { Msg, StatusRow, CardText } from "./types";
import { speakMsgs, stopSpeak, listenAgain } from "./voice";
import { goSecure, idStepLabel, openFees } from "./flow";
import { KB, type KbId } from "./kb";

// The assistant only reads verified state and approved content. Replies are
// fixed, cited copy chosen by intent; nothing here approves or changes the
// application. Free text in a non-local language is classified by Claude via
// the proxy; everything else is matched locally.

let uid = 0;
type NewMsg = Msg extends infer M ? (M extends Msg ? Omit<M, "id"> : never) : never;
const mk = (m: NewMsg): Msg => ({ ...m, id: ++uid }) as Msg;

export function add(m: Msg) {
  set((s) => ({ msgs: [...s.msgs, m] }));
}
export const say = (text: string) => mk({ kind: "text", text });
const user = (text: string) => mk({ kind: "text", text, mine: true });
const lk = (label: string, act: () => void) => mk({ kind: "link", label, act });

const OK = "oklch(0.45 0.09 175)", WARN = "oklch(0.45 0.09 50)", MUTED = "#6b7370";

const PAN_RE = /[a-z]{5}\d{4}[a-z]/i;
const LONG_DIGITS_RE = /\d[\d\s-]{6,}/;
export const isSensitive = (t: string) => LONG_DIGITS_RE.test(t) || PAN_RE.test(t);
export const maskSensitive = (t: string) => t
  .replace(/\d[\d\s-]{6,}/g, "••••")
  .replace(/[a-z]{5}\d{4}[a-z]/gi, "••••")
  .replace(/\b(password|passcode|pwd|pin(?!\s*code)|cvv|otp)(\s*(?:is|:|=)?\s*)\S+/gi, "$1$2••••")
  .replace(/\b\d{4,6}\b/g, "••••");

/** Show a user turn, then the reply (which may still be resolving), translated and read aloud. */
export function ask(label: string, reply: Msg[] | Promise<Msg[]>) {
  let msgs = reply;
  if (get().down) {
    msgs = Promise.resolve(reply).then((ms) => (ms.some((m) => m.kind === "summary" || m.kind === "handoff") ? ms : fallback()));
  }
  add(user(label));
  set({ typing: true });
  stopSpeak();
  Promise.all([new Promise((r) => setTimeout(r, 700)), Promise.resolve(msgs).then(translateMsgs)]).then(([, ms]) => {
    set((s) => ({ typing: false, msgs: [...s.msgs, ...ms] }));
    speakMsgs(ms, listenAgain);
  });
}

/** Step-aware opening line for voice help. */
export function contextTip(): string {
  const q = get();
  let t: string;
  if (q.selfie === "rejected") t = L("Your Video KYC call dropped. That's usually low light or a weak connection. Want to retry or get a call back?", "आपकी वीडियो KYC कॉल कट गई। आमतौर पर यह कम रोशनी या कमज़ोर कनेक्शन से होता है। दोबारा कोशिश करें?");
  else if (q.id === "rejected") t = L("Your last identity step didn't go through. Ask me why and I'll walk you through the fix.", "आपका पिछला पहचान चरण पूरा नहीं हुआ। मुझसे पूछें क्यों, मैं ठीक करने में मदद करूँगा।");
  else if (q.mob !== "done") t = L("You're verifying your mobile number. Use the number linked to your Aadhaar, then enter the OTP we send.", "आप मोबाइल नंबर सत्यापित कर रहे हैं। आधार से जुड़ा नंबर इस्तेमाल करें, फिर हमारा भेजा OTP डालें।");
  else if (q.det !== "done") t = L("You're on personal details. Your name and date of birth are filled in. Check they match your PAN, then add your email and PIN code.", "आप व्यक्तिगत विवरण पर हैं। नाम और जन्मतिथि भरी हुई है। जाँचें कि वे PAN से मिलते हैं, फिर ईमेल और पिन कोड जोड़ें।");
  else if (q.id !== "done") t = L("You're on identity proof. Any one document works: PAN, Aadhaar, passport, voter ID, driving licence, NREGA job card or NPR letter.", "आप पहचान प्रमाण पर हैं। कोई भी एक दस्तावेज़ चलेगा: PAN, आधार, पासपोर्ट, वोटर ID, ड्राइविंग लाइसेंस, NREGA जॉब कार्ड या NPR पत्र।");
  else if (q.addr !== "done") t = L("You're on address proof. Any ID that shows your current address works, or a recent utility bill for now.", "आप पते के प्रमाण पर हैं। मौजूदा पता दिखाने वाली कोई भी ID चलेगी, या अभी के लिए हाल का बिजली-पानी का बिल।");
  else if (q.selfie !== "done") t = L("Next is Video KYC, a short live call. Keep your PAN card in hand and sit in good light.", "अगला चरण वीडियो KYC है, एक छोटी लाइव कॉल। PAN कार्ड हाथ में रखें और अच्छी रोशनी में बैठें।");
  else t = L("You're at the last step. Check your details and confirm to submit.", "आप आखिरी चरण पर हैं। विवरण जाँचें और सबमिट की पुष्टि करें।");
  return t + " " + L("Ask me anything, or say: what's left?", "कुछ भी पूछें, या कहें: क्या बाकी है?");
}

export async function greet() {
  const m = await translateMsgs([say(contextTip())]);
  add(m[0]);
  speakMsgs(m, listenAgain);
}

/** Shared card labels, translated together with each message. */
function T(): CardText {
  return {
    title: L("Your application", "आपका आवेदन"),
    stamp: get().data === "stale" ? L("as of 20 min ago · may be out of date", "20 मिनट पहले की जानकारी · पुरानी हो सकती है") : L("verified 14s ago", "14 सेकंड पहले सत्यापित"),
    sm1: L("Review what we'll share", "देखें हम क्या साझा करेंगे"),
    sm2: L("Your goal (you can edit)", "आपका लक्ष्य (बदल सकते हैं)"),
    sm3: L("Send summary and connect", "सारांश भेजें और जुड़ें"),
    sm4: L("Connect without summary", "सारांश के बिना जुड़ें"),
    sm5: L("You can decline. Nothing is sent until you confirm.", "आप मना कर सकते हैं। आपकी पुष्टि तक कुछ नहीं भेजा जाएगा।"),
    yes: L("Helpful", "काम का"),
    no: L("Not helpful", "काम का नहीं"),
    before: L("Before you retry", "दोबारा कोशिश से पहले"),
    note: L("I can't promise a re-review outcome. A new photo is checked again as normal.", "मैं पुनः समीक्षा के नतीजे का वादा नहीं कर सकता। नई फ़ोटो की जाँच सामान्य तरीके से होगी।"),
    retry: L("Retry upload", "फिर से अपलोड करें"),
    s1: L("That looks like a PAN or Aadhaar number.", "यह PAN या आधार नंबर जैसा लग रहा है।"),
    s2: L("I didn't send or store it. Please enter PAN, Aadhaar and bank details only in the secure form.", "मैंने इसे न भेजा, न सहेजा। PAN, आधार और बैंक की जानकारी सिर्फ़ सुरक्षित फ़ॉर्म में डालें।"),
    s3: L("Open secure form", "सुरक्षित फ़ॉर्म खोलें"),
    h1: L("Connecting you to a person", "आपको एक व्यक्ति से जोड़ा जा रहा है"),
    h2: L("Position in queue: 3", "कतार में स्थान: 3"),
    h3: L("Estimated wait: 8 minutes. You can keep using the app.", "अनुमानित प्रतीक्षा: 8 मिनट। आप ऐप इस्तेमाल करते रह सकते हैं।"),
    h4: L("Shared with the agent so you don't repeat yourself:", "एजेंट को यह जानकारी दी जा रही है ताकि आपको दोहराना न पड़े:"),
    h5: L("Not shared: PAN/Aadhaar numbers, documents, photos.", "साझा नहीं: PAN/आधार नंबर, दस्तावेज़, फ़ोटो।"),
    c1: L("Call me back instead", "मुझे फ़ोन करें"),
    c2: L("Find an assisted centre", "सहायता केंद्र खोजें"),
  };
}

export function statusRows(): StatusRow[] {
  const q = get(), id = q.id;
  const r = (glyph: string, label: string, state: string, color: string): StatusRow => ({ glyph, label, state, color });
  const idl = idStepLabel(q);
  const pan =
    id === "done" ? r("✓", idl, "Done", OK)
    : id === "rejected" ? r("!", idl, "Needs action", WARN)
    : id === "pending" ? r("…", idl, "Pending", MUTED)
    : q.det !== "done" ? r("·", idl, "Next", MUTED)
    : r("→", idl, "Action needed", OK);
  const a = q.addr;
  const addr =
    a === "done" ? r("✓", "Address proof", "Done", OK)
    : a === "pending" ? r("…", "Address proof", "Pending", MUTED)
    : id === "done" ? r("→", "Address proof", "Action needed", OK) : r("·", "Address proof", "Next", MUTED);
  const sf = q.selfie;
  const vk =
    sf === "rejected" ? r("!", "Video KYC", "Needs action", WARN)
    : sf === "done" ? r("✓", "Video KYC", "Done", OK)
    : sf === "pending" ? r("…", "Video KYC", "Pending", MUTED)
    : q.addr === "done" ? r("→", "Video KYC", "Action needed", OK) : r("·", "Video KYC", "Next", MUTED);
  return [
    q.mob === "done" ? r("✓", "Mobile number", "Done", OK) : r("→", "Mobile number", "Action needed", OK),
    q.det === "done" ? r("✓", "Personal details", "Done", OK) : q.mob === "done" ? r("→", "Personal details", "Action needed", OK) : r("·", "Personal details", "Next", MUTED),
    pan, addr, vk,
  ];
}

const src = (en: string, hi: string, ref: string, ver: string): Msg[] =>
  [mk({ kind: "source", text: L(en, hi), src: L("Source: ", "स्रोत: ") + ref, ver, t: T() })];
/** An approved answer from the knowledge base, with its source and version. */
const kbMsg = (id: KbId): Msg[] => { const k = KB[id]; return src(k.en, k.hi, k.ref, k.ver); };
/** An answer written by the AI from one approved entry, cited to that entry. Already in the applicant's language. */
export const aiMsg = (text: string, id: KbId): Msg[] => {
  const k = KB[id];
  return [mk({ kind: "source", text, src: L("Source: ", "स्रोत: ") + k.ref, ver: k.ver, t: T(), localized: true })];
};

const talkLabel = () => L("Talk to a person", "किसी व्यक्ति से बात करें");
export const talkLk = () => lk(talkLabel(), () => ask(talkLabel(), intentHandoff()));
export const talkToPerson = () => ask(talkLabel(), intentHandoff());

const centreText = () => L("Assisted centres, such as a Common Service Centre or partner branch, help you finish the same steps in person. It is optional, and your progress is saved.", "सहायता केंद्र, जैसे कॉमन सर्विस सेंटर या पार्टनर शाखा, वही चरण आमने-सामने पूरे करने में मदद करते हैं। यह वैकल्पिक है, और आपकी प्रगति सहेजी गई है।");
const callText = () => L("Okay. We will call your registered mobile in about 8 minutes. You can close the app. Your progress is saved.", "ठीक है। हम लगभग 8 मिनट में आपके रजिस्टर्ड मोबाइल पर फ़ोन करेंगे। आप ऐप बंद कर सकते हैं। आपकी प्रगति सहेजी गई है।");
/** Put a live number into translated copy that carries an example number (e.g. "Position in queue: 3"). */
const withNumber = (text: string, n: number) => text.replace(/\d+/, String(n));
const unavailableMsg = () => say(L("We couldn't reach the support team just now. Your progress is saved. Please try again in a minute.", "हम अभी सहायता टीम तक नहीं पहुँच पाए। आपकी प्रगति सहेजी गई है। कृपया एक मिनट बाद फिर कोशिश करें।"));

/** Ask the support team to call back. Sends no summary unless the applicant already chose to share one. */
async function requestCallback(share = false) {
  const r = await sendHandoff("callback", share);
  add(r.ok ? say(withNumber(callText(), r.waitMinutes)) : r.reason === "sensitive" ? sensitiveGoalMsg() : unavailableMsg());
}
const feesLk = () => lk(L("Open fees and terms", "शुल्क और शर्तें खोलें"), () => openFees());

export function fallback(): Msg[] {
  return [
    say(L("The assistant is unavailable right now, so I can't answer. Your application and progress are not affected. You can keep going with the steps on the home screen, read the fee sheet, or talk to a person.", "सहायक अभी उपलब्ध नहीं है, इसलिए मैं जवाब नहीं दे सकता। आपके आवेदन और प्रगति पर कोई असर नहीं है। आप होम स्क्रीन के चरण जारी रख सकते हैं, शुल्क पत्रक पढ़ सकते हैं, या किसी व्यक्ति से बात कर सकते हैं।")),
    feesLk(),
    talkLk(),
  ];
}

export function intentStatus(): Msg[] {
  const q = get(), id = q.id;
  if (q.data === "down") {
    return [
      say(L("I can't read your application status right now, so I won't guess. Your progress is saved. You can try again or talk to a person.", "मैं अभी आपके आवेदन की स्थिति नहीं पढ़ पा रहा, इसलिए अंदाज़ा नहीं लगाऊँगा। आपकी प्रगति सहेजी गई है। आप फिर कोशिश कर सकते हैं या किसी व्यक्ति से बात कर सकते हैं।")),
      lk(L("Try again", "फिर कोशिश करें"), () => { set({ data: "fresh" }); ask(L("What's left?", "क्या बाकी है?"), intentStatus()); }),
      talkLk(),
    ];
  }
  const pend = id === "pending" || (id === "done" && q.addr === "pending") || (q.addr === "done" && (q.selfie === "pending" || q.selfie === "done"));
  const nl =
    q.mob !== "done" ? L("Verify mobile number", "मोबाइल नंबर सत्यापित करें")
    : q.det !== "done" ? L("Fill personal details", "व्यक्तिगत विवरण भरें")
    : q.addr === "done" ? L("Start Video KYC", "वीडियो KYC शुरू करें")
    : id === "done" ? L("Upload address proof", "पते का प्रमाण अपलोड करें")
    : id === "rejected" ? L("Try identity again", "पहचान फिर से सत्यापित करें")
    : L("Verify your identity", "अपनी पहचान सत्यापित करें");
  return [
    say(pend ? L("Your submission is with verification. Nothing else is needed from you right now.", "आपका जमा किया हुआ सत्यापन में है। अभी आपको कुछ और करने की ज़रूरत नहीं है।") : L("Here's what the system shows right now.", "सिस्टम में अभी यह दिख रहा है।")),
    mk({ kind: "status", t: T(), rows: statusRows(), ...(pend ? {} : { nextLabel: L("Next: ", "अगला: ") + nl, act: () => goSecure() }) }),
  ];
}

export const intentDocs = () => kbMsg("docs");
export const intentAddr = () => kbMsg("addr");
export const intentVideo = () => kbMsg("video");
export const intentAadhaar = () => kbMsg("aadhaar");
export const intentName = () => kbMsg("name");
export const intentSafety = () => kbMsg("safety");
export const intentGlossary = () => kbMsg("glossary");
export const intentBranch = () => kbMsg("branch");
export const intentDetails = () => kbMsg("details");

export const intentFees = (): Msg[] => [
  say(L("I don't quote fees myself, so you always see the official numbers. Here is the approved fee sheet.", "मैं खुद शुल्क नहीं बताता, ताकि आप हमेशा आधिकारिक आँकड़े देखें। यह रहा मंज़ूर शुल्क पत्रक।")),
  feesLk(),
];

const intentOtp = (): Msg[] => [say(L("Please do not share OTPs, PINs or passwords in this chat. We will never ask for them, and I cannot use them. If someone asked you for it, stop and tell us.", "कृपया इस चैट में OTP, PIN या पासवर्ड न भेजें। हम इन्हें कभी नहीं माँगते, और मैं इन्हें इस्तेमाल नहीं कर सकता। अगर किसी ने माँगा हो, तो रुकें और हमें बताएँ।"))];

export function intentFix(): Msg[] {
  const q = get();
  if (q.selfie === "rejected") return intentVideoFix();
  return q.reason === "name" ? intentNameFix() : q.reason === "otp" ? intentOtpFix() : intentBlocker();
}

const intentNameFix = (): Msg[] => [
  say(L("The name on your PAN and your Aadhaar doesn't match exactly (ID-310). This is common: an initial, a missing middle name or a spelling difference. Your documents are not being treated as fake. I can't decide whether it is accepted. Your options:", "आपके PAN और आधार पर नाम बिल्कुल एक जैसा नहीं है (ID-310)। यह आम बात है: इनिशियल, बीच का नाम न होना या स्पेलिंग का फ़र्क। आपके दस्तावेज़ नकली नहीं माने जा रहे। यह स्वीकार होगा या नहीं, यह मैं तय नहीं कर सकता। आपके विकल्प:")),
  lk(L("Use DigiLocker or add a supporting document", "DigiLocker इस्तेमाल करें या सहायक दस्तावेज़ जोड़ें"), () => goSecure()),
  talkLk(),
];

const intentOtpFix = (): Msg[] => [
  say(L("We couldn't send the Aadhaar OTP (ID-120). It goes only to the mobile number linked to your Aadhaar. If you don't have that phone or number, you can still continue:", "आधार का OTP नहीं भेजा जा सका (ID-120)। यह सिर्फ़ आधार से जुड़े मोबाइल नंबर पर जाता है। अगर वह फ़ोन या नंबर आपके पास नहीं है, तब भी आप आगे बढ़ सकते हैं:")),
  lk(L("Verify with DigiLocker or another document", "DigiLocker या दूसरे दस्तावेज़ से सत्यापित करें"), () => goSecure()),
  lk(L("Find an assisted centre", "सहायता केंद्र खोजें"), () => add(say(centreText()))),
  talkLk(),
];

const intentVideoFix = (): Msg[] => [
  say(L("Video KYC didn't complete (VK-301). Usual reasons: low light, a weak connection, or your face not matching your documents. Try a bright spot facing a window, stronger Wi-Fi or 4G, and remove glare from glasses or a cap. Your documents are fine.", "वीडियो KYC पूरा नहीं हुआ (VK-301)। आम वजहें: कम रोशनी, कमज़ोर कनेक्शन, या चेहरे का दस्तावेज़ों से न मिलना। खिड़की के सामने रोशनी में बैठें, बेहतर Wi-Fi या 4G लें, और चश्मे की चमक या टोपी हटाएँ। आपके दस्तावेज़ ठीक हैं।")),
  lk(L("Retry Video KYC", "वीडियो KYC दोबारा करें"), () => goSecure()),
  lk(L("Call me back instead", "मुझे फ़ोन करें"), () => requestCallback()),
  talkLk(),
];

export const intentHeld = (): Msg[] => [
  say(L("Some applications get an extra check, for example after several attempts or from a new location. It doesn't mean anything is wrong, and it isn't a rejection. I can't see or explain the reason. A person reviews it and we will message you. You don't need to do anything now.", "कुछ आवेदनों की अतिरिक्त जाँच होती है, जैसे कई कोशिशों के बाद या नई जगह से। इसका मतलब यह नहीं कि कुछ गलत है, और यह अस्वीकृति नहीं है। मैं इसकी वजह न देख सकता हूँ, न बता सकता हूँ। एक व्यक्ति इसकी समीक्षा करता है और हम आपको संदेश भेजेंगे। अभी आपको कुछ करने की ज़रूरत नहीं है।")),
  talkLk(),
];

function intentBlocker(): Msg[] {
  return [
    say(L("Your PAN card photo didn't pass the image quality check (ID-204). It was likely blurry or had glare. Nothing about you was rejected. Try this:", "आपकी PAN कार्ड फ़ोटो इमेज क्वालिटी जाँच (ID-204) में पास नहीं हुई। शायद वह धुंधली थी या उस पर चमक थी। आपके बारे में कुछ अस्वीकार नहीं हुआ। यह आज़माएँ:")),
    mk({
      kind: "checklist", t: T(), act: () => goSecure(),
      items: [
        L("Place the PAN card on a dark, flat surface", "PAN कार्ड को गहरे, समतल सतह पर रखें"),
        L("Use even light with no glare", "एक-सी रोशनी रखें, चमक न आए"),
        L("All four corners and the PAN number readable", "चारों कोने और PAN नंबर साफ़ पढ़े जाएँ"),
        L("Hold steady until the frame turns green", "फ़्रेम हरा होने तक हाथ स्थिर रखें"),
      ],
    }),
  ];
}

export function intentApproval(): Msg[] {
  const id = get().id;
  return [
    say(L("I can't tell you whether you'll be approved. Only the verification system decides that, and I won't guess. What I can confirm: your ID step is ", "आपका आवेदन मंज़ूर होगा या नहीं, यह मैं नहीं बता सकता। यह सिर्फ़ सत्यापन प्रणाली तय करती है, और मैं अंदाज़ा नहीं लगाऊँगा। मैं इतना बता सकता हूँ: आपका पहचान चरण ") +
      (id === "pending" ? L("pending review.", "समीक्षा में है।") : id === "rejected" ? L("waiting on a new photo.", "नई फ़ोटो का इंतज़ार कर रहा है।") : id === "done" ? L("verified.", "सत्यापित है।") : L("not submitted yet.", "अभी जमा नहीं हुआ।"))),
    mk({ kind: "status", t: T(), rows: statusRows() }),
  ];
}

export const intentAbstain = (): Msg[] => [say(L("I don't have approved information on that, so I won't guess. I can connect you to a person who can answer.", "इस बारे में मेरे पास मंज़ूर जानकारी नहीं है, इसलिए मैं अंदाज़ा नहीं लगाऊँगा। मैं आपको ऐसे व्यक्ति से जोड़ सकता हूँ जो जवाब दे सके।"))];

export const goalDefault = () => L("Finish opening my account today", "आज अपना खाता खुलवाना पूरा करना");

type Tr = (en: string, hi: string) => string;
const EN: Tr = (en) => en;

function summaryFields(L: Tr = defaultL): string[] {
  const q = get(), none = L("none", "कोई नहीं");
  const stage =
    q.mob !== "done" ? L("Mobile number", "मोबाइल नंबर")
    : q.det !== "done" ? L("Personal details", "व्यक्तिगत विवरण")
    : q.id !== "done" ? idStepLabel(q, L)
    : q.addr !== "done" ? L("Address proof", "पते का प्रमाण")
    : q.selfie !== "done" ? L("Video KYC", "वीडियो KYC")
    : L("Review and submit", "समीक्षा और सबमिट");
  const blk = q.selfie === "rejected" ? "VK-301" : q.id === "rejected" ? ({ blur: "ID-204", name: "ID-310", otp: "ID-120" } as Record<string, string>)[q.reason] || "ID-204" : none;
  return [
    L("Applicant: Chitra Sangatwani", "आवेदक: Chitra Sangatwani"),
    L("Current step: ", "मौजूदा चरण: ") + stage,
    L("Status snapshot, verified just now", "स्थिति का स्नैपशॉट, अभी सत्यापित"),
    L("Error code: ", "त्रुटि कोड: ") + blk,
    L("Actions tried: ", "आज़माए गए कदम: ") + (blk === none ? none : L("1 upload or call attempt", "1 अपलोड या कॉल कोशिश")),
  ];
}

/** Handoff starts with a summary the applicant reviews; nothing is sent until they choose. */
export function intentHandoff(): Msg[] {
  return [mk({
    kind: "summary", t: T(), fields: summaryFields(), goal: goalDefault(),
    confirmAct: () => ask(L("Send summary and connect", "सारांश भेजें और जुड़ें"), connect(true)),
    declineAct: () => ask(L("Connect without summary", "सारांश के बिना जुड़ें"), connect(false)),
  })];
}

const sensitiveGoalMsg = () => say(L("Your goal has a number that looks like an ID, phone number or OTP, so I didn't send anything. Please remove it and try again.", "आपके लक्ष्य में एक नंबर है जो ID, फ़ोन नंबर या OTP जैसा लगता है, इसलिए मैंने कुछ नहीं भेजा। कृपया उसे हटाकर फिर कोशिश करें।"));

/** Create the handoff ticket. The agent gets the summary in English; the applicant's goal is sent as typed. */
function sendHandoff(kind: "chat" | "callback", share: boolean) {
  const q = get();
  return createHandoff({
    kind, share, language: q.lang, mobileToken: q.mobToken,
    summary: summaryFields(EN), goal: q.hgoal || goalDefault(),
  });
}

async function connect(share: boolean): Promise<Msg[]> {
  const r = await sendHandoff("chat", share);
  if (!r.ok) return r.reason === "sensitive" ? [sensitiveGoalMsg()] : [unavailableMsg(), talkLk()];
  const t = T();
  t.h2 = withNumber(t.h2, r.position);
  t.h3 = withNumber(t.h3, r.waitMinutes);
  return [mk({
    kind: "handoff", t, ref: r.ticketId,
    callAct: () => requestCallback(share),
    centreAct: () => add(say(centreText())),
    fields: share
      ? [...summaryFields(), L("Your goal: ", "आपका लक्ष्य: ") + (get().hgoal || goalDefault())]
      : [L("No summary shared. The agent will ask about your case.", "कोई सारांश साझा नहीं हुआ। एजेंट आपके मामले के बारे में पूछेगा।")],
  })];
}

/** Local intent match for English, Hindi and Hinglish. */
export function route(text: string): Msg[] {
  const q = get(), t = text.toLowerCase();
  if (/^\D{0,12}\d{4,6}\D{0,3}$/.test(text.trim()) || /\b(pin(?!\s*code)|cvv|password)\b/.test(t)) return intentOtp();
  if (isSensitive(text)) return [mk({ kind: "secure", t: T(), act: () => goSecure() })];
  if (/approv|will i get|chance|मंज़ूर|मंजूर|स्वीकृत|अप्रूव|manzoor/.test(t)) return intentApproval();
  if (/person|human|agent|someone|insaan|baat|व्यक्ति|इंसान|एजेंट|बात/.test(t)) return intentHandoff();
  if (/fee|charge|cost|price|शुल्क|फीस|फ़ीस/.test(t)) return q.mvp ? intentAbstain() : intentFees();
  if (/rate|interest|ब्याज/.test(t)) return intentAbstain();
  if (/safe|scam|fraud|privacy|data|trust|सुरक्षित|धोखा|डेटा|भरोसा/.test(t)) return intentSafety();
  if (/branch|visit|offline|in person|शाखा|जाना/.test(t)) return intentBranch();
  if (/what is|what's|what does|\bmean|matlab|kya hai|kya hota|explain|मतलब|क्या है|क्या होता/.test(t) && /kyc|\bpan\b|aadhaar|aadhar|आधार|पैन|केवाईसी/.test(t) && !/need|chahiye|चाहिए|instead|both|dono|दोनों/.test(t)) return intentGlossary();
  if (/otp|link|mobile|लिंक|ओटीपी|मोबाइल/.test(t)) return intentAadhaar();
  if (/name|naam|mismatch|नाम|अलग/.test(t)) return intentName();
  if (/e-?mail|date of birth|\bdob\b|birth|pin ?code|why .*(need|ask).*detail|ईमेल|जन्म|पिन कोड/.test(t)) return intentDetails();
  if (q.held && /extra|additional|flag|hold|अतिरिक्त/.test(t)) return intentHeld();
  if (/reject|fail|blur|why|error|204|kyun|क्यों|अस्वीकार|रिजेक्ट/.test(t)) return q.id === "rejected" || q.selfie === "rejected" ? intentFix() : intentStatus();
  if (/left|status|next|progress|where|baki|aage|बाकी|स्थिति|आगे/.test(t)) return intentStatus();
  if (/selfie|video|kyc|face|liveness|वीडियो|केवाईसी/.test(t)) return intentVideo();
  if (/address|utility|electricity|bill|tax receipt|pension|rent|pata|पता|पते|बिल/.test(t) || (q.id === "done" && /document|accept|proof/.test(t))) return intentAddr();
  if (/id|passport|licen|document|accept|proof|voter|nrega|job card|npr|population register|pan|aadhaar|aadhar|digilocker|आधार|पैन|दस्तावेज|पासपोर्ट|वोटर/.test(t)) return intentDocs();
  return intentAbstain();
}

// Suggested questions and their answers, matched against translated labels.
const CHIP_INTENTS: [string, () => Msg[]][] = [
  ["What's left?", () => intentStatus()], ["How does Video KYC work?", () => intentVideo()],
  ["What counts as address proof?", () => intentAddr()], ["What do I need for identity?", () => intentDocs()],
  ["Why do you need these details?", () => intentDetails()], ["Which mobile number do I use?", () => intentAadhaar()],
  ["Why did this fail?", () => intentFix()], ["Why an extra check?", () => intentHeld()],
  ["Aadhaar not linked to my mobile", () => intentAadhaar()], ["Name differs on PAN and Aadhaar", () => intentName()],
  ["What is KYC?", () => intentGlossary()], ["Is my data safe?", () => intentSafety()],
  ["Do I need to visit a branch?", () => intentBranch()], ["What are the fees?", () => (get().mvp ? intentAbstain() : intentFees())],
  ["Will I be approved?", () => intentApproval()], ["Talk to a person", () => intentHandoff()],
];
const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, " ").trim();

function matchChip(text: string): (() => Msg[]) | null {
  const t = norm(text);
  if (t.length < 2) return null;
  let best: (() => Msg[]) | null = null, bestLen = 0;
  for (const [en, fn] of CHIP_INTENTS) {
    const label = norm(L(en, en));
    if (label.length < 2 || label === norm(en)) continue; // untranslated: leave to the classifier
    const hit = t.includes(label) || (t.length >= 4 && label.includes(t));
    if (hit && label.length > bestLen) { best = fn; bestLen = label.length; }
  }
  return best;
}

type Answer = { type: "answer"; text: string; source: KbId } | { type: "action"; action: "status" | "approval" | "fees" | "handoff" | "fix" } | { type: "abstain" };

/** Ask the AI (Groq, through our server). It answers only from the approved knowledge base. Throws on failure. */
async function askAI(text: string): Promise<Msg[]> {
  const q = get();
  const step = steps(q);
  const r = await post<Answer>("/api/answer", { language: q.lang, question: text, step, progress: progressText(q) });
  if (r.type === "answer") return [...aiMsg(r.text, r.source), talkLk()];
  if (r.type === "action") {
    const m: Record<string, () => Msg[]> = {
      status: intentStatus, approval: intentApproval, handoff: intentHandoff,
      fees: () => (get().mvp ? intentAbstain() : intentFees()),
      fix: () => (q.id === "rejected" || q.selfie === "rejected" ? intentFix() : intentStatus()),
    };
    return (m[r.action] ?? intentAbstain)();
  }
  return [...intentAbstain(), talkLk()];
}
/** The applicant's current step, by name only (nothing personal), to give the AI context. */
function steps(q: ReturnType<typeof get>): string {
  return q.mob !== "done" ? "Mobile number" : q.det !== "done" ? "Personal details" : q.id !== "done" ? "Identity proof"
    : q.addr !== "done" ? "Address proof" : q.selfie !== "done" ? "Video KYC" : "Review and submit";
}
/** Where the applicant is, by step names and statuses only (nothing personal), so "what next" style answers fit. */
function progressText(q: ReturnType<typeof get>): string {
  const st = (v: string) => (v === "done" ? "done" : v === "pending" ? "being checked" : v === "rejected" ? "not accepted, needs a retry" : "not started");
  const id = q.ovd ? idStepLabel(q) : "Identity proof";
  return `Mobile or email: ${st(q.mob)}. Personal details: ${st(q.det)}. ${id}: ${st(q.id)}. Address proof: ${st(q.addr)}. Video KYC: ${st(q.selfie)}.${q.submitted ? " Application submitted." : ""}`;
}

/**
 * Route a question. Sensitive text never leaves the device.
 * - Personal numbers, OTPs, PINs and passwords are handled on the device and never sent anywhere.
 * - Approval, fees, status, fixes and handoff always end in the app's own cards (the AI hands them back).
 * - With the AI on (Groq), every other question goes to it first: knowledge questions get a short,
 *   plain answer written from the approved entries and cited; anything it can't ground becomes
 *   "I won't guess".
 * - Without the AI, or if it fails, the keyword rules answer with the approved text as written.
 */
export async function routeAsync(text: string): Promise<Msg[]> {
  const q = get();
  if (isSensitive(text) || /^\D{0,12}\d{4,6}\D{0,3}$/.test(text.trim()) || /\b(pin(?!\s*code)|cvv|password)\b/i.test(text)) return route(text);
  // With the AI on, it reads every question first (in any language) and hands
  // personal-application questions back to the app's cards. The keyword rules
  // are only the fallback, because they misread questions like "Will I get the
  // OTP on email?" (approval) or "Why do I need Video KYC?" (status).
  if (aiAnswers()) {
    try { return await askAI(text); } catch { /* fall back to the rules */ }
  }
  if (isLocal(q.lang)) return route(text);
  // Without the AI, a question that matches a suggested question in this language still gets its answer.
  const byChip = matchChip(text);
  if (byChip) return byChip();
  try {
    const c = await classify(text);
    if (c === "blocker") return q.id === "rejected" || q.selfie === "rejected" ? intentFix() : intentStatus();
    if (c === "fees" && get().mvp) return intentAbstain();
    const m: Record<string, () => Msg[]> = {
      safety: intentSafety, glossary: intentGlossary, branch: intentBranch, fees: intentFees, status: intentStatus,
      docs: intentDocs, addr: intentAddr, video: intentVideo, aadhaar: intentAadhaar, name: intentName,
      approval: intentApproval, handoff: intentHandoff,
    };
    return (m[c] ?? intentAbstain)();
  } catch {
    return intentAbstain();
  }
}

/** Send whatever is in the draft box. */
export function sendDraft() {
  const t = get().draft.trim();
  if (!t) return;
  set({ draft: "" });
  ask(maskSensitive(t), routeAsync(t));
}
