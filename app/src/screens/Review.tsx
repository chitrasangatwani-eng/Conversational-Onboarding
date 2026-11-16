import { set, useAppState } from "../engine/store";
import { backHome, idStepLabel, openFees, ovdName, submitApplication } from "../engine/flow";
import { L } from "../engine/i18n";
import { T } from "../engine/t";

const ROWS = ["Mobile number", "Personal details", "KYC", "Video KYC"];

export function ReviewScreen() {
  const s = useAppState();
  return (
    <div className="screen">
      <button className="back" onClick={backHome}>← {T("Back")}</button>
      <div className="screen-title">{T("Review and submit")}</div>
      <div className="screen-lede">{T("Check each step below. Sensitive details aren't shown here.")}</div>
      <div className="list">
        {ROWS.map((r) => (r === "KYC" ? T("ID and address: {docs}", { docs: idStepLabel(s, L) + (s.addrDoc && !/same as ID/.test(s.addrDoc) ? " + " + T(s.addrDoc) : "") }) : T(r))).map((r) => (
          <div key={r} className="list-row"><span style={{ color: "oklch(0.45 0.17 262)", fontWeight: 700, width: 18 }}>✓</span><span style={{ flex: 1, fontSize: 14.5 }}>{r}</span><span style={{ fontSize: 12.5, color: "#5f6b80" }}>{T("Verified")}</span></div>
        ))}
      </div>
      {!s.mvp && <button className="link-strong" style={{ alignSelf: "flex-start" }} onClick={openFees}>{T("Read fees and terms")}</button>}
      {/* Placeholder consent wording: Legal to approve. */}
      <button role="checkbox" aria-checked={s.consent} onClick={() => set({ consent: !s.consent })} style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", border: 0, background: "none", font: "inherit", fontSize: 13.5, lineHeight: 1.45, padding: 0, cursor: "pointer", color: "#13203f" }}>
        <span className={"box" + (s.consent ? " on" : "")}>{s.consent ? "✓" : ""}</span>
        {T("I confirm my details are correct and consent to my {doc} and address document being used for KYC, as described in the privacy notice under the DPDP Act, 2023.", { doc: ovdName(s.ovd, L) })}
      </button>
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 12, color: "#5f6b80", lineHeight: 1.4 }}>{T("Submitting sends your application for review. It isn't an approval. You'll be notified of the decision.")}</div>
      <button className="btn-block" style={{ background: s.consent ? "oklch(0.5 0.17 262)" : "#aab4c4" }} onClick={submitApplication} aria-disabled={!s.consent}>{T("Submit application")}</button>
    </div>
  );
}
