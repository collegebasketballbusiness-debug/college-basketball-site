// Vercel serverless function: forwards requests from the site to the free NCAA API.
// The site calls /api/ncaa?path=scoreboard/basketball-men/d1/2026/11/06/all-conf
// Browsers can't call the NCAA API directly from another website, so this small relay does it,
// and Vercel's cache keeps traffic to the API low (one request per path every ~20 seconds).

const BASE = (process.env.NCAA_API_BASE || "https://ncaa-api.henrygd.me").replace(/\/$/, "");

// Only these kinds of paths are allowed through, with how long Vercel may cache each (seconds).
const ROUTES = [
  [/^scoreboard\/basketball-men\/d1(\/\d{4}\/\d{2}\/\d{2})?(\/all-conf)?$/, 10],
  [/^game\/\d{4,10}(\/(boxscore|play-by-play|team-stats))?$/, 4],
  [/^game\/\d{4,10}\?info=1$/, 3600],
  [/^game\/\d{4,10}\/boxscore\?final=1$/, 86400],   // finished games don't change
  [/^rankings\/basketball-men\/d1\/associated-press$/, 1800],
  [/^standings\/basketball-men\/d1$/, 1800],
  [/^news\/basketball-men\/d1$/, 600],
  [/^stats\/basketball-men\/d1\/current\/(individual|team)\/\d{1,4}(\?page=\d{1,2})?$/, 1800],
  [/^logo\/[a-z0-9-]{1,60}\.svg(\?dark=true)?$/, 604800],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Live game data straight from NCAA.com's own data feed. The free API keeps game data for 45 seconds
// (and asks for 60), which made live play-by-play arrive in once-a-minute batches. Going direct gets each
// play within seconds. If NCAA.com ever changes this feed, we fall back to the free API automatically.
const SDATA = "https://sdataprod.ncaa.com/";
const HASH = {
  game: "93a02c7193c89d85bcdda8c1784925d9b64657f73ef584382e2297af555acd4b",
  pbp: ["57f922d56d60d88326b62202b3d88e8cd3cfb6687931bc0b5b3dfab089b84faa", "6b1232714a3598954c5bacabc0f81570e16d6ee017c9a6b93b601a3d40dafb98"],
  box: "4a7fa26398db33de3ff51402a90eb5f25acef001cca28d239fe5361315d1419a",
};
async function sdata(hash, variables, meta) {
  const q = `${SDATA}?${meta ? `meta=${meta}&` : ""}extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}&variables=${encodeURIComponent(JSON.stringify(variables))}`;
  const r = await fetch(q, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error("ncaa " + r.status);
  const j = await r.json();
  if (!j || !j.data) throw new Error("ncaa empty");
  return j.data;
}
async function directGame(path) {
  const m = /^game\/(\d{4,10})(?:\/(play-by-play|boxscore))?(?:\?final=1)?$/.exec(path);
  if (!m) return null;
  const id = m[1];
  if (!m[2]) return await sdata(HASH.game, { id, week: null, staticTestEnv: null }, "GetGamecenterGameById_web");
  if (m[2] === "boxscore") {
    const d = await sdata(HASH.box, { contestId: id, staticTestEnv: null });
    if (Object.keys(d.boxscore?.teamBoxscore?.[0]?.teamStats || {}).length < 2) throw new Error("box empty");
    return d.boxscore;
  }
  for (const h of HASH.pbp) {
    const d = await sdata(h, { contestId: id, staticTestEnv: null });
    const first = d.playbyplay?.periods?.[0]?.playbyplayStats?.[0];
    if (d.playbyplay && (!first || Object.keys(first).length >= 2)) return d.playbyplay;
  }
  throw new Error("pbp empty");
}

// Fetch from the free API, waiting and retrying when it turns away bursts (status 428/429).
async function upstreamFetch(path, headers) {
  try {
    const d = await directGame(path);
    if (d) return new Response(JSON.stringify(d), { status: 200, headers: { "x-source": "ncaa" } });
  } catch { /* use the free API below */ }
  let r;
  for (let attempt = 0; attempt < 4; attempt++) {
    r = await fetch(`${BASE}/${path.replace(/[?&](final|info)=1$/, "")}`, { headers });
    if (![428, 429, 502, 503, 504].includes(r.status)) break;
    await sleep(700 * (attempt + 1));
  }
  return r;
}
function apiHeaders() {
  const h = { "user-agent": "collegebasketball-site" };
  if (process.env.NCAA_API_KEY) h["x-ncaa-key"] = process.env.NCAA_API_KEY;
  return h;
}
function json(res, status, body, cache) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", cache || "no-store");
  res.status(status).json(body);
}

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
    json(res, 200, { others }, page.ok ? "public, s-maxage=1800, stale-while-revalidate=7200" : null);
  } catch {
    json(res, 502, { error: "Could not reach NCAA.com" });
  }
}

