// College Basketball — live site
// Data: the free ncaa-api (https://github.com/henrygd/ncaa-api), reached through /api/ncaa (see api/ncaa.js).
(() => {
"use strict";

// ---------- setup ----------
const API = window.API_BASE !== undefined ? window.API_BASE : "/api/ncaa?path=";
const REFRESH_MS = 20000;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fix = s => { s = String(s ?? ""); try { return /Ã|Â/.test(s) ? decodeURIComponent(escape(s)) : s } catch { return s } };
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

async function api(path) {
  const url = API === "" ? "/" + path : API + encodeURIComponent(path);
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

const CONF = {
  "acc": "ACC", "big-ten": "Big Ten", "big-12": "Big 12", "sec": "SEC", "big-east": "Big East", "pac-12": "Pac-12",
  "american": "American", "atlantic-10": "A-10", "mountain-west": "Mountain West", "wcc": "WCC", "mvc": "MVC",
  "big-west": "Big West", "cusa": "C-USA", "mac": "MAC", "sun-belt": "Sun Belt", "horizon": "Horizon", "caa": "CAA",
  "asun": "ASUN", "big-sky": "Big Sky", "big-south": "Big South", "ivy-league": "Ivy League", "meac": "MEAC",
  "metro": "MAAC", "nec": "NEC", "ovc": "OVC", "patriot": "Patriot", "socon": "SoCon", "southland": "Southland",
  "summit-league": "Summit", "swac": "SWAC", "wac": "WAC", "america-east": "America East", "uac": "UAC"
};
const P6 = ["acc", "big-ten", "big-12", "sec", "big-east", "pac-12"];
const confOf = t => (t.conferences?.[0]?.conferenceSeo || "").replace(/-$/, "");

// team monogram: initials on a color derived from the school name
const PALETTE = ["#1E3A5F", "#9E1B32", "#0B5D3B", "#5B2A86", "#B5531B", "#0A4D8C", "#7A1F33", "#2F4F4F", "#8A6D1D", "#004F71", "#6B2C1A", "#24427A"];
function teamColor(seo, override) {
  if (override) return override;
  let h = 0; for (const c of seo || "x") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
const initials = name => fix(name).replace(/[^A-Za-z& ]/g, " ").split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 3).toUpperCase() || "?";
const mono = (name, seo, color, cls = "") => `<span class="mono ${cls}" style="background:${teamColor(seo, color)}" aria-hidden="true">${esc(initials(name))}</span>`;

// ---------- dates (NCAA dates are Eastern time) ----------
function etDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(d).map(x => [x.type, x.value]));
  return { path: `${p.year}/${p.month}/${p.day}`, label: `${p.weekday}, ${new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}` };
}
const DAYS = [{ k: "y", label: "Yesterday", off: -1 }, { k: "t", label: "Today", off: 0 }, { k: "m", label: "Tomorrow", off: 1 }];

// ---------- state ----------
let gday = "t", gfilt = "All", gconf = "", query = "", openGame = null, boxSide = "away";
const cache = {};          // day key -> games[]
let lastScores = {};       // gameID -> "a-h" for flash
let gameDetail = null;     // {id, game, box, pbp}

// ---------- scoreboard ----------
async function loadDay(k) {
  const day = DAYS.find(d => d.k === k);
  const data = await api(`scoreboard/basketball-men/d1/${etDate(day.off).path}/all-conf`);
  cache[k] = (data.games || []).map(x => x.game);
  return cache[k];
}
function status(g) {
  if (g.gameState === "final") { const ot = /OT/i.exec(g.finalMessage || ""); const m = /(\d)\s*OT/i.exec(g.finalMessage || ""); return { cls: "", txt: ot ? `Final/${m ? m[1] : ""}OT` : "Final" } }
  if (g.gameState === "live") {
    const per = String(g.currentPeriod || "");
    if (/half/i.test(per) && !/\d/.test(per) || /halftime/i.test(g.finalMessage || "")) return { cls: "live", txt: "Halftime" };
    return { cls: "live", txt: `${per}${g.contestClock && g.contestClock !== "0:00" ? " · " + g.contestClock.replace(/^0(\d:)/, "$1") : ""}` };
  }
  if (/postponed|canceled|cancelled/i.test(g.finalMessage || "")) return { cls: "", txt: g.finalMessage };
  const ep = +g.startTimeEpoch;
  if (ep) return { cls: "", txt: new Date(ep * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) };
  return { cls: "", txt: g.startTime || "TBA" };
}
const isLive = g => g.gameState === "live";
const rankOf = t => t.rank ? +t.rank : 0;

function filtered(list) {
  const q = query.trim().toLowerCase();
  return list
    .filter(g => gfilt === "All" || (gfilt === "AP Top 25" && (rankOf(g.home) || rankOf(g.away))) || (gfilt === "Power 6" && (P6.includes(confOf(g.home)) || P6.includes(confOf(g.away)))))
    .filter(g => !gconf || confOf(g.home) === gconf || confOf(g.away) === gconf)
    .filter(g => !q || (fix(g.home.names.short) + " " + fix(g.away.names.short)).toLowerCase().includes(q))
    .sort((x, y) => ({ live: 0, pre: 1, final: 2 }[x.gameState] - { live: 0, pre: 1, final: 2 }[y.gameState]) || (+x.startTimeEpoch - +y.startTimeEpoch) || ((rankOf(y.home) || rankOf(y.away) ? 1 : 0) - (rankOf(x.home) || rankOf(x.away) ? 1 : 0)));
}
function trow(g, side) {
  const t = g[side], other = g[side === "home" ? "away" : "home"];
  const lose = g.gameState === "final" && +t.score < +other.score;
  return `<div class="trow ${lose ? "lose" : ""}">${mono(t.names.short, t.names.seo)}<span class="nm">${t.rank ? `<sup>${t.rank}</sup>` : ""}${esc(fix(t.names.short))}</span><span class="sc" data-sc="${g.gameID}-${side}">${g.gameState === "pre" ? "" : esc(t.score)}</span></div>`;
}
function drawDays() {
  $("#days").innerHTML = DAYS.map(d => `<button aria-pressed="${d.k === gday}" data-day="${d.k}">${d.label}<small>${etDate(d.off).label}</small></button>`).join("");
}
function drawFilters() {
  const list = cache[gday] || [];
  const present = new Set(list.flatMap(g => [confOf(g.home), confOf(g.away)]).filter(c => CONF[c]));
  const confs = Object.keys(CONF).filter(c => present.has(c) || c === gconf).sort((a, b) => (P6.includes(b) - P6.includes(a)) || (P6.includes(a) ? P6.indexOf(a) - P6.indexOf(b) : CONF[a].localeCompare(CONF[b])));
  $("#gfilters").innerHTML = ["All", "AP Top 25", "Power 6"].map(o => `<button aria-pressed="${o === gfilt && !gconf}" data-gf="${o}">${o === "All" ? "All games" : o}</button>`).join("")
    + `<span class="sep" aria-hidden="true"></span>` + confs.map(c => `<button aria-pressed="${c === gconf}" data-conf-f="${c}">${CONF[c]}</button>`).join("");
}
function drawGames() {
  const all = cache[gday];
  if (!all) { $("#games").innerHTML = `<div class="empty">Loading games…</div>`; return }
  const live = (cache.t || []).filter(isLive).length;
  $("#livecount").innerHTML = live ? `<span class="dot"></span>${live} game${live === 1 ? "" : "s"} live now` : `No games live right now`;
  const list = filtered(all);
  $("#games").innerHTML = list.length ? list.map(g => {
    const st = status(g);
    return `<button class="game ${openGame === g.gameID ? "sel" : ""}" data-game="${g.gameID}"><div class="gstat ${st.cls}"><span class="l">${st.cls ? '<span class="dot"></span>' : ""}${esc(st.txt)}</span><span>${esc(g.network || "")}</span></div>${trow(g, "away")}${trow(g, "home")}</button>`;
  }).join("") : `<div class="empty">${all.length ? "No games match this filter." : "No Division I games scheduled for this day."}</div>`;
}
function flashChanges(list) {
  const changed = new Set();
  for (const g of list) {
    const key = g.away.score + "-" + g.home.score;
    if (lastScores[g.gameID] && lastScores[g.gameID] !== key) changed.add(g.gameID);
    lastScores[g.gameID] = key;
  }
  return changed;
}

// ---------- Top 25 ticker ----------
function tickerItems() {
  return (cache.t || []).filter(g => rankOf(g.home) || rankOf(g.away))
    .sort((a, b) => Math.min(rankOf(a.home) || 99, rankOf(a.away) || 99) - Math.min(rankOf(b.home) || 99, rankOf(b.away) || 99))
    .map(g => {
      const st = status(g), side = t => `${t.rank ? `<b>${t.rank}</b>` : ""}${esc(fix(t.names.short))}`;
      return { key: g.gameID, html: `${side(g.away)} ${g.gameState === "pre" ? "at" : `<span class="tsc">${esc(g.away.score)}–${esc(g.home.score)}</span>`} ${side(g.home)} <span class="tst ${st.cls ? "lv" : ""}">${esc(st.txt)}</span>` };
    });
}
let tickerSig = "";
function drawTicker(changed) {
  const items = tickerItems(), track = $("#ticker");
  const sig = items.map(i => i.key).join(",");
  if (!items.length) { track.innerHTML = `<span class="ti">No ranked teams playing today</span>`; tickerSig = ""; return }
  if (sig !== tickerSig) {
    const reps = Math.max(2, Math.ceil(12 / items.length));
    track.innerHTML = Array.from({ length: reps }, () => items).flat().map(i => `<button class="ti" data-tk="${i.key}" data-game="${i.key}" data-day-of="t">${i.html}</button>`).join("");
    track.style.animationDuration = Math.max(30, items.length * reps * 4) + "s";
    tickerSig = sig; return;
  }
  items.forEach(i => track.querySelectorAll(`[data-tk="${i.key}"]`).forEach(el => {
    if (el.innerHTML !== i.html) {
      el.innerHTML = i.html;
      if (changed.has(i.key)) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash") }
    }
  }));
}

// ---------- game page ----------
async function loadGame(id) {
  const [game, box, pbp] = await Promise.all([
    api(`game/${id}`).catch(() => null),
    api(`game/${id}/boxscore`).catch(() => null),
    api(`game/${id}/play-by-play`).catch(() => null)
  ]);
  if (openGame !== id) return;
  gameDetail = { id, game: game?.contests?.[0] || null, box, pbp };
  drawGame();
}
function statRow(lbl, a, h, fmt = x => x) {
  const tot = (a + h) || 1;
  return `<div class="stbar"><b class="num">${fmt(a)}</b><span class="bar l"><i style="width:${a / tot * 100}%;background:var(--ink)"></i></span><span>${lbl}</span><span class="bar"><i style="width:${h / tot * 100}%;background:var(--ball)"></i></span><b class="num" style="text-align:right">${fmt(h)}</b></div>`;
}
const pct = (m, a) => a ? Math.round(m / a * 100) : 0;
function drawGame() {
  const boxEl = $("#gdetail");
  const sg = (cache[gday] || []).concat(cache.t || []).find(g => g.gameID === openGame);
  if (!openGame || !sg) { boxEl.hidden = true; return }
  boxEl.hidden = false;
  const d = gameDetail && gameDetail.id === openGame ? gameDetail : null;
  const c = d?.game, teams = c?.teams || [];
  const tHome = teams.find(t => t.isHome) || {}, tAway = teams.find(t => !t.isHome) || {};
  const st = status(sg), pre = sg.gameState === "pre";
  const side = (s, t, r) => `<div class="side ${r ? "r" : ""}">${mono(s.names.short, s.names.seo, t.color, "lg")}<div><strong>${s.rank ? `<span style="color:var(--ball)">#${s.rank}</span> ` : ""}${esc(fix(s.names.short))}</strong><small>${esc(fix(t.record || ""))}${CONF[confOf(s)] ? " · " + CONF[confOf(s)] : ""}</small></div></div>`;
  let html = `<div class="gh">${side(sg.away, tAway)}<div class="big">${pre ? "vs" : `${esc(sg.away.score)}–${esc(sg.home.score)}`}<small class="${st.cls}">${esc(st.txt)}${sg.network ? " · " + esc(sg.network) : ""}</small></div>${side(sg.home, tHome, 1)}</div>`;
  if (!d) { boxEl.innerHTML = html + `<div class="boxwrap"><p style="margin:0;color:var(--muted)">Loading game details…</p></div>`; return }

  const loc = c?.location ? `${fix(c.location.venue)}${c.location.city ? ", " + fix(c.location.city) : ""}${c.location.stateUsps ? ", " + c.location.stateUsps : ""}` : "";
  // linescore
  const ls = c?.linescores || [];
  const lsTable = ls.length ? `<h4>Scoring by period</h4><div class="tblwrap"><table style="margin-bottom:22px"><thead><tr><th>Team</th>${ls.map(l => `<th class="num">${+l.period <= 2 ? (l.period === "1" ? "1st" : "2nd") : "OT" + (+l.period > 3 ? +l.period - 2 : "")}</th>`).join("")}<th class="num">T</th></tr></thead><tbody>
      <tr><td>${esc(fix(sg.away.names.short))}</td>${ls.map(l => `<td class="num">${esc(l.visit)}</td>`).join("")}<td class="num"><b>${esc(sg.away.score)}</b></td></tr>
      <tr><td>${esc(fix(sg.home.names.short))}</td>${ls.map(l => `<td class="num">${esc(l.home)}</td>`).join("")}<td class="num"><b>${esc(sg.home.score)}</b></td></tr></tbody></table></div>` : "";
  // team stats
  const tb = d.box?.teamBoxscore || [], idHome = String(tHome.teamId || ""), idAway = String(tAway.teamId || "");
  const tbFor = id => tb.find(x => String(x.teamId) === id);
  const sh = tbFor(idHome)?.teamStats, sa = tbFor(idAway)?.teamStats, n = v => +v || 0;
  const tStats = sh && sa ? `<h4>Team stats <span style="float:right;text-transform:none;letter-spacing:0">${esc(fix(sg.away.names.short))} · ${esc(fix(sg.home.names.short))}</span></h4>
      ${statRow("FG%", pct(n(sa.fieldGoalsMade), n(sa.fieldGoalsAttempted)), pct(n(sh.fieldGoalsMade), n(sh.fieldGoalsAttempted)))}
      ${statRow("3PT%", pct(n(sa.threePointsMade), n(sa.threePointsAttempted)), pct(n(sh.threePointsMade), n(sh.threePointsAttempted)))}
      ${statRow("Reb", n(sa.totalRebounds), n(sh.totalRebounds))}${statRow("Ast", n(sa.assists), n(sh.assists))}${statRow("TO", n(sa.turnovers), n(sh.turnovers))}` : "";
  // play-by-play (newest first)
  const plays = (d.pbp?.periods || []).flatMap(p => (p.playbyplayStats || []).map(x => ({ ...x, per: p.periodDisplay || "" }))).reverse().slice(0, 25);
  const pbpHtml = plays.length ? `<div class="plays">${plays.map(p => {
    const home = String(p.teamId) === idHome, away = String(p.teamId) === idAway;
    const who = home ? sg.home.names.short : away ? sg.away.names.short : "";
    return `<div class="play"><span class="t">${esc((p.per || "").replace(" Half", "").replace(/^(\d)(st|nd)$/, "$1$2"))} ${esc(p.clock)}</span><span>${who ? `<b>${esc(fix(who))}</b> · ` : ""}${esc(fix(p.eventDescription || p.homeText || p.visitorText))}</span><b>${p.visitorScore}–${p.homeScore}</b></div>`;
  }).join("")}</div>` : `<p style="margin:0;color:var(--muted)">${pre ? "Play-by-play starts at tip-off." : "No play-by-play for this game."}</p>`;

  html += `<div class="dbody"><div>${pre ? `<h4>Matchup</h4><p style="margin:0 0 16px;color:var(--muted)">Tip-off at ${esc(st.txt)}${sg.network ? " on " + esc(sg.network) : ""}.${loc ? "<br>" + esc(loc) : ""}</p>` : lsTable + tStats + (loc ? `<p style="margin:16px 0 0;color:var(--muted);font-size:14px">${esc(loc)}</p>` : "")}</div>
    <div><h4>Play-by-play</h4>${pbpHtml}<div style="margin-top:18px"><button class="closebtn" data-closegame>Close</button></div></div></div>`;

  // box score
  const players = id => tbFor(id)?.playerStats || [];
  const bsId = boxSide === "home" ? idHome : idAway;
  const ps = players(bsId);
  if (ps.length) {
    const line = p => `<td class="num">${esc(p.minutesPlayed ?? "")}</td><td class="num"><b>${esc(p.points)}</b></td><td class="num">${esc(p.totalRebounds)}</td><td class="num">${esc(p.assists)}</td><td class="num">${esc(p.fieldGoalsMade)}-${esc(p.fieldGoalsAttempted)}</td><td class="num">${esc(p.threePointsMade)}-${esc(p.threePointsAttempted)}</td><td class="num">${esc(p.freeThrowsMade)}-${esc(p.freeThrowsAttempted)}</td><td class="num">${esc(p.steals)}</td><td class="num">${esc(p.blockedShots)}</td><td class="num">${esc(p.turnovers)}</td>`;
    const row = p => `<tr><td><span class="pn">${esc(p.number)}</span> ${esc(fix(p.firstName + " " + p.lastName))} <span class="pp">${esc(p.position || "")}</span></td>${line(p)}</tr>`;
    const ts = tbFor(bsId)?.teamStats;
    html += `<div class="boxwrap"><div class="boxhead"><h4 style="margin:0">Box score</h4><div class="days" role="group" aria-label="Team">${["away", "home"].map(k => `<button data-box="${k}" aria-pressed="${k === boxSide}">${esc(fix(sg[k].names.short))}</button>`).join("")}</div></div>
      <div class="tblwrap"><table class="box"><thead><tr><th>Player</th><th class="num">Min</th><th class="num">Pts</th><th class="num">Reb</th><th class="num">Ast</th><th class="num">FG</th><th class="num">3PT</th><th class="num">FT</th><th class="num">Stl</th><th class="num">Blk</th><th class="num">TO</th></tr></thead><tbody>
      ${[["Starters", ps.filter(p => p.starter)], ["Bench", ps.filter(p => !p.starter)]].filter(x => x[1].length).map(([lbl, list]) => `<tr class="grp"><td colspan="11">${lbl}</td></tr>${list.map(row).join("")}`).join("")}
      ${ts ? `<tr class="totals"><td>Team totals</td><td class="num"></td><td class="num">${esc(ts.points)}</td><td class="num">${esc(ts.totalRebounds)}</td><td class="num">${esc(ts.assists)}</td><td class="num">${esc(ts.fieldGoalsMade)}-${esc(ts.fieldGoalsAttempted)}</td><td class="num">${esc(ts.threePointsMade)}-${esc(ts.threePointsAttempted)}</td><td class="num">${esc(ts.freeThrowsMade)}-${esc(ts.freeThrowsAttempted)}</td><td class="num">${esc(ts.steals)}</td><td class="num">${esc(ts.blockedShots)}</td><td class="num">${esc(ts.turnovers)}</td></tr>` : ""}
      </tbody></table></div></div>`;
  } else {
    html += `<div class="boxwrap"><h4 style="margin:0">Box score</h4><p style="margin:8px 0 0;color:var(--muted)">${pre ? "The box score goes live at tip-off." : "No box score for this game."}</p></div>`;
  }
  boxEl.innerHTML = html;
}

// ---------- refresh loop ----------
let errShown = false;
async function refresh() {
  try {
    const before = cache.t;
    await loadDay("t");
    if (gday !== "t") { /* keep ticker live while viewing other days */ }
    errShown = false; $("#apierr").hidden = true;
    const changed = before ? flashChanges(cache.t) : (flashChanges(cache.t), new Set());
    if (gday === "t") { drawFilters(); drawGames(); }
    drawTicker(changed);
    changed.forEach(id => ["away", "home"].forEach(s => { const el = document.querySelector(`[data-sc="${id}-${s}"]`); if (el) { el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 900) } }));
    if (openGame && gday === "t") { const g = cache.t.find(x => x.gameID === openGame); if (g && (isLive(g) || changed.has(openGame))) loadGame(openGame); else drawGame(); }
  } catch (e) {
    if (!errShown) { $("#apierr").hidden = false; errShown = true; }
    if (!cache.t) $("#games").innerHTML = `<div class="empty">Scores couldn't load. Retrying…</div>`;
  }
}

