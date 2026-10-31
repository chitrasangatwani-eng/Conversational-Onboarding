import { useEffect, useRef } from "react";
import { set, useAppState } from "../engine/store";
import { LR } from "../engine/i18n";
import { greet, sendDraft, talkToPerson } from "../engine/assistant";
import { closeSheet, turnOffHelp } from "../engine/flow";
import { startListen, stopListen, stopSpeak } from "../engine/voice";
import { chipsFor } from "./chips";
import { MessageView } from "./MessageView";
import { LangSelect } from "./LangSelect";

/** Text chat view of the assistant. */
export function ChatSheet() {
  const s = useAppState();
  const full = !s.mvp;
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { const e = scroll.current; if (e) e.scrollTop = e.scrollHeight; }, [s.msgs.length, s.typing]);
  const chips = chipsFor(s);

  return (
    <>
      <div className="scrim" onClick={closeSheet} />
      <div className="sheet anim" role="dialog" aria-label="Onboarding assistant">
        <div className="sheet-head">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>{LR("Onboarding assistant", "ऑनबोर्डिंग सहायक")}<span className="ai-tag">AI</span></div>
            <div style={{ fontSize: 12, color: "#6b7370" }}>{s.translating ? "Translating…" : LR("Your onboarding", "आपका ऑनबोर्डिंग")}</div>
          </div>
          <LangSelect />
          <button className="btn accent btn-12" onClick={() => { set({ vmode: true, speak: true }); setTimeout(() => greet(), 200); }}>Talk</button>
          <button className="close" onClick={closeSheet} aria-label="Close">✕</button>
        </div>
        <div className="sheet-strip">{LR("Never share your OTP, PIN or password here. We will never ask for them.", "यहाँ अपना OTP, PIN या पासवर्ड कभी न भेजें। हम इन्हें कभी नहीं माँगते।")}</div>
        {s.down && <div className="sheet-strip dark">The assistant is offline. Your application is not affected. Static help and a person are still available.</div>}
        <div ref={scroll} style={{ flex: 1, overflow: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }} aria-live="polite">
          <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "#4a534f", background: "#ece9e1", borderRadius: 10, padding: "10px 12px" }}>
            {LR("Hi Chitra, I'm an AI. I can explain steps, check your verified status and answer document questions from approved content. I can't approve anything or see your PAN or Aadhaar details. A person is always one tap away.", "नमस्ते चित्रा, मैं एक AI हूँ। मैं चरण समझा सकता हूँ, आपकी सत्यापित स्थिति बता सकता हूँ और मंज़ूर जानकारी से दस्तावेज़ों के सवालों के जवाब दे सकता हूँ। मैं कुछ मंज़ूर नहीं कर सकता और आपके PAN या आधार की जानकारी नहीं देख सकता। एक व्यक्ति से बात हमेशा बस एक टैप दूर है।")}
          </div>
          {s.msgs.map((m) => <MessageView key={m.id} m={m} />)}
          {s.typing && <div className="typing" aria-label="Assistant is typing"><span /><span /><span /></div>}
        </div>
        {full && (
          <div style={{ padding: "8px 16px 0", flex: "none" }}>
            <button className={"mic-wide" + (s.listening ? " on" : "")} onClick={() => (s.listening ? stopListen() : startListen())} aria-label="Speak">
              <span className="knob"><span /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600, fontSize: 15 }}>{s.listening ? LR("Listening…", "सुन रहा हूँ…") : LR("Tap and speak", "टैप करें और बोलें")}</span>
                <span style={{ display: "block", fontSize: 12.5, opacity: 0.9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.listening ? s.live || LR("Say your question. Tap to stop.", "अपना सवाल बोलिए। रोकने के लिए टैप करें।") : LR("English, हिन्दी or Hinglish. Try “what is left?”", "हिन्दी, English या Hinglish। बोलिए “क्या बाकी है?”")}
                </span>
              </span>
            </button>
          </div>
        )}
        <div style={{ padding: "8px 16px 0", display: "flex", gap: 6, overflowX: "auto", flex: "none" }}>
          {chips.map((c) => <button key={c.label} className="chip" onClick={c.go}>{c.label}</button>)}
        </div>
        <div style={{ padding: "6px 16px 14px", display: "flex", flexDirection: "column", gap: 6, flex: "none" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="chat-input" value={s.draft} onChange={(e) => set({ draft: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") sendDraft(); }} placeholder={LR("Ask about this step", "इस चरण के बारे में पूछें")} aria-label="Message" />
            <button className="send" onClick={sendDraft} aria-label="Send">↑</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button className="foot-link" onClick={talkToPerson}>{LR("Talk to a person", "किसी व्यक्ति से बात करें")}</button>
            {full && <button className="foot-muted" onClick={() => { stopSpeak(); set({ speak: !s.speak }); }}>{s.speak ? LR("Read aloud: On", "बोलकर सुनाएँ: चालू") : LR("Read aloud: Off", "बोलकर सुनाएँ: बंद")}</button>}
            <button className="foot-off" onClick={turnOffHelp}>{LR("Turn off assistance", "सहायता बंद करें")}</button>
          </div>
        </div>
      </div>
    </>
  );
}
