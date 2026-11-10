// Game alerts (push notifications) + Pick'em grading.
// Supabase runs this once a minute (see alerts-cron.sql). Each run it:
//   1. reads today's scoreboard,
//   2. saves every final score to game_results (that grades everyone's Pick'em picks),
//   3. works out which alerts are due (tip-off, close finish, overtime, upset alert, final),
//   4. sends each alert once to the phones/browsers that asked for it.
// GET /api/alerts?info=1 just returns the public key the site needs to turn alerts on.
//
// Vercel settings → Environment Variables needed:
//   ALERTS_KEY            the private code in alerts-cron.sql (so only your database can run this)
//   SUPABASE_SECRET_KEY   Supabase → Project Settings → API Keys → secret key
//   VAPID_PUBLIC_KEY      \  the push "ID card" for your site (made once; see the setup steps)
//   VAPID_PRIVATE_KEY     /
//   DISCORD_WEBHOOK_URL   (optional) a Discord channel webhook: upsets, crunch time and big finals get posted there,
//                         plus the weekly Pick'em leaderboard every Sunday night

import webpush from "web-push";

const CONTACT = "mailto:collegebasketballbusiness@gmail.com";
const SITE = "https://collegebasketball.news"; // where tapping an alert takes people
const json = (res, code, body) => { res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.status(code).send(JSON.stringify(body)) };

function etParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(d).map(x => [x.type, x.value]));
  return { path: `${p.year}/${p.month}/${p.day}`, hour: +p.hour, minute: +p.minute, weekday: p.weekday };
}

// ---- Discord ----
// Which alerts are worth a post in the server: anything involving a ranked team except plain tip-offs
// (those only post when both teams are ranked).
function discordWorthy(a) {
  const g = a.g, ranked = [g.away, g.home].filter(t => rank(t)).length;
  if (a.kind === "start") return ranked === 2;
  if (a.kind === "final") return ranked >= 1;
  return a.upsets || a.close; // upset alerts, upset finals, crunch time and OT in ranked games
}
async function discordPost(hook, body) {
  if (!hook) return false;
  const r = await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "College Basketball", allowed_mentions: { parse: [] }, ...body }) }).catch(() => null);
  return !!(r && r.ok);
}
const COLORS = { upset: 0xFFD23F, "upset-final": 0xFFD23F, close: 0xFF6A13, final: 0x2ECC71, start: 0x5865F2 };
const discordEmbed = (a, site) => ({ embeds: [{ title: a.title, description: `${a.body}\n\n[Live chat + play-by-play →](${site}/#game-${a.g.gameID})`, url: `${site}/#game-${a.g.gameID}`, color: COLORS[a.kind] ?? (a.kind.startsWith("ot") ? 0xE11D2E : 0xFF6A13) }] });
const secsOf = c => { const m = /^(\d+):(\d+)/.exec(String(c || "")); return m ? +m[1] * 60 + +m[2] : 0 };
const isOT = p => /ot/i.test(String(p || ""));
const is2nd = p => /2nd|^2$/i.test(String(p || "")) || isOT(p);
const rank = t => +t.rank || 0;
const nm = t => `${rank(t) ? `No. ${rank(t)} ` : ""}${t.names.short}`;

// Which alerts a game has right now. Each one has an audience:
//   teams → people following either team ("myteams")   upsets → "upsets"   close → "close" (Top 25 games)
export function alertsFor(g, seenLive) {
  const out = [], a = g.away, h = g.home, as = +a.score || 0, hs = +h.score || 0, margin = Math.abs(as - hs);
  const lead = as > hs ? a : h, trail = as > hs ? h : a, ranked = rank(a) || rank(h);
  const teams = [a.names.seo, h.names.seo];
  const line = `${a.names.short} ${as}, ${h.names.short} ${hs}`;
  // a ranked team losing to an unranked one (or one ranked 10+ spots lower)
  const upsetish = rank(trail) && (!rank(lead) || rank(lead) - rank(trail) >= 10);
  if (g.gameState === "live") {
    out.push({ kind: "live", silent: true });
    const per = g.currentPeriod, left = secsOf(g.contestClock);
    if (/1st|^1$/i.test(per) && left >= 17 * 60 && as + hs <= 8) out.push({ kind: "start", teams, title: `🏀 Tip-off: ${nm(a)} at ${nm(h)}`, body: "It's underway. Follow every play live." });
    if (is2nd(per) && left <= 120 && margin <= 5 && as + hs > 0) {
      const tag = isOT(per) ? `${per} ` : "";
      out.push({ kind: "close", teams, close: !!ranked, title: `⏱️ Crunch time${margin === 0 ? ": tied" : ""}`, body: `${line} · ${tag}${g.contestClock} left` });
    }
    if (isOT(per)) out.push({ kind: "ot-" + String(per).toLowerCase().replace(/\W/g, ""), teams, close: !!ranked, title: `😱 ${String(per).toUpperCase()}: ${a.names.short} vs ${h.names.short}`, body: `Tied at the end of regulation. ${line}` });
    if (upsetish && is2nd(per) && !isOT(per) && left <= 600 && margin >= 6)
      out.push({ kind: "upset", teams, upsets: true, title: `🚨 Upset alert: ${nm(trail)} is in trouble`, body: `${line} · ${g.contestClock} left in the 2nd half` });
  }
  if (g.gameState === "final" && seenLive) {
    out.push({ kind: "final", teams, title: `✅ Final: ${lead.names.short} wins`, body: `${line}${/ot/i.test(g.finalMessage || "") ? ` (${g.finalMessage.replace(/final\W*/i, "")})` : ""}` });
    if (upsetish) out.push({ kind: "upset-final", teams, upsets: true, title: `🚨 UPSET: ${lead.names.short} takes down ${nm(trail)}`, body: line });
  }
  return out;
}

