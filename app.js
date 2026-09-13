/* THE HOUSE — app
   Two people, one house, no chore list. */

const BUILD = 7;

// GitHub Pages caches index.html for ten minutes, so a phone can sit on an old
// version long after a change ships. Ask the server what the current build is
// and reload once if this page is behind.
(async function freshnessCheck() {
  try {
    const r = await fetch("version.txt?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const latest = parseInt((await r.text()).trim(), 10);
    if (!latest || latest <= BUILD) return;
    const already = new URLSearchParams(location.search).get("b");
    if (String(latest) === already) return;            // already tried, do not loop
    location.replace(location.pathname + "?b=" + latest);
  } catch (e) { /* offline is fine, keep what we have */ }
})();

const CFG = window.HOUSE_CONFIG || {};
const PEOPLE = CFG.PEOPLE || ["Dwight", "Kander"];
let sb = null;

const S = { rooms: [], tasks: [], settings: null, week: [], season: [], thanks: [], nights: [], me: null };
const B = { minutes: 10, room: null, done: [], endsAt: 0, tick: null, wrote: [], prev: null };
const L = { who: null, mins: 0, rooms: [] };
let ledRange = "week";

const $  = (q, r) => (r || document).querySelector(q);
const $$ = (q, r) => Array.from((r || document).querySelectorAll(q));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- time ---------- */
const DAY = 86400000;
function weekStart(d) {                      // Monday
  const x = new Date(d || Date.now());
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
const isoDate = d => new Date(d).toISOString().slice(0, 10);

/* ---------- freshness ---------- */
function fresh(room) {
  const days = (Date.now() - new Date(room.fresh_at).getTime()) / DAY;
  return Math.max(0, Math.min(100, Number(room.fresh_base) - Number(room.decay_per_day) * days));
}
function state(v) {
  if (v >= 70) return { cls: "s-fresh", label: "Fresh" };
  if (v >= 40) return { cls: "s-mid",   label: "Getting there" };
  return { cls: "s-low", label: "Needs love" };
}
const visibleRooms = () =>
  (S.settings && S.settings.bare_minimum) ? S.rooms.filter(r => r.in_floor) : S.rooms;

/* ---------- scoring ---------- */
const goalNow  = () => S.settings ? (S.settings.bare_minimum ? S.settings.floor_goal : S.settings.weekly_goal) : 180;
const teamWeek = () => S.week.reduce((n, e) => n + e.points, 0);
const minsFor  = p => S.week.filter(e => e.person === p).reduce((n, e) => n + e.minutes, 0);
const hitGoal  = () => teamWeek() >= goalNow();
function picker() {
  const a = minsFor(PEOPLE[0]), b = minsFor(PEOPLE[1]);
  return a === b ? null : (a > b ? PEOPLE[0] : PEOPLE[1]);
}

/* ---------- data ---------- */
async function loadAll() {
  const seasonFrom = new Date(Date.now() - 120 * DAY).toISOString();
  const [rooms, tasks, settings, week, thanks, nights] = await Promise.all([
    sb.from("rooms").select("*").order("sort_order"),
    sb.from("tasks").select("*").order("sort_order"),
    sb.from("settings").select("*").eq("id", 1).single(),
    sb.from("log").select("*").gte("created_at", seasonFrom),
    sb.from("thanks").select("*").order("created_at", { ascending: false }).limit(30),
    sb.from("date_nights").select("*").order("week_of", { ascending: false }).limit(12)
  ]);
  S.rooms = rooms.data || [];
  S.tasks = tasks.data || [];
  S.settings = settings.data || { weekly_goal: 180, floor_goal: 45, bare_minimum: false, season_started: isoDate(Date.now()) };
  S.season = week.data || [];
  const wk = weekStart().getTime();
  S.week = S.season.filter(e => new Date(e.created_at).getTime() >= wk);
  S.thanks = thanks.data || [];
  S.nights = nights.data || [];

  // A bare minimum week expires on its own at the start of the next week.
  if (S.settings.bare_minimum && S.settings.bare_minimum_week !== isoDate(weekStart())) {
    await sb.from("settings").update({ bare_minimum: false }).eq("id", 1);
    S.settings.bare_minimum = false;
  }
}

/* ---------- nav ---------- */
function go(id) {
  $$(".screen").forEach(s => s.classList.toggle("on", s.id === id));
  window.scrollTo(0, 0);
  if (id === "s-board")     renderBoard();
  if (id === "s-log")       renderLog();
  if (id === "s-ledger")    renderLedger();
  if (id === "s-standards") renderStandards();
  if (id === "s-score")     renderScore();
  if (id === "s-settings")  renderSettings();
}

/* ---------- board ---------- */
function renderBoard() {
  $("#whoChip").textContent = (S.me || "?")[0];

  const now = teamWeek(), goal = goalNow();
  $("#pulseLine").textContent = S.settings.bare_minimum ? "This week is a lot. Here is the floor." : "This week";
  $("#pulseNow").textContent  = now;
  $("#pulseGoal").textContent = "of " + goal;
  $("#pulseBar").style.width  = Math.min(100, (now / goal) * 100) + "%";
  const st = streakCount();
  $("#pulseStreak").textContent = st > 0
    ? st + (st === 1 ? " week running" : " weeks running")
    : "New season. First week on the board.";

  // rooms, three lowest first, never more than three
  const list = visibleRooms().map(r => ({ r, v: fresh(r) })).sort((a, b) => a.v - b.v);
  const show = list.slice(0, 3), rest = list.length - show.length;
  $("#rooms").innerHTML = show.map(x => roomCard(x.r, x.v, true)).join("");
  $("#moreRooms").textContent = rest > 0 ? "and " + rest + " others, all doing fine" : "";

  renderDateCard();
  renderThankPrompt();
  renderFeed();
}
function roomCard(r, v, tap) {
  const s = state(v);
  return `<${tap ? "button" : "div"} class="room ${s.cls}"${tap ? ` data-roomtap="${r.id}"` : ""}>
    <div class="rtop"><div class="rname">${esc(r.name)}</div><div class="rstate">${s.label}</div></div>
    <div class="bar"><i style="width:${v.toFixed(0)}%"></i></div></${tap ? "button" : "div"}>`;
}

function renderDateCard() {
  const el = $("#dateCard");
  if (!hitGoal()) { el.innerHTML = ""; return; }
  const wk = isoDate(weekStart());
  const night = S.nights.find(n => n.week_of === wk);
  const p = (night && night.picker) || picker();
  el.innerHTML = `<div class="card" style="border-color:var(--sage)">
    <h3>Date night is on.</h3>
    <p style="margin-bottom:10px">${p ? esc(p) + " picks this week." : "Dead even. Somebody pick."}</p>
    <div class="field" style="margin:0"><input id="dnPlan" placeholder="What are we doing?" value="${esc(night && night.plan || "")}"></div>
    <button class="btn go mid" id="dnSave" style="margin-top:10px">Save the plan</button></div>`;
  $("#dnSave").onclick = async () => {
    await sb.from("date_nights").upsert(
      { week_of: wk, picker: p, plan: $("#dnPlan").value.trim() }, { onConflict: "week_of" });
    await loadAll(); renderBoard();
  };
}

function renderThankPrompt() {
  const el = $("#thankPrompt");
  const them = PEOPLE.find(p => p !== S.me);
  const theirLast = S.week.filter(e => e.person === them)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  if (!theirLast) { el.innerHTML = ""; return; }
  const mine = S.thanks.find(t => t.from_person === S.me && t.to_person === them);
  if (mine && new Date(mine.created_at) > new Date(theirLast.created_at)) { el.innerHTML = ""; return; }

  const lines = [
    "You make this house feel like home.",
    "I'm glad it's you and me.",
    "You showing up for us doesn't go unnoticed.",
    "Thank you for who you are, not just what you did.",
    "This place feels good because of you."
  ];
  const line = lines[new Date(theirLast.created_at).getDate() % lines.length];
  el.innerHTML = `<div class="card" style="border-color:var(--sand)">
    <h3>${esc(them)} put in work.</h3>
    <p style="margin-bottom:12px">"${esc(line)}"</p>
    <button class="btn go mid" id="thankGo">Send it</button>
    <button class="btn ghost" id="thankOwn">Say my own thing</button></div>`;
  $("#thankGo").onclick  = () => sendThanks(them, line);
  $("#thankOwn").onclick = () => {
    const own = prompt("What do you want to say to " + them + "?");
    if (own && own.trim()) sendThanks(them, own.trim());
  };
}
async function sendThanks(to, message) {
  await sb.from("thanks").insert({ from_person: S.me, to_person: to, message });
  await loadAll(); renderBoard();
}

function renderFeed() {
  const cut = Date.now() - 3 * DAY;
  const recent = S.thanks.filter(t => new Date(t.created_at).getTime() > cut).slice(0, 5);
  $("#feed").innerHTML = recent.map(t =>
    `<div class="thank">${esc(t.message)}<small><b>${esc(t.from_person)}</b> to ${esc(t.to_person)}</small></div>`
  ).join("");
}

function weekTotals() {                    // { mondayMs: points } across the season
  const m = {};
  S.season.forEach(e => { const k = weekStart(e.created_at).getTime(); m[k] = (m[k] || 0) + e.points; });
  return m;
}
function streakCount() {
  const totals = weekTotals(), goal = S.settings.weekly_goal, floor = S.settings.floor_goal;
  let n = 0, k = weekStart().getTime();
  // This week only counts once it is actually hit. Past weeks count at the goal
  // that was live then, which we cannot know, so a past week clears at the floor.
  if ((totals[k] || 0) >= goalNow()) n++;
  k -= 7 * DAY;
  while ((totals[k] || 0) >= Math.min(goal, floor)) { n++; k -= 7 * DAY; }
  return n;
}
function minsForLastWeek(p) {
  const k = weekStart().getTime() - 7 * DAY;
  return S.season.filter(e => e.person === p && weekStart(e.created_at).getTime() === k)
                 .reduce((n, e) => n + e.minutes, 0);
}

/* ---------- blitz ---------- */
function startBlitz() { go("s-time"); }

function pickRooms() {
  const list = visibleRooms().map(r => ({ r, v: fresh(r) })).sort((a, b) => a.v - b.v);
  $("#pickTop").innerHTML = list.slice(0, 3).map(x =>
    `<button class="btn" data-room="${x.r.id}"><b>${esc(x.r.name)}</b><br>
     <span style="color:var(--muted);font-weight:600;font-size:14px">${state(x.v).label}</span></button>`).join("");
  $("#pickAll").innerHTML = list.slice(3).map(x =>
    `<button class="btn" data-room="${x.r.id}">${esc(x.r.name)}</button>`).join("")
    || `<div class="quiet">That's all of them.</div>`;
  $("#pickAll").hidden = true;
  $("#roomSub").textContent = S.settings.bare_minimum
    ? "Floor rooms only this week." : "These three need it most.";
  go("s-room");
}

function runBlitz(roomId) {
  B.room = S.rooms.find(r => r.id === roomId);
  B.done = [];
  B.endsAt = Date.now() + B.minutes * 60000;
  $("#runRoom").textContent = B.room.name;
  drawChips();
  go("s-run");
  clearInterval(B.tick);
  B.tick = setInterval(paintTimer, 250);
  paintTimer();
}
function paintTimer() {
  const left = B.endsAt - Date.now(), el = $("#timer");
  if (left <= 0) {
    el.textContent = "TIME";
    el.classList.add("done");
    $("#tsub").textContent = "Time's up. Keep going if you're on a roll.";
    clearInterval(B.tick);
    return;
  }
  const s = Math.ceil(left / 1000);
  el.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function drawChips() {
  const list = S.tasks.filter(t => t.room_id === B.room.id && !B.done.includes(t.id));
  $("#chips").innerHTML = list.map(t =>
    `<button class="chip" data-task="${t.id}">
       <span class="cn">${esc(t.name)}${t.standard_photo ? `<br><span class="std">hold to see the standard</span>` : ""}</span>
       <span class="cm">${t.minutes}m</span></button>`).join("")
    || `<div class="quiet">Nothing left in here. Pick another room.</div>`;
}

async function finishBlitz() {
  clearInterval(B.tick);
  const picked = S.tasks.filter(t => B.done.includes(t.id));
  const mins = picked.reduce((n, t) => n + t.minutes, 0);

  B.wrote = []; B.prev = null;
  if (mins > 0) {
    const wasAt = fresh(B.room);
    const ins = await sb.from("log").insert(picked.map(t => ({
      person: S.me, room_id: B.room.id, task_name: t.name, minutes: t.minutes,
      points: t.minutes, fresh_before: wasAt
    }))).select("id");
    B.wrote = (ins.data || []).map(r => r.id);
    B.prev = { base: B.room.fresh_base, at: B.room.fresh_at };
    const before = fresh(B.room);
    const after = Math.max(0, Math.min(100, before + mins * 4));
    await sb.from("rooms").update({ fresh_base: after, fresh_at: new Date().toISOString() }).eq("id", B.room.id);
  }

  await loadAll();
  const room = S.rooms.find(r => r.id === B.room.id);
  const v = fresh(room);
  $("#rPts").textContent = mins;
  $("#rMin").textContent = mins + (mins === 1 ? " minute" : " minutes");
  $("#rRoom").outerHTML = roomCard(room, v).replace('class="room', 'id="rRoom" class="room');
  const now = teamWeek(), goal = goalNow();
  $("#rTeam").textContent = now >= goal
    ? "That's the week. Date night is on."
    : "Team is at " + now + " of " + goal + " this week.";
  go("s-result");
  countUp($("#rPts"), mins);
}
async function undoBlitz() {
  if (B.wrote.length) await sb.from("log").delete().in("id", B.wrote);
  if (B.prev) await sb.from("rooms").update({ fresh_base: B.prev.base, fresh_at: B.prev.at }).eq("id", B.room.id);
  B.wrote = []; B.prev = null;
  await loadAll();
  go("s-board");
}

// Take back one of your own taps. You can only ever undo your own.
async function undoEntry(id) {
  const e = S.season.find(x => x.id === id);
  if (!e || e.person !== S.me) return;
  await sb.from("log").delete().eq("id", id);
  if (e.room_id) {
    const r = S.rooms.find(x => x.id === e.room_id);
    if (r) {
      // Put the room back where it was before this tap. Blindly subtracting was
      // wrong: a tap in an already-full room adds nothing, so undo must not take
      // anything away either.
      const back = (e.fresh_before === null || e.fresh_before === undefined)
        ? Math.max(0, Math.min(100, fresh(r) - e.minutes * 4))
        : Math.max(0, Math.min(100, Number(e.fresh_before)));
      await sb.from("rooms").update({ fresh_base: back, fresh_at: new Date().toISOString() }).eq("id", r.id);
    }
  }
  await loadAll();
  if ($("#s-ledger").classList.contains("on")) renderLedger(); else renderSettings();
}

// The bar is a guess. Either of you can tell it the room is not actually clean.
async function notActuallyClean(roomId) {
  await sb.from("rooms").update({ fresh_base: 25, fresh_at: new Date().toISOString() }).eq("id", roomId);
  await loadAll(); renderBoard();
}

function countUp(el, target) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || target === 0) { el.textContent = target; return; }
  let n = 0; const step = Math.max(1, Math.round(target / 24));
  const t = setInterval(() => { n = Math.min(target, n + step); el.textContent = n; if (n >= target) clearInterval(t); }, 28);
}

/* ---------- the ledger: every entry, both people, with totals ---------- */
function renderLedger() {
  const rows = (ledRange === "week" ? S.week : S.season)
    .slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  $$("[data-led]").forEach(b => {
    const on = b.dataset.led === ledRange;
    b.style.background = on ? "var(--terra)" : "";
    b.style.color = on ? "#fff" : "";
    b.style.borderColor = on ? "var(--terra)" : "";
  });

  const tot = p => rows.filter(e => e.person === p).reduce((n, e) => n + e.minutes, 0);
  const hi = Math.max(...PEOPLE.map(tot), 1);
  $("#ledTotals").innerHTML = PEOPLE.map(p => {
    const m = tot(p), h = Math.floor(m / 60), r = m % 60;
    return `<div class="card" style="margin:0;text-align:center;padding:16px 10px">
      <div style="font-weight:800;font-size:15px">${esc(p)}</div>
      <div style="font-size:32px;font-weight:800;letter-spacing:-.03em;color:${m === hi && m > 0 ? "var(--terra)" : "var(--ink)"}">
        ${h ? h + "h" : ""}${r ? " " + r + "m" : (h ? "" : m + "m")}</div>
      <div style="font-size:13px;color:var(--muted);font-weight:700">${rows.filter(e => e.person === p).length} entries</div>
    </div>`;
  }).join("");

  if (!rows.length) { $("#ledList").innerHTML = `<div class="quiet">Nothing logged yet.</div>`; return; }

  let out = "", lastDay = "";
  rows.forEach(e => {
    const d = new Date(e.created_at);
    const day = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    if (day !== lastDay) { out += `<h3 style="margin:20px 0 8px;font-size:15px;color:var(--muted)">${esc(day)}</h3>`; lastDay = day; }
    const room = S.rooms.find(r => r.id === e.room_id);
    const own = e.person === S.me;
    out += `<div class="std-row">
      <span class="sn">${esc(e.task_name || "Cleaned")}
        <span class="sm">${esc(e.person)}${room ? ", " + esc(room.name) : ""}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
      </span>
      <span class="cm" style="font-weight:800;color:var(--muted);margin-right:${own ? "0" : "6px"}">${e.minutes}m</span>
      ${own ? `<button class="btn ghost" style="width:auto;margin:0;padding:8px 10px" data-undo="${e.id}">Undo</button>` : ""}
    </div>`;
  });
  $("#ledList").innerHTML = out;
}

/* ---------- log it: cleaning that already happened ---------- */
function renderLog() {
  if (!L.who) L.who = S.me;
  $("#logWho").innerHTML = PEOPLE.map(p =>
    `<button class="btn mid" data-logwho="${esc(p)}" style="margin:0;width:auto;${p === L.who
      ? "background:var(--terra);color:#fff;border-color:var(--terra)" : ""}">${esc(p)}</button>`).join("");

  $("#logMins").innerHTML = [15, 30, 45, 60, 90].map(m =>
    `<button class="btn mid" data-logmin="${m}" style="margin:0;flex:0 0 auto;width:auto;padding:12px 0;min-width:62px;${m === L.mins
      ? "background:var(--terra);color:#fff;border-color:var(--terra)" : ""}">${m}m</button>`).join("");

  $("#logRooms").innerHTML = S.rooms.map(r => {
    const on = L.rooms.includes(r.id);
    return `<button class="btn" data-logroom="${r.id}" style="margin-bottom:8px;${on
      ? "background:var(--sage);color:#fff;border-color:var(--sage)" : ""}">${esc(r.name)}</button>`;
  }).join("");

  const n = L.rooms.length;
  $("#logSplit").textContent = (n > 1 && L.mins)
    ? Math.round(L.mins / n) + " minutes counted to each of the " + n + " rooms."
    : (n === 0 ? "Pick at least one so the room actually fills up." : "");
  $("#logErr").textContent = "";
}

async function saveLog() {
  const typed = Number($("#logCustom").value);
  const mins = typed > 0 ? typed : L.mins;
  const what = $("#logWhat").value.trim();
  if (!mins)            { $("#logErr").textContent = "How long?"; return; }
  if (!L.rooms.length)  { $("#logErr").textContent = "Which room?"; return; }

  const each = Math.round(mins / L.rooms.length);
  const rows = L.rooms.map(id => {
    const r = S.rooms.find(x => x.id === id);
    return { person: L.who, room_id: id, task_name: what || "Cleaned " + r.name,
             minutes: each, points: each, fresh_before: fresh(r) };
  });
  await sb.from("log").insert(rows);

  for (const id of L.rooms) {
    const r = S.rooms.find(x => x.id === id);
    const after = Math.max(0, Math.min(100, fresh(r) + each * 4));
    await sb.from("rooms").update({ fresh_base: after, fresh_at: new Date().toISOString() }).eq("id", id);
  }

  L.mins = 0; L.rooms = []; L.who = S.me;
  $("#logCustom").value = ""; $("#logWhat").value = "";
  await loadAll();
  go("s-board");
}

/* ---------- standards ---------- */
function renderStandards() {
  const set = S.tasks.filter(t => t.standard_photo).length;
  $("#stdSub").textContent = set + " of " + S.tasks.length + " standards set. This is what settles what clean means, before anybody has to argue about it.";
  $("#stdList").innerHTML = visibleRoomsAll().map(r => {
    const ts = S.tasks.filter(t => t.room_id === r.id);
    return `<h3 style="margin:20px 0 8px;font-size:17px">${esc(r.name)}</h3>` + ts.map(t =>
      `<button class="std-row" data-std="${t.id}">
         ${t.standard_photo ? `<img src="${t.standard_photo}" alt="">` : `<span class="ph"></span>`}
         <span class="sn">${esc(t.name)}
           <span class="sm">${t.standard_photo ? esc(t.standard_note || "Tap to view or replace") : "Set the standard"}</span>
         </span></button>`).join("");
  }).join("");
}
const visibleRoomsAll = () => S.rooms;

function openRoom(roomId) {
  const r = S.rooms.find(x => x.id === roomId); if (!r) return;
  const sh = $("#sheet");
  sh.hidden = false;
  sh.innerHTML = `<div style="width:100%;max-width:380px">
    <div style="color:#fff;font-size:24px;font-weight:800;text-align:center;margin-bottom:16px">${esc(r.name)}</div>
    <button class="btn go mid" id="rsBlitz">Blitz this room</button>
    <button class="btn mid" id="rsDirty">This isn't actually clean</button>
    <button class="btn ghost" id="rsClose" style="color:#fff">Never mind</button></div>`;
  $("#rsBlitz").onclick = () => { sh.hidden = true; B.minutes = 10; runBlitz(r.id); };
  $("#rsDirty").onclick = () => { sh.hidden = true; notActuallyClean(r.id); };
  $("#rsClose").onclick = () => { sh.hidden = true; };
  sh.onclick = e => { if (e.target === sh) sh.hidden = true; };
}

function openStandard(taskId) {
  const t = S.tasks.find(x => x.id === taskId);
  if (!t) return;
  if (t.standard_photo) {
    const sh = $("#sheet");
    sh.hidden = false;
    sh.innerHTML = `<div><img src="${t.standard_photo}" alt="">
      <p>${esc(t.standard_note || t.name)}</p>
      <p style="opacity:.7;font-size:14px">Tap anywhere to close. Tap the button to replace it.</p>
      <button class="btn go mid" id="replaceStd" style="margin-top:14px">Replace this standard</button></div>`;
    sh.onclick = e => { if (e.target.id !== "replaceStd") sh.hidden = true; };
    $("#replaceStd").onclick = e => { e.stopPropagation(); sh.hidden = true; shootStandard(t); };
  } else shootStandard(t);
}
function shootStandard(t) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.capture = "environment";
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    shrink(f, async dataUrl => {
      const note = prompt("One line: what does done look like here?", t.standard_note || "") || t.standard_note || "";
      await sb.from("tasks").update({ standard_photo: dataUrl, standard_note: note }).eq("id", t.id);
      await loadAll(); renderStandards();
    });
  };
  inp.click();
}
function shrink(file, cb) {
  const img = new Image();
  img.onload = () => {
    const max = 760, sc = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    cb(c.toDataURL("image/jpeg", 0.72));
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
}

/* ---------- scoreboard ---------- */
function renderScore() {
  const now = teamWeek(), goal = goalNow();
  $("#scNow").textContent  = now;
  $("#scGoal").textContent = "of " + goal;
  $("#scBar").style.width  = Math.min(100, (now / goal) * 100) + "%";
  const st = streakCount();
  $("#scStreak").textContent = st > 0 ? st + (st === 1 ? " week running" : " weeks running") : "New season.";

  const mine = minsFor(S.me);
  $("#scMineTitle").textContent = "Your own line";
  const last = minsForLastWeek(S.me);
  $("#scMine").textContent = mine + " minutes this week. Last week you put in " + last + ". "
    + (mine >= last ? "You're ahead of yourself." : "Still time.");

  const seasonDays = Math.floor((Date.now() - new Date(S.settings.season_started).getTime()) / DAY);
  const left = Math.max(0, 84 - seasonDays);
  $("#scSeason").textContent = left + " days until everything resets. Nothing here is permanent.";

  $("#scNights").innerHTML = S.nights.filter(n => n.plan).length
    ? `<div class="card"><h3>Date nights</h3>` + S.nights.filter(n => n.plan).map(n =>
        `<p style="margin:8px 0"><b style="color:var(--ink)">${esc(n.week_of)}</b> ${esc(n.plan)}</p>`).join("") + `</div>`
    : "";
}

/* ---------- settings ---------- */
function renderSettings() {
  const bm = !!S.settings.bare_minimum;
  $("#bmSw").classList.toggle("on", bm);
  $("#bmSub").textContent = bm
    ? "On. Floor rooms only, goal is " + S.settings.floor_goal + ". Turns itself off next week."
    : "Drop to the floor. The streak still counts.";
  $("#setGoal").value  = S.settings.weekly_goal;
  $("#setFloor").value = S.settings.floor_goal;

  $("#floorList").innerHTML = S.rooms.map(r =>
    `<button class="toggle" data-floor="${r.id}" style="margin-bottom:8px">
       <div class="tt"><b>${esc(r.name)}</b></div>
       <div class="sw ${r.in_floor ? "on" : ""}"><i></i></div></button>`).join("");

  const mine = S.season.filter(e => e.person === S.me)
    .sort((x, y) => new Date(y.created_at) - new Date(x.created_at)).slice(0, 12);
  $("#recent").innerHTML = mine.length ? mine.map(e => {
    const room = S.rooms.find(r => r.id === e.room_id);
    const when = new Date(e.created_at);
    return `<div class="std-row"><span class="sn">${esc(e.task_name || "Blitz")}
      <span class="sm">${room ? esc(room.name) + ", " : ""}${when.toLocaleDateString(undefined,{weekday:"short"})} ${when.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}, ${e.minutes}m</span></span>
      <button class="btn ghost" style="width:auto;margin:0" data-undo="${e.id}">Undo</button></div>`;
  }).join("") : `<div class="quiet">Nothing logged yet.</div>`;

  $("#roomAdmin").innerHTML = S.rooms.map(r =>
    `<div class="std-row"><span class="sn">${esc(r.name)}
       <span class="sm">${S.tasks.filter(t => t.room_id === r.id).length} tasks, fades ${r.decay_per_day}/day</span></span>
     <button class="btn ghost" style="width:auto;margin:0" data-delroom="${r.id}">Remove</button></div>`).join("");
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-go],[data-min],[data-room],[data-task],[data-std],[data-floor],[data-delroom],[data-roomtap],[data-undo],[data-logwho],[data-logmin],[data-logroom],[data-led]");

  if (e.target.closest("#startBlitz"))  return startBlitz();
  if (e.target.closest("#goLog"))       return go("s-log");
  if (e.target.closest("#logSave"))     return saveLog();
  if (e.target.closest("#showAllRooms")) { $("#pickAll").hidden = !$("#pickAll").hidden; return; }
  if (e.target.closest("#runDone"))     return finishBlitz();
  if (e.target.closest("#rAgain"))      return startBlitz();
  if (e.target.closest("#rUndo"))       return undoBlitz();
  if (e.target.closest("#whoChip"))     return go("s-who");
  if (e.target.closest("#switchWho"))   return go("s-who");

  if (!t) return;

  if (t.dataset.go)   return go(t.dataset.go);
  if (t.dataset.min)  { B.minutes = Number(t.dataset.min); return pickRooms(); }
  if (t.dataset.room) return runBlitz(t.dataset.room);
  if (t.dataset.std)     return openStandard(t.dataset.std);
  if (t.dataset.roomtap) return openRoom(t.dataset.roomtap);
  if (t.dataset.undo)    return undoEntry(t.dataset.undo);
  if (t.dataset.led)     { ledRange = t.dataset.led; return renderLedger(); }
  if (t.dataset.logwho)  { L.who = t.dataset.logwho; return renderLog(); }
  if (t.dataset.logmin)  { L.mins = Number(t.dataset.logmin); $("#logCustom").value = ""; return renderLog(); }
  if (t.dataset.logroom) {
    const i = L.rooms.indexOf(t.dataset.logroom);
    if (i < 0) L.rooms.push(t.dataset.logroom); else L.rooms.splice(i, 1);
    return renderLog();
  }

  if (t.dataset.task) {
    if (t.dataset.held) { delete t.dataset.held; return; }
    const id = t.dataset.task;
    if (B.done.includes(id)) return;
    B.done.push(id);
    t.classList.add("gone");
    setTimeout(drawChips, 340);
    return;
  }

  if (t.dataset.floor) {
    const r = S.rooms.find(x => x.id === t.dataset.floor);
    await sb.from("rooms").update({ in_floor: !r.in_floor }).eq("id", r.id);
    await loadAll(); return renderSettings();
  }
  if (t.dataset.delroom) {
    const r = S.rooms.find(x => x.id === t.dataset.delroom);
    if (!confirm("Remove " + r.name + " and its tasks?")) return;
    await sb.from("rooms").delete().eq("id", r.id);
    await loadAll(); return renderSettings();
  }
});

