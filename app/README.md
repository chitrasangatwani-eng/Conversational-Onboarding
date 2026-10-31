# Onboarding Assistant

React + Vite + TypeScript implementation of `project/Onboarding Assistant.dc.html` (the Claude Design handoff), with a small Node proxy for the Claude API.

## Run

```bash
cd app
npm install
export ANTHROPIC_API_KEY=...      # only needed for the 21 machine-translated languages
npm run dev                       # web on :5173, API on :8787 (Vite proxies /api)
```

Production: `npm run build && npm start` serves the built app and the API on `:8787` (`PORT` to change).

English and Hindi work with no key; they are hand-written in the code. Without a key, the other languages fall back to English.

## What's here

- **Demo shell** (`src/DemoPanel.tsx`): the phone frame and the prototype controls from the design (failure simulator, stale/unavailable status, assistant down, weak connection, reset). The design's Tweaks "mvp" prop is now a **Scope** switch in this panel. `?scope=full` opens the full version.
- **Flow** (`src/engine/flow.ts`, `src/screens/`): mobile OTP, personal details, PAN, address proof (photo or DigiLocker), Video KYC call, review and consent. Verification results are simulated here and stand in for the real backend.
- **Assistant** (`src/engine/assistant.ts`, `src/assistant/`): voice-first help with a text chat fallback. Intent routing, cited answers, blocker recovery, handoff with a reviewed summary, and refusals (approval, fees in MVP, off-topic). The assistant only reads state; it never changes it.
- **Voice** (`src/engine/voice.ts`): browser speech recognition and read-aloud. Field dictation is in the full scope only.
- **Languages** (`src/engine/i18n.ts`): 23 languages. UI labels are batched and translated through `/api/translate`. Free-text questions in non-local languages are classified through `/api/classify`.
- **Proxy** (`server/index.ts`): calls `claude-opus-5-5` (override with `CLAUDE_MODEL`) at `effort: "low"`, with structured JSON output and server-side refusal fallbacks (`fallbacks: "default"`). It validates the language, sizes and shape of each request, and refuses any text that looks like a PAN, Aadhaar, phone number or OTP. The client masks and blocks these too.

## Before real use

The prototype's placeholders are still placeholders: cited requirement texts, error codes, fee sheet (₹0), consent and "Why we ask" wording, queue numbers, and review times. They need Compliance and Legal sign-off. Machine translations need native-speaker review. Browser speech recognition sends audio to the browser vendor's service, which Privacy must approve or replace.
