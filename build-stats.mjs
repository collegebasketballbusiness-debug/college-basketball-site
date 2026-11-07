// Builds stats.json: every Division I men's stat category the NCAA has, with its top 50, for the Stats tab,
// plus the complete list for each stat in the stats folder (used by search and "Show more").
// GitHub runs this twice a day (see .github/workflows/update-season.yml), so the Stats tab loads instantly.
// The NCAA numbers each stat (e.g. 136 = points per game); rather than hard-coding them, this checks the
// likely numbers and keeps the ones that exist, with the NCAA's own names.
// Run by hand with: node build-stats.mjs
import fs from "fs";

const BASE = (process.env.NCAA_API_BASE || "https://ncaa-api.henrygd.me").replace(/\/$/, "");
const OUT = "stats.json";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const IDS = {
  individual: [...range(130, 152), ...range(600, 630)],
  team: [...range(142, 172), ...range(210, 222), 286, 518, ...range(625, 640), ...range(930, 934)],
};

async function get(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(`${BASE}/${path}`, { headers: { "user-agent": "collegebasketball-site" } });
      if (r.ok) return await r.json();
      if (![428, 429, 500, 502, 503, 504].includes(r.status)) return null; // this number isn't a stat
    } catch { }
    await sleep(1500 * (attempt + 1)); // the free API turns away bursts, so wait and try again
  }
  return null;
}

const jobs = Object.entries(IDS).flatMap(([kind, ids]) => ids.map(id => ({ kind, id })));
const cats = []; let i = 0;
async function worker() {
  while (i < jobs.length) {
    const { kind, id } = jobs[i++];
    const j = await get(`stats/basketball-men/d1/current/${kind}/${id}`);
    if (j && j.title && Array.isArray(j.data) && j.data.length)
      cats.push({ kind, id, title: String(j.title).trim(), updated: j.updated || "", pages: +j.pages || 1, rows: j.data });
    await sleep(250);
  }
}
await Promise.all(Array.from({ length: 3 }, worker));
cats.sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id);

if (cats.length < 5) { console.error(`Only found ${cats.length} stats; keeping the old file.`); process.exit(1) }

// The complete list for each stat (every page), saved as stats/<kind>-<id>.json so search covers everyone.
fs.mkdirSync("stats", { recursive: true });
const pageJobs = cats.flatMap(c => Array.from({ length: Math.max(0, Math.min(c.pages, 60) - 1) }, (_, k) => ({ c, page: k + 2 })));
const pagesOf = new Map(cats.map(c => [c, { 1: c.rows }]));
let pj = 0, failed = 0;
async function pageWorker() {
  while (pj < pageJobs.length) {
    const { c, page } = pageJobs[pj++];
    const j = await get(`stats/basketball-men/d1/current/${c.kind}/${c.id}?page=${page}`);
    if (j && Array.isArray(j.data)) pagesOf.get(c)[page] = j.data; else failed++;
    await sleep(200);
  }
}
await Promise.all(Array.from({ length: 3 }, pageWorker));
for (const c of cats) {
  const pages = pagesOf.get(c), all = Object.keys(pages).sort((a, b) => a - b).flatMap(k => pages[k]);
  c.total = all.length; c.full = Object.keys(pages).length >= Math.min(c.pages, 60);
  fs.writeFileSync(`stats/${c.kind}-${c.id}.json`, JSON.stringify({ title: c.title, updated: c.updated, rows: all }));
}

fs.writeFileSync(OUT, JSON.stringify({ cats, built: Date.now() }));
console.log(`Saved ${cats.length} stat categories (${failed} pages couldn't load): ${cats.map(c => `${c.title} (${c.total})`).join(", ")}`);
