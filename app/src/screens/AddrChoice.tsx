import { useAppState } from "../engine/store";
import { DEEMED, OVDS, backHome, chooseAddrDoc, ovdName, useDigiLocker, useIdForAddress } from "../engine/flow";

// Address (step 4): an officially valid document with the current address, or,
// for a limited time, a "deemed" document such as a recent utility bill.

export function AddrChoiceScreen() {
  const s = useAppState();
  const sameOk = !!s.ovd;
  return (
    <div className="screen">
      <button className="back" onClick={backHome}>← Back</button>
      <div className="screen-title">Proof of address</div>
      <div className="screen-lede">Choose one document that shows your <b>current</b> address.</div>
      {s.dlErr && <div className="err" role="alert">{s.dlErr}</div>}

      {sameOk && (
        <button className="choice" onClick={useIdForAddress}>
          <span className="choice-title">My {ovdName(s.ovd)} shows my current address</span>
          <span className="choice-sub">Use the identity document you already gave. Nothing more to upload.</span>
        </button>
      )}

      <div className="kyc-part">
        <div className="q">Identity documents with your address</div>
        <div className="opts">
          {OVDS.map((d) => (
            <button key={d.id} className="choice" onClick={() => (d.id === "aadhaar" ? useDigiLocker() : chooseAddrDoc(d.en))}>
              <span className="choice-title">{d.en}</span>
              <span className="choice-sub">{d.id === "aadhaar" ? "Fetch from DigiLocker" : "Photo of the address page"}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="kyc-part">
        <div className="q">Address not current on any of those?</div>
        <div className="choice-sub" style={{ marginBottom: 8 }}>You can use one of these for now. You'll need to give an updated identity document within 3 months.</div>
        <div className="opts">
          {DEEMED.map((d) => (
            <button key={d} className="choice" onClick={() => chooseAddrDoc(d)}>
              <span className="choice-title" style={{ fontSize: 15 }}>{d}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
