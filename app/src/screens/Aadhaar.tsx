import { useEffect, useState } from "react";
import { set, useAppState } from "../engine/store";
import { aadhaarViaDigiLocker, chooseIdDoc, choosePan, sendAadhaarOtp, verifyAadhaarOtp } from "../engine/flow";

// Secure Aadhaar OTP form. The full number goes only to the server, is never
// shown to the assistant, and is cleared from the app once the OTP is sent.

const DEMO_NUMBER = "234567890124";
const group = (n: string) => n.replace(/(\d{4})(?=\d)/g, "$1 ");

export function AadhaarScreen() {
  const s = useAppState();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (s.aadResendAt <= Date.now()) return;
    const t = setInterval(() => { setTick((n) => n + 1); if (s.aadResendAt <= Date.now()) clearInterval(t); }, 1000);
    return () => clearInterval(t);
  }, [s.aadResendAt]);
  const resendIn = Math.max(0, Math.ceil((s.aadResendAt - Date.now()) / 1000));
  const ready = s.aadNum.length === 12 && s.aadConsent;

  return (
    <div className="screen">
      <button className="back" onClick={chooseIdDoc}>← Back</button>
      <div className="screen-title">Verify Aadhaar</div>
      <div className="secure-note"><span style={{ fontFamily: "var(--mono)" }}>🔒</span>Secure form. The assistant never sees your Aadhaar number or OTP.</div>
      {s.aadStage === "enter" ? (
        <>
          <div className="screen-lede">We'll send an OTP to the mobile linked to your Aadhaar. You don't need your PAN for this. <button className="why" onClick={() => set({ why: "aadhaar" })}>Why we ask</button></div>
          <input className="input big" value={group(s.aadNum)} onChange={(e) => set({ aadNum: e.target.value.replace(/\D/g, "").slice(0, 12), aadErr: "" })}
            inputMode="numeric" placeholder="1234 5678 9012" aria-label="Aadhaar number" autoComplete="off" style={{ letterSpacing: ".08em" }} />
          <button role="checkbox" aria-checked={s.aadConsent} onClick={() => set({ aadConsent: !s.aadConsent, aadErr: "" })}
            style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", border: 0, background: "none", font: "inherit", fontSize: 13.5, lineHeight: 1.45, padding: 0, cursor: "pointer", color: "#13203f" }}>
            <span className={"box" + (s.aadConsent ? " on" : "")}>{s.aadConsent ? "✓" : ""}</span>
            I consent to my Aadhaar number being used to verify my identity with UIDAI for opening this account (KYC). (Placeholder wording, Legal to approve.)
          </button>
          <div className="err" role="alert">{s.aadErr}</div>
          <button className={"btn-lg" + (ready ? "" : " is-off")} onClick={sendAadhaarOtp} aria-busy={s.aadBusy}>{s.aadBusy ? "Sending…" : "Send OTP"}</button>
          <div style={{ display: "flex", gap: 18 }}>
            <button className="link" onClick={aadhaarViaDigiLocker} aria-busy={s.dlBusy}>{s.dlBusy ? "Waiting for DigiLocker…" : "Use DigiLocker instead"}</button>
            <button className="link" onClick={choosePan}>Use PAN instead</button>
          </div>
          {s.dlErr && <div className="err" role="alert">{s.dlErr}</div>}
          <button className="demo-fill" onClick={() => set({ aadNum: DEMO_NUMBER, aadConsent: true, aadErr: "" })}>Demo: fill {group(DEMO_NUMBER)}</button>
        </>
      ) : (
        <>
          <div className="screen-lede">Enter the 6-digit OTP sent to the mobile linked to Aadhaar ending {s.aadLast4}.</div>
          <input className="input big" style={{ textAlign: "center", letterSpacing: ".4em" }} value={s.aadOtp}
            onChange={(e) => set({ aadOtp: e.target.value.replace(/\D/g, "").slice(0, 6), aadErr: "" })}
            inputMode="numeric" maxLength={6} placeholder="••••••" aria-label="Aadhaar OTP" autoComplete="one-time-code" />
          <div className="err" role="alert">{s.aadErr}</div>
          <button className={"btn-lg" + (s.aadOtp.length === 6 ? "" : " is-off")} onClick={verifyAadhaarOtp} aria-busy={s.aadBusy}>{s.aadBusy ? "Checking…" : "Verify"}</button>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
            <button className="link-strong" style={{ textDecoration: "none", ...(resendIn ? { color: "#5f6b80", cursor: "default" } : {}) }} aria-disabled={!!resendIn}
              onClick={() => { if (!resendIn) set({ aadStage: "enter", aadOtp: "", aadErr: "Enter your Aadhaar number again to get a new OTP." }); }}>
              {resendIn ? `New OTP in ${resendIn}s` : "Get a new OTP"}
            </button>
            <button className="link" onClick={aadhaarViaDigiLocker}>Use DigiLocker instead</button>
          </div>
          {s.aadDemo && <div style={{ fontSize: 12, color: "#5f6b80" }}>Sandbox mode: no OTP was sent. Use the demo button below.</div>}
          {s.aadDemo && <button className="demo-fill" onClick={() => set({ aadOtp: s.aadDemo, aadErr: "" })}>Demo: fill OTP {s.aadDemo}</button>}
        </>
      )}
    </div>
  );
}
