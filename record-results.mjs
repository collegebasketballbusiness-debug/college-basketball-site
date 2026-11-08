// Saves final scores from season.json to the database so Pick'em picks get graded.
// (The alert checker does this every minute too; this is the twice-a-day backup.)
// Runs in the "Update season schedule" GitHub Action. Needs the SUPABASE_SECRET_KEY secret.
import fs from "fs";
const key = process.env.SUPABASE_SECRET_KEY || "";
if (!key) { console.log("No SUPABASE_SECRET_KEY secret, skipping Pick'em grading."); process.exit(0) }
const url = (/url:\s*"([^"]+)"/.exec(fs.readFileSync("chat-config.js", "utf8")) || [])[1];
const season = JSON.parse(fs.readFileSync("season.json", "utf8"));
const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
const rows = (season.games || []).filter(g => g.s === "final" && g.d >= since && g.a[2] !== "" && g.h[2] !== "" && +g.a[2] !== +g.h[2])
  .map(g => ({ game_id: g.id, winner: +g.h[2] > +g.a[2] ? "home" : "away", home_score: +g.h[2], away_score: +g.a[2], played_at: new Date((g.t || Date.parse(g.d) / 1000) * 1000).toISOString() }));
if (!rows.length) { console.log("No recent finals."); process.exit(0) }
const r = await fetch(`${url}/rest/v1/game_results`, {
  method: "POST",
  headers: { apikey: key, ...(key.startsWith("eyJ") ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(rows)
});
console.log(r.ok ? `Saved ${rows.length} final scores for Pick'em.` : `Couldn't save results (${r.status}): ${await r.text()}`);
