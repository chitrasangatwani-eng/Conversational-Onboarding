// Small proxy between the onboarding app and the Claude API.
//
// The browser never holds an API key. It may only send two kinds of request:
//   POST /api/translate  { language, strings[] }  -> { strings: (string|null)[] }
//   POST /api/classify   { language, text }       -> { code }
// Both carry only static UI copy or a short free-text question. Anything that
// looks like a PAN, Aadhaar, phone number or OTP is refused here as well as on
// the client, so identity data never leaves the secure forms.
//
// In production (`npm start`) it also serves the built app from dist/.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

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

async function complete(prompt: string, schema: Record<string, unknown>, maxTokens: number) {
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

async function translate(language: string, strings: string[]): Promise<(string | null)[]> {
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
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) { handleApi(req, res, url); return; }
  if (process.env.NODE_ENV === "production") { serveStatic(res, url); return; }
  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  console.log(`Onboarding assistant API on http://localhost:${PORT} (model ${MODEL})`);
});
