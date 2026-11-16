import { useAppState } from "../engine/store";
import { DEEMED, OVDS, backHome, chooseAddrDoc, ovdName, useIdForAddress } from "../engine/flow";
import { L } from "../engine/i18n";
import { T } from "../engine/t";

// Address (step 4): an officially valid document with the current address, or,
// for a limited time, a "deemed" document such as a recent utility bill.

export function AddrChoiceScreen() {
  const s = useAppState();
  // PAN cards don't show an address, so PAN always needs a separate address document.
  const sameOk = !!s.ovd && s.ovd !== "pan";
  return (
    <div className="screen">
      <button className="back" onClick={backHome}>← {T("Back")}</button>
      <div className="part-label">{T("Part 2 of 2 · Address")}</div>
      <div className="screen-title">{T("ID and address proof")}</div>
      <div className="screen-lede">{sameOk ? T("Does your {doc} show your current address? If not, choose another document below.", { doc: ovdName(s.ovd, L) }) : T("Your {doc} doesn't show an address, so choose one document that shows your current address.", { doc: ovdName(s.ovd, L) })}</div>
      {s.dlErr && <div className="err" role="alert">{T(s.dlErr)}</div>}

      {sameOk && (
        <button className="choice" onClick={useIdForAddress}>
          <span className="choice-title">{T("My {doc} shows my current address", { doc: ovdName(s.ovd, L) })}</span>
          <span className="choice-sub">{T("Use the identity document you already gave. Nothing more to upload.")}</span>
        </button>
      )}

      <div className="kyc-part">
        <div className="q">{T("Identity documents with your address")}</div>
        <div className="opts">
          {OVDS.filter((d) => !sameOk || d.id !== s.ovd).map((d) => (
            <button key={d.id} className="choice" onClick={() => chooseAddrDoc(d.en)}>
              <span className="choice-title">{T(d.en)}</span>
              <span className="choice-sub">{T(d.id === "aadhaar" ? "DigiLocker, or upload a masked copy" : "DigiLocker, or a photo or upload of the address page")}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="kyc-part">
        <div className="q">{T("Address not current on any of those?")}</div>
        <div className="choice-sub" style={{ marginBottom: 8 }}>{T("You can use one of these for now. You'll need to give an updated identity document within 3 months.")}</div>
        <div className="opts">
          {DEEMED.map((d) => (
            <button key={d} className="choice" onClick={() => chooseAddrDoc(d)}>
              <span className="choice-title" style={{ fontSize: 15 }}>{T(d)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
