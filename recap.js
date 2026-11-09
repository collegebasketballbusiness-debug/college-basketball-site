// Game recap pages: collegebasketball.news/game/6651023/notre-dame-vs-villanova
// When a game is final, this writes a short recap from the official box score and play-by-play
// (who won, how it unfolded, top performers, the numbers), with the box score, a game-flow chart and
// the key plays. Each finished game gets its own page that search engines can list and fans can share.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SITE = "https://collegebasketball.news";

// ---------- data ----------
let season = null;
async function seasonRows() {
  if (season) return season;
  let txt;
  try { txt = readFileSync(join(process.cwd(), "season.json"), "utf8") }
  catch { const r = await fetch(`${SITE}/season.json`); txt = r.ok ? await r.text() : '{"games":[]}' }
  const map = {};
  for (const g of JSON.parse(txt).games || []) map[g.id] = g;
  return (season = map);
}
async function relay(origin, path) {
  const r = await fetch(`${origin}/api/ncaa?path=${encodeURIComponent(path)}`, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}
const safe = p => p.catch(() => null);

// ---------- small helpers ----------
const fix = s => { s = String(s ?? ""); try { return /Ã|Â/.test(s) ? decodeURIComponent(escape(s)) : s } catch { return s } };
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clockSecs = c => { const m = /^(\d+):(\d+)/.exec(String(c || "")); return m ? +m[1] * 60 + +m[2] : 0 };
const clockTxt = c => String(c || "").replace(/^0(\d:)/, "$1");
const pct = (m, a) => (+a ? Math.round(+m / +a * 100) : 0);
const and = list => list.length > 1 ? list.slice(0, -1).join(", ") + " and " + list.at(-1) : list[0] || "";
const slugify = s => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const logo = slug => `/api/ncaa?path=${encodeURIComponent(`logo/${slug}.svg`)}`;
const perName = (i, label) => label ? String(label).replace(/ Half$/i, "").replace(/^1st$/, "1st").replace(/^2nd$/, "2nd") : i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "OT" : `${i - 1}OT`;

// ---------- the recap ----------
function build(id, row, sbg, c, box, pbp) {
  const teams = c?.teams || [];
  const tH = teams.find(t => t.isHome) || {}, tA = teams.find(t => !t.isHome) || {};
  const side = (t, rowT, sbT) => ({
    id: String(t.teamId || ""), slug: t.seoname || rowT?.[0] || sbT?.names?.seo || "",
    name: fix(t.nameShort || rowT?.[1] || sbT?.names?.short || "Team"),
    rank: +(sbT?.rank || rowT?.[3] || t.teamRank || 0) || 0,
    record: String(t.record || "").replace(/[()]/g, ""), color: t.color || "#FF6A13",
    score: +(sbT?.score ?? rowT?.[2] ?? NaN),
  });
  const H = side(tH, row?.h, sbg?.home), A = side(tA, row?.a, sbg?.away);
  const tb = box?.teamBoxscore || [];
  const bH = tb.find(x => String(x.teamId) === H.id), bA = tb.find(x => String(x.teamId) === A.id);
  if (Number.isNaN(H.score)) H.score = +(bH?.teamStats?.points || 0);
  if (Number.isNaN(A.score)) A.score = +(bA?.teamStats?.points || 0);
  const homeWon = H.score > A.score, W = homeWon ? H : A, L = homeWon ? A : H, bW = homeWon ? bH : bA, bL = homeWon ? bA : bH;
  const nm = t => t.name, rn = t => t.rank ? `No. ${t.rank} ${t.name}` : t.name;
  const fin = String(sbg?.finalMessage || row?.f || c?.finalMessage || "");
  const otM = fin.match(/(\d)?\s*OT/i), ot = !!otM, otWord = otM ? (otM[1] && otM[1] !== "1" ? `${otM[1]} overtimes` : "overtime") : "";
  const score = `${W.score}–${L.score}`, margin = W.score - L.score;
  const dateISO = row?.d || (sbg?.startDate ? sbg.startDate.split("/").reverse().join("-") : "") || "";
  const dt = dateISO ? new Date(dateISO + "T12:00:00Z") : null;
  const dayName = dt ? dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : "";
  const dateLong = dt ? dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
  const venue = c?.location?.venue ? fix(c.location.venue) : "", city = [c?.location?.city, c?.location?.stateUsps].filter(Boolean).map(fix).join(", ");

  const players = b => (b?.playerStats || []).map(x => ({
    name: fix(`${x.firstName || ""} ${x.lastName || ""}`).replace(/\s+/g, " ").trim(), pos: x.position || "", min: x.minutesPlayed || "",
    starter: !!x.starter, pts: +x.points || 0, reb: +x.totalRebounds || 0, ast: +x.assists || 0, stl: +x.steals || 0, blk: +x.blockedShots || 0,
    fgm: +x.fieldGoalsMade || 0, fga: +x.fieldGoalsAttempted || 0, tpm: +x.threePointsMade || 0, tpa: +x.threePointsAttempted || 0,
    ftm: +x.freeThrowsMade || 0, fta: +x.freeThrowsAttempted || 0, to: +x.turnovers || 0,
  })).filter(p => p.name).sort((a, b) => b.pts - a.pts || b.reb - a.reb);
  const pW = players(bW), pL = players(bL), star = [...pW, ...pL].sort((a, b) => b.pts - a.pts)[0];
  const line = x => { const p = [`${x.pts} points`]; if (x.reb >= 8) p.push(`${x.reb} rebounds`); if (x.ast >= 6) p.push(`${x.ast} assists`); return and(p) };
  const shoot = x => x.fga ? ` on ${x.fgm}-of-${x.fga} shooting` : "";

  // play-by-play: margin over time, lead changes, ties, biggest leads, the go-ahead basket, late scoring
  const plays = [], series = [];
  let lc = 0, ties = 0, prev = 0, maxW = 0, maxL = 0, goAhead = null, maxH = 0, maxA = 0, elapsedEnd = 0;
  (pbp?.periods || []).forEach((per, pi) => {
    const len = pi < 2 ? 1200 : 300, start = pi < 2 ? pi * 1200 : 2400 + (pi - 2) * 300;
    elapsedEnd = start + len;
    for (const x of per.playbyplayStats || []) {
      const p = { ...x, pi, per: perName(pi, per.periodDisplay), text: fix(x.eventDescription || x.homeText || x.visitorText || "").replace(/\s+/g, " ").trim() };
      plays.push(p);
      if (x.homeScore === undefined || x.homeScore === "" || x.homeScore === null) continue;
      const hm = +x.homeScore || 0, vs = +x.visitorScore || 0, t = start + len - Math.min(len, clockSecs(x.clock));
      series.push([t, hm - vs]); maxH = Math.max(maxH, hm - vs); maxA = Math.max(maxA, vs - hm);
      const lead = (homeWon ? 1 : -1) * (hm - vs);
      if (lead !== 0 && prev !== 0 && Math.sign(lead) !== Math.sign(prev)) lc++;
      if (lead === 0 && prev !== 0) ties++;
      if (lead > 0 && prev <= 0) goAhead = p;
      maxW = Math.max(maxW, lead); maxL = Math.max(maxL, -lead); prev = lead;
    }
  });
  if (series.length) series.push([elapsedEnd, series.at(-1)[1]]);

  // why the game matters
  let why = "normal";
  if (L.rank && (!W.rank || W.rank - L.rank >= 10)) why = "upset";
  else if (W.rank && L.rank) why = "top25";
  else if (ot) why = "ot";

  // headline
  let title;
  if (why === "upset") title = W.rank ? `${rn(W)} upsets ${rn(L)}, ${score}` : `${nm(W)} stuns ${rn(L)}, ${score}`;
  else if (why === "top25") title = `${rn(W)} ${ot ? "outlasts" : "beats"} ${rn(L)}${ot ? ` in ${otWord}` : ""}, ${score}`;
  else if (ot) title = `${rn(W)} survives ${rn(L)} in ${otWord}, ${score}`;
  else if (star && star.pts >= 25 && pW.includes(star)) title = `${star.name}'s ${star.pts} lifts ${rn(W)} past ${rn(L)}, ${score}`;
  else if (margin >= 25) title = `${rn(W)} rolls past ${rn(L)}, ${score}`;
  else if (margin <= 3) title = `${rn(W)} edges ${rn(L)}, ${score}`;
  else title = `${rn(W)} beats ${rn(L)}, ${score}`;

  // story
  const body = [];
  let lead = `${rn(W)} beat ${rn(L)} ${score}${ot ? ` in ${otWord}` : ""}${dayName ? ` on ${dayName}` : ""}${venue ? ` at ${venue}${city ? ` in ${city}` : ""}` : ""}.`;
  if (why === "upset") lead += W.rank ? ` ${nm(W)} came in ranked No. ${W.rank}, ${W.rank - L.rank} spots below ${nm(L)} in the AP poll.` : ` ${nm(L)} came in ranked No. ${L.rank} in the AP poll; ${nm(W)} was unranked.`;
  if (why === "top25") lead += " It was a matchup of two Top 25 teams.";
  if (W.record && L.record) lead += ` ${nm(W)} is now ${W.record}; ${nm(L)} falls to ${L.record}.`;
  body.push(lead);
  const ls1 = (c?.linescores || []).find(l => String(l.period) === "1");
  if (ls1) {
    const hW = +(homeWon ? ls1.home : ls1.visit), hL = +(homeWon ? ls1.visit : ls1.home);
    let flow = hW > hL ? `${nm(W)} led ${hW}–${hL} at halftime` : hW < hL ? `${nm(W)} trailed ${hL}–${hW} at halftime` : `The teams were tied ${hW}–${hL} at halftime`;
    if (hW > hL) { if (maxW >= 12) flow += ` and built a lead as large as ${maxW}` }
    else if (maxL >= 8) flow += ` and was down by as many as ${maxL} before coming back${maxW >= 8 ? ` to lead by as many as ${maxW}` : ""}`;
    else flow += maxW >= 8 ? ` before pulling ahead by as many as ${maxW} in the second half` : " before taking control late";
    flow += ".";
    if (lc >= 3) flow += ` The lead changed hands ${lc} times${ties ? `, with ${ties} ties` : ""}.`;
    if (goAhead && goAhead.pi >= 1 && clockSecs(goAhead.clock) <= 180 && goAhead.text) flow += ` ${nm(W)} went ahead for good with ${clockTxt(goAhead.clock)} left in the ${goAhead.pi >= 2 ? "overtime" : "second half"}: ${goAhead.text.replace(/\.$/, "")}.`;
    body.push(flow);
  }
  if (pW[0]) {
    let perf = `${pW[0].name} led ${nm(W)} with ${line(pW[0])}${shoot(pW[0])}${pW[0].tpm >= 3 ? `, including ${pW[0].tpm} threes` : ""}.`;
    if (pW[1] && pW[1].pts >= 10) perf += ` ${pW[1].name} added ${line(pW[1])}.`;
    if (pL[0]) perf += ` For ${nm(L)}, ${pL[0].name} had ${line(pL[0])}${shoot(pL[0])}.`;
    body.push(perf);
  }
  const sw = bW?.teamStats, sl = bL?.teamStats;
  if (sw && sl) {
    const bits = [`${nm(W)} shot ${pct(sw.fieldGoalsMade, sw.fieldGoalsAttempted)}% from the field to ${nm(L)}'s ${pct(sl.fieldGoalsMade, sl.fieldGoalsAttempted)}%`];
    if (Math.abs(+sw.threePointsMade - +sl.threePointsMade) >= 4) bits.push(`made ${sw.threePointsMade} threes to ${sl.threePointsMade}`);
    if (Math.abs(+sw.totalRebounds - +sl.totalRebounds) >= 8) bits.push(`${+sw.totalRebounds > +sl.totalRebounds ? "won" : "lost"} the rebounding battle ${sw.totalRebounds}–${sl.totalRebounds}`);
    if (Math.abs(+sw.turnovers - +sl.turnovers) >= 5) bits.push(`committed ${sw.turnovers} turnovers to ${sl.turnovers}`);
    body.push(and(bits) + ".");
  }
  const dek = pW[0] ? `${pW[0].name} had ${pW[0].pts} for ${nm(W)}${pL[0] ? `; ${pL[0].name} scored ${pL[0].pts} for ${nm(L)}` : ""}.` : `${nm(W)} ${score} ${nm(L)}.`;

  // key plays: scoring in the last four minutes of regulation and all of overtime (newest last)
  const lastReg = plays.filter(p => p.text && p.homeScore !== undefined && p.homeScore !== "" && ((p.pi === 1 && clockSecs(p.clock) <= 240) || p.pi >= 2));
  let pk = "", key = [];
  for (const p of lastReg) { const k = `${p.homeScore}-${p.visitorScore}`; if (k === pk) continue; pk = k; key.push(p) }
  key = key.slice(-12);

  return { id, H, A, W, L, bH, bA, homeWon, title, dek, body, dateISO, dateLong, venue, city, ot, otWord, fin, series, maxH, maxA, key, lines: c?.linescores || [], why };
}

// ---------- page ----------
// team colors can be very dark (navy, black); lighten those so they show on the dark page
function readable(hex, fallback) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "")); if (!m) return fallback;
  let [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum < 0.3) { const k = 0.55 - lum; [r, g, b] = [r, g, b].map(v => Math.round(v + (255 - v) * k)) }
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}
function chartColors(r) {
  let h = readable(r.H.color, "#FF6A13"), a = readable(r.A.color, "#9C9C98");
  const d = (x, y) => [1, 3, 5].reduce((t, i) => t + Math.abs(parseInt(x.slice(i, i + 2), 16) - parseInt(y.slice(i, i + 2), 16)), 0);
  if (d(h, a) < 120) a = h === "#FF6A13" ? "#9C9C98" : "#FF6A13";
  return { h, a };
}
function chartSVG(r) {
  const s = r.series; if (s.length < 4) return "";
  const { h: hc, a: ac } = chartColors(r);
  const W = 720, Hh = 220, mid = Hh / 2, end = s.at(-1)[0] || 2400, top = Math.max(10, r.maxH, r.maxA);
  const x = t => (t / end * W).toFixed(1), y = v => (mid - v / top * (mid - 8)).toFixed(1);
  let d = `M0 ${mid}`; for (const [t, v] of s) d += ` L${x(t)} ${y(v)}`; d += ` L${W} ${mid} Z`;
  const half = 1200 / end * W;
  const lab = (t, txt) => `<text x="${x(t)}" y="${Hh - 6}" text-anchor="middle">${txt}</text>`;
  return `<figure class="flow"><figcaption><span><i style="background:${ac}"></i>${esc(r.A.name)} ahead</span><span><i style="background:${hc}"></i>${esc(r.H.name)} ahead</span></figcaption>
<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Scoring margin over the game: ${esc(r.H.name)}'s biggest lead was ${r.maxH}, ${esc(r.A.name)}'s was ${r.maxA}.">
<defs><clipPath id="up"><rect x="0" y="0" width="${W}" height="${mid}"/></clipPath><clipPath id="dn"><rect x="0" y="${mid}" width="${W}" height="${mid}"/></clipPath></defs>
<path d="${d}" fill="${hc}" clip-path="url(#up)" opacity=".9"/><path d="${d}" fill="${ac}" clip-path="url(#dn)" opacity=".9"/>
<line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="zero"/><line x1="${half.toFixed(1)}" x2="${half.toFixed(1)}" y1="0" y2="${Hh}" class="half"/>
<text x="8" y="22" class="cap">${esc(r.H.name)} +${r.maxH}</text><text x="8" y="${Hh - 26}" class="cap">${esc(r.A.name)} +${r.maxA}</text>
${lab(600, "1st half")}${lab(1800, "2nd half")}${end > 2400 ? lab(2400 + (end - 2400) / 2, "OT") : ""}
</svg></figure>`;
}
function lineScore(r) {
  const L = r.lines; if (!L.length) return "";
  const head = L.map((l, i) => `<th>${esc(i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "OT" : `${i - 1}OT`)}</th>`).join("");
  const rowFor = (t, k) => `<tr><td class="tn"><a href="/team/${esc(t.slug)}">${esc(t.name)}</a></td>${L.map(l => `<td>${esc(l[k])}</td>`).join("")}<td class="tot">${t.score}</td></tr>`;
  return `<table class="ls"><thead><tr><th></th>${head}<th>T</th></tr></thead><tbody>${rowFor(r.A, "visit")}${rowFor(r.H, "home")}</tbody></table>`;
}
function boxTable(t, b) {
  const ps = (b?.playerStats || []).map(x => ({ n: fix(`${x.firstName || ""} ${x.lastName || ""}`).trim(), pos: x.position || "", st: !!x.starter, min: x.minutesPlayed || "", pts: +x.points || 0, reb: +x.totalRebounds || 0, ast: +x.assists || 0, fg: `${+x.fieldGoalsMade || 0}-${+x.fieldGoalsAttempted || 0}`, tp: `${+x.threePointsMade || 0}-${+x.threePointsAttempted || 0}`, ft: `${+x.freeThrowsMade || 0}-${+x.freeThrowsAttempted || 0}`, stl: +x.steals || 0, blk: +x.blockedShots || 0, to: +x.turnovers || 0 })).filter(p => p.n);
  if (!ps.length) return "";
  ps.sort((a, b) => (b.st - a.st) || (b.pts - a.pts));
  const s = b.teamStats || {};
  return `<section class="box"><h3><img src="${logo(t.slug)}" alt="" width="22" height="22" loading="lazy" onerror="this.remove()"><a href="/team/${esc(t.slug)}">${esc(t.name)}</a></h3><div class="tw"><table><thead><tr><th class="l">Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>FG</th><th>3PT</th><th>FT</th><th>STL</th><th>BLK</th><th>TO</th></tr></thead><tbody>
${ps.map(p => `<tr${p.st ? ' class="st"' : ""}><td class="l">${esc(p.n)} <small>${esc(p.pos)}</small></td><td>${esc(p.min)}</td><td class="b">${p.pts}</td><td>${p.reb}</td><td>${p.ast}</td><td>${p.fg}</td><td>${p.tp}</td><td>${p.ft}</td><td>${p.stl}</td><td>${p.blk}</td><td>${p.to}</td></tr>`).join("")}
<tr class="tot"><td class="l">Team</td><td></td><td class="b">${esc(s.points ?? "")}</td><td>${esc(s.totalRebounds ?? "")}</td><td>${esc(s.assists ?? "")}</td><td>${esc(`${s.fieldGoalsMade ?? ""}-${s.fieldGoalsAttempted ?? ""}`)}</td><td>${esc(`${s.threePointsMade ?? ""}-${s.threePointsAttempted ?? ""}`)}</td><td>${esc(`${s.freeThrowsMade ?? ""}-${s.freeThrowsAttempted ?? ""}`)}</td><td>${esc(s.steals ?? "")}</td><td>${esc(s.blockedShots ?? "")}</td><td>${esc(s.turnovers ?? "")}</td></tr>
</tbody></table></div></section>`;
}
function compare(r) {
  const a = r.bA?.teamStats, h = r.bH?.teamStats; if (!a || !h) return "";
  const rows = [
    ["Field goals", `${a.fieldGoalsMade}-${a.fieldGoalsAttempted} (${pct(a.fieldGoalsMade, a.fieldGoalsAttempted)}%)`, `${h.fieldGoalsMade}-${h.fieldGoalsAttempted} (${pct(h.fieldGoalsMade, h.fieldGoalsAttempted)}%)`, pct(a.fieldGoalsMade, a.fieldGoalsAttempted), pct(h.fieldGoalsMade, h.fieldGoalsAttempted)],
    ["3-pointers", `${a.threePointsMade}-${a.threePointsAttempted} (${pct(a.threePointsMade, a.threePointsAttempted)}%)`, `${h.threePointsMade}-${h.threePointsAttempted} (${pct(h.threePointsMade, h.threePointsAttempted)}%)`, +a.threePointsMade, +h.threePointsMade],
    ["Free throws", `${a.freeThrowsMade}-${a.freeThrowsAttempted}`, `${h.freeThrowsMade}-${h.freeThrowsAttempted}`, +a.freeThrowsMade, +h.freeThrowsMade],
    ["Rebounds", a.totalRebounds, h.totalRebounds, +a.totalRebounds, +h.totalRebounds],
    ["Assists", a.assists, h.assists, +a.assists, +h.assists],
    ["Turnovers", a.turnovers, h.turnovers, -a.turnovers, -h.turnovers],
    ["Steals", a.steals, h.steals, +a.steals, +h.steals],
  ];
  return `<table class="cmp"><thead><tr><th>${esc(r.A.name)}</th><th></th><th>${esc(r.H.name)}</th></tr></thead><tbody>${rows.map(([k, x, y, vx, vy]) => `<tr><td class="${vx > vy ? "w" : ""}">${esc(x)}</td><th>${k}</th><td class="${vy > vx ? "w" : ""}">${esc(y)}</td></tr>`).join("")}</tbody></table>`;
}

