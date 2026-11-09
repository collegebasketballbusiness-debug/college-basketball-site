// A team's full schedule as a calendar feed: collegebasketball.news/cal/indiana.ics
// Subscribe in Apple, Google or Outlook Calendar and every game shows up with its tip time, TV channel and a
// link to the game. Calendars re-check the feed on their own, so time changes and final scores come through.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SITE = "https://collegebasketball.news";
let rows = null, names = null;

async function siteFile(name) {
  try { return readFileSync(join(process.cwd(), name), "utf8") }
  catch { const r = await fetch(`${SITE}/${name}`); if (!r.ok) throw new Error(name); return r.text() }
}
async function load() {
  if (!rows) rows = JSON.parse(await siteFile("season.json")).games || [];
  if (!names) {
    const w = {}; new Function("window", await siteFile("teams.js"))(w); names = {};
    for (const [n, s] of Object.entries(w.TEAM_SLUGS || {})) if (!names[s] || n.length < names[s].length) names[s] = n;
  }
}
const slugify = s => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fix = s => { s = String(s ?? ""); try { return /Ã|Â/.test(s) ? decodeURIComponent(escape(s)) : s } catch { return s } };
const txt = s => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// calendar lines may be at most 75 bytes; longer ones continue on the next line after a space
function fold(line) {
  const out = []; let cur = "", bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0 }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export default async function handler(req, res) {
  const slug = String(req.query.slug || "").toLowerCase().replace(/\.ics$/, "");
  try { await load() } catch { res.statusCode = 503; res.end("Calendar not available right now"); return }
  if (!/^[a-z0-9-]{1,60}$/.test(slug) || !names[slug]) { res.statusCode = 404; res.end("Team not found"); return }
  const team = fix(names[slug]).replace(/ St\.$/, " State");
  const now = stamp(new Date());
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//College Basketball//Team schedule//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${txt(`${team} Basketball`)}`, `X-WR-CALDESC:${txt(`${team} men's basketball schedule from collegebasketball.news`)}`,
    "X-WR-TIMEZONE:America/New_York", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
  const games = rows.filter(g => g.a?.[0] === slug || g.h?.[0] === slug);
  for (const g of games) {
    const home = g.h[0] === slug, me = home ? g.h : g.a, op = home ? g.a : g.h;
    const opName = fix(op[1]), url = `${SITE}/game/${g.id}/${slugify(g.a[1])}-vs-${slugify(g.h[1])}`;
    let summary = home ? `${team} vs ${opName}` : `${team} at ${opName}`;
    if (g.s === "final") { const won = +me[2] > +op[2]; summary = `${won ? "W" : "L"} ${me[2]}-${op[2]} ${home ? "vs" : "at"} ${opName}` }
    const desc = [g.n ? `TV: ${g.n}` : "", g.s === "final" ? `Final: ${team} ${me[2]}, ${opName} ${op[2]}` : "", `Live scores, play-by-play & fan chat: ${url}`].filter(Boolean).join("\n");
    L.push("BEGIN:VEVENT", `UID:game-${g.id}@collegebasketball.news`, `DTSTAMP:${now}`);
    if (+g.t) { const s = new Date(+g.t * 1000); L.push(`DTSTART:${stamp(s)}`, `DTEND:${stamp(new Date(s.getTime() + 2 * 3600e3))}`) }
    else if (g.d) { const d = g.d.replace(/-/g, ""), n = new Date(g.d + "T12:00:00Z"); n.setUTCDate(n.getUTCDate() + 1); L.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${n.toISOString().slice(0, 10).replace(/-/g, "")}`) }
    else { L.pop(); L.pop(); L.pop(); continue }
    L.push(`SUMMARY:${txt(`🏀 ${summary}`)}`, `DESCRIPTION:${txt(desc)}`, `URL:${url}`);
    if (g.n) L.push(`LOCATION:${txt(`TV: ${g.n}`)}`);
    L.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="${slug}.ics"`);
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.end(L.map(fold).join("\r\n") + "\r\n");
}
