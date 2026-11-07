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
  const official = (window.TEAM_COLORS || {})[seo];
  if (official) return official;
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
// Every D-I team's logo name lives in teams.js; anything else falls back to names learned from scoreboards.
const SLUG_BY_NORM = {};
function logoSlug(name, seo) {
  if (seo && /^[a-z0-9-]+$/.test(seo)) return seo;
  const T = window.TEAM_SLUGS || {}, clean = fix(name).trim();
  if (T[clean]) return T[clean];
  if (!SLUG_BY_NORM.ready) { for (const k in T) SLUG_BY_NORM[normName(k)] = T[k]; SLUG_BY_NORM.ready = true }
  const key = normName(clean);
  return SLUG_BY_NORM[key] || NAME2SEO[key] || guessSlug(name);
}
// Some logos are mostly navy or black and disappear on the dark background. After a logo loads, measure how
// light it is; dark ones get a light outline (class "dk") so they stand out. Results are remembered per logo.
const LOGO_DARK = {};
window.cbbLogoCheck = img => {
  const key = img.src.replace(/[&?]r=1$/, "");
  const done = v => { LOGO_DARK[key] = v; img.classList.toggle("dk", v) };
  if (key in LOGO_DARK) return done(LOGO_DARK[key]);
  try {
    const c = document.createElement("canvas"); c.width = c.height = 40;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, 40, 40);
    const d = x.getImageData(0, 0, 40, 40).data; let n = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const V = Math.max(d[i], d[i + 1], d[i + 2]) / 255; // brightness: bright reds and blues read fine on black, navy and black don't
      n++; if (V < 0.36) dark++;
    }
    // outline the logo when a real part of it (a quarter or more) would blend into the background,
    // e.g. Cincinnati's black C even though it has a red edge
    done(n > 20 && dark / n >= 0.25);
  } catch { LOGO_DARK[key] = false }
};
const LOGO_ONLOAD = "this.dataset.ok=1;window.cbbLogoCheck&&cbbLogoCheck(this)";
// Logos show in full team colors. The all-white "dark" version is only used on top of a team-color background (news cards).
const logoURL = (slug, dark) => { const path = `logo/${slug}.svg${dark ? "?dark=true" : ""}`; return API === "" ? "/" + path : API + encodeURIComponent(path) };
const mono = (name, seo, color, cls = "") => {
  const slug = logoSlug(name, seo);
  const logo = slug ? `<img src="${logoURL(slug)}" alt="" loading="lazy" decoding="async" onload="${LOGO_ONLOAD}" onerror="if(!this.dataset.r){this.dataset.r=1;var i=this;setTimeout(function(){i.src=i.src+'&r=1'},2500+Math.random()*3000)}else{var m=this.closest('.mono');m.classList.remove('has-logo');this.remove()}">` : "";
  return `<span class="mono ${cls} ${logo ? "has-logo" : ""}" style="--mc:${teamColor(slug, color)}" aria-hidden="true"><b>${esc(initials(name))}</b>${logo}</span>`;
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
function teamColorFor(slug) { return slug ? (TCOL[slug] || visible((window.TEAM_COLORS || {})[slug] || "")) : "" }
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
  applyTV(cache[k]);
  loadTV(k, etDate(day.off).path);
  if (recThrough) setTimeout(fillMissingRecords, 0);
  return cache[k];
}

