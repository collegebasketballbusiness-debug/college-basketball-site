// Serves a team page at its own address (collegebasketball.news/team/illinois).
// It's the normal site, with the page title, description and link-preview tags written for that team,
// so search engines list each team and shared links show the right team. The site then opens that team's page.
import { readFileSync } from "node:fs";
import { join } from "node:path";

// read a site file from the deployment, or fetch it from the live site if it wasn't bundled
async function siteFile(name) {
  try { return readFileSync(join(process.cwd(), name), "utf8") }
  catch { const r = await fetch(`https://collegebasketball.news/${name}`); if (!r.ok) throw new Error(name); return r.text() }
}

const SITE = "https://collegebasketball.news";
let page = null, teams = null;

async function load() {
  if (!page) page = await siteFile("index.html");
  if (!teams) {
    const w = {};
    new Function("window", await siteFile("teams.js"))(w);
    teams = {};
    for (const [name, slug] of Object.entries(w.TEAM_SLUGS || {})) (teams[slug] || (teams[slug] = [])).push(name);
  }
}

export const nameFor = (names) => {
  const n = [...names].sort((a, b) => (/\bSt\.$/.test(a) - /\bSt\.$/.test(b)) || a.length - b.length)[0];
  return n.replace(/ St\.$/, " State");
};
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const setMeta = (html, re, value) => html.replace(re, (m, a, b) => a + esc(value) + b);

export default async function handler(req, res) {
  try { await load() } catch (e) { res.statusCode = 500; res.end("Page not available"); return }
  const slug = String(req.query.slug || "").toLowerCase();
  const known = /^[a-z0-9-]{1,60}$/.test(slug) && teams[slug];
  let html = page;
  if (known) {
    const name = nameFor(teams[slug]), url = `${SITE}/team/${slug}`;
    const title = `${name} Basketball: Schedule, Scores & Stats | College Basketball`;
    const desc = `${name} men's basketball: full schedule, live scores, results, team and player stats, plus ${name} fan chat on College Basketball.`;
    html = setMeta(html, /(<title>)[^<]*(<\/title>)/, title);
    html = setMeta(html, /(<meta name="description" content=")[^"]*(")/, desc);
    html = setMeta(html, /(<link rel="canonical" href=")[^"]*(")/, url);
    html = setMeta(html, /(<meta property="og:title" content=")[^"]*(")/, `${name} Basketball | College Basketball`);
    html = setMeta(html, /(<meta property="og:description" content=")[^"]*(")/, desc);
    html = setMeta(html, /(<meta property="og:url" content=")[^"]*(")/, url);
    html = setMeta(html, /(<meta name="twitter:title" content=")[^"]*(")/, `${name} Basketball | College Basketball`);
    html = setMeta(html, /(<meta name="twitter:description" content=")[^"]*(")/, desc);
    const ld = { "@context": "https://schema.org", "@type": "SportsTeam", name: `${name} men's basketball`, sport: "Basketball", url,
      logo: `${SITE}/api/ncaa?path=${encodeURIComponent(`logo/${slug}.svg`)}` };
    html = html.replace("</head>", `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n</head>`);
  } else {
    html = html.replace("<head>", '<head>\n<meta name="robots" content="noindex">');
  }
  res.statusCode = known ? 200 : 404;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  res.end(html);
}
