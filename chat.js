// Live game chat, powered by Supabase (accounts, messages and live updates).
// Settings live in chat-config.js. The database rules are in supabase-setup.sql.
(() => {
"use strict";
const CFG = window.CHAT_CONFIG || {};
const ON = /^https:\/\/.+/.test(CFG.url || "") && (CFG.anonKey || "").length > 20;
const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.10/dist/umd/supabase.js";
const MAX = 280, SLOW_MS = 3000, KEEP = 200;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const timeOf = iso => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

let sb = null, libLoading = null;
let me = null;            // { id, username, is_admin, banned }
let mount = null, gameId = null, gameLabel = "", channel = null;
let msgs = [], reportsByMsg = {}, reported = new Set(), open = false, lastSent = 0;
try { open = sessionStorage.getItem("cbb-chat-open") === "1" } catch { }

// ---------- library + session ----------
function loadLib() {
  if (window.supabase?.createClient) return Promise.resolve();
  if (libLoading) return libLoading;
  libLoading = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = LIB; s.async = true;
    s.onload = res; s.onerror = () => { libLoading = null; rej(new Error("Chat couldn't load. Check your connection and try again.")) };
    document.head.appendChild(s);
  });
  return libLoading;
}
async function client() {
  if (sb) return sb;
  await loadLib();
  sb = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  sb.auth.onAuthStateChange((_e, session) => { setTimeout(() => loadMe(session?.user).then(async () => { if (me?.is_admin && gameId) await loadReports(gameId); render(); window.dispatchEvent(new CustomEvent("cbb-auth")) }), 0) });
  const { data } = await sb.auth.getSession();
  await loadMe(data.session?.user);
  return sb;
}
async function loadMe(user) {
  if (!user) { me = null; return }
  const { data } = await sb.from("profiles").select("id, username, is_admin, banned").eq("id", user.id).maybeSingle();
  me = data || { id: user.id, username: user.user_metadata?.username || "you", is_admin: false, banned: false };
}

// ---------- public: called by the game panel ----------
function show(el, id, label, opts) {
  if (!ON) { el.innerHTML = ""; return }
  if (opts && opts.open && !open) { open = true; if (mount === el && gameId === id) render(true) } // the phone chat sheet always shows the full chat
  if (mount === el && gameId === id) return;   // same game: keep everything as is
  leave();
  mount = el; gameId = id; gameLabel = label; msgs = []; reportsByMsg = {};
  render();
  client().then(() => { if (gameId === id) { loadMessages(id); subscribe(id) } }).catch(e => setStatus(e.message));
}
function close() { leave(); if (mount) { mount.innerHTML = ""; mount.closest(".gdetail")?.classList.remove("with-chat") } mount = null; gameId = null }
function leave() { if (channel && sb) { sb.removeChannel(channel); channel = null } }

// ---------- data ----------
async function loadMessages(id) {
  const { data, error } = await sb.from("messages").select("id, game_id, user_id, username, body, deleted, created_at")
    .eq("game_id", id).eq("deleted", false).order("created_at", { ascending: false }).limit(KEEP);
  if (gameId !== id) return;
  if (error) { setStatus("Chat couldn't load. Try again in a minute."); return }
  msgs = (data || []).reverse();
  if (me?.is_admin) await loadReports(id);
  render(true);
}
async function loadReports(id) {
  const { data } = await sb.from("reports").select("message_id").eq("game_id", id);
  reportsByMsg = {}; for (const r of data || []) reportsByMsg[r.message_id] = (reportsByMsg[r.message_id] || 0) + 1;
}
function subscribe(id) {
  channel = sb.channel("game-" + id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `game_id=eq.${id}` }, p => {
      if (gameId !== id || msgs.some(m => m.id === p.new.id)) return;
      msgs.push(p.new); if (msgs.length > KEEP) msgs.shift(); renderList(true);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `game_id=eq.${id}` }, p => {
      if (p.new.deleted) { msgs = msgs.filter(m => m.id !== p.new.id); renderList() }
    })
    .subscribe();
}

