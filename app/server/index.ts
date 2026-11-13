// Backend for the onboarding app: the Claude proxy and the integration layer.
//
// Assistant (no identity data allowed):
//   POST /api/translate  { language, strings[] }  -> { strings: (string|null)[] }
//   POST /api/classify   { language, text }       -> { code }
//   POST /api/answer     { language, question, step } -> { type: "answer", text, source } | { type: "action", action } | { type: "abstain" }
//                        (Groq, when GROQ_API_KEY is set; answers only from src/engine/kb.ts)
// These carry only static UI copy or a short free-text question. Anything that
// looks like a PAN, Aadhaar, phone number or OTP is refused here as well as on
// the client, so identity data never reaches the assistant.
//
// Secure-form integrations (identity data, never shown to the assistant):
//   POST /api/otp/send    { mobile?, email? } (email if given, else SMS)           -> { requestId, maskedMobile, expiresIn, resendIn, sandboxCode? }
//   POST /api/otp/firebase { idToken }  (SMS sent by Firebase in the app) -> { verified, token, maskedMobile }
//   POST /api/otp/verify  { requestId, code }   -> { verified, token? , reason?, attemptsLeft? }
//   POST /api/aadhaar/otp     { aadhaar, consent: true }      -> { ref, last4, sandboxCode? }
//   POST /api/aadhaar/verify  { ref, otp, expectedName }      -> { verified, last4, nameMatch, pincode, state }
//   POST /api/digilocker/start  { purpose, expectedName } -> { state, url }   (open url in a window)
//   GET  /api/digilocker/callback (DigiLocker redirects here)  POST /api/digilocker/result { state }
//   POST /api/handoff     { kind, language, share, summary[], goal, mobileToken? } -> { ticketId, position, waitMinutes }
// The SMS provider is chosen with OTP_PROVIDER (see otp/providers.ts) and the
// handoff destination with HANDOFF_PROVIDER (see handoff/service.ts).
//
// In production (`npm start`) it also serves the built app from dist/.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { OtpService } from "./otp/service";
import { GroqAnswers, GROQ_MODEL } from "./answer/groq";
import { FirebasePhoneVerifier, firebaseConfigFromEnv } from "./otp/firebase";
import { webhookReceive, webhookVerify, whatsappCheck, whatsappHelloNumber } from "./otp/whatsapp";
import { aboutPage, withBusiness } from "./business";
import { providersFromEnv } from "./otp/providers";
import { HandoffService } from "./handoff/service";
import { DigiLockerService, callbackPage, sandboxConsentPage } from "./digilocker/service";
import { AadhaarService } from "./aadhaar/service";

const otp = new OtpService(providersFromEnv());
const groq = new GroqAnswers();
const firebase = new FirebasePhoneVerifier();
const firebaseWeb = firebaseConfigFromEnv();
// SMS_PROVIDER (or OTP_PROVIDER) decides the mobile route. Firebase settings alone don't switch it on,
// so they can stay in place while WhatsApp (or another provider) is in use.
const smsRoute = otp.smsProviderName === "firebase" ? (firebaseWeb && firebase.enabled ? "firebase" : "server") : otp.smsProviderName === "whatsapp" ? "whatsapp" : "server";
if (otp.smsProviderName === "firebase" && !(firebaseWeb && firebase.enabled)) console.warn("[otp] SMS_PROVIDER=firebase but FIREBASE_PROJECT_ID is not set; mobile OTP won't work");
const handoff = new HandoffService();
const digilocker = new DigiLockerService();
const aadhaar = new AadhaarService();

/** This server's public origin (Render sits behind a proxy that sets x-forwarded-proto). */
const originOf = (req: http.IncomingMessage) =>
  (String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim()) + "://" + req.headers.host;

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const PORT = Number(process.env.PORT || 8787);
const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, "../dist");

