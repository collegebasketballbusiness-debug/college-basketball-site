// Vercel serverless function: forwards requests from the site to the free NCAA API.
// The site calls /api/ncaa?path=scoreboard/basketball-men/d1/2026/11/06/all-conf
// Browsers can't call the NCAA API directly from another website, so this small relay does it,
// and Vercel's cache keeps traffic to the API low (one request per path every ~20 seconds).

const BASE = (process.env.NCAA_API_BASE || "https://ncaa-api.henrygd.me").replace(/\/$/, "");

// Only these kinds of paths are allowed through, with how long Vercel may cache each (seconds).
const ROUTES = [
  [/^scoreboard\/basketball-men\/d1(\/\d{4}\/\d{2}\/\d{2})?(\/all-conf)?$/, 20],
  [/^game\/\d{4,10}(\/(boxscore|play-by-play|team-stats))?$/, 15],
  [/^game\/\d{4,10}\?info=1$/, 3600],
  [/^rankings\/basketball-men\/d1\/associated-press$/, 1800],
  [/^standings\/basketball-men\/d1$/, 1800],
  [/^news\/basketball-men\/d1$/, 600],
  [/^stats\/basketball-men\/d1\/current\/team\/168(\?page=\d{1,2})?$/, 1800],
  [/^logo\/[a-z0-9-]{1,60}\.svg(\?dark=true)?$/, 604800],
];

// "Others receiving votes" isn't in the free API, so read it straight from NCAA.com's AP poll page.
async function apOthers(res) {
  try {
    const page = await fetch("https://www.ncaa.com/rankings/basketball-men/d1/associated-press", {
      headers: { "user-agent": "Mozilla/5.0 (compatible; collegebasketball-site)", accept: "text/html" }, redirect: "follow"
    });
    const html = await page.text();
    const m = /OTHERS RECEIVING VOTES:?\s*<\/strong>([\s\S]*?)<\/p>/i.exec(html);
    const text = (m ? m[1] : "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    const others = text.split(/\s*[,;]\s*/).map(x => /^(.*\S)\s+(\d+)\.?$/.exec(x.trim())).filter(Boolean)
      .map(x => ({ school: x[1], votes: +x[2] })).sort((a, b) => b.votes - a.votes);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", page.ok ? "public, s-maxage=1800, stale-while-revalidate=7200" : "no-store");
    res.status(200).json({ others });
  } catch {
    res.setHeader("cache-control", "no-store");
    res.status(502).json({ error: "Could not reach NCAA.com" });
  }
}

export default async function handler(req, res) {
  const path = String(req.query.path || "").replace(/^\/+/, "");
  if (path === "ap-others") return apOthers(res);
  const route = ROUTES.find(([re]) => re.test(path));
  if (!route) {
    res.status(400).json({ error: "Unsupported path" });
    return;
  }
  const headers = { "user-agent": "collegebasketball-site" };
  if (process.env.NCAA_API_KEY) headers["x-ncaa-key"] = process.env.NCAA_API_KEY;
  try {
    // The free API turns away bursts of requests (status 428/429). Wait a moment and try again, up to 3 times.
    let upstream;
    for (let attempt = 0; attempt < 4; attempt++) {
      upstream = await fetch(`${BASE}/${path}`, { headers });
      if (![428, 429, 502, 503, 504].includes(upstream.status)) break;
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
    const body = await upstream.text();
    res.setHeader("content-type", path.startsWith("logo/") ? "image/svg+xml" : "application/json; charset=utf-8");
    if (upstream.ok) {
      res.setHeader("cache-control", `public, s-maxage=${route[1]}, stale-while-revalidate=${route[1] * 3}`);
    } else {
      res.setHeader("cache-control", "no-store");
    }
    res.status(upstream.status).send(body);
  } catch (err) {
    res.setHeader("cache-control", "no-store");
    res.status(502).json({ error: "Could not reach the NCAA API" });
  }
}
