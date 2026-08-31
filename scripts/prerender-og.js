/* Feature 1 — build-time prerender of per-route share meta.
 * Runs after `craco build`. For each static route it writes build/<route>/index.html
 * with the correct <title> + OpenGraph/Twitter tags baked in, so social crawlers
 * (which don't run React) get the right preview when the plain URL is shared.
 * Dynamic portfolio pages are handled at runtime by the backend /api/og endpoint.
 */
const fs = require("fs");
const path = require("path");

const BUILD = path.join(__dirname, "..", "frontend", "build");
const SITE = "Omnivest";
const ORIGIN = "https://omnivest.in";
const OG_IMAGE = ORIGIN + "/omnivest-og-1200x630.png?v=2";
const DEFAULT_TITLE = "Omnivest — All your investing, in one place";
const DEFAULT_DESC =
  "Expert-managed model portfolios, AIFs and advisory — invested from your own broker account. Soch samajh kar invest kar.";

// Mirrors frontend/src/components/Layout.jsx PAGE_META
const PAGES = {
  "/model-portfolios": ["Model Portfolios", "Browse expert-built, SEBI-registered model portfolios and invest from your own broker account."],
  "/about": ["About Us", "Meet the team building Omnivest — making expert-managed investing simple and accessible for every Indian."],
  "/aif": ["Alternative Investment Funds", "Explore curated Alternative Investment Funds (AIFs) on Omnivest."],
  "/advisory": ["Advisory", "Personalised, SEBI-registered investment advisory on Omnivest."],
  "/faq": ["FAQ", "Answers to common questions about investing with Omnivest."],
  "/learn": ["Learn", "Guides and insights to help you invest with confidence."],
  "/managers": ["Basket Managers", "SEBI-registered research analysts and basket managers on Omnivest."],
  "/mutual-funds": ["Mutual Funds", "Diversified baskets of direct mutual funds, built and rebalanced by SEBI-registered managers."],
  "/stocks": ["Stocks", "Curated equity baskets on Omnivest."],
  "/fixed-deposits": ["Fixed Deposits", "Compare and invest in fixed deposits via Omnivest."],
  "/collections": ["Collections", "Themed investment collections on Omnivest."],
  "/explore": ["Explore", "Explore model portfolios and investing ideas on Omnivest."],
  "/calculators": ["Calculators", "SIP and returns calculators to plan your investments."],
  "/partner": ["Become a Partner", "Partner with Omnivest as a SEBI-registered research analyst."],
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function apply(html, title, desc, url) {
  const t = esc(title);
  const d = esc(desc);
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(url)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${d}$2`);
}

const indexPath = path.join(BUILD, "index.html");
if (!fs.existsSync(indexPath)) {
  console.error("[prerender-og] build/index.html not found — skipping");
  process.exit(0);
}
const base = fs.readFileSync(indexPath, "utf8");

let n = 0;
for (const [route, [title, desc]] of Object.entries(PAGES)) {
  const out = apply(base, `${title} | ${SITE}`, desc, ORIGIN + route);
  const dir = path.join(BUILD, route.replace(/^\//, ""));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), out);
  n++;
}
// Home keeps the default meta (already correct in build/index.html)
console.log(`[prerender-og] wrote ${n} per-route index.html files (default home + ${DEFAULT_TITLE.length ? "" : ""})`);
