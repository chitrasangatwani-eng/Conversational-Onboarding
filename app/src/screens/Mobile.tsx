import { useEffect, useState } from "react";
import { set, useAppState } from "../engine/store";
import { backHome, changeNumber, sendOtp, validMobile, verifyOtp } from "../engine/flow";
import { backend, firebaseWeb, otpChannel } from "../engine/api";
import { ask, intentAadhaar } from "../engine/assistant";
import { L } from "../engine/i18n";
import { MicButton, VOICE_NOTE } from "./fields";

export function MobileScreen() {
  const s = useAppState();
  const full = !s.mvp;
  const byEmail = otpChannel() === "email";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.otpEmail.trim());
  // Either a valid mobile or (when email is offered) a valid email turns on Send OTP.
  const ok = validMobile(s.mobNum) || (byEmail && emailOk);
  // Re-render once a second while the resend countdown runs.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (s.resendAt <= Date.now()) return;
    const t = setInterval(() => {
      setTick((n) => n + 1);
      if (s.resendAt <= Date.now()) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [s.resendAt]);
  const resendIn = Math.max(0, Math.ceil((s.resendAt - Date.now()) / 1000));
  const demoCode = s.otpDemo || "123456";
  const mobErr = s.mobErr || (s.mobNum.length === 10 && !validMobile(s.mobNum) ? "Indian mobile numbers start with 6, 7, 8 or 9. Try 9876543210 for the demo." : "");
  const sendsTo = byEmail && emailOk ? "email" : validMobile(s.mobNum) ? "sms" : "";
  return (
    <div className="screen">
      <button className="back" onClick={backHome}>← Back</button>
      <div className="screen-title">{byEmail ? "Verify your mobile or email" : "Verify your mobile number"}</div>
      <div className="secure-note">Secure form. The assistant never sees your number or OTP.</div>
      {s.navNote && s.mob === "done" && <div className="banner ok" role="status">{s.navNote}</div>}
      {s.mobStage === "enter" ? (
        <>
          <div className="screen-lede">{byEmail ? "Enter your mobile number or your email. Either one is enough: we'll email the 6-digit OTP if you give an email, otherwise we'll send it by SMS." : "Use the mobile number linked to your Aadhaar. We'll send a 6-digit OTP by SMS."} {full ? VOICE_NOTE : ""} <button className="why" onClick={() => set({ why: "mobNum" })}>Why we ask</button></div>
          <button className="demo-fill" onClick={() => set({ mobNum: "9876543210", mobErr: "" })}>Demo: fill 9876543210</button>
          <div className="field-row">
            <div className="input big" style={{ width: 72, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, letterSpacing: 0 }}>+91</div>
            <input className="input big" value={s.mobNum} onChange={(e) => set({ mobNum: e.target.value.replace(/\D/g, "").slice(0, 10), mobErr: "" })} inputMode="numeric" maxLength={10} placeholder="10-digit number" aria-label="Mobile number" autoComplete="tel-national" />
            {full && <MicButton field="mobNum" />}
          </div>
          {byEmail && (
            <>
              <label>
                <div className="or-line"><span>or</span></div>
                <div className="field-head"><span>Email address</span></div>
                <input className="input" type="email" value={s.otpEmail} onChange={(e) => set({ otpEmail: e.target.value, mobErr: "" })} placeholder="name@example.com" autoComplete="email" aria-label="Email for your OTP" />
              </label>
              <div style={{ fontSize: 12, color: "#5f6b80", lineHeight: 1.4 }}>{firebaseWeb() ? "Both send a real 6-digit code: by SMS to your mobile, or to your email." : "Email sends a real code. SMS in India needs DLT business registration, so in this demo an SMS code is shown on screen instead."}</div>
            </>
          )}
          <div className="err" role="alert">{mobErr}</div>
          <button className={"btn-lg" + (ok ? "" : " is-off")} onClick={() => sendOtp()} aria-busy={s.otpBusy}>{s.otpBusy ? "Sending…" : sendsTo === "email" ? "Send OTP to email" : sendsTo === "sms" && byEmail ? "Send OTP by SMS" : "Send OTP"}</button>
        </>
      ) : (
        <>
          <div className="screen-lede">{s.otpSentTo ? <>Enter the 6-digit OTP we emailed to {s.otpSentTo}. Check your spam folder if you don't see it.</> : <>Enter the 6-digit OTP sent to +91 ••••••{s.mobNum.slice(-4)}.</>} {s.otpNote}</div>
          <div className="field-row">
            <input className="input big" style={{ textAlign: "center", letterSpacing: ".4em" }} value={s.otp} onChange={(e) => set({ otp: e.target.value.replace(/\D/g, "").slice(0, 6), otpErr: "" })} inputMode="numeric" maxLength={6} placeholder="••••••" aria-label="OTP" autoComplete="one-time-code" />
            {full && <MicButton field="otp" />}
          </div>
          <div className="err" role="alert">{s.otpErr}</div>
          <button className={"btn-lg" + (s.otp.length === 6 ? "" : " is-off")} onClick={verifyOtp} aria-busy={s.otpBusy}>{s.otpBusy ? "Checking…" : "Verify"}</button>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
            <button className="link-strong" style={{ textDecoration: "none", ...(resendIn ? { color: "#5f6b80", cursor: "default" } : {}) }} aria-disabled={!!resendIn} onClick={() => { if (!resendIn) sendOtp(true); }}>{resendIn ? `Resend OTP in ${resendIn}s` : "Resend OTP"}</button>
            <button className="link" onClick={changeNumber}>Change number</button>
            <button className="link" onClick={() => { set({ sheet: true }); ask(L("I didn't get the OTP", "मुझे OTP नहीं मिला"), intentAadhaar()); }}>Didn't get the OTP?</button>
          </div>
          {backend() === "server" && s.otpDemo && <div style={{ fontSize: 12, color: "#5f6b80" }}>SMS isn't set up in this demo, so no SMS was sent. Use the demo button below.</div>}
          {(backend() === "local" || s.otpDemo) && <button className="demo-fill" onClick={() => set({ otp: demoCode, otpErr: "" })}>Demo: fill OTP {demoCode}</button>}
        </>
      )}
    </div>
  );
}