// ---------- where to watch ----------
// The NCAA feed leaves the TV network blank, so the relay reads each day's broadcasts from ESPN.
// Games are matched by team names and tip time.
const TV = {}, tvAsked = {};   // TV: gameID -> "ESPN+" etc.; tvAsked: date path -> time last loaded
async function loadTV(k, path) {
  if (tvAsked[path] && Date.now() - tvAsked[path] < 30 * 60e3) return;
  tvAsked[path] = Date.now();
  try {
    const data = await api(`tv/${path}`, 2);
    const list = (data.games || []).map(x => ({ t: x.t, tv: x.tv, a: new Set(x.a.map(normName)), h: new Set(x.h.map(normName)) }));
    const games = cache[k] || [], used = new Set(), key = g => [normName(g.away.names.short), normName(g.home.names.short), +g.startTimeEpoch || 0];
    const near = (x, t, secs) => !t || !x.t || Math.abs(x.t - t) <= secs;
    // first pass: both teams match (either can be listed as home); second pass: one team matches and the tip times line up
    for (const g of games) {
      const [a, h, t] = key(g);
      const hit = list.find(x => !used.has(x) && near(x, t, 3 * 3600) && ((x.a.has(a) && x.h.has(h)) || (x.a.has(h) && x.h.has(a))));
      if (hit) { used.add(hit); TV[g.gameID] = hit.tv.join(" / ") }
    }
    for (const g of games) {
      if (TV[g.gameID]) continue;
      const [a, h, t] = key(g);
      const hit = list.find(x => !used.has(x) && near(x, t, 20 * 60) && (x.a.has(a) || x.h.has(h) || x.a.has(h) || x.h.has(a)));
      if (hit) { used.add(hit); TV[g.gameID] = hit.tv.join(" / ") }
    }
    applyTV(cache[k]);
    if (k === gday) drawGames();
    if (k === "t") drawHero();
    if (openGame) drawGame();
  } catch { tvAsked[path] = Date.now() - 25 * 60e3 /* try again in ~5 minutes */ }
}
function applyTV(list) { for (const g of list || []) if (!g.network && TV[g.gameID]) g.network = TV[g.gameID] }
// Each network's official site, so fans can go watch. Networks not listed show without a link.
const WATCH = [
  [/^(ESPN|ESPN2|ESPNU|ESPNews|ESPN\+|ACCN|ACC Network|ACCNX|SECN|SEC Network|SECN\+|LHN|Longhorn Network|ABC)$/i, "https://www.espn.com/watch/"],
  [/^(FOX|FS1|FS2)$/i, "https://www.foxsports.com/live"],
  [/^(BTN|Big Ten Network)$/i, "https://www.btn.com/"],
  [/^B1G\+$/i, "https://www.bigtenplus.com/"],
  [/^(CBS|Paramount\+)$/i, "https://www.paramountplus.com/"],
  [/^(CBSSN|CBS Sports Network)$/i, "https://www.cbssports.com/watch/"],
  [/^(NBC|Peacock|USA Net|USA Network|NBCSN)$/i, "https://www.peacocktv.com/"],
  [/^(TNT|TBS|truTV|HBO Max|Max)$/i, "https://www.hbomax.com/"],
  [/^(FloSports|FloHoops)$/i, "https://www.flohoops.com/"],
  [/^Prime Video$/i, "https://www.amazon.com/primevideo"],
  [/^YouTube$/i, "https://www.youtube.com/"],
  [/^NESN$/i, "https://nesn.com/"],
];
const watchURL = net => { for (const [re, url] of WATCH) if (re.test(String(net).trim())) return url; return "" };
// The networks for a game as small chips. Linked ones open the network's site in a new tab.
function tvHTML(net, big, center) {
  if (!net) return "";
  const nets = String(net).split(/\s*\/\s*/).filter(Boolean);
  // game cards have room for one network (the national one comes first); the open game lists them all
  return `<span class="tvs${big ? " big" : ""}${center ? " ctr" : ""}">${(big ? nets : nets.slice(0, 1)).map(n => {
    const url = watchURL(n);
    const label = big || center ? n : n.replace(/ Network$/i, ""); // keep chips short on game cards
    if (!url) return `<span class="tv" title="${esc(n)}">${esc(label)}</span>`;
    // inside a game card (a button) a real link isn't allowed, so the chip opens the site from the click handler
    return big ? `<a class="tv on" href="${url}" target="_blank" rel="noopener" title="Watch on ${esc(n)}">${PLAY}Watch on ${esc(n)}</a>`
      : `<span class="tv on" role="link" tabindex="0" data-watch="${url}" title="Watch on ${esc(n)}">${PLAY}${center ? "Watch on " : ""}${esc(label)}</span>`;
  }).join("")}</span>`;
}
const PLAY = `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z" fill="currentColor"/></svg>`;
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
    return `<button class="game ${openGame === g.gameID ? "sel" : ""} ${favGame(g) ? "fav" : ""}" data-game="${g.gameID}">${favGame(g) ? `<span class="favmark" title="One of your teams">${STAR(true)}</span>` : ""}<div class="gstat ${st.cls}"><span class="l">${st.cls ? '<span class="dot"></span>' : ""}${esc(st.txt)}</span>${tvHTML(g.network)}</div>${trow(g, "away")}${trow(g, "home")}${badgeHTML(badges(g))}</button>`;
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
let heroId = null, heroLast = "", heroFlash = { a: 0, h: 0 }, heroExtra = { id: null, lines: [], play: "" };
// While the featured game is live, also pull its scoring by half and the latest play.
async function loadHeroExtra(id) {
  const [info, pbp] = await Promise.all([api(`game/${id}`, 1).catch(() => null), api(`game/${id}/play-by-play`, 1).catch(() => null)]);
  if (heroId !== id) return;
  const plays = (pbp?.periods || []).flatMap(p => p.playbyplayStats || []);
  const last = [...plays].reverse().find(p => (p.eventDescription || p.homeText || p.visitorText) && !/^(subbing|timeout)/i.test(p.eventDescription || ""));
  const ct = info?.contests?.[0];
  if (ct) noteBest(id, ct.teams?.find(t => t.isHome)?.score, ct.teams?.find(t => !t.isHome)?.score);
  const lp = [...plays].reverse().find(p => p.homeScore !== undefined); if (lp) noteBest(id, lp.homeScore, lp.visitorScore);
  for (const list of Object.values(cache)) for (const g of list) if (g.gameID === id) applyBest(g);
  heroExtra = { id, lines: ct?.linescores || [], play: last ? fix(last.eventDescription || last.homeText || last.visitorText).replace(/\s+/g, " ").trim() : "" };
  drawHero();
}
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
  // games that tip before 5 PM (viewer's time) are the "Game of the Day"; evening games are the "Game of the Night"
  const tipHour = +g.startTimeEpoch ? new Date(+g.startTimeEpoch * 1000).getHours() : 19;
  const when = tipHour < 17 ? "Day" : "Night";
  el.setAttribute("aria-label", `Game of the ${when}: ${fix(g.away.names.short)} at ${fix(g.home.names.short)}. Open game.`);
  const isLive = g.gameState === "live";
  const ex = heroExtra.id === g.gameID ? heroExtra : { lines: [], play: "" };
  const halves = isLive && ex.lines.length ? `<div class="hlines">${ex.lines.map(l => `<span><b>${+l.period <= 2 ? (l.period === "1" ? "1st" : "2nd") : "OT" + (+l.period > 3 ? +l.period - 2 : "")}</b> ${esc(l.visit)}–${esc(l.home)}</span>`).join("")}</div>` : "";
  const play = isLive && ex.play ? `<div class="hplay"><span>Last play</span> ${esc(ex.play)}</div>` : "";
  el.classList.toggle("is-live", isLive);
  el.innerHTML = `<div class="gt"><div class="lbl">Game of the <span>${when}</span>${isLive ? `<em class="livepill"><span class="dot"></span>Live</em>` : ""}</div>${badgeHTML(badges(g))}</div>
    <div class="gm">${side(g.away, "away")}<div class="mid"><div class="big2">${pre ? "VS" : `<span class="${fin && a < h ? "l" : "w"}" data-hs="a">${a}</span>–<span class="${fin && h < a ? "l" : "w"}" data-hs="h">${h}</span>`}</div><div class="st2 ${st.cls}">${esc(st.txt)}</div>${tvHTML(g.network, 0, 1)}${halves}</div>${side(g.home, "home", 1)}</div>${play}`;
  el.hidden = false;
  // flash whichever score just changed (kept for a moment, since the banner can redraw several times)
  const now = `${g.gameID}:${a}-${h}`, before = heroLast; heroLast = now;
  if (isLive && before.startsWith(g.gameID + ":") && before !== now) {
    const [pa, ph] = before.split(":")[1].split("-").map(Number);
    if (a !== pa) heroFlash.a = Date.now() + 1400;
    if (h !== ph) heroFlash.h = Date.now() + 1400;
  }
  for (const k of ["a", "h"]) if (heroFlash[k] > Date.now()) el.querySelector(`[data-hs="${k}"]`)?.classList.add("flash");
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
      const st = status(g), side = t => `<span class="tt"><img class="tlogo" src="${logoURL(logoSlug(t.names.short, t.names.seo))}" alt="" onload="${LOGO_ONLOAD}" onerror="this.remove()">${rk(t) ? `<b>${rk(t)}</b>` : ""}${esc(fix(t.names.short))}</span>`;
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
  const side = (s, t, r) => `<a class="side tlink ${r ? "r" : ""}" href="#team-${esc(logoSlug(s.names.short, s.names.seo))}" title="Open ${esc(fix(s.names.short))} team page">${mono(s.names.short, s.names.seo, t.color, "lg")}<div><strong>${(s.rank || apRank(s.names.short)) ? `<span style="color:var(--ball)">#${s.rank || apRank(s.names.short)}</span> ` : ""}${esc(fix(s.names.short))}</strong><small>${esc(recordOf(s.names.short, sg, s === sg.home ? "home" : "away") || fix(t.record || "").replace(/[()]/g, ""))}${CONF[confOf(s)] ? " · " + CONF[confOf(s)] : ""}</small></div></a>`;
  let html = `<div class="gh">${side(sg.away, tAway)}<div class="big">${pre ? "vs" : `${esc(sg.away.score)}–${esc(sg.home.score)}`}<small class="${st.cls}">${esc(st.txt)}</small>${tvHTML(sg.network, 1)}</div>${side(sg.home, tHome, 1)}</div>`;
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
    if (!teamOpen && !$("#teamdir-wrap").closest(".view").hidden) drawTeamDir(); // live tags on the Teams tab
    if (teamOpen && !$("#teampage").hidden && teamTab === "schedule" && (cache.t || []).some(g => (isLive(g) || changed.has(g.gameID)) && [g.home, g.away].some(t => t.names.seo === teamOpen))) drawTeam(); // live scores on a team page
    { const hg = (cache.t || []).find(x => x.gameID === heroId); if (hg && hg.gameState === "live") loadHeroExtra(heroId) }
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
    drawGames(); drawGame(); drawStand(); if (apRows) drawRankings(); drawApOthers(); drawHero();
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
    return `<tr class="click" data-teamslug="${esc(logoSlug(m[1]))}"><td class="num rkn">${esc(x.RANK)}</td><td><span class="tm">${mono(m[1], m[1])}<span>${esc(m[1])} ${m[2] ? `<small>(${m[2]})</small>` : ""}</span></span></td><td class="num">${esc(rec)}</td>${extra.map(k => `<td class="num">${esc(x[k])}</td>`).join("")}<td class="num">${esc(x.POINTS)}</td></tr>`;
  }).join("");
}
// Teams that got AP votes but missed the Top 25, most votes first
let apOthers = null;
async function loadApOthers() {
  try { const r = await api("ap-others"); apOthers = r.others || []; drawApOthers() } catch { }
}
function drawApOthers() {
  const box = $("#apothers"); if (!apOthers || !apOthers.length) { box.hidden = true; return }
  $("#otherrows").innerHTML = apOthers.map(x => `<tr class="click" data-teamslug="${esc(logoSlug(x.school))}"><td><span class="tm">${mono(x.school, x.school)}<span>${esc(x.school)}</span></span></td><td class="num">${esc(recordOf(x.school) || "–")}</td><td class="num">${x.votes}</td></tr>`).join("");
  box.hidden = false;
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
    drawStand(); if (teamOpen) drawTeam(); else drawTeamDir();
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
    return `<tr class="click" data-teamslug="${esc(logoSlug(x.School))}"><td class="num">${i + 1}</td><td><span class="tm">${mono(x.School, x.School)}<span>${rankBadge(apRank(x.School))}${esc(fix(x.School))}</span></span></td><td class="num">${esc(x["Conference W"])}-${esc(x["Conference L"])}</td><td class="num">${esc(x["Overall W"])}-${esc(x["Overall L"])}</td><td class="num">${esc(String(x["Overall PCT"] || "").replace(/^0/, ""))}</td><td class="num ${stk[0] === "W" ? "in" : stk[0] === "L" ? "out" : ""}">${esc(stk)}</td></tr>`;
  }).join("");
}

