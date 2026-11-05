import { set, useAppState, type State } from "../engine/store";
import { ctaLabel, goSecure, idStepLabel, openStep, openBlockerHelp, openFees, openHelp, stageKey, talkFromHome } from "../engine/flow";
import { ask, intentAadhaar, intentAddr, intentDetails, intentDocs, intentVideo } from "../engine/assistant";

type StepLook = "done" | "cur" | "bad" | "wait" | "x";
interface Step { n: number; label: string; sub: string; look: StepLook }

const CODE: Record<string, string> = { blur: "ID-204", name: "ID-310", otp: "ID-120" };

export function steps(s: State): Step[] {
  const { mob, det, id, addr: ad, selfie: sf } = s;
  const idSub = id === "done" ? (s.f60 ? "Verified · ID document" : s.idDoc === "aadhaar" ? "Verified · Aadhaar" : "Verified · PAN") : id === "rejected" ? "Not accepted · " + (CODE[s.reason] || "ID-204") : id === "pending" ? "Submitted · in verification" : det !== "done" ? "Locked until details are saved" : s.f60 ? "Form 60 saved · photo of your ID next" : "PAN photo or Aadhaar OTP · about 2 minutes";
  return [
    { n: 1, label: "Mobile number", sub: mob === "done" ? "Verified by OTP" : "About 1 minute", look: mob === "done" ? "done" : "cur" },
    { n: 2, label: "Personal details", sub: det === "done" ? "Saved" : mob === "done" ? "Pre-filled · about 1 minute" : "Locked until mobile verified", look: det === "done" ? "done" : mob === "done" ? "cur" : "x" },
    { n: 3, label: idStepLabel(s), sub: idSub, look: id === "done" ? "done" : id === "rejected" ? "bad" : id === "pending" ? "wait" : det !== "done" ? "x" : "cur" },
    { n: 4, label: "Address proof", sub: ad === "done" ? "Verified" : ad === "pending" ? "Submitted · in verification" : id === "done" ? "About 2 minutes" : "Locked until ID verified", look: ad === "done" ? "done" : ad === "pending" ? "wait" : id === "done" ? "cur" : "x" },
    { n: 5, label: "Video KYC", sub: sf === "done" ? "Verified" : sf === "pending" ? "Submitted · in verification" : sf === "rejected" ? "Not completed · VK-301" : ad === "done" ? "About 5 minutes · live agent" : "Locked", look: sf === "done" ? "done" : sf === "pending" ? "wait" : sf === "rejected" ? "bad" : ad === "done" ? "cur" : "x" },
    { n: 6, label: "Review and submit", sub: s.held ? "Extra check in progress" : s.submitted ? "Submitted · in review" : sf === "done" ? "Ready when you are" : "Locked", look: s.submitted ? "wait" : sf === "done" ? "cur" : "x" },
  ];
}

const NUDGES = {
  mob: ["Not sure which number to use?", intentAadhaar],
  det: ["Wondering why we need these details?", intentDetails],
  id: ["Not sure whether to use PAN or Aadhaar?", intentDocs],
  addr: ["Which address documents work?", intentAddr],
  vk: ["First time with Video KYC? See what to expect.", intentVideo],
} as const;