// Language codes the app offers, mapped to the name used in the prompt.
const LANGS: Record<string, string> = {
  as: "Assamese", bn: "Bengali", brx: "Bodo", doi: "Dogri", gu: "Gujarati", hi: "Hindi",
  kn: "Kannada", ks: "Kashmiri", kok: "Konkani", mai: "Maithili", ml: "Malayalam",
  mni: "Manipuri (Meitei)", mr: "Marathi", ne: "Nepali", or: "Odia", pa: "Punjabi",
  sa: "Sanskrit", sat: "Santali", sd: "Sindhi", ta: "Tamil", te: "Telugu", ur: "Urdu",
};

export const INTENT_CODES = [
  "status", "docs", "addr", "video", "aadhaar", "name", "blocker", "approval",
  "handoff", "safety", "glossary", "branch", "fees", "abstain",
] as const;

const MAX_STRINGS = 40;
const MAX_CHARS = 12000;
const MAX_TEXT = 500;

// Same patterns the client masks: long digit runs (Aadhaar, phone, account)
// and PAN format. Short digit runs (OTP/PIN) are refused too.
const SENSITIVE = [/\d[\d\s-]{6,}/, /[a-z]{5}\d{4}[a-z]/i, /^\D{0,12}\d{4,6}\D{0,3}$/];

