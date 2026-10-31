import { get, set } from "./store";
import { L, isLocal, translateMsgs, classify } from "./i18n";
import type { Msg, StatusRow, CardText } from "./types";
import { speakMsgs, stopSpeak, listenAgain } from "./voice";
import { goSecure, openFees } from "./flow";

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
export const maskSensitive = (t: string) => t.replace(/\d[\d\s-]{6,}/g, "••••").replace(/[a-z]{5}\d{4}[a-z]/gi, "••••");

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
  else if (q.id !== "done") t = L("You're on the PAN step. Take a clear photo on a flat, dark surface, or fetch it from DigiLocker.", "आप PAN चरण पर हैं। समतल, गहरी सतह पर साफ़ फ़ोटो लें, या DigiLocker से लाएँ।");
  else if (q.addr !== "done") t = L("You're on address proof. Aadhaar, passport, voter ID or driving licence all work.", "आप पते के प्रमाण पर हैं। आधार, पासपोर्ट, वोटर ID या ड्राइविंग लाइसेंस चलेगा।");
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
  const pan =
    id === "done" ? r("✓", "PAN card", "Done", OK)
    : id === "rejected" ? r("!", "PAN card", "Needs action", WARN)
    : id === "pending" ? r("…", "PAN card", "Pending", MUTED)
    : q.det !== "done" ? r("·", "PAN card", "Next", MUTED)
    : r("→", "PAN card", "Action needed", OK);
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

const talkLabel = () => L("Talk to a person", "किसी व्यक्ति से बात करें");
export const talkLk = () => lk(talkLabel(), () => ask(talkLabel(), intentHandoff()));
export const talkToPerson = () => ask(talkLabel(), intentHandoff());

const centreText = () => L("Assisted centres, such as a Common Service Centre or partner branch, help you finish the same steps in person. It is optional, and your progress is saved.", "सहायता केंद्र, जैसे कॉमन सर्विस सेंटर या पार्टनर शाखा, वही चरण आमने-सामने पूरे करने में मदद करते हैं। यह वैकल्पिक है, और आपकी प्रगति सहेजी गई है।");
const callMsg = () => say(L("Okay. We will call your registered mobile in about 8 minutes. You can close the app. Your progress is saved.", "ठीक है। हम लगभग 8 मिनट में आपके रजिस्टर्ड मोबाइल पर फ़ोन करेंगे। आप ऐप बंद कर सकते हैं। आपकी प्रगति सहेजी गई है।"));
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
    : id === "rejected" ? L("Retake PAN photo", "PAN फ़ोटो दोबारा लें")
    : L("Upload PAN photo", "PAN फ़ोटो अपलोड करें");
  return [
    say(pend ? L("Your submission is with verification. Nothing else is needed from you right now.", "आपका जमा किया हुआ सत्यापन में है। अभी आपको कुछ और करने की ज़रूरत नहीं है।") : L("Here's what the system shows right now.", "सिस्टम में अभी यह दिख रहा है।")),
    mk({ kind: "status", t: T(), rows: statusRows(), ...(pend ? {} : { nextLabel: L("Next: ", "अगला: ") + nl, act: () => goSecure() }) }),
  ];
}

