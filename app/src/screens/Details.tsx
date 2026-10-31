import { set, useAppState, type Field, type WhyKey } from "../engine/store";
import { backHome, saveDetails } from "../engine/flow";
import { MicButton, VOICE_NOTE } from "./fields";

interface Def { field: Field & WhyKey; label: string; pre?: boolean; props: React.InputHTMLAttributes<HTMLInputElement>; clean?: (v: string) => string }

const DEFS: Def[] = [
  { field: "dName", label: "Full name, as on PAN", pre: true, props: { autoComplete: "name" } },
  { field: "dDob", label: "Date of birth", pre: true, props: { inputMode: "numeric", placeholder: "DD/MM/YYYY", maxLength: 10, autoComplete: "bday" }, clean: (v) => v.replace(/[^\d/]/g, "").slice(0, 10) },
  { field: "dEmail", label: "Email", props: { type: "email", placeholder: "name@example.com", autoComplete: "email" } },
  { field: "dPin", label: "PIN code", props: { inputMode: "numeric", maxLength: 6, placeholder: "6 digits", autoComplete: "postal-code" }, clean: (v) => v.replace(/\D/g, "").slice(0, 6) },
];

export function DetailsScreen() {
  const s = useAppState();
  const full = !s.mvp;
  return (
    <div className="screen" style={{ gap: 12 }}>
      <button className="back" onClick={backHome}>← Back</button>
      <div className="screen-title">Your details</div>
      <div className="screen-lede">We filled in what we already have. Check it matches your PAN card exactly, and add the rest. Secure form: the assistant can't see it.{full ? VOICE_NOTE : ""}</div>
      {DEFS.map((d) => (
        <label key={d.field}>
          <div className="field-head">
            <span>{d.label} · <button className="why" onClick={(e) => { e.preventDefault(); set({ why: d.field }); }}>Why we ask</button></span>
            {d.pre && <span className="pre">Pre-filled</span>}
          </div>
          <div className="field-row">
            <input className="input" {...d.props} value={s[d.field]} onChange={(e) => set({ [d.field]: d.clean ? d.clean(e.target.value) : e.target.value, dErr: "" })} />
            {full && <MicButton field={d.field} />}
          </div>
        </label>
      ))}
      <div className="err" role="alert">{s.dErr}</div>
      <button className="demo-fill" onClick={() => set({ dEmail: "chitra.sangatwani@example.com", dPin: "400001", dErr: "" })}>Demo: fill email and PIN</button>
      <button className="btn-lg" onClick={saveDetails}>Save and continue</button>
    </div>
  );
}
