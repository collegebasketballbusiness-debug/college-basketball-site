// Builds season.json: every Division I men's game this season (Nov 1 – Apr 8), for the Teams pages.
// GitHub runs this twice a day (see .github/workflows/update-season.yml) and saves the result in the repo,
// so team schedules load instantly, even right after the site is updated.
// Run by hand with: node build-season.mjs
import fs from "fs";

const BASE = (process.env.NCAA_API_BASE || "https://ncaa-api.henrygd.me").replace(/\/$/, "");
const OUT = "season.json";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Today's date in US Eastern time (NCAA dates are Eastern)
const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(x => [x.type, x.value]));
const y = +p.year, mo = +p.month;
const start = Date.UTC(mo >= 7 ? y : y - 1, 10, 1), end = Date.UTC(mo >= 7 ? y + 1 : y, 3, 8);
const dates = [];
for (let t = start; t <= end; t += 864e5) dates.push(new Date(t).toISOString().slice(0, 10));

// The previous file, so a day that fails to load this time keeps its old games
let old = { games: [] };
try { old = JSON.parse(fs.readFileSync(OUT, "utf8")) } catch { }
const oldByDay = {};
for (const g of old.games || []) (oldByDay[g.d] ||= []).push(g);

async function getDay(date) {
  const [yy, mm, dd] = date.split("-");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(`${BASE}/scoreboard/basketball-men/d1/${yy}/${mm}/${dd}/all-conf`, { headers: { "user-agent": "collegebasketball-site" } });
      if (r.status === 404) return [];
      if (r.ok) {
        const data = await r.json();
        const team = t => [t.names?.seo || "", (t.names?.short || "").trim(), t.score || "", t.rank || ""];
        return (data.games || []).map(x => x.game).map(g => ({
          id: g.gameID, d: date, s: g.gameState, t: +g.startTimeEpoch || 0, n: g.network || "",
          f: g.finalMessage || "", p: g.currentPeriod || "", c: g.contestClock || "",
          a: team(g.away), h: team(g.home)
        }));
      }
    } catch { }
    await sleep(1500 * (attempt + 1)); // the free API turns away bursts, so wait and try again
  }
  return null;
}

const games = []; let missing = 0, i = 0;
async function worker() {
  while (i < dates.length) {
    const date = dates[i++];
    const list = await getDay(date);
    if (list) games.push(...list);
    else { missing++; games.push(...(oldByDay[date] || [])) }
    await sleep(250);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
games.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.t - b.t));

if (!games.length) { console.error("No games found; keeping the old file."); process.exit(1) }
fs.writeFileSync(OUT, JSON.stringify({ games, missingDays: missing, built: Date.now() }));
console.log(`Saved ${games.length} games from ${dates.length} days (${missing} days kept from the last run).`);