// ---------- drawing ----------
function setStatus(t) { const s = mount?.querySelector(".chat-status"); if (s) { s.textContent = t; s.hidden = !t } }
function render(scrollDown) {
  if (!mount || !ON) return;
  // on wide screens an open chat sits beside the stats instead of above them
  mount.closest(".gdetail")?.classList.toggle("with-chat", open);
  const count = msgs.length;
  if (!open) {
    mount.innerHTML = `<div class="chatbar"><div><b>Game chat</b><span>${count ? `${count}${count >= KEEP ? "+" : ""} message${count === 1 ? "" : "s"}` : "Be the first to talk about this game"}</span></div><button class="chat-btn" data-chat="open">Open chat</button></div>`;
    return;
  }
  const who = me
    ? `<span>Chatting as <b>${esc(me.username)}</b>${me.is_admin ? ' <span class="chat-admin">Admin</span>' : ""}</span><button class="chat-link" data-chat="logout">Log out</button>`
    : `<span>Read along, or log in to join.</span>`;
  const composer = !me
    ? `<div class="chat-join"><button class="chat-btn" data-chat="signup">Create account</button><button class="chat-btn ghost" data-chat="login">Log in</button></div>`
    : me.banned
      ? `<div class="chat-join"><span>You've been removed from the chat.</span></div>`
      : `<form class="chat-form" data-chat="form"><label class="sr" for="chat-input">Message</label><input id="chat-input" maxlength="${MAX}" autocomplete="off" placeholder="Say something about ${esc(gameLabel)}"><span class="chat-count" aria-live="polite"></span><button class="chat-btn" type="submit">Send</button></form>`;
  mount.innerHTML = `<section class="chat" aria-label="Game chat">
    <div class="chat-head"><div><b>Game chat</b><a href="#rules" class="chat-link">Chat rules</a></div><button class="chat-link" data-chat="hide">Hide chat</button></div>
    <div class="chat-list" role="log" aria-live="polite"></div>
    <div class="chat-status" hidden></div>
    <div class="chat-foot"><div class="chat-who">${who}</div>${composer}</div>
  </section>`;
  renderList(scrollDown !== false);
}
function msgHTML(m) {
  const mine = me && m.user_id === me.id;
  const tools = [];
  if (me && !mine && !me.banned) tools.push(reported.has(m.id) ? `<span class="chat-done">Reported</span>` : `<button class="chat-link" data-chat="report" data-id="${m.id}">Report</button>`);
  if (me?.is_admin) {
    tools.push(`<button class="chat-link danger" data-chat="delete" data-id="${m.id}">Delete</button>`);
    if (!mine) tools.push(`<button class="chat-link danger" data-chat="ban" data-uid="${esc(m.user_id)}" data-name="${esc(m.username)}">Ban</button>`);
  }
  const flags = me?.is_admin && reportsByMsg[m.id] ? `<span class="chat-flag">${reportsByMsg[m.id]} report${reportsByMsg[m.id] > 1 ? "s" : ""}</span>` : "";
  return `<div class="chat-msg ${mine ? "mine" : ""}" data-mid="${m.id}"><div class="chat-meta"><b>${esc(m.username)}</b><time>${timeOf(m.created_at)}</time>${flags}<span class="chat-tools">${tools.join("")}</span></div><p>${esc(m.body)}</p></div>`;
}
function renderList(scrollDown) {
  const list = mount?.querySelector(".chat-list"); if (!list) { render(); return }
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  list.innerHTML = msgs.length ? msgs.map(msgHTML).join("") : `<p class="chat-empty">No messages yet. Start the conversation.</p>`;
  if (scrollDown || nearBottom) list.scrollTop = list.scrollHeight;
}