// hold a task chip to see its standard
let holdTimer = null;
document.addEventListener("pointerdown", e => {
  const c = e.target.closest("[data-task]"); if (!c) return;
  holdTimer = setTimeout(() => { c.dataset.held = "1"; openStandard(c.dataset.task); }, 450);
});
["pointerup", "pointercancel", "pointerleave"].forEach(ev =>
  document.addEventListener(ev, () => clearTimeout(holdTimer)));

/* ---------- boot ---------- */
async function start() {
  await loadAll();
  $("#boot").hidden = true;
  $("#app").hidden = false;
  S.me = localStorage.getItem("house_me");
  $("#whoBtns").innerHTML = PEOPLE.map(p =>
    `<button class="btn big3" data-me="${esc(p)}">${esc(p)}</button>`).join("");
  $$("[data-me]").forEach(b => b.onclick = () => {
    S.me = b.dataset.me; localStorage.setItem("house_me", S.me); go("s-board");
  });
  go(S.me ? "s-board" : "s-who");
}

document.addEventListener("click", async e => {
  if (!e.target.closest("#saveGoals")) return;
  await sb.from("settings").update({
    weekly_goal: Number($("#setGoal").value) || 180,
    floor_goal:  Number($("#setFloor").value) || 45
  }).eq("id", 1);
  await loadAll(); renderSettings();
});
document.addEventListener("click", async e => {
  if (!e.target.closest("#bmToggle")) return;
  const on = !S.settings.bare_minimum;
  await sb.from("settings").update({
    bare_minimum: on, bare_minimum_week: on ? isoDate(weekStart()) : null
  }).eq("id", 1);
  await loadAll(); renderSettings();
});
document.addEventListener("click", async e => {
  if (!e.target.closest("#addRoom")) return;
  const name = $("#newRoom").value.trim(); if (!name) return;
  await sb.from("rooms").insert({ name, sort_order: S.rooms.length + 1 });
  $("#newRoom").value = "";
  await loadAll(); renderSettings();
});

(async function boot() {
  if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.startsWith("PASTE")) {
    $("#bootMsg").innerHTML = "Open <b>config.js</b> and paste in your Supabase project URL and anon key.";
    return;
  }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  try { await start(); }
  catch (err) { $("#bootMsg").textContent = "Could not reach the database. Check config.js."; }
})();
