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
  const copy = kind === "ovd" ? { ...base, title: ovdName(s.ovd), hint: s.ovd === "aadhaar" ? "Cover the first 8 digits of your Aadhaar number (a masked Aadhaar). The photo, name and address must be readable." : base.hint } : kind === "addr" && s.addrDoc ? { ...base, title: s.addrDoc } : base;
  const back = kind === "pan" || kind === "ovd" ? chooseIdDoc : kind === "addr" ? () => set({ screen: "addrchoice" }) : backHome;
  const selfie = kind === "vk";
  const { videoRef, cam, camErr, start, stop, snap } = useCamera(selfie ? "user" : "environment");
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  /** A PDF upload can't be previewed as an image, so its name is shown instead. */
  const [pdf, setPdf] = useState("");
  const shot = !!url || !!pdf;

  const pick = () => { const i = fileRef.current; if (i) { i.value = ""; i.click(); } };
  /** Upload from the gallery or files: offered for every document, camera or not. */
  const upload = () => { const i = uploadRef.current; if (i) { i.value = ""; i.click(); } };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    stop();
    if (f.type === "application/pdf") { setUrl(""); setPdf(f.name); } else { setPdf(""); setUrl(URL.createObjectURL(f)); }
  };
  const capture = () => {
    if (cam && !shot) { const u = snap(selfie); if (u) setUrl(u); return; }
    if (shot) { setUrl(""); setPdf(""); setTimeout(start, 50); return; }
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
        onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={uploadRef} type="file" accept={selfie ? "image/*" : "image/*,application/pdf"} style={{ display: "none" }} aria-label="Upload a photo or PDF"
        onChange={(e) => onFile(e.target.files?.[0])} />
      <div className={"frame" + (shot ? " shot" : "")} style={url ? { backgroundImage: `url(${url})` } : undefined} onClick={capture} role="button" aria-label="Camera frame">
        <video ref={videoRef} autoPlay playsInline muted style={{ display: cam && !shot ? "block" : "none", transform: selfie ? "scaleX(-1)" : "none" }} />
        {pdf ? `📄 ${pdf}` : shot || cam ? "" : camErr ? "Camera unavailable. Tap to choose a photo" : "Starting camera…"}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn-outline-lg" style={{ flex: "1 1 180px" }} onClick={capture}>{shot ? "Retake with camera" : cam ? "Capture photo" : camErr ? "Choose a photo" : "Capture photo"}</button>
        {!selfie && <button className="btn-outline-lg" style={{ flex: "1 1 180px" }} onClick={upload}>{shot ? "Upload a different file" : "Upload photo or PDF"}</button>}
      </div>
      <div style={{ fontSize: 12, color: "#3c4659" }}>{s.weak && !s.mvp ? "Low-data mode: your photo is compressed before it uploads." : ""}</div>
      {(kind === "pan" || (kind === "ovd" && s.ovd !== "" && DIGILOCKER_DOCS.includes(s.ovd)) || (kind === "addr" && s.addrDoc === "Aadhaar")) && (
        <button className="btn-digi" onClick={() => useDigiLocker()} aria-busy={s.dlBusy}>
          {s.dlBusy ? "Waiting for DigiLocker… finish in its window" : "Use DigiLocker instead (no photo)"}
        </button>
      )}
      {s.dlErr && <div className="err" role="alert">{s.dlErr}</div>}
      {(kind === "pan" || kind === "ovd") && <button className="link" style={{ alignSelf: "flex-start" }} onClick={close(chooseIdDoc)}>Choose a different identity document</button>}
      <button className="btn-block" onClick={close(submitCapture)}>{pdf ? "Submit document" : "Submit photo"}</button>
    </div>
  );
}