let client: Anthropic | null = null;
function claude(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

class BudgetError extends Error {}

async function complete(prompt: string, schema: Record<string, unknown>, maxTokens: number) {
  if (!takeCall()) throw new BudgetError("daily limit reached");
  const res = await claude().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") throw new Error("refused");
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return JSON.parse(text) as unknown;
}

// The app's copy is fixed, so each string is translated once per language and
// then served from memory to every visitor.
const cache = new Map<string, string>();
const MAX_CACHE = 20000;

async function translate(language: string, strings: string[]): Promise<(string | null)[]> {
  const key = (s: string) => language + "\u0000" + s;
  const todo = [...new Set(strings.filter((s) => !cache.has(key(s))))];
  if (todo.length) {
    const out = await translateFresh(language, todo);
    todo.forEach((s, i) => { const v = out[i]; if (v && cache.size < MAX_CACHE) cache.set(key(s), v); });
  }
  return strings.map((s) => cache.get(key(s)) ?? null);
}

async function translateFresh(language: string, strings: string[]): Promise<(string | null)[]> {
  const prompt =
    "Translate each string in this JSON array from English to " + LANGS[language] +
    " for an Indian fintech onboarding assistant. Write in the native script of that language. " +
    "Use plain, polite everyday wording a first-time applicant understands. Keep codes and terms " +
    "such as ID-204, PAN, Aadhaar, OTP, KYC, DigiLocker and Video KYC as they are. Keep numbers intact. " +
    "Return the translations in the same order, one per input string.\n" + JSON.stringify(strings);
  const schema = {
    type: "object",
    properties: { translations: { type: "array", items: { type: "string" } } },
    required: ["translations"],
    additionalProperties: false,
  };
  const out = (await complete(prompt, schema, 16000)) as { translations?: unknown };
  const arr = Array.isArray(out.translations) ? out.translations : [];
  // A wrong-length answer can't be aligned, so the client keeps English.
  if (arr.length !== strings.length) return strings.map(() => null);
  return arr.map((s) => (typeof s === "string" && s.trim() ? s : null));
}

async function classify(language: string, text: string): Promise<string> {
  const prompt =
    "Classify this customer message (language: " + (LANGS[language] || "English") +
    ") from a bank onboarding chat into exactly one code: status (what is left / progress), " +
    "docs (what identity or PAN or Aadhaar documents are needed), addr (address proof), video (video KYC), " +
    "aadhaar (Aadhaar not linked to mobile / OTP problem), name (name mismatch between PAN and Aadhaar), " +
    "blocker (why a photo was rejected), approval (will I be approved), handoff (wants a person), " +
    "safety (is my data safe, scams, OTP), glossary (what does KYC/PAN/Aadhaar mean), " +
    "branch (do I need to visit a branch), fees (fees or charges), " +
    "abstain (anything else, interest rates, off-topic).\nMessage: " + text;
  const schema = {
    type: "object",
    properties: { code: { type: "string", enum: [...INTENT_CODES] } },
    required: ["code"],
    additionalProperties: false,
  };
  const out = (await complete(prompt, schema, 1024)) as { code?: string };
  return INTENT_CODES.includes(out.code as (typeof INTENT_CODES)[number]) ? out.code! : "abstain";
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 64 * 1024) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function errorStatus(e: unknown): number {
  if (e instanceof BudgetError) return 429;
  if (e instanceof Anthropic.RateLimitError) return 429;
  if (e instanceof Anthropic.AuthenticationError) return 503;
  if (e instanceof Anthropic.APIConnectionError) return 502;
  if (e instanceof Anthropic.APIError) return 502;
  return 500;
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });
  let body: any;
  try { body = await readJson(req); } catch { return send(res, 400, { error: "invalid body" }); }

  if (url.pathname === "/api/translate") {
    const { language, strings } = body ?? {};
    if (!LANGS[language]) return send(res, 400, { error: "unsupported language" });
    if (!Array.isArray(strings) || !strings.length || strings.length > MAX_STRINGS ||
        strings.some((s) => typeof s !== "string") ||
        strings.reduce((n: number, s: string) => n + s.length, 0) > MAX_CHARS) {
      return send(res, 400, { error: "invalid strings" });
    }
    try { return send(res, 200, { strings: await translate(language, strings) }); }
    catch (e) { console.error("translate failed:", (e as Error).message); return send(res, errorStatus(e), { error: "translate failed" }); }
  }

  if (url.pathname === "/api/classify") {
    const { language, text } = body ?? {};
    if (language !== "en" && !LANGS[language]) return send(res, 400, { error: "unsupported language" });
    if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT) return send(res, 400, { error: "invalid text" });
    if (SENSITIVE.some((r) => r.test(text))) return send(res, 422, { error: "sensitive data refused" });
    try { return send(res, 200, { code: await classify(language, text) }); }
    catch (e) { console.error("classify failed:", (e as Error).message); return send(res, errorStatus(e), { error: "classify failed" }); }
  }

  if (url.pathname === "/api/answer") {
    if (!groq.enabled) return send(res, 503, { error: "answers not configured" });
    const { language, question, step, progress } = body ?? {};
    if (language !== "en" && !LANGS[language]) return send(res, 400, { error: "unsupported language" });
    if (typeof question !== "string" || !question.trim() || question.length > 300) return send(res, 400, { error: "invalid question" });
    if (SENSITIVE.some((r) => r.test(question))) return send(res, 422, { error: "sensitive data refused" });
    if (!takeCall()) return send(res, 429, { error: "daily limit reached" });
    const stepName = typeof step === "string" ? step.replace(/[^\p{L}\p{N} .,+()-]/gu, "").slice(0, 60) : "";
    const progressText = typeof progress === "string" ? progress.replace(/[^\p{L}\p{N} .,:;+()-]/gu, "").slice(0, 240) : "";
    try { return send(res, 200, await groq.answer(question.trim(), language === "en" ? "English" : LANGS[language], stepName || "unknown", progressText)); }
    catch (e) { console.error("[answer:groq] failed:", (e as Error).message); return send(res, 502, { error: "answer failed" }); }
  }

  if (url.pathname === "/api/otp/send") {
    const mobile = typeof body?.mobile === "string" ? body.mobile.replace(/\D/g, "") : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const r = await otp.send(mobile, email);
    if (r.ok) return send(res, 200, r);
    const status = r.reason === "invalid_mobile" || r.reason === "invalid_email" || r.reason === "email_unavailable" ? 400 : r.reason === "send_failed" ? 502 : 429;
    return send(res, status, { error: r.reason, retryIn: r.retryIn, hint: r.hint, provider: r.provider });
  }

  if (url.pathname === "/api/handoff") {
    const verified = otp.readToken(body?.mobileToken);
    const r = await handoff.create({
      kind: body?.kind, language: body?.language, share: body?.share, summary: body?.summary, goal: body?.goal,
      mobileVerified: verified?.last4 || null,
    });
    if (r.ok) return send(res, 200, r);
    return send(res, r.reason === "delivery_failed" ? 502 : r.reason === "sensitive" ? 422 : 400, { error: r.reason });
  }

  if (url.pathname === "/api/aadhaar/otp") {
    const r = await aadhaar.start(body?.aadhaar, body?.consent);
    if (r.ok) return send(res, 200, r);
    const status = r.reason === "provider_error" ? 502 : r.reason === "too_soon" ? 429 : 400;
    return send(res, status, { error: r.reason, retryIn: r.retryIn });
  }

  if (url.pathname === "/api/aadhaar/verify") {
    const r = await aadhaar.verify(body?.ref, typeof body?.otp === "string" ? body.otp.trim() : "", body?.expectedName);
    return send(res, r.ok ? 200 : r.reason === "provider_error" ? 502 : 200, r.ok ? { verified: true, ...r } : { verified: false, reason: r.reason, attemptsLeft: r.attemptsLeft });
  }

  if (url.pathname === "/api/digilocker/start") {
    try {
      const r = await digilocker.start(body?.purpose, body?.expectedName, originOf(req));
      return r ? send(res, 200, r) : send(res, 400, { error: "invalid" });
    } catch (e) {
      console.error(`[digilocker:${digilocker.providerName}] start failed:`, (e as Error).message);
      return send(res, 502, { error: "start failed" });
    }
  }

  if (url.pathname === "/api/digilocker/result") {
    return send(res, 200, digilocker.result(body?.state));
  }

  // Firebase Phone Auth: the app signed in with Firebase by SMS; exchange its ID token for ours.
  if (url.pathname === "/api/otp/firebase") {
    const r = await firebase.check(body?.idToken);
    if (!r.ok) return send(res, r.reason === "not_configured" ? 503 : 400, { verified: false, reason: r.reason });
    console.log(`[otp:firebase] mobile ••••••${r.mobile10.slice(-4)} verified by Firebase`);
    return send(res, 200, { verified: true, token: otp.tokenFor(r.mobile10), maskedMobile: "••••••" + r.mobile10.slice(-4) });
  }

  if (url.pathname === "/api/otp/verify") {
    const r = otp.verify(body?.requestId, typeof body?.code === "string" ? body.code.trim() : "");
    return send(res, 200, r.ok ? { verified: true, token: r.token } : { verified: false, reason: r.reason, attemptsLeft: r.attemptsLeft });
  }

  return send(res, 404, { error: "not found" });
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json",
};

