import type { ReactNode } from "react";
import { set, useAppState, type State } from "../engine/store";
import { form60Error, submitForm60, usePanInstead } from "../engine/flow";

// Form 60: the declaration for applicants without a PAN. The fields follow the
// parts of Form 60 that the applicant answers here; name, date of birth,
// address and ID details come from the other steps. Wording is placeholder
// until Compliance and Legal approve it.

const INCOME = ["Up to ₹2.5 lakh", "₹2.5 lakh to ₹5 lakh", "₹5 lakh to ₹10 lakh", "Over ₹10 lakh"];
const row = { display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", border: 0, background: "none", font: "inherit", fontSize: 14, lineHeight: 1.45, padding: "4px 0", cursor: "pointer", color: "#1d2420" } as const;

function Choice({ on, onPick, children }: { on: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button role="radio" aria-checked={on} onClick={onPick} style={row}>
      <span className={"box" + (on ? " on" : "")} style={{ borderRadius: 11, fontSize: 10 }}>{on ? "●" : ""}</span>
      <span>{children}</span>
    </button>
  );
}

const pick = (patch: Partial<State>) => () => set({ ...patch, f60Err: "" });

export function Form60Screen() {
  const s = useAppState();
  const ready = !form60Error();
  return (
    <div className="screen">
      <button className="back" onClick={usePanInstead}>← Back</button>
      <div className="screen-title">Form 60 (no PAN)</div>
      <div className="screen-lede">If you don't have a PAN, Form 60 is the declaration you give instead. We fill in your name, date of birth and address from your other steps, then ask for a photo of another ID.</div>

      <div role="radiogroup" aria-label="PAN application">
        <div className="field-head"><span>Have you applied for a PAN?</span></div>
        <Choice on={s.f60Reason === "applied"} onPick={pick({ f60Reason: "applied" })}>Yes, I've applied and am waiting for it</Choice>
        <Choice on={s.f60Reason === "none"} onPick={pick({ f60Reason: "none" })}>No, I haven't applied</Choice>
      </div>

      {s.f60Reason === "applied" && (
        <>
          <label>
            <div className="field-head"><span>Acknowledgement number</span></div>
            <input className="input" value={s.f60Ack} onChange={(e) => set({ f60Ack: e.target.value.replace(/\D/g, "").slice(0, 15), f60Err: "" })} inputMode="numeric" placeholder="From your PAN application receipt" aria-label="PAN application acknowledgement number" autoComplete="off" />
          </label>
          <label>
            <div className="field-head"><span>Date you applied</span></div>
            <input className="input" value={s.f60AckDate} onChange={(e) => set({ f60AckDate: e.target.value.slice(0, 10), f60Err: "" })} placeholder="DD/MM/YYYY" aria-label="PAN application date" autoComplete="off" />
          </label>
        </>
      )}

      {s.f60Reason === "none" && (
        <div role="radiogroup" aria-label="Estimated income">
          <div className="field-head"><span>Your estimated total income this financial year</span></div>
          {INCOME.map((x) => <Choice key={x} on={s.f60Income === x} onPick={pick({ f60Income: x })}>{x}</Choice>)}
        </div>
      )}

      {s.f60Reason && (
        <div role="radiogroup" aria-label="Agricultural income">
          <div className="field-head"><span>Do you have agricultural income?</span></div>
          <div style={{ display: "flex", gap: 20 }}>
            <Choice on={s.f60Agri === "yes"} onPick={pick({ f60Agri: "yes" })}>Yes</Choice>
            <Choice on={s.f60Agri === "no"} onPick={pick({ f60Agri: "no" })}>No</Choice>
          </div>
        </div>
      )}

      {s.f60Reason && (
        <button role="checkbox" aria-checked={s.f60Consent} onClick={() => set({ f60Consent: !s.f60Consent, f60Err: "" })} style={{ ...row, fontSize: 13.5 }}>
          <span className={"box" + (s.f60Consent ? " on" : "")}>{s.f60Consent ? "✓" : ""}</span>
          I declare that I don't have a PAN and that what I've entered is true. I understand that a false declaration in Form 60 is an offence under the Income-tax Act. (Placeholder wording, Legal to approve.)
        </button>
      )}

      <div style={{ fontSize: 12, color: "#6b7370", lineHeight: 1.4 }}>Some accounts have limits or need a PAN later. We'll tell you before you submit if that applies. (Placeholder, Compliance to confirm.)</div>
      <div className="err" role="alert">{s.f60Err}</div>
      <button className={"btn-lg" + (ready ? "" : " is-off")} onClick={submitForm60}>Save and continue</button>
      <button className="link" style={{ alignSelf: "flex-start" }} onClick={usePanInstead}>I have a PAN</button>
    </div>
  );
}
