// Vercel serverless function: forwards requests from the site to the free NCAA API.
// The site calls /api/ncaa?path=scoreboard/basketball-men/d1/2026/11/06/all-conf
// Browsers can't call the NCAA API directly from another website, so this small relay does it,
// and Vercel's cache keeps traffic to the API low (one request per path every ~20 seconds).

const BASE = (process.env.NCAA_API_BASE || "https://ncaa-api.henrygd.me").replace(/\/$/, "");

// Only these kinds of paths are allowed through, with how long Vercel may cache each (seconds).
const ROUTES = [
  [/^scoreboard\/basketball-men\/d1(\/\d{4}\/\d{2}\/\d{2})?(\/all-conf)?$/, 20],
  [/^game\/\d{4,10}(\/(boxscore|play-by-play|team-stats))?$/, 15],
  [/^rankings\/basketball-men\/d1\/associated-press$/, 1800],
  [/^standings\/basketball-men\/d1$/, 1800],
  [/^news\/basketball-men\/d1$/, 600],
  [/^stats\/basketball-men\/d1\/current\/team\/168(\?page=\d{1,2})?$/, 1800],
  [/^logo\/[a-z0-9-]{1,60}\.svg(\?dark=true)?$/, 604800],
];

export default async function handler(req, res) {
  const path = String(req.query.path || "").replace(/^\/+/, "");
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
