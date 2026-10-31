import { set, useStore } from "../engine/store";

// "Why we ask" for every data request. Wording and legal basis are placeholders (Legal to confirm).
const WHY: Record<string, [what: string, why: string, ifNot: string]> = {
  mobNum: ["Your mobile number", "To send your OTP and message you about each step of your application.", "We can't verify you or send updates, so you can't continue online."],
  dName: ["Your name, as on PAN", "To match your PAN and Aadhaar records so verification does not fail later.", "We can't match your records, so verification can't complete."],
  dDob: ["Your date of birth", "To confirm you are 18 or older and to match your records.", "We can't confirm your age or match your records."],
  dEmail: ["Your email", "To send your account documents and updates.", "You can still continue. Updates would come by SMS only (placeholder)."],
  dPin: ["Your PIN code", "To check your address and route your application.", "We can't complete the address check."],
  pan: ["Your PAN card photo", "To verify your tax identity, which KYC requires for an account.", "We can't verify your identity, so you can't continue online."],
  addr: ["Your address document", "To confirm where you live, as KYC requires.", "We can't complete the address check."],
  vk: ["Your live video", "To confirm you are the person in your documents.", "We can't finish identity verification online. You could use an assisted centre."],
};

export function WhySheet() {
  const key = useStore((s) => s.why);
  const [what, why, ifNot] = WHY[key] ?? ["", "", ""];
  const close = () => set({ why: "" });
  return (
    <>
      <div onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(29,36,32,.45)" }} />
      <div role="dialog" aria-modal="true" aria-label={"Why we ask: " + what} style={{ position: "absolute", left: 12, right: 12, bottom: 12, background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 -6px 24px rgba(0,0,0,.25)" }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Why we ask: {what}</div>
        <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.5 }}>
          <b>Why:</b> {why}<br /><b>Legal basis:</b> KYC rules for opening an account (placeholder, Legal to confirm).<br /><b>If you don't provide it:</b> {ifNot}
        </div>
        <div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 11, color: "#6b7370" }}>Source: Data request explanations · v1.0 · 1 Sep 2026</div>
        <button className="btn" style={{ marginTop: 10, width: "100%" }} onClick={close} autoFocus>Got it</button>
      </div>
    </>
  );
}
