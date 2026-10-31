import { set, useAppState } from "../engine/store";
import type { Msg } from "../engine/types";

/** One assistant transcript entry. */
export function MessageView({ m }: { m: Msg }) {
  const s = useAppState();
  const mine = m.kind === "text" && m.mine;
  const t = m.t ?? {};
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", gap: 6 }}>
      {m.kind === "text" && <div className={"bubble" + (mine ? " me" : "")}>{m.text}</div>}

      {m.kind === "status" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><b style={{ fontSize: 14 }}>{t.title}</b><span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "#6b7370" }}>{t.stamp}</span></div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {m.rows.map((r) => (
              <div key={r.label} style={{ display: "flex", gap: 8, fontSize: 13.5, alignItems: "center" }}>
                <span style={{ width: 18, textAlign: "center", color: r.color, fontWeight: 700 }}>{r.glyph}</span><span style={{ flex: 1 }}>{r.label}</span><span style={{ fontSize: 12, color: r.color }}>{r.state}</span>
              </div>
            ))}
          </div>
          {m.act && <button className="card-cta" onClick={m.act}>{m.nextLabel}</button>}
        </div>
      )}

      {m.kind === "source" && (
        <div className="card">
          <div style={{ fontSize: 14.5, lineHeight: 1.5 }}>{m.text}</div>
          <div className="src">{m.src}<br />{m.ver}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, fontSize: 12 }}>
            {(["yes", "no"] as const).map((k) => (
              <button key={k} className={"fb" + (s.feedback[m.id] === k ? " on" : "")} aria-pressed={s.feedback[m.id] === k}
                onClick={() => set({ feedback: { ...s.feedback, [m.id]: k } })}>{t[k]}</button>
            ))}
          </div>
        </div>
      )}

      {m.kind === "checklist" && (
        <div className="card">
          <b style={{ fontSize: 14 }}>{t.before}</b>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column" }}>
            {m.items.map((label, i) => (
              <button key={i} role="checkbox" aria-checked={s.checks[i]} onClick={() => set({ checks: s.checks.map((v, j) => (j === i ? !v : v)) })}
                style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left", border: 0, background: "none", font: "inherit", fontSize: 14, padding: 0, minHeight: 44, cursor: "pointer", color: "#1d2420" }}>
                <span className={"check" + (s.checks[i] ? " on" : "")}>{s.checks[i] ? "✓" : ""}</span>{label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: "#6b7370", margin: "4px 0 8px", lineHeight: 1.4 }}>{t.note}</div>
          <button className="card-cta" style={{ marginTop: 0 }} onClick={m.act}>{t.retry}</button>
        </div>
      )}

      {m.kind === "summary" && (
        <div className="card">
          <b style={{ fontSize: 14 }}>{t.sm1}</b>
          <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.55, color: "#4a534f" }}>{m.fields.map((f) => <div key={f}>· {f}</div>)}</div>
          <label style={{ display: "block", marginTop: 8 }}>
            <div style={{ fontSize: 12, color: "#4a534f", marginBottom: 4 }}>{t.sm2}</div>
            <input value={s.hgoal !== "" ? s.hgoal : m.goal} onChange={(e) => set({ hgoal: e.target.value })}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #cfc9bc", borderRadius: 10, padding: "0 12px", height: 44, font: "inherit", fontSize: 14, outline: "none" }} />
          </label>
          <div style={{ margin: "8px 0", fontSize: 11.5, color: "#6b7370", lineHeight: 1.4 }}>{t.sm5}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={m.confirmAct}>{t.sm3}</button>
            <button className="btn outline" onClick={m.declineAct}>{t.sm4}</button>
          </div>
        </div>
      )}

      {m.kind === "link" && <button className="btn" onClick={m.act}>{m.label}</button>}

      {m.kind === "secure" && (
        <div className="card warn">
          <b>{t.s1}</b> {t.s2}
          <button className="btn" style={{ marginTop: 10, display: "block" }} onClick={m.act}>{t.s3}</button>
        </div>
      )}

      {m.kind === "handoff" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 14 }}>{t.h1}</b><span style={{ fontFamily: "var(--mono)", fontSize: 11, background: "oklch(0.95 0.03 175)", borderRadius: 6, padding: "2px 6px" }}>live</span></div>
          <div style={{ fontSize: 22, fontWeight: 600, margin: "8px 0 2px" }}>{t.h2}</div>
          <div style={{ fontSize: 13, color: "#4a534f" }}>{t.h3}</div>
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed #d6d1c6", fontSize: 12, lineHeight: 1.55, color: "#4a534f" }}>
            <b style={{ color: "#1d2420" }}>{t.h4}</b>
            {m.fields.map((f) => <div key={f}>· {f}</div>)}
            <div style={{ marginTop: 4 }}>{t.h5}</div>
            {!s.mvp && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn" onClick={m.callAct}>{t.c1}</button>
                <button className="btn outline" onClick={m.centreAct}>{t.c2}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
