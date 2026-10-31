import { set, useAppState } from "../engine/store";
import { backHome, sendOtp, validMobile, verifyOtp } from "../engine/flow";
import { ask, intentAadhaar } from "../engine/assistant";
import { L } from "../engine/i18n";
import { MicButton, VOICE_NOTE } from "./fields";

export function MobileScreen() {
  const s = useAppState();
  const full = !s.mvp;
  const ok = validMobile(s.mobNum);
  const mobErr = s.mobErr || (s.mobNum.length === 10 && !ok ? "Indian mobile numbers start with 6, 7, 8 or 9. Try 9876543210 for the demo." : "");
  return (
    <div className="screen">
      <button className="back" onClick={backHome}>← Back</button>
      <div className="screen-title">Verify your mobile number</div>
      <div className="secure-note">Secure form. The assistant never sees your number or OTP.</div>
      {s.mobStage === "enter" ? (
        <>
          <div className="screen-lede">Use the mobile number linked to your Aadhaar. We'll send a 6-digit OTP by SMS. {full ? VOICE_NOTE : ""} <button className="why" onClick={() => set({ why: "mobNum" })}>Why we ask</button></div>
          <button className="demo-fill" onClick={() => set({ mobNum: "9876543210", mobErr: "" })}>Demo: fill 9876543210</button>
          <div className="field-row">
            <div className="input big" style={{ width: 72, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, letterSpacing: 0 }}>+91</div>
            <input className="input big" value={s.mobNum} onChange={(e) => set({ mobNum: e.target.value.replace(/\D/g, "").slice(0, 10), mobErr: "" })} inputMode="numeric" maxLength={10} placeholder="10-digit number" aria-label="Mobile number" autoComplete="tel-national" />
            {full && <MicButton field="mobNum" />}
          </div>
          <div className="err" role="alert">{mobErr}</div>
          <button className={"btn-lg" + (ok ? "" : " is-off")} onClick={sendOtp}>Send OTP</button>
        </>
      ) : (
        <>
          <div className="screen-lede">Enter the 6-digit OTP sent to +91 ••••••{s.mobNum.slice(-4)}. {s.otpNote}</div>
          <div className="field-row">
            <input className="input big" style={{ textAlign: "center", letterSpacing: ".4em" }} value={s.otp} onChange={(e) => set({ otp: e.target.value.replace(/\D/g, "").slice(0, 6), otpErr: "" })} inputMode="numeric" maxLength={6} placeholder="••••••" aria-label="OTP" autoComplete="one-time-code" />
            {full && <MicButton field="otp" />}
          </div>
          <div className="err" role="alert">{s.otpErr}</div>
          <button className={"btn-lg" + (s.otp.length === 6 ? "" : " is-off")} onClick={verifyOtp}>Verify</button>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
            <button className="link-strong" style={{ textDecoration: "none" }} onClick={() => set({ otpNote: "A new OTP was sent.", otp: "", otpErr: "" })}>Resend OTP</button>
            <button className="link" onClick={() => set({ mobStage: "enter", otp: "", otpErr: "" })}>Change number</button>
            <button className="link" onClick={() => { set({ sheet: true }); ask(L("I didn't get the OTP", "मुझे OTP नहीं मिला"), intentAadhaar()); }}>Didn't get the OTP?</button>
          </div>
          <button className="demo-fill" onClick={() => set({ otp: "123456", otpErr: "" })}>Demo: fill OTP 123456</button>
        </>
      )}
    </div>
  );
}