export default async function handler(req, res) {
  const pub = process.env.VAPID_PUBLIC_KEY || "";
  if (req.query.info) { res.setHeader("cache-control", "public, s-maxage=300"); return json(res, 200, { publicKey: pub }) }
  if (req.query.test) return sendTest(req, res, pub);
  if (!process.env.ALERTS_KEY || req.query.key !== process.env.ALERTS_KEY) return json(res, 401, { error: "Not allowed" });
  const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const secret = process.env.SUPABASE_SECRET_KEY || "";
  // the database address is the one the site already uses (chat-config.js)
  let base = process.env.SUPABASE_URL || "";
  if (!base) { const cfg = await fetch(`${origin}/chat-config.js`).then(r => r.text()).catch(() => ""); base = (/url:\s*"([^"]+)"/.exec(cfg) || [])[1] || "" }
  if (!base || !secret) return json(res, 500, { error: "Missing SUPABASE_SECRET_KEY (or the Supabase address)" });
  const H = { apikey: secret, "content-type": "application/json", ...(secret.startsWith("eyJ") ? { authorization: `Bearer ${secret}` } : {}) };
  const db = (path, opts = {}) => fetch(`${base}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });

  const hook = process.env.DISCORD_WEBHOOK_URL || "";
  const now = etParts();
  // Sunday night: post the week's Pick'em leaderboard to Discord (once)
  if (hook && now.weekday === "Sun" && now.hour === 23 && now.minute >= 30) {
    const mark = await db("alert_log?on_conflict=game_id,kind", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify([{ game_id: "pickem-" + now.path, kind: "weekly" }]) }).catch(() => null);
    if (mark && mark.ok && (await mark.json()).length) {
      const lb = await db("rpc/pick_leaderboard", { method: "POST", body: JSON.stringify({ scope: "week" }) }).then(r => r.ok ? r.json() : []).catch(() => []);
      if (lb.length) {
        const medal = p => ["🥇", "🥈", "🥉"][p - 1] || `**${p}.**`;
        await discordPost(hook, { embeds: [{ title: `🏆 Pick'em: this week's champ is ${lb[0].username}!`, color: 0xFF6A13,
          description: lb.slice(0, 5).map(r => `${medal(r.place)} **${r.username}** · ${r.wins}-${r.losses}${r.streak >= 3 ? ` · 🔥 ${r.streak} straight` : ""}`).join("\n") + `\n\nNew week starts now. [Make your picks →](${SITE}/#pickem)` }] });
      }
    }
  }

  // 1. today's games (and last night's, in the hour after midnight)
  const days = [now.path];
  if (now.hour < 2) days.push(etParts(new Date(Date.now() - 3 * 3600e3)).path);
  const games = [];
  for (const d of days) {
    const r = await fetch(`${origin}/api/ncaa?path=${encodeURIComponent(`scoreboard/basketball-men/d1/${d}/all-conf`)}`).catch(() => null);
    const j = r && r.ok ? await r.json().catch(() => null) : null;
    for (const x of j?.games || []) if (x.game?.gameID) games.push(x.game);
  }
  if (!games.length) return json(res, 200, { games: 0 });

  // 2. grade Pick'em: every final score goes into game_results
  const finals = games.filter(g => g.gameState === "final" && g.home.score !== "" && g.away.score !== "" && +g.home.score !== +g.away.score);
  if (finals.length) await db("game_results", {
    method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(finals.map(g => ({ game_id: g.gameID, winner: +g.home.score > +g.away.score ? "home" : "away", home_score: +g.home.score, away_score: +g.away.score, played_at: new Date((+g.startTimeEpoch || Date.now() / 1000) * 1000).toISOString() })))
  }).catch(() => null);

  // 3. which alerts are due. "Final" only goes out for games this checker saw live (so turning alerts on
  //    at night doesn't send a pile of old finals).
  const ids = games.map(g => g.gameID);
  const seen = new Set();
  const lr = await db(`alert_log?select=game_id&kind=eq.live&game_id=in.(${ids.join(",")})`).catch(() => null);
  for (const x of (lr && lr.ok ? await lr.json() : [])) seen.add(x.game_id);
  const due = games.flatMap(g => alertsFor(g, seen.has(g.gameID)).map(a => ({ ...a, g })));
  if (!due.length) return json(res, 200, { games: games.length, sent: 0 });
  // record them; only the ones that weren't already recorded come back, so each alert goes out once
  const ins = await db("alert_log?on_conflict=game_id,kind", {
    method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(due.map(a => ({ game_id: a.g.gameID, kind: a.kind })))
  }).catch(() => null);
  if (!ins || !ins.ok) return json(res, 500, { error: "alert_log: " + (ins ? ins.status : "unreachable") });
  const fresh = new Set((await ins.json()).map(x => `${x.game_id}|${x.kind}`));
  const toSend = due.filter(a => !a.silent && fresh.has(`${a.g.gameID}|${a.kind}`));
  // Discord: the big moments, a few seconds apart so they arrive in order
  let posted = 0;
  if (hook) for (const a of toSend.filter(discordWorthy).slice(0, 8)) { if (await discordPost(hook, discordEmbed(a, SITE))) posted++; await new Promise(r => setTimeout(r, 400)) }
  if (!toSend.length || !pub || !process.env.VAPID_PRIVATE_KEY) return json(res, 200, { games: games.length, sent: 0, due: toSend.length, discord: posted });

  // 4. send
  webpush.setVapidDetails(CONTACT, pub, process.env.VAPID_PRIVATE_KEY);
  const sr = await db("push_subs?select=endpoint,p256dh,auth,teams,kinds&limit=10000").catch(() => null);
  const subs = sr && sr.ok ? await sr.json() : [];
  const jobs = [];
  for (const a of toSend) {
    for (const s of subs) {
      const k = s.kinds || [];
      const wants = (k.includes("myteams") && a.teams && a.teams.some(t => (s.teams || []).includes(t)))
        || (a.upsets && k.includes("upsets")) || (a.close && k.includes("close"));
      if (wants) jobs.push([s, a]);
    }
  }
  let sent = 0; const gone = new Set();
  for (let i = 0; i < jobs.length; i += 50) {
    await Promise.all(jobs.slice(i, i + 50).map(async ([s, a]) => {
      if (gone.has(s.endpoint)) return;
      const payload = JSON.stringify({ title: a.title, body: a.body, url: `${SITE}/#game-${a.g.gameID}`, tag: `${a.g.gameID}-${a.kind}` });
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600, urgency: "high" }); sent++ }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) gone.add(s.endpoint) } // that phone turned alerts off
    }));
  }
  for (const ep of gone) await db(`push_subs?endpoint=eq.${encodeURIComponent(ep)}`, { method: "DELETE" }).catch(() => null);
  return json(res, 200, { games: games.length, alerts: toSend.length, sent, removed: gone.size, discord: posted });
}