// ---------- where to watch ----------
// The NCAA feed leaves the TV network blank, so read each day's broadcasts from ESPN's public scoreboard.
// Returns, per game: tip time, every name each team goes by (for matching), and the networks.
async function tv(res, y, m, d) {
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${y}${m}${d}&groups=50&limit=500`,
      { headers: { "user-agent": "collegebasketball-site" } });
    if (!r.ok) return json(res, 502, { error: "ESPN " + r.status });
    const data = await r.json();
    const games = (data.events || []).map(e => {
      const c = (e.competitions || [])[0] || {};
      const names = side => { const t = ((c.competitors || []).find(x => x.homeAway === side) || {}).team || {}; return [t.location, t.shortDisplayName, t.displayName, t.name].filter(Boolean) };
      const geo = (c.geoBroadcasts || []).slice().sort((a, b) => (a.market?.type === "National" ? 0 : 1) - (b.market?.type === "National" ? 0 : 1)).map(g => g.media?.shortName);
      const tvs = [...new Set([...geo, ...(c.broadcasts || []).flatMap(b => b.names || [])].filter(Boolean))].slice(0, 3);
      return { t: Math.round(Date.parse(e.date) / 1000) || 0, a: names("away"), h: names("home"), tv: tvs };
    }).filter(g => g.tv.length);
    const date = `${y}-${m}-${d}`;
    json(res, 200, { date, games }, date < etToday() ? "public, s-maxage=86400" : "public, s-maxage=1800, stale-while-revalidate=7200");
  } catch {
    json(res, 502, { error: "Could not reach ESPN" });
  }
}

// ---------- stat categories ----------
// The NCAA numbers each stat (e.g. 136 = points per game). Rather than hard-coding a list, check the likely
// numbers once a week and keep the ones that exist, with the NCAA's own name and columns.
const STAT_IDS = {
  individual: [...range(130, 152), ...range(600, 630)],
  team: [...range(142, 172), ...range(210, 222), 286, 518, ...range(625, 640), ...range(930, 934)],
};
function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i) }
async function statCats(res) {
  const jobs = Object.entries(STAT_IDS).flatMap(([kind, ids]) => ids.map(id => ({ kind, id })));
  const found = []; let i = 0; const stopAt = Date.now() + 40e3; // stay well inside Vercel's 60-second limit
  async function worker() {
    while (i < jobs.length && Date.now() < stopAt) {
      const { kind, id } = jobs[i++];
      try {
        const r = await upstreamFetch(`stats/basketball-men/d1/current/${kind}/${id}`, apiHeaders());
        if (!r.ok) continue;
        const j = await r.json();
        const row = (j.data || [])[0];
        if (j.title && row) found.push({ kind, id, title: String(j.title).trim(), cols: Object.keys(row), pages: +j.pages || 1, updated: j.updated || "" });
      } catch { }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));
  found.sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id);
  const done = i >= jobs.length;
  json(res, 200, { cats: found }, done && found.length >= 8 ? "public, s-maxage=604800, stale-while-revalidate=2592000" : "public, s-maxage=600");
}

// ---------- Discord ----------
// Member and online counts for the site's Discord server, from Discord's public invite info.
const DISCORD_INVITE = process.env.DISCORD_INVITE || "EUH6S3nzet";
async function discordInvite(res) {
  try {
    const r = await fetch(`https://discord.com/api/v10/invites/${DISCORD_INVITE}?with_counts=true`, { headers: { "user-agent": "collegebasketball-site" } });
    if (!r.ok) return json(res, 502, { error: "Discord " + r.status });
    const d = await r.json();
    json(res, 200, { name: d.guild?.name || "", members: d.approximate_member_count || 0, online: d.approximate_presence_count || 0 },
      "public, s-maxage=300, stale-while-revalidate=1800");
  } catch {
    json(res, 502, { error: "Could not reach Discord" });
  }
}