// ---------- actions ----------
async function send(input) {
  const body = input.value.replace(/\s+/g, " ").trim();
  if (!body) return;
  const wait = SLOW_MS - (Date.now() - lastSent);
  if (wait > 0) { setStatus(`Slow mode: wait ${Math.ceil(wait / 1000)} more second${wait > 1000 ? "s" : ""}.`); return }
  input.disabled = true; setStatus("");
  const { data, error } = await sb.from("messages").insert({ game_id: gameId, user_id: me.id, username: me.username, body }).select().single();
  input.disabled = false; input.focus();
  if (error) { setStatus(friendly(error.message)); return }
  lastSent = Date.now(); input.value = ""; countChars(input);
  if (!msgs.some(m => m.id === data.id)) { msgs.push(data); renderList(true) }
}
function friendly(m) {
  m = String(m || "");
  if (/row-level security/i.test(m)) return "You can't post right now. Try logging out and back in.";
  if (/JWT|token/i.test(m)) return "Your login expired. Log in again.";
  return m.replace(/^.*?:\s*(?=[A-Z])/, "") || "Something went wrong. Try again.";
}
async function report(id) {
  const { error } = await sb.from("reports").insert({ message_id: id, game_id: gameId, reporter: me.id });
  if (error && !/duplicate/i.test(error.message)) { setStatus("Couldn't send the report. Try again."); return }
  reported.add(id); renderList(); setStatus("Thanks. An admin will take a look.");
}
async function remove(id) {
  const { error } = await sb.from("messages").update({ deleted: true }).eq("id", id);
  if (error) { setStatus("Couldn't delete: " + friendly(error.message)); return }
  msgs = msgs.filter(m => m.id !== id); renderList();
}
async function ban(uid, name, btn) {
  if (btn.dataset.confirm !== "1") { btn.dataset.confirm = "1"; btn.textContent = `Ban ${name}?`; setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ""; btn.textContent = "Ban" } }, 4000); return }
  const { error } = await sb.from("profiles").update({ banned: true }).eq("id", uid);
  if (error) { setStatus("Couldn't ban: " + friendly(error.message)); return }
  setStatus(`${name} is banned and can't post anymore.`);
}
function countChars(input) {
  const c = input.form?.querySelector(".chat-count"); if (!c) return;
  const left = MAX - input.value.length; c.textContent = left <= 40 ? left : ""; c.classList.toggle("low", left <= 10);
}

// ---------- sign up / log in ----------
let modal = null;
function openModal(mode) {
  if (!modal) {
    modal = document.createElement("div"); modal.className = "modal"; modal.hidden = true;
    modal.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="auth-title"></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if (e.target === modal || e.target.closest("[data-auth='close']")) closeModal() });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeModal() });
  }
  drawModal(mode); modal.hidden = false;
  modal.querySelector("input")?.focus();
}
function closeModal() { if (modal) modal.hidden = true }
let modalWhy = "";
function drawModal(mode, note = "") {
  const card = modal.querySelector(".modal-card"), signup = mode === "signup";
  card.innerHTML = `<button class="modal-x" data-auth="close" aria-label="Close">×</button>
    <img class="modal-logo" src="logo.png" alt="" width="44" height="44">
    <h2 id="auth-title">${signup ? "Create your account" : "Log in"}</h2>${modalWhy ? `<p class="auth-why">${esc(modalWhy)}</p>` : ""}
    <div class="modal-tabs" role="tablist"><button role="tab" aria-selected="${!signup}" data-auth="tab-login">Log in</button><button role="tab" aria-selected="${signup}" data-auth="tab-signup">Create account</button></div>
    <form class="auth-form" data-auth="${signup ? "signup" : "login"}" novalidate>
      ${signup ? `<div><label for="au-name">Username</label><input id="au-name" autocomplete="username" maxlength="20" required placeholder="3–20 letters, numbers or _"><small class="hint" id="au-name-hint"></small></div>` : ""}
      <div><label for="au-email">Email</label><input id="au-email" type="email" autocomplete="email" required></div>
      <div><label for="au-pass">Password</label><input id="au-pass" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" required ${signup ? 'placeholder="At least 8 characters"' : ""}></div>
      ${signup ? `<label class="check"><input id="au-age" type="checkbox"><span>I'm 13 or older</span></label>
      <label class="check"><input id="au-rules" type="checkbox"><span>I agree to the <a href="#rules" data-auth="close">chat rules and privacy policy</a></span></label>` : ""}
      <p class="auth-msg" role="alert">${esc(note)}</p>
      <button class="chat-btn wide" type="submit">${signup ? "Create account" : "Log in"}</button>
    </form>`;
}
async function submitAuth(form) {
  const mode = form.dataset.auth, msg = form.querySelector(".auth-msg"), btn = form.querySelector("button[type=submit]");
  const email = form.querySelector("#au-email").value.trim(), pass = form.querySelector("#au-pass").value;
  const say = t => { msg.textContent = t };
  if (!/^\S+@\S+\.\S+$/.test(email)) return say("Enter a valid email address.");
  if (pass.length < 8) return say("Passwords need at least 8 characters.");
  await client();
  btn.disabled = true;
  try {
    if (mode === "login") {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) return say(/confirm/i.test(error.message) ? "Confirm your email first, then log in." : "That email and password don't match.");
      closeModal(); return;
    }
    const name = form.querySelector("#au-name").value.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return say("Usernames are 3 to 20 letters, numbers or underscores.");
    if (!form.querySelector("#au-age").checked) return say("You must be 13 or older to join the chat.");
    if (!form.querySelector("#au-rules").checked) return say("Please agree to the chat rules.");
    const { data: taken } = await sb.from("profiles").select("id").ilike("username", name.replace(/_/g, "\\_")).maybeSingle();
    if (taken) return say("That username is taken. Try another.");
    const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { username: name, age_ok: true }, emailRedirectTo: location.origin + location.pathname } });
    if (error) {
      const m = error.message || "";
      return say(/registered|exists/i.test(m) ? "There's already an account with that email. Log in instead."
        : /Database error/i.test(m) ? "That username isn't allowed or is taken. Try another."
        : /rate/i.test(m) ? "Too many sign-ups right now. Try again in a few minutes." : m);
    }
    if (data.session) { closeModal(); return }
    drawModal("login", "Almost done. Check your email for a link to confirm your account, then log in.");
  } finally { btn.disabled = false }
}

