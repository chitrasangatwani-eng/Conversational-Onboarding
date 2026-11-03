import { set, useAppState, type State } from "../engine/store";
import { form60Error, submitForm60, usePanInstead } from "../engine/flow";

// Form 60: the declaration for applicants without a PAN. The fields follow the
// parts of Form 60 that the applicant answers here; name, date of birth,
// address and ID details come from the other steps. Wording is placeholder
// until Compliance and Legal approve it.

const INCOME = ["Up to ₹2.5 lakh", "₹2.5–5 lakh", "₹5–10 lakh", "Over ₹10 lakh"];

function Opts({ label, value, options, onPick }: { label: string; value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label}>
      <div className="q">{label}</div>
      <div className="opts">
        {options.map(([v, text]) => <button key={v} role="radio" aria-checked={value === v} className={"opt" + (value === v ? " on" : "")} onClick={() => onPick(v)}>{text}</button>)}
      </div>
    </div>
  );
}

export function Form60Screen() {
  const s = useAppState();
  const ready = !form60Error();
  return (
    <div className="screen">
      <button className="back" onClick={usePanInstead}>← Back</button>
      <div className="screen-title">Form 60</div>
      <div className="screen-lede">No PAN? Answer a few questions instead. We'll use your name, date of birth and address from the other steps.</div>

      <Opts label="Have you applied for a PAN?" value={s.f60Reason} options={[["applied", "Yes, applied"], ["none", "No"]]} onPick={(v) => set({ f60Reason: v as State["f60Reason"], f60Err: "" })} />

      {s.f60Reason === "applied" && (
        <div className="field-row" style={{ gap: 8 }}>
          <input className="input" style={{ flex: 3 }} value={s.f60Ack} onChange={(e) => set({ f60Ack: e.target.value.replace(/\D/g, "").slice(0, 15), f60Err: "" })} inputMode="numeric" placeholder="Acknowledgement no." aria-label="PAN application acknowledgement number" autoComplete="off" />
          <input className="input" style={{ flex: 2 }} value={s.f60AckDate} onChange={(e) => set({ f60AckDate: e.target.value.slice(0, 10), f60Err: "" })} placeholder="DD/MM/YYYY" aria-label="PAN application date" autoComplete="off" />
        </div>
      )}

      {s.f60Reason === "none" && <Opts label="Estimated income this year" value={s.f60Income} options={INCOME.map((x) => [x, x])} onPick={(v) => set({ f60Income: v, f60Err: "" })} />}

      {s.f60Reason && <Opts label="Any agricultural income?" value={s.f60Agri} options={[["yes", "Yes"], ["no", "No"]]} onPick={(v) => set({ f60Agri: v, f60Err: "" })} />}

      {s.f60Reason && (
        <button role="checkbox" aria-checked={s.f60Consent} onClick={() => set({ f60Consent: !s.f60Consent, f60Err: "" })} style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", border: 0, background: "none", font: "inherit", fontSize: 13, lineHeight: 1.45, padding: 0, cursor: "pointer", color: "#4a534f" }}>
          <span className={"box" + (s.f60Consent ? " on" : "")}>{s.f60Consent ? "✓" : ""}</span>
          I declare I don't have a PAN and this is true. A false Form 60 declaration is an offence. (Placeholder, Legal to approve.)
        </button>
      )}

      <div className="err" role="alert">{s.f60Err}</div>
      <button className={"btn-lg" + (ready ? "" : " is-off")} onClick={submitForm60}>Save and continue</button>
    </div>
  );
}
