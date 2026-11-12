// College Basketball — live site
// Data: the free ncaa-api (https://github.com/henrygd/ncaa-api), reached through /api/ncaa (see api/ncaa.js).
(() => {
"use strict";

// ---------- setup ----------
const API = window.API_BASE !== undefined ? window.API_BASE : "/api/ncaa?path=";
const REFRESH_MS = 10000;
const LIVE_GAME_MS = 4000; // an open live game checks for new plays this often
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
const DAYS = Array.from({ length: 11 }, (_, i) => { const off = i - 4; return { k: off === -1 ? "y" : off === 0 ? "t" : off === 1 ? "m" : "d" + off, label: off === 0 ? "Today" : off === -1 ? "Yesterday" : off === 1 ? "Tomorrow" : "", off } });

// ---------- state ----------
let gday = "t", gfilt = (() => { try { return localStorage.getItem("cbb_gfilt") || "AP Top 25" } catch { return "AP Top 25" } })(), gconf = "", query = "", openGame = null, boxSide = "away";
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
  if (noFeed(g)) return { cls: "nofeed", txt: "Underway · no live stats" };
  if (ep) return { cls: "", txt: new Date(ep * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) };
  return { cls: "", txt: g.startTime || "TBA" };
}
const isLive = g => g.gameState === "live";
// The NCAA doesn't keep live stats for every game (often smaller streaming-only games). Those stay "not started"
// in its feed until the final is posted, so once tip-off is 20+ minutes past we say so instead of showing a tip time.
const noFeed = g => g.gameState === "pre" && +g.startTimeEpoch > 0 && Date.now() > (+g.startTimeEpoch + 20 * 60) * 1000 && !/postponed|canceled|cancelled|delayed/i.test(g.finalMessage || "");
const clockSecs = c => { const m = /^(\d+):(\d+)/.exec(String(c || "")); return m ? +m[1] * 60 + +m[2] : 9999 };
const rk = t => +(t.rank || apRank(t.names.short) || 0);
const BUZZ = {}; const buzzAsked = new Set();
// The team that's ahead is unranked against a ranked team (or ranked 10+ spots lower).
function underdogLeads(g) {
  const a = +g.away.score || 0, h = +g.home.score || 0, ra = rk(g.away), rh = rk(g.home);
  const leader = a > h ? "away" : h > a ? "home" : "";
  if (!leader) return false;
  const lr = leader === "away" ? ra : rh, tr = leader === "away" ? rh : ra;
  return !!tr && (!lr || lr - tr >= 10);
}
// Upset Watch: an underdog is leading in the second half or overtime
const upsetWatch = g => g.gameState === "live" && /2nd|OT/i.test(String(g.currentPeriod || "")) && underdogLeads(g);
// Crunch time: within 5 points in the last 5 minutes, or in overtime
function crunch(g) {
  if (g.gameState !== "live") return false;
  const per = String(g.currentPeriod || ""), m = Math.abs((+g.away.score || 0) - (+g.home.score || 0));
  return m <= 5 && (/OT/i.test(per) || (/2nd/i.test(per) && clockSecs(g.contestClock) <= 300));
}
function badges(g) {
  const out = [], a = +g.away.score || 0, h = +g.home.score || 0, margin = Math.abs(a - h);
  const per = String(g.currentPeriod || ""), fm = String(g.finalMessage || "");
  const ot = /OT/i.test(per) || /OT/i.test(fm);
  const upset = underdogLeads(g);
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
    .sort((x, y) => ((favGame(y) ? 1 : 0) - (favGame(x) ? 1 : 0)) || ({ live: 0, pre: 1, final: 2 }[x.gameState] - { live: 0, pre: 1, final: 2 }[y.gameState]) || (+x.startTimeEpoch - +y.startTimeEpoch) || ((rankOf(y.home) || rankOf(y.away) ? 1 : 0) - (rankOf(x.home) || rankOf(x.away) ? 1 : 0)));
}
function trow(g, side) {
  const t = g[side], other = g[side === "home" ? "away" : "home"];
  const lose = g.gameState === "final" && +t.score < +other.score;
  const slug = logoSlug(t.names.short, t.names.seo), tc = teamColorFor(slug);
  return `<div class="trow ${lose ? "lose" : ""}" data-slug="${esc(slug)}"${tc ? ` style="--tc:${tc}"` : ""}>${mono(t.names.short, t.names.seo)}<span class="nm">${rankBadge(t.rank || apRank(t.names.short))}${esc(fix(t.names.short))}${recTag(recordOf(t.names.short, g, side))}</span><span class="sc" data-sc="${g.gameID}-${side}">${g.gameState === "pre" ? "" : esc(t.score)}</span></div>`;
}
function drawDays() {
  const el = $("#days");
  el.innerHTML = DAYS.map(d => { const dt = new Date(Date.now() + d.off * 864e5), z = "America/New_York";
    const md = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: z }), wd = d.off === 0 ? "Today" : dt.toLocaleDateString("en-US", { weekday: "short", timeZone: z });
    return `<button aria-pressed="${d.k === gday}" data-day="${d.k}" class="${d.off === 0 ? "today" : ""}" aria-label="${esc(d.label || wd)} ${esc(md)}"><small>${esc(md)}</small>${esc(wd)}</button>` }).join("");
  const on = el.querySelector('[aria-pressed="true"]'); if (on) el.scrollLeft = on.offsetLeft - el.clientWidth / 2 + on.offsetWidth / 2;
}
function drawFilters() {
  const list = cache[gday] || [];
  const present = new Set(list.flatMap(g => [confOf(g.home), confOf(g.away)]).filter(c => CONF[c]));
  const confs = Object.keys(CONF).filter(c => present.has(c) || c === gconf).sort((a, b) => (P6.includes(b) - P6.includes(a)) || (P6.includes(a) ? P6.indexOf(a) - P6.indexOf(b) : CONF[a].localeCompare(CONF[b])));
  const lbl = { "AP Top 25": "T25", "Power 6": "P6", All: "All" };
  $("#gfilters").innerHTML = ["AP Top 25", "Power 6", "All"].map(o => `<button aria-pressed="${o === gfilt && !gconf}" data-gf="${o}" title="${o}">${lbl[o]}</button>`).join("")
    + confs.map(c => `<button aria-pressed="${c === gconf}" data-conf-f="${c}">${esc(CONF_SHORT[c] || CONF[c])}</button>`).join("");
  const head = $("#sbhead"); if (head) head.textContent = gconf ? (CONF[gconf] || "Games") : gfilt === "AP Top 25" ? "Top 25" : gfilt === "Power 6" ? "Power 6" : "All games";
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
  if (!all) { setCards(Array.from({ length: 8 }, () => SKEL_CARD)); drawMyBar(); return }
  const live = (cache.t || []).filter(isLive).length;
  $("#livecount").innerHTML = live ? `<span class="dot"></span>${live} game${live === 1 ? "" : "s"} live now` : `No games live right now`;
  let list = filtered(all);
  // Crunch Time: close games in the last five minutes jump to the top
  const hot = list.filter(crunch);
  list = [...hot, ...list.filter(g => !crunch(g))];
  drawCrunchHead(hot); drawUpsetStrip(); drawMyBar();
  { const pool = (cache.t || []).filter(g => g.gameState !== "final" && !noFeed(g)); GOTN_ID = pool.length ? pool.reduce((b, g) => heroScore(g) > heroScore(b) ? g : b).gameID : null }
  setCards(list.length ? list.map(g => {
    const st = status(g), sa = logoSlug(g.away.names.short, g.away.names.seo), sh = logoSlug(g.home.names.short, g.home.names.seo);
    const cls = ["game", openGame === g.gameID ? "sel" : "", favGame(g) ? "fav" : "", crunch(g) ? "crunch" : "", upsetWatch(g) ? "upsetw" : ""].filter(Boolean).join(" ");
    return realCard(g, st, cls, sa, sh);
  }) : [`<div class="empty">${all.length ? `No ${gconf ? esc(CONF[gconf] || "") : gfilt === "AP Top 25" ? "Top 25" : gfilt === "Power 6" ? "Power 6" : ""} games on this day. <button class="rlink" type="button" data-gf="All">Show all ${all.length} games →</button>` : "No Division I games scheduled for this day."}</div>`]);
}
function drawCrunchHead(hot) {
  const el = $("#crunchhead"); if (!el) return;
  el.hidden = !hot.length;
  if (hot.length) el.innerHTML = `<span class="ch-fire" aria-hidden="true">🔥</span><b>Crunch time</b><span>${hot.length} game${hot.length === 1 ? "" : "s"} within 5 in the final 5:00${hot.some(g => /OT/i.test(String(g.currentPeriod))) ? " or overtime" : ""}. They're first below.</span>`;
}
function drawUpsetStrip() {
  const el = $("#upsetstrip"); if (!el) return;
  const list = (cache.t || []).filter(upsetWatch).sort((a, b) => Math.min(rk(a.home) || 99, rk(a.away) || 99) - Math.min(rk(b.home) || 99, rk(b.away) || 99)).slice(0, 3);
  el.hidden = !list.length;
  el.innerHTML = list.map(g => {
    const st = status(g), dog = (+g.away.score || 0) > (+g.home.score || 0) ? g.away : g.home, fav = dog === g.away ? g.home : g.away;
    const nm = t => `${rk(t) ? `<span class="rkb">${rk(t)}</span>` : ""}${esc(fix(t.names.short))}`;
    return `<div class="uw" role="button" tabindex="0" data-game="${g.gameID}" data-day-of="t" title="Open this game">
      <span class="uw-tag"><span class="uw-siren" aria-hidden="true">🚨</span>Upset watch</span>
      <span class="uw-score"><b>${nm(dog)} ${esc(dog.score)}</b><span>,</span> ${nm(fav)} ${esc(fav.score)}</span>
      <span class="uw-st">${esc(st.txt)}</span>${tvHTML(g.network)}<span class="uw-go">Open →</span></div>`;
  }).join("");
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

// ---------- Pick'em and chat activity (Supabase) ----------
// Totals come from two public database functions (see picks-setup.sql); your own picks need your account.
const PICKCT = {}, MYPICK = {}, CHATACT = {};
let socialOn = !!(window.CHAT_CONFIG?.url && (window.CHAT_CONFIG?.anonKey || "").length > 20), socialAt = 0, pendingPick = null;
async function rpc(fn, body) {
  const c = window.CHAT_CONFIG;
  const r = await fetch(`${c.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: c.anonKey, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (r.status === 404) { socialOn = false; throw new Error("not set up") } // picks-setup.sql hasn't been run yet
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
async function loadSocial(force) {
  if (!socialOn || (!force && Date.now() - socialAt < 55e3)) return;
  socialAt = Date.now();
  const ids = [...new Set([...(cache.t || []), ...(cache[gday] || [])].map(g => g.gameID))].slice(0, 400);
  if (!ids.length) return;
  try {
    const [pc, ca] = await Promise.all([rpc("pick_counts", { ids }), rpc("chat_activity", { ids, mins: 30 })]);
    for (const id of ids) { delete PICKCT[id]; delete CHATACT[id] }
    for (const x of pc || []) PICKCT[x.game_id] = { home: +x.home || 0, away: +x.away || 0 };
    for (const x of ca || []) CHATACT[x.game_id] = { people: +x.people || 0, msgs: +x.msgs || 0 };
    await loadMyPicks(ids);
    drawGames(); if (openGame) drawGame();
  } catch { }
}
async function loadMyPicks(ids) {
  const chat = window.CBBChat; if (!chat?.on || !chat.hasSession()) return;
  try {
    const sb = await chat.client(); if (!chat.me()) return;
    const { data } = await sb.from("picks").select("game_id, side").in("game_id", ids || Object.keys(PICKCT));
    for (const x of data || []) MYPICK[x.game_id] = x.side;
  } catch { }
}
window.addEventListener("cbb-auth", async () => {
  if (!window.CBBChat?.me()) { for (const k in MYPICK) delete MYPICK[k]; if (openGame) drawGame(); return }
  await loadMyPicks([...new Set([...(cache.t || []), ...(cache[gday] || [])].map(g => g.gameID))]);
  if (pendingPick) { const p = pendingPick; pendingPick = null; makePick(p.id, p.side) } else if (openGame) drawGame();
});
const pickLocked = g => g.gameState !== "pre" || (+g.startTimeEpoch && Date.now() >= +g.startTimeEpoch * 1000);
async function makePick(id, side) {
  const chat = window.CBBChat, g = Object.values(cache).flat().find(x => x.gameID === id);
  if (!g || pickLocked(g) || !chat?.on) return;
  if (!chat.me()) {
    pendingPick = { id, side };
    chat.auth(chat.hasSession() ? "login" : "signup", "Make your picks with a free account. It's the same account as the game chat.");
    return;
  }
  const prev = MYPICK[id], ct = PICKCT[id] || (PICKCT[id] = { home: 0, away: 0 });
  if (prev === side) return;
  if (prev) ct[prev] = Math.max(0, ct[prev] - 1);
  ct[side]++; MYPICK[id] = side; drawGame(); drawGames();
  try {
    const sb = await chat.client();
    const { error } = await sb.from("picks").upsert({ game_id: id, side, locks_at: new Date(+g.startTimeEpoch * 1000).toISOString() }, { onConflict: "game_id,user_id" });
    if (error) throw error;
  } catch {
    ct[side]--; if (prev) { ct[prev]++; MYPICK[id] = prev } else delete MYPICK[id];
    drawGame(); drawGames();
    document.querySelectorAll(".pk-msg").forEach(m => { m.textContent = "That pick didn't save. Try again." });
  }
}
// The small line at the bottom of a game card: people chatting and the fans' pick
function socialHTML(g) {
  const out = [], ca = CHATACT[g.gameID], pc = PICKCT[g.gameID];
  if (ca && ca.people) out.push(`<span class="soc talk"><i aria-hidden="true">💬</i>${ca.people} talking</span>`);
  const n = pc ? pc.home + pc.away : 0;
  if (n) {
    const side = pc.home >= pc.away ? "home" : "away", pct = Math.round(pc[side] / n * 100);
    out.push(`<span class="soc pick"><i aria-hidden="true">🗳️</i>${pct}% ${esc(fix(g[side].names.short))}</span>`);
  }
  return out.length ? `<div class="socials">${out.join("")}</div>` : "";
}
// Pick'em block in the open game
function pickHTML(g) {
  if (!socialOn || !window.CBBChat?.on || !+g.startTimeEpoch) return "";
  const locked = pickLocked(g), mine = MYPICK[g.gameID], ct = PICKCT[g.gameID] || { home: 0, away: 0 }, n = ct.home + ct.away;
  const pa = n ? Math.round(ct.away / n * 100) : 50, ph = n ? 100 - pa : 50;
  const nm = t => esc(fix(t.names.short)), sa = logoSlug(g.away.names.short, g.away.names.seo), sh = logoSlug(g.home.names.short, g.home.names.seo);
  const btn = (sd, t, slug) => `<button class="pk-btn ${mine === sd ? "on" : ""}" data-pick="${sd}" data-pickgame="${g.gameID}" ${locked ? "disabled" : ""} style="--tc:${teamColorFor(slug) || "#555"}">${mono(t.names.short, t.names.seo)}<span>${nm(t)}</span>${mine === sd ? "<em>Your pick</em>" : ""}</button>`;
  const bar = (n || mine) ? `<div class="pk-bar" style="--ca:${teamColorFor(sa) || "#555"};--ch:${teamColorFor(sh) || "#777"}"><span style="width:${pa}%"><b>${pa}%</b></span><span style="width:${ph}%"><b>${ph}%</b></span></div>` : "";
  let note;
  if (g.gameState === "final" && mine) {
    const won = (+g.home.score > +g.away.score ? "home" : "away") === mine;
    note = won ? "✅ You called it." : "❌ Not this time.";
  } else if (locked) note = mine ? `Picks are locked. You picked ${nm(g[mine])}.` : "Picks are locked for this game.";
  else note = mine ? "You can change your pick until tip-off." : "Tap a team. Picks lock at tip-off.";
  return `<div class="pk"><div class="pk-head"><b>${locked ? "Fans picked" : "Who wins?"}</b><span>${n} pick${n === 1 ? "" : "s"}<a class="pk-lb" href="#pickem">🏆 Leaderboard</a></span></div>
    ${locked && !mine && !n ? "" : `<div class="pk-row">${btn("away", g.away, sa)}${btn("home", g.home, sh)}</div>`}${bar}<p class="pk-msg">${note}</p></div>`;
}

// ---------- Share cards ----------
// Makes an Instagram-story-sized picture (1080×1920) of a final score, to share or save.
function loadImg(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src });
}
function hexRGB(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); const n = m ? parseInt(m[1], 16) : 0x333333; return [n >> 16, (n >> 8) & 255, n & 255] }
async function makeShareCard(g) {
  try { await Promise.all(['900 120px "Big Shoulders Display"', '800 60px "Big Shoulders Display"', '600 40px Barlow', '700 40px Barlow', '500 30px "IBM Plex Mono"'].map(f => document.fonts.load(f))) } catch { }
  const W = 1080, H = 1920, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const sa = logoSlug(g.away.names.short, g.away.names.seo), sh = logoSlug(g.home.names.short, g.home.names.seo);
  const ca = teamColorFor(sa) || "#444444", ch = teamColorFor(sh) || "#666666";
  const a = +g.away.score || 0, h = +g.home.score || 0, awayWon = a > h;
  const [la, lh, brand] = await Promise.all([loadImg(logoURL(sa)), loadImg(logoURL(sh)), loadImg("logo.png")]);
  // background: dark, with each team's color glowing from its half
  x.fillStyle = "#0B0B0C"; x.fillRect(0, 0, W, H);
  const glow = (col, y) => { const [r, gg, b] = hexRGB(col); const gr = x.createRadialGradient(W / 2, y, 40, W / 2, y, 900); gr.addColorStop(0, `rgba(${r},${gg},${b},.55)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`); x.fillStyle = gr; x.fillRect(0, 0, W, H) };
  glow(ca, 560); glow(ch, 1360);
  // basketball seams
  x.strokeStyle = "rgba(255,255,255,.06)"; x.lineWidth = 6;
  x.beginPath(); x.arc(W / 2, H / 2, 700, 0, Math.PI * 2); x.stroke();
  // header
  x.textAlign = "center"; x.fillStyle = "#FF6A13"; x.font = '500 34px "IBM Plex Mono", monospace';
  const day = new Date((+g.startTimeEpoch || Date.now() / 1000) * 1000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  x.fillText(day, W / 2, 170);
  x.fillStyle = "#F5F5F2"; x.font = '900 150px "Big Shoulders Display", Impact, sans-serif'; x.fillText(String(status(g).txt).toUpperCase(), W / 2, 320);
  const tags = badges(g).map(b => b[1].toUpperCase()).filter(t => !/BLOWOUT/.test(t)).slice(0, 2);
  if (tags.length) {
    x.font = '800 44px "Big Shoulders Display", Impact, sans-serif';
    const t = tags.join("  ·  "), w = x.measureText(t).width + 60;
    x.fillStyle = tags.some(t => /UPSET/.test(t)) ? "#FFD23F" : "#FF6A13"; roundRect(x, W / 2 - w / 2, 352, w, 70, 12); x.fill();
    x.fillStyle = "#0B0B0C"; x.fillText(t, W / 2, 404);
  }
  // one team per half: logo, name, score
  const block = (t, logo, score, won, y) => {
    x.globalAlpha = won ? 1 : .55;
    if (logo) { const s = 300, r = Math.min(s / logo.width, s / logo.height) || 1, w = (logo.width || s) * r, hh = (logo.height || s) * r; x.drawImage(logo, 90 + (s - w) / 2, y + (s - hh) / 2, w, hh) }
    x.textAlign = "left"; x.fillStyle = "#F5F5F2";
    const rnk = rk(t); let nx = 430;
    if (rnk) { x.font = '900 70px "Big Shoulders Display", Impact, sans-serif'; x.fillStyle = "#FF6A13"; x.fillText(String(rnk), nx, y + 130); nx += x.measureText(String(rnk)).width + 18; x.fillStyle = "#F5F5F2" }
    let size = 96; const name = fix(t.names.short).toUpperCase();
    do { x.font = `900 ${size}px "Big Shoulders Display", Impact, sans-serif`; size -= 4 } while (x.measureText(name).width > W - nx - 70 && size > 40);
    x.fillText(name, nx, y + 130);
    x.font = '900 220px "Big Shoulders Display", Impact, sans-serif'; x.fillText(String(score), 430, y + 330);
    if (won) { x.fillStyle = "#FF6A13"; x.beginPath(); x.moveTo(400, y + 260); x.lineTo(370, y + 240); x.lineTo(370, y + 280); x.fill() }
    x.globalAlpha = 1;
  };
  block(g.away, la, a, awayWon, 520);
  x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 3; x.beginPath(); x.moveTo(90, 960); x.lineTo(W - 90, 960); x.stroke();
  block(g.home, lh, h, !awayWon, 1010);
  // footer: brand
  x.fillStyle = "rgba(255,255,255,.08)"; roundRect(x, 90, 1600, W - 180, 170, 28); x.fill();
  if (brand) {
    const t = document.createElement("canvas"); t.width = t.height = 120; const tx = t.getContext("2d");
    tx.drawImage(brand, 0, 0, 120, 120); tx.globalCompositeOperation = "source-in"; tx.fillStyle = "#F5F5F2"; tx.fillRect(0, 0, 120, 120);
    x.drawImage(t, 130, 1625, 120, 120);
  }
  x.textAlign = "left"; x.fillStyle = "#F5F5F2";
  let fs = 64; do { x.font = `900 ${fs}px "Big Shoulders Display", Impact, sans-serif`; fs -= 2 } while (x.measureText("@COLLEGEBASKETBALL").width > W - 90 - 280 - 30 && fs > 30);
  x.fillText("@COLLEGEBASKETBALL", 280, 1690);
  x.fillStyle = "#9C9C98"; x.font = '500 30px "IBM Plex Mono", monospace'; x.fillText(location.host || "collegebasketball.news", 282, 1738);
  return c;
}
function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath() }
let shareModal = null;
async function shareFinal(id) {
  const g = Object.values(cache).flat().find(x => x.gameID === id); if (!g) return;
  const name = `${fix(g.away.names.short)}-${fix(g.home.names.short)}-final`.replace(/[^A-Za-z0-9-]+/g, "-").toLowerCase() + ".png";
  openShare("Share this final", () => makeShareCard(g), name, `Final score image: ${fix(g.away.names.short)} ${g.away.score}, ${fix(g.home.names.short)} ${g.home.score}`, "Final score");
}
// a share/save sheet for any picture the site makes
async function openShare(title, make, name, alt, shareTitle, link) {
  if (!shareModal) {
    shareModal = document.createElement("div"); shareModal.className = "modal sharemodal"; shareModal.hidden = true;
    document.body.appendChild(shareModal);
    shareModal.addEventListener("click", e => { if (e.target === shareModal || e.target.closest("[data-shareclose]")) shareModal.hidden = true });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && shareModal && !shareModal.hidden) shareModal.hidden = true });
  }
  shareModal.innerHTML = `<div class="modal-card share-card"><button class="modal-x" data-shareclose aria-label="Close">×</button><h2>${esc(title)}</h2><p class="share-wait">Making your image…</p></div>`;
  shareModal.hidden = false;
  const canvas = await make();
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob), file = new File([blob], name, { type: "image/png" });
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    shareModal.querySelector(".modal-card").innerHTML = `<button class="modal-x" data-shareclose aria-label="Close">×</button><h2>${esc(title)}</h2>
      <img class="share-img" src="${url}" alt="${esc(alt)}">
      <div class="share-actions">${canShare ? `<button class="chat-btn" data-sharego>Share</button>` : ""}<a class="chat-btn ${canShare ? "ghost" : ""}" href="${url}" download="${name}">Save image</a></div>
      ${link ? `<button class="share-link" data-copylink>🔗 Copy game link</button><p class="share-tip">Post it to your story, then add a <b>Link</b> sticker with the game link and put it under the arrow.</p>` : `<p class="share-tip">Post it to your story and tag <b>@collegebasketball</b>.</p>`}`;
    const copy = async () => { try { await navigator.clipboard.writeText(link); const b = shareModal.querySelector("[data-copylink]"); if (b) b.textContent = "✅ Link copied, paste it in a link sticker" } catch { const b = shareModal.querySelector("[data-copylink]"); if (b) b.textContent = link } };
    const cl = shareModal.querySelector("[data-copylink]"); if (cl) cl.onclick = copy;
    const go = shareModal.querySelector("[data-sharego]");
    if (go) go.onclick = () => { if (link) copy(); navigator.share({ files: [file], title: shareTitle, text: "via @collegebasketball" }).catch(() => { }) };
  }, "image/png");
}