const CSS = `:root{--bg:#0B0B0C;--surface:#151517;--raised:#1C1C1F;--ink:#F5F5F2;--muted:#9C9C98;--line:#2A2A2E;--ball:#FF6A13;--good:#4ADE80;--display:"Big Shoulders Display","Arial Narrow",Impact,sans-serif;--body:"Barlow",system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;color-scheme:dark}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--body);font-size:17px;line-height:1.6}
a{color:inherit}.wrap{max-width:860px;margin:0 auto;padding:0 16px}
.top{background:var(--surface);border-bottom:3px solid var(--ball)}.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;height:62px}
.brand{display:flex;align-items:center;gap:10px;white-space:nowrap;min-width:0;overflow:hidden;text-decoration:none;font:900 22px var(--display);text-transform:uppercase;letter-spacing:.01em}.brand img{width:36px;height:36px;flex:none}.brand span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.live{flex:none;background:var(--ball);color:#0B0B0C;text-decoration:none;font:800 14px var(--body);padding:8px 14px;border-radius:999px;white-space:nowrap}
.eyebrow{font:500 12px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ball);margin:28px 0 8px}
h1{font:900 clamp(34px,6vw,54px)/.98 var(--display);text-transform:uppercase;letter-spacing:.01em;margin:0 0 12px;text-wrap:balance}
.dek{color:var(--muted);font-size:18px;margin:0 0 22px}
.sb{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px}
.sb .t{display:flex;align-items:center;gap:12px;text-decoration:none;min-width:0}.sb .t.r{flex-direction:row-reverse;text-align:right}
.sb .t img{width:52px;height:52px;flex:none}.sb .t b{display:block;font:800 22px/1.05 var(--display);text-transform:uppercase}.sb .t small{color:var(--muted);font-size:13px}
.sb .t em{font-style:normal;color:var(--ball);font-weight:800;margin-right:4px}
.sb .s{font:900 44px/1 var(--display);text-align:center;white-space:nowrap}.sb .s .lo{color:var(--muted)}.sb .s small{display:block;font:500 12px var(--mono);letter-spacing:.1em;color:var(--muted);margin-top:6px}
.meta{color:var(--muted);font-size:14px;margin:10px 0 0}
.story p{margin:0 0 16px}.story{margin:26px 0 8px}
h2{font:900 26px var(--display);text-transform:uppercase;margin:34px 0 12px}
h3{display:flex;align-items:center;gap:8px;font:800 20px var(--display);text-transform:uppercase;margin:22px 0 8px}h3 a{text-decoration:none}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:center;white-space:nowrap}
th{font:500 11px var(--mono);letter-spacing:.08em;color:var(--muted);text-transform:uppercase}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:10px}.tw table td.l,.tw table th.l{text-align:left;position:sticky;left:0;background:var(--bg)}
.box td small{color:var(--muted)}.box tr.st td.l{font-weight:600}.box td.b{font-weight:800}.box tr.tot td{font-weight:700;background:var(--surface)}.box tr.tot td.l{background:var(--surface)}
.ls{max-width:460px}.ls td.tn{text-align:left;font-weight:600}.ls td.tn a{text-decoration:none}.ls td.tot{font-weight:800}
.cmp td{width:40%;font-variant-numeric:tabular-nums}.cmp td.w{color:var(--good);font-weight:700}.cmp th{width:20%}
.flow{margin:0}.flow figcaption{display:flex;gap:16px;font-size:13px;color:var(--muted);margin-bottom:6px}.flow i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.flow svg{width:100%;height:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px}.flow text{fill:var(--muted);font:15px var(--mono)}.flow .zero{stroke:#fff;stroke-opacity:.5}.flow .half{stroke:#fff;stroke-opacity:.15;stroke-dasharray:3 4}.flow .cap{fill:var(--ink)}
.key{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:10px;overflow:hidden}.key li{display:grid;grid-template-columns:78px 1fr auto;gap:10px;padding:9px 12px;border-bottom:1px solid var(--line);font-size:15px}.key li:last-child{border:0}
.key .c{font:500 12px var(--mono);color:var(--muted);padding-top:3px}.key .sc{font-weight:800;font-variant-numeric:tabular-nums}
.cta{margin:36px 0;padding:22px;border-radius:14px;background:linear-gradient(135deg,#1f140c,#151517);border:1px solid #4a2a14;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.cta b{font:900 24px var(--display);text-transform:uppercase}.cta p{margin:2px 0 0;color:var(--muted);font-size:15px}.cta .btns{display:flex;gap:8px;flex-wrap:wrap}
.btn{display:inline-block;text-decoration:none;font:800 14px var(--body);padding:10px 16px;border-radius:999px;border:1.5px solid var(--line)}.btn.p{background:var(--ball);border-color:var(--ball);color:#0B0B0C}
.muted{color:var(--muted);font-size:14px}.muted a{color:var(--ball)}
.livebar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;background:#2a0f0f;border:1px solid #6b1d1d;border-radius:12px;padding:12px 14px;margin:0 0 16px}.livebar span{font:800 13px var(--body);color:#FF4D4D;text-transform:uppercase;display:flex;align-items:center;gap:6px}.livebar i{width:8px;height:8px;border-radius:50%;background:#FF4D4D}.livebar .btn{margin-left:auto}
.facts{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:10px}.facts li{display:flex;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line)}.facts li:last-child{border:0}.facts span{color:var(--muted);width:80px;flex:none}.facts b{min-width:0;overflow-wrap:anywhere}.facts a{color:var(--ball)}
.picks .pl{display:flex;justify-content:space-between;gap:12px;font-size:15px;margin-bottom:6px}.picks .bar{display:flex;height:12px;border-radius:999px;overflow:hidden;background:#2c2c31}.picks .bar span:first-child{background:#6b6b70}.picks .bar span:last-child{background:var(--ball)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pv h3{margin-top:0}.pv h3 small{color:var(--muted);font:500 13px var(--mono)}
.form,.lead{list-style:none;margin:0;padding:0}.form li,.lead li{padding:8px 0;border-bottom:1px solid var(--line);font-size:15px}.form a{text-decoration:none}.form .w{color:var(--good);font-weight:800}.form .l{color:#FF7A6B;font-weight:800}
.lead li span{display:block;color:var(--muted);font-size:14px}.lead small{color:var(--muted)}
@media (max-width:600px){.two{grid-template-columns:1fr}}
.note{color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding:16px 0 40px;margin-top:30px}
@media (max-width:420px){.brand{font-size:18px}.brand img{width:30px;height:30px}.live{font-size:13px;padding:7px 11px}}
@media (max-width:600px){.sb{padding:14px 10px;gap:6px}.sb .t{flex-direction:column;text-align:center;gap:6px}.sb .t.r{flex-direction:column;text-align:center}.sb .t img{width:42px;height:42px}.sb .t b{font-size:17px}.sb .s{font-size:34px}.key li{grid-template-columns:62px 1fr auto}}`;

