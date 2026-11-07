// Builds stats.json: every Division I men's stat category the NCAA has, with its top 50, for the Stats tab.
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
fs.writeFileSync(OUT, JSON.stringify({ cats, built: Date.now() }));
console.log(`Saved ${cats.length} stat categories: ${cats.map(c => c.title).join(", ")}`);
