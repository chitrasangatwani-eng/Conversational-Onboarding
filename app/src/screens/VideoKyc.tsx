import { useState } from "react";
import { set, useAppState } from "../engine/store";
import { endCall, joinVk, ovdName } from "../engine/flow";
import { useCamera } from "../engine/useCamera";

// Video KYC call. The agent feed is a placeholder; the applicant's own camera
// is live and shrinks to a corner preview once the call connects.

const prompts = (doc: string) => [
  "Hello Chitra. Please look at the camera.",
  `Please hold your ${doc} next to your face.`,
  "Now turn your head slowly to the left, then right.",
  "Thank you. Please stay on the line.",
];

const CAM_HELP: Record<string, string> = {
  blocked: "Camera access is blocked for this site, so your browser won't ask again. Tap the icon left of the web address (a lock, sliders or camera), set Camera to Allow, then reload the page. On iPhone: tap aA, then Website Settings, then Camera.",
  none: "We can't find a camera on this device. Use a phone or a computer with a camera.",
  busy: "Another app is using your camera. Close it (for example a video call), then tap Try again.",
  unsupported: "This browser can't use the camera. Open this page in Chrome or Safari (not inside WhatsApp or Instagram).",
  other: "We couldn't start your camera. Tap Try again, or open this page in Chrome or Safari.",
};

export function VideoKycScreen() {
  const s = useAppState();
  const { videoRef, stop, start, cam, camErr, camWhy } = useCamera("user");
  const doc = s.ovd ? ovdName(s.ovd) : "ID";
  // Retrying a blocked camera fails instantly; count tries so the person sees something happen.
  const [tries, setTries] = useState(0);
  const retry = () => { setTries((n) => n + 1); start(); };
  const live = s.vk === "live";
  const leave = () => { stop(); endCall("hang"); };

  const pip: React.CSSProperties = live
    ? { top: "auto", left: "auto", right: 12, bottom: 12, width: 96, height: 128, borderRadius: 12, border: "2px solid #fff" }
    : { top: 0, left: 0, right: "auto", bottom: "auto", width: "100%", height: "100%", borderRadius: 0, border: 0 };

  return (
    <div className="screen" style={{ gap: 10, overflow: "hidden" }}>
      <button className="back" onClick={leave}>← Back</button>
      <div className="screen-title">Video KYC</div>
      <div style={{ fontSize: 13.5, color: "#3c4659", lineHeight: 1.4 }}>A short live call with a verification agent. <button className="why" onClick={() => set({ why: "vk" })}>Why we ask</button></div>
      <div style={{ position: "relative", flex: 1, minHeight: 260, borderRadius: 16, overflow: "hidden", background: "#13203f" }}>
        {live && (
          <>
            <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg,#1c2a4a 0 10px,#24314f 10px 20px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 12, color: "#a9b3c4", textAlign: "center" }}>agent video<br />(live feed placeholder)</div>
            <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ background: "#fff", color: "#13203f", borderRadius: 8, padding: "4px 8px", fontSize: 12, fontWeight: 600 }}>Priya · Verification agent</span>
              <span style={{ background: "oklch(0.5 0.09 25)", color: "#fff", borderRadius: 8, padding: "4px 8px", fontFamily: "var(--mono)", fontSize: 11 }}>REC 00:{String(s.vkT).padStart(2, "0")}</span>
            </div>
            <div style={{ position: "absolute", left: 12, right: 12, bottom: 12, background: "rgba(255,255,255,.95)", borderRadius: 12, padding: "10px 12px", fontSize: 14, lineHeight: 1.4 }} aria-live="polite">
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#5f6b80", display: "block" }}>AGENT ASKS</span>
              {prompts(doc)[Math.min(3, Math.floor(s.vkT / 3))]}
            </div>
          </>
        )}
        <video ref={videoRef} autoPlay playsInline muted style={{ position: "absolute", objectFit: "cover", transform: "scaleX(-1)", background: "#24314f", ...pip }} />
        {!live && !cam && (
          <div style={{ position: "absolute", inset: 0, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: 24 }} role={camErr ? "alert" : "status"}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{camErr ? "Your camera isn't on" : "Starting your camera…"}</div>
            {camErr && <div style={{ fontSize: 14, opacity: 0.9, maxWidth: 440, lineHeight: 1.45 }}>{CAM_HELP[camWhy] ?? CAM_HELP.other}</div>}
            {camErr && tries > 0 && <div style={{ fontSize: 13, color: "#ffd8a8" }}>Still not working (tried {tries} {tries === 1 ? "time" : "times"}). {camWhy === "blocked" ? "Allow the camera in site settings, then reload." : "Try reloading the page."}</div>}
            {camErr && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                <button style={{ background: "#fff", color: "#13203f", border: 0, borderRadius: 10, padding: "10px 18px", font: "inherit", fontWeight: 600, cursor: "pointer" }} onClick={retry}>Try again</button>
                <button style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.6)", borderRadius: 10, padding: "10px 18px", font: "inherit", fontWeight: 600, cursor: "pointer" }} onClick={() => window.location.reload()}>Reload page</button>
              </div>
            )}
          </div>
        )}
        {s.vk === "connecting" && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(29,36,32,.62)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Connecting you to an agent…</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>Position in queue: 1. Please keep your {doc} ready.</div>
          </div>
        )}
      </div>
      {s.vk === "ready" && (
        <>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "#13203f", background: "#fff", border: "1px solid #e1e7f0", borderRadius: 12, padding: "10px 12px" }}>
            · Your original {doc} in your hand<br />· Bright light on your face, quiet place<br />· Steady Wi-Fi or 4G{s.weak ? ". Your connection looks weak, so move closer to your router if you can." : ""}<br />
            <span style={{ color: "#3c4659" }}>This call is recorded and used only for KYC.</span>
          </div>
          {/* The call needs a working camera: KYC can't pass without seeing the applicant. */}
          <button className={"btn-lg" + (cam ? "" : " is-off")} style={{ minHeight: 48, fontSize: 15 }} onClick={() => { if (cam) joinVk(); }} aria-disabled={!cam}>{cam ? "Join call" : "Turn on your camera to join"}</button>
        </>
      )}
      {live && (
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-lg" style={{ minHeight: 48, fontSize: 15, flex: 1, background: "#fff", color: "#13203f", border: "1px solid #c9d3e1" }} onClick={() => set({ muted: !s.muted })} aria-pressed={s.muted}>{s.muted ? "Unmute" : "Mute"}</button>
          <button className="btn-lg" style={{ minHeight: 48, fontSize: 15, flex: 1, background: "oklch(0.5 0.09 25)" }} onClick={leave}>End call</button>
        </div>
      )}
    </div>
  );
}
