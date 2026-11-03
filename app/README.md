# Onboarding Assistant

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/chitrasangatwani-eng/Conversational-Onboarding)

The button hosts the full app with its backend, so the mobile OTP and the human handoff work for real, in sandbox mode. It needs no keys.

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

## Hosting

- **Static site (GitHub Pages):** build with `VITE_API_BASE=https://<your-server> npx vite build --base=./` and publish `dist/` to the `gh-pages` branch. Without `VITE_API_BASE`, only English and Hindi work.
- **Translation server (Render):** `render.yaml` in the repo root is a Render Blueprint. Render then serves the app and `/api`, and asks once for `ANTHROPIC_API_KEY`.
- **Public-deployment limits:** set with environment variables.
  - `ALLOWED_ORIGINS`: the sites browsers may call the API from. The server's own pages are always allowed.
  - `PER_IP_LIMIT`: requests per visitor per 10 minutes. Default 120.
  - `DAILY_CALL_LIMIT`: Claude calls per day across all visitors. Default 2000.
- **Translation cache:** translations are kept in memory, so each string costs one call per language until the server restarts.
- **Health check:** `GET /api/health`.

## Integrations

Each real-world service connects through the backend with one connector per service. A sandbox version works now, and a real provider can be swapped in by changing settings, with no change to the app.

| Service | Status | Settings |
| --- | --- | --- |
| Mobile OTP by SMS | Built. Sandbox by default; MSG91 and Twilio connectors included but not yet tried against live accounts. | `OTP_PROVIDER` = `sandbox` / `msg91` / `twilio`, `OTP_SECRET`, and that provider's keys (see `server/otp/providers.ts`). App build: `VITE_BACKEND=server`. |
| PAN and Aadhaar checks | Simulated in the app | Needs a licensed KYC provider; Aadhaar OTP is limited to UIDAI-approved entities. |
| DigiLocker | Built. Sandbox by default (DigiLocker-style consent page with sample data); official DigiLocker connector included but not yet run against DigiLocker. | `DIGILOCKER_PROVIDER` = `sandbox` / `digilocker`, with `DIGILOCKER_CLIENT_ID`, `DIGILOCKER_CLIENT_SECRET`, `DIGILOCKER_REDIRECT_URI` (as registered with DigiLocker), optional `DIGILOCKER_BASE_URL`. Needs approval as a DigiLocker partner. |
| Video KYC | Simulated | Needs an RBI-compliant Video KYC vendor. |
| Human handoff | Built. Sandbox by default; webhook and Slack destinations included. | `HANDOFF_PROVIDER` = `sandbox` / `webhook` / `slack`, with `HANDOFF_WEBHOOK_URL` (+ optional `HANDOFF_WEBHOOK_SECRET`) or `HANDOFF_SLACK_WEBHOOK_URL`. |

**Mobile OTP rules.** The server creates and checks every code. Codes are stored only as keyed hashes. Each code:
- expires after 5 minutes;
- allows 5 tries;
- can be resent after 30 seconds, at most 5 times an hour per number.

A successful check returns a signed token. Codes are kept in memory, so running more than one server instance needs a shared store such as Redis.

**Sandbox.** No SMS is sent, and the code appears in the app's demo button. Never use sandbox with real users.

**Real SMS in India.** Real SMS needs DLT registration of the sender ID and the message template. For MSG91, the approved template's variable must be named `otp`.

**Human handoff.** "Send summary and connect", "Connect without summary" and "Call me back" each create a ticket with a reference such as `HO-3F9A1C`.
- **Summary language:** the summary goes to the team in English, whatever language the applicant uses. The goal is sent as the applicant typed it.
- **Never sent:** PAN or Aadhaar numbers, documents, photos or OTPs. Text that looks like an ID, a phone number or a 6-digit code is refused.
- **Mobile check:** if the applicant verified their mobile, the ticket says so and shows only its last 4 digits.
- **Webhook signature:** webhook deliveries are signed with `X-Signature: sha256=<HMAC of the body>`.
- **Queue numbers:** the queue position and wait are estimates from this server until a real helpdesk supplies them.

**DigiLocker.** "Fetch from DigiLocker instead" on the PAN and address steps opens DigiLocker in a new window. The applicant signs in and approves sharing there.
- **Exchange:** the server swaps the returned code for a token (OAuth 2.0 with PKCE), reads the issued-documents list and the e-Aadhaar address, then forgets the token.
- **What the app receives:** whether a PAN is in the locker, its last 4 characters, whether the name matches the PAN name in the form, and the address PIN code and state.
- **What the app never receives:** full numbers or documents. The assistant never sees any of it.
- **Name mismatch:** this is treated as ID-310 (name differs).
- **Before going live:** the real connector follows DigiLocker's Requester API (`/public/oauth2/1/authorize`, `/1/token`, `/2/files/issued`, `/3/xml/eaadhaar`). Check those paths and fields against the specification issued with your partner credentials.

**Backend modes.** When the app starts, it checks `/api/health`. If the backend answers, OTP and handoff go through it. If not, as on GitHub Pages, they are simulated in the browser: in the OTP demo any 6 digits work except `000000`. `VITE_BACKEND=server` or `VITE_BACKEND=local` forces a mode at build time.

## What's here

- **Demo shell** (`src/DemoPanel.tsx`): the phone frame and the prototype controls from the design (failure simulator, stale/unavailable status, assistant down, weak connection, reset). The design's Tweaks "mvp" prop is now a **Scope** switch in this panel. `?scope=full` opens the full version.
- **Flow** (`src/engine/flow.ts`, `src/screens/`): mobile OTP, personal details, PAN, address proof (photo or DigiLocker), Video KYC call, review and consent. Verification results are simulated here and stand in for the real backend.
- **Assistant** (`src/engine/assistant.ts`, `src/assistant/`): voice-first help with a text chat fallback. Intent routing, cited answers, blocker recovery, handoff with a reviewed summary, and refusals (approval, fees in MVP, off-topic). The assistant only reads state; it never changes it.
- **Voice** (`src/engine/voice.ts`): browser speech recognition and read-aloud. Field dictation is in the full scope only.
- **Languages** (`src/engine/i18n.ts`): 23 languages. UI labels are batched and translated through `/api/translate`. Free-text questions in non-local languages are classified through `/api/classify`.
- **Proxy** (`server/index.ts`): calls `claude-opus-5-5` (override with `CLAUDE_MODEL`) at `effort: "low"`, with structured JSON output and server-side refusal fallbacks (`fallbacks: "default"`). It validates the language, sizes and shape of each request, and refuses any text that looks like a PAN, Aadhaar, phone number or OTP. The client masks and blocks these too.

## Before real use

The prototype's placeholders are still placeholders: cited requirement texts, error codes, fee sheet (₹0), consent and "Why we ask" wording, queue numbers, and review times. They need Compliance and Legal sign-off. Machine translations need native-speaker review. Browser speech recognition sends audio to the browser vendor's service, which Privacy must approve or replace.
