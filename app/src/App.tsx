import { useAppState } from "./engine/store";
import { DemoPanel } from "./DemoPanel";
import { Home } from "./screens/Home";
import { MobileScreen } from "./screens/Mobile";
import { DetailsScreen } from "./screens/Details";
import { CaptureScreen } from "./screens/Capture";
import { VideoKycScreen } from "./screens/VideoKyc";
import { FeesScreen } from "./screens/Fees";
import { ReviewScreen } from "./screens/Review";
import { ChatSheet } from "./assistant/ChatSheet";
import { VoiceSheet } from "./assistant/VoiceSheet";
import { WhySheet } from "./screens/WhySheet";

export function App() {
  const s = useAppState();
  return (
    <div className="stage">
      <DemoPanel />
      <div className="phone">
        <div className="statusbar"><span>9:41</span><span className="net">LTE ▮▮▮</span></div>
        {s.screen === "home" && <Home />}
        {s.screen === "secure" && <CaptureScreen />}
        {s.screen === "details" && <DetailsScreen />}
        {s.screen === "mobile" && <MobileScreen />}
        {s.screen === "vkyc" && <VideoKycScreen />}
        {s.screen === "fees" && <FeesScreen />}
        {s.screen === "review" && <ReviewScreen />}
        {s.sheet && !s.vmode && <ChatSheet />}
        {s.sheet && s.vmode && <VoiceSheet />}
        {s.why && <WhySheet />}
      </div>
    </div>
  );
}
