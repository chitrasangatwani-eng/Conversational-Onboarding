import type { State } from "../engine/store";
import { LR } from "../engine/i18n";
import {
  ask, intentAadhaar, intentAddr, intentApproval, intentBranch, intentDetails, intentDocs, intentFees,
  intentFix, intentGlossary, intentHeld, intentName, intentSafety, intentStatus, intentVideo,
} from "../engine/assistant";
import type { Msg } from "../engine/types";

export interface Chip { label: string; go: () => void }

/** Suggested questions for the current step. Call during render (labels are queued for translation). */
export function chipsFor(s: State): Chip[] {
  const full = !s.mvp, { mob, det, id, addr: ad, selfie: sf } = s;
  const c = (label: string, fn: () => Msg[]): Chip => ({ label, go: () => ask(label, fn()) });
  const chips: Chip[] = [
    c(LR("What's left?", "क्या बाकी है?"), intentStatus),
    ad === "done" ? c(LR("How does Video KYC work?", "वीडियो KYC कैसे होता है?"), intentVideo)
      : id === "done" ? c(LR("What counts as address proof?", "पते का कौन-सा प्रमाण चलेगा?"), intentAddr)
      : c(LR("What do I need for identity?", "पहचान के लिए क्या चाहिए?"), intentDocs),
  ];
  if (mob === "done" && det !== "done") chips.unshift(c(LR("Why do you need these details?", "ये जानकारी क्यों चाहिए?"), intentDetails));
  if (full && mob !== "done") chips.unshift(c(LR("Which mobile number do I use?", "कौन-सा मोबाइल नंबर इस्तेमाल करूँ?"), intentAadhaar));
  if (id === "rejected" || sf === "rejected") chips.unshift(c(LR("Why did this fail?", "यह क्यों नहीं हुआ?"), intentFix));
  if (s.held) chips.unshift(c(LR("Why an extra check?", "अतिरिक्त जाँच क्यों?"), intentHeld));
  if (full && (id === "todo" || id === "rejected")) {
    chips.push(c(LR("Aadhaar not linked to my mobile", "आधार मेरे मोबाइल से लिंक नहीं है"), intentAadhaar), c(LR("Name differs on PAN and Aadhaar", "PAN और आधार में नाम अलग है"), intentName));
  }
  if (full) chips.push(c(LR("What is KYC?", "KYC क्या है?"), intentGlossary));
  chips.push(c(LR("Is my data safe?", "क्या मेरा डेटा सुरक्षित है?"), intentSafety));
  if (full) chips.push(c(LR("Do I need to visit a branch?", "क्या मुझे शाखा जाना होगा?"), intentBranch), c(LR("What are the fees?", "शुल्क कितना है?"), intentFees));
  chips.push(c(LR("Will I be approved?", "क्या मेरा आवेदन मंज़ूर होगा?"), intentApproval));
  return chips;
}
