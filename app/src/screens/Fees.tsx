import { backFromFees } from "../engine/flow";

// PLACEHOLDER values: replace with the Compliance-approved fee sheet before launch.
const ROWS = [
  { label: "Account opening", note: "₹0" },
  { label: "Minimum balance", note: "₹0" },
  { label: "Debit card, first year", note: "₹0" },
  { label: "SMS and email alerts", note: "₹0" },
  { label: "Full terms (PDF)", note: "v1.0" },
];

export function FeesScreen() {
  return (
    <div className="screen">
      <button className="back" onClick={backFromFees}>← Back</button>
      <div className="screen-title">Fees and terms</div>
      <div className="screen-lede">Read this before you sign. Same sheet for everyone. The assistant never quotes fees itself.</div>
      <div className="list">
        {ROWS.map((r) => (
          <div key={r.label} className="list-row"><span style={{ flex: 1, fontSize: 14.5 }}>{r.label}</span><span style={{ fontFamily: "var(--mono)", fontSize: 13 }}>{r.note}</span></div>
        ))}
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#6b7370", lineHeight: 1.5 }}>Fee sheet v1.0 · PLACEHOLDER VALUES. Replace with the Compliance-approved fee sheet before launch.</div>
    </div>
  );
}
