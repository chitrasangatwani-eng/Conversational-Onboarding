import { set, useAppState, type Fail, type State } from "./engine/store";
import { resetPrototype } from "./engine/flow";

// Left-hand prototype controls. Not part of the customer app.

export function DemoPanel() {
  const s = useAppState();
  const full = !s.mvp;
  return (
    <div className="demo">
      <div className="demo-eyebrow">PROTOTYPE · PRD v2</div>
      <div className="demo-title">Onboarding assistant<span className="tag">{s.mvp ? "MVP" : "FULL"}</span></div>
      <button className="ctl" onClick={() => set({ mvp: !s.mvp, ...(!s.mvp && ["otp", "video", "security"].includes(s.fail) ? { fail: "blur" as Fail } : {}) })} aria-pressed={s.mvp}>
        Scope: <b>{s.mvp ? "MVP" : "Full"}</b> <span style={{ color: "#6b7370" }}>· switch to {s.mvp ? "full" : "MVP"}</span>
      </button>
      {s.mvp && (
        <div className="demo-scope">
          <b>In the MVP</b><br />Verified status and next step<br />Plain-language help and "Why we ask"<br />Recovery for 2 frequent errors<br />DigiLocker fetch for PAN and address<br />Human handoff with reviewed summary<br />Secure forms, AI label, opt-out, offline fallback<br />Voice help in 10 Indian languages
          <b style={{ display: "block", marginTop: 6 }}>Deferred</b>Voice form entry, weak-network mode, proactive prompts, fee sheet, call-back and assisted centres
        </div>
      )}
      <div className="demo-note">The flow is the system of record. Help is optional, reads verified state, and never approves anything. Try the chips, type a question, or paste a number.</div>
      <label className="ctl-label">Next failure to simulate
        <select className="ctl-select" value={s.fail} onChange={(e) => set({ fail: e.target.value as Fail })}>
          <option value="none">None (everything passes)</option>
          <option value="blur">PAN photo unreadable</option>
          <option value="name">Name mismatch, PAN vs Aadhaar</option>
          {full && <>
            <option value="otp">Aadhaar OTP can't be received</option>
            <option value="video">Video KYC fails</option>
            <option value="security">Extra security review</option>
          </>}
        </select>
      </label>
      {full && <button className="ctl" onClick={() => set({ weak: !s.weak })}>Simulate weak connection: <b>{s.weak ? "On" : "Off"}</b></button>}
      <label className="ctl-label">Status data from the system
        <select className="ctl-select" value={s.data} onChange={(e) => set({ data: e.target.value as State["data"] })}>
          <option value="fresh">Fresh</option>
          <option value="stale">Stale (20 minutes old)</option>
          <option value="down">Unavailable</option>
        </select>
      </label>
      <button className="ctl" onClick={() => set({ down: !s.down })}>Assistant service down: <b>{s.down ? "On" : "Off"}</b></button>
      <button className="ctl ctl-ghost" onClick={resetPrototype}>Reset prototype</button>
    </div>
  );
}
