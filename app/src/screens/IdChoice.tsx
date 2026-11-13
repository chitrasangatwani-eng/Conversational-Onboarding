import { set, useAppState } from "../engine/store";
import { ID_PROOFS, backHome, chooseOvd } from "../engine/flow";

// Identity (step 3): the applicant picks any one identity proof.

export function IdChoiceScreen() {
  const s = useAppState();
  return (
    <div className="screen">
      <button className="back" onClick={backHome}>← Back</button>
      <div className="part-label">Part 1 of 2 · Identity</div>
      <div className="screen-title">ID and address proof</div>
      <div className="screen-lede">Choose <b>any one</b> ID. If it shows your current address, it covers your address too, so you're done in one go. Aadhaar is optional. <button className="why" onClick={() => set({ why: "pan" })}>Why we ask</button></div>
      {s.id === "rejected" && <div className="err" role="alert">The last document didn't go through. Try again, or choose a different one.</div>}
      <div className="opts id-opts">
        {ID_PROOFS.map((d) => (
          <button key={d.id} className={"choice" + (s.ovd === d.id ? " picked" : "")} onClick={() => chooseOvd(d.id)}>
            <span className="choice-title">{d.en}</span>
            <span className="choice-sub">{d.how}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
