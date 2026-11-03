import { set, useAppState } from "../engine/store";
import { backHome, chooseAadhaar, choosePan, openForm60 } from "../engine/flow";

// Identity step: the applicant picks PAN or Aadhaar. One is enough.

export function IdChoiceScreen() {
  const s = useAppState();
  return (
    <div className="screen">
      <button className="back" onClick={backHome}>← Back</button>
      <div className="screen-title">Verify your identity</div>
      <div className="screen-lede">Choose one. You only need your PAN <b>or</b> your Aadhaar, not both. <button className="why" onClick={() => set({ why: "pan" })}>Why we ask</button></div>
      {s.id === "rejected" && <div className="err" role="alert">The last try didn't go through. You can try again, or use the other document.</div>}
      <button className="choice" onClick={choosePan}>
        <span className="choice-title">PAN card</span>
        <span className="choice-sub">Take a photo of your PAN, or fetch it from DigiLocker</span>
      </button>
      <button className="choice" onClick={chooseAadhaar}>
        <span className="choice-title">Aadhaar</span>
        <span className="choice-sub">Get an OTP on the mobile linked to your Aadhaar, or fetch it from DigiLocker</span>
      </button>
      <button className="link" style={{ alignSelf: "flex-start" }} onClick={openForm60}>No PAN and don't want to use Aadhaar? Fill Form 60</button>
    </div>
  );
}