export const intentDocs = () => src("You need your PAN card: a clear photo showing the PAN, your name and date of birth. Your Aadhaar is verified by an OTP to the mobile number linked to it, so you do not upload it. You can also fetch both from DigiLocker.", "आपको PAN कार्ड चाहिए: ऐसी साफ़ फ़ोटो जिसमें PAN, आपका नाम और जन्मतिथि दिखे। आधार का सत्यापन उससे जुड़े मोबाइल नंबर पर OTP से होता है, इसलिए उसे अपलोड नहीं करना है। आप दोनों DigiLocker से भी ला सकते हैं।", "Identity requirements §2", "v3.2 · 12 Sep 2026");
export const intentAddr = () => src("Accepted: Aadhaar (via DigiLocker or OTP), passport, voter ID or driving licence, showing your current address. If the address on your Aadhaar is outdated, use one of the other documents.", "मान्य: आधार (DigiLocker या OTP से), पासपोर्ट, वोटर ID या ड्राइविंग लाइसेंस, जिसमें आपका मौजूदा पता हो। अगर आधार का पता पुराना है, तो बाकी में से कोई एक दस्तावेज़ दें।", "Address proof requirements §1", "v2.4 · 3 Sep 2026");
export const intentVideo = () => src("Video KYC is a short live check with an agent. Keep your original PAN card with you, sit in good light somewhere quiet, and make sure your camera and connection are working. The agent compares you with your documents. I can't see or decide any of it.", "वीडियो KYC एजेंट के साथ एक छोटी लाइव जाँच है। अपना असली PAN कार्ड साथ रखें, शांत जगह पर अच्छी रोशनी में बैठें, और कैमरा व इंटरनेट जाँच लें। एजेंट आपको आपके दस्तावेज़ों से मिलाता है। मैं इसे न देख सकता हूँ, न इसका फ़ैसला कर सकता हूँ।", "Video KYC guidance §1", "v1.3 · 20 Aug 2026");
export const intentAadhaar = () => src("Your Aadhaar OTP goes only to the mobile number linked to your Aadhaar. If it isn't linked, you can update it at an Aadhaar Seva Kendra, or use your PAN photo with a passport, voter ID or driving licence instead. I can connect you to a person if you'd like.", "आधार का OTP सिर्फ़ आधार से जुड़े मोबाइल नंबर पर आता है। अगर नंबर लिंक नहीं है, तो आधार सेवा केंद्र पर अपडेट करा सकते हैं, या PAN फ़ोटो के साथ पासपोर्ट, वोटर ID या ड्राइविंग लाइसेंस दे सकते हैं। चाहें तो मैं आपको किसी व्यक्ति से जोड़ सकता हूँ।", "Identity requirements §4", "v3.2 · 12 Sep 2026");
export const intentName = () => src("Small differences like initials, spelling or word order are often fine. If the names differ a lot, we may ask for a supporting document. A person confirms this, and I can't decide it.", "इनिशियल, स्पेलिंग या नाम के क्रम जैसे छोटे फ़र्क अक्सर चल जाते हैं। अगर नाम काफ़ी अलग हैं, तो हम कोई सहायक दस्तावेज़ माँग सकते हैं। यह एक व्यक्ति तय करता है, मैं नहीं।", "Identity requirements §5", "v3.2 · 12 Sep 2026");
export const intentSafety = () => src("We never ask for your OTP, PIN, password or card details in this chat, and our staff never ask for them on a call. Your PAN, Aadhaar and photos go only through the secure forms, and I cannot see them. If a message or call asks for your OTP, do not share it.", "हम इस चैट में आपका OTP, PIN, पासवर्ड या कार्ड की जानकारी कभी नहीं माँगते, और हमारे कर्मचारी फ़ोन पर भी नहीं माँगते। आपका PAN, आधार और फ़ोटो सिर्फ़ सुरक्षित फ़ॉर्म से जाते हैं, और मैं उन्हें नहीं देख सकता। अगर कोई संदेश या कॉल आपका OTP माँगे, तो उसे न बताएँ।", "Security and privacy notice §1", "v1.1 · 5 Sep 2026");
export const intentGlossary = () => src("KYC (Know Your Customer) is a check that you are who you say you are. Every bank account in India needs it. PAN is your permanent tax number. Aadhaar is your 12-digit ID linked to your mobile. We use them only for this check.", "KYC (अपने ग्राहक को जानें) यह जाँच है कि आप वही हैं जो आप बता रहे हैं। भारत में हर बैंक खाते के लिए यह ज़रूरी है। PAN आपका स्थायी कर नंबर है। आधार आपका 12 अंकों का पहचान नंबर है जो मोबाइल से जुड़ा होता है। हम इन्हें सिर्फ़ इसी जाँच के लिए इस्तेमाल करते हैं।", "Plain-language glossary §1", "v1.0 · 1 Sep 2026");
export const intentBranch = () => src("No. Your application is fully online. If a case ever needs an in-person step, we tell you here before you continue, and you can choose an assisted centre near you. Your progress is always saved.", "नहीं। आपका आवेदन पूरी तरह ऑनलाइन है। अगर कभी किसी मामले में आमने-सामने का कदम ज़रूरी हो, तो हम आगे बढ़ने से पहले यहीं बताएँगे, और आप अपने पास का सहायता केंद्र चुन सकते हैं। आपकी प्रगति हमेशा सहेजी रहती है।", "Account opening FAQ §1", "v1.0 · 1 Sep 2026");
export const intentDetails = () => src("We ask for your name and date of birth exactly as on your PAN, so they match your records and avoid a mismatch later. Your email is for updates, and your PIN code helps with the address check. We use them only for KYC.", "हम आपका नाम और जन्मतिथि बिल्कुल PAN के अनुसार माँगते हैं, ताकि वे आपके रिकॉर्ड से मिलें और आगे नाम में फ़र्क की दिक्कत न हो। ईमेल अपडेट के लिए है, और पिन कोड पते की जाँच में मदद करता है। इनका इस्तेमाल सिर्फ़ KYC के लिए होता है।", "Personal details guidance §1", "v1.0 · 1 Sep 2026");

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
  lk(L("Call me back instead", "मुझे फ़ोन करें"), () => add(callMsg())),
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
    say(L("I can't tell you whether you'll be approved. Only the verification system decides that, and I won't guess. What I can confirm: your ID step is ", "आपका आवेदन मंज़ूर होगा या नहीं, यह मैं नहीं बता सकता। यह सिर्फ़ सत्यापन प्रणाली तय करती है, और मैं अंदाज़ा नहीं लगाऊँगा। मैं इतना बता सकता हूँ: आपका PAN चरण ") +
      (id === "pending" ? L("pending review.", "समीक्षा में है।") : id === "rejected" ? L("waiting on a new photo.", "नई फ़ोटो का इंतज़ार कर रहा है।") : id === "done" ? L("verified.", "सत्यापित है।") : L("not submitted yet.", "अभी जमा नहीं हुआ।"))),
    mk({ kind: "status", t: T(), rows: statusRows() }),
  ];
}