// ---------- rankings & standings ----------
async function loadRankings() {
  const el = $("#aprows");
  try {
    const r = await api("rankings/basketball-men/d1/associated-press");
    $("#rkupdated").textContent = r.updated || "";
    const rows = r.data || [];
    const extra = Object.keys(rows[0] || {}).filter(k => !["RANK", "SCHOOL", "POINTS"].includes(k));
    $("#rkhead").innerHTML = `<th class="num">Rk</th><th>Team</th>${extra.map(k => `<th class="num">${esc(k[0] + k.slice(1).toLowerCase())}</th>`).join("")}<th class="num">Pts</th>`;
    el.innerHTML = rows.map(x => {
      const m = /^(.*?)\s*\((\d+)\)\s*$/.exec(fix(x.SCHOOL)) || [0, fix(x.SCHOOL), ""];
      return `<tr><td class="num rkn">${esc(x.RANK)}</td><td><span class="tm">${mono(m[1], m[1])}<span>${esc(m[1])} ${m[2] ? `<small>(${m[2]})</small>` : ""}</span></span></td>${extra.map(k => `<td class="num">${esc(x[k])}</td>`).join("")}<td class="num">${esc(x.POINTS)}</td></tr>`;
    }).join("");
  } catch { el.innerHTML = `<tr><td colspan="4">Rankings couldn't load. Try again in a minute.</td></tr>` }
}
let standings = null, sconf = "";
async function loadStandings() {
  try {
    const r = await api("standings/basketball-men/d1");
    standings = r.data || []; $("#stupdated").textContent = r.updated ? "Updated " + r.updated : "";
    sconf = sconf || (standings.find(c => c.conference === "Big Ten") || standings[0] || {}).conference || "";
    drawStand();
  } catch { $("#strows").innerHTML = `<tr><td colspan="6">Standings couldn't load. Try again in a minute.</td></tr>` }
}
function drawStand() {
  if (!standings) return;
  const P6N = ["ACC", "Big Ten", "Big 12", "SEC", "Big East", "Pac-12"];
  const names = standings.map(c => c.conference).sort((a, b) => (P6N.includes(b) - P6N.includes(a)) || a.localeCompare(b));
  $("#sconfs").innerHTML = names.map(c => `<button aria-pressed="${c === sconf}" data-sconf="${esc(c)}">${esc(c)}</button>`).join("");
  const rows = (standings.find(c => c.conference === sconf) || {}).standings || [];
  $("#strows").innerHTML = rows.map((x, i) => {
    const stk = String(x["Overall STREAK"] || "").replace(/^Won /, "W").replace(/^Lost /, "L");
    return `<tr><td class="num">${i + 1}</td><td><span class="tm">${mono(x.School, x.School)}<span>${esc(fix(x.School))}</span></span></td><td class="num">${esc(x["Conference W"])}-${esc(x["Conference L"])}</td><td class="num">${esc(x["Overall W"])}-${esc(x["Overall L"])}</td><td class="num">${esc(String(x["Overall PCT"] || "").replace(/^0/, ""))}</td><td class="num ${stk[0] === "W" ? "in" : stk[0] === "L" ? "out" : ""}">${esc(stk)}</td></tr>`;
  }).join("");
}

