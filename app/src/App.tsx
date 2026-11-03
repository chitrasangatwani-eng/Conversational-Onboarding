import { useAppState } from "./engine/store";
import { DemoPanel } from "./DemoPanel";
import { Home } from "./screens/Home";
import { MobileScreen } from "./screens/Mobile";
import { DetailsScreen } from "./screens/Details";
import { CaptureScreen } from "./screens/Capture";
import { AadhaarScreen } from "./screens/Aadhaar";
import { Form60Screen } from "./screens/Form60";
import { IdChoiceScreen } from "./screens/IdChoice";
import { VideoKycScreen } from "./screens/VideoKyc";
import { FeesScreen } from "./screens/Fees";
import { ReviewScreen } from "./screens/Review";
import { ChatSheet } from "./assistant/ChatSheet";
import { VoiceSheet } from "./assistant/VoiceSheet";
import { WhySheet } from "./screens/WhySheet";
import { Sidebar } from "./Sidebar";

export function App() {
  const s = useAppState();
  return (
    <div className="stage">
      <div className="shell">
        <header className="topbar">
          <div className="logo" aria-hidden="true" />
          <div className="topbar-title">Open an account</div>
          <div className="topbar-user">Chitra Sangatwani · Applicant</div>
        </header>
        <div className="shell-body">
          <Sidebar />
          <main className="phone">
        {s.screen === "home" && <Home />}
        {s.screen === "secure" && <CaptureScreen />}
        {s.screen === "idchoice" && <IdChoiceScreen />}
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
          </main>
        </div>
      </div>
      <details className="demo-drawer">
        <summary>Demo</summary>
        <DemoPanel />
      </details>
    </div>
  );
}
