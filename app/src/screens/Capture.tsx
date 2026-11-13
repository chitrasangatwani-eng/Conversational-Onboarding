import { useRef, useState } from "react";
import { set, useAppState } from "../engine/store";
import { DIGILOCKER_DOCS, backHome, captureKind, chooseIdDoc, ovdName, submitCapture, useDigiLocker } from "../engine/flow";
import { useCamera } from "../engine/useCamera";

// Secure capture for the PAN card and address proof. The image stays on the
// device in this prototype; the assistant never sees this screen.

const COPY = {
  pan: { title: "PAN card", hint: "" },
  ovd: { title: "Identity document", hint: "All four corners and your name, photo and date of birth readable." },
  addr: { title: "Address proof", hint: "The page or bill that shows your current address." },
  vk: { title: "Video KYC", hint: "Face the camera in good light and keep your original PAN card with you. An agent call replaces this in the live product." },
};

export function CaptureScreen() {
  const s = useAppState();
  const kind = captureKind();
  const base = COPY[kind];
  const copy = kind === "ovd" ? { ...base, title: ovdName(s.ovd) } : kind === "addr" && s.addrDoc ? { ...base, title: s.addrDoc } : base;
  const back = kind === "pan" || kind === "ovd" ? chooseIdDoc : kind === "addr" ? () => set({ screen: "addrchoice" }) : backHome;
  const selfie = kind === "vk";
  const { videoRef, cam, camErr, start, stop, snap } = useCamera(selfie ? "user" : "environment");
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const shot = !!url;

  const pick = () => { const i = fileRef.current; if (i) { i.value = ""; i.click(); } };
  const capture = () => {
    if (cam && !shot) { const u = snap(selfie); if (u) setUrl(u); return; }
    if (shot) { setUrl(""); setTimeout(start, 50); return; }
    if (camErr) pick(); else start();
  };
  const close = (fn: () => void) => () => { stop(); fn(); };

  return (
    <div className="screen" style={{ overflow: "hidden" }}>
      <button className="back" onClick={close(back)}>← Back</button>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{copy.title}</div>
      <div style={{ fontSize: 13, color: "#3c4659", marginTop: -8 }}>{copy.hint} <button className="why" onClick={() => set({ why: kind === "ovd" ? "pan" : kind })}>Why we ask</button></div>
      <div className="secure-note"><span style={{ fontFamily: "var(--mono)" }}>🔒</span>Secure upload. The assistant never sees this image, your PAN or your Aadhaar number.</div>
      <input ref={fileRef} type="file" accept="image/*" capture={selfie ? "user" : "environment"} style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setUrl(URL.createObjectURL(f)); }} />
      <div className={"frame" + (shot ? " shot" : "")} style={url ? { backgroundImage: `url(${url})` } : undefined} onClick={capture} role="button" aria-label="Camera frame">
        <video ref={videoRef} autoPlay playsInline muted style={{ display: cam && !shot ? "block" : "none", transform: selfie ? "scaleX(-1)" : "none" }} />
        {shot || cam ? "" : camErr ? "Camera unavailable. Tap to choose a photo" : "Starting camera…"}
      </div>
      <button className="btn-outline-lg" onClick={capture}>{shot ? "Retake" : cam ? "Capture photo" : camErr ? "Choose a photo" : "Capture photo"}</button>
      <div style={{ fontSize: 12, color: "#3c4659" }}>{s.weak && !s.mvp ? "Low-data mode: your photo is compressed before it uploads." : ""}</div>
      {(kind === "pan" || (kind === "ovd" && s.ovd !== "" && DIGILOCKER_DOCS.includes(s.ovd)) || (kind === "addr" && s.addrDoc === "Aadhaar")) && (
        <button className="btn-digi" onClick={() => useDigiLocker()} aria-busy={s.dlBusy}>
          {s.dlBusy ? "Waiting for DigiLocker… finish in its window" : "Use DigiLocker instead (no photo)"}
        </button>
      )}
      {s.dlErr && <div className="err" role="alert">{s.dlErr}</div>}
      {(kind === "pan" || kind === "ovd") && <button className="link" style={{ alignSelf: "flex-start" }} onClick={close(chooseIdDoc)}>Choose a different identity document</button>}
      <button className="btn-block" onClick={close(submitCapture)}>Submit photo</button>
    </div>
  );
}