export function Home() {
  const s = useAppState();
  const full = !s.mvp;
  const list = steps(s);
  const done = list.slice(0, 5).filter((x) => x.look === "done").length;
  const cta = ctaLabel();
  // The step the applicant acts on next, or the one being checked.
  const hero = list.find((x) => x.look === "bad") ?? list.find((x) => x.look === "cur") ?? list.find((x) => x.look === "wait");
  const rejected = s.id === "rejected" || s.selfie === "rejected";
  const key = stageKey();
  const nudge = key ? NUDGES[key] : null;
  const nudgeOn = full && !!nudge && !s.nudgeOff[key] && !s.sheet && !s.down;
  const offNudge = () => set({ nudgeOff: { ...s.nudgeOff, [key]: true } });

  const banTitle = s.selfie === "rejected" ? "Video KYC didn't complete" : ({ blur: "PAN photo not accepted", name: "Name doesn't match exactly", otp: "Aadhaar OTP not received" } as Record<string, string>)[s.reason] || "PAN photo not accepted";
  const banSub = s.selfie === "rejected" ? "Code VK-301. Usually low light or a weak connection. Your other steps are safe." : ({ blur: "Image quality check failed · code ID-204. Your other steps are safe.", name: "Code ID-310. Small differences, like an initial, are common. Your other steps are safe.", otp: "Code ID-120. The OTP goes to the mobile linked to your Aadhaar. You have other ways to continue." } as Record<string, string>)[s.reason] || "";

  return (
    <>
      <div className="home">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div className="avatar">CS</div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 600 }}>Chitra Sangatwani</div><div style={{ fontSize: 13, color: "#5f6b80" }}>Signed in · Applicant</div></div>
        </div>
        <div style={{ fontSize: 14, color: "#5f6b80" }}>Welcome back, Chitra. Open your account</div>
        <div style={{ fontSize: 34, fontWeight: 600, lineHeight: 1.15, margin: "6px 0 18px" }}>{done} of 6 steps done</div>
        <div className="progress"><div style={{ width: (done / 6) * 100 + "%" }} /></div>

        {s.navNote && <div className="banner ok" role="status">{s.navNote}</div>}
        {s.dlNote && <div className="banner ok"><b>From DigiLocker.</b> {s.dlNote}.</div>}
        {s.saved && <div className="banner ok"><b>Saved.</b> We sent a link to your mobile. Open it any time and you will continue at step {Math.min(done + 1, 6)}.</div>}
        {s.weak && full && <div className="banner warn"><b>Weak connection.</b> Your progress is saved. Photos are compressed and uploads retry on their own. You can also ask for a call back.</div>}
        {s.data !== "fresh" && (
          <div className="banner warn">
            {s.data === "stale" ? "Status may be out of date. Last updated 20 minutes ago." : "We can't load your latest status right now. Showing what we last had. Nothing was lost."}
            <button className="banner-btn" onClick={() => set({ data: "fresh" })}>{s.data === "stale" ? "Refresh" : "Retry"}</button>
          </div>
        )}
        {s.id === "todo" && (
          <div className="intro-card" style={{ marginTop: 18 }}>
            <b style={{ fontSize: 15 }}>Before you start</b>
            <div style={{ marginTop: 8 }}>· 100% online. No branch visit needed.</div>
            <div>· Keep ready: your PAN card or your Aadhaar (with the mobile linked to it), and an address document if your current address isn't on them.</div>
            <div>· Your name, mobile and date of birth are already filled in. You won't type them again.</div>
            {full && <button className="link-strong" style={{ marginTop: 6 }} onClick={openFees}>See fees and terms first</button>}
          </div>
        )}
        {s.submitted && (
          <div className="panel ok">
            <div style={{ fontWeight: 600, fontSize: 15 }}>{s.held ? "Extra verification in progress" : "Application submitted"}</div>
            <div style={{ fontSize: 13, color: "#3c4659", marginTop: 4, lineHeight: 1.45 }}>
              {s.held ? "This is a routine extra check, not a rejection. A person will review it and message you. You don't need to do anything now." : "It's now in review. This isn't an approval yet. Next: review, then account ready. Reviews usually take 1 to 2 working days (placeholder). We'll message you on your registered mobile at each stage."}
            </div>
            {s.held && <button className="btn" style={{ marginTop: 8 }} onClick={talkFromHome}>Talk to a person</button>}
          </div>
        )}
        {rejected && (
          <div className="panel warn">
            <div style={{ fontWeight: 600, fontSize: 15 }}>{banTitle}</div>
            <div style={{ fontSize: 13, color: "#3c4659", margin: "4px 0 10px", lineHeight: 1.45 }}>{banSub}</div>
            <button onClick={openBlockerHelp} style={{ border: 0, background: "oklch(0.4 0.09 50)", color: "#fff", borderRadius: 10, padding: "10px 14px", font: "inherit", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>See how to fix this</button>
          </div>
        )}

        {!s.submitted && hero && (
          <div className={"upnext " + hero.look}>
            <div className="upnext-eyebrow">{hero.look === "wait" ? "IN VERIFICATION" : hero.look === "bad" ? "NEEDS YOUR ATTENTION" : "UP NEXT"}</div>
            <div className="upnext-title">{hero.label}</div>
            <div className="upnext-sub">{hero.sub}</div>
            {cta && <button className="upnext-btn" onClick={goSecure}>{cta}</button>}
          </div>
        )}

        <div className="steps">
          {list.map((st) => (
            <button key={st.n} className={"step " + st.look} aria-disabled={st.look === "x" || undefined} onClick={() => openStep(st.n, st.look, st.label)}>
              <div className={"step-dot " + st.look}>{st.look === "done" ? "✓" : st.look === "bad" ? "!" : st.n}</div>
              <div style={{ flex: 1 }}><div className="step-label">{st.label}</div><div className="step-sub">{st.sub}</div></div>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 18 }}>
          <button className="link" onClick={() => set({ saved: true })}>Finish later</button>
          {full && <button className="link" onClick={openFees}>Fees and terms</button>}
        </div>
      </div>

      {s.helpOn && (
        <>
          {nudgeOn && nudge && (
            <div className="nudge">
              <div>{nudge[0]}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button className="btn accent" onClick={() => { offNudge(); set({ sheet: true }); ask(nudge[0], nudge[1]()); }}>Explain</button>
                <button className="btn plain" onClick={offNudge}>Not now</button>
              </div>
            </div>
          )}
          <button className="fab" onClick={openHelp}><span className="ai-chip">AI</span>{s.down ? "Help (offline)" : "Help with this step"}</button>
        </>
      )}
    </>
  );
}
