import { useAppState } from "./engine/store";
import { steps } from "./screens/Home";

// Left-hand progress list on wide screens. Read-only: it mirrors the steps on Home.

export function Sidebar() {
  const s = useAppState();
  const list = steps(s);
  const done = list.slice(0, 5).filter((x) => x.look === "done").length;
  return (
    <nav className="sidebar" aria-label="Your progress">
      <div className="sidebar-eyebrow">YOUR PROGRESS · {done} OF 6</div>
      <ol className="side-steps">
        {list.map((st) => (
          <li key={st.n} className={"side-step " + st.look} aria-current={st.look === "cur" ? "step" : undefined}>
            <div className={"step-dot " + st.look}>{st.look === "done" ? "✓" : st.look === "bad" ? "!" : st.n}</div>
            <div><div className="side-label">{st.label}</div><div className="side-sub">{st.sub}</div></div>
          </li>
        ))}
      </ol>
      <img className="side-art" src={import.meta.env.BASE_URL + "brand/illustration.jpg"} alt="" />
    </nav>
  );
}