// ---------- news (sample stories until real ones are added) ----------
const NEWS = window.NEWS || [];
const NCATS = ["All", "Top 25", "Games", "Transfer Portal", "Recruiting", "Conferences"]; let ncat = "All";
const art = n => `<div class="art" style="background:${teamColor(n.team)}" aria-hidden="true"><span style="position:relative;z-index:1">${esc(initials(n.team.replace(/-/g, " ")))}</span></div>`;
function drawNews() {
  $("#ncats").innerHTML = NCATS.map(c => `<button aria-pressed="${c === ncat}" data-ncat="${c}">${c}</button>`).join("");
  const list = NEWS.filter(n => ncat === "All" || n.cat === ncat); $("#story").hidden = true; $("#newslist").hidden = false;
  if (!list.length) { $("#newslist").innerHTML = `<div class="empty" style="margin-top:14px">No stories in this topic yet.</div>`; return }
  const [lead, ...rest] = list;
  $("#newslist").innerHTML = `<button class="lead" data-story="${lead.id}">${art(lead)}<div class="txt"><span class="ntag">${lead.cat}</span><h2>${esc(lead.t)}</h2><p class="ndek">${esc(lead.dek)}</p><span class="nmeta">${lead.time} · ${lead.read} read</span></div></button>
   <div class="ngrid">${rest.map(n => `<button class="ncard" data-story="${n.id}">${art(n)}<div class="txt"><span class="ntag">${n.cat}</span><h3>${esc(n.t)}</h3><p class="ndek">${esc(n.dek)}</p><span class="nmeta">${n.time} · ${n.read} read</span></div></button>`).join("")}</div>`;
}
function openStory(id) {
  const n = NEWS.find(x => x.id === id); if (!n) return; $("#newslist").hidden = true; const st = $("#story"); st.hidden = false;
  st.innerHTML = `<button class="closebtn" data-closestory>← All news</button><div style="margin-top:18px"><span class="ntag">${n.cat}</span><h2>${esc(n.t)}</h2><p class="nmeta" style="margin:0 0 20px">By @collegebasketball · ${n.time} · ${n.read} read</p><div class="body">${n.body.map(p => `<p>${esc(p)}</p>`).join("")}</div></div>`; scrollTo(0, 0);
}

