import { useCallback, useEffect, useRef, useState } from "react";

// Live camera preview for the secure capture and Video KYC screens.
// Frames stay in the browser; nothing here uploads anything.

export function useCamera(facing: "user" | "environment", autoStart = true) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState(false);
  const [camErr, setCamErr] = useState(false);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCam(false);
  }, []);

  const start = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setCamErr(true); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false }).then((st) => {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = st;
      const v = videoRef.current;
      if (v) { v.srcObject = st; v.play?.().catch(() => {}); }
      setCam(true);
      setCamErr(false);
    }).catch(() => { setCam(false); setCamErr(true); });
  }, [facing]);

  /** Grab a still as a data URL and stop the camera. Mirrors selfies to match the preview. */
  const snap = useCallback((mirror: boolean): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const x = c.getContext("2d")!;
    if (mirror) { x.translate(c.width, 0); x.scale(-1, 1); }
    x.drawImage(v, 0, 0);
    stop();
    return c.toDataURL("image/jpeg", 0.85);
  }, [stop]);

  useEffect(() => {
    if (!autoStart) return;
    const t = setTimeout(start, 100);
    return () => { clearTimeout(t); stream.current?.getTracks().forEach((tr) => tr.stop()); stream.current = null; };
  }, [autoStart, start]);

  return { videoRef, cam, camErr, start, stop, snap };
}