function page({ title, desc, url, robots, body, ld }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">${robots ? `<meta name="robots" content="${robots}">` : ""}
<link rel="canonical" href="${esc(url)}"><link rel="icon" type="image/png" href="/favicon.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><meta name="theme-color" content="#0B0B0C">
<meta property="og:type" content="article"><meta property="og:site_name" content="College Basketball"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/og-image.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${SITE}/og-image.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=Barlow:wght@400;600;700;800&family=IBM+Plex+Mono:wght@500&display=swap">
<style>${CSS}</style>${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : ""}
<script defer src="/_vercel/insights/script.js"></script></head><body>
<header class="top"><div class="wrap"><a class="brand" href="/#scores"><img src="/logo.png" alt="" width="36" height="36"><span>College Basketball</span></a><a class="live" href="/#scores">Live scores →</a></div></header>
<main class="wrap">${body}</main></body></html>`;
}

function recapHTML(r, url) {
  const tm = (t, right) => `<a class="t${right ? " r" : ""}" href="/team/${esc(t.slug)}"><img src="${logo(t.slug)}" alt="" width="52" height="52" onerror="this.style.visibility='hidden'"><span><b>${t.rank ? `<em>${t.rank}</em>` : ""}${esc(t.name)}</b><small>${esc(t.record)}</small></span></a>`;
  const aLo = r.A.score < r.H.score, finTxt = r.ot ? `FINAL/${r.otWord === "overtime" ? "OT" : r.fin.match(/\d/)?.[0] + "OT"}` : "FINAL";
  const keyHTML = r.key.length ? `<h2>Down the stretch</h2><ol class="key">${r.key.map(p => `<li><span class="c">${esc(p.per)} ${esc(clockTxt(p.clock))}</span><span>${esc(p.text)}</span><span class="sc">${esc(p.visitorScore)}–${esc(p.homeScore)}</span></li>`).join("")}</ol>` : "";
  const body = `<p class="eyebrow">Recap${r.dateLong ? ` · ${esc(r.dateLong)}` : ""}</p>
<h1>${esc(r.title)}</h1><p class="dek">${esc(r.dek)}</p>
<div class="sb">${tm(r.A)}<div class="s"><span class="${aLo ? "lo" : ""}">${r.A.score}</span>–<span class="${aLo ? "" : "lo"}">${r.H.score}</span><small>${finTxt}</small></div>${tm(r.H, 1)}</div>
${r.venue ? `<p class="meta">${esc(r.venue)}${r.city ? `, ${esc(r.city)}` : ""}</p>` : ""}
<article class="story">${r.body.map(p => `<p>${esc(p)}</p>`).join("")}</article>
${lineScore(r)}
${r.series.length > 3 ? `<h2>Game flow</h2>${chartSVG(r)}` : ""}
${keyHTML}
${compare(r) ? `<h2>Team stats</h2>${compare(r)}` : ""}
${(r.bA || r.bH) ? `<h2>Box score</h2>${boxTable(r.A, r.bA)}${boxTable(r.H, r.bH)}` : ""}
<div class="cta"><div><b>Never miss a game</b><p>Live scores, play-by-play, win odds, fan chat and Pick'em for every D-I game.</p></div><div class="btns"><a class="btn p" href="/#scores">Live scores</a><a class="btn" href="/team/${esc(r.W.slug)}">${esc(r.W.name)} schedule</a><a class="btn" href="/team/${esc(r.L.slug)}">${esc(r.L.name)} schedule</a></div></div>
<p class="note">This recap was written automatically from the official NCAA box score and play-by-play. Not affiliated with the NCAA or any school. Questions or corrections: collegebasketballbusiness@gmail.com</p>`;
  const iso = r.dateISO || undefined;
  const ld = [{ "@context": "https://schema.org", "@type": "NewsArticle", headline: r.title, description: r.dek, datePublished: iso, dateModified: iso, url, image: [`${SITE}/og-image.png`],
    author: { "@type": "Organization", name: "College Basketball", url: SITE }, publisher: { "@type": "Organization", name: "College Basketball", logo: { "@type": "ImageObject", url: `${SITE}/logo.png` } } },
  { "@context": "https://schema.org", "@type": "SportsEvent", name: `${r.A.name} vs. ${r.H.name}`, sport: "Basketball", startDate: iso, eventStatus: "https://schema.org/EventScheduled",
    location: r.venue ? { "@type": "Place", name: r.venue, address: r.city || undefined } : undefined,
    homeTeam: { "@type": "SportsTeam", name: r.H.name, url: `${SITE}/team/${r.H.slug}` }, awayTeam: { "@type": "SportsTeam", name: r.A.name, url: `${SITE}/team/${r.A.slug}` } }];
  const desc = `${r.W.name} ${r.W.score}, ${r.L.name} ${r.L.score}${r.ot ? ` (${r.otWord === "overtime" ? "OT" : r.otWord})` : ""}${r.dateLong ? `, ${r.dateLong}` : ""}. ${r.dek} Recap, box score, game flow and key plays.`;
  return page({ title: `${r.title} | Recap & Box Score`, desc, url, body, ld });
}

function waitHTML(id, msg, url) {
  return page({ title: "Game recap | College Basketball", desc: "Game recaps from College Basketball.", url, robots: "noindex",
    body: `<p class="eyebrow">Recap</p><h1>${esc(msg)}</h1><p class="dek">The recap is written automatically once the game is final. In the meantime, follow it live with play-by-play, win odds and fan chat.</p><p><a class="btn p" href="/#game-${esc(id)}">Follow it live →</a></p>` });
}

export const recapSlug = (row) => row ? `${slugify(row.a[1])}-vs-${slugify(row.h[1])}` : "";

// ---------- previews (before tip-off and while live) ----------
const CHAT = { url: "https://dpehfxkozkvceetwkbba.supabase.co", key: "sb_publishable_C_uc2r3fbhFvUtUwc9JvbA_hVEf0Fmc" }; // public key, same one the site uses
async function pickSplit(id) {
  const r = await fetch(`${CHAT.url}/rest/v1/rpc/pick_counts`, { method: "POST", headers: { apikey: CHAT.key, authorization: `Bearer ${CHAT.key}`, "content-type": "application/json" }, body: JSON.stringify({ ids: [id] }), signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const j = await r.json(); return Array.isArray(j) && j[0] ? { home: +j[0].home || 0, away: +j[0].away || 0 } : null;
}
function teamSeason(rows, slug, beforeT) {
  const games = Object.values(rows).filter(g => g.a?.[0] === slug || g.h?.[0] === slug).sort((x, y) => (+x.t || 0) - (+y.t || 0) || String(x.d).localeCompare(String(y.d)));
  const done = games.filter(g => g.s === "final" && (!beforeT || (+g.t || 0) < beforeT));
  let w = 0, l = 0; const form = [];
  for (const g of done) {
    const home = g.h[0] === slug, me = home ? g.h : g.a, op = home ? g.a : g.h, won = +me[2] > +op[2];
    won ? w++ : l++;
    form.push({ id: g.id, won, me: me[2], op: op[2], opName: fix(op[1]), opSlug: op[0], home, d: g.d });
  }
  return { w, l, form: form.slice(-5).reverse(), recentIds: done.slice(-5).map(g => g.id) };
}
async function leaders(origin, slug, ids) {
  const boxes = await Promise.all(ids.map(id => safe(relay(origin, `game/${id}/boxscore?final=1`))));
  const P = {}; let gp = 0;
  for (const b of boxes) {
    const me = (b?.teams || []).find(t => t.seoname === slug); if (!me) continue;
    const tb = (b.teamBoxscore || []).find(x => String(x.teamId) === String(me.teamId)); if (!tb) continue;
    gp++;
    for (const x of tb.playerStats || []) {
      const name = fix(`${x.firstName || ""} ${x.lastName || ""}`).replace(/\s+/g, " ").trim(); if (!name) continue;
      const p = P[name] ||= { name, pos: x.position || "", gp: 0, pts: 0, reb: 0, ast: 0 };
      p.gp++; p.pts += +x.points || 0; p.reb += +x.totalRebounds || 0; p.ast += +x.assists || 0;
    }
  }
  return { gp, list: Object.values(P).filter(p => p.gp >= Math.max(1, Math.ceil(gp / 2))).sort((a, b) => b.pts / b.gp - a.pts / a.gp).slice(0, 3) };
}
function tipText(row, sbg) {
  const t = +row?.t || +sbg?.startTimeEpoch || 0;
  if (!t) return { date: row?.d ? new Date(row.d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : "", time: "TBA" };
  const dt = new Date(t * 1000), z = "America/New_York";
  return { date: dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: z }), time: dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: z }) + " ET", iso: dt.toISOString() };
}
async function previewPage(origin, id, row, sbg, c, url, live) {
  const rows = await seasonRows();
  const teams = c?.teams || [];
  const mk = (sd, rowT, sbT) => { const t = teams.find(x => !!x.isHome === (sd === "home")) || {}; return {
    slug: t.seoname || rowT?.[0] || sbT?.names?.seo || "", name: fix(t.nameShort || rowT?.[1] || sbT?.names?.short || "TBA"),
    rank: +(sbT?.rank || rowT?.[3] || 0) || 0, score: sbT?.score ?? rowT?.[2] ?? "" } };
  const A = mk("away", row?.a, sbg?.away), H = mk("home", row?.h, sbg?.home);
  const tip = tipText(row, sbg), beforeT = +row?.t || 0;
  const sA = teamSeason(rows, A.slug, beforeT), sH = teamSeason(rows, H.slug, beforeT);
  const [lA, lH, picks] = await Promise.all([leaders(origin, A.slug, sA.recentIds), leaders(origin, H.slug, sH.recentIds), safe(pickSplit(id))]);
  const h2h = Object.values(rows).filter(g => g.s === "final" && g.id !== id && [g.a[0], g.h[0]].includes(A.slug) && [g.a[0], g.h[0]].includes(H.slug));
  const rn = t => (t.rank ? `No. ${t.rank} ` : "") + t.name;
  const venue = c?.location?.venue ? fix(c.location.venue) : "", city = [c?.location?.city, c?.location?.stateUsps].filter(Boolean).map(fix).join(", ");
  const net = sbg?.network || row?.n || "";
  const rec = s => `${s.w}-${s.l}`;
  const title = `${rn(A)} vs. ${rn(H)} Preview: Tip Time, TV & Key Players`;
  const tm = (t, s, right) => `<a class="t${right ? " r" : ""}" href="/team/${esc(t.slug)}"><img src="${logo(t.slug)}" alt="" width="52" height="52" onerror="this.style.visibility='hidden'"><span><b>${t.rank ? `<em>${t.rank}</em>` : ""}${esc(t.name)}</b><small>${rec(s)}</small></span></a>`;
  const formHTML = (t, s) => `<div class="pv"><h3><img src="${logo(t.slug)}" alt="" width="22" height="22" onerror="this.remove()"><a href="/team/${esc(t.slug)}">${esc(t.name)}</a> <small>${rec(s)}</small></h3>${s.form.length ? `<ul class="form">${s.form.map(f => `<li><a href="/game/${esc(f.id)}"><span class="${f.won ? "w" : "l"}">${f.won ? "W" : "L"}</span> ${esc(f.me)}–${esc(f.op)} ${f.home ? "vs" : "at"} ${esc(f.opName)}</a></li>`).join("")}</ul>` : `<p class="muted">First game of the season.</p>`}</div>`;
  const leadHTML = (t, L) => `<div class="pv"><h3>${esc(t.name)}</h3>${L.list.length ? `<ul class="lead">${L.list.map(p => `<li><b>${esc(p.name)}</b> <small>${esc(p.pos)}</small><span>${(p.pts / p.gp).toFixed(1)} pts · ${(p.reb / p.gp).toFixed(1)} reb · ${(p.ast / p.gp).toFixed(1)} ast</span></li>`).join("")}</ul><p class="muted">Averages over their last ${L.gp} game${L.gp === 1 ? "" : "s"}.</p>` : `<p class="muted">No stats yet this season.</p>`}</div>`;
  const tot = picks ? picks.home + picks.away : 0;
  const pickHTML = tot >= 3 ? `<h2>Fan picks</h2><div class="picks"><div class="pl"><span>${esc(A.name)} <b>${Math.round(picks.away / tot * 100)}%</b></span><span><b>${Math.round(picks.home / tot * 100)}%</b> ${esc(H.name)}</span></div><div class="bar"><span style="width:${Math.round(picks.away / tot * 100)}%"></span><span style="width:${Math.round(picks.home / tot * 100)}%"></span></div><p class="muted">${tot} fans have picked this game in Pick'em. <a href="/#game-${esc(id)}">Make your pick →</a></p></div>` : `<h2>Fan picks</h2><p class="muted">Nobody has picked this one yet. <a href="/#game-${esc(id)}">Be the first in Pick'em →</a></p>`;
  const story = [];
  story.push(`${rn(A)} (${rec(sA)}) takes on ${rn(H)} (${rec(sH)})${tip.date ? ` on ${tip.date}` : ""}${tip.time !== "TBA" ? ` at ${tip.time}` : ""}${venue ? ` at ${venue}${city ? ` in ${city}` : ""}` : ""}.${net ? ` The game is on ${net}.` : ""}`);
  if (A.rank && H.rank) story.push(`It's a matchup of two ranked teams: No. ${A.rank} ${A.name} and No. ${H.rank} ${H.name}.`);
  const hot = (t, s) => { const f = s.form; let k = 0; while (k < f.length && f[k].won === f[0]?.won) k++; return f.length && k >= 3 ? `${t.name} has ${f[0].won ? "won" : "lost"} ${k} straight.` : "" };
  const streaks = [hot(A, sA), hot(H, sH)].filter(Boolean); if (streaks.length) story.push(streaks.join(" "));
  const top = (t, L) => L.list[0] ? `${L.list[0].name} leads ${t.name} at ${(L.list[0].pts / L.list[0].gp).toFixed(1)} points per game` : "";
  const tops = [top(A, lA), top(H, lH)].filter(Boolean); if (tops.length) story.push(tops.join("; ") + ".");
  if (h2h.length) story.push(`They already met this season: ${h2h.map(g => `${fix(+g.a[2] > +g.h[2] ? g.a[1] : g.h[1])} won ${Math.max(+g.a[2], +g.h[2])}–${Math.min(+g.a[2], +g.h[2])}`).join("; ")}.`);
  const liveBar = live ? `<div class="livebar"><span><i></i>Live now</span><b>${esc(A.name)} ${esc(A.score)} – ${esc(H.score)} ${esc(H.name)}</b><a class="btn p" href="/#game-${esc(id)}">Follow live →</a></div>` : "";
  const body = `<p class="eyebrow">Preview${tip.date ? ` · ${esc(tip.date)}` : ""}</p><h1>${esc(rn(A))} vs. ${esc(rn(H))}</h1>
<p class="dek">${esc(tip.time)}${net ? ` · ${esc(net)}` : ""}${venue ? ` · ${esc(venue)}` : ""}</p>${liveBar}
<div class="sb">${tm(A, sA)}<div class="s">VS<small>${esc(tip.time)}</small></div>${tm(H, sH, 1)}</div>
<article class="story">${story.map(p => `<p>${esc(p)}</p>`).join("")}</article>
<h2>How to follow</h2><ul class="facts"><li><span>Tip-off</span><b>${esc(tip.date)}${tip.time !== "TBA" ? `, ${esc(tip.time)}` : ""}</b></li><li><span>TV</span><b>${esc(net || "TBA")}</b></li>${venue ? `<li><span>Arena</span><b>${esc(venue)}${city ? `, ${esc(city)}` : ""}</b></li>` : ""}<li><span>Live</span><b><a href="/#game-${esc(id)}">Play-by-play, win odds &amp; fan chat</a></b></li></ul>
${pickHTML}
<h2>Key players</h2><div class="two">${leadHTML(A, lA)}${leadHTML(H, lH)}</div>
<h2>Recent results</h2><div class="two">${formHTML(A, sA)}${formHTML(H, sH)}</div>
<div class="cta"><div><b>Watch it with us</b><p>Live play-by-play, win odds and fan chat for this game, right when it tips.</p></div><div class="btns"><a class="btn p" href="/#game-${esc(id)}">Open the game</a><a class="btn" href="/cal/${esc(A.slug)}.ics">📅 ${esc(A.name)} schedule</a><a class="btn" href="/cal/${esc(H.slug)}.ics">📅 ${esc(H.name)} schedule</a></div></div>
<p class="note">This preview updates automatically and turns into the full recap once the game is final. Not affiliated with the NCAA or any school.</p>`;
  const desc = `${rn(A)} (${rec(sA)}) vs. ${rn(H)} (${rec(sH)})${tip.date ? `, ${tip.date}` : ""}${tip.time !== "TBA" ? ` at ${tip.time}` : ""}${net ? ` on ${net}` : ""}. Preview with key players, recent form and fan picks.`;
  const ld = { "@context": "https://schema.org", "@type": "SportsEvent", name: `${A.name} vs. ${H.name}`, sport: "Basketball", startDate: tip.iso, eventStatus: "https://schema.org/EventScheduled", url,
    location: venue ? { "@type": "Place", name: venue, address: city || undefined } : undefined,
    homeTeam: { "@type": "SportsTeam", name: H.name, url: `${SITE}/team/${H.slug}` }, awayTeam: { "@type": "SportsTeam", name: A.name, url: `${SITE}/team/${A.slug}` } };
  return page({ title: `${title} | College Basketball`, desc, url, body, ld });
}