// ---------- share a play ----------
// A story-sized picture (1080×1920) of one play: the headline, what happened, the score and the clock.
async function makePlayCard(g, p) {
  try { await Promise.all(['900 120px "Big Shoulders Display"', '800 60px "Big Shoulders Display"', '600 40px Barlow', '700 40px Barlow', '500 30px "IBM Plex Mono"'].map(f => document.fonts.load(f))) } catch { }
  const W = 1080, H = 1920, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const sa = logoSlug(g.away.names.short, g.away.names.seo), sh = logoSlug(g.home.names.short, g.home.names.seo);
  const ca = teamColorFor(sa) || "#444444", ch = teamColorFor(sh) || "#666666";
  const team = p.side ? g[p.side] : null, tc = p.side === "away" ? ca : p.side === "home" ? ch : "#FF6A13";
  const [la, lh, lt, brand] = await Promise.all([loadImg(logoURL(sa)), loadImg(logoURL(sh)), team ? loadImg(logoURL(p.side === "away" ? sa : sh)) : null, loadImg("logo.png")]);
  x.fillStyle = "#0B0B0C"; x.fillRect(0, 0, W, H);
  const [r, gg, b] = hexRGB(tc); const gr = x.createRadialGradient(W / 2, 640, 60, W / 2, 640, 1000); gr.addColorStop(0, `rgba(${r},${gg},${b},.6)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`); x.fillStyle = gr; x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(255,255,255,.06)"; x.lineWidth = 6; x.beginPath(); x.arc(W / 2, 700, 620, 0, Math.PI * 2); x.stroke();
  // top: game clock
  x.textAlign = "center"; x.fillStyle = "#FF6A13"; x.font = '500 38px "IBM Plex Mono", monospace';
  x.fillText(`${p.per || ""} · ${p.clock || ""}`.toUpperCase(), W / 2, 170);
  // the team that made the play
  if (lt) { const s = 300, k = Math.min(s / lt.width, s / lt.height) || 1, w = (lt.width || s) * k, hh = (lt.height || s) * k; x.drawImage(lt, (W - w) / 2, 260 + (s - hh) / 2, w, hh) }
  // headline
  let head = p.l || "Big play";
  if (p.n && p.pts > 0) { if ((p.tags || []).includes("Lead change") || (p.tags || []).includes("Takes the lead")) head = `Go-ahead ${p.n}`; else if ((p.tags || []).includes("Ties it")) head = `Game-tying ${p.n}` }
  head = `${p.e || ""} ${head}`.trim().toUpperCase();
  let fs = 150; do { x.font = `900 ${fs}px "Big Shoulders Display", Impact, sans-serif`; fs -= 4 } while (x.measureText(head).width > W - 120 && fs > 60);
  x.fillStyle = "#F5F5F2"; x.fillText(head, W / 2, 760);
  // what happened (wrapped)
  x.font = '600 46px Barlow, sans-serif'; x.fillStyle = "#C9C9C4";
  const words = String(p.desc || "").split(/\s+/), lines = []; let ln = "";
  for (const w of words) { const t = ln ? ln + " " + w : w; if (x.measureText(t).width > W - 200 && ln) { lines.push(ln); ln = w } else ln = t }
  if (ln) lines.push(ln);
  lines.slice(0, 3).forEach((t, i) => x.fillText(t, W / 2, 850 + i * 62));
  let y = 850 + Math.min(3, lines.length) * 62 + 20;
  if (p.line) { x.font = '700 40px Barlow, sans-serif'; x.fillStyle = "#FF6A13"; x.fillText(p.line, W / 2, y + 20); y += 70 }
  const tags = (p.tags || []).filter(t => !/^(Lead change|Takes the lead|Ties it)$/.test(t)).slice(0, 2);
  if (tags.length) {
    x.font = '800 44px "Big Shoulders Display", Impact, sans-serif';
    const t = tags.join("  ·  ").toUpperCase(), w = x.measureText(t).width + 60;
    x.fillStyle = "#FFD23F"; roundRect(x, W / 2 - w / 2, y + 10, w, 72, 14); x.fill(); x.fillStyle = "#0B0B0C"; x.fillText(t, W / 2, y + 62);
  }
  // score bar
  const sy = 1220; x.fillStyle = "rgba(255,255,255,.07)"; roundRect(x, 90, sy, W - 180, 230, 30); x.fill();
  const half = (logo, t, score, X, lit) => {
    if (logo) { const s = 120, k = Math.min(s / logo.width, s / logo.height) || 1, w = (logo.width || s) * k, hh = (logo.height || s) * k; x.drawImage(logo, X + (s - w) / 2, sy + 55 + (s - hh) / 2, w, hh) }
    x.textAlign = "left"; x.fillStyle = lit ? "#F5F5F2" : "#B5B5B0";
    x.font = '900 120px "Big Shoulders Display", Impact, sans-serif'; x.fillText(String(score), X + 140, sy + 160);
    x.font = '700 32px Barlow, sans-serif'; x.fillStyle = "#9C9C98"; x.fillText(fix(t.names.short).slice(0, 18), X, sy + 210);
  };
  half(la, g.away, p.v, 130, p.side === "away"); half(lh, g.home, p.h, W / 2 + 40, p.side === "home");
  x.textAlign = "center"; x.fillStyle = "#6B6B66"; x.font = '900 60px "Big Shoulders Display", Impact, sans-serif'; x.fillText("–", W / 2, sy + 150);
  drawStoryCTA(x, W, brand, g.gameState === "live", 1490);
  return c;
}
// ---------- story footer: a call to action + room for Instagram's link sticker ----------
const SITE_URL = "https://collegebasketball.news";
function drawStoryCTA(x, W, brand, live, top = 1490) {
  const font = (w, sz, f = '"Big Shoulders Display", Impact, sans-serif') => { x.font = `${w} ${sz}px ${f}` };
  x.fillStyle = "#FF6A13"; roundRect(x, 90, top, W - 180, 160, 30); x.fill();
  x.textAlign = "center"; x.fillStyle = "#0B0B0C";
  let sz = 76; const big = live ? "TAP THE LINK FOR LIVE CHAT" : "TAP THE LINK FOR MORE"; do { font(900, sz); sz -= 2 } while (x.measureText(big).width > W - 260 && sz > 30);
  x.fillText(big, W / 2, top + 80);
  const sub = `${live ? "Play-by-play · win odds · Pick'em" : "Scores · play-by-play · Pick'em"} · ${SITE_URL.replace("https://", "")}`;
  let s2 = 32; do { font(700, s2, "Barlow, sans-serif"); s2 -= 1 } while (x.measureText(sub).width > W - 240 && s2 > 18);
  x.fillText(sub, W / 2, top + 130);
  // arrow pointing at the empty space below, where the link sticker goes
  const ay = top + 182; x.fillStyle = "#FF6A13"; x.beginPath(); x.moveTo(W / 2 - 34, ay); x.lineTo(W / 2 + 34, ay); x.lineTo(W / 2, ay + 38); x.closePath(); x.fill();
}

// ---------- share the game ----------
// A story-sized picture (1080×1920) of where the game stands: score, win probability, the momentum line
// and the "Catch me up" notes.
async function makeGameCard(g) {
  try { await Promise.all(['900 120px "Big Shoulders Display"', '800 60px "Big Shoulders Display"', '600 40px Barlow', '700 40px Barlow', '500 30px "IBM Plex Mono"'].map(f => document.fonts.load(f))) } catch { }
  const W = 1080, H = 1920, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const a = +g.away.score || 0, h = +g.home.score || 0, live = g.gameState === "live", fin = g.gameState === "final";
  const sa = logoSlug(g.away.names.short, g.away.names.seo), sh = logoSlug(g.home.names.short, g.home.names.seo);
  const ca = teamColorFor(sa) || "#8A8A86", ch = teamColorFor(sh) || "#D8D8D4";
  const [la, lh, brand] = await Promise.all([loadImg(logoURL(sa)), loadImg(logoURL(sh)), loadImg("logo.png")]);
  const story = GAMESTORY[g.gameID] || {};
  let series = story.series;
  if (!series || !series.length) series = (gameDetail?.id === g.gameID ? (gameDetail.pbp?.periods || []) : []).flatMap((p, pi) => (p.playbyplayStats || []).map(x => ({ lead: (+x.homeScore || 0) - (+x.visitorScore || 0), per: pi + 1 })));
  const font = (w, sz, f = '"Big Shoulders Display", Impact, sans-serif') => { x.font = `${w} ${sz}px ${f}` };
  const fit = (t, w, sz, max, f) => { do { font(w, sz, f); sz -= 2 } while (x.measureText(t).width > max && sz > 16) };
  // background: a glow in the leader's color
  x.fillStyle = "#0B0B0C"; x.fillRect(0, 0, W, H);
  const lc = h > a ? ch : a > h ? ca : "#FF6A13", [r, gg, b] = hexRGB(lc);
  const gr = x.createRadialGradient(W / 2, 420, 40, W / 2, 420, 900); gr.addColorStop(0, `rgba(${r},${gg},${b},.42)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`); x.fillStyle = gr; x.fillRect(0, 0, W, H);
  // top row: LIVE / FINAL, upset watch, clock
  x.textAlign = "center";
  const pills = [];
  pills.push(live ? ["● LIVE", "#E11D2E", "#fff"] : fin ? ["FINAL" + (/ot/i.test(g.finalMessage || "") ? " / " + String(g.finalMessage).replace(/final\W*/i, "").toUpperCase() : ""), "#F5F5F2", "#0B0B0C"] : ["UP NEXT", "#F5F5F2", "#0B0B0C"]);
  if (upsetWatch(g)) pills.push(["🚨 UPSET WATCH", "#FFD23F", "#0B0B0C"]);
  else if (fin && underdogLeads(g)) pills.push(["🚨 UPSET", "#FFD23F", "#0B0B0C"]);
  else if (live && crunch(g)) pills.push(["⏱️ CRUNCH TIME", "#FF6A13", "#0B0B0C"]);
  font(800, 44); const pw = pills.map(([t]) => x.measureText(t).width + 56), tot = pw.reduce((s, v) => s + v, 0) + (pills.length - 1) * 18;
  let px = (W - tot) / 2;
  pills.forEach(([t, bg, fg], i) => { x.fillStyle = bg; roundRect(x, px, 110, pw[i], 76, 38); x.fill(); x.fillStyle = fg; x.fillText(t, px + pw[i] / 2, 163); px += pw[i] + 18 });
  if (live) { x.fillStyle = "#FF6A13"; font(500, 40, '"IBM Plex Mono", monospace'); x.fillText(`${String(g.currentPeriod || "").toUpperCase()}${/half/i.test(g.currentPeriod || "") ? "" : " · " + clockTxt(g.contestClock)}`, W / 2, 260) }
  // teams and score
  const team = (logo, t, score, X, lit) => {
    if (logo) { const s = 190, k = Math.min(s / logo.width, s / logo.height) || 1, w = logo.width * k, hh = logo.height * k; x.drawImage(logo, X - w / 2, 280 + (s - hh) / 2, w, hh) }
    const rank = rk(t); x.fillStyle = "#F5F5F2"; x.textAlign = "center";
    const nm = fix(t.names.short).toUpperCase(); fit(nm, 800, 56, 440);
    if (rank) { const rw = x.measureText(nm).width; font(800, 40); x.fillStyle = "#FF6A13"; x.fillText(String(rank), X - rw / 2 - 30, 530); fit(nm, 800, 56, 440); x.fillStyle = "#F5F5F2" }
    x.fillText(nm, X + (rank ? 12 : 0), 530);
    font(900, 200); x.fillStyle = lit ? "#FFFFFF" : "#8E8E8A"; x.fillText(String(score), X, 720);
  };
  team(la, g.away, a, 280, !fin || a > h); team(lh, g.home, h, 800, !fin || h > a);
  x.fillStyle = "#4A4A47"; font(900, 110); x.fillText("–", W / 2, 685);
  // win probability
  let y = 770;
  if (!fin) {
    const ph = winProb(g), pa = 1 - ph, pct = v => v >= .995 ? ">99%" : v <= .005 ? "<1%" : Math.round(v * 100) + "%";
    x.fillStyle = "#9C9C98"; font(500, 30, '"IBM Plex Mono", monospace'); x.fillText(g.gameState === "pre" ? "PREGAME ODDS" : "WIN PROBABILITY", W / 2, y + 30);
    x.textAlign = "left"; x.fillStyle = "#fff"; font(900, 72); x.fillText(pct(pa), 90, y + 50);
    x.textAlign = "right"; x.fillText(pct(ph), W - 90, y + 50);
    const bx = 90, bw = W - 180, by = y + 80, bh = 34, wa = Math.max(4, bw * pa - 3);
    x.fillStyle = "#222"; roundRect(x, bx, by, bw, bh, 17); x.fill();
    x.save(); roundRect(x, bx, by, bw, bh, 17); x.clip();
    x.fillStyle = ca; x.fillRect(bx, by, wa, bh); x.fillStyle = ch; x.fillRect(bx + wa + 6, by, bw - wa - 6, bh); x.restore();
    x.textAlign = "center"; y = by + bh + 70;
  } else y += 20;
  // momentum line (above the middle: home team leading; below: away team)
  if (series.length >= 4) {
    const pts = [{ lead: 0, per: series[0].per }, ...series], n = pts.length, cx = 90, cw = W - 180, chh = 180, cy = y + 60, mid = cy + chh / 2;
    const scale = Math.max(8, ...pts.map(p => Math.abs(p.lead)));
    const xy = pts.map((p, i) => [cx + (i / (n - 1)) * cw, mid - (p.lead / scale) * (chh / 2 - 8)]);
    const big = Math.max(...pts.map(p => p.lead)), small = Math.min(...pts.map(p => p.lead));
    const ab = t => fix(t.names.char6 || t.names.short).toUpperCase();
    x.textAlign = "left"; font(500, 30, '"IBM Plex Mono", monospace');
    x.fillStyle = "#F5F5F2"; x.fillText(ab(g.home) + (big > 0 ? "" : ""), cx, y + 38); if (big > 0) { const w0 = x.measureText(ab(g.home) + " ").width; x.fillStyle = "#9C9C98"; x.fillText(`LED BY ${big}`, cx + w0, y + 38) }
    x.textAlign = "right"; x.fillStyle = "#9C9C98"; x.fillText("MOMENTUM", cx + cw, y + 38);
    x.strokeStyle = "rgba(255,255,255,.12)"; x.lineWidth = 2; x.setLineDash([8, 8]);
    for (let i = 1; i < n; i++) if (pts[i].per !== pts[i - 1].per) { x.beginPath(); x.moveTo(xy[i][0], cy); x.lineTo(xy[i][0], cy + chh); x.stroke() }
    x.setLineDash([]); x.strokeStyle = "rgba(255,255,255,.25)"; x.beginPath(); x.moveTo(cx, mid); x.lineTo(cx + cw, mid); x.stroke();
    const path = () => { x.beginPath(); xy.forEach(([X, Y], i) => i ? x.lineTo(X, Y) : x.moveTo(X, Y)) };
    const area = (top, col) => { x.save(); x.beginPath(); x.rect(cx, top ? cy : mid, cw, chh / 2); x.clip(); path(); x.lineTo(cx + cw, mid); x.lineTo(cx, mid); x.closePath(); const [r1, g1, b1] = hexRGB(col); x.fillStyle = `rgba(${r1},${g1},${b1},.75)`; x.fill(); x.restore() };
    area(true, ch); area(false, ca);
    path(); x.strokeStyle = "#F5F5F2"; x.lineWidth = 4; x.lineJoin = "round"; x.stroke();
    x.textAlign = "left"; x.fillStyle = "#F5F5F2"; font(500, 30, '"IBM Plex Mono", monospace'); x.fillText(ab(g.away), cx, cy + chh + 50);
    if (small < 0) { const w0 = x.measureText(ab(g.away) + " ").width; x.fillStyle = "#9C9C98"; x.fillText(`LED BY ${-small}`, cx + w0, cy + chh + 50) }
    y = cy + chh + 90;
  }
  // catch me up notes
  const rows = story.CM ? catchUpRows(g, story.CM, story.P || {}).slice(1).filter(r => r[0] === "🏃" || r[0] === "⭐").map(([e, t]) => [e, t.replace(/ \([^)]*\)/g, "")]).slice(0, 2) : [];
  if (rows.length) {
    const top = y + 10, rowH = 60, boxH = 36 + rows.length * rowH;
    x.fillStyle = "rgba(255,255,255,.06)"; roundRect(x, 90, top, W - 180, boxH, 28); x.fill();
    rows.forEach(([e, t], i) => {
      x.textAlign = "left"; font(600, 36, "Barlow, sans-serif"); x.fillStyle = "#E3E3DF";
      x.fillText(e, 130, top + 64 + i * rowH); fit(t, 600, 36, W - 90 - 200 - 40, "Barlow, sans-serif"); x.fillText(t, 200, top + 64 + i * rowH);
    });
    y = top + boxH;
  }
  drawStoryCTA(x, W, brand, live, Math.max(1480, y + 30));
  return c;
}
function shareGame(id) {
  const g = Object.values(cache).flat().find(x => x.gameID === id); if (!g) return;
  const name = `${fix(g.away.names.short)}-${fix(g.home.names.short)}-${g.gameState === "final" ? "final" : "live"}`.replace(/[^A-Za-z0-9-]+/g, "-").toLowerCase() + ".png";
  openShare("Share this game", () => makeGameCard(g), name, `${fix(g.away.names.short)} ${g.away.score}, ${fix(g.home.names.short)} ${g.home.score}: win probability and momentum`, "Live game", `${SITE_URL}/#game-${g.gameID}`);
}
function sharePlay(key) {
  const g = Object.values(cache).flat().find(x => x.gameID === openGame), p = PLAYINFO[openGame]?.[key];
  if (!g || !p) return;
  const name = `${fix(g.away.names.short)}-${fix(g.home.names.short)}-play`.replace(/[^A-Za-z0-9-]+/g, "-").toLowerCase() + ".png";
  openShare("Share this play", () => makePlayCard(g, p), name, `${p.l || "Play"}: ${p.desc}`, "Big play", `${SITE_URL}/#game-${g.gameID}`);
}

// ---------- catch me up ----------
// A short summary at the top of the feed for anyone joining mid-game: the score, the best run,
// the biggest leads, how back-and-forth it's been, and who's scoring.
let cmuClosed = {};
const GAMESTORY = {};
const clockTxt = c => String(c || "").replace(/^0(\d)/, "$1");
function catchUpHTML(sg, CM, P, nPlays) {
  if (nPlays < 12 || sg.gameState === "pre") return "";
  const rows = catchUpRows(sg, CM, P);
  const closed = cmuClosed[sg.gameID] !== false; // folded to one line unless opened, so the plays stay on screen
  return `<div class="cmu ${closed ? "closed" : ""}"><button class="cmu-h" data-cmu="${sg.gameID}" aria-expanded="${!closed}"><span><b>⚡ ${sg.gameState === "final" ? "Game recap" : "Catch me up"}</b>${closed && rows[0] ? `<small>${esc(rows[0][1])}</small>` : ""}</span><i>${closed ? "Show" : "Hide"}</i></button>${closed ? "" : `<ul>${rows.map(([e, t]) => `<li><span>${e}</span>${esc(t)}</li>`).join("")}</ul>`}</div>`;
}
function catchUpRows(sg, CM, P) {
  const a = +sg.away.score || 0, h = +sg.home.score || 0, A = fix(sg.away.names.short), Hn = fix(sg.home.names.short);
  const name = sd => sd === "home" ? Hn : A;
  const rows = [];
  if (sg.gameState === "final") rows.push(["🏁", h === a ? `Final: ${A} ${a}, ${Hn} ${h}` : `${h > a ? Hn : A} beat ${h > a ? A : Hn} ${Math.max(a, h)}-${Math.min(a, h)}${/ot/i.test(sg.finalMessage || "") ? ` in ${String(sg.finalMessage).replace(/final\W*/i, "")}` : ""}`]);
  else {
    const per = String(sg.currentPeriod || ""), where = /half/i.test(per) ? "at halftime" : `with ${clockTxt(sg.contestClock)} left in the ${/ot/i.test(per) ? per : /2/.test(per) ? "2nd half" : "1st half"}`;
    rows.push(["📍", h === a ? `Tied ${a}-${h} ${where}` : `${h > a ? Hn : A} leads ${h > a ? A : Hn} ${Math.max(a, h)}-${Math.min(a, h)} ${where}`]);
  }
  if (CM.run) rows.push(["🏃", `Best run: ${name(CM.run.side)} ${CM.run.pts}-0`]);
  const leads = [CM.maxA > 0 ? `${A} by ${CM.maxA}` : "", CM.maxH > 0 ? `${Hn} by ${CM.maxH}` : ""].filter(Boolean);
  if (leads.length) rows.push(["📈", `Biggest lead: ${leads.join(", ")}`]);
  if (CM.leadCh || CM.ties) rows.push(["🔁", `${CM.leadCh} lead change${CM.leadCh === 1 ? "" : "s"}, ${CM.ties} tie${CM.ties === 1 ? "" : "s"}`]);
  const top = sd => Object.entries(P).filter(([k, v]) => !k.startsWith("foul:") && v.side === sd && v.pts > 0).sort((x, y) => y[1].pts - x[1].pts)[0];
  const ta = top("away"), th = top("home");
  const sc = [ta ? `${shortName(ta[0])} ${ta[1].pts} (${A})` : "", th ? `${shortName(th[0])} ${th[1].pts} (${Hn})` : ""].filter(Boolean);
  if (sc.length) rows.push(["⭐", `Leading scorers: ${sc.join(", ")}`]);
  return rows;
}

// ---------- Game of the Night ----------
// Picks today's headline game by how big the matchup is: ranked-vs-ranked games, Power 6 teams playing each other,
// and classic rivalries come first; a ranked team beating up on a small-conference team counts for much less.
// Games still to be played always beat finished ones; a live game keeps the spot unless a clearly bigger one is on.
const NOTABLE = new Set(["memphis", "gonzaga", "san-diego-st", "st-marys-ca", "dayton", "vcu", "wichita-st", "utah-st",
  "new-mexico", "nevada", "boise-st", "unlv", "colorado-st", "fla-atlantic", "drake", "grand-canyon", "mcneese",
  "saint-louis", "loyola-chicago", "davidson", "col-of-charleston", "uab", "north-texas", "liberty", "high-point",
  "princeton", "st-bonaventure", "santa-clara", "san-francisco", "bradley", "belmont", "south-fla", "tulane", "george-mason", "yale", "akron", "lipscomb"]);
