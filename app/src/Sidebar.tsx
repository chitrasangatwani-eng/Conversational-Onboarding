import { useAppState } from "./engine/store";
import { openStep } from "./engine/flow";
import { steps } from "./screens/Home";

// Left-hand progress list on wide screens. Read-only: it mirrors the steps on Home.

export function Sidebar() {
  const s = useAppState();
  const list = steps(s);
  const done = list.slice(0, 4).filter((x) => x.look === "done").length;
  // Which step's screen is open now, to mark it in the list.
  const onScreen = (n: number) => ({ mobile: 1, details: 2, idchoice: 3, aadhaar: 3, form60: 3, addrchoice: 3, vkyc: 4, review: 5 } as Record<string, number>)[s.screen] === n
    || (s.screen === "secure" && n === (s.addr === "done" ? 4 : 3));
  return (
    <nav className="sidebar" aria-label="Your progress">
      <div className="sidebar-eyebrow">YOUR PROGRESS · {done} OF 5</div>
      <ol className="side-steps">
        {list.map((st) => (
          <li key={st.n}>
            <button className={"side-step " + st.look + (onScreen(st.n) ? " here" : "")} aria-current={st.look === "cur" ? "step" : undefined}
              aria-disabled={st.look === "x" || undefined} onClick={() => openStep(st.n, st.look, st.label)}>
              <div className={"step-dot " + st.look}>{st.look === "done" ? "✓" : st.look === "bad" ? "!" : st.n}</div>
              <div><div className="side-label">{st.label}</div><div className="side-sub">{st.sub}</div></div>
            </button>
          </li>
        ))}
      </ol>
      <div className="side-note" role="status">{s.navNote}</div>
      <img className="side-art" src={import.meta.env.BASE_URL + "brand/illustration.jpg"} alt="" />
    </nav>
  );
}
