import { useEffect, useRef, useState } from "react";
import { set, useAppState } from "../engine/store";
import { DIGILOCKER_DOCS, backHome, captureKind, chooseIdDoc, ovdName, submitCapture, useDigiLocker } from "../engine/flow";
import { useCamera } from "../engine/useCamera";

// Secure capture for the PAN card and address proof. The image stays on the
// device in this prototype; the assistant never sees this screen.

/** Why the camera isn't available, in plain words, with the upload alternative. */
const CAM_HELP: Record<string, string> = {
  blocked: "Camera access is blocked for this site. Allow the camera in your browser's site settings (the icon left of the web address), then reload, or upload a photo instead.",
  none: "We can't find a camera on this device. Upload a photo or PDF instead.",
  busy: "Another app is using your camera. Close it and tap Capture photo again, or upload a photo instead.",
  unsupported: "This browser can't use the camera. Open the page in Chrome or Safari, or upload a photo instead.",
  other: "We couldn't start your camera. Tap Capture photo to try again, or upload a photo instead.",
};

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
  const { videoRef, cam, camErr, camWhy, start, stop, snapWhenReady } = useCamera(selfie ? "user" : "environment");
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  /** A PDF upload can't be previewed as an image, so its name is shown instead. */
  const [pdf, setPdf] = useState("");
  const [busy, setBusy] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  const [note, setNote] = useState("");
  const shot = !!url || !!pdf;
  // Once there's a photo, bring the Submit button into view.
  useEffect(() => { if (shot) submitRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [shot]);

  const pick = () => { const i = fileRef.current; if (i) { i.value = ""; i.click(); } };
  /** Upload from the gallery or files: offered for every document, camera or not. */
  const upload = () => { const i = uploadRef.current; if (i) { i.value = ""; i.click(); } };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    stop();
    if (f.type === "application/pdf") { setUrl(""); setPdf(f.name); } else { setPdf(""); setUrl(URL.createObjectURL(f)); }
  };
  const capture = () => {
    setNote("");
    if (cam && !shot) {
      if (busy) return;
      setBusy(true);
      void snapWhenReady(selfie).then((u) => {
        setBusy(false);
        if (u) setUrl(u); else setNote("The camera isn't showing a picture yet. Wait a second and tap Capture photo again, or upload a photo instead.");
      });
      return;
    }
    if (shot) { setUrl(""); setPdf(""); setTimeout(start, 50); return; }
    if (camErr) pick(); else start();
  };
  const close = (fn: () => void) => () => { stop(); fn(); };

  return (
    <div className="screen">
      <button className="back" onClick={close(back)}>← Back</button>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{copy.title}</div>
      <div style={{ fontSize: 13, color: "#3c4659", marginTop: -8 }}>{copy.hint} <button className="why" onClick={() => set({ why: kind === "ovd" ? "pan" : kind })}>Why we ask</button></div>
      <div className="secure-note"><span style={{ fontFamily: "var(--mono)" }}>🔒</span>Secure upload. The assistant never sees this image, your PAN or your Aadhaar number.</div>
      <input ref={fileRef} type="file" accept="image/*" capture={selfie ? "user" : "environment"} style={{ display: "none" }}
        onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={uploadRef} type="file" accept={selfie ? "image/*" : "image/*,application/pdf"} style={{ display: "none" }} aria-label="Upload a photo or PDF"
        onChange={(e) => onFile(e.target.files?.[0])} />
      {/* A fixed height, so the buttons below stay on screen on short laptop displays. */}
      <div className={"frame" + (shot ? " shot" : "")} style={{ flex: "none", height: "clamp(150px, 34vh, 340px)", ...(url ? { backgroundImage: `url(${url})` } : {}) }} onClick={capture} role="button" aria-label="Camera frame">
        {/* Kept in the page (only made invisible) so phones keep decoding frames before it's shown. */}
        <video ref={videoRef} autoPlay playsInline muted style={{ opacity: cam && !shot ? 1 : 0, pointerEvents: "none", transform: selfie ? "scaleX(-1)" : "none" }} />
        {pdf ? `📄 ${pdf}` : shot || cam ? "" : camErr ? "Camera unavailable. Tap to choose a photo" : "Starting camera…"}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn-outline-lg" style={{ flex: "1 1 180px" }} onClick={capture}>{busy ? "Capturing…" : shot ? "Retake with camera" : cam ? "Capture photo" : camErr ? "Choose a photo" : "Capture photo"}</button>
        {!selfie && <button className="btn-outline-lg" style={{ flex: "1 1 180px" }} onClick={upload}>{shot ? "Upload a different file" : "Upload photo or PDF"}</button>}
      </div>
      {!shot && camErr && <div style={{ fontSize: 13, color: "#3c4659" }} role="status">{CAM_HELP[camWhy] ?? CAM_HELP.other}</div>}
      {note && <div className="err" role="alert">{note}</div>}
      {shot && (
        <>
          <div className="banner ok" role="status">✓ {pdf ? "Document added" : "Photo taken"}. Check that it's clear, then submit it.</div>
          <button ref={submitRef} className="btn-block" onClick={close(submitCapture)}>{pdf ? "Submit document" : "Submit photo"}</button>
        </>
      )}
      <div style={{ fontSize: 12, color: "#3c4659" }}>{s.weak && !s.mvp ? "Low-data mode: your photo is compressed before it uploads." : ""}</div>
      {!shot && (kind === "pan" || (kind === "ovd" && s.ovd !== "" && DIGILOCKER_DOCS.includes(s.ovd)) || (kind === "addr" && s.addrDoc === "Aadhaar")) && (
        <button className="btn-digi" onClick={() => useDigiLocker()} aria-busy={s.dlBusy}>
          {s.dlBusy ? "Waiting for DigiLocker… finish in its window" : "Use DigiLocker instead (no photo)"}
        </button>
      )}
      {s.dlErr && <div className="err" role="alert">{s.dlErr}</div>}
      {(kind === "pan" || kind === "ovd") && <button className="link" style={{ alignSelf: "flex-start" }} onClick={close(chooseIdDoc)}>Choose a different identity document</button>}
    </div>
  );
}
