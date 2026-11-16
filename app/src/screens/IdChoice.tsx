import { set, useAppState } from "../engine/store";
import { ID_PROOFS, backHome, chooseOvd } from "../engine/flow";
import { T } from "../engine/t";

// Identity (step 3): the applicant picks any one identity proof.

export function IdChoiceScreen() {
  const s = useAppState();
  return (
    <div className="screen">
      <button className="back" onClick={backHome}>← {T("Back")}</button>
      <div className="part-label">{T("Part 1 of 2 · Identity")}</div>
      <div className="screen-title">{T("ID and address proof")}</div>
      <div className="screen-lede">{T("Choose any one ID. If it shows your current address, it covers your address too, so you're done in one go. Aadhaar is optional.")} <button className="why" onClick={() => set({ why: "pan" })}>{T("Why we ask")}</button></div>
      {s.id === "rejected" && <div className="err" role="alert">{T("The last document didn't go through. Try again, or choose a different one.")}</div>}
      <div className="opts id-opts">
        {ID_PROOFS.map((d) => (
          <button key={d.id} className={"choice" + (s.ovd === d.id ? " picked" : "")} onClick={() => chooseOvd(d.id)}>
            <span className="choice-title">{T(d.en)}</span>
            <span className="choice-sub">{T(d.how)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
