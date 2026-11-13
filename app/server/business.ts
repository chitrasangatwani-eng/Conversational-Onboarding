// Public business details, from settings, written into the page as plain HTML
// so that people and automated checkers (Meta business verification, search
// engines) can read them without running JavaScript.
//
//   BUSINESS_NAME              legal name, exactly as on the registration (default "Artha Inclusive Advisory")
//   BUSINESS_EMAIL             public contact email
//   BUSINESS_LOCATION          e.g. "Lucknow, Uttar Pradesh, India" (city/state is enough)
//   BUSINESS_REGISTRATION      e.g. "Udyam registration UDYAM-XX-00-0000000" (optional)
//   META_DOMAIN_VERIFICATION   the content value of Meta's facebook-domain-verification meta tag (optional)

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const env = (k: string) => (process.env[k] ?? "").trim().replace(/^(["'])(.*)\1$/s, "$2").trim();

export function business() {
  return {
    name: env("BUSINESS_NAME") || "Artha Inclusive Advisory",
    email: env("BUSINESS_EMAIL"),
    location: env("BUSINESS_LOCATION"),
    registration: env("BUSINESS_REGISTRATION"),
    metaVerification: env("META_DOMAIN_VERIFICATION"),
  };
}

const ABOUT = "We help people open bank accounts online in India with clear, inclusive guidance: plain-language help, voice support in Indian languages, and a person to talk to when needed.";

/** Add the business details to index.html: meta tags in <head>, a footer before </body>. */
export function withBusiness(html: string): string {
  const b = business();
  const head = [
    `<meta name="description" content="${esc(b.name)}: ${esc(ABOUT)}" />`,
    `<meta property="og:site_name" content="${esc(b.name)}" />`,
    b.metaVerification ? `<meta name="facebook-domain-verification" content="${esc(b.metaVerification)}" />` : "",
  ].filter(Boolean).join("\n    ");
  const parts = [
    `<strong>${esc(b.name)}</strong>`,
    b.location && esc(b.location),
    b.email && `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>`,
    b.registration && esc(b.registration),
    `<a href="/about">About</a>`,
  ].filter(Boolean);
  const footer = `<footer id="biz" style="font:13px/1.5 'DM Sans',system-ui,sans-serif;color:#5f6b80;text-align:center;padding:14px 16px 24px">${parts.join(" · ")}</footer>`;
  return html.replace("</head>", `  ${head}\n  </head>`).replace("</body>", `  ${footer}\n  </body>`);
}

/** A plain About page with the business details. */
export function aboutPage(): string {
  const b = business();
  const row = (k: string, v: string) => (v ? `<tr><th>${k}</th><td>${v}</td></tr>` : "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>About · ${esc(b.name)}</title><meta name="description" content="${esc(b.name)}: ${esc(ABOUT)}" />
${b.metaVerification ? `<meta name="facebook-domain-verification" content="${esc(b.metaVerification)}" />` : ""}
<style>body{font:16px/1.6 system-ui,sans-serif;color:#13203f;background:#f4f7fb;margin:0;padding:40px 16px}main{max-width:640px;margin:auto;background:#fff;border:1px solid #e1e7f0;border-radius:16px;padding:28px}th{text-align:left;padding:6px 16px 6px 0;color:#5f6b80;font-weight:500;vertical-align:top}a{color:#1f4fd1}</style></head>
<body><main><h1>${esc(b.name)}</h1><p>${esc(ABOUT)}</p>
<table>${row("Business", esc(b.name))}${row("Location", esc(b.location))}${row("Email", b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : "")}${row("Registration", esc(b.registration))}${row("Product", `<a href="/">Artha Inclusive: open an account</a>`)}</table>
</main></body></html>`;
}
