// Weekly College Basketball newsletter: new AP Top 25, last week's key results, this week's big games,
// and the week's stories. GitHub sends it every Monday at 5 PM Eastern (see .github/workflows/newsletter.yml).
//
// Settings come from GitHub secrets: SUPABASE_SECRET_KEY, GMAIL_APP_PASSWORD, MAIL_ADDRESS (your mailing address,
// required by law in marketing emails). TEST_TO sends one copy to that address only. FORCE skips the Monday 5 PM check.
// DRY_RUN=1 builds the email into newsletter-preview.html without sending anything.
import fs from "fs";
import vm from "vm";

const SITE = "https://collegebasketball.news";
const FROM = "collegebasketballbusiness@gmail.com";
const BASE = (process.env.NCAA_API_BASE || "https://ncaa-api.henrygd.me").replace(/\/$/, "");
const env = k => (process.env[k] || "").trim();
const TEST_TO = env("TEST_TO"), FORCE = env("FORCE") === "true" || env("FORCE") === "1" || !!TEST_TO, DRY = env("DRY_RUN") === "1";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Eastern time ----------
const etParts = d => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(d).map(x => [x.type, x.value]));
const now = new Date(), et = etParts(now), today = `${et.year}-${et.month}-${et.day}`;
const addDays = (ymd, n) => new Date(Date.parse(ymd + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const nice = ymd => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const tipET = t => t ? new Date(t * 1000).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }) + " ET" : "TBA";

// ---------- only on Monday at 5 PM Eastern, once ----------
const SENT = "newsletter-sent.json";
let sentLog = {}; try { sentLog = JSON.parse(fs.readFileSync(SENT, "utf8")) } catch { }
if (!FORCE && !DRY) {
  const hr = +et.hour;
  if (et.weekday !== "Mon" || hr < 17 || hr > 20) { console.log(`Not Monday 5 PM ET yet (${et.weekday} ${hr}:00 ET). Nothing to send.`); process.exit(0) }
  if (sentLog.last === today) { console.log(`Already sent today (${today}).`); process.exit(0) }
}