// ---------- events ----------
document.addEventListener("click", e => {
  const a = e.target.closest("[data-chat]"), t = e.target.closest("[data-auth]");
  if (t) {
    if (t.dataset.auth === "tab-login") { drawModal("login"); modal.querySelector("input")?.focus() }
    else if (t.dataset.auth === "tab-signup") { drawModal("signup"); modal.querySelector("input")?.focus() }
    return;
  }
  if (!a) return;
  const act = a.dataset.chat;
  if (act === "open") {
    open = true; try { sessionStorage.setItem("cbb-chat-open", "1") } catch { } render(true);
    // on wide screens the chat view fills the screen, so line it up under the menu bar
    if (matchMedia("(min-width: 1000px)").matches) mount?.closest(".gdetail")?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    mount?.querySelector("#chat-input")?.focus({ preventScroll: true });
  }
  else if (act === "hide") { open = false; try { sessionStorage.setItem("cbb-chat-open", "0") } catch { } render() }
  else if (act === "login" || act === "signup") { modalWhy = ""; openModal(act) }
  else if (act === "logout") sb?.auth.signOut();
  else if (act === "report") report(+a.dataset.id);
  else if (act === "delete") remove(+a.dataset.id);
  else if (act === "ban") ban(a.dataset.uid, a.dataset.name, a);
});
document.addEventListener("submit", e => {
  const f = e.target;
  if (f.matches("[data-chat='form']")) { e.preventDefault(); send(f.querySelector("input")) }
  else if (f.matches(".auth-form")) { e.preventDefault(); submitAuth(f) }
});
document.addEventListener("input", e => {
  if (e.target.id === "chat-input") countChars(e.target);
  if (e.target.id === "au-name") {
    const h = document.getElementById("au-name-hint"), v = e.target.value;
    h.textContent = v && !/^[A-Za-z0-9_]{3,20}$/.test(v) ? "Use 3 to 20 letters, numbers or underscores." : "";
  }
});

// Shared with the rest of the site (Pick'em uses the same accounts as the chat).
window.CBBChat = {
  show, close, on: ON,
  client,                                   // the Supabase connection (loads the library the first time)
  me: () => me,                             // the logged-in user, or null
  auth: (mode, why) => { if (!ON) return; modalWhy = why || ""; openModal(mode || "login") },
  // true if this browser has a saved login, without loading anything
  hasSession: () => { try { return Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)) } catch { return false } },
};
})();
