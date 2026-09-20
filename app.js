/* THE HOUSE — the calendar
   One house, one calendar, one team. Tasks sit on days. Days fill in. */

const BUILD = 14;

// GitHub Pages caches index.html, so a phone can sit on an old version long
// after a change ships. Ask the server what the current build is, reload once.
(async function buildCheck() {
  try {
    const r = await fetch("version.txt?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const latest = parseInt((await r.text()).trim(), 10);
    if (!latest || latest <= BUILD) return;
    if (String(latest) === new URLSearchParams(location.search).get("b")) return;
    location.replace(location.pathname + "?b=" + latest);
  } catch (e) { /* offline is fine */ }
})();

const CFG = window.HOUSE_CONFIG || {};
let sb = null;

// One house, one team. The app does not track who did what.
const S = { rooms: [], tasks: [], plans: [], moves: [], log: [], settings: null, nights: [] };
const V = { view: "month", month: new Date(), week: null };
const DS = { key: null };
const A  = { id: null, minutes: 10, date: null, repeat: "none", dow: 1, dom: 1,
             room: null, floor: false, back: "s-home" };
let ledRange = "week";

const $  = (q, r) => (r || document).querySelector(q);
const $$ = (q, r) => Array.from((r || document).querySelectorAll(q));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- dates, all local, all YYYY-MM-DD ---------- */
const DAY = 86400000;
function dkey(d) {
  const x = new Date(d);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0")
                         + "-" + String(x.getDate()).padStart(2, "0");
}
function fromKey(k) {
  const p = String(k).slice(0, 10).split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}
function addDays(k, n) { const d = fromKey(k); d.setDate(d.getDate() + n); return dkey(d); }
function weekStartKey(k) {                      // Monday
  const d = fromKey(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dkey(d);
}
const todayKey = () => dkey(new Date());
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function niceDay(k) {
  if (k === todayKey()) return "Today";
  if (k === addDays(todayKey(), 1)) return "Tomorrow";
  if (k === addDays(todayKey(), -1)) return "Yesterday";
  return fromKey(k).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/* ---------- data ---------- */
async function loadAll() {
  const from = dkey(new Date(Date.now() - 200 * DAY));
  const [rooms, tasks, plans, moves, log, settings, nights] = await Promise.all([
    sb.from("rooms").select("*").order("sort_order"),
    sb.from("tasks").select("*").order("sort_order"),
    sb.from("plans").select("*").order("sort_order"),
    sb.from("moves").select("*"),
    sb.from("log").select("*").gte("created_at", from),
    sb.from("settings").select("*").eq("id", 1).single(),
    sb.from("date_nights").select("*").order("week_of", { ascending: false }).limit(12)
  ]);
  // The calendar tables are the one thing that needs a manual step in Supabase.
  // If they are missing, say so plainly instead of showing an empty calendar.
  if (plans.error || moves.error) {
    const e = new Error("needs-migration");
    e.needsMigration = true;
    throw e;
  }

  S.rooms = rooms.data || [];
  S.tasks = tasks.data || [];
  S.plans = plans.data || [];
  S.moves = moves.data || [];
  S.log   = log.data || [];
  S.settings = settings.data || { weekly_goal: 180, floor_goal: 45, bare_minimum: false,
                                  season_started: todayKey() };
  S.nights = nights.data || [];

  // A bare minimum week turns itself off at the start of the next week.
  if (S.settings.bare_minimum && S.settings.bare_minimum_week !== weekStartKey(todayKey())) {
    await sb.from("settings").update({ bare_minimum: false }).eq("id", 1);
    S.settings.bare_minimum = false;
  }
}

/* ---------- the occurrence engine ----------
   A plan either sits on one date or repeats. A move pushes one occurrence to
   another day, or drops it. Nothing is ever late, it just sits where it sits. */

function livePlans() {
  return S.plans.filter(p => !p.archived && (!S.settings.bare_minimum || p.floor));
}
function matches(p, key, d, dow, dom) {
  if (p.until && key > p.until) return false;
  if (p.repeat === "none") return p.on_date === key;
  const a = p.anchor || p.on_date;
  if (!a || key < a) return false;
  if (p.repeat === "daily")  return true;
  if (p.repeat === "weekly") return dow === p.repeat_dow;
  if (p.repeat === "biweekly") {
    if (dow !== p.repeat_dow) return false;
    const w = Math.round((fromKey(weekStartKey(key)) - fromKey(weekStartKey(a))) / (7 * DAY));
    return w % 2 === 0;
  }
  if (p.repeat === "monthly") {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return dom === Math.min(p.repeat_dom || 1, last);
  }
  return false;
}
function occurrencesOn(key) {
  const d = fromKey(key), dow = d.getDay(), dom = d.getDate();
  const live = livePlans();
  const away = new Set(S.moves.filter(m => m.from_date === key).map(m => m.plan_id));
  const out = [], seen = new Set();
  for (const p of live) {
    if (away.has(p.id)) continue;
    if (matches(p, key, d, dow, dom)) { out.push({ p, key, moved: false }); seen.add(p.id); }
  }
  for (const m of S.moves) {
    if (m.to_date !== key || seen.has(m.plan_id)) continue;
    const p = live.find(x => x.id === m.plan_id);
    if (p) { out.push({ p, key, moved: true, from: m.from_date }); seen.add(p.id); }
  }
  return out.sort((a, b) => (a.p.sort_order - b.p.sort_order) || a.p.title.localeCompare(b.p.title));
}
const doneRow = (planId, key) => S.log.find(e => e.plan_id === planId && e.on_date === key);
function dayStat(key) {
  const occ = occurrencesOn(key);
  const done = occ.filter(x => doneRow(x.p.id, key));
  return {
    occ, done: done.length, total: occ.length,
    mins:  occ.reduce((n, x) => n + x.p.minutes, 0),
    dmins: done.reduce((n, x) => n + x.p.minutes, 0),
    locked: occ.length > 0 && done.length === occ.length
  };
}

/* ---------- minutes ---------- */
const logKey  = e => e.on_date || dkey(new Date(e.created_at));
const goalNow = () => S.settings.bare_minimum ? S.settings.floor_goal : S.settings.weekly_goal;
function minsIn(fromK, toK) {
  return S.log.filter(e => { const k = logKey(e); return k >= fromK && k <= toK; })
              .reduce((n, e) => n + (e.minutes || 0), 0);
}
const weekMins = () => {
  const a = weekStartKey(todayKey());
  return minsIn(a, addDays(a, 6));
};
const hitGoal = () => weekMins() >= goalNow();

/* ---------- feedback ---------- */
function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern || 14); } catch (e) {}
}
function burst() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = $("#burst");
  const colors = ["#7E9C7A", "#D9A85F", "#C07E62", "#B5543A", "#FFD27A"];
  let h = "";
  for (let i = 0; i < 22; i++) {
    const a = (Math.PI * 2 * i) / 22 + Math.random() * 0.4;
    const r = 120 + Math.random() * 190;
    h += `<i style="left:50%;top:38%;background:${colors[i % colors.length]};
      --dx:${(Math.cos(a) * r).toFixed(0)}px;--dy:${(Math.sin(a) * r + 90).toFixed(0)}px;
      --rot:${Math.round(Math.random() * 720 - 360)}deg;
      animation-delay:${(Math.random() * 90).toFixed(0)}ms"></i>`;
  }
  el.innerHTML = h; el.hidden = false;
  setTimeout(() => { el.hidden = true; el.innerHTML = ""; }, 1400);
}