// ---------- news (sample stories until real ones are added) ----------
const NEWS = window.NEWS || [];
const NCATS = ["All", "Top 25", "Games", "Transfer Portal", "Recruiting", "Conferences"]; let ncat = "All";
const art = n => `<div class="art" style="background:${teamColor(n.team)}" aria-hidden="true"><img class="artlogo" src="${logoURL(n.team, true)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${esc(initials(n.team.replace(/-/g, " ")))}'}))"></div>`;
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


// ---------- Teams: directory and team pages ----------
// Each team page shows the season schedule, team stats and player stats. Stats are added up from the box scores
// of the team's finished games, so they're always in step with the scores on this site.
let teamQuery = "", teamOpen = null, teamTab = "schedule", playerSort = "ppg";
const TEAMDATA = {}; // slug -> { games, boxes: {gameId: boxscore}, loading }
function teamName(slug) {
  for (const c of standings || []) for (const x of c.standings || []) if (logoSlug(x.School) === slug) return fix(x.School).trim();
  const T = window.TEAM_SLUGS || {}; const names = Object.keys(T).filter(k => T[k] === slug);
  return names.sort((a, b) => b.length - a.length)[0] || slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function teamConf(slug) {
  for (const c of standings || []) for (const x of c.standings || []) if (logoSlug(x.School) === slug) return { conf: c.conference, row: x };
  return { conf: "", row: null };
}
// ---------- Stats tab: Division I leaders ----------
let STATCATS = null, stKind = "individual", stCat = { individual: null, team: null }, stQuery = "";
const STATDATA = {};   // "kind/id" -> {rows, pages, page, title, updated}
// Most-wanted categories go first; anything else the NCAA has follows in its own order.
const ST_ORDER = [/^points per game/i, /^scoring offense/i, /^rebounds per game/i, /^assists per game/i, /^steals per game/i, /^blocks per game/i,
  /^field goal percentage$/i, /^three point percentage$/i, /^three pointers per game/i, /^free throw percentage$/i, /^minutes per game/i,
  /^scoring defense/i, /^scoring margin/i, /^winning percentage/i, /^rebound margin/i, /^turnovers per game/i, /^turnovers forced/i];
const stRank = t => { const i = ST_ORDER.findIndex(re => re.test(t)); return i < 0 ? 99 : i };
const shortStat = t => t.replace(/\bPer Game\b/i, "/ game").replace(/\bPercentage\b/i, "%").replace(/Field.Goals?/i, "FG").replace(/Three.Pointers?|Three.Point|3-point/i, "3PT")
  .replace(/Free.Throws?/i, "FT").replace(/^Total /i, "").replace(/\bAttempts\b/i, "attempts").replace(/\bMade\b/i, "made").replace(/^FG$/, "FG made").replace(/ FGM$/, " made").trim();
async function loadStatCats() {
  if (STATCATS) return drawStats();
  $("#strows2").innerHTML = `<tr><td>Loading stat leaders…</td></tr>`;
  try {
    // First choice: stats.json, which GitHub rebuilds twice a day with every category and its top 50 (instant).
    // If it's missing or more than a day and a half old, ask the relay to find the categories instead.
    let r = await fetch("/stats.json", { cache: "no-cache" }).then(x => x.ok ? x.json() : null).catch(() => null);
    if (r && Array.isArray(r.cats) && r.cats.length && Date.now() - (+r.built || 0) < 36 * 3600e3) {
      for (const c of r.cats) if (c.rows && c.rows.length) STATDATA[c.kind + "/" + c.id] = { rows: c.rows.slice(), page: 1, pages: c.pages || 1, title: c.title, updated: c.updated || "", total: c.total };
    } else r = await api("stat-cats", 1);
    STATCATS = (r.cats || []).filter(c => c.kind === "individual" || c.kind === "team");
    for (const k of ["individual", "team"]) {
      const list = STATCATS.filter(c => c.kind === k).sort((a, b) => stRank(a.title) - stRank(b.title) || a.id - b.id);
      stCat[k] = stCat[k] || (list[0] && list[0].id);
    }
    drawStats();
  } catch { $("#strows2").innerHTML = `<tr><td>Stats couldn't load. Try again in a minute.</td></tr>` }
}
async function loadStatPage(kind, id, page) {
  const key = kind + "/" + id, D = STATDATA[key] || (STATDATA[key] = { rows: [], page: 0, pages: 1 });
  if (D.loading || page <= D.page) return;
  D.loading = true;
  try {
    const r = await api(`stats/basketball-men/d1/current/${kind}/${id}${page > 1 ? "?page=" + page : ""}`, 2);
    D.rows.push(...(r.data || [])); D.page = page; D.pages = +r.pages || 1; D.title = r.title || ""; D.updated = r.updated || "";
  } catch { D.err = true }
  D.loading = false;
  if (stKind === kind && stCat[kind] === id) drawStats();
}
// The complete list for one stat (everyone the NCAA ranks), for search and "Show more".
// GitHub saves it as stats/<kind>-<id>.json; if that's missing, read the remaining pages from the relay.
async function loadStatFull(kind, id) {
  const key = kind + "/" + id, D = STATDATA[key]; if (!D || D.full || D.fullLoading) return;
  D.fullLoading = true;
  try {
    const f = await fetch(`/stats/${kind}-${id}.json`, { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (f && Array.isArray(f.rows) && f.rows.length >= D.rows.length) { D.rows = f.rows; D.full = true; D.page = D.pages }
    else {
      for (let p = D.page + 1; p <= Math.min(D.pages, 40); p++) {
        const r = await api(`stats/basketball-men/d1/current/${kind}/${id}?page=${p}`, 2);
        D.rows.push(...(r.data || [])); D.page = p;
        if (stKind === kind && stCat[kind] === id) drawStats();
      }
      D.full = true;
    }
  } catch { }
  D.fullLoading = false;
  if (stKind === kind && stCat[kind] === id) drawStats();
}
// Which column holds the stat itself (the last numeric-looking column, usually)
function statCol(cols) {
  const skip = /^(rank|name|team|cl|class|height|ht|position|pos|g|gm|games|dq)$/i;
  const nums = cols.filter(c => !skip.test(c));
  // per-game, percentage and margin columns are the stat when there is one (e.g. PFPG, not DQ)
  const rate = nums.filter(c => /PG$|%$|^pct$|^avg$|MAR$/i.test(c));
  return rate[rate.length - 1] || nums[nums.length - 1] || cols[cols.length - 1];
}
function drawStats() {
  document.querySelectorAll("[data-stkind]").forEach(b => b.setAttribute("aria-pressed", b.dataset.stkind === stKind));
  if (!STATCATS) return;
  const cats = STATCATS.filter(c => c.kind === stKind).sort((a, b) => stRank(a.title) - stRank(b.title) || a.id - b.id);
  $("#stcats").innerHTML = cats.map(c => `<button data-stcat="${c.id}" aria-pressed="${c.id === stCat[stKind]}" title="${esc(c.title)}">${esc(shortStat(c.title))}</button>`).join("");
  const id = stCat[stKind]; if (!id) { $("#strows2").innerHTML = `<tr><td>No stats yet.</td></tr>`; return }
  const D = STATDATA[stKind + "/" + id];
  if (!D || (!D.page && !D.err)) { $("#stpod").innerHTML = ""; $("#sthead").innerHTML = ""; $("#strows2").innerHTML = `<tr><td>Loading…</td></tr>`; $("#stmore").hidden = true; loadStatPage(stKind, id, 1); return }
  if (!D.rows.length) { $("#stpod").innerHTML = ""; $("#sthead").innerHTML = ""; $("#strows2").innerHTML = `<tr><td>${D.err ? "This stat couldn't load. Try again in a minute." : "No leaders yet for this stat."}</td></tr>`; $("#stmore").hidden = true; return }
  const cols = Object.keys(D.rows[0]), sc = statCol(cols), isP = stKind === "individual";
  const teamOf = row => fix(row.Team || row.School || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  const nameOf = row => isP ? fix(row.Name || row.Player || "") : teamOf(row);
  const thru = /through games\s+(?:\w+day,\s*)?([A-Za-z]+ \d+)/i.exec(D.updated || "");
  $("#stupd").textContent = thru ? `Division I · Through games ${thru[1].replace(/^(\w{3})\w*/, "$1.").replace(/ 0(\d)$/, " $1")}` : "Division I leaders";
  // podium: top 3
  const q = stQuery.trim().toLowerCase();
  const pod = q ? [] : D.rows.slice(0, 3);
  const podCard = (row, i) => {
    const t = teamOf(row), slug = logoSlug(t), tc = teamColorFor(slug) || "#3A3A40";
    const sub = isP ? [t, row.Cl || row.Class, row.Position || row.Pos].filter(Boolean).join(" · ") : (recordOf(t) || "");
    return `<a class="pod p${i + 1}" href="#team-${esc(slug)}" style="--tc:${tc}">${slug ? `<img class="twm" src="${logoURL(slug)}" alt="" loading="lazy" onerror="this.remove()">` : ""}<span class="place">${["1st", "2nd", "3rd"][i]}</span><span class="who">${mono(t, slug)}<span><b>${esc(nameOf(row))}</b><small>${esc(sub)}</small></span></span><span class="val">${esc(row[sc])}</span><span class="lab">${esc(sc)}</span></a>`;
  };
  // 2nd, 1st, 3rd on wide screens so 1st sits in the middle
  $("#stpod").innerHTML = pod.length === 3 ? [podCard(pod[1], 1), podCard(pod[0], 0), podCard(pod[2], 2)].join("") : "";
  const opt = /^(cl|class|height|ht|position|pos)$/i;
  $("#sthead").innerHTML = `<tr>${cols.map(c => `<th class="${c === sc ? "hl" : ""} ${opt.test(c) ? "opt" : ""} ${/^(rank|name|team)$/i.test(c) ? "" : "num"}">${esc(c)}</th>`).join("")}</tr>`;
  // the NCAA marks ties with "-" in the rank column; show them as "T-4"
  let last = "";
  for (const r of D.rows) { const k = r.Rank; if (k && k !== "-" && !/^T-/.test(k)) last = k; else if (k === "-" && last) { r.Rank = "T-" + last; const prev = D.rows[D.rows.indexOf(r) - 1]; if (prev && prev.Rank === last) prev.Rank = "T-" + last } }
  D.show = D.show || 50;
  if (q && !D.full) loadStatFull(stKind, id); // search covers everyone, not just the rows on screen
  const rows = q ? D.rows.filter(r => [r.Name, r.Player, r.Team, r.School].some(v => v && fix(v).toLowerCase().includes(q))).slice(0, 300)
    : D.rows.slice(0, D.show);
  $("#strows2").innerHTML = rows.length ? rows.map(row => {
    const t = teamOf(row), slug = logoSlug(t);
    return `<tr class="${isFav(slug) ? "mine" : ""}">${cols.map(c => {
      let v = esc(fix(row[c] ?? ""));
      if (/^team$|^school$/i.test(c)) v = `<a class="tm" href="#team-${esc(slug)}">${mono(t, slug)}<span>${esc(fix(row[c]))}</span></a>`;
      return `<td class="${c === sc ? "hl" : ""} ${opt.test(c) ? "opt" : ""} ${/^(rank|name|team|school)$/i.test(c) ? "" : "num"}">${v}</td>`;
    }).join("")}</tr>`;
  }).join("") : `<tr><td colspan="${cols.length}">${D.fullLoading ? `Searching everyone in ${esc(shortStat(D.title || ""))}…` : `No one matches “${esc(stQuery)}” in this stat.${/%|percentage/i.test(D.title || "") ? " Percentage stats only list players with enough attempts." : ""}`}</td></tr>`;
  const total = D.full ? D.rows.length : D.pages * 50;
  $("#stmore").hidden = !!q || (D.show >= D.rows.length && (D.full || D.page >= D.pages));
  $("#stmore").textContent = D.fullLoading && D.show >= D.rows.length ? "Loading…" : `Show more (${Math.min(D.show, D.rows.length)} of ${D.full ? "" : "about "}${total})`;
}
document.addEventListener("click", e => {
  const k = e.target.closest && e.target.closest("[data-stkind]");
  if (k) { stKind = k.dataset.stkind; drawStats(); return }
  const c = e.target.closest && e.target.closest("[data-stcat]");
  if (c) { stCat[stKind] = +c.dataset.stcat; drawStats(); return }
  if (e.target.id === "stmore") { const id = stCat[stKind], D = STATDATA[stKind + "/" + id]; if (D) { D.show = (D.show || 50) + 50; if (D.show > D.rows.length) loadStatFull(stKind, id); drawStats() } }
});
$("#stq").addEventListener("input", e => { stQuery = e.target.value; drawStats() });

// ---------- favorites (saved on this device) ----------
let FAVS = [];
try { FAVS = JSON.parse(localStorage.getItem("cbb_favs") || "[]").filter(x => typeof x === "string") } catch { FAVS = [] }
const isFav = slug => FAVS.includes(slug);
function toggleFav(slug) {
  FAVS = isFav(slug) ? FAVS.filter(x => x !== slug) : [...FAVS, slug];
  try { localStorage.setItem("cbb_favs", JSON.stringify(FAVS)) } catch { }
  drawTeamDir(); if (teamOpen) drawTeam(); drawGames();
}
const STAR = on => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 6.1 6.6.6-5 4.4 1.5 6.5L12 17l-5.9 3.4 1.5-6.5-5-4.4 6.6-.6z" ${on ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"'}/></svg>`;
const favBtn = (slug, name, cls = "") => `<span class="favbtn ${cls} ${isFav(slug) ? "on" : ""}" role="button" tabindex="0" data-fav="${esc(slug)}" aria-pressed="${isFav(slug)}" title="${isFav(slug) ? "Unfollow" : "Follow"} ${esc(name)}">${STAR(isFav(slug))}</span>`;
// does this game involve one of the viewer's teams?
const favGame = g => FAVS.length && ["home", "away"].some(sd => isFav(logoSlug(g[sd].names.short, g[sd].names.seo)));

// ---------- today's game for each team (for the Teams directory) ----------
function todayGames() {
  const by = {};
  for (const g of cache.t || []) for (const sd of ["home", "away"]) {
    const t = g[sd], o = g[sd === "home" ? "away" : "home"], slug = logoSlug(t.names.short, t.names.seo);
    if (slug) by[slug] = { g, me: t, op: o, home: sd === "home" };
  }
  return by;
}
function todayTag(x) {
  if (!x) return "";
  const { g, me, op, home } = x, opn = esc(fix(op.names.short)), vs = home ? "vs" : "at";
  let txt, cls = "";
  if (g.gameState === "live") { cls = "live"; txt = `<i></i>${esc(me.score || 0)}–${esc(op.score || 0)} ${vs} ${opn}` }
  else if (g.gameState === "final") { const w = +me.score > +op.score; cls = w ? "won" : "lost"; txt = `${w ? "W" : "L"} ${esc(me.score)}–${esc(op.score)} ${vs} ${opn}` }
  else txt = `${esc(status(g).txt)} ${vs} ${opn}`;
  return `<span class="ttag ${cls}" role="link" tabindex="0" data-tgame="${esc(g.gameID)}" title="Open this game"><em>${g.gameState === "live" ? "Live" : g.gameState === "final" ? "Final" : "Today"}</em>${txt}</span>`;
}
// Open a game from today on the Scores tab
function goGame(id) {
  gday = "t"; gfilt = "All"; gconf = ""; query = ""; const qi = $("#q"); if (qi) qi.value = "";
  location.hash = "scores";
  setTimeout(() => {
    drawDays(); drawFilters(); drawGames();
    const card = document.querySelector(`#games .game[data-game="${CSS.escape(id)}"]`);
    if (card) { card.click(); card.scrollIntoView({ behavior: "smooth", block: "start" }) }
  }, 60);
}

// ---------- Teams directory ----------
let teamSort = "az";
const winPct = n => { const r = /^(\d+)-(\d+)/.exec(recordOf(n) || ""); if (!r) return -1; const w = +r[1], l = +r[2]; return w + l ? w / (w + l) + w / 1000 : 0 };
function teamCard(n, slug, today) {
  const r = rk({ names: { short: n } }), tc = teamColorFor(slug) || "#3A3A40";
  const wm = slug ? `<img class="twm" src="${logoURL(slug)}" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<a class="tcard${isFav(slug) ? " fav" : ""}${today && today.g.gameState === "live" ? " islive" : ""}" href="#team-${esc(slug)}" style="--tc:${tc}">${wm}${mono(n, slug)}<span class="tinfo"><b>${r ? `<span class="rkb">${r}</span>` : ""}${esc(n)}</b><small>${esc(recordOf(n) || "0-0")}</small>${todayTag(today)}</span>${favBtn(slug, n)}</a>`;
}
function drawTeamDir() {
  const box = $("#teamdir");
  if (!standings) { box.innerHTML = `<p class="empty">Loading teams…</p>`; $("#tconfbar").innerHTML = ""; return }
  const q = teamQuery.trim().toLowerCase(), P6N = ["ACC", "Big Ten", "Big 12", "SEC", "Big East", "Pac-12"];
  const sorter = teamSort === "rec" ? (a, b) => winPct(b) - winPct(a) || a.localeCompare(b)
    : teamSort === "rk" ? (a, b) => ((rk({ names: { short: a } }) || 99) - (rk({ names: { short: b } }) || 99)) || a.localeCompare(b)
    : (a, b) => a.localeCompare(b);
  let groups = [...standings].sort((a, b) => (P6N.includes(b.conference) - P6N.includes(a.conference)) || a.conference.localeCompare(b.conference))
    .map(c => ({ conf: c.conference, teams: (c.standings || []).map(x => fix(x.School).trim()).filter(n => !q || n.toLowerCase().includes(q) || c.conference.toLowerCase().includes(q)).sort(sorter) }))
    .filter(g => g.teams.length);
  const all = groups.flatMap(g => g.teams);
  const today = todayGames();
  // pinned groups on top: the viewer's teams, and (when sorting by rank) the Top 25
  const extra = [];
  const favs = all.filter(n => isFav(logoSlug(n)));
  if (favs.length) extra.push({ conf: "Your teams", id: "your-teams", star: true, teams: favs });
  if (teamSort === "rk") { const ranked = all.filter(n => rk({ names: { short: n } })).sort(sorter); if (ranked.length) extra.push({ conf: "AP Top 25", id: "ap-top-25", teams: ranked }) }
  const tg = all.map(n => today[logoSlug(n)]).filter(Boolean), live = tg.filter(x => x.g.gameState === "live").length;
  groups = [...extra, ...groups];
  const gid = g => g.id || "conf-" + g.conf.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  $("#tconfbar").innerHTML = groups.map(g => `<a href="#" data-tjump="${gid(g)}" class="${g.star ? "star" : ""}">${g.star ? STAR(true) : ""}${esc(g.conf)}</a>`).join("");
  $("#tplaying").innerHTML = tg.length ? `${tg.length} team${tg.length === 1 ? "" : "s"} in action today${live ? ` · <b><i></i>${live} live now</b>` : ""}` : "";
  box.innerHTML = groups.length ? groups.map(g => `<section class="tconf${g.star ? " favs" : ""}" id="${gid(g)}"><h2>${g.star ? STAR(true) : ""}${esc(g.conf)}<small>${g.teams.length}</small></h2><div class="tgrid">${g.teams.map(n => { const slug = logoSlug(n); return teamCard(n, slug, today[slug]) }).join("")}</div></section>`).join("")
    : `<p class="empty">No teams match “${esc(teamQuery)}”.</p>`;
  if (!favs.length && !q) box.insertAdjacentHTML("afterbegin", `<p class="favhint">${STAR(false)} Tap the star on any team to follow it. Your teams stay pinned here and get highlighted on Scores.</p>`);
}
// Every game this season for every team, loaded once and shared by all team pages.
let SEASON = null;
// First choice: season.json, a file GitHub rebuilds twice a day (instant, even right after the site updates).
// If it's missing or more than a day and a half old, ask the relay to build the list instead.
function loadSeason() {
  if (!SEASON) SEASON = fetch("/season.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).catch(() => null).then(f => {
    if (f && Array.isArray(f.games) && f.games.length && Date.now() - (+f.built || 0) < 36 * 3600e3) return f;
    return api("season", 2);
  }).then(r => {
    if (!r || !Array.isArray(r.games)) throw new Error("no season");
    if (r.missingDays) setTimeout(() => { SEASON = null }, 60e3); // some days were missing: try again in a minute
    return r;
  }).catch(e => { SEASON = null; throw e });
  return SEASON;
}
// The season list can be a few minutes old, so today's games take their score and status from the live scoreboard.
function freshen(games) {
  const live = {};
  for (const k of ["y", "t", "m"]) for (const g of cache[k] || []) live[g.gameID] = g;
  for (const x of games || []) {
    const g = live[x.id]; if (!g) continue;
    x.s = g.gameState; x.f = g.finalMessage || ""; x.p = g.currentPeriod || ""; x.c = g.contestClock || "";
    if (x.a[0] === g.away.names.seo) { x.a[2] = g.away.score || ""; x.h[2] = g.home.score || "" }
    else if (x.h[0] === g.away.names.seo) { x.h[2] = g.away.score || ""; x.a[2] = g.home.score || "" }
  }
  return games;
}
async function openTeam(slug) {
  teamOpen = slug; $("#teamdir-wrap").hidden = true; $("#teampage").hidden = false;
  if (!standings && !loaded.st) { loaded.st = 1; loadStandings() }
  const T = TEAMDATA[slug] || (TEAMDATA[slug] = { games: null, boxes: {}, err: false });
  drawTeam();
  if (!T.games) {
    try {
      // the whole season comes in one list (usually already loaded when the Teams tab opened)
      const all = await loadSeason();
      T.games = all.games.filter(g => g.a[0] === slug || g.h[0] === slug); T.partial = !!all.missingDays;
    } catch {
      try { const r = await api(`team-season/${slug}`, 2); T.games = r.games || []; T.partial = !!r.missingDays } catch { T.err = true }
    }
    if (teamOpen === slug) drawTeam();
    // grab the team's official color from one of its games for the page accent
    const g0 = (T.games || [])[0];
    if (g0 && !teamColorFor(slug)) api(`game/${g0.id}?info=1`).then(r => { for (const t of r?.contests?.[0]?.teams || []) if (t.seoname && t.color) setColor(t.seoname, t.color); saveColors(); if (teamOpen === slug) drawTeam() }).catch(() => { });
  }
  loadTeamBoxes(slug);
}
function closeTeam() { teamOpen = null; $("#teamdir-wrap").hidden = false; $("#teampage").hidden = true; drawTeamDir() }
async function loadTeamBoxes(slug) {
  const T = TEAMDATA[slug]; if (!T?.games || T.loadingBoxes) return;
  const todo = T.games.filter(g => g.s === "final" && !T.boxes[g.id]);
  if (!todo.length) return;
  T.loadingBoxes = true; let i = 0;
  async function worker() {
    while (i < todo.length) {
      const g = todo[i++];
      try { T.boxes[g.id] = await api(`game/${g.id}/boxscore?final=1`) } catch { T.boxes[g.id] = null }
      if (teamOpen === slug && teamTab !== "schedule") drawTeam();
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  T.loadingBoxes = false;
  if (teamOpen === slug) drawTeam();
}
// Adds up a team's box scores into season totals for the team, its opponents and each player.
function seasonStats(slug) {
  const T = TEAMDATA[slug], team = blankTotals(), opp = blankTotals(), players = {};
  let games = 0;
  for (const g of T.games || []) {
    const b = T.boxes[g.id]; if (g.s !== "final" || !b) continue;
    const me = (b.teams || []).find(t => t.seoname === slug); if (!me) continue;
    const mine = (b.teamBoxscore || []).find(x => String(x.teamId) === String(me.teamId));
    const theirs = (b.teamBoxscore || []).find(x => String(x.teamId) !== String(me.teamId));
    if (!mine) continue;
    games++; addTotals(team, mine.teamStats); addTotals(opp, theirs?.teamStats);
    for (const p of mine.playerStats || []) {
      const name = fix(`${p.firstName || ""} ${p.lastName || ""}`).trim(); if (!name) continue;
      const P = players[name] || (players[name] = { name, num: p.number, pos: p.position || "", yr: p.year || "", gp: 0, gs: 0, min: 0, ...blankTotals() });
      const min = parseInt(p.minutesPlayed, 10) || 0;
      const played = min > 0 || +p.points || +p.totalRebounds || +p.fieldGoalsAttempted;
      if (!played) continue;
      P.gp++; if (p.starter) P.gs++; P.min += min; addTotals(P, p); P.num = p.number ?? P.num; P.pos = p.position || P.pos;
    }
  }
  return { games, team, opp, players: Object.values(players) };
}
function blankTotals() { return { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0 } }
function addTotals(t, s) {
  if (!s) return; const n = v => parseInt(v, 10) || 0;
  t.pts += n(s.points); t.fgm += n(s.fieldGoalsMade); t.fga += n(s.fieldGoalsAttempted); t.tpm += n(s.threePointsMade); t.tpa += n(s.threePointsAttempted);
  t.ftm += n(s.freeThrowsMade); t.fta += n(s.freeThrowsAttempted); t.oreb += n(s.offensiveRebounds); t.reb += n(s.totalRebounds);
  t.ast += n(s.assists); t.stl += n(s.steals); t.blk += n(s.blockedShots); t.to += n(s.turnovers); t.pf += n(s.personalFouls);
}
const per = (v, g) => g ? (v / g).toFixed(1) : "–";
const pctOf = (m, a) => a ? (m / a * 100).toFixed(1) : "–";
const shortDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function drawTeam() {
  const slug = teamOpen, box = $("#teampage"); if (!slug) return;
  const T = TEAMDATA[slug] || {}, name = teamName(slug), { conf, row } = teamConf(slug), r = rk({ names: { short: name } });
  const games = freshen(T.games) || [];
  let w = 0, l = 0;
  for (const g of games) if (g.s === "final") { const me = g.h[0] === slug ? g.h : g.a, op = g.h[0] === slug ? g.a : g.h; (+me[2] > +op[2]) ? w++ : l++ }
  const record = games.length ? `${w}-${l}` : (recordOf(name) || "0-0");
  const confRec = row && !standingsStale ? `${row["Conference W"]}-${row["Conference L"]} in ${conf}` : "";
  const tc = teamColorFor(slug);
  box.style.setProperty("--tc", tc || "var(--ball)");
  const head = `<button class="closebtn tback" data-teamback>← All teams</button>
    <div class="thead">${mono(name, slug, null, "lg")}<div><div class="eyebrow">${esc(conf || "Division I")}</div><h1>${r ? `<span class="rkb">#${r}</span> ` : ""}${esc(name)}</h1>
    <div class="tmeta"><span><b>${esc(record)}</b> overall</span>${confRec ? `<span>${esc(confRec)}</span>` : ""}${r ? `<span>AP No. ${r}</span>` : ""}</div></div><button class="followbtn ${isFav(slug) ? "on" : ""}" data-fav="${esc(slug)}" aria-pressed="${isFav(slug)}">${STAR(isFav(slug))}${isFav(slug) ? "Following" : "Follow"}</button></div>
    <div class="days ttabs" role="tablist">${[["schedule", "Schedule"], ["stats", "Team stats"], ["players", "Players"]].map(([k, t]) => `<button role="tab" data-teamtab="${k}" aria-pressed="${teamTab === k}">${t}</button>`).join("")}</div>`;
  let body = "";
  if (T.err) body = `<p class="empty">The schedule couldn't load. Try again in a minute.</p>`;
  else if (!T.games) body = `<p class="empty">Loading the season schedule… The first visit to a team can take a few seconds.</p>`;
  else if (teamTab === "schedule") body = scheduleHTML(slug, games, T);
  else {
    const finals = games.filter(g => g.s === "final").length, have = finals ? Object.keys(T.boxes).filter(id => games.some(g => g.id === id)).length : 0;
    const progress = finals && have < finals ? `<p class="note">Adding up ${have} of ${finals} games…</p>` : "";
    if (!finals) body = `<p class="empty">Season stats appear after ${esc(name)}'s first game.</p>`;
    else body = progress + (teamTab === "stats" ? teamStatsHTML(slug) : playersHTML(slug));
  }
  box.innerHTML = head + `<div class="tbody">${body}</div>`;
}
function scheduleHTML(slug, games, T) {
  if (!games.length) return `<p class="empty">No games found yet for this season.</p>`;
  const rows = games.map(g => {
    const home = g.h[0] === slug, me = home ? g.h : g.a, op = home ? g.a : g.h;
    const opName = op[1] || teamName(op[0]), opRank = op[3] || rk({ names: { short: opName } });
    let res;
    if (g.s === "final") { const won = +me[2] > +op[2]; res = `<span class="${won ? "in" : "out"}"><b>${won ? "W" : "L"}</b> ${esc(me[2])}–${esc(op[2])}${/OT/i.test(g.f) ? ` <small>${esc(g.f.replace(/^FINAL\s*/i, "").replace(/[()]/g, ""))}</small>` : ""}</span>` }
    else if (g.s === "live") res = `<span class="live-txt"><span class="dot"></span>${esc(me[2])}–${esc(op[2])} · ${esc(g.p)} ${esc(g.c)}</span>`;
    else res = `<span class="muted">${g.t ? new Date(g.t * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "TBA"}${g.n ? " · " + esc(g.n) : ""}</span>`;
    const open = T.openBox === g.id;
    return `<tr class="${g.s !== "pre" ? "click" : ""} ${open ? "sel" : ""}" ${g.s !== "pre" ? `data-teambox="${g.id}"` : ""}><td class="sdate">${shortDate(g.d)}</td><td class="svs">${home ? "vs" : "at"}</td><td><span class="tm">${mono(opName, op[0])}<span>${opRank ? `<span class="rkb">${opRank}</span>` : ""}${esc(opName)}</span></span></td><td class="num sres">${res}</td></tr>
      ${open ? `<tr class="sbox"><td colspan="4">${gameBoxHTML(slug, g, T)}</td></tr>` : ""}`;
  }).join("");
  return `${T.partial ? `<p class="note">Some dates couldn't load. The full schedule will fill in shortly.</p>` : ""}<div class="tblwrap"><table class="rk-table sched"><thead><tr><th>Date</th><th></th><th>Opponent</th><th class="num">Result</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function gameBoxHTML(slug, g, T) {
  const b = T.boxes[g.id];
  if (b === undefined) return `<p class="note">Loading box score…</p>`;
  if (!b) return `<p class="note">No box score for this game.</p>`;
  const me = (b.teams || []).find(t => t.seoname === slug), sideId = T.boxSide?.[g.id] || me?.teamId;
  const teams = b.teams || [], tb = (b.teamBoxscore || []).find(x => String(x.teamId) === String(sideId));
  const ps = tb?.playerStats || [];
  const row = p => `<tr><td><span class="pn">${esc(p.number)}</span> ${esc(fix(`${p.firstName} ${p.lastName}`))} <span class="pp">${esc(p.position || "")}</span></td><td class="num">${esc(p.minutesPlayed ?? "")}</td><td class="num"><b>${esc(p.points)}</b></td><td class="num">${esc(p.totalRebounds)}</td><td class="num">${esc(p.assists)}</td><td class="num">${esc(p.fieldGoalsMade)}-${esc(p.fieldGoalsAttempted)}</td><td class="num">${esc(p.threePointsMade)}-${esc(p.threePointsAttempted)}</td><td class="num">${esc(p.freeThrowsMade)}-${esc(p.freeThrowsAttempted)}</td></tr>`;
  return `<div class="boxhead"><span class="note">${esc(shortDate(g.d))}</span><div class="days" role="group" aria-label="Team">${teams.map(t => `<button data-teamboxside="${esc(t.teamId)}" data-game-id="${g.id}" aria-pressed="${String(t.teamId) === String(sideId)}">${esc(fix(t.nameShort))}</button>`).join("")}</div></div>
    <div class="tblwrap"><table class="box"><thead><tr><th>Player</th><th class="num">Min</th><th class="num">Pts</th><th class="num">Reb</th><th class="num">Ast</th><th class="num">FG</th><th class="num">3PT</th><th class="num">FT</th></tr></thead><tbody>${ps.map(row).join("")}</tbody></table></div>`;
}
function teamStatsHTML(slug) {
  const { games, team: t, opp: o } = seasonStats(slug);
  const rows = [
    ["Points per game", per(t.pts, games), per(o.pts, games)],
    ["Field goal %", pctOf(t.fgm, t.fga), pctOf(o.fgm, o.fga)],
    ["Field goals made–attempted", `${per(t.fgm, games)}–${per(t.fga, games)}`, `${per(o.fgm, games)}–${per(o.fga, games)}`],
    ["3-point %", pctOf(t.tpm, t.tpa), pctOf(o.tpm, o.tpa)],
    ["3-pointers made–attempted", `${per(t.tpm, games)}–${per(t.tpa, games)}`, `${per(o.tpm, games)}–${per(o.tpa, games)}`],
    ["Free throw %", pctOf(t.ftm, t.fta), pctOf(o.ftm, o.fta)],
    ["Rebounds per game", per(t.reb, games), per(o.reb, games)],
    ["Offensive rebounds", per(t.oreb, games), per(o.oreb, games)],
    ["Assists per game", per(t.ast, games), per(o.ast, games)],
    ["Steals per game", per(t.stl, games), per(o.stl, games)],
    ["Blocks per game", per(t.blk, games), per(o.blk, games)],
    ["Turnovers per game", per(t.to, games), per(o.to, games)],
    ["Fouls per game", per(t.pf, games), per(o.pf, games)],
  ];
  const margin = games ? ((t.pts - o.pts) / games).toFixed(1) : "–";
  return `<div class="tsum"><div><strong>${per(t.pts, games)}</strong><span>Points per game</span></div><div><strong>${per(o.pts, games)}</strong><span>Allowed per game</span></div><div><strong>${margin > 0 ? "+" : ""}${margin}</strong><span>Average margin</span></div><div><strong>${games}</strong><span>Games played</span></div></div>
    <div class="tblwrap"><table class="rk-table tstats"><thead><tr><th>Per game</th><th class="num">${esc(teamName(slug))}</th><th class="num">Opponents</th></tr></thead><tbody>${rows.map(([k, a, b]) => `<tr><td>${k}</td><td class="num"><b>${a}</b></td><td class="num">${b}</td></tr>`).join("")}</tbody></table></div>`;
}
function playersHTML(slug) {
  const { players } = seasonStats(slug);
  const cols = [
    ["gp", "GP", p => p.gp], ["gs", "GS", p => p.gs], ["mpg", "Min", p => p.min / p.gp], ["ppg", "Pts", p => p.pts / p.gp],
    ["rpg", "Reb", p => p.reb / p.gp], ["apg", "Ast", p => p.ast / p.gp], ["spg", "Stl", p => p.stl / p.gp], ["bpg", "Blk", p => p.blk / p.gp],
    ["tpg", "TO", p => p.to / p.gp], ["fg", "FG%", p => p.fga ? p.fgm / p.fga : -1], ["tp", "3P%", p => p.tpa ? p.tpm / p.tpa : -1], ["ft", "FT%", p => p.fta ? p.ftm / p.fta : -1]
  ];
  const col = cols.find(c => c[0] === playerSort) || cols[3];
  const list = players.filter(p => p.gp).sort((a, b) => col[2](b) - col[2](a));
  if (!list.length) return `<p class="empty">No player stats yet.</p>`;
  const fmt = (k, p) => ({ gp: p.gp, gs: p.gs, fg: pctOf(p.fgm, p.fga), tp: pctOf(p.tpm, p.tpa), ft: pctOf(p.ftm, p.fta) }[k] ?? (cols.find(c => c[0] === k)[2](p)).toFixed(1));
  return `<p class="note">Per-game averages. Tap a column to sort.</p><div class="tblwrap"><table class="box pstats"><thead><tr><th>Player</th>${cols.map(([k, t]) => `<th class="num"><button class="sortbtn ${k === col[0] ? "on" : ""}" data-psort="${k}">${t}</button></th>`).join("")}</tr></thead><tbody>
    ${list.map(p => `<tr><td><span class="pn">${esc(p.num ?? "")}</span> ${esc(p.name)} <span class="pp">${esc(p.pos)}</span></td>${cols.map(([k]) => `<td class="num ${k === col[0] ? "srt" : ""}">${fmt(k, p)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
document.addEventListener("click", async e => {
  const t = e.target;
  const row = t.closest("[data-teamslug]"); if (row) { location.hash = "team-" + row.dataset.teamslug; return }
  if (t.closest("[data-teamback]")) { location.hash = "teams"; return }
  const tab = t.closest("[data-teamtab]"); if (tab) { teamTab = tab.dataset.teamtab; drawTeam(); return }
  const ps = t.closest("[data-psort]"); if (ps) { playerSort = ps.dataset.psort; drawTeam(); return }
  const side = t.closest("[data-teamboxside]"); if (side) { const T = TEAMDATA[teamOpen]; (T.boxSide || (T.boxSide = {}))[side.dataset.gameId] = side.dataset.teamboxside; drawTeam(); return }
  const bx = t.closest("[data-teambox]"); if (bx) {
    const T = TEAMDATA[teamOpen], id = bx.dataset.teambox;
    T.openBox = T.openBox === id ? null : id; drawTeam();
    if (T.openBox && T.boxes[id] === undefined) {
      const g = T.games.find(x => x.id === id);
      try { T.boxes[id] = await api(`game/${id}/boxscore${g?.s === "final" ? "?final=1" : ""}`) } catch { T.boxes[id] = null }
      drawTeam();
    }
  }
});

// ---------- tabs ----------
const VIEWS = ["scores", "news", "rankings", "standings", "stats", "teams", "discord", "rules"];
const loaded = {};
function show(v) {
  if (!VIEWS.includes(v)) v = "scores";
  document.querySelectorAll(".view").forEach(el => el.hidden = el.dataset.view !== v);
  document.querySelectorAll("[data-tab]").forEach(a => a.dataset.tab === v ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  if (v === "news") drawNews(); // coming back to News always starts on the list of stories
  if (v === "discord") loadDiscord();
  if (v === "stats") loadStatCats();
  if (v === "teams" || v.startsWith("team-")) loadSeason().catch(() => { }); // get schedules ready before a team is tapped
  if (v === "rankings" && !loaded.ao) { loaded.ao = 1; loadApOthers() }
  if (v === "rankings" && !loaded.rk) { loaded.rk = 1; loadRankings() }
  if ((v === "standings" || v === "teams") && !loaded.st) { loaded.st = 1; loadStandings() }
  scrollTo(0, 0);
}
const route = () => {
  const h = (location.hash || "#scores").slice(1), m = /^team-([a-z0-9-]{1,60})$/.exec(h);
  if (m) { show("teams"); openTeam(m[1]); document.querySelector('[data-tab="teams"]')?.setAttribute("aria-current", "page") }
  else { show(h); if (h === "teams") closeTeam() }
};
addEventListener("hashchange", route);

// Switching filters closes whatever game is open.
function closeGame() { if (!openGame) return; openGame = null; gameDetail = null; drawGame() }

// ---------- Discord tab ----------
// What each channel is for, shown in the Discord-style preview when someone taps it.
const DC_CH = {
  "welcome": ["Start here", "Rules, roles, and how the server works."],
  "announcements": ["News from @collegebasketball", "New posts from @collegebasketball and site updates."],
  "feedback-and-suggestions": ["Help shape the server", "Ideas for the server or the site. We read every one."],
  "team-flairs": ["Rep your team", "Pick your team's flair so everyone knows who you root for."],
  "general-chat": ["Everything college hoops", "Everything college hoops: games, takes, and the Top 25."],
  "high-school-hoops": ["The next wave", "Recruits, rankings, and the next wave of college stars."],
  "transfer-portal": ["Who's moving where", "Commitments and rumors as they happen."],
  "coaching-carousel": ["Hot seats and new hires", "Hirings, firings, and who's on the hot seat."],
  "international-hoops": ["Hoops worldwide", "Prospects and players from overseas."],
  "nil": ["Name, image, likeness", "NIL deals, collectives, and what they mean for rosters."],
  "illinois": ["Illini fans", "Everything Illinois basketball. Every team has its own room."],
  "indiana": ["Hoosier fans", "Everything Indiana basketball. Every team has its own room."],
};
function pickChannel(ch, scroll) {
  const d = DC_CH[ch]; if (!d) return;
  document.querySelectorAll(".dcw-list button").forEach(b => b.classList.toggle("on", b.dataset.dch === ch));
  $("#dcw-t").textContent = "# " + ch; $("#dcw-s").textContent = d[0];
  $("#dcw-h").textContent = "#" + ch; $("#dcw-d").textContent = d[1]; $("#dcw-m").textContent = "Message #" + ch;
  const box = $(".dcw-empty"); box.classList.remove("swap"); void box.offsetWidth; box.classList.add("swap");
  if (scroll) $(".dcw").scrollIntoView({ behavior: "smooth", block: "center" });
}
// Live member and online counts come from the server's public invite (through the relay, refreshed every few minutes).
let dcLoaded = 0;
async function loadDiscord() {
  if (Date.now() - dcLoaded < 5 * 60e3) return;
  dcLoaded = Date.now();
  try {
    const d = await api("discord-invite", 2);
    if (!d.members) return;
    $("#dconline").textContent = (+d.online || 0).toLocaleString();
    $("#dcmembers").textContent = (+d.members).toLocaleString();
    if (d.name) $("#dcname").textContent = d.name;
    $("#dclive").hidden = false;
  } catch { dcLoaded = 0 }
}
document.addEventListener("click", e => {
  const c = e.target.closest && e.target.closest("[data-dch]"); if (!c) return;
  pickChannel(c.dataset.dch, c.classList.contains("chan"));
});

// ---------- events ----------
// "Watch" chips on game cards: open the network's site and don't open the game
function openWatch(e) {
  const w = e.target.closest && e.target.closest("[data-watch]"); if (!w) return;
  if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault(); e.stopPropagation(); window.open(w.dataset.watch, "_blank", "noopener");
}
window.addEventListener("click", openWatch, true);
// stars, "today" tags and the conference bar on the Teams tab
function teamDirClick(e) {
  if (!e.target.closest) return;
  if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
  const f = e.target.closest("[data-fav]");
  if (f) { e.preventDefault(); e.stopPropagation(); toggleFav(f.dataset.fav); return }
  const tg = e.target.closest("[data-tgame]");
  if (tg) { e.preventDefault(); e.stopPropagation(); goGame(tg.dataset.tgame); return }
  if (e.type !== "click") return;
  const j = e.target.closest("[data-tjump]");
  if (j) { e.preventDefault(); const sec = document.getElementById(j.dataset.tjump); if (sec) window.scrollTo({ top: sec.getBoundingClientRect().top + scrollY - ($("header.nav").offsetHeight + $("#tbar").offsetHeight + 8), behavior: "smooth" }); return }
  const so = e.target.closest("[data-tsort]");
  if (so) { teamSort = so.dataset.tsort; document.querySelectorAll("[data-tsort]").forEach(b => b.setAttribute("aria-pressed", b === so)); drawTeamDir() }
}
window.addEventListener("click", teamDirClick, true);
window.addEventListener("keydown", teamDirClick, true);
// keep the sticky conference bar just under the header (the header is taller on phones)
function setNavH() { const h = document.querySelector("header.nav"); if (h) document.documentElement.style.setProperty("--navh", h.offsetHeight + "px") }
window.addEventListener("resize", setNavH); setNavH();
window.addEventListener("keydown", openWatch, true);
document.addEventListener("click", async e => {
  const t = e.target;
  const d = t.closest("[data-day]"); if (d) {
    gday = d.dataset.day; openGame = null; gameDetail = null; drawDays(); drawGame();
    if (!cache[gday] || gday !== "t") { $("#games").innerHTML = `<div class="empty">Loading games…</div>`; try { await loadDay(gday) } catch { $("#games").innerHTML = `<div class="empty">Games couldn't load. Try again.</div>`; return } }
    drawFilters(); drawGames(); return;
  }
  const f = t.closest("[data-gf]"); if (f) { gfilt = f.dataset.gf; gconf = ""; closeGame(); drawFilters(); drawGames(); return }
  const cf = t.closest("[data-conf-f]"); if (cf) { gconf = cf.dataset.confF; gfilt = "All"; closeGame(); drawFilters(); drawGames(); return }
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
$("#tq").addEventListener("input", e => { teamQuery = e.target.value; drawTeamDir() });
$("#q").addEventListener("input", e => {
  query = e.target.value;
  // close the open game if it no longer matches the search
  if (openGame && cache[gday] && !filtered(cache[gday]).some(g => g.gameID === openGame)) closeGame();
  drawGames();
});

// ---------- start ----------
drawDays(); drawGames(); drawNews(); drawInstagram(); route();
if (!loaded.rk) { loaded.rk = 1; loadRankings() } // AP ranks are also used on Scores and Standings
loadRecords(); setInterval(loadRecords, 3600000);
refresh();
setInterval(() => { if (!document.hidden) refresh() }, REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh() });
})();