export const intentAbstain = (): Msg[] => [say(L("I don't have approved information on that, so I won't guess. I can connect you to a person who can answer.", "इस बारे में मेरे पास मंज़ूर जानकारी नहीं है, इसलिए मैं अंदाज़ा नहीं लगाऊँगा। मैं आपको ऐसे व्यक्ति से जोड़ सकता हूँ जो जवाब दे सके।"))];

export const goalDefault = () => L("Finish opening my account today", "आज अपना खाता खुलवाना पूरा करना");

function summaryFields(): string[] {
  const q = get(), none = L("none", "कोई नहीं");
  const stage =
    q.mob !== "done" ? L("Mobile verification", "मोबाइल सत्यापन")
    : q.det !== "done" ? L("Personal details", "व्यक्तिगत विवरण")
    : q.id !== "done" ? L("PAN card", "PAN कार्ड")
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
    confirmAct: () => ask(L("Send summary and connect", "सारांश भेजें और जुड़ें"), [handoffCard(true)]),
    declineAct: () => ask(L("Connect without summary", "सारांश के बिना जुड़ें"), [handoffCard(false)]),
  })];
}

function handoffCard(share: boolean): Msg {
  return mk({
    kind: "handoff", t: T(),
    callAct: () => add(callMsg()),
    centreAct: () => add(say(centreText())),
    fields: share
      ? [...summaryFields(), L("Your goal: ", "आपका लक्ष्य: ") + (get().hgoal || goalDefault())]
      : [L("No summary shared. The agent will ask about your case.", "कोई सारांश साझा नहीं हुआ। एजेंट आपके मामले के बारे में पूछेगा।")],
  });
}

/** Local intent match for English, Hindi and Hinglish. */
export function route(text: string): Msg[] {
  const q = get(), t = text.toLowerCase();
  if (/^\D{0,12}\d{4,6}\D{0,3}$/.test(text.trim()) || /\b(pin|cvv|password)\b/.test(t)) return intentOtp();
  if (isSensitive(text)) return [mk({ kind: "secure", t: T(), act: () => goSecure() })];
  if (/approv|will i get|chance|मंज़ूर|मंजूर|स्वीकृत|अप्रूव|manzoor/.test(t)) return intentApproval();
  if (/person|human|agent|someone|insaan|baat|व्यक्ति|इंसान|एजेंट|बात/.test(t)) return intentHandoff();
  if (/fee|charge|cost|price|शुल्क|फीस|फ़ीस/.test(t)) return q.mvp ? intentAbstain() : intentFees();
  if (/rate|interest|ब्याज/.test(t)) return intentAbstain();
  if (/safe|scam|fraud|privacy|data|trust|सुरक्षित|धोखा|डेटा|भरोसा/.test(t)) return intentSafety();
  if (/branch|visit|offline|in person|शाखा|जाना/.test(t)) return intentBranch();
  if (/(what is|meaning|matlab|kya hai|explain|मतलब|क्या है).*(kyc|pan|aadhaar|aadhar|आधार|पैन|केवाईसी)/.test(t)) return intentGlossary();
  if (/otp|link|लिंक|ओटीपी/.test(t)) return intentAadhaar();
  if (/name|naam|mismatch|नाम|अलग/.test(t)) return intentName();
  if (q.held && /extra|additional|flag|hold|अतिरिक्त/.test(t)) return intentHeld();
  if (/reject|fail|blur|why|error|204|kyun|क्यों|अस्वीकार|रिजेक्ट/.test(t)) return q.id === "rejected" || q.selfie === "rejected" ? intentFix() : intentStatus();
  if (/left|status|next|progress|where|baki|aage|बाकी|स्थिति|आगे/.test(t)) return intentStatus();
  if (/selfie|video|kyc|face|liveness|वीडियो|केवाईसी/.test(t)) return intentVideo();
  if (/address|proof|utility|bill|statement|rent|pata|पता|पते/.test(t) || (q.id === "done" && /document|accept/.test(t))) return intentAddr();
  if (/id|passport|licen|document|accept|pan|aadhaar|aadhar|digilocker|आधार|पैन|दस्तावेज/.test(t)) return intentDocs();
  return intentAbstain();
}

/** Route a question; non-local languages go to Claude for intent only. Sensitive text never leaves the device. */
export async function routeAsync(text: string): Promise<Msg[]> {
  const q = get();
  if (isLocal(q.lang) || isSensitive(text) || /^\D{0,12}\d{4,6}\D{0,3}$/.test(text.trim())) return route(text);
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