async function getJSON(url, headers = {}) {
  for (let i = 0; i < 5; i++) {
    try { const r = await fetch(url, { headers: { "user-agent": "collegebasketball-site", ...headers } }); if (r.ok) return r.json(); if (![428, 429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${url} → ${r.status}`) }
    catch (e) { if (i === 4) throw e }
    await sleep(1500 * (i + 1));
  }
}
const norm = s => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/['’.]/g, "").replace(/\bsaint\b/g, "st").replace(/\bstate\b/g, "st").replace(/[^a-z0-9() ]+/g, " ").replace(/\s+/g, " ").trim();

// ---------- the AP poll, with movement from last week's poll ----------
const poll = await getJSON(`${BASE}/rankings/basketball-men/d1/associated-press`);
const rows = (poll.data || []).map(r => {
  const m = /^(.*?)\s*\((\d+)\)\s*$/.exec(String(r.SCHOOL || "").trim());
  return { rank: +r.RANK || 0, team: m ? m[1] : String(r.SCHOOL || "").trim(), fpv: m ? +m[2] : 0, pts: r.POINTS || "", record: r.RECORD || r["W-L"] || "", prevCol: r.PREVIOUS || r.PREV || "" };
}).filter(r => r.rank).slice(0, 25);
let lastPoll = {}, lastNames = {}; try { const lp = JSON.parse(fs.readFileSync("poll-last.json", "utf8")); lastPoll = lp.ranks || {}; lastNames = lp.names || {} } catch { }
const pollRank = {}; for (const r of rows) pollRank[norm(r.team)] = r.rank;
for (const r of rows) {
  const prev = lastPoll[norm(r.team)] ?? (/^\d+$/.test(r.prevCol) ? +r.prevCol : r.prevCol ? 0 : undefined);
  r.move = prev === undefined ? "" : prev === 0 ? "NEW" : prev === r.rank ? "–" : prev > r.rank ? `▲${prev - r.rank}` : `▼${r.rank - prev}`;
}
const outOfPoll = Object.keys(lastPoll).filter(k => !pollRank[k]).map(k => lastNames[k] || k);

// ---------- last week's results and this week's games, from season.json ----------
let season = { games: [] }; try { season = JSON.parse(fs.readFileSync("season.json", "utf8")) } catch { }
const lastMon = addDays(today, -7), lastSun = addDays(today, -1), thisSun = addDays(today, 6);
const games = season.games || [];
const rk = t => +t[3] || 0, nm = t => t[1], rn = t => rk(t) ? `No. ${rk(t)} ${nm(t)}` : nm(t);
const results = [];
for (const g of games.filter(g => g.d >= lastMon && g.d <= lastSun && g.s === "final")) {
  const aw = +g.a[2] > +g.h[2], W = aw ? g.a : g.h, L = aw ? g.h : g.a, ot = /OT/i.test(g.f || "");
  if (rk(L) && (!rk(W) || rk(W) - rk(L) >= 10)) results.push({ kind: "Upset", score: 200 - rk(L), g, W, L, ot });
  else if (rk(W) && rk(L)) results.push({ kind: "Top 25 matchup", score: 120 - Math.min(rk(W), rk(L)), g, W, L, ot });
  else if (ot && (rk(W) || rk(L))) results.push({ kind: "Overtime", score: 60, g, W, L, ot });
}
results.sort((a, b) => b.score - a.score);
const upcoming = games.filter(g => g.d >= today && g.d <= thisSun && g.s !== "final")
  .map(g => ({ g, ra: pollRank[norm(g.a[1])] || 0, rh: pollRank[norm(g.h[1])] || 0 }))
  .filter(x => x.ra && x.rh).sort((a, b) => (a.ra + a.rh) - (b.ra + b.rh)).slice(0, 10);

// ---------- stories, injuries and your note ----------
let NEWS = []; try { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync("news.js", "utf8"), ctx); NEWS = ctx.window.NEWS || [] } catch { }
const INJ = /injur|surgery|sidelined|appendectomy|torn|sprain|concussion|questionable|day-to-day|out for|ruled out|fracture|broken|ankle|knee|hamstring|illness/i;
const injuries = NEWS.filter(n => INJ.test([n.t, n.dek, ...(n.body || [])].join(" "))).slice(0, 4);
const stories = NEWS.filter(n => !injuries.includes(n)).slice(0, 4);
let note = ""; try { note = fs.readFileSync("newsletter-note.md", "utf8").replace(/<!--[\s\S]*?-->/g, "").trim() } catch { }

// ---------- the email ----------
const weekOf = nice(today);
const subject = `🏀 New AP Top 25 + this week's biggest games (week of ${weekOf})`;
const C = { ink: "#111111", muted: "#6B6B66", line: "#E6E6E1", ball: "#FF6A13", up: "#15803D", down: "#B91C1C", soft: "#F6F6F3" };
const h2 = (emoji, t) => `<tr><td style="padding:28px 28px 8px"><div style="font:900 22px/1.1 Impact,'Arial Narrow',Arial,sans-serif;letter-spacing:.5px;text-transform:uppercase;color:${C.ink}">${emoji} ${esc(t)}</div></td></tr>`;
const pollRows = list => list.map(r => `<tr><td style="padding:6px 0;border-bottom:1px solid ${C.line};width:30px;font:900 17px Impact,Arial,sans-serif;color:${C.ball}">${r.rank}</td>
  <td style="padding:6px 0;border-bottom:1px solid ${C.line};font:600 14px Arial,sans-serif;color:${C.ink}">${esc(r.team)}${r.fpv ? ` <span style="color:${C.muted};font-weight:400">(${r.fpv})</span>` : ""}${r.record ? ` <span style="color:${C.muted};font-weight:400;font-size:13px">${esc(r.record)}</span>` : ""}</td>
  <td style="padding:6px 0;border-bottom:1px solid ${C.line};text-align:right;font:700 12px Arial,sans-serif;color:${/▲|NEW/.test(r.move) ? C.up : /▼/.test(r.move) ? C.down : C.muted}">${esc(r.move)}</td></tr>`).join("");
const half = Math.ceil(rows.length / 2);
const resRows = results.slice(0, 10).map(x => `<tr><td style="padding:9px 0;border-bottom:1px solid ${C.line}"><div style="font:700 11px Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:${x.kind === "Upset" ? C.down : C.ball}">${x.kind === "Upset" ? "🚨 " : ""}${esc(x.kind)} · ${nice(x.g.d)}</div>
  <div style="font:600 15px/1.35 Arial,sans-serif;color:${C.ink};margin-top:3px">${esc(rn(x.W))} ${+x.W[2]}, ${esc(rn(x.L))} ${+x.L[2]}${x.ot ? " (OT)" : ""}</div></td></tr>`).join("");
const upRows = upcoming.map(x => `<tr><td style="padding:9px 0;border-bottom:1px solid ${C.line}"><div style="font:700 11px Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:${C.ball}">${esc(tipET(x.g.t))}</div>
  <div style="font:600 15px/1.35 Arial,sans-serif;color:${C.ink};margin-top:3px">No. ${x.ra} ${esc(nm(x.g.a))} <span style="color:${C.muted};font-weight:400">at</span> No. ${x.rh} ${esc(nm(x.g.h))}</div></td></tr>`).join("");
const storyRows = list => list.map(n => `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.line}"><a href="${SITE}/#news" style="font:700 15px/1.35 Arial,sans-serif;color:${C.ink};text-decoration:none">${esc(n.t)}</a><div style="font:13px/1.45 Arial,sans-serif;color:${C.muted};margin-top:3px">${esc(n.dek)}</div></td></tr>`).join("");
const table = inner => `<tr><td style="padding:0 28px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${inner}</table></td></tr>`;
const p = t => `<tr><td style="padding:4px 28px;font:15px/1.5 Arial,sans-serif;color:${C.muted}">${t}</td></tr>`;
const hd = (emoji, t) => `<div style="font:900 20px/1.1 Impact,'Arial Narrow',Arial,sans-serif;letter-spacing:.5px;text-transform:uppercase;color:${C.ink};padding:24px 0 6px">${emoji} ${esc(t)}</div>`;
const tb = inner => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${inner}</table>`;
const note2 = t => `<div style="font:14px/1.5 Arial,sans-serif;color:${C.muted};padding:6px 0">${t}</div>`;
const col = html => `<div style="display:inline-block;vertical-align:top;width:100%;max-width:312px;font-size:16px;text-align:left"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:0 10px">${html}</td></tr></table></div>`;
const cols = (a, b) => !a && !b ? "" : `<tr><td align="center" style="padding:0 18px;font-size:0">${a && b ? `<!--[if mso]><table role="presentation" width="100%"><tr><td width="50%" valign="top"><![endif]-->${col(a)}<!--[if mso]></td><td width="50%" valign="top"><![endif]-->${col(b)}<!--[if mso]></td></tr></table><![endif]-->` : `<div style="font-size:16px;text-align:left;padding:0 10px">${a || b}</div>`}</td></tr>`;

function emailHTML(unsubURL) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#EDEDE8">
<div style="display:none;max-height:0;overflow:hidden">The new AP Top 25, last week's biggest results and this week's must-watch games.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#EDEDE8"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden">
  <tr><td style="background:#0B0B0C;padding:26px 28px">
    <div style="font:900 30px/1 Impact,'Arial Narrow',Arial,sans-serif;letter-spacing:1px;color:#F5F5F2">COLLEGE BASKETBALL</div>
    <div style="font:700 12px Arial,sans-serif;letter-spacing:2px;color:${C.ball};margin-top:8px">WEEKLY · WEEK OF ${esc(weekOf.toUpperCase())}</div>
  </td></tr>
  ${note ? `<tr><td style="padding:24px 28px 0"><div style="background:${C.soft};border-left:4px solid ${C.ball};padding:14px 16px;font:15px/1.55 Arial,sans-serif;color:${C.ink}"><b>✍️ Coach's note</b><br>${esc(note).replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>")}</div></td></tr>` : ""}
  ${h2("🏆", "The new AP Top 25")}
  ${rows.length ? cols(tb(pollRows(rows.slice(0, half))), tb(pollRows(rows.slice(half)))) : p("The new poll wasn't out yet when this was sent. See it on the Rankings tab.")}
  ${outOfPoll.length ? p(`Dropped out: ${esc(outOfPoll.join(", "))}.`) : ""}
  ${cols(hd("📊", "Last week's key results") + (results.length ? tb(resRows) : note2("No upsets or Top 25 matchups last week.")),
         hd("📅", "Big games this week") + (upcoming.length ? tb(upRows) : note2("No Top 25 vs. Top 25 games this week. Every game is live on the site.")))}
  ${cols(injuries.length ? hd("🩹", "Injury watch") + tb(storyRows(injuries)) : "", stories.length ? hd("📰", "Stories of the week") + tb(storyRows(stories)) : "")}
  <tr><td style="padding:28px" align="center"><a href="${SITE}" style="display:inline-block;background:${C.ball};color:#111;font:800 16px Arial,sans-serif;text-decoration:none;padding:14px 26px;border-radius:999px">Live scores, chat &amp; picks →</a></td></tr>
  <tr><td style="background:${C.soft};padding:20px 28px;font:12px/1.6 Arial,sans-serif;color:${C.muted}">
    You're getting this because you signed up for College Basketball updates at ${esc(SITE.replace("https://", ""))}.
    <a href="${unsubURL}" style="color:${C.muted}">Unsubscribe</a> anytime.<br>
    © ${et.year} College Basketball Media LLC${env("MAIL_ADDRESS") ? ` · ${esc(env("MAIL_ADDRESS"))}` : ""} · Not affiliated with the NCAA.
  </td></tr>
</table></td></tr></table></body></html>`;
}
function emailText(unsubURL) {
  const L = [`COLLEGE BASKETBALL WEEKLY · week of ${weekOf}`, ""];
  if (note) L.push("COACH'S NOTE", note, "");
  L.push("THE NEW AP TOP 25", ...rows.map(r => `${r.rank}. ${r.team}${r.fpv ? ` (${r.fpv})` : ""} ${r.move}`.trim()), "");
  L.push("LAST WEEK'S KEY RESULTS", ...(results.length ? results.slice(0, 10).map(x => `${x.kind}: ${rn(x.W)} ${+x.W[2]}, ${rn(x.L)} ${+x.L[2]}${x.ot ? " (OT)" : ""}`) : ["No upsets or Top 25 matchups last week."]), "");
  L.push("BIG GAMES THIS WEEK", ...(upcoming.length ? upcoming.map(x => `No. ${x.ra} ${nm(x.g.a)} at No. ${x.rh} ${nm(x.g.h)} · ${tipET(x.g.t)}`) : ["No Top 25 vs. Top 25 games this week."]), "");
  if (injuries.length) L.push("INJURY WATCH", ...injuries.map(n => `${n.t}: ${n.dek}`), "");
  if (stories.length) L.push("STORIES OF THE WEEK", ...stories.map(n => `${n.t}: ${n.dek}`), "");
  L.push(`Live scores, chat & picks: ${SITE}`, "", `Unsubscribe: ${unsubURL}`, `College Basketball Media LLC${env("MAIL_ADDRESS") ? ` · ${env("MAIL_ADDRESS")}` : ""}`);
  return L.join("\n");
}

// ---------- who gets it ----------
let list;
if (TEST_TO) list = [{ email: TEST_TO, token: "test-copy" }];
else {
  const cfg = fs.readFileSync("chat-config.js", "utf8"), url = (/url:\s*"([^"]+)"/.exec(cfg) || [])[1], key = env("SUPABASE_SECRET_KEY");
  if (!url || !key) { console.error("Missing the Supabase URL (chat-config.js) or the SUPABASE_SECRET_KEY secret."); process.exit(1) }
  const headers = { apikey: key }; if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  list = await getJSON(`${url}/rest/v1/subscribers?select=email,token&subscribed=eq.true&order=id`, headers);
}
console.log(`Poll: ${rows.length} teams · results: ${results.length} · games this week: ${upcoming.length} · injuries: ${injuries.length} · stories: ${stories.length} · note: ${note ? "yes" : "no"}`);
console.log(`Sending to ${list.length} ${list.length === 1 ? "person" : "people"}${TEST_TO ? " (test copy)" : ""}.`);

if (DRY) { fs.writeFileSync("newsletter-preview.html", emailHTML(`${SITE}/#unsubscribe-preview`)); fs.writeFileSync("newsletter-preview.txt", emailText(`${SITE}/#unsubscribe-preview`)); console.log("Dry run: wrote newsletter-preview.html"); process.exit(0) }

// ---------- send (from your Gmail) ----------
const pass = env("GMAIL_APP_PASSWORD").replace(/\s+/g, "");
if (!pass) { console.error("Missing the GMAIL_APP_PASSWORD secret."); process.exit(1) }
const nodemailer = (await import("nodemailer")).default;
const mail = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: FROM, pass } });
let sent = 0, failed = 0;
for (const s of list.slice(0, 450)) { // Gmail allows about 500 emails a day
  const unsub = s.token === "test-copy" ? `${SITE}/#scores` : `${SITE}/#unsubscribe-${s.token}`;
  try {
    await mail.sendMail({
      from: `"College Basketball" <${FROM}>`, to: s.email, subject, html: emailHTML(unsub), text: emailText(unsub),
      headers: { "List-Unsubscribe": `<${unsub}>, <mailto:${FROM}?subject=unsubscribe>` },
    });
    sent++;
  } catch (e) { failed++; console.warn(`Couldn't send to ${s.email}: ${e.message}`) }
  await sleep(1200);
}
if (list.length > 450) console.warn(`${list.length - 450} people weren't sent to (Gmail's daily limit). Time to move to an email service.`);
console.log(`Sent ${sent}${failed ? `, ${failed} failed` : ""}.`);
if (failed && !sent) { console.error("No emails went out. Check the GMAIL_APP_PASSWORD secret (16 letters from Google App passwords)."); process.exit(1) }

// remember this week's poll (for next week's ▲▼) and that this week's email went out
if (!TEST_TO && sent) {
  fs.writeFileSync("poll-last.json", JSON.stringify({ date: today, ranks: pollRank, names: Object.fromEntries(rows.map(r => [norm(r.team), r.team])) }));
  fs.writeFileSync(SENT, JSON.stringify({ last: today, sent }));
}