/* ---------- nav ---------- */
function go(id) {
  $$(".screen").forEach(s => s.classList.toggle("on", s.id === id));
  window.scrollTo(0, 0);
  if (id === "s-home")      renderHome();
  if (id === "s-ledger")    renderLedger();
  if (id === "s-standards") renderStandards();
  if (id === "s-settings")  renderSettings();
}

/* ---------- home ---------- */
function renderHome() {
  if (V.view === "month") renderMonth(); else renderWeekView();
  renderDateCard();
}

function renderMonth() {
  const m = V.month;
  $("#mTitle").textContent = m.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const first  = new Date(m.getFullYear(), m.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;                 // Monday first
  const days   = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const cells  = Math.ceil((offset + days) / 7) * 7;
  const start  = new Date(first); start.setDate(1 - offset);

  let html = "";
  for (let i = 0; i < cells; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = dkey(d), inMonth = d.getMonth() === m.getMonth();
    const st = dayStat(key);

    const cls = ["day"];
    if (!inMonth) cls.push("other");
    if (key === todayKey()) cls.push("today");
    if (st.locked) cls.push("locked");

    const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
    // Four dots at most, so they stay on one line. The fill bar carries the rest.
    const shown = Math.min(st.total, 4);
    const lit = st.total ? Math.round((st.done / st.total) * shown) : 0;
    const dots = st.total
      ? `<span class="dots">` + Array.from({ length: shown },
          (_, j) => `<span class="dot${j < lit ? " on" : ""}"></span>`).join("") + `</span>` : "";

    html += `<button class="${cls.join(" ")}" data-day="${key}" data-cell="${key}">
      ${st.locked ? "" : `<span class="fill" style="height:${pct}%"></span>`}
      <span class="dn">${d.getDate()}</span>
      ${st.locked ? `<span class="tick">&#10003;</span>` : dots}
    </button>`;
  }
  $("#grid").innerHTML = html;
}

function renderWeekView() {
  if (!V.week) V.week = weekStartKey(todayKey());
  const a = V.week, b = addDays(a, 6);
  const same = fromKey(a).getMonth() === fromKey(b).getMonth();
  $("#wTitle").textContent = a === weekStartKey(todayKey()) ? "This week"
    : fromKey(a).toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " to "
      + fromKey(b).toLocaleDateString(undefined, same ? { day: "numeric" } : { month: "short", day: "numeric" });

  let html = "";
  for (let i = 0; i < 7; i++) {
    const key = addDays(a, i), st = dayStat(key), d = fromKey(key);
    const cls = ["wday"];
    if (key === todayKey()) cls.push("today");
    if (st.locked) cls.push("locked");
    html += `<div class="${cls.join(" ")}">
      <button class="wdtop" style="width:100%;text-align:left" data-day="${key}">
        <span class="wdname">${d.toLocaleDateString(undefined, { weekday: "long" })}
          <span style="color:var(--muted);font-weight:700">${d.getDate()}</span></span>
        <span class="wdcount${st.locked ? " all" : ""}">${st.total
          ? st.done + "/" + st.total + (st.locked ? " &#10003;" : "") : ""}</span>
      </button>
      ${st.total ? st.occ.map(x => taskChip(x, key, false)).join("")
                 : `<div class="wdnone">Clear.</div>`}
    </div>`;
  }
  $("#weekList").innerHTML = html;
}

function taskChip(x, key, withMore) {
  const hit = doneRow(x.p.id, key);
  const room = S.rooms.find(r => r.id === x.p.room_id);
  const bits = [];
  if (room) bits.push(esc(room.name));
  if (x.moved) bits.push("moved here");
  return `<div class="chip${hit ? " done" : ""}">
    <button class="box" data-tick="${x.p.id}|${key}" aria-label="done">${hit ? "&#10003;" : ""}</button>
    <button class="cn" style="background:none;padding:0;text-align:left" data-tick="${x.p.id}|${key}">
      ${esc(x.p.title)}${bits.length ? `<span class="cs">${bits.join(" &middot; ")}</span>` : ""}
    </button>
    <span class="cm">${x.p.minutes}m</span>
    ${withMore ? `<button class="chipmore" data-more="${x.p.id}|${key}">&#8943;</button>` : ""}
  </div>`;
}

function renderDateCard() {
  const el = $("#dateCard");
  if (!hitGoal()) { el.innerHTML = ""; return; }
  const wk = weekStartKey(todayKey());
  const night = S.nights.find(n => n.week_of === wk);
  el.innerHTML = `<div class="card" style="border-color:var(--sage);border-width:2px">
    <h3>Date night is on.</h3>
    <p style="margin-bottom:10px">Week's goal is cleared. Somebody pick something.</p>
    <div class="field" style="margin:0"><input id="dnPlan" placeholder="What are we doing?"
      value="${esc((night && night.plan) || "")}"></div>
    <button class="btn go mid" id="dnSave" style="margin-top:10px">Save the plan</button></div>`;
  $("#dnSave").onclick = async () => {
    await sb.from("date_nights").upsert({ week_of: wk, plan: $("#dnPlan").value.trim() },
                                        { onConflict: "week_of" });
    await loadAll(); renderHome();
  };
}

/* ---------- the day sheet ---------- */
function openDay(key) { DS.key = key; $("#day").hidden = false; renderDay(); }
function closeDay()   { $("#day").hidden = true; DS.key = null; }

function renderDay() {
  const key = DS.key; if (!key) return;
  const d = fromKey(key), st = dayStat(key);
  $("#dsDate").textContent = niceDay(key);
  $("#dsSub").textContent  = st.total
    ? d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
      + " · " + st.dmins + " of " + st.mins + " minutes done"
    : d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
      + " · nothing on it";

  const pct = st.total ? st.done / st.total : 0;
  $("#dsRing").style.strokeDashoffset = (327 * (1 - pct)).toFixed(1);
  $("#dsRingText").textContent = st.total ? st.done + "/" + st.total : "—";

  $("#dsList").innerHTML = st.total
    ? st.occ.map(x => taskChip(x, key, true)).join("")
    : `<div class="quiet">Free day. Add something if you want it on here.</div>`;

}

/* ---------- finishing things ---------- */
async function tick(planId, key) {
  const p = S.plans.find(x => x.id === planId); if (!p) return;
  const had = doneRow(planId, key);

  if (had) {                                        // tapped by mistake, take it back
    await sb.from("log").delete().eq("id", had.id);
    await loadAll(); refresh(key);
    return;
  }

  const wasLocked = dayStat(key).locked;
  buzz(14);
  await sb.from("log").insert({
    person: "us", room_id: p.room_id || null, plan_id: p.id, on_date: key,
    task_name: p.title, minutes: p.minutes, points: p.minutes
  });

  await loadAll();
  const st = dayStat(key);
  if (!wasLocked && st.locked) { burst(); buzz([20, 70, 20]); }
  refresh(key, !wasLocked && st.locked);
}

function refresh(key, popped) {
  renderHome();
  if (DS.key) renderDay();
  if (popped && V.view === "month") {
    const cell = $(`[data-cell="${key}"]`);
    if (cell) { cell.classList.add("pop"); setTimeout(() => cell.classList.remove("pop"), 520); }
  }
}

async function undoEntry(id) {
  const e = S.log.find(x => x.id === id);
  if (!e) return;
  await sb.from("log").delete().eq("id", id);
  await loadAll();
  if ($("#s-ledger").classList.contains("on")) renderLedger();
  else if ($("#s-settings").classList.contains("on")) renderSettings();
  else renderHome();
}

/* ---------- moving and skipping ---------- */
async function moveOcc(planId, fromK, toK) {
  const p = S.plans.find(x => x.id === planId); if (!p) return;
  if (p.repeat === "none") {
    await sb.from("plans").update({ on_date: toK }).eq("id", p.id);
  } else {
    const already = S.moves.find(m => m.plan_id === p.id && m.to_date === fromK);
    if (already) await sb.from("moves").update({ to_date: toK }).eq("id", already.id);
    else await sb.from("moves").upsert({ plan_id: p.id, from_date: fromK, to_date: toK },
                                       { onConflict: "plan_id,from_date" });
  }
  await loadAll();
  if (DS.key) { DS.key = fromK; renderDay(); }
  renderHome();
}
async function skipOcc(planId, fromK) {
  const p = S.plans.find(x => x.id === planId); if (!p) return;
  if (p.repeat === "none") { await sb.from("plans").update({ archived: true }).eq("id", p.id); }
  else {
    const already = S.moves.find(m => m.plan_id === p.id && m.to_date === fromK);
    if (already) await sb.from("moves").update({ to_date: null }).eq("id", already.id);
    else await sb.from("moves").upsert({ plan_id: p.id, from_date: fromK, to_date: null },
                                       { onConflict: "plan_id,from_date" });
  }
  await loadAll(); renderDay(); renderHome();
}

function openMore(planId, key) {
  const p = S.plans.find(x => x.id === planId); if (!p) return;
  const repeating = p.repeat !== "none";
  const sh = $("#sheet");
  sh.hidden = false;
  sh.innerHTML = `<div style="width:100%;max-width:400px">
    <div style="color:#fff;font-size:21px;font-weight:800;text-align:center;margin-bottom:4px">${esc(p.title)}</div>
    <div style="color:#fff;opacity:.6;font-size:14px;text-align:center;margin-bottom:18px">${esc(niceDay(key))}</div>
    <button class="btn mid" data-mv="1">Push to tomorrow</button>
    <button class="btn mid" data-mv="7">Push a week</button>
    <button class="btn mid" data-mvpick="1">Pick another day</button>
    <button class="btn mid" data-skip="1">${repeating ? "Skip just this one" : "Take it off the calendar"}</button>
    <button class="btn mid" data-edit="1">Edit it${repeating ? " everywhere" : ""}</button>
    <button class="btn ghost" data-close="1" style="color:#fff">Never mind</button></div>`;

  const close = () => { sh.hidden = true; };
  sh.onclick = e => { if (e.target === sh) close(); };
  $$("[data-mv]", sh).forEach(b => b.onclick = () => {
    close(); moveOcc(p.id, key, addDays(key, Number(b.dataset.mv)));
  });
  $("[data-mvpick]", sh).onclick = () => {
    const to = prompt("Move it to which day? Use YYYY-MM-DD.", addDays(key, 1));
    close();
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to.trim())) moveOcc(p.id, key, to.trim());
  };
  $("[data-skip]", sh).onclick = () => { close(); skipOcc(p.id, key); };
  $("[data-edit]", sh).onclick = () => { close(); closeDay(); openAdd(p, key); };
  $("[data-close]", sh).onclick = close;
}

function openMenu() {
  const sh = $("#sheet");
  sh.hidden = false;
  sh.innerHTML = `<div style="width:100%;max-width:400px">
    <div style="color:#fff;font-size:21px;font-weight:800;text-align:center;margin-bottom:18px">The House</div>
    <button class="btn mid" data-menu="s-ledger">The log</button>
    <button class="btn mid" data-menu="s-standards">The Standards</button>
    <button class="btn mid" data-menu="s-settings">Settings</button>
    <button class="btn ghost" data-menuclose="1" style="color:#fff">Never mind</button></div>`;
  const close = () => { sh.hidden = true; };
  sh.onclick = e => { if (e.target === sh) close(); };
  $$("[data-menu]", sh).forEach(b => b.onclick = () => { close(); go(b.dataset.menu); });
  $("[data-menuclose]", sh).onclick = close;
}

/* ---------- add and edit ---------- */
const MINS = [5, 10, 15, 20, 30, 60];
const REPEATS = [["none", "Just once"], ["daily", "Every day"], ["weekly", "Every week"],
                 ["biweekly", "Every other week"], ["monthly", "Every month"]];

function openAdd(plan, key) {
  A.id = plan ? plan.id : null;
  A.back = DS.key ? "day" : "s-home";
  const d = plan ? (plan.anchor || plan.on_date || todayKey()) : (key || DS.key || todayKey());
  A.date    = d;
  A.minutes = plan ? plan.minutes : 10;
  A.repeat  = plan ? plan.repeat : "none";
  A.dow     = plan && plan.repeat_dow != null ? plan.repeat_dow : fromKey(d).getDay();
  A.dom     = plan && plan.repeat_dom != null ? plan.repeat_dom : fromKey(d).getDate();
  A.room    = plan ? plan.room_id : null;
  A.floor   = plan ? !!plan.floor : false;

  $("#addTitle").textContent = plan ? "Edit task" : "New task";
  $("#addSub").textContent = plan ? "" : "Goes on " + niceDay(d).toLowerCase() + ".";
  $("#aTitle").value = plan ? plan.title : "";
  $("#aMore").hidden = !plan;                 // adding stays two taps
  $("#aDelete").hidden = !plan;
  $("#aSave").textContent = plan ? "Save it" : "Add it";
  $("#aErr").textContent = "";
  closeDay();
  renderAdd();
  go("s-add");
  if (!plan) setTimeout(() => $("#aTitle").focus(), 120);
}

function renderAdd() {
  $("#aMins").innerHTML = MINS.map(m =>
    `<button data-amin="${m}" class="${m === A.minutes ? "on" : ""}">${m}m</button>`).join("");
  if ($("#aMore").hidden) return;

  $("#aDate").value = A.date;
  $("#aRepeat").innerHTML = REPEATS.map(r =>
    `<button data-arep="${r[0]}" class="${r[0] === A.repeat ? "on" : ""}">${r[1]}</button>`).join("");

  let extra = "";
  if (A.repeat === "weekly" || A.repeat === "biweekly") {
    extra = `<div class="chiprow">` + [1, 2, 3, 4, 5, 6, 0].map(i =>
      `<button data-adow="${i}" class="${i === A.dow ? "on" : ""}">${DOW[i]}</button>`).join("") + `</div>`;
    if (A.repeat === "biweekly")
      extra += `<p class="sub" style="margin:8px 0 0">Every other ${DOW[A.dow]}, counting from the week of ${esc(A.date)}.</p>`;
  } else if (A.repeat === "monthly") {
    extra = `<p class="sub" style="margin:0">On the ${A.dom}${ord(A.dom)} of every month. Change the day above to move it.</p>`;
  } else if (A.repeat === "daily") {
    extra = `<p class="sub" style="margin:0">Every day, starting ${esc(A.date)}.</p>`;
  }
  $("#aRepeatExtra").innerHTML = extra;

  $("#aRoom").innerHTML = `<button data-aroom="" class="${A.room ? "" : "on"}">None</button>` +
    S.rooms.map(r => `<button data-aroom="${r.id}" class="${r.id === A.room ? "on" : ""}">${esc(r.name)}</button>`).join("");
  $("#aFloorSw").classList.toggle("on", A.floor);
}
const ord = n => (n % 10 === 1 && n !== 11) ? "st" : (n % 10 === 2 && n !== 12) ? "nd"
              : (n % 10 === 3 && n !== 13) ? "rd" : "th";

async function saveAdd() {
  const title = $("#aTitle").value.trim();
  if (!title) { $("#aErr").textContent = "Give it a name."; return; }
  const minutes = A.minutes;

  const row = {
    title, minutes, room_id: A.room || null, floor: A.floor,
    repeat: A.repeat,
    on_date: A.date,
    anchor: A.repeat === "none" ? null : A.date,
    repeat_dow: (A.repeat === "weekly" || A.repeat === "biweekly") ? A.dow : null,
    repeat_dom: A.repeat === "monthly" ? A.dom : null,
    archived: false
  };

  if (A.id) await sb.from("plans").update(row).eq("id", A.id);
  else { row.sort_order = S.plans.length + 1; await sb.from("plans").insert(row); }

  buzz();
  await loadAll();
  const land = A.date;
  go("s-home");
  openDay(land);
}
async function deletePlan() {
  if (!A.id) return;
  if (!confirm("Delete this for good? What's already logged stays in the log.")) return;
  await sb.from("plans").update({ archived: true }).eq("id", A.id);
  await loadAll(); go("s-home");
}

/* ---------- the log ---------- */
function ledRows() {
  const t = todayKey();
  let from;
  if (ledRange === "week")  from = weekStartKey(t);
  else if (ledRange === "month") from = t.slice(0, 8) + "01";
  else from = S.settings.season_started || addDays(t, -84);
  return S.log.filter(e => logKey(e) >= from)
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
function renderLedger() {
  const rows = ledRows();
  $$("[data-led]").forEach(b => {
    const on = b.dataset.led === ledRange;
    b.style.background  = on ? "var(--terra)" : "";
    b.style.color       = on ? "#fff" : "";
    b.style.borderColor = on ? "var(--terra)" : "";
  });

  const mins = rows.reduce((n, e) => n + (e.minutes || 0), 0);
  const h = Math.floor(mins / 60), r = mins % 60;
  $("#ledLine").textContent  = ledRange === "week" ? "This week, together"
                             : ledRange === "month" ? "This month, together" : "The season, together";
  $("#ledMins").textContent  = mins;
  $("#ledCount").textContent = rows.length + (rows.length === 1 ? " thing finished" : " things finished")
    + (h ? "  ·  that's " + h + "h " + r + "m" : "");

  if (!rows.length) { $("#ledList").innerHTML = `<div class="quiet">Nothing logged yet.</div>`; return; }

  let out = "", lastDay = "";
  rows.forEach(e => {
    const k = logKey(e), d = new Date(e.created_at);
    if (k !== lastDay) {
      out += `<h3 style="margin:20px 0 8px;font-size:15px;color:var(--muted)">${esc(niceDay(k))}</h3>`;
      lastDay = k;
    }
    const room = S.rooms.find(x => x.id === e.room_id);
    out += `<div class="std-row">
      <span class="sn">${esc(e.task_name || "Cleaned")}
        <span class="sm">${room ? esc(room.name) + " · " : ""}${
          d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span></span>
      <span class="cm" style="font-weight:800;color:var(--muted)">${e.minutes}m</span>
      <button class="btn ghost" style="width:auto;margin:0;padding:8px 10px" data-undo="${e.id}">Undo</button>
    </div>`;
  });
  $("#ledList").innerHTML = out;
}

/* ---------- standards ---------- */
function renderStandards() {
  const set = S.tasks.filter(t => t.standard_photo).length;
  $("#stdSub").textContent = set + " of " + S.tasks.length
    + " standards set. This is what settles what clean means, before anybody has to argue about it.";
  $("#stdList").innerHTML = S.rooms.map(r => {
    const ts = S.tasks.filter(t => t.room_id === r.id);
    if (!ts.length) return "";
    return `<h3 style="margin:20px 0 8px;font-size:17px">${esc(r.name)}</h3>` + ts.map(t =>
      `<button class="std-row" data-std="${t.id}">
         ${t.standard_photo ? `<img src="${t.standard_photo}" alt="">` : `<span class="ph"></span>`}
         <span class="sn">${esc(t.name)}
           <span class="sm">${t.standard_photo ? esc(t.standard_note || "Tap to view or replace")
                                               : "Set the standard"}</span></span></button>`).join("");
  }).join("");
}
function openStandard(taskId) {
  const t = S.tasks.find(x => x.id === taskId); if (!t) return;
  if (!t.standard_photo) return shootStandard(t);
  const sh = $("#sheet");
  sh.hidden = false;
  sh.innerHTML = `<div><img src="${t.standard_photo}" alt="">
    <p>${esc(t.standard_note || t.name)}</p>
    <p style="opacity:.7;font-size:14px">Tap anywhere to close.</p>
    <button class="btn go mid" id="replaceStd" style="margin-top:14px">Replace this standard</button></div>`;
  sh.onclick = e => { if (e.target.id !== "replaceStd") sh.hidden = true; };
  $("#replaceStd").onclick = e => { e.stopPropagation(); sh.hidden = true; shootStandard(t); };
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

/* ---------- settings ---------- */
function renderSettings() {
  const bm = !!S.settings.bare_minimum;
  $("#bmSw").classList.toggle("on", bm);
  $("#bmSub").textContent = bm
    ? "On. Floor tasks only, goal is " + S.settings.floor_goal + " minutes. Turns itself off next week."
    : "Drop to the floor. The chain still counts.";
  $("#setGoal").value  = S.settings.weekly_goal;
  $("#setFloor").value = S.settings.floor_goal;

  const wm = weekMins(), wg = goalNow();
  $("#setWkNow").textContent  = wm;
  $("#setWkGoal").textContent = "of " + wg + " minutes";
  $("#setWkBar").style.width  = Math.min(100, (wm / wg) * 100) + "%";
  $("#setWkBar").classList.toggle("hit", wm >= wg);

  const live = S.plans.filter(p => !p.archived);
  $("#planAdmin").innerHTML = live.length ? live.map(p => {
    const room = S.rooms.find(r => r.id === p.room_id);
    const rep = (REPEATS.find(r => r[0] === p.repeat) || ["", "Just once"])[1]
      + ((p.repeat === "weekly" || p.repeat === "biweekly") ? ", " + DOW[p.repeat_dow] : "")
      + (p.repeat === "monthly" ? ", the " + p.repeat_dom + ord(p.repeat_dom) : "")
      + (p.repeat === "none" ? ", " + niceDay(p.on_date) : "");
    return `<button class="std-row" data-editplan="${p.id}">
      <span class="sn">${esc(p.title)}<span class="sm">${p.minutes} min · ${esc(rep)}${
        room ? " · " + esc(room.name) : ""}${p.floor ? " · floor" : ""}</span></span>
      <span class="cm" style="color:var(--muted);font-weight:800">Edit</span></button>`;
  }).join("") : `<div class="quiet">Nothing on the calendar yet.</div>`;

  const mine = S.log.slice()
    .sort((x, y) => new Date(y.created_at) - new Date(x.created_at)).slice(0, 12);
  $("#recent").innerHTML = mine.length ? mine.map(e => {
    const when = new Date(e.created_at);
    return `<div class="std-row"><span class="sn">${esc(e.task_name || "Cleaned")}
      <span class="sm">${esc(niceDay(logKey(e)))} · ${when.toLocaleTimeString(undefined,
        { hour: "numeric", minute: "2-digit" })} · ${e.minutes}m</span></span>
      <button class="btn ghost" style="width:auto;margin:0" data-undo="${e.id}">Undo</button></div>`;
  }).join("") : `<div class="quiet">Nothing logged yet.</div>`;

  $("#roomAdmin").innerHTML = S.rooms.map(r =>
    `<div class="std-row"><span class="sn">${esc(r.name)}
       <span class="sm">${S.tasks.filter(t => t.room_id === r.id).length} standards</span></span>
     <button class="btn ghost" style="width:auto;margin:0" data-delroom="${r.id}">Remove</button></div>`).join("");

  const days = Math.floor((Date.now() - fromKey(S.settings.season_started || todayKey()).getTime()) / DAY);
  $("#seasonLine").textContent = Math.max(0, 84 - days)
    + " days until everything resets. Nothing here is permanent.";
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  const hit = sel => e.target.closest(sel);

  if (hit("#menuBtn"))      return openMenu();
  if (hit("#completeFab"))  return openDay(todayKey());
  if (hit("#addCancel")) { const b = A.back; go("s-home"); if (b === "day") openDay(A.date); return; }
  if (hit("#aSave"))     return saveAdd();
  if (hit("#aDelete"))   return deletePlan();
  if (hit("#aFloorT"))   { A.floor = !A.floor; return renderAdd(); }
  if (hit("#dsClose"))   return closeDay();
  if (hit("#dsAdd"))     return openAdd(null, DS.key);
  if (hit("#prevM")) { V.month = new Date(V.month.getFullYear(), V.month.getMonth() - 1, 1); return renderMonth(); }
  if (hit("#nextM")) { V.month = new Date(V.month.getFullYear(), V.month.getMonth() + 1, 1); return renderMonth(); }
  if (hit("#prevW")) { V.week = addDays(V.week || weekStartKey(todayKey()), -7); return renderWeekView(); }
  if (hit("#nextW")) { V.week = addDays(V.week || weekStartKey(todayKey()),  7); return renderWeekView(); }

  if (e.target === $("#day")) return closeDay();

  const t = hit("[data-go],[data-view],[data-day],[data-tick],[data-more],[data-led],[data-undo],[data-std],[data-editplan],[data-delroom],[data-amin],[data-arep],[data-adow],[data-aroom]");
  if (!t) return;

  if (t.dataset.go)   return go(t.dataset.go);
  if (t.dataset.view) {
    V.view = t.dataset.view;
    $$("[data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === V.view));
    $("#monthView").hidden = V.view !== "month";
    $("#weekView").hidden  = V.view !== "week";
    return V.view === "month" ? renderMonth() : renderWeekView();
  }
  if (t.dataset.tick) { const [id, k] = t.dataset.tick.split("|"); return tick(id, k); }
  if (t.dataset.more) { const [id, k] = t.dataset.more.split("|"); return openMore(id, k); }
  if (t.dataset.day)  return openDay(t.dataset.day);
  if (t.dataset.led)  { ledRange = t.dataset.led; return renderLedger(); }
  if (t.dataset.undo) return undoEntry(t.dataset.undo);
  if (t.dataset.std)  return openStandard(t.dataset.std);
  if (t.dataset.editplan) {
    const p = S.plans.find(x => x.id === t.dataset.editplan);
    if (p) openAdd(p, p.anchor || p.on_date || todayKey());
    return;
  }
  if (t.dataset.delroom) {
    const r = S.rooms.find(x => x.id === t.dataset.delroom);
    if (!confirm("Remove " + r.name + " and its standards?")) return;
    await sb.from("rooms").delete().eq("id", r.id);
    await loadAll(); return renderSettings();
  }
  if (t.dataset.amin !== undefined && t.dataset.amin !== "") {
    A.minutes = Number(t.dataset.amin); return renderAdd();
  }
  if (t.dataset.arep) { A.repeat = t.dataset.arep; return renderAdd(); }
  if (t.dataset.adow !== undefined && t.dataset.adow !== "") { A.dow = Number(t.dataset.adow); return renderAdd(); }
  if (t.hasAttribute("data-aroom")) { A.room = t.dataset.aroom || null; return renderAdd(); }
});

document.addEventListener("change", e => {
  if (e.target.id === "aDate" && e.target.value) {
    A.date = e.target.value;
    A.dow  = fromKey(A.date).getDay();
    A.dom  = fromKey(A.date).getDate();
    renderAdd();
  }
});

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
    bare_minimum: on, bare_minimum_week: on ? weekStartKey(todayKey()) : null
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

/* ---------- boot ---------- */
async function start() {
  await loadAll();
  $("#boot").hidden = true;
  $("#app").hidden = false;
  V.week = weekStartKey(todayKey());
  go("s-home");
}

(async function boot() {
  if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.startsWith("PASTE")) {
    $("#bootMsg").innerHTML = "Open <b>config.js</b> and paste in your Supabase project URL and anon key.";
    return;
  }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  try { await start(); }
  catch (err) {
    console.error(err);
    $("#bootMsg").innerHTML = err && err.needsMigration
      ? "One step left. Open Supabase, SQL Editor, paste all of <b>migrate_04.sql</b>, press Run. "
        + "Then pull this page down to reload."
      : "Could not reach the database. Check config.js.";
  }
})();
