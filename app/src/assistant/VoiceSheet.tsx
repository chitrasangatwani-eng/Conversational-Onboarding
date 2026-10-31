import { set, useAppState } from "../engine/store";
import { LR } from "../engine/i18n";
import { sendDraft, talkToPerson } from "../engine/assistant";
import { closeSheet, turnOffHelp } from "../engine/flow";
import { startListen, stopListen, stopSpeak } from "../engine/voice";
import { LangSelect } from "./LangSelect";

/** Voice-first view: a hands-free loop of listen, answer aloud, listen again. */
export function VoiceSheet() {
  const s = useAppState();

  const mine = s.msgs.filter((m) => m.kind === "text" && m.mine);
  const bot = s.msgs.filter((m) => (m.kind === "text" && !m.mine) || m.kind === "source");
  const lastUser = s.listening && s.live ? s.live : mine.length ? (mine[mine.length - 1] as { text: string }).text : "";
  const lastBot = bot.length ? (bot[bot.length - 1] as { text: string }).text : "";

  // Choices offered since the user last spoke become buttons under the reply.
  const links: { label: string; act: () => void }[] = [];
  for (let i = s.msgs.length - 1; i >= 0; i--) {
    const m = s.msgs[i];
    if (m.kind === "text" && m.mine) break;
    if (m.kind === "link") links.unshift({ label: m.label, act: m.act });
    if (m.kind === "summary") links.unshift({ label: m.t!.sm3, act: m.confirmAct }, { label: m.t!.sm4, act: m.declineAct });
  }

  const orbClass = s.listening ? " listening" : s.speaking ? " speaking" : "";
  const orbText = s.listening ? LR("Listening…", "सुन रहा हूँ…") : s.typing ? LR("Thinking…", "सोच रहा हूँ…") : s.speaking ? LR("Speaking…", "बोल रहा हूँ…") : LR("Tap to talk", "बोलने के लिए टैप करें");
  const orbSub = s.micErr ? s.micErr
    : s.micBlocked ? LR("The microphone is blocked here. Allow it in your browser, open this page in its own tab, or type below.", "यहाँ माइक्रोफ़ोन बंद है। ब्राउज़र में अनुमति दें, इस पेज को अलग टैब में खोलें, या नीचे टाइप करें।")
    : s.listening ? LR("Say your question. Tap to stop.", "अपना सवाल बोलिए। रोकने के लिए टैप करें।")
    : s.speaking ? LR("Tap to interrupt and speak.", "बीच में बोलने के लिए टैप करें।")
    : LR('Try: "what is left?" or "why was my photo rejected?"', 'बोलिए: "क्या बाकी है?" या "मेरी फ़ोटो क्यों अस्वीकार हुई?"');

  const toggleOrb = () => {
    if (s.listening) stopListen();
    else { stopSpeak(); set({ micBlocked: false, micErr: "" }); startListen(); }
  };

  return (
    <div className="sheet" role="dialog" aria-label="Voice help">
      <div className="sheet-head" style={{ gap: 8 }}>
        <div style={{ flex: 1, fontWeight: 600, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>Voice help<span className="ai-tag">AI</span></div>
        <button className="btn outline btn-12" onClick={() => { stopSpeak(); stopListen(); set({ vmode: false }); }}>Type instead</button>
        <button className="close" onClick={closeSheet} aria-label="Close">✕</button>
      </div>
      <div className="sheet-strip">{LR("Never share your OTP, PIN or password here. We will never ask for them.", "यहाँ अपना OTP, PIN या पासवर्ड कभी न भेजें। हम इन्हें कभी नहीं माँगते।")}</div>
      {s.down && <div className="sheet-strip dark">The assistant is offline. Your application is not affected. Static help and a person are still available.</div>}
      <div style={{ flex: 1, overflow: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#4a534f" }}>Language<LangSelect style={{ padding: "0 12px", fontSize: 14, maxWidth: "none" }} /></label>
        <button className={"orb" + orbClass} onClick={toggleOrb} aria-label="Talk" aria-pressed={s.listening}><span /></button>
        <div style={{ fontWeight: 600, fontSize: 17 }} aria-live="polite">{orbText}</div>
        <div style={{ fontSize: 13, color: "#4a534f", textAlign: "center", minHeight: 18 }}>{orbSub}</div>
        {s.micBlocked && <a href={window.location.href} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontWeight: 600, fontSize: 14 }}>Open in a new tab to use the microphone</a>}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13.5, color: "#4a534f", textAlign: "right", minHeight: 18 }}>{lastUser}</div>
          <div style={{ fontSize: 15.5, lineHeight: 1.5, background: "#fff", border: "1px solid #e3dfd6", borderRadius: 14, padding: "12px 14px" }} aria-live="polite">{lastBot}</div>
          {links.map((l, i) => <button key={i} className="btn btn-12" style={{ textAlign: "left" }} onClick={l.act}>{l.label}</button>)}
        </div>
      </div>
      <div style={{ padding: "0 16px 4px", display: "flex", gap: 8, flex: "none" }}>
        <input className="chat-input" value={s.draft} onChange={(e) => set({ draft: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") sendDraft(); }} placeholder={LR("Or type here", "या यहाँ टाइप करें")} aria-label="Message" />
        <button className="send" onClick={sendDraft} aria-label="Send">↑</button>
      </div>
      <div style={{ padding: "6px 16px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flex: "none" }}>
        <button className="foot-link" onClick={talkToPerson}>{LR("Talk to a person", "किसी व्यक्ति से बात करें")}</button>
        <button className="foot-off" onClick={turnOffHelp}>{LR("Turn off assistance", "सहायता बंद करें")}</button>
      </div>
    </div>
  );
}
