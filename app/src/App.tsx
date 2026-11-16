import { openHelp } from "./engine/flow";
import { useAppState } from "./engine/store";
import { DemoPanel } from "./DemoPanel";
import { Home } from "./screens/Home";
import { MobileScreen } from "./screens/Mobile";
import { DetailsScreen } from "./screens/Details";
import { CaptureScreen } from "./screens/Capture";
import { AadhaarScreen } from "./screens/Aadhaar";
import { Form60Screen } from "./screens/Form60";
import { IdChoiceScreen } from "./screens/IdChoice";
import { AddrChoiceScreen } from "./screens/AddrChoice";
import { VideoKycScreen } from "./screens/VideoKyc";
import { FeesScreen } from "./screens/Fees";
import { ReviewScreen } from "./screens/Review";
import { ChatSheet } from "./assistant/ChatSheet";
import { VoiceSheet } from "./assistant/VoiceSheet";
import { WhySheet } from "./screens/WhySheet";
import { Sidebar } from "./Sidebar";

const BRAND = import.meta.env.BASE_URL + "brand/";

/** Form screens that also offer AI help (home has its own button; the video call doesn't). */
const HELP_SCREENS = ["mobile", "details", "idchoice", "addrchoice", "aadhaar", "secure", "form60", "review"];

export function App() {
  const s = useAppState();
  const formHelp = HELP_SCREENS.includes(s.screen) && !s.sheet && !s.why;
  return (
    <div className="stage">
      <div className="shell">
        <header className="topbar">
          <img className="logo" src={BRAND + "logo.png"} alt="" />
          <div className="brand">Artha Inclusive</div>
          <div className="topbar-title">Open an account</div>
          <div className="topbar-user">Chitra Sangatwani · Applicant</div>
        </header>
        <div className="trust-strip" role="note">
          <span>Secure session</span>
          <span>The assistant never sees your PAN or Aadhaar number</span>
          <span>Video KYC is recorded only for KYC</span>
        </div>
        <div className="shell-body">
          <Sidebar />
          <main className={"phone" + (formHelp ? " with-fab" : "")}>
        {s.screen === "home" && <Home />}
        {s.screen === "secure" && <CaptureScreen />}
        {s.screen === "idchoice" && <IdChoiceScreen />}
        {s.screen === "addrchoice" && <AddrChoiceScreen />}
        {s.screen === "aadhaar" && <AadhaarScreen />}
        {s.screen === "form60" && <Form60Screen />}
        {s.screen === "details" && <DetailsScreen />}
        {s.screen === "mobile" && <MobileScreen />}
        {s.screen === "vkyc" && <VideoKycScreen />}
        {s.screen === "fees" && <FeesScreen />}
        {s.screen === "review" && <ReviewScreen />}
        {s.sheet && !s.vmode && <ChatSheet />}
        {s.sheet && s.vmode && <VoiceSheet />}
        {s.why && <WhySheet />}
        {formHelp && <button className="fab" onClick={openHelp}><span className="ai-chip">AI</span>{s.down ? "Help (offline)" : "Help with this step"}</button>}
          </main>
        </div>
      </div>
      <div id="fb-recaptcha" aria-hidden="true" />
      <details className="demo-drawer">
        <summary>Demo</summary>
        <DemoPanel />
      </details>
    </div>
  );
}