// classic rivalries (either order)
const RIVALS = new Set([
  "duke|north-carolina", "kentucky|louisville", "indiana|purdue", "michigan|michigan-st", "kansas|missouri", "kansas|kansas-st",
  "iowa|iowa-st", "cincinnati|xavier", "southern-california|ucla", "arizona|arizona-st", "georgetown|syracuse", "villanova|georgetown",
  "saint-josephs|villanova", "penn|villanova", "la-salle|saint-josephs", "temple|villanova", "syracuse|uconn", "georgetown|uconn",
  "alabama|auburn", "florida|florida-st", "florida|kentucky", "georgia|georgia-tech", "clemson|south-carolina", "virginia|virginia-tech",
  "duke|north-carolina-st", "north-carolina|north-carolina-st", "duke|wake-forest", "north-carolina|wake-forest", "illinois|missouri",
  "marquette|wisconsin", "minnesota|wisconsin", "michigan|ohio-st", "penn-st|pittsburgh", "pittsburgh|west-virginia", "butler|xavier",
  "creighton|nebraska", "oregon|oregon-st", "washington|washington-st", "california|stanford", "texas|texas-am", "oklahoma|oklahoma-st",
  "byu|utah", "utah|utah-st", "byu|utah-st", "memphis|tennessee", "mississippi-st|ole-miss", "gonzaga|st-marys-ca", "baylor|tcu",
  "houston|memphis", "arkansas|missouri", "indiana|kentucky", "kentucky|north-carolina", "duke|kentucky", "kansas|kentucky",
  "kentucky|michigan-st", "duke|michigan-st", "kansas|michigan-st", "indiana|louisville", "notre-dame|purdue", "indiana|notre-dame",
  "creighton|marquette", "providence|uconn", "seton-hall|st-johns-ny", "st-johns-ny|villanova", "boston-college|uconn",
  "miami-fl|florida-st", "lsu|ole-miss", "tennessee|vanderbilt", "kentucky|tennessee", "arizona|ucla", "dayton|xavier"]);
const teamSlug = t => logoSlug(t.names.short, t.names.seo);
const isP6 = t => P6.includes(confOf(t));
const isRivalry = g => { const a = teamSlug(g.away), h = teamSlug(g.home); return RIVALS.has(`${a}|${h}`) || RIVALS.has(`${h}|${a}`) };
// how big a matchup is, before anything about the score or tip time
function matchupScore(g) {
  const A = g.away, H = g.home, ra = rk(A), rh = rk(H), pa = isP6(A), ph = isP6(H);
  const big = t => isP6(t) || NOTABLE.has(teamSlug(t)) || rk(t);
  const rankPts = r => r ? (26 - r) * 4 : 0; // No. 1 = 100 … No. 25 = 4
  let s = 0;
  if (ra && rh) s += 120 + rankPts(ra) + rankPts(rh) + (ra <= 10 && rh <= 10 ? 40 : 0);
  else if (ra || rh) { const r = ra || rh, opp = ra ? H : A; s += big(opp) ? 70 + rankPts(r) : 10 + rankPts(r) * 0.4 } // ranked vs a real opponent, or vs a small school
  if (pa && ph) s += confOf(A) === confOf(H) ? 90 : 100;                 // Power 6 vs Power 6
  else if (pa || ph) s += big(pa ? A : H) ? 25 : 5;                       // one Power 6 team (vs a notable program, or a cupcake)
  else if (NOTABLE.has(teamSlug(A)) && NOTABLE.has(teamSlug(H))) s += 60;  // two good mid-majors
  else if (NOTABLE.has(teamSlug(A)) || NOTABLE.has(teamSlug(H))) s += 15;
  if (isRivalry(g)) s += 120;
  if (g.network) s += 5;
  return s;
}
// a ranked team in real danger, or any big game coming down to the wire, earns the spot while it's happening
function liveDrama(g) {
  if (g.gameState !== "live") return 0;
  let s = 20;
  if (upsetWatch(g)) { const r = rk(g.away) || rk(g.home) || 25; s += 60 + (26 - Math.min(rk(g.away) || 99, rk(g.home) || 99, r)) * 2 }
  if (crunch(g)) s += 40;
  else if (Math.abs((+g.home.score || 0) - (+g.away.score || 0)) <= 5) s += 10;
  return s;
}
function heroTier(g) { return matchupScore(g) + liveDrama(g) }
function heroScore(g) {
  let s = (g.gameState === "final" || noFeed(g) ? 0 : 10000) + matchupScore(g) + liveDrama(g); // a game with no live feed can't be followed here, so it isn't featured
  if (g.gameState === "pre") { const hrs = Math.max(0, ((+g.startTimeEpoch || 0) * 1000 - Date.now()) / 36e5); s += Math.max(0, 20 - hrs * 2) } // sooner tip-off breaks near-ties
  return s;
}
// A small chart of the lead swinging back and forth: above the line the home team leads, below it the away team.
function momentumSVG(series, g) {
  const pts = [{ lead: 0, per: series[0].per }, ...series].slice(-400), n = pts.length, W = 600, H = 64, mid = H / 2;
  const scale = Math.max(8, ...pts.map(p => Math.abs(p.lead)));
  const xy = pts.map((p, i) => [(i / (n - 1)) * W, mid - (p.lead / scale) * (mid - 4)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const area = `${line}L${W},${mid}L0,${mid}Z`;
  const cuts = []; for (let i = 1; i < n; i++) if (pts[i].per !== pts[i - 1].per) cuts.push(xy[i][0]);
  const big = Math.max(...pts.map(p => p.lead)), small = Math.min(...pts.map(p => p.lead));
  const ab = t => esc((t.names.char6 || fix(t.names.short)).toString().slice(0, 12));
  // labels sit above (home) and below (away) the chart, never on top of the line
  return `<div class="momo"><div class="momo-row top"><span class="h">${ab(g.home)}${big > 0 ? ` <i>led by ${big}</i>` : ""}</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Lead over the game">
      <defs><clipPath id="mo-top"><rect x="0" y="0" width="${W}" height="${mid}"/></clipPath><clipPath id="mo-bot"><rect x="0" y="${mid}" width="${W}" height="${mid}"/></clipPath></defs>
      ${cuts.map(x => `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="0" y2="${H}" class="mo-cut"/>`).join("")}
      <line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="mo-mid"/>
      <path d="${area}" clip-path="url(#mo-top)" class="mo-h"/><path d="${area}" clip-path="url(#mo-bot)" class="mo-a"/>
      <path d="${line}" class="mo-line"/>
    </svg><div class="momo-row bot"><span class="a">${ab(g.away)}${small < 0 ? ` <i>led by ${-small}</i>` : ""}</span><span class="momo-cap">Momentum</span></div></div>`;
}
let heroId = null, heroLast = "", heroFlash = { a: 0, h: 0 }, heroExtra = { id: null, lines: [], play: "" };
// While the featured game is live, also pull its scoring by half and the latest play.
async function loadHeroExtra(id) {
  const [info, pbp] = await Promise.all([api(`game/${id}`, 1).catch(() => null), api(`game/${id}/play-by-play`, 1).catch(() => null)]);
  if (heroId !== id) return;
  const plays = (pbp?.periods || []).flatMap(p => p.playbyplayStats || []);
  const last = [...plays].reverse().find(p => (p.eventDescription || p.homeText || p.visitorText) && !/^(subbing|timeout)/i.test(p.eventDescription || "") && !isSub(p.eventDescription || p.homeText || p.visitorText));
  const ct = info?.contests?.[0];
  if (ct) noteBest(id, ct.teams?.find(t => t.isHome)?.score, ct.teams?.find(t => !t.isHome)?.score);
  const lp = [...plays].reverse().find(p => p.homeScore !== undefined); if (lp) noteBest(id, lp.homeScore, lp.visitorScore);
  for (const list of Object.values(cache)) for (const g of list) if (g.gameID === id) applyBest(g);
  // momentum: the home team's lead after every scoring play
  const series = []; let prevKey = "";
  for (const p of pbp?.periods || []) for (const x of p.playbyplayStats || []) {
    if (x.homeScore === undefined || x.homeScore === "" || x.visitorScore === undefined) continue;
    const k = x.homeScore + "-" + x.visitorScore; if (k === prevKey) continue; prevKey = k;
    series.push({ lead: (+x.homeScore || 0) - (+x.visitorScore || 0), per: p.periodDisplay || p.periodNumber || "" });
  }
  heroExtra = { id, series, lines: ct?.linescores || [], play: last ? fix(last.eventDescription || last.homeText || last.visitorText).replace(/\s+/g, " ").trim() : "" };
  drawHero();
}
function drawHero() {
  const el = $("#gotn"); if (!el) return; const list = cache.t || [];
  if (!list.length) { el.hidden = true; return }
  const live = list.find(g => g.gameID === heroId);
  // keep the same game while it's on, unless a game from a higher tier is live or still to come
  const best = [...list].sort((a, b) => heroScore(b) - heroScore(a))[0];
  let g = live && live.gameState !== "final" && !noFeed(live) && heroTier(live) + 60 >= heroTier(best) ? live : best;
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
  const momo = isLive && ex.series && ex.series.length >= 4 ? momentumSVG(ex.series, g) : "";
  el.classList.toggle("is-live", isLive);
  el.innerHTML = `<div class="gt"><div class="lbl">Game of the <span>${when}</span>${isLive ? `<em class="livepill"><span class="dot"></span>Live</em>` : ""}</div>${badgeHTML(badges(g))}</div>
    <div class="gm">${side(g.away, "away")}<div class="mid"><div class="big2">${pre ? "VS" : `<span class="${fin && a < h ? "l" : "w"}" data-hs="a">${a}</span>–<span class="${fin && h < a ? "l" : "w"}" data-hs="h">${h}</span>`}</div><div class="st2 ${st.cls}">${esc(st.txt)}</div>${tvHTML(g.network, 0, 1)}${halves}</div>${side(g.home, "home", 1)}</div>${momo}${play}`;
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
  const box = $("#igposts"), all = (window.IG_POSTS || []).filter(u => /instagram\.com\/(p|reel)\//.test(u));
  const posts = all.slice(0, 6); // embedded below the phone
  // The phone's grid (9 tiles): tile 1 is the first post in posts.js, and so on. If the ig folder has a picture
  // for a tile (ig/1.jpg … ig/9.jpg, or .png), the tile shows it; otherwise it keeps its colored label.
  const PROFILE = "https://www.instagram.com/collegebasketball/";
  document.querySelectorAll("#igxgrid .t").forEach((t, i) => {
    const url = all[i] ? all[i].split("?")[0] : PROFILE;
    const a = document.createElement("a");
    a.className = t.className; a.innerHTML = t.innerHTML; a.href = url; a.target = "_blank"; a.rel = "noopener";
    a.setAttribute("aria-label", all[i] ? `Instagram post ${i + 1}` : "Open @collegebasketball on Instagram");
    { // every tile tries its picture; tiles without a post link open the profile
      const img = document.createElement("img"); img.alt = ""; img.loading = "lazy";
      img.onload = () => a.classList.add("has-img");
      img.onerror = () => { if (!img.dataset.png) { img.dataset.png = 1; img.src = `ig/${i + 1}.png` } else img.remove() };
      img.src = `ig/${i + 1}.jpg`; a.prepend(img);
    }
    t.replaceWith(a);
  });
  if (!posts.length) { box.innerHTML = ""; return } // the follow block above stands on its own until posts are added in posts.js
  box.innerHTML = `<p class="ig-latest">Latest posts</p><div class="ig-grid">${posts.map(u => `<blockquote class="instagram-media" data-instgrm-permalink="${esc(u.split("?")[0])}" data-instgrm-version="14"><a href="${esc(u)}" target="_blank" rel="noopener">View this post on Instagram</a></blockquote>`).join("")}</div>`;
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
let tickerContent = "", tickerSig = "";
function drawTicker(changed) {
  const items = tickerItems(), track = $("#ticker");
  const sig = items.map(i => i.key).join(",");
  if (!items.length) { track.innerHTML = `<span class="ti">No ranked teams playing today</span>`; tickerSig = ""; return }
  // Rebuild the items whenever anything in them changes. Editing them in place while the ticker scrolls can leave
  // iPhone Safari drawing the new score on top of the old layout (overlapping text).
  const reps = Math.max(2, Math.ceil(12 / items.length));
  const html = Array.from({ length: reps }, () => items).flat().map(i => `<button class="ti${changed && changed.has(i.key) ? " flash" : ""}" data-tk="${i.key}" data-game="${i.key}" data-day-of="t">${i.html}</button>`).join("");
  const content = items.map(i => i.html).join("|");
  if (sig === tickerSig && content === tickerContent) return;
  track.innerHTML = html;
  if (sig !== tickerSig) track.style.animationDuration = Math.max(30, items.length * reps * 4) + "s";
  tickerSig = sig; tickerContent = content;
}

// ---------- win probability ----------
// A simple, standard model: the current margin plus a small expected edge (home court, AP rank), measured
// against how much a college game usually swings in the time that's left (about 11 points over 40 minutes).
function secsLeft(g) {
  if (g.gameState === "pre") return 2400;
  const per = String(g.currentPeriod || ""), c = clockSecs(g.contestClock), clk = c === 9999 ? 0 : c;
  if (/half/i.test(per)) return 1200;
  if (/ot/i.test(per) || /2nd|^2$/i.test(per)) return /end/i.test(per) ? 0 : clk;
  return 1200 + (/end/i.test(per) ? 0 : clk);
}
const normCdf = z => { const t = 1 / (1 + .2316419 * Math.abs(z)), d = .3989423 * Math.exp(-z * z / 2), p = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p };
function winProb(g) {
  const a = +g.away.score || 0, h = +g.home.score || 0;
  if (g.gameState === "final") return h > a ? 1 : 0;
  const str = t => { const r = rk(t); return r ? 8 - r * .2 : 0 };
  const edge = 2.5 + str(g.home) - str(g.away), left = secsLeft(g), f = left / 2400;
  if (left <= 0) return h > a ? .99 : h < a ? .01 : normCdf(edge / 11 * .4);
  // (+1.5: late-game fouling and long threes keep a little extra uncertainty in the final minutes)
  const p = normCdf((h - a + edge * f) / (11 * Math.sqrt(f) + 1.5));
  return Math.min(.995, Math.max(.005, p));
}
function wpHTML(g) {
  if (g.gameState === "final") return "";
  const ph = winProb(g), pa = 1 - ph, pct = v => v >= .995 ? ">99" : v <= .005 ? "<1" : String(Math.round(v * 100));
  const sa = logoSlug(g.away.names.short, g.away.names.seo), sh = logoSlug(g.home.names.short, g.home.names.seo);
  const ca = teamColorFor(sa) || "#8A8A86", ch = teamColorFor(sh) || "#F5F5F2";
  const nmA = fix(g.away.names.char6 || g.away.names.short), nmH = fix(g.home.names.char6 || g.home.names.short);
  return `<div class="wp-row"><span class="wp-t"><b>${pct(pa)}%</b> ${esc(nmA)}</span><span class="wp-lbl">${g.gameState === "pre" ? "Pregame odds" : "Win probability"}</span><span class="wp-t r">${esc(nmH)} <b>${pct(ph)}%</b></span></div>
    <div class="wp-bar" role="img" aria-label="${esc(nmA)} ${pct(pa)} percent, ${esc(nmH)} ${pct(ph)} percent"><i style="width:${(pa * 100).toFixed(1)}%;background:${ca}"></i><i style="width:${(ph * 100).toFixed(1)}%;background:${ch}"></i></div>`;
}

// ---------- game page ----------
let gameSig = "", gameBusy = false;
// ---- one play at a time ----
// NCAA's feed often posts several plays at once. Instead of dropping them all in together, new plays are
// shown one by one, a second or two apart, so the feed feels like it's happening live.
const RV = { id: null, full: null, shown: 0, timer: null, last: 0 };
const flatPlays = pbp => (pbp?.periods || []).flatMap(p => p.playbyplayStats || []);
const playText = x => x.eventDescription || x.homeText || x.visitorText || "";
function trimPbp(pbp, n) { // the same feed, cut off after the first n plays
  if (!pbp) return pbp;
  let left = n;
  return { ...pbp, periods: (pbp.periods || []).map(p => { const list = p.playbyplayStats || [], k = Math.max(0, Math.min(list.length, left)); left -= k; return { ...p, playbyplayStats: list.slice(0, k) } }).filter((p, i) => i === 0 || p.playbyplayStats.length) };
}
function revealPbp(id, pbp, firstLoad) {
  const total = flatPlays(pbp).length;
  if (firstLoad || RV.id !== id || !pbp) { clearTimeout(RV.timer); RV.timer = null; Object.assign(RV, { id, full: pbp, shown: total, last: 0 }); return pbp }
  RV.full = pbp;
  if (RV.shown > total) RV.shown = total; // a play was removed or corrected
  if (RV.shown < total && !RV.timer) revealNext(true);
  return trimPbp(pbp, RV.shown);
}
function revealNext(inline) {
  RV.timer = null;
  if (openGame !== RV.id || !RV.full) return;
  const all = flatPlays(RV.full), total = all.length;
  if (RV.shown >= total) return;
  if (inline && Date.now() - RV.last < 900) { RV.timer = setTimeout(revealNext, 900); return }
  // show the next play (substitutions are hidden, so they ride along with the play after them)
  do RV.shown++; while (RV.shown < total && isSub(playText(all[RV.shown - 1])));
  RV.last = Date.now();
  if (!inline && gameDetail?.id === RV.id) { gameDetail.pbp = trimPbp(RV.full, RV.shown); drawGame(); markNewest() }
  else setTimeout(markNewest, 0);
  const left = total - RV.shown;
  // spread what's left over the next few seconds: about 1.5s apart, quicker if a lot piled up
  if (left > 0) RV.timer = setTimeout(revealNext, Math.max(700, Math.min(1800, 4500 / left)));
}
function markNewest() { // a quick slide-in on the play that just arrived
  for (const sel of ["#mgbody .fp", "#gdetail .play"]) { const el = document.querySelector(sel); if (el) { el.classList.remove("just-in"); void el.offsetWidth; el.classList.add("just-in") } }
}
// While a live game is open (and the tab is visible), look for new plays every few seconds.
setInterval(async () => {
  if (!openGame || document.hidden || gameBusy) return;
  const g = (cache.t || []).find(x => x.gameID === openGame);
  if (!g || !isLive(g)) return;
  gameBusy = true;
  try { await loadGame(openGame) } catch { } finally { gameBusy = false }
}, LIVE_GAME_MS);
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
  // Nothing new since the last check: keep the screen as it is (no redraw, no flicker).
  const sig = id + JSON.stringify([game, box, pbp]);
  if (sig === gameSig && gameDetail?.id === id) { loadPlayCounts(id); return }
  gameSig = sig;
  const firstLoad = gameDetail?.id !== id;
  gameDetail = { id, game: game?.contests?.[0] || null, box, pbp: revealPbp(id, pbp, firstLoad) };
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
  loadPlayCounts(id);
}
function statRow(lbl, a, h, fmt = x => x) {
  const tot = (a + h) || 1;
  return `<div class="stbar"><b class="num">${fmt(a)}</b><span class="bar l"><i style="width:${a / tot * 100}%;background:var(--ink)"></i></span><span>${lbl}</span><span class="bar"><i style="width:${h / tot * 100}%;background:var(--ball)"></i></span><b class="num" style="text-align:right">${fmt(h)}</b></div>`;
}
const pct = (m, a) => a ? Math.round(m / a * 100) : 0;
function drawGame() {
  const boxEl = DETAIL;
  const sg = (cache[gday] || []).concat(cache.t || []).find(g => g.gameID === openGame);
  if (typeof MG !== "undefined" && !MG.hidden) { boxEl.hidden = true; if (openGame && sg) drawPhoneGame(sg); return } // phones: full-screen game view
  if (!openGame || !sg) { boxEl.hidden = true; window.CBBChat?.close(); return }
  boxEl.hidden = false;
  window.CBBChat?.show(CHATMOUNT, sg.gameID, `${fix(sg.away.names.short)} at ${fix(sg.home.names.short)}`);
  const d = gameDetail && gameDetail.id === openGame ? gameDetail : null;
  const c = d?.game, teams = c?.teams || [];
  const tHome = teams.find(t => t.isHome) || {}, tAway = teams.find(t => !t.isHome) || {};
  const st = status(sg), pre = sg.gameState === "pre";
  const side = (s, t, r) => `<a class="side tlink ${r ? "r" : ""}" href="/team/${esc(logoSlug(s.names.short, s.names.seo))}" title="Open ${esc(fix(s.names.short))} team page">${mono(s.names.short, s.names.seo, t.color, "lg")}<div><strong>${(s.rank || apRank(s.names.short)) ? `<span style="color:var(--ball)">#${s.rank || apRank(s.names.short)}</span> ` : ""}${esc(fix(s.names.short))}</strong><small>${esc(recordOf(s.names.short, sg, s === sg.home ? "home" : "away") || fix(t.record || "").replace(/[()]/g, ""))}${CONF[confOf(s)] ? " · " + CONF[confOf(s)] : ""}</small></div></a>`;
  let html = `<div class="gh">${side(sg.away, tAway)}<div class="big">${pre ? "vs" : `${esc(sg.away.score)}–${esc(sg.home.score)}`}<small class="${st.cls}">${esc(st.txt)}</small>${tvHTML(sg.network, 1)}${sg.gameState === "final" ? `<button class="sharebtn" data-share="${sg.gameID}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Share final</button>` : ""}</div>${side(sg.home, tHome, 1)}</div>${pickHTML(sg)}`;
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
  const plays = (d.pbp?.periods || []).flatMap(p => (p.playbyplayStats || []).map(x => ({ ...x, per: p.periodDisplay || "" }))).filter(x => !isSub(x.eventDescription || x.homeText || x.visitorText)).reverse().slice(0, 25);
  for (const p of plays) { p.key = playKey(p, p.per); notePlay(sg.gameID, p.key, { desc: fix(p.eventDescription || p.homeText || p.visitorText || "").replace(/\s+/g, " ").trim(), per: (p.per || "").replace(" Half", ""), clock: p.clock, h: p.homeScore, v: p.visitorScore }) }
  const pbpHtml = plays.length ? `<div class="plays">${plays.map(p => {
    const home = String(p.teamId) === idHome, away = String(p.teamId) === idAway;
    const who = home ? sg.home.names.short : away ? sg.away.names.short : "";
    return `<div class="play"><span class="t">${esc((p.per || "").replace(" Half", "").replace(/^(\d)(st|nd)$/, "$1$2"))} ${esc(p.clock)}</span><span>${who ? `<b>${esc(fix(who))}</b> · ` : ""}${esc(fix(p.eventDescription || p.homeText || p.visitorText))}</span><b>${p.visitorScore}–${p.homeScore}</b>${playBar(sg.gameID, p.key, true)}</div>`;
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
      ${(BX.rebuilt ? [["Players", ps]] : [["Starters", ps.filter(p => p.starter)], ["Bench", ps.filter(p => !p.starter)]]).filter(x => x[1].length).map(([lbl, list]) => `<tr class="grp"><td colspan="11">${lbl}</td></tr>${list.map(row).join("")}`).join("")}
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

// ---------- comments + reactions on plays ----------
// Each play gets a short ID from its period, clock, score and description, so phone and desktop agree.
// Comments are chat messages tagged with that ID (same accounts and rules as the game chat); see plays-setup.sql.
// Reactions fit the play: good plays get hype emojis, misses and mistakes get bricks and clowns.
const EMOJI_SETS = {
  good: ["🔥", "🐐", "🎯", "💪", "👏", "🤯"],
  bad: ["🧱", "🤡", "😬", "🗑️", "🤦", "😂"],
  other: ["👀", "🔥", "😱", "😂", "👏", "🧱"],
};
// What kind of play this is, from the NCAA's description ("Jumper MISSED by…", "Free Throw by…", "Foul on…").
const SHOT_RE = /jumper|jump shot|layup|lay-up|dunk|3pt|3-pt|three point|hook|tip.?in|tip shot|free throw|floater|alley.?oop|putback|two point|2pt/i;
const isShot = d => SHOT_RE.test(d) && !/rebound|^block|block by|steal|turnover|foul on/i.test(d);
function playMood(desc) {
  const d = String(desc || "");
  if (/miss|turnover|foul|violation|travel|lost ball|bad pass|out of bounds|shot clock|charge|technical|kicked ball|3 second|three second|double dribble|backcourt|airball|blocked/i.test(d)) return "bad";
  if (isShot(d)) return "good"; // the NCAA writes made shots as just "Free Throw by …" or "Jumper by …"
  if (/made|good|dunk|slam|steal|block|assist|and.?one|offensive rebound|alley/i.test(d)) return "good";
  return "other";
}
// Substitutions ("Subbing in for …", "… enters the game") are left out of the play-by-play.
const isSub = d => /^\s*subbing|substitution|enters the game|leaves the game|\bsubbing (in|out)\b|\bsub (in|out)\b/i.test(String(d || ""));
// A short, punchy headline for each play (like "💦 Three" or "🧱 Missed layup") plus a style for its card.
function playType(desc) {
  const d = String(desc || ""), miss = /miss/i.test(d);
  if (/media|tv time ?out|official'?s? time ?out/i.test(d)) return { e: "📺", l: "Media timeout", k: "pause" };
  if (/time ?out/i.test(d)) return { e: "⏸️", l: "Timeout", k: "pause" };
  if (/review|replay/i.test(d)) return { e: "🎥", l: "Under review", k: "pause" };
  if (/jump ?ball|held ball|possession arrow|alternating possession/i.test(d)) return { e: "🤾", l: "Jump ball", k: "jump" };
  if (/flagrant/i.test(d) && !/free throw/i.test(d)) { const n = (/flagrant\s*(?:foul\s*)?(?:type\s*)?(1|2|i{1,2})\b/i.exec(d) || [])[1]; return { e: "🟥", l: n ? `Flagrant ${/^i+$/i.test(n) ? n.length : n}` : "Flagrant foul", k: "flag" } }
  if (/technical/i.test(d) && !/free throw/i.test(d)) return { e: "⚠️", l: "Technical foul", k: "tech" };
  if (/dead ?ball|team rebound/i.test(d)) return { e: "📤", l: "Out of bounds", k: "oob" };
  if (/shot clock/i.test(d)) return { e: "⏱️", l: "Shot clock violation", k: "to" };
  if (/out of bounds|stepped out/i.test(d)) return { e: "📤", l: "Out of bounds", k: "to" };
  if (/lane violation|kicked ball|3[- ]second|three[- ]second|5[- ]second|five[- ]second|10[- ]second|ten[- ]second|backcourt/i.test(d)) return { e: "🚩", l: "Violation", k: "to" };
  if (/offensive foul|charge/i.test(d)) return { e: "🟨", l: "Offensive foul", k: "foul" };
  if (/foul/i.test(d)) return { e: "🟨", l: "Foul", k: "foul" };
  if (/travel/i.test(d)) return { e: "🚶", l: "Travel", k: "to" };
  if (/turnover|lost ball|bad pass|out of bounds|violation|shot clock|double dribble|backcourt/i.test(d)) return { e: "😬", l: "Turnover", k: "to" };
  if (/^\s*steal|steal by/i.test(d)) return { e: "🥷", l: "Steal", k: "def" };
  if (/^\s*block|block by/i.test(d)) return { e: "🚫", l: "Rejected", k: "def" };
  if (/offensive rebound/i.test(d)) return { e: "💪", l: "Offensive board", k: "board" };
  if (/rebound/i.test(d)) return { e: "🧲", l: "Rebound", k: "board" };
  if (/free throw/i.test(d)) return miss ? { e: "❌", l: "Missed free throw", k: "miss", n: "free throw" } : { e: "🎯", l: "Free throw", k: "ft", n: "free throw" };
  if (/3pt|3-pt|three point/i.test(d)) return miss ? { e: "🧱", l: "Missed three", k: "miss", n: "three" } : { e: "💦", l: "Splash! Three", k: "three", n: "three" };
  if (/dunk|slam|alley/i.test(d)) return miss ? { e: "🧱", l: "Missed dunk", k: "miss", n: "dunk" } : { e: "💥", l: "Slam dunk", k: "dunk", n: "dunk" };
  if (/layup|lay-up|putback|tip/i.test(d)) return miss ? { e: "🧱", l: "Missed layup", k: "miss", n: "layup" } : { e: "🏀", l: "Layup", k: "two", n: "layup" };
  if (/hook/i.test(d)) return miss ? { e: "🧱", l: "Missed hook", k: "miss", n: "hook shot" } : { e: "🪝", l: "Hook shot", k: "two", n: "hook shot" };
  if (isShot(d)) return miss ? { e: "🧱", l: "Missed jumper", k: "miss", n: "jumper" } : { e: "🎯", l: "Jumper", k: "two", n: "jumper" };
  return { e: "📣", l: "", k: "other" };
}
const MOOD_ICON = { good: "🔥", bad: "🗑️", other: "👀" };
// The player a play is about: "… by La Salle's Rob Dockery" → "Rob Dockery"
function playerOf(desc) {
  const m = /\b(?:by|on)\s+(?:[^()]*?'s\s+)?([A-Z][^()]*?)\s*(?:\(|$)/.exec(String(desc || ""));
  return m ? m[1].replace(/\s+(made|missed)$/i, "").trim() : "";
}
const shortName = n => { const p = n.split(/\s+/); return p.length > 1 ? `${p[0][0]}. ${p.slice(1).join(" ")}` : n };
const emojisFor = (gid, key) => EMOJI_SETS[playMood(PLAYINFO[gid]?.[key]?.desc)];
const PLAYCT = {}, MYREACT = {}, PLAYINFO = {};   // per game: { playKey: {...} }
let playsOn = !!(window.CHAT_CONFIG?.url && (window.CHAT_CONFIG?.anonKey || "").length > 20), playCtAt = {}, pickerFor = null;
function playKey(x, per) {
  const desc = fix(x.eventDescription || x.homeText || x.visitorText || "").replace(/\s+/g, " ").trim();
  const str = `${per}|${x.clock || ""}|${x.homeScore ?? ""}-${x.visitorScore ?? ""}|${desc}`;
  let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36);
}
function notePlay(gid, key, info) { (PLAYINFO[gid] ||= {})[key] = info }
// the game chat labels play comments with the play's description
window.CBBPlayLabel = (gid, key) => { const i = PLAYINFO[gid]?.[key]; if (!i) return ""; const d = i.desc.length > 70 ? i.desc.slice(0, 68) + "…" : i.desc; return `${d}${i.per ? ` (${i.per} ${i.clock || ""})` : ""}`.trim() };
async function loadPlayCounts(gid, force) {
  if (!playsOn || !gid || (!force && Date.now() - (playCtAt[gid] || 0) < 9e3)) return;
  playCtAt[gid] = Date.now();
  try {
    const c = window.CHAT_CONFIG;
    const r = await fetch(`${c.url}/rest/v1/rpc/play_counts`, { method: "POST", headers: { apikey: c.anonKey, "content-type": "application/json" }, body: JSON.stringify({ gid }) });
    if (r.status === 404) { playsOn = false; return } // plays-setup.sql hasn't been run yet
    if (!r.ok) return;
    const rows = await r.json(), ct = {};
    for (const x of rows || []) ct[x.play_key] = { c: +x.comments || 0, r: x.reactions || {} };
    PLAYCT[gid] = ct;
    await loadMyReactions(gid);
    if (openGame === gid) drawGame();
    if (THREAD && THREAD.gid === gid) drawThread();
  } catch { }
}
async function loadMyReactions(gid) {
  const chat = window.CBBChat; if (!chat?.on || !chat.hasSession()) return;
  try {
    const sb = await chat.client(); if (!chat.me()) return;
    const { data } = await sb.from("play_reactions").select("play_key, emoji").eq("game_id", gid);
    const mine = {}; for (const x of data || []) (mine[x.play_key] ||= new Set()).add(x.emoji);
    MYREACT[gid] = mine;
  } catch { }
}
window.addEventListener("cbb-auth", () => { for (const k in MYREACT) delete MYREACT[k]; if (openGame) loadPlayCounts(openGame, true); if (THREAD) drawThread() });
async function toggleReact(gid, key, emoji) {
  const chat = window.CBBChat; if (!chat?.on || !playsOn) return;
  if (!chat.me()) { chat.auth(chat.hasSession() ? "login" : "signup", "React and comment on plays with a free account. It's the same account as the game chat."); return }
  const mine = ((MYREACT[gid] ||= {})[key] ||= new Set()), ct = ((PLAYCT[gid] ||= {})[key] ||= { c: 0, r: {} });
  const had = mine.has(emoji);
  const apply = on => { if (on) { mine.add(emoji); ct.r[emoji] = (ct.r[emoji] || 0) + 1 } else { mine.delete(emoji); ct.r[emoji] = Math.max(0, (ct.r[emoji] || 1) - 1); if (!ct.r[emoji]) delete ct.r[emoji] } };
  apply(!had); drawGame(); if (THREAD) drawThread();
  try {
    const sb = await chat.client();
    const { error } = had ? await sb.from("play_reactions").delete().eq("game_id", gid).eq("play_key", key).eq("emoji", emoji)
      : await sb.from("play_reactions").insert({ game_id: gid, play_key: key, emoji });
    if (error && !/duplicate/i.test(error.message || "")) throw error;
  } catch { apply(had); drawGame(); if (THREAD) drawThread() }
}
// The reaction + comment row under a play
function playBar(gid, key, compact) {
  if (!playsOn || !window.CBBChat?.on) return "";
  const ct = PLAYCT[gid]?.[key] || { c: 0, r: {} }, mine = MYREACT[gid]?.[key] || new Set();
  const tops = Object.entries(ct.r).sort((a, b) => b[1] - a[1]), total = tops.reduce((n, x) => n + x[1], 0);
  const sum = total ? `${tops.slice(0, 3).map(x => `<i>${x[0]}</i>`).join("")}<b>${total}</b>` : `<i class="pr-add">${MOOD_ICON[playMood(PLAYINFO[gid]?.[key]?.desc)]}</i>${compact ? "<b>React</b>" : ""}`;
  const set = [...new Set([...emojisFor(gid, key), ...Object.keys(ct.r)])];
  const picker = pickerFor === key ? `<div class="pr-pick${compact ? " wide" : ""}">${set.map(e => `<button class="${mine.has(e) ? "on" : ""}" data-react="${e}" data-rkey="${key}" aria-label="React ${e}">${e}${ct.r[e] ? `<b>${ct.r[e]}</b>` : ""}</button>`).join("")}</div>` : "";
  if (compact) return `<span class="pact"><button class="pr-sum ${mine.size ? "on" : ""}" data-picker="${key}" title="React">${sum}</button><button class="pr-com" data-thread="${key}" title="Comments">💬${ct.c ? ` <b>${ct.c}</b>` : ""}</button></span>${picker}`;
  return `<div class="pr"><button class="pr-sum ${mine.size ? "on" : ""}" data-picker="${key}" aria-label="React to this play" title="React">${sum}</button><button class="pr-com" data-thread="${key}" aria-label="Comments" title="Comments">💬${ct.c ? ` <b>${ct.c}</b>` : ""}</button></div>${picker}`;
}
// ---- the thread for one play ----
let THREAD = null; // { gid, key, msgs, channel, loading }
const PT = document.createElement("div");
PT.className = "pt"; PT.hidden = true;
PT.innerHTML = `<div class="pt-card" role="dialog" aria-modal="true" aria-label="Comments on this play"><div class="pt-grab"></div><div class="pt-head"><b>Play</b><button class="mg-x" data-ptclose aria-label="Close">×</button></div><div class="pt-play"></div><div class="pt-list"></div><div class="pt-foot"></div></div>`;
document.body.appendChild(PT);
async function openThread(gid, key) {
  closeThread();
  const t = THREAD = { gid, key, msgs: [], loading: true };
  PT.hidden = false; drawThread();
  let sb;
  try {
    sb = await window.CBBChat.client();
    const { data, error } = await sb.from("messages").select("id, user_id, username, body, created_at").eq("game_id", gid).eq("play_key", key).eq("deleted", false).order("created_at", { ascending: true }).limit(200);
    if (THREAD !== t) return;
    if (error) throw error;
    t.msgs = data || []; t.loading = false; t.err = false;
  } catch (e) {
    console.warn("Play comments:", e);
    if (THREAD === t) { t.loading = false; t.err = true; drawThread() }
    return;
  }
  drawThread(true);
  // live updates: a fresh channel each time, so reopening the same play never collides with the old one
  try {
    t.channel = sb.channel(`play-${gid}-${key}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `game_id=eq.${gid}` }, p => {
        if (THREAD !== t || p.new.play_key !== key || t.msgs.some(m => m.id === p.new.id)) return;
        t.msgs.push(p.new); bumpCount(gid, key, 1); drawThread(true);
      }).subscribe();
  } catch (e) { console.warn("Play comments live updates:", e) }
}
function closeThread() {
  const ch = THREAD?.channel;
  if (ch) window.CBBChat.client().then(sb => sb.removeChannel(ch)).catch(() => { });
  THREAD = null; PT.hidden = true;
}
function bumpCount(gid, key, d) { const ct = ((PLAYCT[gid] ||= {})[key] ||= { c: 0, r: {} }); ct.c = Math.max(0, ct.c + d); drawGame() }
function drawThread(scrollDown) {
  if (!THREAD) return;
  const { gid, key } = THREAD, info = PLAYINFO[gid]?.[key] || {}, g = Object.values(cache).flat().find(x => x.gameID === gid);
  const me = window.CBBChat?.me(), ct = PLAYCT[gid]?.[key] || { c: 0, r: {} }, mine = MYREACT[gid]?.[key] || new Set();
  PT.querySelector(".pt-play").innerHTML = `${g ? `<div class="fp-meta">${mono(g.away.names.short, g.away.names.seo)}<b>${esc(info.v ?? "")}–${esc(info.h ?? "")}</b>${mono(g.home.names.short, g.home.names.seo)}<span>${esc(info.per || "")} ${esc(info.clock || "")}</span></div>` : ""}<div class="pt-desc">${esc(info.desc || "Play")}</div>
    <div class="pr-pick open">${[...new Set([...emojisFor(gid, key), ...Object.keys(ct.r)])].map(e => `<button class="${mine.has(e) ? "on" : ""}" data-react="${e}" data-rkey="${key}" aria-label="React ${e}">${e}${ct.r[e] ? `<b>${ct.r[e]}</b>` : ""}</button>`).join("")}</div>`;
  const list = PT.querySelector(".pt-list"), near = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  list.innerHTML = THREAD.loading ? `<p class="pt-empty">Loading comments…</p>` : THREAD.err ? `<p class="pt-empty">Comments couldn't load. <button class="chat-link" data-ptretry>Try again</button></p>`
    : THREAD.msgs.length ? THREAD.msgs.map(m => `<div class="chat-msg ${me && m.user_id === me.id ? "mine" : ""}"><div class="chat-meta"><b>${esc(m.username)}</b><time>${new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time><span class="chat-tools">${me && me.is_admin ? `<button class="chat-link danger" data-ptdel="${m.id}">Delete</button>` : me && m.user_id !== me.id ? `<button class="chat-link" data-ptrep="${m.id}">Report</button>` : ""}</span></div><p>${esc(m.body)}</p></div>`).join("")
    : `<p class="pt-empty">No comments yet. Be the first to react to this play.</p>`;
  if (scrollDown || near) list.scrollTop = list.scrollHeight;
  const foot = PT.querySelector(".pt-foot");
  const want = !me ? "join" : me.banned ? "banned" : "form";
  if (foot.dataset.mode !== want) {
    foot.dataset.mode = want;
    foot.innerHTML = want === "join" ? `<div class="chat-join"><span>Log in to comment and react.</span><button class="chat-btn" data-ptauth="signup">Create account</button><button class="chat-btn ghost" data-ptauth="login">Log in</button></div>`
      : want === "banned" ? `<div class="chat-join"><span>You've been removed from the chat.</span></div>`
      : `<form class="chat-form" data-ptform><input maxlength="280" autocomplete="off" placeholder="Add a comment…" aria-label="Comment on this play"><button class="chat-btn" type="submit">Post</button></form><p class="pt-msg" role="status"></p>`;
  }
}
PT.addEventListener("click", async e => {
  const t = e.target;
  if (t === PT || t.closest("[data-ptclose]")) { closeThread(); return }
  if (t.closest("[data-ptretry]") && THREAD) { openThread(THREAD.gid, THREAD.key); return }
  const a = t.closest("[data-ptauth]"); if (a) { window.CBBChat.auth(a.dataset.ptauth, "Comment and react on plays with a free account. It's the same account as the game chat."); return }
  const r = t.closest("[data-react]"); if (r && THREAD) { toggleReact(THREAD.gid, r.dataset.rkey, r.dataset.react); return }
  const del = t.closest("[data-ptdel]"); if (del && THREAD) {
    const sb = await window.CBBChat.client(); const { error } = await sb.from("messages").update({ deleted: true }).eq("id", +del.dataset.ptdel);
    if (!error) { THREAD.msgs = THREAD.msgs.filter(m => m.id !== +del.dataset.ptdel); bumpCount(THREAD.gid, THREAD.key, -1); drawThread() } return;
  }
  const rep = t.closest("[data-ptrep]"); if (rep && THREAD) {
    const sb = await window.CBBChat.client(); const me = window.CBBChat.me();
    await sb.from("reports").insert({ message_id: +rep.dataset.ptrep, game_id: THREAD.gid, reporter: me.id });
    rep.replaceWith(Object.assign(document.createElement("span"), { className: "chat-done", textContent: "Reported" })); return;
  }
});
PT.addEventListener("submit", async e => {
  e.preventDefault(); if (!THREAD) return;
  const f = e.target, input = f.querySelector("input"), msg = PT.querySelector(".pt-msg"), body = input.value.replace(/\s+/g, " ").trim();
  if (!body) return;
  const me = window.CBBChat.me(); if (!me) return;
  input.disabled = true; msg.textContent = "";
  const { gid, key } = THREAD;
  try {
    const sb = await window.CBBChat.client();
    const { data, error } = await sb.from("messages").insert({ game_id: gid, user_id: me.id, username: me.username, body, play_key: key }).select().single();
    if (error) throw error;
    input.value = "";
    if (THREAD && THREAD.key === key && !THREAD.msgs.some(m => m.id === data.id)) { THREAD.msgs.push(data); bumpCount(gid, key, 1); drawThread(true) }
  } catch (err) { msg.textContent = String(err.message || "").replace(/^.*?:\s*(?=[A-Z])/, "") || "That didn't post. Try again." }
  input.disabled = false; input.focus();
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && THREAD) closeThread() });
// taps on reaction buttons and comment counts, in the phone feed and the desktop play-by-play
document.addEventListener("click", e => {
  const t = e.target; if (!t.closest || t.closest(".pt")) return;
  const pk = t.closest("[data-picker]"); if (pk) { e.stopPropagation(); pickerFor = pickerFor === pk.dataset.picker ? null : pk.dataset.picker; mgBodyKey = ""; drawGame(); return }
  const r = t.closest("[data-react]"); if (r && openGame) { e.stopPropagation(); toggleReact(openGame, r.dataset.rkey, r.dataset.react); return }
  const th = t.closest("[data-thread]"); if (th && openGame) { e.stopPropagation(); if (!window.CBBChat?.on) return; openThread(openGame, th.dataset.thread) }
}, true);

