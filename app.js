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

async function api(path, tries = 3) {
  const url = API === "" ? "/" + path : API + encodeURIComponent(path);
  for (let i = 0; ; i++) {
    const r = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (r && r.ok) return r.json();
    if (i >= tries - 1 || (r && r.status < 500 && r.status !== 428 && r.status !== 429)) throw new Error("HTTP " + (r ? r.status : "network"));
    await new Promise(res => setTimeout(res, 1200 * (i + 1)));
  }
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
// Team logos come from NCAA.com through the relay (cached for a week). If a logo is missing, the colored initials show instead.
const NAME2SEO = {}; // school name -> NCAA slug, learned from the scoreboards
function learnSlugs(list) { for (const g of list) for (const sd of ["home", "away"]) { const t = g[sd]; if (t?.names?.seo) NAME2SEO[normName(t.names.short)] = t.names.seo } }
function guessSlug(name) {
  return fix(name).toLowerCase().replace(/&/g, "").replace(/['’.]/g, "").replace(/\bstate\b/g, "st").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function logoSlug(name, seo) {
  if (seo && /^[a-z0-9-]+$/.test(seo)) return seo;
  return NAME2SEO[normName(name)] || guessSlug(name);
}
const logoURL = (slug, dark) => { const path = `logo/${slug}.svg${dark ? "?dark=true" : ""}`; return API === "" ? "/" + path : API + encodeURIComponent(path) };
const mono = (name, seo, color, cls = "") => {
  const slug = logoSlug(name, seo);
  const logo = slug ? `<img src="${logoURL(slug, true)}" alt="" loading="lazy" decoding="async" onerror="if(!this.dataset.r){this.dataset.r=1;var i=this;setTimeout(function(){i.src=i.src+'&r=1'},2500+Math.random()*3000)}else{var m=this.closest('.mono');m.classList.remove('has-logo');this.remove()}">` : "";
  return `<span class="mono ${cls} ${logo ? "has-logo" : ""}" style="--mc:${teamColor(seo, color)}" aria-hidden="true"><b>${esc(initials(name))}</b>${logo}</span>`;
};

// ---------- team colors ----------
// Each school's official color comes from NCAA game pages (fetched quietly in the background, then remembered).
const TCOL = {};
try { Object.assign(TCOL, JSON.parse(localStorage.getItem("cbb-colors2") || "{}")) } catch { }
function saveColors() { try { localStorage.setItem("cbb-colors2", JSON.stringify(TCOL)) } catch { } }
// very dark colors (navy, black) would vanish on the black page, so lift them a little
function visible(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "";
  let [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum < 0.22) { const k = (0.22 - lum) / 0.22 * 0.55; [r, g, b] = [r, g, b].map(v => Math.round(v + (255 - v) * k)) }
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}
function teamColorFor(slug) { return slug && TCOL[slug] ? TCOL[slug] : "" }
function setColor(slug, hex) {
  const c = visible(hex); if (!slug || !c || TCOL[slug] === c) return;
  TCOL[slug] = c;
  document.querySelectorAll(`[data-slug="${slug}"]`).forEach(el => el.style.setProperty("--tc", c));
}

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
const BEST = {};           // gameID -> freshest {home, away} score seen from any feed

// The scoreboard feed can lag the game feeds by a basket or two, so always show the highest score seen
// (scores never go down during a game).
function applyBest(g) {
  const b = BEST[g.gameID];
  if (!b || g.gameState === "pre") return;
  if ((+b.home || 0) > (+g.home.score || 0)) g.home.score = String(b.home);
  if ((+b.away || 0) > (+g.away.score || 0)) g.away.score = String(b.away);
}
function noteBest(id, home, away) {
  const b = BEST[id] || (BEST[id] = { home: 0, away: 0 });
  b.home = Math.max(b.home, +home || 0); b.away = Math.max(b.away, +away || 0);
}

// ---------- scoreboard ----------
async function loadDay(k) {
  const day = DAYS.find(d => d.k === k);
  const data = await api(`scoreboard/basketball-men/d1/${etDate(day.off).path}/all-conf`);
  cache[k] = (data.games || []).map(x => x.game);
  cache[k].forEach(applyBest);
  learnSlugs(cache[k]);
  if (recThrough) setTimeout(fillMissingRecords, 0);
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
const clockSecs = c => { const m = /^(\d+):(\d+)/.exec(String(c || "")); return m ? +m[1] * 60 + +m[2] : 9999 };
const rk = t => +(t.rank || apRank(t.names.short) || 0);
const BUZZ = {}; const buzzAsked = new Set();
function badges(g) {
  const out = [], a = +g.away.score || 0, h = +g.home.score || 0, margin = Math.abs(a - h);
  const per = String(g.currentPeriod || ""), fm = String(g.finalMessage || "");
  const ot = /OT/i.test(per) || /OT/i.test(fm);
  const ra = rk(g.away), rh = rk(g.home);
  const leader = a > h ? "away" : h > a ? "home" : "";
  const upset = leader && (() => { const lr = leader === "away" ? ra : rh, tr = leader === "away" ? rh : ra; return tr && (!lr || lr - tr >= 10) })();
  if (g.gameState === "live") {
    const late = (/2nd|OT/i.test(per)) && clockSecs(g.contestClock) <= 300;
    if (upset && (late || /2nd|OT/i.test(per))) out.push(["upset", "Upset Alert"]);
    if (late && margin <= 5) out.push(["close", "Close Game"]);
    if (ot) out.push(["ot", per.toUpperCase().includes("OT") ? per.toUpperCase() : "OT"]);
    if (/2nd/i.test(per) && margin >= 30) out.push(["blowout", "Blowout"]);
  } else if (g.gameState === "final") {
    if (upset) out.push(["upset", "Upset"]);
    if (BUZZ[g.gameID]) out.push(["buzzer", "Buzzer Beater"]);
    if (ot) out.push(["ot", (/(\d)\s*OT/i.exec(fm)?.[1] || "") + "OT"]);
    if (margin >= 30) out.push(["blowout", "Blowout"]);
    if (margin <= 3 && !buzzAsked.has(g.gameID)) checkBuzzer(g);
  }
  return out;
}
const badgeHTML = list => list.length ? `<div class="badges">${list.map(([c, t]) => `<span class="bdg ${c}">${esc(t)}</span>`).join("")}</div>` : "";
// A buzzer beater: the winning team's last basket came in the final 3 seconds and turned a tie or deficit into the win.
const buzzQueue = []; let buzzBusy = false;
function checkBuzzer(g) { buzzAsked.add(g.gameID); buzzQueue.push(g.gameID); pumpBuzz() }
async function pumpBuzz() {
  if (buzzBusy) return; buzzBusy = true;
  while (buzzQueue.length) {
    const id = buzzQueue.shift();
    try {
      const pbp = await api(`game/${id}/play-by-play`);
      const per = (pbp.periods || []).at(-1)?.playbyplayStats || [];
      for (let i = per.length - 1; i >= 0; i--) {
        const p = per[i], prev = per.slice(0, i).reverse().find(x => x.homeScore !== p.homeScore || x.visitorScore !== p.visitorScore) || { homeScore: 0, visitorScore: 0 };
        if (p.homeScore === prev.homeScore && p.visitorScore === prev.visitorScore) continue;
        const homeScored = p.homeScore > prev.homeScore, final = per.at(-1);
        const homeWon = final.homeScore > final.visitorScore;
        const wasntWinning = homeWon ? prev.homeScore <= prev.visitorScore : prev.visitorScore <= prev.homeScore;
        if (homeScored === homeWon && clockSecs(p.clock) <= 3 && wasntWinning) BUZZ[id] = true;
        break;
      }
    } catch { }
    await new Promise(r => setTimeout(r, 300));
  }
  buzzBusy = false; drawGames(); drawHero();
}
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
  const slug = logoSlug(t.names.short, t.names.seo), tc = teamColorFor(slug);
  return `<div class="trow ${lose ? "lose" : ""}" data-slug="${esc(slug)}"${tc ? ` style="--tc:${tc}"` : ""}>${mono(t.names.short, t.names.seo)}<span class="nm">${rankBadge(t.rank || apRank(t.names.short))}${esc(fix(t.names.short))}${recTag(recordOf(t.names.short, g, side))}</span><span class="sc" data-sc="${g.gameID}-${side}">${g.gameState === "pre" ? "" : esc(t.score)}</span></div>`;
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
// The game panel opens inside the grid, directly under the row of the game that was tapped.
const DETAIL = document.getElementById("gdetail");
// The panel has three parts: the score header, the live chat (kept between refreshes), and the stats below.
DETAIL.innerHTML = `<div class="ghead"></div><div class="chatmount"></div><div class="gmain"></div>`;
const GHEAD = DETAIL.querySelector(".ghead"), GMAIN = DETAIL.querySelector(".gmain"), CHATMOUNT = DETAIL.querySelector(".chatmount");
function placeDetail() {
  const grid = $("#games");
  if (!openGame) { if (DETAIL.parentNode !== grid.parentNode) grid.after(DETAIL); return }
  const card = grid.querySelector(`.game[data-game="${openGame}"]`);
  if (!card) { grid.prepend(DETAIL); return }
  // find the last card on the same row as the tapped one
  let last = card, top = card.offsetTop;
  for (let n = card.nextElementSibling; n; n = n.nextElementSibling) {
    if (!n.classList.contains("game")) continue;
    if (Math.abs(n.offsetTop - top) > 4) break;
    last = n;
  }
  if (last.nextElementSibling !== DETAIL) last.after(DETAIL);
}
// Redraw the game cards without ever moving the open game panel: moving it would reset its scrolling,
// the chat, and whatever someone is typing.
function setCards(htmlList) {
  const grid = $("#games");
  for (const el of [...grid.children]) if (el !== DETAIL) el.remove();
  const tpl = document.createElement("template"); tpl.innerHTML = htmlList.join("");
  const cards = [...tpl.content.children];
  const k = openGame ? cards.findIndex(c => c.dataset && c.dataset.game === openGame) : -1;
  if (DETAIL.parentNode === grid && k >= 0) {
    const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length);
    const before = Math.min(cards.length, Math.ceil((k + 1) / cols) * cols);
    cards.slice(0, before).forEach(c => grid.insertBefore(c, DETAIL));
    cards.slice(before).forEach(c => grid.appendChild(c));
  } else {
    cards.forEach(c => grid.appendChild(c));
    placeDetail();
  }
}
function drawGames() {
  const all = cache[gday];
  if (!all) { setCards([`<div class="empty">Loading games…</div>`]); return }
  const live = (cache.t || []).filter(isLive).length;
  $("#livecount").innerHTML = live ? `<span class="dot"></span>${live} game${live === 1 ? "" : "s"} live now` : `No games live right now`;
  const list = filtered(all);
  setCards(list.length ? list.map(g => {
    const st = status(g);
    return `<button class="game ${openGame === g.gameID ? "sel" : ""}" data-game="${g.gameID}"><div class="gstat ${st.cls}"><span class="l">${st.cls ? '<span class="dot"></span>' : ""}${esc(st.txt)}</span><span>${esc(g.network || "")}</span></div>${trow(g, "away")}${trow(g, "home")}${badgeHTML(badges(g))}</button>`;
  }) : [`<div class="empty">${all.length ? "No games match this filter." : "No Division I games scheduled for this day."}</div>`]);
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

// ---------- Game of the Night ----------
// Picks today's headline game: ranked matchups first, live and close games get a boost, finished games last.
function heroScore(g) {
  let s = 0; for (const t of [g.home, g.away]) { const r = rk(t); if (r) s += 30 - r }
  if (rk(g.home) && rk(g.away)) s += 25;
  if (g.gameState === "live") { s += 12; const m = Math.abs((+g.home.score || 0) - (+g.away.score || 0)); if (m <= 5) s += 10 }
  if (g.gameState === "pre") s += 4;
  if (g.gameState === "final") s -= 15;
  if (g.network) s += 3;
  return s;
}
let heroId = null;
function drawHero() {
  const el = $("#gotn"); const list = cache.t || [];
  if (!list.length) { el.hidden = true; return }
  const live = list.find(g => g.gameID === heroId);
  // keep the same game all night unless it ends and a better one is on
  let g = live && live.gameState !== "final" ? live : [...list].sort((a, b) => heroScore(b) - heroScore(a))[0];
  heroId = g.gameID;
  const st = status(g), pre = g.gameState === "pre", a = +g.away.score || 0, h = +g.home.score || 0;
  const side = (t, sd, r) => { const slug = logoSlug(t.names.short, t.names.seo); return `<div class="tm2 ${r ? "r" : ""}">${mono(t.names.short, t.names.seo, null, "")}<div><div class="tn">${rankBadge(rk(t))}${esc(fix(t.names.short))}</div><div class="tr">${esc([recordOf(t.names.short, g, sd), CONF[confOf(t)]].filter(Boolean).join(" · "))}</div></div></div>` };
  const sa = logoSlug(g.away.names.short, g.away.names.seo), sh = logoSlug(g.home.names.short, g.home.names.seo);
  el.style.setProperty("--ca", teamColorFor(sa) || "#333"); el.style.setProperty("--ch", teamColorFor(sh) || "#333");
  const fin = g.gameState === "final";
  el.dataset.game = g.gameID; el.dataset.dayOf = "t";
  el.setAttribute("aria-label", `Game of the Night: ${fix(g.away.names.short)} at ${fix(g.home.names.short)}. Open game.`);
  el.innerHTML = `<div class="gt"><div class="lbl">Game of the <span>Night</span></div>${badgeHTML(badges(g))}</div>
    <div class="gm">${side(g.away, "away")}<div class="mid"><div class="big2">${pre ? "VS" : `<span class="${fin && a < h ? "l" : "w"}">${a}</span>–<span class="${fin && h < a ? "l" : "w"}">${h}</span>`}</div><div class="st2 ${st.cls}">${esc(st.txt)}${g.network ? " · " + esc(g.network) : ""}</div></div>${side(g.home, "home", 1)}</div>`;
  el.hidden = false;
}

// ---------- Instagram ----------
function drawInstagram() {
  const box = $("#igposts"), posts = (window.IG_POSTS || []).filter(u => /instagram\.com\/(p|reel)\//.test(u)).slice(0, 6);
  if (!posts.length) {
    box.innerHTML = `<div class="ig-empty"><div><strong>Highlights, takes and game-day coverage</strong><p>Follow along on Instagram for the moments that matter every night of the season.</p></div><a class="follow" href="https://www.instagram.com/collegebasketball/" target="_blank" rel="noopener">Follow @collegebasketball</a></div>`;
    return;
  }
  box.innerHTML = `<div class="ig-grid">${posts.map(u => `<blockquote class="instagram-media" data-instgrm-permalink="${esc(u.split("?")[0])}" data-instgrm-version="14"><a href="${esc(u)}" target="_blank" rel="noopener">View this post on Instagram</a></blockquote>`).join("")}</div>`;
  if (window.instgrm) window.instgrm.Embeds.process();
  else { const sc = document.createElement("script"); sc.async = true; sc.src = "https://www.instagram.com/embed.js"; document.body.appendChild(sc) }
}

// ---------- Top 25 ticker ----------
function tickerItems() {
  return (cache.t || []).filter(g => rk(g.home) || rk(g.away))
    .sort((a, b) => Math.min(rk(a.home) || 99, rk(a.away) || 99) - Math.min(rk(b.home) || 99, rk(b.away) || 99))
    .map(g => {
      const st = status(g), side = t => `<span class="tt"><img class="tlogo" src="${logoURL(logoSlug(t.names.short, t.names.seo), true)}" alt="" onerror="this.remove()">${rk(t) ? `<b>${rk(t)}</b>` : ""}${esc(fix(t.names.short))}</span>`;
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
  // Games that haven't started have no box score or play-by-play yet, so don't wait on them.
  const sg = Object.values(cache).flat().find(g => g.gameID === id);
  const started = !sg || sg.gameState !== "pre";
  const [game, box, pbp] = await Promise.all([
    api(`game/${id}`).catch(() => null),
    started ? api(`game/${id}/boxscore`, 1).catch(() => null) : null,
    started ? api(`game/${id}/play-by-play`, 1).catch(() => null) : null
  ]);
  if (openGame !== id) return;
  gameDetail = { id, game: game?.contests?.[0] || null, box, pbp };
  const ct = gameDetail.game?.teams || [];
  for (const t of ct) if (t.seoname && t.color) setColor(t.seoname, t.color);
  const lastPlay = (pbp?.periods || []).flatMap(p => p.playbyplayStats || []).at(-1);
  noteBest(id, ct.find(t => t.isHome)?.score, ct.find(t => !t.isHome)?.score);
  if (lastPlay) noteBest(id, lastPlay.homeScore, lastPlay.visitorScore);
  let moved = false;
  for (const list of Object.values(cache)) for (const g of list) if (g.gameID === id) {
    const before = g.home.score + "-" + g.away.score; applyBest(g);
    if (before !== g.home.score + "-" + g.away.score) moved = true;
  }
  if (moved) { drawGames(); drawTicker(new Set()); }
  drawGame();
}
function statRow(lbl, a, h, fmt = x => x) {
  const tot = (a + h) || 1;
  return `<div class="stbar"><b class="num">${fmt(a)}</b><span class="bar l"><i style="width:${a / tot * 100}%;background:var(--ink)"></i></span><span>${lbl}</span><span class="bar"><i style="width:${h / tot * 100}%;background:var(--ball)"></i></span><b class="num" style="text-align:right">${fmt(h)}</b></div>`;
}
const pct = (m, a) => a ? Math.round(m / a * 100) : 0;
function drawGame() {
  const boxEl = DETAIL;
  const sg = (cache[gday] || []).concat(cache.t || []).find(g => g.gameID === openGame);
  if (!openGame || !sg) { boxEl.hidden = true; window.CBBChat?.close(); return }
  boxEl.hidden = false;
  window.CBBChat?.show(CHATMOUNT, sg.gameID, `${fix(sg.away.names.short)} at ${fix(sg.home.names.short)}`);
  const d = gameDetail && gameDetail.id === openGame ? gameDetail : null;
  const c = d?.game, teams = c?.teams || [];
  const tHome = teams.find(t => t.isHome) || {}, tAway = teams.find(t => !t.isHome) || {};
  const st = status(sg), pre = sg.gameState === "pre";
  const side = (s, t, r) => `<div class="side ${r ? "r" : ""}">${mono(s.names.short, s.names.seo, t.color, "lg")}<div><strong>${(s.rank || apRank(s.names.short)) ? `<span style="color:var(--ball)">#${s.rank || apRank(s.names.short)}</span> ` : ""}${esc(fix(s.names.short))}</strong><small>${esc(recordOf(s.names.short, sg, s === sg.home ? "home" : "away") || fix(t.record || "").replace(/[()]/g, ""))}${CONF[confOf(s)] ? " · " + CONF[confOf(s)] : ""}</small></div></div>`;
  let html = `<div class="gh">${side(sg.away, tAway)}<div class="big">${pre ? "vs" : `${esc(sg.away.score)}–${esc(sg.home.score)}`}<small class="${st.cls}">${esc(st.txt)}${sg.network ? " · " + esc(sg.network) : ""}</small></div>${side(sg.home, tHome, 1)}</div>`;
  GHEAD.innerHTML = html; html = "";
  if (!d) { GMAIN.innerHTML = `<div class="boxwrap"><p style="margin:0;color:var(--muted)">Loading game details…</p></div>`; return }

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
  // keep the reader's place: refreshing the stats every 20 seconds shouldn't jump them back to the top
  const keep = GMAIN.scrollTop, oldPlays = GMAIN.querySelector(".plays"), keepPlays = oldPlays ? oldPlays.scrollTop : 0;
  GMAIN.innerHTML = html;
  GMAIN.scrollTop = keep; const np = GMAIN.querySelector(".plays"); if (np) np.scrollTop = keepPlays;
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
    drawTicker(changed); drawHero();
    changed.forEach(id => ["away", "home"].forEach(s => { const el = document.querySelector(`[data-sc="${id}-${s}"]`); if (el) { el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 900) } }));
    if (openGame && gday === "t") { const g = cache.t.find(x => x.gameID === openGame); if (g && (isLive(g) || changed.has(openGame))) loadGame(openGame); else drawGame(); }
  } catch (e) {
    if (!errShown) { $("#apierr").hidden = false; errShown = true; }
    if (!cache.t) $("#games").innerHTML = `<div class="empty">Scores couldn't load. Retrying…</div>`;
  }
}

// ---------- rankings & standings ----------
// AP rank lookup by school name. Names differ slightly between NCAA feeds ("Michigan St." vs "Michigan State"),
// so they're normalized before matching.
const AP = {};
const ABBR = { fla: "florida", ala: "alabama", ky: "kentucky", tenn: "tennessee", wash: "washington", ill: "illinois", miss: "mississippi", ark: "arkansas", ga: "georgia", mich: "michigan", ind: "indiana", caro: "carolina", colo: "colorado", ariz: "arizona", okla: "oklahoma", tex: "texas", va: "virginia", mo: "missouri", neb: "nebraska", mont: "montana", ore: "oregon", cal: "california", wis: "wisconsin", conn: "connecticut", pa: "pennsylvania", ny: "new york", nc: "north carolina", so: "southern", mt: "mount", fort: "fort", ft: "fort" };
const ABBR_FIRST = new Set(["so", "mt", "ft", "ark", "ga", "ala", "tenn", "fla", "mich", "miss", "ky", "okla", "tex", "colo", "ariz", "wis", "neb", "mont"]);
const ALIAS = { "app state": "appalachian state", "southern miss": "southern mississippi", "ole miss": "mississippi", "umass": "massachusetts", "uconn": "uconn", "fiu": "florida international", "fau": "florida atlantic", "unlv": "nevada las vegas", "ucf": "central florida", "utep": "texas el paso", "utsa": "texas san antonio", "siue": "siu edwardsville", "liu": "long island", "vcu": "virginia commonwealth", "lmu": "loyola marymount", "uic": "illinois chicago", "umbc": "maryland baltimore county", "etsu": "east tennessee state", "uncw": "unc wilmington", "unc greensboro": "unc greensboro", "unc asheville": "unc asheville", "middle tennessee": "middle tennessee", "army west point": "army", "miami ohio": "miami oh", "loyola maryland": "loyola md", "loyola chicago": "loyola chicago", "queens north carolina": "queens",  "southern cal": "usc", "southern california": "usc", "connecticut": "uconn", "miami fla": "miami fl", "miami florida": "miami fl", "st johns ny": "st johns", "saint marys": "st marys", "saint marys ca": "st marys", "st marys ca": "st marys", "brigham young": "byu", "louisiana state": "lsu", "texas christian": "tcu", "southern methodist": "smu", "nc state": "north carolina state" };
function normName(n) {
  let s = fix(n).toLowerCase().replace(/\(([^)]*)\)/g, " $1 ").replace(/&/g, " and ").replace(/['’.]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^saint /, "st ").replace(/ st$/, " state").replace(/ st /g, " state ").replace(/ univ(ersity)?$/, "");
  // NCAA feeds abbreviate states inconsistently ("West Fla." vs "West Florida"), so expand them everywhere
  s = s.split(" ").map((w, i) => (i > 0 || ABBR_FIRST.has(w)) && ABBR[w] ? ABBR[w] : w).join(" ");
  return ALIAS[s] || s;
}
const apRank = name => AP[normName(name)] || 0;
const rankBadge = r => r ? `<span class="rkb">${esc(r)}</span>` : "";

// Win-loss records for every D-I team, from NCAA.com's daily "Winning Percentage" table (8 pages of 50).
// The table runs through yesterday, so tonight's finished games are added on top.
const REC = {}; let recThrough = 0; // recThrough: yyyymmdd of the last day the table includes
const ymd = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
async function loadRecords() {
  try {
    const first = await api("stats/basketball-men/d1/current/team/168");
    const pages = [first];
    for (let p = 2; p <= (+first.pages || 1) && p <= 12; p++) pages.push(await api(`stats/basketball-men/d1/current/team/168?page=${p}`));
    for (const pg of pages) for (const x of pg.data || []) REC[normName(x.Team)] = { w: +x.W || 0, l: +x.L || 0 };
    const m = /through games \w+,?\s+(\w+ \d+, \d{4})/i.exec(first.updated || "");
    recThrough = m ? ymd(new Date(m[1])) : 0;
    drawGames(); drawGame(); drawStand(); if (apRows) drawRankings(); drawHero();
    fillMissingRecords();
  } catch { setTimeout(loadRecords, 20000) /* try again shortly */ }
}
// Teams missing from that table (no games yet, or not Division I) get their record from the game's own page,
// which lists each team's record going into the game.
const GREC = {}; const gameRecAsked = new Set();
async function fillMissingRecords() {
  const todo = [];
  for (const g of Object.values(cache).flat()) {
    if (gameRecAsked.has(g.gameID)) continue;
    const needRec = ["home", "away"].some(sd => !REC[normName(g[sd].names.short)] && !GREC[normName(g[sd].names.short)]);
    const needCol = ["home", "away"].some(sd => !TCOL[g[sd].names.seo]);
    if (needRec || needCol) todo.push(g.gameID);
  }
  let n = 0;
  for (const id of todo.slice(0, 80)) {
    gameRecAsked.add(id);
    try {
      const c = (await api(`game/${id}?info=1`))?.contests?.[0];
      for (const t of c?.teams || []) {
        const m = /(\d+)-(\d+)/.exec(t.record || "");
        const key = normName(t.nameShort || "");
        if (m && key && !REC[key]) GREC[key] = { w: +m[1], l: +m[2], gid: String(id) };
        if (t.seoname && t.color) setColor(t.seoname, t.color);
      }
    } catch { }
    if (++n % 10 === 0) { saveColors(); drawHero() }
    await new Promise(r => setTimeout(r, 300)); // stay well under the free API's rate limit
  }
  if (todo.length) { saveColors(); drawGames(); drawGame(); drawHero() }
}
function recordOf(name, g, side) {
  const key = normName(name), r = REC[key] || GREC[key];
  if (!r) return "";
  let { w, l } = r;
  if (r.gid) { // record from a game page is the record going into that game
    if (g && g.gameID === r.gid && g.gameState === "final") { const me = +g[side].score, them = +g[side === "home" ? "away" : "home"].score; if (me > them) w++; else if (me < them) l++; }
    return `${w}-${l}`;
  }
  if (g && g.gameState === "final" && recThrough) {
    const [mm, dd, yy] = String(g.startDate || "").split("/").map(Number);
    if (yy && yy * 10000 + mm * 100 + dd > recThrough) {
      const me = +g[side].score, them = +g[side === "home" ? "away" : "home"].score;
      if (me > them) w++; else if (me < them) l++;
    }
  }
  return `${w}-${l}`;
}
const recTag = rec => rec ? `<span class="rec">${esc(rec)}</span>` : "";

let apRows = null;
async function loadRankings() {
  try {
    const r = await api("rankings/basketball-men/d1/associated-press");
    $("#rkupdated").textContent = r.updated || "";
    apRows = r.data || [];
    apRows.forEach(x => { const nm = fix(x.SCHOOL).replace(/\s*\(\d+\)\s*$/, ""); AP[normName(nm)] = +x.RANK || 0 });
    drawRankings(); drawStand(); drawGames(); drawGame(); drawHero(); tickerSig = ""; drawTicker(new Set());
  } catch { $("#aprows").innerHTML = `<tr><td colspan="4">Rankings couldn't load. Try again in a minute.</td></tr>` }
}
function drawRankings() {
  const extra = Object.keys(apRows[0] || {}).filter(k => !["RANK", "SCHOOL", "POINTS", "RECORD"].includes(k));
  $("#rkhead").innerHTML = `<th class="num">Rk</th><th>Team</th><th class="num">Record</th>${extra.map(k => `<th class="num">${esc(k[0] + k.slice(1).toLowerCase())}</th>`).join("")}<th class="num">Pts</th>`;
  $("#aprows").innerHTML = apRows.map(x => {
    const m = /^(.*?)\s*\((\d+)\)\s*$/.exec(fix(x.SCHOOL)) || [0, fix(x.SCHOOL), ""];
    const rec = recordOf(m[1]) || (x.RECORD ? fix(x.RECORD) : "–");
    return `<tr><td class="num rkn">${esc(x.RANK)}</td><td><span class="tm">${mono(m[1], m[1])}<span>${esc(m[1])} ${m[2] ? `<small>(${m[2]})</small>` : ""}</span></span></td><td class="num">${esc(rec)}</td>${extra.map(k => `<td class="num">${esc(x[k])}</td>`).join("")}<td class="num">${esc(x.POINTS)}</td></tr>`;
  }).join("");
}
let standings = null, sconf = "", standingsStale = false;
async function loadStandings() {
  try {
    const r = await api("standings/basketball-men/d1");
    standings = r.data || [];
    // NCAA.com keeps last season's final standings up until conference play; spot that by the date.
    const up = new Date(String(r.updated || "").replace(/(\d+:\d+)\s*(AM|PM)?.*$/i, "").trim());
    const now = new Date(), seasonStart = new Date(now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1, 9, 1);
    standingsStale = !isNaN(up) && up < seasonStart;
    $("#stupdated").textContent = standingsStale ? "Conference play hasn't started · Overall records are current" : r.updated ? "Updated " + r.updated : "";
    sconf = sconf || (standings.find(c => c.conference === "Big Ten") || standings[0] || {}).conference || "";
    drawStand();
  } catch { $("#strows").innerHTML = `<tr><td colspan="6">Standings couldn't load. Try again in a minute.</td></tr>` }
}
function drawStand() {
  if (!standings) return;
  const P6N = ["ACC", "Big Ten", "Big 12", "SEC", "Big East", "Pac-12"];
  const names = standings.map(c => c.conference).sort((a, b) => (P6N.includes(b) - P6N.includes(a)) || a.localeCompare(b));
  $("#sconfs").innerHTML = names.map(c => `<button aria-pressed="${c === sconf}" data-sconf="${esc(c)}">${esc(c)}</button>`).join("");
  let rows = (standings.find(c => c.conference === sconf) || {}).standings || [];
  if (standingsStale) {
    // show this season: 0-0 in conference, current overall record, sorted by win percentage
    rows = rows.map(x => { const [w, l] = (recordOf(x.School) || "0-0").split("-").map(Number); return { School: x.School, "Conference W": 0, "Conference L": 0, "Overall W": w, "Overall L": l, "Overall PCT": w + l ? (w / (w + l)).toFixed(3) : "", "Overall STREAK": "" } })
      .sort((a, b) => ((+b["Overall PCT"] || 0) - (+a["Overall PCT"] || 0)) || (b["Overall W"] - a["Overall W"]) || (a["Overall L"] - b["Overall L"]) || fix(a.School).localeCompare(fix(b.School)));
  }
  $("#strows").innerHTML = rows.map((x, i) => {
    const stk = String(x["Overall STREAK"] || "").replace(/^Won /, "W").replace(/^Lost /, "L");
    return `<tr><td class="num">${i + 1}</td><td><span class="tm">${mono(x.School, x.School)}<span>${rankBadge(apRank(x.School))}${esc(fix(x.School))}</span></span></td><td class="num">${esc(x["Conference W"])}-${esc(x["Conference L"])}</td><td class="num">${esc(x["Overall W"])}-${esc(x["Overall L"])}</td><td class="num">${esc(String(x["Overall PCT"] || "").replace(/^0/, ""))}</td><td class="num ${stk[0] === "W" ? "in" : stk[0] === "L" ? "out" : ""}">${esc(stk)}</td></tr>`;
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
const VIEWS = ["scores", "news", "rankings", "standings", "discord", "rules"];
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
    const fromCard = gm.classList.contains("game");
    if (fromCard && openGame === gm.dataset.game) { openGame = null; gameDetail = null; drawGames(); drawGame(); return } // tap again to close
    if (location.hash && location.hash !== "#scores") { location.hash = "scores" }
    if (gm.dataset.dayOf === "t" && gday !== "t") { gday = "t"; drawDays(); drawFilters() }
    const before = fromCard ? gm.getBoundingClientRect().top : null;
    openGame = gm.dataset.game; boxSide = "away"; gameDetail = null; drawGames(); drawGame(); loadGame(openGame);
    const card = $(`#games .game[data-game="${openGame}"]`);
    if (fromCard && card) {
      // keep the tapped card exactly where it was on screen
      scrollBy(0, card.getBoundingClientRect().top - before);
    } else {
      // opened from the banner or ticker: bring that game into view
      const target = card || DETAIL;
      scrollTo({ top: target.getBoundingClientRect().top + scrollY - 140, behavior: reduced() ? "auto" : "smooth" });
    }
    return;
  }
  const sc = t.closest("[data-sconf]"); if (sc) { sconf = sc.dataset.sconf; drawStand(); return }
  const nc = t.closest("[data-ncat]"); if (nc) { ncat = nc.dataset.ncat; drawNews(); return }
  const s = t.closest("[data-story]"); if (s) { openStory(s.dataset.story); return }
  if (t.closest("[data-closestory]")) drawNews();
});
$("#q").addEventListener("input", e => { query = e.target.value; drawGames() });

// ---------- start ----------
drawDays(); drawGames(); drawNews(); drawInstagram(); route();
if (!loaded.rk) { loaded.rk = 1; loadRankings() } // AP ranks are also used on Scores and Standings
loadRecords(); setInterval(loadRecords, 3600000);
refresh();
setInterval(() => { if (!document.hidden) refresh() }, REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh() });
})();