function serveStatic(res: http.ServerResponse, url: URL) {
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  let file = path.resolve(DIST, rel || "index.html");
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  if (!fs.existsSync(file)) { res.writeHead(404); res.end("Run `npm run build` first."); return; }
  if (url.pathname === "/about") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(aboutPage()); return; }
  // The page itself carries the business details as plain HTML (see business.ts).
  if (file.endsWith("index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    res.end(withBusiness(fs.readFileSync(file, "utf8")));
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

// ---- Exposure controls for a public deployment ----

// Browsers may call the API only from these sites (plus the server's own pages).
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "https://chitrasangatwani-eng.github.io")
    .split(",").map((s) => s.trim()).filter(Boolean),
);

/** Returns false (and answers the request) when the origin is not allowed. */
function cors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin navigation or a non-browser client; rate limits still apply
  let sameHost = false;
  try { sameHost = new URL(origin).host === req.headers.host; } catch { /* malformed */ }
  if (!sameHost && !ALLOWED_ORIGINS.has(origin)) { send(res, 403, { error: "origin not allowed" }); return false; }
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-max-age", "600");
  return true;
}

// Per-visitor and per-day caps so a public key can't be run up.
const PER_IP_LIMIT = Number(process.env.PER_IP_LIMIT || 120);       // requests per 10 minutes
const DAILY_CALL_LIMIT = Number(process.env.DAILY_CALL_LIMIT || 2000); // Claude calls per day, all visitors
const hits = new Map<string, { n: number; reset: number }>();
let day = new Date().toISOString().slice(0, 10);
let callsToday = 0;