export default async function handler(req, res) {
  const id = String(req.query.id || "");
  const origin = `https://${req.headers?.host || "collegebasketball.news"}`;
  const send = (status, html, cache) => { res.statusCode = status; res.setHeader("Content-Type", "text/html; charset=utf-8"); res.setHeader("Cache-Control", cache); res.end(html) };
  if (!/^\d{4,12}$/.test(id)) return send(404, waitHTML("", "Game not found", SITE), "public, s-maxage=3600");
  const rows = await seasonRows().catch(() => ({}));
  const row = rows[id] || null;
  const url = `${SITE}/game/${id}${row ? "/" + recapSlug(row) : ""}`;
  // where does the game stand? the season file, that day's scoreboard, or the game itself
  let sbg = null;
  if (row?.d) {
    const [y, m, d] = row.d.split("-");
    const sb = await safe(relay(origin, `scoreboard/basketball-men/d1/${y}/${m}/${d}/all-conf`));
    sbg = (sb?.games || []).map(x => x.game).find(g => String(g.gameID) === id) || null;
  }
  const info = await safe(relay(origin, `game/${id}?info=1`));
  const c = info?.contests?.[0] || null;
  if (!c && !row) return send(404, waitHTML(id, "Game not found", url), "public, s-maxage=600");
  const state = sbg?.gameState || (row?.s === "final" ? "final" : "") || (/^F$|final/i.test(String(c?.gameState || "")) ? "final" : /^I$|live/i.test(String(c?.gameState || "")) ? "live" : row?.s || "pre");
  try {
    if (state !== "final") {
      const html = await previewPage(origin, id, row, sbg, c, url, state === "live");
      return send(200, html, `public, s-maxage=${state === "live" ? 60 : 900}, stale-while-revalidate=600`);
    }
  } catch (e) { return send(200, waitHTML(id, state === "live" ? "This game is still going" : "This game hasn't tipped off yet", url), "public, s-maxage=60") }
  // final: only now ask for the final box score (it's kept for a day once fetched)
  const [box, pbp] = await Promise.all([safe(relay(origin, `game/${id}/boxscore?final=1`)), safe(relay(origin, `game/${id}/play-by-play`))]);
  if (!box?.teamBoxscore?.length) return send(200, waitHTML(id, "The recap is on its way", url), "public, s-maxage=120");
  const r = build(id, row, sbg, c, box, pbp);
  send(200, recapHTML(r, url), "public, s-maxage=86400, stale-while-revalidate=604800");
}