// POST /api/alerts?test=1 with {"endpoint": "..."}: sends one test notification to that device, if it has alerts on.
// Lets someone check that alerts actually reach them, and tells them which teams and alert types are saved.
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body) } catch { return {} } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || "{}") } catch { return {} }
}
async function sendTest(req, res, pub) {
  if (req.method !== "POST") return json(res, 405, { error: "Use POST" });
  const { endpoint } = await readBody(req);
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || endpoint.length > 1000) return json(res, 400, { error: "Bad device" });
  const secret = process.env.SUPABASE_SECRET_KEY || "";
  let base = process.env.SUPABASE_URL || "";
  if (!base) { const cfg = await fetch(`${SITE}/chat-config.js`).then(r => r.text()).catch(() => ""); base = (/url:\s*"([^"]+)"/.exec(cfg) || [])[1] || "" }
  if (!base || !secret || !pub || !process.env.VAPID_PRIVATE_KEY) return json(res, 500, { error: "Alerts aren't fully set up on the server" });
  const H = { apikey: secret, ...(secret.startsWith("eyJ") ? { authorization: `Bearer ${secret}` } : {}) };
  const r = await fetch(`${base}/rest/v1/push_subs?select=endpoint,p256dh,auth,teams,kinds&endpoint=eq.${encodeURIComponent(endpoint)}`, { headers: H }).catch(() => null);
  const s = r && r.ok ? (await r.json())[0] : null;
  if (!s) return json(res, 404, { error: "This device isn't signed up for alerts. Turn alerts on again." });
  webpush.setVapidDetails(CONTACT, pub, process.env.VAPID_PRIVATE_KEY);
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify({ title: "🏀 Test alert: you're all set", body: "This is what game alerts look like. Tap to open College Basketball.", url: `${SITE}/#scores`, tag: "test" }),
      { TTL: 300, urgency: "high" });
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) await fetch(`${base}/rest/v1/push_subs?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE", headers: H }).catch(() => null);
    return json(res, 502, { error: e.statusCode === 404 || e.statusCode === 410 ? "This device's alert sign-up expired. Turn alerts on again." : "The alert couldn't be delivered right now." });
  }
  return json(res, 200, { ok: true, teams: s.teams || [], kinds: s.kinds || [] });
}
