// App install, "Who's your team?", game alerts and the Pick'em leaderboard.
// Loaded after app.js and chat.js, and uses a few of app.js's helpers (window.CBBApp).
(() => {
"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } },
};
const CFG = window.CHAT_CONFIG || {};
const DB_ON = /^https:\/\/.+/.test(CFG.url || "") && (CFG.anonKey || "").length > 20;
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const APP = () => window.CBBApp || {};
const favs = () => (APP().favs ? APP().favs() : []);
async function rpc(name, body) {
  const r = await fetch(`${CFG.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: CFG.anonKey, "content-type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body || {}) });
  if (!r.ok) { const t = await r.text().catch(() => ""); const e = new Error(t || "HTTP " + r.status); e.status = r.status; throw e }
  return r.json();
}
// send the login along when there is one, so the database knows who's asking
async function authHeader() {
  try {
    if (!window.CBBChat?.hasSession?.()) return {};
    const sb = await window.CBBChat.client(); const { data } = await sb.auth.getSession();
    return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
  } catch { return {} }
}

// one modal for everything on this page
let modal = null;
function openModal(html, cls = "") {
  if (!modal) {
    modal = document.createElement("div"); modal.className = "modal more-modal"; modal.hidden = true;
    modal.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if (e.target === modal || e.target.closest("[data-mclose]")) closeModal() });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && modal && !modal.hidden) closeModal() });
  }
  const card = modal.querySelector(".modal-card"); card.className = "modal-card " + cls; card.innerHTML = html;
  modal.hidden = false; return card;
}
function closeModal() { if (modal) modal.hidden = true }

// ================= installable app =================
let swReg = null, deferredInstall = null;
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("/sw.js").then(r => { swReg = r; refreshBell() }).catch(() => { });
  navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.open) location.href = e.data.open });
}
const getReg = async () => swReg || (("serviceWorker" in navigator) ? (swReg = await navigator.serviceWorker.ready) : null);
// count visits (once per browser session) so the install banner only shows to people who come back
try { if (!sessionStorage.getItem("cbb_v")) { sessionStorage.setItem("cbb_v", "1"); store.set("cbb_visits", store.get("cbb_visits", 0) + 1) } } catch { }
addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; maybeInstallBanner() });
addEventListener("appinstalled", () => { deferredInstall = null; $("#instbar")?.remove() });
function maybeInstallBanner(force) {
  if (standalone() || $("#instbar")) return;
  if (!force && (store.get("cbb_visits", 0) < 2 || Date.now() - store.get("cbb_inst_x", 0) < 14 * 864e5)) return;
  if (!deferredInstall && !isIOS) return;
  const bar = document.createElement("div"); bar.id = "instbar"; bar.className = "instbar";
  bar.innerHTML = `<img src="icon-192.png" alt="" width="44" height="44"><div><b>Get the College Basketball app</b><span>${deferredInstall ? "Full-screen live scores and game alerts, right from your home screen." : `Tap <b>Share</b> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> then <b>Add to Home Screen</b>.`}</span></div>${deferredInstall ? `<button class="chat-btn" data-install>Install</button>` : ""}<button class="instbar-x" data-instx aria-label="Not now">×</button>`;
  document.body.appendChild(bar);
}
setTimeout(() => { if (isIOS) maybeInstallBanner() }, 8000);
document.addEventListener("click", async e => {
  if (e.target.closest("[data-instx]")) { store.set("cbb_inst_x", Date.now()); $("#instbar")?.remove(); return }
  if (e.target.closest("[data-install]")) {
    if (!deferredInstall) return;
    deferredInstall.prompt(); const { outcome } = await deferredInstall.userChoice.catch(() => ({}));
    deferredInstall = null; $("#instbar")?.remove(); if (outcome !== "accepted") store.set("cbb_inst_x", Date.now());
  }
});

// ================= "Who's your team?" =================
// Shown once, a few seconds into someone's first visit. Picks are the same stars as the Teams tab.
const POPULAR = ["duke", "north-carolina", "kentucky", "kansas", "uconn", "ucla", "michigan-st", "illinois", "gonzaga", "indiana",
  "arizona", "purdue", "houston", "tennessee", "auburn", "alabama", "florida", "villanova", "louisville", "syracuse", "michigan",
  "texas", "baylor", "iowa", "wisconsin", "ohio-st", "arkansas", "marquette", "creighton", "st-johns-ny", "memphis", "byu"];
function allTeams() {
  const by = {};
  for (const [name, slug] of Object.entries(window.TEAM_SLUGS || {})) if (!by[slug] || name.length < by[slug].length) by[slug] = name;
  return Object.entries(by).map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
}
const teamName = slug => (allTeams().find(t => t.slug === slug) || {}).name || slug;
let pickerQ = "";
function pickerHTML() {
  const teams = allTeams(), q = pickerQ.trim().toLowerCase(), mine = new Set(favs());
  let list = q ? teams.filter(t => t.name.toLowerCase().includes(q)).slice(0, 40) : POPULAR.map(s => teams.find(t => t.slug === s)).filter(Boolean);
  // your teams always show first
  const picked = teams.filter(t => mine.has(t.slug) && !list.includes(t));
  list = [...picked, ...list];
  return list.map(t => `<button class="tp-team ${mine.has(t.slug) ? "on" : ""}" data-tpick="${esc(t.slug)}" aria-pressed="${mine.has(t.slug)}">${APP().mono ? APP().mono(t.name, t.slug) : ""}<span>${esc(t.name)}</span><i>${mine.has(t.slug) ? "✓" : "+"}</i></button>`).join("") || `<p class="tp-none">No team called “${esc(pickerQ)}”.</p>`;
}
function openPicker(fromOnboarding) {
  store.set("cbb_onb", 1);
  pickerQ = "";
  const card = openModal(`<button class="modal-x" data-mclose aria-label="Close">×</button>
    <h2>Who's your team?</h2><p class="tp-sub">Pick as many as you like. Their games go to the top of Scores${("PushManager" in window) || isIOS ? ", and you can get alerts when they play" : ""}.</p>
    <input class="tp-q" type="search" placeholder="Search all 365 teams" aria-label="Search teams" autocomplete="off">
    <div class="tp-grid">${pickerHTML()}</div>
    <div class="tp-foot"><span class="tp-n"></span><button class="chat-btn" data-tpdone>Done</button></div>`, "tp-card");
  card.dataset.onb = fromOnboarding ? "1" : "";
  updatePickCount();
  if (!fromOnboarding) card.querySelector(".tp-q").focus();
}
function updatePickCount() { const n = favs().length, el = modal?.querySelector(".tp-n"); if (el) el.textContent = n ? `${n} team${n === 1 ? "" : "s"} picked` : "" }
document.addEventListener("input", e => { if (e.target.classList?.contains("tp-q")) { pickerQ = e.target.value; modal.querySelector(".tp-grid").innerHTML = pickerHTML() } });
document.addEventListener("click", e => {
  const t = e.target.closest("[data-tpick]");
  if (t) { APP().toggleFav?.(t.dataset.tpick); modal.querySelector(".tp-grid").innerHTML = pickerHTML(); updatePickCount(); return }
  if (e.target.closest("[data-tpdone]")) {
    const onb = modal.querySelector(".modal-card").dataset.onb === "1";
    if (onb && favs().length && !alertsOn) openAlerts(true); else closeModal();
    return;
  }
  if (e.target.closest("[data-myteams]")) { e.preventDefault(); openPicker(false) }
});
// first visit: ask once, after the scores have had a moment to load
setTimeout(() => {
  if (store.get("cbb_onb", 0) || favs().length || (modal && !modal.hidden) || document.querySelector(".modal:not([hidden])") || /^#(unsubscribe|admin|game-)/.test(location.hash)) return;
  if (document.documentElement.classList.contains("mg-open")) return;
  openPicker(true);
}, 6000);

// ================= game alerts =================
let alertsOn = false;
const KINDS = [
  ["myteams", "⭐", "My teams", "Tip-off, crunch time and the final for the teams you follow"],
  ["upsets", "🚨", "Upset alerts", "When a ranked team is in trouble late, and when the upset happens"],
  ["close", "⏱️", "Close Top 25 finishes", "Any game with a ranked team that's within 5 in the last 2 minutes"],
];
const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
async function currentSub() { try { const r = await getReg(); return r ? await r.pushManager.getSubscription() : null } catch { return null } }
async function refreshBell() {
  const sub = pushOK() ? await currentSub() : null;
  alertsOn = !!sub && Notification.permission === "granted";
  const b = $("#alertsbtn"); if (b) { b.classList.toggle("on", alertsOn); b.setAttribute("aria-label", alertsOn ? "Game alerts (on)" : "Game alerts") }
}
const b64 = s => { const p = "=".repeat((4 - s.length % 4) % 4), raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, c => c.charCodeAt(0)) };
async function saveSub(sub, kinds) {
  const j = sub.toJSON();
  await rpc("save_push", { ep: j.endpoint, key: j.keys.p256dh, secret: j.keys.auth, team_list: favs(), kind_list: kinds });
}
function alertsHTML(note = "") {
  const kinds = store.get("cbb_alert_kinds", ["myteams", "upsets"]), f = favs();
  if (!pushOK()) {
    const ios = isIOS && !standalone();
    return `<button class="modal-x" data-mclose aria-label="Close">×</button><h2>🔔 Game alerts</h2>
      ${ios ? `<p class="al-sub">On iPhone and iPad, alerts work once the site is on your home screen:</p>
        <ol class="al-steps"><li>Tap <b>Share</b> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> at the bottom of Safari.</li><li>Tap <b>Add to Home Screen</b>.</li><li>Open College Basketball from your home screen and tap 🔔 again.</li></ol>`
        : `<p class="al-sub">This browser can't show alerts. Try Chrome, Edge, Firefox or Safari.</p>`}`;
  }
  const blocked = Notification.permission === "denied";
  return `<button class="modal-x" data-mclose aria-label="Close">×</button><h2>🔔 Game alerts</h2>
    <p class="al-sub">${alertsOn ? "Alerts are on for this device. Pick what you want to hear about." : "Get a notification on this device when something big happens."}</p>
    <div class="al-list">${KINDS.map(([k, e, t, d]) => `<label class="al-row"><input type="checkbox" data-akind="${k}" ${kinds.includes(k) ? "checked" : ""}><span class="al-e">${e}</span><span><b>${t}</b><small>${d}</small>${k === "myteams" ? `<span class="al-teams">${f.length ? f.slice(0, 8).map(s => `<em>${esc(teamName(s))}</em>`).join("") + (f.length > 8 ? `<em>+${f.length - 8}</em>` : "") : "<em>No teams yet</em>"}<button type="button" class="chat-link" data-myteams>${f.length ? "Change" : "Pick teams"}</button></span>` : ""}</span></label>`).join("")}</div>
    ${blocked ? `<p class="al-msg bad">Notifications are blocked for this site. Allow them in your browser's site settings, then try again.</p>` : ""}
    <p class="al-msg" role="alert">${esc(note)}</p>
    <div class="al-actions"><button class="chat-btn wide" data-alerts-save ${blocked ? "disabled" : ""}>${alertsOn ? "Save" : "Turn on alerts"}</button>${alertsOn ? `<button class="chat-link" data-alerts-off>Turn off alerts on this device</button>` : ""}</div>`;
}
async function openAlerts() { await refreshBell(); openModal(alertsHTML(), "al-card") }
async function saveAlerts(btn) {
  const kinds = [...modal.querySelectorAll("[data-akind]:checked")].map(x => x.dataset.akind);
  const say = t => { const m = modal.querySelector(".al-msg[role=alert]"); if (m) m.textContent = t };
  if (!kinds.length) return say("Pick at least one kind of alert, or turn alerts off.");
  if (kinds.includes("myteams") && !favs().length && kinds.length === 1) return say("Pick a team to follow first (tap “Pick teams”).");
  if (!DB_ON) return say("Alerts aren't set up on this site yet.");
  btn.disabled = true; say("");
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { say("Notifications weren't allowed. Allow them for this site to get alerts."); return }
    const reg = await getReg(); if (!reg) throw new Error("no service worker");
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { publicKey } = await fetch("/api/alerts?info=1").then(r => r.json()).catch(() => ({}));
      if (!publicKey) { say("Alerts aren't switched on for the site yet. Check back soon!"); return }
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) });
    }
    await saveSub(sub, kinds);
    store.set("cbb_alert_kinds", kinds);
    await refreshBell();
    modal.querySelector(".modal-card").innerHTML = alertsHTML("✅ You're all set. We'll ping you when it matters.");
  } catch (err) {
    say(err.status === 404 ? "Alerts aren't switched on for the site yet. Check back soon!" : "Couldn't turn on alerts. Try again in a minute.");
  } finally { if (btn.isConnected) btn.disabled = false }
}
async function alertsOff() {
  const sub = await currentSub();
  if (sub) { try { await rpc("delete_push", { ep: sub.endpoint }) } catch { } try { await sub.unsubscribe() } catch { } }
  await refreshBell();
  modal.querySelector(".modal-card").innerHTML = alertsHTML("Alerts are off for this device.");
}
document.addEventListener("click", e => {
  if (e.target.closest("#alertsbtn")) { e.preventDefault(); openAlerts(); return }
  const s = e.target.closest("[data-alerts-save]"); if (s) { saveAlerts(s); return }
  if (e.target.closest("[data-alerts-off]")) { alertsOff(); return }
});
// following a new team updates this device's alerts too
let favTimer = null;
addEventListener("cbb-favs", () => {
  clearTimeout(favTimer);
  favTimer = setTimeout(async () => { if (!alertsOn) return; const sub = await currentSub(); if (sub) saveSub(sub, store.get("cbb_alert_kinds", ["myteams", "upsets"])).catch(() => { }) }, 800);
});
refreshBell();

// ================= Pick'em leaderboard =================
let lbScope = "week";
async function drawPickem() {
  const box = $("#pickem"); if (!box) return;
  const me = window.CBBChat?.me?.() || null;
  box.innerHTML = `<div class="lb-top">
      <div class="lb-tabs" role="group" aria-label="Leaderboard"><button data-lb="week" aria-pressed="${lbScope === "week"}">This week</button><button data-lb="season" aria-pressed="${lbScope === "season"}">Season</button></div>
      <a class="chat-btn ghost" href="#scores">Make today's picks →</a></div>
    <div class="lb-body"><p class="lb-wait">Loading the leaderboard…</p></div>
    <p class="lb-how">Pick a winner on any game before tip-off (open a game, then the <b>Game</b> tab). Picks are graded when games go final. Ties on the board are broken by fewest misses. ${lbScope === "week" ? "The weekly board resets every Monday." : ""}</p>`;
  if (!DB_ON) { box.querySelector(".lb-body").innerHTML = `<p class="lb-empty">The leaderboard isn't set up yet.</p>`; return }
  let rows;
  try { rows = await rpc("pick_leaderboard", { scope: lbScope }) }
  catch (err) { box.querySelector(".lb-body").innerHTML = `<p class="lb-empty">${err.status === 404 ? "The leaderboard is coming soon." : "The leaderboard couldn't load. Try again in a minute."}</p>`; return }
  const body = box.querySelector(".lb-body"); if (!body) return;
  const meId = me?.id, mine = rows.find(r => r.user_id === meId);
  if (!rows.length) { body.innerHTML = `<p class="lb-empty">No graded picks ${lbScope === "week" ? "this week" : "yet"}. Make your picks, and check back after the games go final.</p>`; return }
  const medal = p => p === 1 ? "🥇" : p === 2 ? "🥈" : p === 3 ? "🥉" : p;
  const row = r => `<tr class="${r.user_id === meId ? "me" : ""} ${r.place <= 3 ? "podium" : ""}"><td class="lb-p">${medal(r.place)}</td><td class="lb-u">${esc(r.username)}${r.user_id === meId ? " <em>you</em>" : ""}</td><td class="num">${r.wins}-${r.losses}</td><td class="num lb-pct">${Math.round(r.wins / Math.max(1, r.wins + r.losses) * 100)}%</td><td class="num lb-s">${r.streak >= 3 ? `🔥 ${r.streak}` : r.streak || "–"}</td></tr>`;
  const top = rows.slice(0, 50);
  body.innerHTML = `${mine ? `<div class="lb-you">You're <b>#${mine.place}</b> of ${rows.length} · ${mine.wins}-${mine.losses}${mine.streak >= 2 ? ` · 🔥 ${mine.streak} straight` : ""}</div>` : me ? "" : `<div class="lb-you">Log in and make picks to get on the board. <button class="chat-link" data-lblogin>Log in</button></div>`}
    <div class="tblwrap"><table class="lb"><thead><tr><th>#</th><th>Fan</th><th class="num">W-L</th><th class="num">Pct</th><th class="num">Streak</th></tr></thead><tbody>${top.map(row).join("")}${mine && mine.place > 50 ? `<tr class="lb-gap"><td colspan="5">⋯</td></tr>${row(mine)}` : ""}</tbody></table></div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-lb]"); if (b) { lbScope = b.dataset.lb; drawPickem(); return }
  if (e.target.closest("[data-lblogin]")) window.CBBChat?.auth?.("login", "Log in to see your spot on the Pick'em leaderboard.");
});
addEventListener("cbb-auth", () => { if (!$("[data-view=pickem]")?.hidden) drawPickem() });

window.CBBMore = { drawPickem, openAlerts, openPicker, installBanner: () => maybeInstallBanner(true) };
if (location.hash === "#pickem") drawPickem(); // opened straight from a link
})();