// ---------- phone game view (like the Real app) ----------
// On phones, tapping a game opens a full-screen view: other games across the top, the score, then tabs for
// Feed (play-by-play), Game (stats, picks, share) and each team's box score, with Chat in a bar at the bottom.
// Desktop keeps the panel that opens under the card.
const MQ = matchMedia("(max-width: 760px)");
const isPhone = () => MQ.matches;
let mgTab = "feed", mgFeed = "all", mgPushed = false, mgBodyKey = "", mgScrollY = 0;
const MG = document.createElement("div");
MG.className = "mg"; MG.id = "mg"; MG.hidden = true;
MG.innerHTML = `<div class="mg-top"><button class="mg-back" data-mgback aria-label="Back to scores"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="mg-strip" id="mgstrip"></div></div>
  <div class="mg-score" id="mgscore"></div><div class="mg-tabs" id="mgtabs" role="tablist"></div>
  <div class="mg-body" id="mgbody"></div><div class="mg-dock" id="mgdock"></div>
  <div class="mg-sheet" id="mgsheet" hidden><div class="mg-sheet-grab"></div><div class="mg-sheet-head"><b>Game chat</b><button class="mg-x" data-mgchatclose aria-label="Close chat">×</button></div><div class="mg-chat" id="mgchat"></div></div>`;