function clientIp(req: http.IncomingMessage): string {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "?";
}
function overIpLimit(req: http.IncomingMessage): boolean {
  const now = Date.now(), ip = clientIp(req);
  const h = hits.get(ip);
  if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + 10 * 60 * 1000 }); return false; }
  h.n++;
  return h.n > PER_IP_LIMIT;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, 60_000).unref();

/** Count one Claude call against today's budget; false when the budget is spent. */
export function takeCall(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; callsToday = 0; }
  if (callsToday >= DAILY_CALL_LIMIT) return false;
  callsToday++;
  return true;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  // Setup check for WhatsApp OTP (never returns the token).
  if (url.pathname === "/api/digilocker/check") { void digilocker.check(originOf(req)).then((r) => send(res, 200, r)); return; }
  if (url.pathname === "/api/whatsapp/check") { void whatsappCheck().then((r) => send(res, 200, r)); return; }
  // Meta's webhook: GET is the verification handshake, POST carries statuses and incoming messages.
  if (url.pathname === "/api/whatsapp/webhook") {
    if (req.method === "GET") {
      const challenge = webhookVerify(url.searchParams);
      res.writeHead(challenge ? 200 : 403, { "content-type": "text/plain" }); res.end(challenge ?? "forbidden"); return;
    }
    if (req.method === "POST") {
      const chunks: Buffer[] = []; let size = 0;
      req.on("data", (c: Buffer) => { size += c.length; if (size <= 1_000_000) chunks.push(c); });
      req.on("end", () => {
        const ok = webhookReceive(Buffer.concat(chunks), req.headers["x-hub-signature-256"] as string | undefined);
        res.writeHead(ok ? 200 : 401); res.end();
      });
      return;
    }
    res.writeHead(405); res.end(); return;
  }

  if (url.pathname === "/api/health") { send(res, 200, { ok: true, model: MODEL, key: !!process.env.ANTHROPIC_API_KEY, otp: otp.providerName, otpChannel: otp.channel, sms: smsRoute, firebase: smsRoute === "firebase" ? firebaseWeb : null, whatsappHello: otp.smsProviderName === "whatsapp" ? whatsappHelloNumber() : null, answers: groq.enabled ? "groq" : "rules", answerModel: groq.enabled ? GROQ_MODEL : null, handoff: handoff.providerName, digilocker: digilocker.providerName, aadhaar: aadhaar.providerName }); return; }
  // Pages opened in the DigiLocker consent window (top-level navigations, so no CORS check).
  if (req.method === "GET" && url.pathname === "/api/digilocker/sandbox" && digilocker.providerName === "sandbox") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    { const st = url.searchParams.get("state") || ""; res.end(sandboxConsentPage(st, digilocker.purposeOf(st))); }
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/digilocker/callback") {
    const state = url.searchParams.get("state") || "";
    digilocker.callback(state, url.searchParams).then((ok) => {
      res.writeHead(ok ? 200 : 410, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(callbackPage(ok, state));
    });
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    if (!cors(req, res)) return;
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (overIpLimit(req)) { send(res, 429, { error: "too many requests" }); return; }
    handleApi(req, res, url);
    return;
  }
  if (process.env.NODE_ENV === "production") { serveStatic(res, url); return; }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  console.log(`Onboarding assistant API on http://localhost:${PORT} (model ${MODEL})`);
});