// ---------- season schedules ----------
// Today's date in US Eastern time as yyyy-mm-dd (NCAA dates are Eastern).
function etToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
// One day's games, trimmed to what the schedule needs. Past days are cached for a day, future days for a few hours.
async function day(res, y, m, d) {
  const date = `${y}-${m}-${d}`, today = etToday();
  const yest = new Date(Date.parse(today + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
  try {
    const r = await upstreamFetch(`scoreboard/basketball-men/d1/${y}/${m}/${d}/all-conf`, apiHeaders());
    if (r.status === 404) return json(res, 200, { date, games: [] }, "public, s-maxage=21600");
    if (!r.ok) return json(res, 502, { error: "NCAA API " + r.status });
    const data = await r.json();
    const team = t => [t.names?.seo || "", (t.names?.short || "").trim(), t.score || "", t.rank || ""];
    const games = (data.games || []).map(x => x.game).map(g => ({
      id: g.gameID, d: date, s: g.gameState, t: +g.startTimeEpoch || 0, n: g.network || "",
      f: g.finalMessage || "", p: g.currentPeriod || "", c: g.contestClock || "",
      a: team(g.away), h: team(g.home)
    }));
    const cache = date < yest ? "public, s-maxage=86400, stale-while-revalidate=604800"
      : date <= today ? "public, s-maxage=60, stale-while-revalidate=300"
      : "public, s-maxage=21600, stale-while-revalidate=86400";
    json(res, 200, { date, games }, cache);
  } catch {
    json(res, 502, { error: "Could not reach the NCAA API" });
  }
}
// Every game this season for every team, in one list. Built from each day through this site's own cache.
// Vercel keeps the result and refreshes it in the background, so visitors almost always get it instantly.
async function season(req, res) {
  const host = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const today = etToday(), y = +today.slice(0, 4), mo = +today.slice(5, 7);
  const start = Date.UTC(mo >= 7 ? y : y - 1, 10, 1), end = Date.UTC(mo >= 7 ? y + 1 : y, 3, 8); // Nov 1 – Apr 8
  const dates = [];
  for (let t = start; t <= end; t += 864e5) dates.push(new Date(t).toISOString().slice(0, 10));
  const games = []; let missing = 0, i = 0;
  async function worker() {
    while (i < dates.length) {
      const date = dates[i++], [yy, mm, dd] = date.split("-");
      try {
        const r = await fetch(`${host}/api/ncaa?path=${encodeURIComponent(`day/${yy}/${mm}/${dd}`)}`);
        if (!r.ok) { missing++; continue }
        const j = await r.json();
        for (const g of j.games || []) games.push(g);
      } catch { missing++ }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  games.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.t - b.t));
  json(res, 200, { games, missingDays: missing, built: Date.now() },
    missing ? "public, s-maxage=60" : "public, s-maxage=900, stale-while-revalidate=172800");
}

// Every game for one team this season. Uses the cached season list above, falling back to a day-by-day scan.
async function teamSeason(req, res, slug) {
  try {
    const host = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
    const r = await fetch(`${host}/api/ncaa?path=season`);
    if (r.ok) {
      const j = await r.json();
      const games = (j.games || []).filter(g => g.a[0] === slug || g.h[0] === slug);
      return json(res, 200, { slug, games, missingDays: j.missingDays || 0 },
        j.missingDays ? "public, s-maxage=60" : "public, s-maxage=300, stale-while-revalidate=3600");
    }
  } catch { /* fall through to the day-by-day scan */ }
  return teamSeasonScan(req, res, slug);
}
async function teamSeasonScan(req, res, slug) {
  const host = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const today = etToday(), y = +today.slice(0, 4), mo = +today.slice(5, 7);
  const start = Date.UTC(mo >= 7 ? y : y - 1, 10, 1), end = Date.UTC(mo >= 7 ? y + 1 : y, 3, 8); // Nov 1 – Apr 8
  const dates = [];
  for (let t = start; t <= end; t += 864e5) dates.push(new Date(t).toISOString().slice(0, 10));
  const games = []; let missing = 0, i = 0;
  async function worker() {
    while (i < dates.length) {
      const date = dates[i++], [yy, mm, dd] = date.split("-");
      try {
        const r = await fetch(`${host}/api/ncaa?path=${encodeURIComponent(`day/${yy}/${mm}/${dd}`)}`);
        if (!r.ok) { missing++; continue }
        const j = await r.json();
        for (const g of j.games || []) if (g.a[0] === slug || g.h[0] === slug) games.push(g);
      } catch { missing++ }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  games.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.t - b.t));
  json(res, 200, { slug, games, missingDays: missing },
    missing ? "public, s-maxage=60" : "public, s-maxage=300, stale-while-revalidate=3600");
}

export default async function handler(req, res) {
  const path = String(req.query.path || "").replace(/^\/+/, "");
  if (path === "ap-others") return apOthers(res);
  if (path === "discord-invite") return discordInvite(res);
  if (path === "stat-cats") return statCats(res);
  let m;
  if ((m = /^day\/(\d{4})\/(\d{2})\/(\d{2})$/.exec(path))) return day(res, m[1], m[2], m[3]);
  if ((m = /^tv\/(\d{4})\/(\d{2})\/(\d{2})$/.exec(path))) return tv(res, m[1], m[2], m[3]);
  if (path === "season") return season(req, res);
  if ((m = /^team-season\/([a-z0-9-]{1,60})$/.exec(path))) return teamSeason(req, res, m[1]);
  const route = ROUTES.find(([re]) => re.test(path));
  if (!route) return json(res, 400, { error: "Unsupported path" });
  try {
    const upstream = await upstreamFetch(path, apiHeaders());
    const body = await upstream.text();
    res.setHeader("x-source", upstream.headers.get("x-source") || "free-api");
    res.setHeader("content-type", path.startsWith("logo/") ? "image/svg+xml" : "application/json; charset=utf-8");
    res.setHeader("cache-control", upstream.ok ? `public, s-maxage=${route[1]}, stale-while-revalidate=${route[1] * 3}` : "no-store");
    res.status(upstream.status).send(body);
  } catch (err) {
    json(res, 502, { error: "Could not reach the NCAA API" });
  }
}