document.body.appendChild(MG);
// the chat's own "Hide chat" button closes the sheet on phones
MG.querySelector("#mgsheet").addEventListener("click", e => { if (e.target.closest('[data-chat="hide"]')) { e.stopPropagation(); if (isPhone()) closeChatSheet() } }, true);
function openPhoneGame(id) {
  const fresh = MG.hidden;
  openGame = id; gameDetail = null; boxSide = "away"; mgBodyKey = "";
  const g = Object.values(cache).flat().find(x => x.gameID === id);
  mgTab = g && g.gameState === "pre" ? "game" : "feed"; mgFeed = "all";
  if (fresh) { history.pushState({ mg: id }, ""); mgPushed = true; mgScrollY = scrollY; if (!isPhone()) scrollTo(0, 0) } else history.replaceState({ mg: id }, "");
  MG.hidden = false; document.documentElement.classList.add("mg-open");
  closeChatSheet(true);
  drawGame(); loadGame(id);
  $("#mgbody").scrollTop = 0;
  if (!isPhone()) openChatSheet(); // desktop: the chat sits beside the feed the whole time
}
function closePhoneGame(fromHistory) {
  if (MG.hidden) return;
  closeThread();
  if (!fromHistory && mgPushed) { mgPushed = false; history.back(); return } // popstate brings us back here
  mgPushed = false;
  MG.hidden = true; document.documentElement.classList.remove("mg-open");
  closeChatSheet(true);
  openGame = null; gameDetail = null; drawGames();
  if (!isPhone()) scrollTo(0, mgScrollY); // back to where you were on the scores
}
addEventListener("popstate", () => { if (!MG.hidden) closePhoneGame(true) });
function openChatSheet() {
  const sg = Object.values(cache).flat().find(x => x.gameID === openGame); if (!sg || !window.CBBChat?.on) return;
  $("#mgsheet").hidden = false; MG.classList.add("chat-up");
  window.CBBChat.show($("#mgchat"), sg.gameID, `${fix(sg.away.names.short)} at ${fix(sg.home.names.short)}`, { open: true });
}
function closeChatSheet(quiet) {
  const sh = $("#mgsheet"); if (!sh || sh.hidden) return;
  sh.hidden = true; MG.classList.remove("chat-up"); window.CBBChat?.close();
}
function drawPhoneGame(sg) {
  const d = gameDetail && gameDetail.id === openGame ? gameDetail : null, c = d?.game, teams = c?.teams || [];
  const tHome = teams.find(t => t.isHome) || {}, tAway = teams.find(t => !t.isHome) || {};
  const st = status(sg), pre = sg.gameState === "pre", live = sg.gameState === "live", fin = sg.gameState === "final";
  const a = +sg.away.score || 0, h = +sg.home.score || 0;
  const sa = logoSlug(sg.away.names.short, sg.away.names.seo), sh = logoSlug(sg.home.names.short, sg.home.names.seo);
  MG.style.setProperty("--ca", teamColorFor(sa) || "#333"); MG.style.setProperty("--ch", teamColorFor(sh) || "#333");
  const short = t => fix(t.names.char6 || t.names.short).trim();
  // other games today
  const order = { live: 0, pre: 1, final: 2 };
  const strip = [...(cache.t || [])].sort((x, y) => order[x.gameState] - order[y.gameState] || (+x.startTimeEpoch - +y.startTimeEpoch)).slice(0, 40);
  $("#mgstrip").innerHTML = strip.map(g => {
    const s2 = status(g), lv = g.gameState === "live";
    return `<button class="mg-mini ${g.gameID === sg.gameID ? "on" : ""}" data-mgswitch="${g.gameID}"><span class="mg-mini-st ${lv ? "lv" : ""}">${lv ? "<i></i>" : ""}${esc(s2.txt)}</span><span class="mg-mini-sc">${mono(g.away.names.short, g.away.names.seo)}<b>${g.gameState === "pre" ? "vs" : `${esc(g.away.score)}–${esc(g.home.score)}`}</b>${mono(g.home.names.short, g.home.names.seo)}</span></button>`;
  }).join("");
  const on = $("#mgstrip .mg-mini.on"); if (on && MG.dataset.stripFor !== sg.gameID) { MG.dataset.stripFor = sg.gameID; on.scrollIntoView({ inline: "center", block: "nearest" }) }
  // score header
  const tm = (t, side, score, lose) => `<a class="mg-tm ${side}" href="/team/${esc(logoSlug(t.names.short, t.names.seo))}">${mono(t.names.short, t.names.seo)}<span class="mg-sc ${lose ? "lose" : ""}">${pre ? "" : esc(score)}</span><span class="mg-nm">${rk(t) ? `<em>${rk(t)}</em> ` : ""}${esc(fix(t.names.short))}</span></a>`;
  $("#mgscore").innerHTML = `${tm(sg.away, "a", a, fin && a < h)}<div class="mg-mid"><span class="mg-st ${live ? "lv" : ""}">${live ? "<i></i>" : ""}${esc(st.txt)}</span>${tvHTML(sg.network)}${badgeHTML(badges(sg).slice(0, 1))}${sg.gameState === "final" ? `<a class="mg-rc" href="/game/${esc(sg.gameID)}">📝 Recap</a>` : sg.gameState === "pre" ? `<a class="mg-rc" href="/game/${esc(sg.gameID)}">📋 Preview</a>` : ""}${sg.gameState !== "pre" ? `<button class="mg-sg" data-sharegame="${sg.gameID}" aria-label="Share this game as a story"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Share game</button>` : ""}</div>${tm(sg.home, "h", h, fin && h < a)}${(w => w ? `<div class="mg-wp">${w}</div>` : "")(wpHTML(sg))}`;
  // tabs
  const tabs = [["feed", "Feed"], ["game", "Game"], ["away", short(sg.away)], ["home", short(sg.home)]];
  $("#mgtabs").innerHTML = tabs.map(([k, l]) => `<button role="tab" aria-selected="${mgTab === k}" data-mgtab="${k}">${esc(l)}</button>`).join("");
  // body
  const idHome = String(tHome.teamId || ""), idAway = String(tAway.teamId || ""), BX = checkedBox(d, idHome, idAway), tb = BX.tb;
  const tbFor = id => tb.find(x => String(x.teamId) === id);
  let body = "";
  if (!d) body = `<p class="mg-empty">Loading game…</p>`;
  else if (mgTab === "feed") {
    // every play, oldest first, so scoring, lead changes and ties can be worked out
    const all = (d.pbp?.periods || []).flatMap(p => (p.playbyplayStats || []).map(x => ({ ...x, per: p.periodDisplay || "" })));
    let ph = 0, pv = 0, lastPer = null, runSide = "", runPts = 0; const items = [], P = {}; // P: per player {pts, fgm, fga, streak}
    let ftCtx = "", lastBall = null; // ftCtx: "Technical"/"Flagrant" while those free throws are being shot
    const CM = { maxH: 0, maxA: 0, leadCh: 0, ties: 0, run: null }; // for the "Catch me up" card
    const other = sd => sd === "home" ? "away" : sd === "away" ? "home" : "";
    const ballTag = sd => ["poss", `▶ ${fix(sg[sd].names.short)} ball`];
    // which team a play names, for team plays the feed doesn't tag ("Jump ball won by Duke", "Duke timeout")
    const nameRx = t => [t.names.short, t.names.full, t.names.char6, t.names.seo && t.names.seo.replace(/-/g, " ")].filter(Boolean).map(n => fix(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\.\s*$/, "\\.?")).join("|");
    const rxA = new RegExp(`\\b(?:${nameRx(sg.away)})\\b`, "i"), rxH = new RegExp(`\\b(?:${nameRx(sg.home)})\\b`, "i");
    const teamIn = t => { const m = /\b(?:won|gained|to|by|for|on)\s+(.+)$/i.exec(t), part = m ? m[1] : t; const a = rxA.test(part), h = rxH.test(part); return a && !h ? "away" : h && !a ? "home" : (rxA.test(t) && !rxH.test(t) ? "away" : rxH.test(t) && !rxA.test(t) ? "home" : "") };
    for (const x of all) {
      // a divider between halves (and before overtime) with the score at that moment
      if (lastPer !== null && x.per !== lastPer) items.push({ divider: true, label: /ot|overtime/i.test(x.per) ? (/ot|overtime/i.test(lastPer) ? "End of overtime" : "End of regulation") : "Halftime", h: ph, v: pv });
      lastPer = x.per;
      const nh = x.homeScore === undefined || x.homeScore === "" ? ph : +x.homeScore, nv = x.visitorScore === undefined || x.visitorScore === "" ? pv : +x.visitorScore;
      const side = String(x.teamId) === idHome ? "home" : String(x.teamId) === idAway ? "away" : (nh > ph ? "home" : nv > pv ? "away" : "");
      let pts = (nh - ph) + (nv - pv); const tags = [];
      if (pts < 1 || pts > 4) pts = 0; // a jump bigger than one basket means plays are missing from the feed, not a score
      // runs: points one team scores while the other scores none
      if (pts > 0 && side) { if (side === runSide) runPts += pts; else { runSide = side; runPts = pts } }
      if (pts > 0 && runPts >= 7 && side === runSide) tags.push(["run", `🏃 ${fix(sg[side].names.short)} on a ${runPts}-0 run`]);
      // clutch: final two minutes of the 2nd half or overtime, within 5
      if (/2nd|ot|overtime/i.test(x.per) && clockSecs(x.clock) <= 120 && Math.abs(nh - nv) <= 5) tags.push(["clutch", "⏱️ Clutch"]);
      if (pts > 0 && items.length) {
        if ((ph - pv) * (nh - nv) < 0 || (ph === pv && nh !== nv && items.some(i => i.pts))) tags.push(["lead", (ph === pv) ? "Takes the lead" : "Lead change"]);
        if (nh === nv) tags.push(["tie", "Ties it"]);
      }
      const desc = fix(x.eventDescription || x.homeText || x.visitorText || "").replace(/\s+/g, " ").trim();
      // player lines and hot/cold streaks (field goals only; free throws count toward points)
      let line = "";
      const who = playerOf(desc);
      if (who && isShot(desc)) {
        const st = (P[who] ||= { pts: 0, fgm: 0, fga: 0, streak: 0 }), ft = /free throw/i.test(desc), miss = /miss/i.test(desc);
        if (side) st.side = side;
        if (!miss) st.pts += pts || (ft ? 1 : /3pt|three/i.test(desc) ? 3 : 2);
        if (!ft) {
          st.fga++; if (!miss) st.fgm++;
          st.streak = miss ? (st.streak < 0 ? st.streak - 1 : -1) : (st.streak > 0 ? st.streak + 1 : 1);
          if (st.streak >= 2) tags.push(["hot", `🔥 ${st.streak} straight makes`]);
          if (st.streak <= -2) tags.push(["cold", `🧊 ${-st.streak} straight misses`]);
        }
        line = `${shortName(who)} · ${st.pts} pt${st.pts === 1 ? "" : "s"}${st.fga ? `, ${st.fgm}/${st.fga} FG` : ""}`;
      } else if (who && /foul on/i.test(desc)) {
        const st = (P["foul:" + who] ||= { n: 0 }); st.n++;
        line = `${shortName(who)} · ${st.n} foul${st.n === 1 ? "" : "s"}`;
      }
      if (desc && !isSub(desc)) {
        let type = playType(desc), sd = side || teamIn(desc);
        const prev = items.length ? items[items.length - 1] : null;
        // whose ball: after turnovers, steals, out of bounds and jump balls
        let ball = "";
        if (type.k === "to" || /offensive foul|charge/i.test(desc)) ball = other(sd);
        else if (type.k === "def" && /steal/i.test(desc)) ball = sd;
        else if (type.k === "jump") ball = /lost by|lost to/i.test(desc) ? other(sd) : sd;
        else if (type.k === "oob") {
          // a dead-ball rebound after a missed first free throw just means another free throw is coming
          if (prev && prev.type.n === "free throw" && /miss/i.test(prev.desc)) type = { e: "🔁", l: "Dead ball", k: "pause" };
          else ball = sd;
        }
        // technical and flagrant free throws
        if (type.k === "tech" || type.k === "flag") ftCtx = type.k === "tech" ? "Technical" : "Flagrant";
        else if (type.n === "free throw" && ftCtx) type = { ...type, l: `${/miss/i.test(desc) ? "Missed " : ""}${ftCtx.toLowerCase() === "technical" ? "Technical" : "Flagrant"} free throw` };
        else if (type.n !== "free throw" && type.k !== "pause") ftCtx = "";
        // (a steal right after the turnover it caused doesn't repeat the same "ball" tag)
        if (ball && sg[ball] && !(lastBall && lastBall.ball === ball && (lastBall.i === items.length - 1 || (lastBall.clock === (x.clock || "") && lastBall.per === x.per)))) {
          tags.push(ballTag(ball)); lastBall = { ball, clock: x.clock || "", per: x.per, i: items.length };
        }
        const key = playKey(x, x.per); items.push({ key, desc, line, per: x.per, clock: x.clock || "", h: nh, v: nv, side: sd, pts, tags, type })
      }
      CM.maxH = Math.max(CM.maxH, nh - nv); CM.maxA = Math.max(CM.maxA, nv - nh);
      if (tags.some(t => t[0] === "lead")) CM.leadCh++; if (tags.some(t => t[0] === "tie")) CM.ties++;
      if (pts > 0 && runPts >= 6 && (!CM.run || runPts >= CM.run.pts)) CM.run = { side: runSide, pts: runPts, per: x.per, clock: x.clock || "" };
      ph = nh; pv = nv;
    }
    // how much each play moved the win probability (same model as the bar at the top)
    { const str = t => { const r = rk(t); return r ? 8 - r * .2 : 0 }, edge = 2.5 + str(sg.home) - str(sg.away);
      const wpAt = (h, v, per, clock) => { const c = clockSecs(clock), clk = c === 9999 ? 0 : c, left = /1st/i.test(per) ? 1200 + clk : clk, f = left / 2400;
        if (left <= 0) return h > v ? 1 : h < v ? 0 : .5; return normCdf((h - v + edge * f) / (11 * Math.sqrt(f) + 1.5)) };
      let prev = normCdf(edge / 11 * .4);
      for (const i of items) { if (i.divider) continue; const w = wpAt(i.h, i.v, i.per, i.clock); i.wp = w - prev; prev = w } }
    const cmu = catchUpHTML(sg, CM, P, items.filter(i => !i.divider).length);
    GAMESTORY[sg.gameID] = { CM, P, series: items.filter(i => !i.divider).map(i => ({ lead: i.h - i.v, per: i.per })) }; // for "Share game"
    const shown = (mgFeed === "scoring" ? items.filter(i => i.pts > 0 || i.divider) : items).reverse().slice(0, 250);
    const perLbl = p => String(p).replace(/1st Half|1st/i, "H1").replace(/2nd Half|2nd/i, "H2").replace(/Overtime/i, "OT");
    for (const i of shown) if (!i.divider) notePlay(sg.gameID, i.key, { desc: i.desc, per: perLbl(i.per), clock: i.clock, h: i.h, v: i.v, side: i.side, pts: i.pts, e: i.type.e, l: i.type.l, n: i.type.n, tags: i.tags.map(t => t[1]), line: i.line });
    body = cmu + `<div class="mg-feedbar"><button data-mgfeed="all" aria-pressed="${mgFeed === "all"}">All plays</button><button data-mgfeed="scoring" aria-pressed="${mgFeed === "scoring"}">Scoring</button></div>` +
      (shown.some(i => !i.divider) ? shown.map(i => {
        if (i.divider) return `<div class="fp-div"><span>${esc(i.label)}</span><b>${esc(short(sg.away))} ${i.v} – ${i.h} ${esc(short(sg.home))}</b></div>`;
        const t = i.side ? sg[i.side] : null, ty = i.type;
        const tc = t ? teamColorFor(logoSlug(t.names.short, t.names.seo)) || "#444" : "#2A2A2E";
        const big = i.pts >= 3 ? "three" : i.pts > 0 ? "score" : "";
        // context for the headline: "Go-ahead three", "Game-tying layup"
        let head = ty.l || "";
        if (ty.n && i.pts > 0) { if (i.tags.some(x => x[0] === "lead")) head = `Go-ahead ${ty.n}`; else if (i.tags.some(x => x[0] === "tie")) head = `Game-tying ${ty.n}` }
        const sc = (n, sd) => `<b class="${i.pts > 0 && i.side === sd ? "lit" : ""}">${n}</b>`;
        return `<div class="fp ${big} k-${ty.k} ${i.tags.length ? "key" : ""}" style="--tc:${tc}">
          <div class="fp-av">${t ? mono(t.names.short, t.names.seo) : `<span class="fp-dot">${ty.e}</span>`}${i.pts > 0 ? `<span class="fp-pts">+${i.pts}</span>` : ""}</div>
          <div class="fp-main"><div class="fp-meta">${mono(sg.away.names.short, sg.away.names.seo)}${sc(i.v, "away")}<i>–</i>${sc(i.h, "home")}${mono(sg.home.names.short, sg.home.names.seo)}<span>${esc(perLbl(i.per))} ${esc(i.clock)}</span>${Math.abs(i.wp || 0) >= .01 ? (sd => `<em class="fp-wp" style="--wc:${teamColorFor(logoSlug(sg[sd].names.short, sg[sd].names.seo)) || "#888"}" title="Win probability swing toward ${esc(fix(sg[sd].names.short))}">▲${(Math.abs(i.wp) * 100).toFixed(1)}% <small>${esc(short(sg[sd]))}</small></em>`)(i.wp > 0 ? "home" : "away") : ""}</div>
          ${head ? `<div class="fp-head"><span class="fp-emo">${ty.e}</span>${esc(head)}</div>${i.line ? "" : `<div class="fp-sub">${esc(i.desc)}</div>`}` : `<div class="fp-desc">${esc(i.desc)}</div>`}
          <button class="fp-share" data-shareplay="${i.key}" aria-label="Share this play" title="Share this play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>${i.line ? `<div class="fp-line">${esc(i.line)}</div>` : ""}${(tg => tg.length ? `<div class="fp-tags">${tg.map(([k, l]) => `<span class="fpt-${k}">${esc(l)}</span>`).join("")}</div>` : "")(i.tags.filter(x => !(/^(Go-ahead|Game-tying)/.test(head) && (x[0] === "lead" || x[0] === "tie"))))}${playBar(sg.gameID, i.key)}</div></div>`;
      }).join("") : `<p class="mg-empty">${pre ? "The feed starts at tip-off. Check the Game tab to make your pick." : "No play-by-play for this game."}</p>`);
  } else if (mgTab === "game") {
    const ls = c?.linescores || [];
    const lsT = ls.length ? `<h4>Score by period</h4><div class="tblwrap"><table class="mg-ls"><thead><tr><th></th>${ls.map(l => `<th class="num">${+l.period <= 2 ? (l.period === "1" ? "1st" : "2nd") : "OT" + (+l.period > 3 ? +l.period - 2 : "")}</th>`).join("")}<th class="num">T</th></tr></thead><tbody>
      <tr><td>${esc(short(sg.away))}</td>${ls.map(l => `<td class="num">${esc(l.visit)}</td>`).join("")}<td class="num"><b>${a}</b></td></tr>
      <tr><td>${esc(short(sg.home))}</td>${ls.map(l => `<td class="num">${esc(l.home)}</td>`).join("")}<td class="num"><b>${h}</b></td></tr></tbody></table></div>` : "";
    const S = tbFor(idHome)?.teamStats, A = tbFor(idAway)?.teamStats, n = v => +v || 0;
    const stats = S && A ? `<h4>Team stats <span class="mg-k">${esc(short(sg.away))} · ${esc(short(sg.home))}</span></h4>
      ${statRow("FG%", pct(n(A.fieldGoalsMade), n(A.fieldGoalsAttempted)), pct(n(S.fieldGoalsMade), n(S.fieldGoalsAttempted)))}
      ${statRow("3PT%", pct(n(A.threePointsMade), n(A.threePointsAttempted)), pct(n(S.threePointsMade), n(S.threePointsAttempted)))}
      ${statRow("FT%", pct(n(A.freeThrowsMade), n(A.freeThrowsAttempted)), pct(n(S.freeThrowsMade), n(S.freeThrowsAttempted)))}
      ${statRow("Reb", n(A.totalRebounds), n(S.totalRebounds))}${statRow("Ast", n(A.assists), n(S.assists))}${statRow("Stl", n(A.steals), n(S.steals))}${statRow("Blk", n(A.blockedShots), n(S.blockedShots))}${statRow("TO", n(A.turnovers), n(S.turnovers))}` : "";
    const series = []; let pk = "";
    for (const p of d.pbp?.periods || []) for (const x of p.playbyplayStats || []) { if (x.homeScore === undefined || x.homeScore === "") continue; const k = x.homeScore + "-" + x.visitorScore; if (k === pk) continue; pk = k; series.push({ lead: (+x.homeScore || 0) - (+x.visitorScore || 0), per: p.periodDisplay || "" }) }
    const loc = c?.location ? `${fix(c.location.venue)}${c.location.city ? ", " + fix(c.location.city) : ""}${c.location.stateUsps ? ", " + c.location.stateUsps : ""}` : "";
    body = `${pickHTML(sg)}${series.length >= 4 ? `<div class="mg-card">${momentumSVG(series, sg)}</div>` : ""}<div class="mg-card">${lsT || `<h4>Tip-off</h4><p class="mg-p">${esc(st.txt)}${sg.network ? " on " + esc(sg.network) : ""}</p>`}${stats}${loc ? `<p class="mg-p mg-loc">${esc(loc)}</p>` : ""}</div>`;
  } else {
    const side = mgTab, id = side === "home" ? idHome : idAway, ps = tbFor(id)?.playerStats || [], ts = tbFor(id)?.teamStats;
    if (!ps.length) body = `<p class="mg-empty">${pre ? "The box score goes live at tip-off." : "No box score for this game."}</p>`;
    else {
      const row = p => `<tr class="${isPinned(sg.gameID, side, p) ? "pinned" : ""}"><td><button class="pinbtn ${isPinned(sg.gameID, side, p) ? "on" : ""}" data-pin="${esc(side)}|${esc(p.firstName || "")}|${esc(p.lastName || "")}" aria-label="${isPinned(sg.gameID, side, p) ? "Stop tracking" : "Track"} ${esc(fix(`${p.firstName || ""} ${p.lastName || ""}`))}" title="Track this player">★</button><span class="pn">${esc(p.number)}</span>${esc(fix((p.firstName || "").charAt(0) + ". " + p.lastName))} <span class="pp">${esc(p.position || "")}</span></td><td class="num"><b>${esc(p.points)}</b></td><td class="num">${esc(p.totalRebounds)}</td><td class="num">${esc(p.assists)}</td><td class="num">${esc(p.minutesPlayed ?? "")}</td><td class="num">${esc(p.fieldGoalsMade)}-${esc(p.fieldGoalsAttempted)}</td><td class="num">${esc(p.threePointsMade)}-${esc(p.threePointsAttempted)}</td><td class="num">${esc(p.freeThrowsMade)}-${esc(p.freeThrowsAttempted)}</td><td class="num">${esc(p.steals)}</td><td class="num">${esc(p.blockedShots)}</td><td class="num">${esc(p.turnovers)}</td><td class="num">${esc(p.personalFouls ?? "")}</td></tr>`;
      body = `${BX.rebuilt ? `<p class="mg-p mg-boxnote">⚠️ The official box score for this game is incomplete right now, so these stats are counted from the play-by-play (minutes aren't available).</p>` : ""}<div class="tblwrap mg-box"><table class="box"><thead><tr><th>${esc(fix(sg[side].names.short))}</th><th class="num">Pts</th><th class="num">Reb</th><th class="num">Ast</th><th class="num">Min</th><th class="num">FG</th><th class="num">3PT</th><th class="num">FT</th><th class="num">Stl</th><th class="num">Blk</th><th class="num">TO</th><th class="num">PF</th></tr></thead><tbody>
        ${(BX.rebuilt ? [["Players", ps]] : [["Starters", ps.filter(p => p.starter)], ["Bench", ps.filter(p => !p.starter)]]).filter(x => x[1].length).map(([l, list]) => `<tr class="grp"><td colspan="12">${l}</td></tr>${list.map(row).join("")}`).join("")}
        ${ts ? `<tr class="totals"><td>Team</td><td class="num">${esc(ts.points)}</td><td class="num">${esc(ts.totalRebounds)}</td><td class="num">${esc(ts.assists)}</td><td class="num"></td><td class="num">${esc(ts.fieldGoalsMade)}-${esc(ts.fieldGoalsAttempted)}</td><td class="num">${esc(ts.threePointsMade)}-${esc(ts.threePointsAttempted)}</td><td class="num">${esc(ts.freeThrowsMade)}-${esc(ts.freeThrowsAttempted)}</td><td class="num">${esc(ts.steals)}</td><td class="num">${esc(ts.blockedShots)}</td><td class="num">${esc(ts.turnovers)}</td><td class="num"></td></tr>` : ""}</tbody></table></div><p class="mg-p mg-hint">Tap ★ to track a player at the top of every tab. Swipe the table sideways for more stats.</p>`;
    }
  }
  if (d) body = trackerHTML(sg, tbFor(idAway), tbFor(idHome)) + body;
  // only redraw the body when something changed, so reading the feed isn't interrupted every 20 seconds
  const bodyEl = $("#mgbody"), key = mgTab + "|" + mgFeed + "|" + body;
  if (key !== mgBodyKey) { const keep = bodyEl.scrollTop; bodyEl.innerHTML = body; bodyEl.scrollTop = keep; mgBodyKey = key }
  // bottom bar: chat, plus watch or share
  const ca = CHATACT[sg.gameID];
  $("#mgdock").innerHTML = `<button class="mg-dock-chat" data-mgchat ${window.CBBChat?.on ? "" : "hidden"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="currentColor"/></svg>Chat${ca && ca.people ? `<em>${ca.people} talking</em>` : ""}</button>${fin ? `<button class="mg-dock-btn" data-share="${sg.gameID}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Share</button>` : sg.network && watchURL(sg.network.split(" / ")[0]) ? `<a class="mg-dock-btn" href="${watchURL(sg.network.split(" / ")[0])}" target="_blank" rel="noopener">${PLAY}${esc(sg.network.split(" / ")[0])}</a>` : ""}`;
}
MG.addEventListener("click", e => {
  const t = e.target;
  if (t.closest("[data-mgback]")) { closePhoneGame(); return }
  const sw = t.closest("[data-mgswitch]"); if (sw) { if (sw.dataset.mgswitch !== openGame) openPhoneGame(sw.dataset.mgswitch); return }
  const tab = t.closest("[data-mgtab]"); if (tab) { mgTab = tab.dataset.mgtab; drawGame(); $("#mgbody").scrollTop = 0; return }
  const f = t.closest("[data-mgfeed]"); if (f) { mgFeed = f.dataset.mgfeed; drawGame(); return }
  if (t.closest("[data-mgchat]")) { openChatSheet(); return }
  if (t.closest("[data-mgchatclose]")) { closeChatSheet(); return }
  if (t.closest('a[href^="/team/"]')) { closePhoneGame(true); return } // following a team link leaves the game
});
// resizing between phone and desktop: desktop keeps the chat open beside the feed; phones tuck it behind the Chat button
MQ.addEventListener?.("change", () => { if (!MG.hidden) { if (isPhone()) closeChatSheet(true); else openChatSheet() } if (openGame) drawGame() });

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
    drawTicker(changed); drawHero(); loadSocial();
    if (!$("[data-view=news]").hidden) loadAutoNews(); // new finals become recaps while the News tab is open
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
const NCATS = ["All", "Recaps", "Top 25", "Games", "Transfer Portal", "Recruiting", "Conferences"]; let ncat = "All";
const art = n => `<div class="art" style="background:${teamColor(n.team)}" aria-hidden="true"><img class="artlogo" src="${logoURL(n.team, true)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${esc(initials(n.team.replace(/-/g, " ")))}'}))"></div>`;
// ---------- auto recaps ----------
// Notable finals from the last few days become stories automatically, written only from the game's own data
// (score, box score, play-by-play), so nothing is made up. Notable = an upset, a Top 25 matchup, an overtime game
// with a ranked team, or a 35-point night by a player on a ranked team.
let AUTO = [], autoAt = 0, autoBusy = false;
const ordinal = n => ["", "first", "second", "third", "fourth", "fifth"][n] || `${n}th`;
const etDay = off => { const d = etDate(off).path.split("/"); return { y: d[0], m: d[1], d: d[2] } };
async function loadAutoNews(force) {
  if (autoBusy || (!force && Date.now() - autoAt < 120e3)) return;
  autoBusy = true; autoAt = Date.now();
  try {
    const days = await Promise.all([0, -1, -2, -3].map(o => { const x = etDay(o); return api(`day/${x.y}/${x.m}/${x.d}`, 1).catch(() => ({ games: [] })) }));
    const finals = days.flatMap(d => d.games || []).filter(g => g.s === "final" && +g.a[2] + +g.h[2] > 0);
    const rank = t => +t[3] || 0;
    const pick = [];
    for (const g of finals) {
      const aw = +g.a[2] > +g.h[2], W = aw ? g.a : g.h, L = aw ? g.h : g.a, rw = rank(W), rl = rank(L), ot = /OT/i.test(g.f || "");
      let why = "", score = 0;
      if (rl && (!rw || rw - rl >= 10)) { why = "upset"; score = 200 - rl }
      else if (rw && rl) { why = "top25"; score = 150 - Math.min(rw, rl) }
      else if (ot && (rw || rl)) { why = "ot"; score = 100 }
      else if (rw || rl) { why = "ranked"; score = 0 } // only becomes a story if someone scores 35+
      if (why) pick.push({ g, W, L, why, score, ot });
    }
    pick.sort((x, y) => y.score - x.score || y.g.t - x.g.t);
    const chosen = pick.filter(p => p.why !== "ranked").slice(0, 14).concat(pick.filter(p => p.why === "ranked").slice(0, 12));
    const out = [];
    let i = 0;
    async function worker() {
      while (i < chosen.length) {
        const p = chosen[i++];
        try {
          const [info, box, pbp] = await Promise.all([api(`game/${p.g.id}`, 1).catch(() => null), api(`game/${p.g.id}/boxscore?final=1`, 1).catch(() => null), api(`game/${p.g.id}/play-by-play`, 1).catch(() => null)]);
          const st = buildRecap(p, info?.contests?.[0], box, pbp);
          if (st) out.push(st);
        } catch { }
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    out.sort((a, b) => b.when - a.when);
    AUTO = out;
    if (!$("#newslist").hidden && !$("[data-view=news]").hidden) drawNews();
  } catch { }
  autoBusy = false;
}
function buildRecap(p, c, box, pbp) {
  const { g, W, L, why, ot } = p, aw = W === g.a;
  const nm = t => fix(t[1]), rk = t => +t[3] || 0, rn = t => rk(t) ? `No. ${rk(t)} ${nm(t)}` : nm(t);
  const ws = +W[2], ls = +L[2], score = `${ws}–${ls}`, otTxt = (g.f || "").match(/(\d)?\s*OT/i), otWord = otTxt ? (otTxt[1] && otTxt[1] !== "1" ? `${otTxt[1]} overtimes` : "overtime") : "";
  const teams = c?.teams || [], tW = teams.find(t => !!t.isHome === !aw) || {}, tL = teams.find(t => !!t.isHome === aw) || {};
  const tb = box?.teamBoxscore || [], bW = tb.find(x => String(x.teamId) === String(tW.teamId)), bL = tb.find(x => String(x.teamId) === String(tL.teamId));
  const players = b => (b?.playerStats || []).map(x => ({ name: fix(`${x.firstName || ""} ${x.lastName || ""}`).trim(), pts: +x.points || 0, reb: +x.totalRebounds || 0, ast: +x.assists || 0, threes: +x.threePointsMade || 0, fgm: +x.fieldGoalsMade || 0, fga: +x.fieldGoalsAttempted || 0 })).sort((a, b) => b.pts - a.pts);
  const pW = players(bW), pL = players(bL), star = [...pW, ...pL].sort((a, b) => b.pts - a.pts)[0];
  const big = star && star.pts >= 35;
  if (why === "ranked" && !big) return null;
  const line = x => { const parts = [`${x.pts} points`]; if (x.reb >= 8) parts.push(`${x.reb} rebounds`); if (x.ast >= 6) parts.push(`${x.ast} assists`); return parts.join(", ").replace(/, ([^,]*)$/, " and $1") };
  const shoot = x => x.fga ? ` on ${x.fgm}-of-${x.fga} shooting` : "";
  const dayName = new Date(g.d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
  const dateShort = new Date(g.d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const starTeam = star && pW.includes(star) ? W : L;
  // headline
  let t;
  if (why === "upset") t = rk(W) ? `${rn(W)} upsets ${rn(L)}, ${score}` : `${nm(W)} stuns ${rn(L)}, ${score}`;
  else if (why === "top25") t = `${rn(W)} ${ot ? "outlasts" : "beats"} ${rn(L)}${ot ? ` in ${otWord}` : ""}, ${score}`;
  else if (why === "ot") t = `${rn(W)} survives ${rn(L)} in ${otWord}, ${score}`;
  else t = `${star.name} scores ${star.pts} as ${rn(W)} ${starTeam === W ? "beats" : "holds off"} ${starTeam === W ? nm(L) : nm(starTeam)}`;
  if (big && why !== "ranked" && starTeam === W && t.length < 60) t = `${star.name}'s ${star.pts} lifts ${rn(W)} past ${rn(L)}, ${score}`;
  // play-by-play: lead changes, ties, biggest leads, the go-ahead basket
  let lc = 0, ties = 0, prevLead = 0, maxW = 0, maxL = 0, goAhead = null;
  const all = (pbp?.periods || []).flatMap(per => (per.playbyplayStats || []).map(x => ({ ...x, per: per.periodDisplay || "" })));
  for (const x of all) {
    if (x.homeScore === undefined || x.homeScore === "") continue;
    const lead = (aw ? -1 : 1) * ((+x.homeScore || 0) - (+x.visitorScore || 0)); // from the winner's side
    if (lead !== 0 && prevLead !== 0 && Math.sign(lead) !== Math.sign(prevLead)) lc++;
    if (lead === 0 && prevLead !== 0) ties++;
    if (lead > 0 && prevLead <= 0) goAhead = x;
    maxW = Math.max(maxW, lead); maxL = Math.max(maxL, -lead); prevLead = lead;
  }
  // halftime
  const ls1 = (c?.linescores || []).find(l => String(l.period) === "1");
  const hW = ls1 ? +(aw ? ls1.visit : ls1.home) : null, hL = ls1 ? +(aw ? ls1.home : ls1.visit) : null;
  const venue = c?.location?.venue ? ` at ${fix(c.location.venue)}` : "";
  const body = [];
  // 1. the result
  let lead = `${rn(W)} beat ${rn(L)} ${score}${ot ? ` in ${otWord}` : ""} on ${dayName}${venue}.`;
  if (why === "upset") lead += rk(W) ? ` ${nm(W)} came in ranked No. ${rk(W)}, ${rk(W) - rk(L)} spots below ${nm(L)} in the AP poll.` : ` ${nm(L)} came in ranked No. ${rk(L)} in the AP poll; ${nm(W)} was unranked.`;
  if (why === "top25") lead += ` It was a matchup of two Top 25 teams.`;
  body.push(lead);
  // 2. how it unfolded
  if (hW !== null && !isNaN(hW)) {
    let flow = hW > hL ? `${nm(W)} led ${hW}–${hL} at halftime` : hW < hL ? `${nm(W)} trailed ${hL}–${hW} at halftime` : `The teams were tied ${hW}–${hL} at halftime`;
    if (maxL >= 8 && hW <= hL) flow += ` and was down by as many as ${maxL} before coming back`;
    else if (maxW >= 15) flow += ` and built a lead as large as ${maxW}`;
    flow += ".";
    if (lc >= 3) flow += ` The lead changed hands ${lc} times${ties ? `, with ${ties} ties` : ""}.`;
    if (goAhead && /2nd|ot|overtime/i.test(goAhead.per) && clockSecs(goAhead.clock) <= 180) flow += ` ${nm(W)} went ahead for good with ${String(goAhead.clock).replace(/^0(\d:)/, "$1")} left in the ${/ot|overtime/i.test(goAhead.per) ? "overtime" : "second half"}: ${fix(goAhead.eventDescription || goAhead.homeText || goAhead.visitorText || "").replace(/\s+/g, " ").trim()}.`;
    body.push(flow);
  }
  // 3. top performers
  if (pW[0]) {
    let perf = `${pW[0].name} led ${nm(W)} with ${line(pW[0])}${shoot(pW[0])}${pW[0].threes >= 3 ? `, including ${pW[0].threes} threes` : ""}.`;
    if (pW[1] && pW[1].pts >= 10) perf += ` ${pW[1].name} added ${line(pW[1])}.`;
    if (pL[0]) perf += ` For ${nm(L)}, ${pL[0].name} had ${line(pL[0])}${shoot(pL[0])}.`;
    body.push(perf);
  }
  // 4. the numbers
  const sw = bW?.teamStats, sl = bL?.teamStats, pc = (m, a) => a ? Math.round(+m / +a * 100) : 0;
  if (sw && sl) {
    const bits = [];
    const fw = pc(sw.fieldGoalsMade, sw.fieldGoalsAttempted), fl = pc(sl.fieldGoalsMade, sl.fieldGoalsAttempted);
    bits.push(`${nm(W)} shot ${fw}% from the field to ${nm(L)}'s ${fl}%`);
    if (Math.abs(+sw.threePointsMade - +sl.threePointsMade) >= 4) bits.push(`made ${sw.threePointsMade} threes to ${sl.threePointsMade}`);
    if (Math.abs(+sw.totalRebounds - +sl.totalRebounds) >= 8) bits.push(`${+sw.totalRebounds > +sl.totalRebounds ? "won" : "lost"} the rebounding battle ${sw.totalRebounds}–${sl.totalRebounds}`);
    if (Math.abs(+sw.turnovers - +sl.turnovers) >= 5) bits.push(`committed ${sw.turnovers} turnovers to ${sl.turnovers}`);
    body.push(bits.join(", ").replace(/, ([^,]*)$/, " and $1") + ".");
  }
  body.push(`Relive every play, the box score and the fan chat on the Scores tab.`);
  const dek = pW[0] ? `${pW[0].name} had ${pW[0].pts} for ${nm(W)}${pL[0] ? `; ${pL[0].name} scored ${pL[0].pts} for ${nm(L)}` : ""}.` : `${nm(W)} ${score} ${nm(L)}.`;
  return { id: "auto-" + g.id, gameId: g.id, auto: true, cat: "Recaps", team: W[0], t, dek, time: dateShort, read: `${Math.max(1, Math.round(body.join(" ").split(" ").length / 200))} min`, body, when: (+g.t || 0) + (why === "upset" ? 1 : 0) };
}
const allNews = () => [...AUTO, ...NEWS];

function drawNews() {
  $("#ncats").innerHTML = NCATS.map(c => `<button aria-pressed="${c === ncat}" data-ncat="${c}">${c}</button>`).join("");
  loadAutoNews();
  const list = allNews().filter(n => ncat === "All" || n.cat === ncat); $("#story").hidden = true; $("#newslist").hidden = false;
  if (!list.length) { $("#newslist").innerHTML = `<div class="empty" style="margin-top:14px">No stories in this topic yet.</div>`; return }
  const [lead, ...rest] = list;
  $("#newslist").innerHTML = `<button class="lead" data-story="${lead.id}">${art(lead)}<div class="txt"><span class="ntag">${lead.cat}</span>${lead.auto ? `<span class="ntag auto">⚡ Auto recap</span>` : ""}<h2>${esc(lead.t)}</h2><p class="ndek">${esc(lead.dek)}</p><span class="nmeta">${lead.time} · ${lead.read} read</span></div></button>
   <div class="ngrid">${rest.map(n => `<button class="ncard" data-story="${n.id}">${art(n)}<div class="txt"><span class="ntag">${n.cat}</span>${n.auto ? `<span class="ntag auto">⚡ Auto</span>` : ""}<h3>${esc(n.t)}</h3><p class="ndek">${esc(n.dek)}</p><span class="nmeta">${n.time} · ${n.read} read</span></div></button>`).join("")}</div>`;
}
function openStory(id) {
  const n = allNews().find(x => x.id === id); if (!n) return; $("#newslist").hidden = true; const st = $("#story"); st.hidden = false;
  st.innerHTML = `<button class="closebtn" data-closestory>← All news</button><div style="margin-top:18px"><span class="ntag">${n.cat}</span><h2>${esc(n.t)}</h2><p class="nmeta" style="margin:0 0 20px">${n.auto ? "Auto recap" : "By @collegebasketball"} · ${n.time} · ${n.read} read</p><div class="body">${n.body.map(p => `<p>${esc(p)}</p>`).join("")}</div>${n.auto ? `<p class="autonote">⚡ This recap was written automatically from the official box score and play-by-play. ${n.gameId ? `<a href="/game/${esc(n.gameId)}">Full recap with box score and game flow →</a>` : `<a href="#scores">See the latest scores →</a>`}</p>` : ""}</div>`; scrollTo(0, 0);
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
    return `<a class="pod p${i + 1}" href="/team/${esc(slug)}" style="--tc:${tc}">${slug ? `<img class="twm" src="${logoURL(slug)}" alt="" loading="lazy" onerror="this.remove()">` : ""}<span class="place">${["1st", "2nd", "3rd"][i]}</span><span class="who">${mono(t, slug)}<span><b>${esc(nameOf(row))}</b><small>${esc(sub)}</small></span></span><span class="val">${esc(row[sc])}</span><span class="lab">${esc(sc)}</span></a>`;
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
      if (/^team$|^school$/i.test(c)) v = `<a class="tm" href="/team/${esc(slug)}">${mono(t, slug)}<span>${esc(fix(row[c]))}</span></a>`;
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

// ---------- Contact form ----------
// Sends through Web3Forms (free) when a key is set in contact-config.js; otherwise opens the visitor's email app.
(function () {
  const f = $("#ctform"); if (!f) return;
  const el = n => f.elements.namedItem(n); // (f.name would be the form's own name, not the Name box)
  const cfg = window.CONTACT_CONFIG || {}, to = cfg.email || "collegebasketballbusiness@gmail.com";
  const status = (cls, html) => { const el = $("#ctstatus"); el.className = "ct-status " + cls; el.innerHTML = html };
  el("message").addEventListener("input", () => { $("#ctcount").textContent = `${el("message").value.length} / 4000` });
  f.addEventListener("input", e => { e.target.classList.remove("bad"); const st = $("#ctstatus"); if (st.classList.contains("err") && !f.querySelector(".bad")) st.innerHTML = "" });
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (el("botcheck").checked) return; // bots fill in the hidden box
    const name = el("name").value.trim(), email = el("email").value.trim(), topic = el("topic").value, message = el("message").value.trim();
    const bad = [];
    if (!name) bad.push(el("name"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) bad.push(el("email"));
    if (message.length < 5) bad.push(el("message"));
    bad.forEach(x => x.classList.add("bad"));
    if (bad.length) { status("err", "<b>Almost there</b>Please add your name, a valid email and a message."); bad[0].focus(); return }
    if (!cfg.web3formsKey) {
      const body = `${message}\n\n— ${name} (${email})`;
      location.href = `mailto:${to}?subject=${encodeURIComponent(`[${topic}] Message from ${name}`)}&body=${encodeURIComponent(body)}`;
      status("ok", `<b>Opening your email app…</b>Your message is filled in. Just press send. Nothing opened? Email us at <a href="mailto:${esc(to)}">${esc(to)}</a>.`);
      return;
    }
    const btn = f.querySelector(".ct-send"); btn.disabled = true; btn.firstElementChild.textContent = "Sending…";
    try {
      const r = await fetch("https://api.web3forms.com/submit", {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ access_key: cfg.web3formsKey, subject: `[${topic}] Message from ${name} via the site`, from_name: "College Basketball site", name, email, replyto: email, topic, message, botcheck: "" })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.success === false) throw new Error(j.message || "HTTP " + r.status);
      f.reset(); $("#ctcount").textContent = "0 / 4000";
      status("ok", `<b>Message sent 🏀</b>Thanks, ${esc(name)}! We'll get back to you at ${esc(email)}.`);
    } catch {
      status("err", `<b>That didn't go through</b>Please try again, or email us directly at <a href="mailto:${esc(to)}">${esc(to)}</a>.`);
    }
    btn.disabled = false; btn.firstElementChild.textContent = "Send message";
  });
})();

// ---------- email updates: footer sign-up ----------
(function () {
  const f = $("#ftnews"); if (!f) return;
  const msg = f.querySelector(".ft-news-msg"), input = f.querySelector("input"), btn = f.querySelector("button");
  const say = (cls, t) => { msg.className = "ft-news-msg " + cls; msg.textContent = t };
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const c = window.CHAT_CONFIG || {}, addr = input.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(addr)) { say("err", "Enter a valid email address."); input.focus(); return }
    if (!c.url || !c.anonKey) { say("err", "Sign-ups aren't open yet. Check back soon."); return }
    btn.disabled = true;
    try {
      const r = await fetch(`${c.url}/rest/v1/rpc/subscribe_updates`, { method: "POST", headers: { apikey: c.anonKey, "content-type": "application/json" }, body: JSON.stringify({ addr }) });
      if (r.status === 404) throw new Error("setup");
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || "HTTP " + r.status) }
      input.value = ""; say("ok", "🏀 You're on the list! Watch your inbox for College Basketball updates.");
    } catch (err) { say("err", /valid email/i.test(err.message) ? "Enter a valid email address." : "That didn't go through. Try again in a minute.") }
    btn.disabled = false;
  });
})();