// ---------- tabs ----------
const VIEWS = ["scores", "news", "rankings", "standings", "discord"];
const loaded = {};
function show(v) {
  if (!VIEWS.includes(v)) v = "scores";
  document.querySelectorAll(".view").forEach(el => el.hidden = el.dataset.view !== v);
  document.querySelectorAll("[data-tab]").forEach(a => a.dataset.tab === v ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  if (v === "rankings" && !loaded.rk) { loaded.rk = 1; loadRankings() }
  if (v === "standings" && !loaded.st) { loaded.st = 1; loadStandings() }
  scrollTo(0, 0);
}
const route = () => show((location.hash || "#scores").slice(1));
addEventListener("hashchange", route);

// ---------- events ----------
document.addEventListener("click", async e => {
  const t = e.target;
  const d = t.closest("[data-day]"); if (d) {
    gday = d.dataset.day; openGame = null; gameDetail = null; drawDays(); drawGame();
    if (!cache[gday] || gday !== "t") { $("#games").innerHTML = `<div class="empty">Loading games…</div>`; try { await loadDay(gday) } catch { $("#games").innerHTML = `<div class="empty">Games couldn't load. Try again.</div>`; return } }
    drawFilters(); drawGames(); return;
  }
  const f = t.closest("[data-gf]"); if (f) { gfilt = f.dataset.gf; gconf = ""; drawFilters(); drawGames(); return }
  const cf = t.closest("[data-conf-f]"); if (cf) { gconf = cf.dataset.confF; gfilt = "All"; drawFilters(); drawGames(); return }
  const bx = t.closest("[data-box]"); if (bx) { boxSide = bx.dataset.box; drawGame(); return }
  if (t.closest("[data-closegame]")) { openGame = null; gameDetail = null; drawGames(); drawGame(); return }
  const gm = t.closest("[data-game]"); if (gm) {
    if (location.hash && location.hash !== "#scores") { location.hash = "scores" }
    if (gm.dataset.dayOf === "t" && gday !== "t") { gday = "t"; drawDays(); drawFilters() }
    openGame = gm.dataset.game; boxSide = "away"; gameDetail = null; drawGames(); drawGame(); loadGame(openGame);
    $("#gdetail").scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" }); return;
  }
  const sc = t.closest("[data-sconf]"); if (sc) { sconf = sc.dataset.sconf; drawStand(); return }
  const nc = t.closest("[data-ncat]"); if (nc) { ncat = nc.dataset.ncat; drawNews(); return }
  const s = t.closest("[data-story]"); if (s) { openStory(s.dataset.story); return }
  if (t.closest("[data-closestory]")) drawNews();
});
$("#q").addEventListener("input", e => { query = e.target.value; drawGames() });

// ---------- start ----------
drawDays(); drawGames(); drawNews(); route();
refresh();
setInterval(() => { if (!document.hidden) refresh() }, REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh() });
})();
