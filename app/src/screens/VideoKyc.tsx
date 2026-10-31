import { set, useAppState } from "../engine/store";
import { endCall, joinVk } from "../engine/flow";
import { useCamera } from "../engine/useCamera";

// Video KYC call. The agent feed is a placeholder; the applicant's own camera
// is live and shrinks to a corner preview once the call connects.

const PROMPTS = [
  "Hello Chitra. Please look at the camera.",
  "Please hold your PAN card next to your face.",
  "Now turn your head slowly to the left, then right.",
  "Thank you. Please stay on the line.",
];

export function VideoKycScreen() {
  const s = useAppState();
  const { videoRef, stop } = useCamera("user");
  const live = s.vk === "live";
  const leave = () => { stop(); endCall("hang"); };

  const pip: React.CSSProperties = live
    ? { top: "auto", left: "auto", right: 12, bottom: 12, width: 96, height: 128, borderRadius: 12, border: "2px solid #fff" }
    : { top: 0, left: 0, right: "auto", bottom: "auto", width: "100%", height: "100%", borderRadius: 0, border: 0 };

  return (
    <div className="screen" style={{ padding: "8px 20px 20px", gap: 10, overflow: "hidden" }}>
      <button className="back" onClick={leave}>← Back</button>
      <div className="screen-title">Video KYC</div>
      <div style={{ fontSize: 13.5, color: "#4a534f", lineHeight: 1.4 }}>A short live call with a verification agent. <button className="why" onClick={() => set({ why: "vk" })}>Why we ask</button></div>
      <div style={{ position: "relative", flex: 1, borderRadius: 16, overflow: "hidden", background: "#1d2420" }}>
        {live && (
          <>
            <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg,#2a332e 0 10px,#313b35 10px 20px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 12, color: "#aab3ad", textAlign: "center" }}>agent video<br />(live feed placeholder)</div>
            <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ background: "#fff", color: "#1d2420", borderRadius: 8, padding: "4px 8px", fontSize: 12, fontWeight: 600 }}>Priya · Verification agent</span>
              <span style={{ background: "oklch(0.5 0.09 25)", color: "#fff", borderRadius: 8, padding: "4px 8px", fontFamily: "var(--mono)", fontSize: 11 }}>REC 00:{String(s.vkT).padStart(2, "0")}</span>
            </div>
            <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, background: "rgba(255,255,255,.95)", borderRadius: 12, padding: "10px 12px", fontSize: 14, lineHeight: 1.4 }} aria-live="polite">
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#6b7370", display: "block" }}>AGENT ASKS</span>
              {PROMPTS[Math.min(3, Math.floor(s.vkT / 3))]}
            </div>
          </>
        )}
        <video ref={videoRef} autoPlay playsInline muted style={{ position: "absolute", objectFit: "cover", transform: "scaleX(-1)", background: "#313b35", ...pip }} />
        {s.vk === "connecting" && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(29,36,32,.62)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Connecting you to an agent…</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>Position in queue: 1. Please keep your PAN card ready.</div>
          </div>
        )}
      </div>
      {s.vk === "ready" && (
        <>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "#1d2420", background: "#fff", border: "1px solid #e3dfd6", borderRadius: 12, padding: "10px 12px" }}>
            · Original PAN card in your hand<br />· Bright light on your face, quiet place<br />· Steady Wi-Fi or 4G{s.weak ? ". Your connection looks weak, so move closer to your router if you can." : ""}<br />
            <span style={{ color: "#4a534f" }}>This call is recorded and used only for KYC.</span>
          </div>
          <button className="btn-lg" style={{ minHeight: 48, fontSize: 15 }} onClick={joinVk}>Join call</button>
        </>
      )}
      {live && (
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-lg" style={{ minHeight: 48, fontSize: 15, flex: 1, background: "#fff", color: "#1d2420", border: "1px solid #cfc9bc" }} onClick={() => set({ muted: !s.muted })} aria-pressed={s.muted}>{s.muted ? "Unmute" : "Mute"}</button>
          <button className="btn-lg" style={{ minHeight: 48, fontSize: 15, flex: 1, background: "oklch(0.5 0.09 25)" }} onClick={leave}>End call</button>
        </div>
      )}
    </div>
  );
}