// ---------- one-click unsubscribe (the link at the bottom of every newsletter) ----------
async function unsubscribe(tok) {
  const c = window.CHAT_CONFIG || {}, h = $("#unsubh"), p = $("#unsubp");
  h.textContent = "Unsubscribing…"; p.textContent = "One moment.";
  try {
    const r = await fetch(`${c.url}/rest/v1/rpc/unsubscribe_updates`, { method: "POST", headers: { apikey: c.anonKey, "content-type": "application/json" }, body: JSON.stringify({ tok }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j && j.message) || "HTTP " + r.status);
    h.textContent = "You're unsubscribed";
    p.textContent = `${typeof j === "string" ? j : "Your email"} won't get College Basketball updates anymore. Changed your mind? Sign up again at the bottom of any page.`;
  } catch (e) {
    h.textContent = "Something went wrong";
    p.textContent = /not valid/i.test(e.message) ? "That unsubscribe link isn't valid. Email collegebasketballbusiness@gmail.com and we'll remove you." : "Try the link again in a minute, or email collegebasketballbusiness@gmail.com and we'll remove you.";
  }
}

// ---------- admin: the email list ----------
// Only admin accounts can read it (the database enforces this). Copy or download the list for your email tool.
let ADMIN = { rows: null, names: {}, q: "", err: "", tab: "accounts", acc: null, aq: "" };
async function drawAdmin(reload) {
  const box = $("#adminbox"), chat = window.CBBChat;
  if (!chat?.on) { box.innerHTML = `<p class="adm-note">The admin page needs the chat to be connected (chat-config.js).</p>`; return }
  try { await chat.client() } catch { box.innerHTML = `<p class="adm-note">Couldn't connect. Try again in a minute.</p>`; return }
  const me = chat.me();
  if (!me) { box.innerHTML = `<p class="adm-note">Log in with your admin account to see the email list.</p><div class="adm-tools"><button class="chat-btn" data-admlogin>Log in</button></div>`; return }
  if (!me.is_admin) { box.innerHTML = `<p class="adm-note">This page is for admins only.</p>`; return }
  const tabs = `<div class="adm-tabs" role="tablist"><button role="tab" aria-selected="${ADMIN.tab === "accounts"}" data-admtab="accounts">👤 Accounts</button><button role="tab" aria-selected="${ADMIN.tab === "emails"}" data-admtab="emails">📬 Email list</button></div>`;
  if (ADMIN.tab === "accounts") { await drawAccounts(box, tabs, reload); return }
  if (!ADMIN.rows || reload) {
    box.innerHTML = `<p class="empty">Loading the email list…</p>`;
    try {
      const sb = await chat.client();
      const { data, error } = await sb.from("subscribers").select("id, email, user_id, source, subscribed, created_at, unsubscribed_at").order("created_at", { ascending: false }).limit(10000);
      if (error) throw error;
      ADMIN.rows = data || []; ADMIN.err = "";
      const ids = [...new Set(ADMIN.rows.map(r => r.user_id).filter(Boolean))];
      if (ids.length) { const { data: ps } = await sb.from("profiles").select("id, username").in("id", ids.slice(0, 1000)); for (const p of ps || []) ADMIN.names[p.id] = p.username }
    } catch (e) {
      box.innerHTML = /subscribers/i.test(e.message || "") ? `<p class="adm-note">The email list isn't set up yet. Run <b>updates-setup.sql</b> in Supabase (SQL Editor → New snippet → Run).</p>` : `<p class="adm-note">The list couldn't load: ${esc(e.message || "unknown error")}</p>`;
      return;
    }
  }
  const rows = ADMIN.rows, on = rows.filter(r => r.subscribed), week = Date.now() - 7 * 864e5;
  const q = ADMIN.q.trim().toLowerCase();
  const shown = rows.filter(r => !q || r.email.includes(q) || (ADMIN.names[r.user_id] || "").toLowerCase().includes(q));
  const src = { signup: "Account sign-up", site: "Footer box", account: "Signed-in fan" };
  box.innerHTML = `${tabs}<div class="adm-stats">
      <div><b>${on.length}</b><span>Subscribed</span></div>
      <div><b>${on.filter(r => new Date(r.created_at) > week).length}</b><span>New this week</span></div>
      <div><b>${on.filter(r => r.source === "signup").length}</b><span>From account sign-ups</span></div>
      <div><b>${rows.length - on.length}</b><span>Unsubscribed</span></div></div>
    <div class="adm-tools"><div class="search"><input id="admq" type="search" placeholder="Search emails or usernames" value="${esc(ADMIN.q)}" aria-label="Search the email list"></div>
      <button class="chat-btn" data-admcopy>Copy subscribed emails</button><button class="chat-btn ghost" data-admcsv>Download CSV</button><button class="chat-btn ghost" data-admreload>Refresh</button></div>
    <p class="adm-msg" id="admmsg"></p>
    <div class="tblwrap"><table class="box adm-table"><thead><tr><th>Email</th><th>Username</th><th>Signed up from</th><th>Date</th><th>Status</th><th></th></tr></thead><tbody>
      ${shown.length ? shown.map(r => `<tr class="${r.subscribed ? "" : "off"}"><td>${esc(r.email)}</td><td>${esc(ADMIN.names[r.user_id] || "–")}</td><td><span class="adm-src">${esc(src[r.source] || r.source)}</span></td><td>${new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td><td>${r.subscribed ? "✅ Subscribed" : "Unsubscribed"}</td><td><button class="chat-link ${r.subscribed ? "danger" : ""}" data-admtoggle="${r.id}">${r.subscribed ? "Unsubscribe" : "Re-subscribe"}</button></td></tr>`).join("")
        : `<tr><td colspan="6">${rows.length ? "No one matches that search." : "No sign-ups yet. They'll show up here as people join."}</td></tr>`}</tbody></table></div>
    <p class="adm-note" style="margin-top:16px">To send an email, click <b>Download CSV</b> and import it into an email tool like Mailchimp, Beehiiv or ConvertKit. Those tools add the unsubscribe link every email needs. If someone unsubscribes there, mark them unsubscribed here too.</p>`;
  const qi = $("#admq"); qi.oninput = () => { ADMIN.q = qi.value; const pos = qi.selectionStart; drawAdmin(); const n = $("#admq"); n.focus(); n.setSelectionRange(pos, pos) };
}
// Every account (not just the email list), from the admin_accounts database function (accounts-setup.sql)
async function drawAccounts(box, tabs, reload) {
  if (!ADMIN.acc || reload) {
    box.innerHTML = `${tabs}<p class="empty">Loading accounts…</p>`;
    try {
      const sb = await window.CBBChat.client();
      const { data, error } = await sb.rpc("admin_accounts");
      if (error) throw error;
      ADMIN.acc = data || [];
    } catch (e) {
      box.innerHTML = `${tabs}` + (/admin_accounts|function|schema cache/i.test(e.message || "") ? `<p class="adm-note">The accounts list isn't set up yet. Run <b>accounts-setup.sql</b> in Supabase (SQL Editor → New snippet → paste → Run), then click Refresh.</p><div class="adm-tools"><button class="chat-btn ghost" data-admreload>Refresh</button></div>` : `<p class="adm-note">The accounts couldn't load: ${esc(e.message || "unknown error")}</p>`);
      return;
    }
  }
  const rows = ADMIN.acc, week = Date.now() - 7 * 864e5, q = ADMIN.aq.trim().toLowerCase();
  const shown = rows.filter(r => !q || (r.email || "").toLowerCase().includes(q) || (r.username || "").toLowerCase().includes(q));
  const d = v => v ? new Date(v).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "–";
  const ago = v => { if (!v) return "Never"; const m = (Date.now() - new Date(v)) / 6e4; return m < 60 ? `${Math.max(1, Math.round(m))}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : m < 43200 ? `${Math.round(m / 1440)}d ago` : d(v) };
  const status = r => r.banned ? `<span class="adm-src bad">Banned</span>` : r.is_admin ? `<span class="adm-src">Admin</span>` : !r.confirmed ? `<span class="adm-src warn" title="Hasn't clicked the link in their sign-up email">Unconfirmed</span>` : !r.username ? `<span class="adm-src warn" title="Made an account but never picked a username">No username</span>` : `<span class="adm-src ok">Active</span>`;
  box.innerHTML = `${tabs}<div class="adm-stats">
      <div><b>${rows.length}</b><span>Total accounts</span></div>
      <div><b>${rows.filter(r => new Date(r.joined) > week).length}</b><span>New this week</span></div>
      <div><b>${rows.filter(r => r.last_seen && new Date(r.last_seen) > week).length}</b><span>Logged in this week</span></div>
      <div><b>${rows.filter(r => r.messages > 0).length}</b><span>Have chatted</span></div></div>
    <div class="adm-tools"><div class="search"><input id="admaq" type="search" placeholder="Search usernames or emails" value="${esc(ADMIN.aq)}" aria-label="Search accounts"></div>
      <button class="chat-btn ghost" data-acccsv>Download CSV</button><button class="chat-btn ghost" data-admreload>Refresh</button></div>
    <p class="adm-msg" id="admmsg"></p>
    <div class="tblwrap"><table class="box adm-table"><thead><tr><th>Username</th><th>Email</th><th>Joined</th><th>Last login</th><th>Chat msgs</th><th>Picks</th><th>Newsletter</th><th>Status</th></tr></thead><tbody>
      ${shown.length ? shown.map(r => `<tr class="${r.banned ? "off" : ""}"><td><b>${esc(r.username || "–")}</b></td><td>${esc(r.email || "")}</td><td>${d(r.joined)}</td><td>${ago(r.last_seen)}</td><td>${r.messages || 0}</td><td>${r.picks || 0}</td><td>${r.newsletter ? "✅" : "–"}</td><td>${status(r)}</td></tr>`).join("")
        : `<tr><td colspan="8">${rows.length ? "No one matches that search." : "No accounts yet."}</td></tr>`}</tbody></table></div>
    <p class="adm-note" style="margin-top:16px">Everyone who has made an account, newest first. “Unconfirmed” means they never clicked the link in their sign-up email, so they can't chat or pick yet.</p>`;
  const qi = $("#admaq"); qi.oninput = () => { ADMIN.aq = qi.value; const pos = qi.selectionStart; drawAccounts(box, tabs); const n = $("#admaq"); n.focus(); n.setSelectionRange(pos, pos) };
}
document.addEventListener("click", async e => {
  const t = e.target; if (!t.closest || !t.closest("#adminbox")) return;
  const say = m => { const el = $("#admmsg"); if (el) el.textContent = m };
  const tb = t.closest("[data-admtab]"); if (tb) { ADMIN.tab = tb.dataset.admtab; drawAdmin(); return }
  if (t.closest("[data-acccsv]")) {
    const rows = [["username", "email", "joined", "last_login", "chat_messages", "picks", "newsletter", "confirmed", "banned"], ...(ADMIN.acc || []).map(r => [r.username || "", r.email || "", (r.joined || "").slice(0, 10), (r.last_seen || "").slice(0, 10), String(r.messages || 0), String(r.picks || 0), r.newsletter ? "yes" : "no", r.confirmed ? "yes" : "no", r.banned ? "yes" : "no"])];
    const csv = rows.map(r => r.map(v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `college-basketball-accounts-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove(); say("Downloaded the CSV.");
    return;
  }
  if (t.closest("[data-admlogin]")) { window.CBBChat.auth("login", "Log in with your admin account."); return }
  if (t.closest("[data-admreload]")) { if (ADMIN.tab === "accounts") ADMIN.acc = null; drawAdmin(true); return }
  if (t.closest("[data-admcopy]")) {
    const list = (ADMIN.rows || []).filter(r => r.subscribed).map(r => r.email).join(", ");
    try { await navigator.clipboard.writeText(list); say(`Copied ${list ? list.split(", ").length : 0} emails.`) } catch { say("Couldn't copy. Use Download CSV instead.") }
    return;
  }
  if (t.closest("[data-admcsv]")) {
    const rows = [["email", "username", "source", "subscribed", "signed_up"], ...(ADMIN.rows || []).map(r => [r.email, ADMIN.names[r.user_id] || "", r.source, r.subscribed ? "yes" : "no", r.created_at.slice(0, 10)])];
    const csv = rows.map(r => r.map(v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: `college-basketball-email-list-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a); a.click(); a.remove(); say("Downloaded the CSV.");
    return;
  }
  const tg = t.closest("[data-admtoggle]");
  if (tg) {
    const r = (ADMIN.rows || []).find(x => x.id === +tg.dataset.admtoggle); if (!r) return;
    const sb = await window.CBBChat.client(), on = !r.subscribed;
    const { error } = await sb.from("subscribers").update({ subscribed: on, unsubscribed_at: on ? null : new Date().toISOString() }).eq("id", r.id);
    if (error) { say("That didn't save: " + error.message); return }
    r.subscribed = on; await drawAdmin(); say(on ? `${r.email} is subscribed again.` : `${r.email} is unsubscribed.`);
  }
});
window.addEventListener("cbb-auth", () => { if (!$("[data-view=admin]").hidden) { ADMIN.rows = null; ADMIN.acc = null; drawAdmin() } });

// ---------- favorites (saved on this device) ----------
let FAVS = [];
try { FAVS = JSON.parse(localStorage.getItem("cbb_favs") || "[]").filter(x => typeof x === "string") } catch { FAVS = [] }
const isFav = slug => FAVS.includes(slug);
function toggleFav(slug) {
  FAVS = isFav(slug) ? FAVS.filter(x => x !== slug) : [...FAVS, slug];
  try { localStorage.setItem("cbb_favs", JSON.stringify(FAVS)) } catch { }
  drawTeamDir(); if (teamOpen) drawTeam(); drawGames();
  window.dispatchEvent(new CustomEvent("cbb-favs", { detail: FAVS.slice() })); // game alerts follow the same teams
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
  go("scores");
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
  return `<a class="tcard${isFav(slug) ? " fav" : ""}${today && today.g.gameState === "live" ? " islive" : ""}" href="/team/${esc(slug)}" style="--tc:${tc}">${wm}${mono(n, slug)}<span class="tinfo"><b>${r ? `<span class="rkb">${r}</span>` : ""}${esc(n)}</b><small>${esc(recordOf(n) || "0-0")}</small>${todayTag(today)}</span>${favBtn(slug, n)}</a>`;
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
    <div class="tmeta"><span><b>${esc(record)}</b> overall</span>${confRec ? `<span>${esc(confRec)}</span>` : ""}${r ? `<span>AP No. ${r}</span>` : ""}</div></div><button class="followbtn ${isFav(slug) ? "on" : ""}" data-fav="${esc(slug)}" aria-pressed="${isFav(slug)}">${STAR(isFav(slug))}${isFav(slug) ? "Following" : "Follow"}</button>${calMenu(slug, name)}</div>
    <div class="days ttabs" role="tablist">${[["schedule", "Schedule"], ["stats", "Team stats"], ["players", "Players"]].map(([k, t]) => `<button role="tab" data-teamtab="${k}" aria-pressed="${teamTab === k}">${t}</button>`).join("")}</div>`;
  let body = "";
  if (T.err) body = `<p class="empty">The schedule couldn't load. Try again in a minute.</p>`;
  else if (!T.games) body = `<div class="skel-tbl" aria-label="Loading the schedule">${Array.from({ length: 8 }, () => `<div class="skel-row"><i class="sk" style="width:90px"></i><i class="sk sk-c"></i><i class="sk" style="width:40%"></i><i class="sk" style="width:70px;margin-left:auto"></i></div>`).join("")}</div>`;
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
    else res = `<span class="muted">${g.t ? new Date(g.t * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "TBA"}${g.n ? " · " + esc(g.n) : ""}</span> <a class="pvlink" href="/game/${esc(g.id)}">Preview</a>`;
    const open = T.openBox === g.id;
    return `<tr class="${g.s !== "pre" ? "click" : ""} ${open ? "sel" : ""}" ${g.s !== "pre" ? `data-teambox="${g.id}"` : ""}><td class="sdate">${shortDate(g.d)}</td><td class="svs">${home ? "vs" : "at"}</td><td><span class="tm">${mono(opName, op[0])}<span>${opRank ? `<span class="rkb">${opRank}</span>` : ""}${esc(opName)}</span></span></td><td class="num sres">${res}</td></tr>
      ${open ? `<tr class="sbox"><td colspan="4">${g.s === "final" ? `<a class="recaplink" href="/game/${esc(g.id)}">📝 Read the full recap →</a>` : ""}${gameBoxHTML(slug, g, T)}</td></tr>` : ""}`;
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
  const row = t.closest("[data-teamslug]"); if (row) { go("team-" + row.dataset.teamslug); return }
  if (t.closest("[data-teamback]")) { go("teams"); return }
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
const VIEWS = ["scores", "news", "rankings", "standings", "stats", "teams", "discord", "contact", "rules", "admin", "unsubscribe", "pickem"];
const loaded = {};
function show(v) {
  if (!VIEWS.includes(v)) v = "scores";
  document.querySelectorAll(".view").forEach(el => el.hidden = el.dataset.view !== v);
  document.querySelectorAll("[data-tab]").forEach(a => a.dataset.tab === v ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  if (v === "news") drawNews(); // coming back to News always starts on the list of stories
  if (v === "discord") loadDiscord();
  if (v === "admin") drawAdmin();
  if (v === "pickem" && window.CBBMore) window.CBBMore.drawPickem();
  if (v === "stats") loadStatCats();
  if (v === "teams" || v.startsWith("team-")) loadSeason().catch(() => { }); // get schedules ready before a team is tapped
  if (v === "rankings" && !loaded.ao) { loaded.ao = 1; loadApOthers() }
  if (v === "rankings" && !loaded.rk) { loaded.rk = 1; loadRankings() }
  if ((v === "standings" || v === "teams") && !loaded.st) { loaded.st = 1; loadStandings() }
  scrollTo(0, 0);
}
// Team pages have real addresses (/team/illinois) so search engines and shared links can find them;
// everything else lives after the # like before.
const pathKey = () => { const p = /^\/team\/([a-z0-9-]{1,60})\/?$/.exec(location.pathname); return p ? "team-" + p[1] : null };
const curKey = () => pathKey() || (location.hash || "#scores").slice(1) || "scores";
function go(key) { // move around the site without reloading the page
  if (!/^team-/.test(key) && location.pathname === "/") { if (location.hash.slice(1) !== key) location.hash = key; else route(); return }
  history.pushState(null, "", /^team-/.test(key) ? "/team/" + key.slice(5) : "/#" + key); route();
}
const BASE_TITLE = "College Basketball | The Home of College Basketball";
function teamTitle(slug) {
  const names = Object.keys(window.TEAM_SLUGS || {}).filter(n => window.TEAM_SLUGS[n] === slug);
  const n = names.sort((a, b) => (/\bSt\.$/.test(a) - /\bSt\.$/.test(b)) || a.length - b.length)[0];
  return n ? fix(n).replace(/ St\.$/, " State") : slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
let lastRouted = null;
const route = () => {
  if (typeof MG !== "undefined" && !MG.hidden) closePhoneGame(true);
  const key = curKey(); lastRouted = key;
  document.title = BASE_TITLE;
  const un = /^unsubscribe-([0-9a-f-]{36})$/i.exec(key);
  if (un) { show("unsubscribe"); unsubscribe(un[1]); return }
  const gl = /^game-(\d{4,12})$/.exec(key);
  if (gl) { history.replaceState(null, "", "/#scores"); lastRouted = "scores"; show("scores"); openWhenLoaded(gl[1]); return }
  const m = /^team-([a-z0-9-]{1,60})$/.exec(key);
  if (m) {
    if (location.pathname !== "/team/" + m[1]) history.replaceState(history.state, "", "/team/" + m[1]); // old #team- links get the clean address
    document.title = `${teamTitle(m[1])} Basketball: Schedule, Scores & Stats | College Basketball`;
    show("teams"); openTeam(m[1]); document.querySelector('[data-tab="teams"]')?.setAttribute("aria-current", "page");
  }
  else { show(key); if (key === "teams") closeTeam() }
};
addEventListener("hashchange", () => { if (curKey() !== lastRouted) route() });
addEventListener("popstate", () => { if (curKey() !== lastRouted) route() });
// links inside the site: team links and (while on a team page) the # links move without a reload
document.addEventListener("click", e => {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest("a[href]"); if (!a || a.target) return;
  const h = a.getAttribute("href"); let key = null;
  if (/^\/team\/[a-z0-9-]{1,60}$/.test(h)) key = "team-" + h.slice(6);
  else if (h[0] === "#" && h.length > 1 && location.pathname !== "/") key = h.slice(1);
  if (!key) return;
  e.preventDefault(); go(key);
}, true);
// open a game from a link (an alert) as soon as today's scores have loaded
function openWhenLoaded(id, tries = 0) {
  const g = Object.values(cache).flat().find(x => x.gameID === id);
  if (g) { if (gday !== "t" && (cache.t || []).some(x => x.gameID === id)) { gday = "t"; drawDays(); drawFilters(); drawGames() } openPhoneGame(id); return }
  if (tries < 40) setTimeout(() => openWhenLoaded(id, tries + 1), 300);
}

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
document.addEventListener("click", e => {
  const pb = e.target.closest && e.target.closest("[data-pick]");
  if (pb) { e.preventDefault(); if (pb.closest(".rc")) e.stopImmediatePropagation(); makePick(pb.dataset.pickgame, pb.dataset.pick); return } // a pick on a card shouldn't open the game
  const sh = e.target.closest && e.target.closest("[data-share]");
  if (sh) { e.preventDefault(); shareFinal(sh.dataset.share); return }
  const sgb = e.target.closest && e.target.closest("[data-sharegame]");
  if (sgb) { e.preventDefault(); e.stopPropagation(); shareGame(sgb.dataset.sharegame); return }
  const sp = e.target.closest && e.target.closest("[data-shareplay]");
  if (sp) { e.preventDefault(); e.stopPropagation(); sharePlay(sp.dataset.shareplay); return }
  const cm = e.target.closest && e.target.closest("[data-cmu]");
  if (cm) { e.preventDefault(); cmuClosed[cm.dataset.cmu] = cmuClosed[cm.dataset.cmu] === false; mgBodyKey = ""; drawGame(); return }
});
window.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("uw")) { e.preventDefault(); e.target.click() } });
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
    drawFilters(); drawGames(); loadSocial(true); return;
  }
  const f = t.closest("[data-gf]"); if (f) { gfilt = f.dataset.gf; gconf = ""; try { localStorage.setItem("cbb_gfilt", gfilt) } catch { } closeGame(); drawFilters(); drawGames(); return }
  const cf = t.closest("[data-conf-f]"); if (cf) { gconf = cf.dataset.confF; gfilt = "All"; closeGame(); drawFilters(); drawGames(); return }
  const bx = t.closest("[data-box]"); if (bx) { boxSide = bx.dataset.box; drawGame(); return }
  if (t.closest("[data-closegame]")) { openGame = null; gameDetail = null; drawGames(); drawGame(); return }
  const gm = t.closest("[data-game]"); if (gm) {
    if (!gm.closest("#mg")) { if (gm.dataset.dayOf === "t" && gday !== "t") { gday = "t"; drawDays(); drawFilters() } openPhoneGame(gm.dataset.game); return }
    const fromCard = gm.classList.contains("game");
    if (fromCard && openGame === gm.dataset.game) { openGame = null; gameDetail = null; drawGames(); drawGame(); return } // tap again to close
    if (curKey() !== "scores") go("scores")
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



// ---------- box score check ----------
// The NCAA's live box score is sometimes incomplete (players missing) or even lists a player under the wrong team.
// When the players' points don't add up to the team's score, or most of a team's listed players show up for the
// other team in the play-by-play, the player lines are rebuilt from the play-by-play instead.
const BOXCHECK = new WeakMap();
function pbpPlayers(pbp, ids) {
  const P = {}; let ph = 0, pv = 0;
  for (const per of pbp?.periods || []) for (const x of per.playbyplayStats || []) {
    const nh = x.homeScore === undefined || x.homeScore === "" ? ph : +x.homeScore, nv = x.visitorScore === undefined || x.visitorScore === "" ? pv : +x.visitorScore;
    const gained = (nh - ph) + (nv - pv); ph = nh; pv = nv;
    const tid = String(x.teamId || ""), desc = fix(x.eventDescription || x.homeText || x.visitorText || "");
    if (!ids.includes(tid) || !x.lastName || /^Subbing/i.test(desc)) continue;
    const key = tid + "|" + x.firstName + "|" + x.lastName;
    const p = P[key] ||= { teamId: tid, firstName: fix(x.firstName || ""), lastName: fix(x.lastName || ""), number: "", position: "", minutesPlayed: "", starter: false,
      points: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, threePointsMade: 0, threePointsAttempted: 0, freeThrowsMade: 0, freeThrowsAttempted: 0,
      offensiveRebounds: 0, totalRebounds: 0, assists: 0, steals: 0, blockedShots: 0, turnovers: 0, personalFouls: 0 };
    const miss = /missed/i.test(desc);
    if (!miss && gained === 0 && /free throw|pointer|jumper|layup|dunk|tip|hook|shot|three/i.test(desc) && !/rebound|block|foul|assist|turnover|violation/i.test(desc)) continue; // a made shot the score didn't move for is a repeat
    if (/free throw/i.test(desc)) { p.freeThrowsAttempted++; if (!miss) { p.freeThrowsMade++; p.points += 1 } }
    else if (/pointer|jumper|layup|dunk|tip|hook|shot|three/i.test(desc) && !/rebound|block|turnover|violation/i.test(desc)) {
      const three = !miss && (gained === 2 || gained === 3) ? gained === 3 : /3[\s-]?pointer|3pt|three/i.test(desc); // the score change settles it for makes
      p.fieldGoalsAttempted++; if (three) p.threePointsAttempted++;
      if (!miss) { p.fieldGoalsMade++; if (three) p.threePointsMade++; p.points += three ? 3 : 2 }
    }
    else if (/offensive rebound/i.test(desc)) { p.offensiveRebounds++; p.totalRebounds++ }
    else if (/rebound/i.test(desc)) p.totalRebounds++;
    else if (/^assist/i.test(desc)) p.assists++;
    else if (/^steal/i.test(desc)) p.steals++;
    else if (/^block/i.test(desc)) p.blockedShots++;
    else if (/turnover/i.test(desc)) p.turnovers++;
    else if (/foul/i.test(desc)) p.personalFouls++;
  }
  for (const p of Object.values(P)) for (const k of Object.keys(p)) if (typeof p[k] === "number") p[k] = String(p[k]);
  return Object.values(P);
}
function checkedBox(d, idHome, idAway) {
  const tb = d?.box?.teamBoxscore || [];
  if (!d || !tb.length || !d.pbp?.periods?.length) return { tb, rebuilt: false };
  if (BOXCHECK.has(d)) return BOXCHECK.get(d);
  const ids = [idHome, idAway], pl = pbpPlayers(d.pbp, ids), nk = p => fix(`${p.firstName || ""} ${p.lastName || ""}`).toLowerCase().replace(/[^a-z]/g, "");
  const teamOf = {}; for (const p of pl) teamOf[nk(p)] = p.teamId;
  let bad = false;
  for (const t of tb) {
    const ps = t.playerStats || [], sum = ps.reduce((n, p) => n + (+p.points || 0), 0), team = +t.teamStats?.points;
    if (Number.isFinite(team) && team - sum > 3) bad = true;                            // players missing
    const seen = ps.filter(p => teamOf[nk(p)]), wrong = seen.filter(p => teamOf[nk(p)] !== String(t.teamId));
    if (seen.length >= 3 && wrong.length > seen.length / 2) bad = true;                 // players under the wrong team
  }
  let out = { tb, rebuilt: false };
  if (bad && pl.length) {
    const off = pl.reduce((n, p) => n + +p.points, 0), real = tb.reduce((n, t) => n + (+t.teamStats?.points || 0), 0);
    if (!real || off >= real * .8) // only if the play-by-play itself accounts for (nearly) all the points
      out = { rebuilt: true, tb: tb.map(t => ({ ...t, playerStats: pl.filter(p => p.teamId === String(t.teamId)).sort((a, b) => b.points - a.points || b.totalRebounds - a.totalRebounds) })) };
  }
  BOXCHECK.set(d, out);
  return out;
}


// ---------- game cards (Real-style) ----------
let GOTN_ID = null;
// Two team rows on the left (logo, big score — or record before tip-off — and the name with its rank),
// the clock, TV and activity stacked on the right.
const CONF_SHORT = { "big-ten": "B10", "big-12": "B12", "big-east": "Big East", "acc": "ACC", "sec": "SEC", "pac-12": "Pac-12", "mountain-west": "MWC", "wcc": "WCC", "atlantic-10": "A10", "american": "AAC", "metro": "MAAC", "uac": "UAC", "mvc": "MVC", "mac": "MAC", "america-east": "AmEast", "asun": "ASUN", "big-sky": "Big Sky", "big-south": "Big South", "big-west": "Big West", "caa": "CAA", "cusa": "CUSA", "horizon": "Horizon", "ivy-league": "Ivy", "maac": "MAAC", "meac": "MEAC", "nec": "NEC", "ovc": "OVC", "patriot": "Patriot", "socon": "SoCon", "southland": "Southland", "summit-league": "Summit", "sun-belt": "Sun Belt", "swac": "SWAC", "wac": "WAC" };
function realCard(g, st, cls, sa, sh) {
  const pre = g.gameState === "pre", fin = g.gameState === "final", a = +g.away.score || 0, h = +g.home.score || 0;
  const row = side => {
    const t = g[side], slug = side === "home" ? sh : sa, r = t.rank || apRank(t.names.short), rec = recordOf(t.names.short, g, side);
    const lose = fin && (side === "home" ? h < a : a < h), lead = !pre && !fin && (side === "home" ? h > a : a > h);
    const big = pre || noFeed(g) ? (rec || "–") : esc(t.score || 0);
    return `<div class="rc-t${lose ? " lose" : ""}${lead ? " ahead" : ""}" style="--tc:${teamColorFor(slug) || "#3A3A40"}">${mono(t.names.short, t.names.seo)}<div class="rc-x"><b class="rc-sc${pre ? " rec" : ""}" data-sc="${g.gameID}-${side}">${big}</b><span class="rc-nm">${esc(fix(t.names.short))}${r ? ` <i>(${esc(r)})</i>` : ""}${!pre && rec ? ` <em>${esc(rec)}</em>` : ""}</span></div></div>`;
  };
  const ca = CHATACT[g.gameID], pc = PICKCT[g.gameID], n = pc ? pc.home + pc.away : 0, bd = badges(g);
  const extra = [];
  if (n >= 3) { const sd = pc.home >= pc.away ? "home" : "away"; extra.push(`<span class="rc-ex" title="Pick'em">🗳️ ${Math.round(pc[sd] / n * 100)}% ${esc(fix(g[sd].names.char6 || g[sd].names.short))}</span>`) }
  if (ca && ca.people) extra.push(`<span class="rc-ex" title="People in the game chat">💬 ${ca.people}</span>`);
  const net = g.network ? String(g.network).split(/\s*\/\s*/)[0].replace(/ Network$/i, "") : "";
  const tag = upsetWatch(g) ? `<span class="rc-tag up">Upset alert</span>` : crunch(g) ? `<span class="rc-tag cr">Crunch time</span>` : g.gameID === GOTN_ID ? `<span class="rc-tag gn">🔥 Game of the night</span>` : bd.length ? `<span class="rc-tag ${esc(bd[0][0])}">${esc(bd[0][1])}</span>` : "";
  const mins = pre && +g.startTimeEpoch ? Math.round((+g.startTimeEpoch * 1000 - Date.now()) / 60000) : -1;
  if (mins >= 0 && mins <= 120) extra.unshift(`<span class="rc-cd">Tips in ${mins < 60 ? mins + "m" : Math.floor(mins / 60) + "h " + (mins % 60) + "m"}</span>`);
  let wp = "";
  if (g.gameState === "live" && !noFeed(g)) { const p = winProb(g), pa = Math.round((1 - p) * 100); const ab = sd => esc(fix(g[sd].names.char6 || g[sd].names.short));
    const fs = pa >= 50 ? "away" : "home", fp = Math.max(pa, 100 - pa);
    wp = `<div class="rc-wp" title="${esc(fix(g.away.names.short))} ${pa}% · ${esc(fix(g.home.names.short))} ${100 - pa}%. Chance to win, from the score, time left and rankings."><span class="rc-wpb"><i style="width:${pa}%;background:var(--ca)"></i><i style="width:${100 - pa}%;background:var(--ch)"></i></span><span class="rc-wpt"><b style="--fc:var(--${fs === "away" ? "ca" : "ch"})">${ab(fs)} ${fp}%</b> to win</span></div>` }
  return `<button class="${cls} rc ${g.gameState}${g.gameID === GOTN_ID ? " gotn-c" : ""}" data-game="${g.gameID}" style="--ca:${teamColorFor(sa) || "#2A2A2E"};--ch:${teamColorFor(sh) || "#2A2A2E"}">
    <div class="rc-teams">${row("away")}${row("home")}</div>${cardPick(g)}${wp}
    <div class="rc-side"><span class="rc-st ${st.cls}">${g.gameState === "live" ? '<i class="dot"></i>' : ""}${esc(st.txt)}</span>${net ? `<span class="rc-tv">${esc(net)}</span>` : ""}${tag}${extra.join("")}${favGame(g) ? `<span class="rc-fav" title="One of your teams">${STAR(true)}</span>` : ""}</div></button>`;
}

// Pick'em right on the card: tap a team before tip-off, no need to open the game
function cardPick(g) {
  if (!socialOn || !window.CBBChat?.on || !+g.startTimeEpoch) return "";
  const id = g.gameID, mine = MYPICK[id], locked = pickLocked(g), ct = PICKCT[id] || { home: 0, away: 0 }, n = ct.home + ct.away;
  const ab = sd => esc(fix(g[sd].names.char6 || g[sd].names.short));
  if (locked) {
    if (!mine) return "";
    if (g.gameState === "final") { const won = (+g.home.score > +g.away.score ? "home" : "away") === mine; return `<div class="rc-pk res ${won ? "won" : "lost"}">${won ? "✅" : "❌"} Your pick: ${ab(mine)}</div>` }
    return `<div class="rc-pk res">🔒 Your pick: ${ab(mine)}</div>`;
  }
  const pct = sd => n ? Math.round(ct[sd] / n * 100) : 0;
  const chip = sd => `<span role="button" tabindex="0" class="rc-pkb${mine === sd ? " on" : ""}" data-pick="${sd}" data-pickgame="${id}" aria-pressed="${mine === sd}" aria-label="Pick ${esc(fix(g[sd].names.short))} to win">${mine === sd ? "✓ " : ""}${ab(sd)}${mine && n ? ` <small>${pct(sd)}%</small>` : ""}</span>`;
  return `<div class="rc-pk"><span class="rc-pk-l">${mine ? "Your pick" : "Who wins?"}</span>${chip("away")}${chip("home")}</div>`;
}

document.addEventListener("keydown", e => {
  const pb = e.target.closest && e.target.closest(".rc-pkb"); if (!pb || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault(); e.stopImmediatePropagation(); makePick(pb.dataset.pickgame, pb.dataset.pick);
}, true);

// ---------- Loading placeholders ----------
const SKEL_CARD = `<div class="game rc skel" aria-hidden="true"><div class="rc-teams"><div class="skel-tm"><i class="sk sk-c"></i><i class="sk" style="width:60%"></i></div><div class="skel-tm"><i class="sk sk-c"></i><i class="sk" style="width:52%"></i></div></div><div class="rc-side"><i class="sk" style="width:60px"></i><i class="sk" style="width:40px;height:10px"></i></div></div>`;

// ---------- My Teams bar ----------
// The teams you follow, pinned above the scores: the live score, today's tip time, or the next game with a countdown.
let SEASON_DATA = null, myBarAsked = false;
function inHours(ms) {
  const m = Math.max(0, Math.round((ms - Date.now()) / 60000));
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `in ${h}h ${m % 60}m`;
  const d = Math.floor(h / 24); return `in ${d}d ${h % 24}h`;
}
function myNext(slug) {
  const today = (cache.t || []).filter(g => teamSlug(g.home) === slug || teamSlug(g.away) === slug);
  const live = today.find(g => g.gameState === "live"); if (live) return { kind: "live", g: live };
  const pre = today.find(g => g.gameState === "pre"); if (pre) return { kind: "today", g: pre };
  const fin = today.find(g => g.gameState === "final");
  const next = (SEASON_DATA?.games || []).filter(x => (x.a[0] === slug || x.h[0] === slug) && x.s === "pre" && (+x.t || 0) * 1000 > Date.now() && !today.some(g => g.gameID === x.id)).sort((a, b) => a.t - b.t)[0];
  if (fin) return { kind: "final", g: fin, next };
  if (next) return { kind: "next", r: next };
  return null;
}
function drawMyBar() {
  const el = $("#mybar"); if (!el) return;
  if (!FAVS.length) { el.hidden = true; el.innerHTML = ""; return }
  if (!SEASON_DATA && !myBarAsked) { myBarAsked = true; loadSeason().then(r => { SEASON_DATA = r; drawMyBar() }).catch(() => { }) }
  const chips = FAVS.map(slug => {
    const x = myNext(slug), name = teamName(slug);
    let line = "", cls = "", attrs = `href="/team/${esc(slug)}"`, tag = "a";
    if (x && x.g) {
      const g = x.g, home = teamSlug(g.home) === slug, me = home ? g.home : g.away, op = home ? g.away : g.home, opn = esc(fix(op.names.short)), vs = home ? "vs" : "at";
      tag = "button"; attrs = `type="button" data-game="${esc(g.gameID)}" data-day-of="t"`;
      if (x.kind === "live") { cls = "live"; line = `<b>${esc(me.score || 0)}–${esc(op.score || 0)}</b> ${vs} ${opn} · ${esc(status(g).txt)}` }
      else if (x.kind === "today") { line = `Today ${esc(status(g).txt)} ${vs} ${opn}${g.network ? ` · ${esc(g.network.split(" / ")[0])}` : ""}<em>${+g.startTimeEpoch ? inHours(+g.startTimeEpoch * 1000) : ""}</em>` }
      else { const won = +me.score > +op.score; cls = won ? "won" : "lost"; line = `<b>${won ? "W" : "L"} ${esc(me.score)}–${esc(op.score)}</b> ${vs} ${opn}${x.next ? `<em>Next: ${esc(nextTxt(x.next, slug))}</em>` : ""}` }
    } else if (x && x.r) line = `${esc(nextTxt(x.r, slug))}<em>${inHours(x.r.t * 1000)}</em>`;
    else line = `<span class="muted">No games scheduled</span>`;
    return `<${tag} class="myc ${cls}" ${attrs}>${mono(name, slug)}<span class="myc-t"><b class="myc-n">${esc(name)}</b><span class="myc-l">${cls === "live" ? `<i class="dot"></i>` : ""}${line}</span></span></${tag}>`;
  });
  const html = `<div class="mybar-h"><span>${STAR(true)} My teams</span><button type="button" class="chat-link" data-myteams>Edit</button></div><div class="mybar-row">${chips.join("")}</div>`;
  if (el.innerHTML !== html) el.innerHTML = html;
  el.hidden = false;
}
function nextTxt(r, slug) {
  const home = r.h[0] === slug, op = home ? r.a : r.h, dt = new Date(r.t * 1000);
  const day = dt.toLocaleDateString([], { weekday: "short" }), tm = dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${day} ${tm} ${home ? "vs" : "at"} ${fix(op[1] || teamName(op[0]))}${r.n ? ` · ${r.n.split(" / ")[0]}` : ""}`;
}
window.addEventListener("cbb-favs", () => drawMyBar());
setInterval(() => { if (!document.hidden) drawMyBar() }, 60000); // keep the countdowns fresh

// ---------- Calendar ----------
function calMenu(slug, name) {
  const feed = `${location.host}/cal/${slug}.ics`;
  return `<details class="calmenu"><summary class="followbtn">📅 Add to calendar</summary><div class="calpop" role="menu">
    <p>Every ${esc(name)} game in your calendar with tip time and TV. It updates on its own.</p>
    <a role="menuitem" href="webcal://${esc(feed)}">Apple Calendar / iPhone</a>
    <a role="menuitem" href="https://calendar.google.com/calendar/render?cid=${encodeURIComponent("webcal://" + feed)}" target="_blank" rel="noopener">Google Calendar</a>
    <a role="menuitem" href="https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent("https://" + feed)}&name=${encodeURIComponent(name + " Basketball")}" target="_blank" rel="noopener">Outlook</a>
    <button type="button" role="menuitem" data-copycal="https://${esc(feed)}">Copy calendar link</button></div></details>`;
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-copycal]"); if (b) { try { await navigator.clipboard.writeText(b.dataset.copycal); b.textContent = "Link copied ✓" } catch { b.textContent = b.dataset.copycal } return }
  const open = document.querySelector("details.calmenu[open]"); if (open && !e.target.closest("details.calmenu")) open.open = false;
});

// ---------- Player tracker ----------
// Tap ★ on a player in a box score to pin his live line to the top of the game screen.
let PINS = {}; try { PINS = JSON.parse(localStorage.getItem("cbb_pins") || "{}") || {} } catch { PINS = {} }
const pinKey = (side, p) => `${side}|${p.firstName || ""}|${p.lastName || ""}`;
const isPinned = (id, side, p) => (PINS[id] || []).includes(pinKey(side, p));
function togglePin(id, key) {
  const list = PINS[id] || (PINS[id] = []), i = list.indexOf(key);
  if (i >= 0) list.splice(i, 1); else list.push(key);
  if (!list.length) delete PINS[id];
  const ids = Object.keys(PINS); if (ids.length > 30) delete PINS[ids[0]]; // keep the list short
  try { localStorage.setItem("cbb_pins", JSON.stringify(PINS)) } catch { }
}
function trackerHTML(sg, bA, bH) {
  const list = PINS[sg.gameID]; if (!list || !list.length) return "";
  const rows = list.map(key => {
    const [side, first, last] = key.split("|"), b = side === "home" ? bH : bA;
    const p = (b?.playerStats || []).find(x => (x.firstName || "") === first && (x.lastName || "") === last);
    const nm = esc(fix(`${first.charAt(0)}. ${last}`)), tm = esc(fix(sg[side]?.names?.char6 || sg[side]?.names?.short || ""));
    if (!p) return `<div class="trk"><span class="trk-n">${nm} <small>${tm}</small></span><span class="trk-s muted">No stats yet</span><button class="trk-x" data-pin="${esc(key)}" aria-label="Stop tracking">✕</button></div>`;
    const fouls = +p.personalFouls || 0;
    return `<div class="trk"><span class="trk-n">${nm} <small>${tm}</small></span><span class="trk-s"><b>${esc(p.points || 0)}</b> pts · ${esc(p.totalRebounds || 0)} reb · ${esc(p.assists || 0)} ast · ${esc(p.fieldGoalsMade || 0)}-${esc(p.fieldGoalsAttempted || 0)} FG${+p.threePointsMade ? ` · ${esc(p.threePointsMade)} 3PM` : ""} · <span class="${fouls >= 4 ? "trk-f" : ""}">${fouls} PF</span></span><button class="trk-x" data-pin="${esc(key)}" aria-label="Stop tracking">✕</button></div>`;
  });
  return `<div class="mg-card trkbox"><h4>📌 Tracking</h4>${rows.join("")}</div>`;
}
MG.addEventListener("click", e => {
  const b = e.target.closest("[data-pin]"); if (!b || !openGame) return;
  e.stopPropagation(); togglePin(openGame, b.dataset.pin); drawGame();
}, true);

// ---------- Search ----------
// One box for teams, players and games. Opens with the 🔍 button or the "/" key.
const QALIAS = { iu: "indiana", unc: "north carolina", uk: "kentucky", osu: "ohio st", msu: "michigan st", ku: "kansas", ksu: "kansas st", kstate: "kansas st", zags: "gonzaga",
  cuse: "syracuse", nova: "villanova", usc: "southern california", vt: "virginia tech", uva: "virginia", fsu: "florida st", gt: "georgia tech", isu: "iowa st", ou: "oklahoma",
  okst: "oklahoma st", psu: "penn st", ttu: "texas tech", wvu: "west virginia", sdsu: "san diego st", bama: "alabama", mizzou: "missouri", pitt: "pittsburgh", ole: "ole miss",
  tamu: "texas a&m", uw: "washington", asu: "arizona st", ucsb: "uc santa barbara", "st johns": "st john's", ncst: "nc state", wisco: "wisconsin", illini: "illinois", hoosiers: "indiana" };
const norm = s => fix(String(s)).toLowerCase().replace(/[.'’]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
let SIDX = null;
async function searchIndex() {
  if (SIDX) return SIDX;
  const teams = {};
  for (const [n, sl] of Object.entries(window.TEAM_SLUGS || {})) { const t = teams[sl] || (teams[sl] = { slug: sl, name: n, hay: "" }); if (n.length < t.name.length) t.name = n; t.hay += " " + norm(n) }
  const players = [];
  try {
    const st = await fetch("/stats.json").then(r => r.json()), seen = new Set();
    for (const c of st.cats || []) if (c.kind === "individual") for (const r of c.rows || []) { const k = r.Name + "|" + r.Team; if (r.Name && !seen.has(k)) { seen.add(k); players.push({ name: fix(r.Name), team: fix(r.Team), hay: norm(r.Name) + " " + norm(r.Team) }) } }
  } catch { }
  try { SEASON_DATA = SEASON_DATA || await loadSeason() } catch { }
  return (SIDX = { teams: Object.values(teams), players });
}
function expandQuery(q) {
  let n = " " + norm(q) + " ";
  for (const [k, v] of Object.entries(QALIAS)) n = n.replace(new RegExp(` ${norm(k)} `, "g"), ` ${norm(v)} `);
  return n.trim().split(" ").filter(Boolean);
}
const matchAll = (hay, toks) => toks.every(t => (" " + hay).includes(" " + t));
function runSearch(q, idx) {
  const toks = expandQuery(q); if (!toks.length) return { teams: [], players: [], games: [] };
  const teams = idx.teams.filter(t => matchAll(t.hay, toks)).sort((a, b) => (FAVS.includes(b.slug) - FAVS.includes(a.slug)) || a.name.length - b.name.length).slice(0, 6);
  const players = idx.players.filter(p => matchAll(p.hay, toks)).slice(0, 5);
  // games: today's board first, then the season (last 3 days and next 7)
  const now = Date.now(), games = [], seen = new Set();
  for (const g of cache.t || []) { const hay = norm(g.away.names.short) + " " + norm(g.home.names.short) + " " + norm(teamName(teamSlug(g.away))) + " " + norm(teamName(teamSlug(g.home))); if (matchAll(hay, toks)) { seen.add(g.gameID); games.push({ today: g }) } }
  for (const r of SEASON_DATA?.games || []) {
    if (seen.has(r.id) || !r.t || Math.abs(r.t * 1000 - now) > 7 * 864e5 || (r.t * 1000 < now - 3 * 864e5)) continue;
    const hay = norm(r.a[1]) + " " + norm(r.h[1]) + " " + norm(teamName(r.a[0])) + " " + norm(teamName(r.h[0]));
    if (matchAll(hay, toks)) games.push({ r });
  }
  games.sort((a, b) => (a.today ? 0 : 1) - (b.today ? 0 : 1) || Math.abs((a.r?.t || 0) * 1000 - now) - Math.abs((b.r?.t || 0) * 1000 - now));
  return { teams, players, games: games.slice(0, 6) };
}
function searchResultsHTML(res, q) {
  const sec = (title, items) => items.length ? `<h5>${title}</h5>${items.join("")}` : "";
  const teams = res.teams.map(t => `<a class="sres" href="/team/${esc(t.slug)}">${mono(t.name, t.slug)}<span><b>${esc(fix(t.name))}</b><small>Team page · schedule · stats</small></span></a>`);
  const games = res.games.map(x => {
    if (x.today) { const g = x.today; return `<button type="button" class="sres" data-game="${esc(g.gameID)}" data-day-of="t">${mono(g.away.names.short, g.away.names.seo)}<span><b>${esc(fix(g.away.names.short))} ${g.gameState === "pre" ? "at" : esc(g.away.score) + "–" + esc(g.home.score)} ${esc(fix(g.home.names.short))}</b><small>${g.gameState === "live" ? "Live now · " : g.gameState === "final" ? "Final · " : "Today · "}${esc(status(g).txt)}</small></span></button>` }
    const r = x.r, dt = new Date(r.t * 1000), fin = r.s === "final";
    return `<a class="sres" href="/game/${esc(r.id)}">${mono(r.a[1], r.a[0])}<span><b>${esc(fix(r.a[1]))} ${fin ? `${esc(r.a[2])}–${esc(r.h[2])}` : "at"} ${esc(fix(r.h[1]))}</b><small>${fin ? "Final · recap" : "Preview"} · ${dt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}${fin ? "" : " " + dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span></a>`;
  });
  const players = res.players.map(p => { const sl = logoSlug(p.team); return `<a class="sres" href="/team/${esc(sl)}">${mono(p.team, sl)}<span><b>${esc(p.name)}</b><small>${esc(p.team)} · national stat leader</small></span></a>` });
  const html = sec("Teams", teams) + sec("Games", games) + sec("Players", players);
  return html || `<p class="sr-empty">Nothing found for "${esc(q)}". Try a team name like "Duke" or a matchup like "IU Purdue".</p>`;
}
function openSearch() {
  let ov = $("#srch");
  if (!ov) {
    ov = document.createElement("div"); ov.id = "srch"; ov.className = "srch"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Search");
    ov.innerHTML = `<div class="srch-box"><div class="srch-in"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input type="search" placeholder="Teams, players or games (try “IU Purdue”)" autocomplete="off" aria-label="Search"><button type="button" class="srch-x" aria-label="Close search">Esc</button></div><div class="srch-res" aria-live="polite"></div></div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector("input"), out = ov.querySelector(".srch-res");
    const draw = async () => { const q = inp.value.trim(); if (!q) { out.innerHTML = `<p class="sr-empty">Search any Division I team, today's games, or the nation's stat leaders.</p>`; return } const idx = await searchIndex(); if (inp.value.trim() === q) out.innerHTML = searchResultsHTML(runSearch(q, idx), q) };
    inp.addEventListener("input", draw);
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { const first = out.querySelector(".sres"); if (first) first.click() } });
    ov.addEventListener("click", e => { if (e.target === ov || e.target.closest(".srch-x") || e.target.closest(".sres")) closeSearch() });
    draw();
  }
  ov.hidden = false; document.documentElement.classList.add("srch-open");
  const inp = ov.querySelector("input"); inp.focus(); inp.select();
  searchIndex();
}
function closeSearch() { const ov = $("#srch"); if (ov) ov.hidden = true; document.documentElement.classList.remove("srch-open") }
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("#srch") && !$("#srch").hidden) { closeSearch(); return }
  if (e.key === "/" && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") && !document.activeElement?.isContentEditable) { e.preventDefault(); openSearch() }
});
$("#searchbtn")?.addEventListener("click", openSearch);

// ---------- start ----------
drawDays(); drawGames(); drawNews(); drawInstagram(); route();
if (!loaded.rk) { loaded.rk = 1; loadRankings() } // AP ranks are also used on Scores and Standings
loadRecords(); setInterval(loadRecords, 3600000);
refresh();
setInterval(() => { if (!document.hidden) refresh() }, REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh() });
// a few helpers shared with more.js (team picker, alerts)
window.CBBApp = { favs: () => FAVS.slice(), toggleFav, mono, logoSlug };
})();
