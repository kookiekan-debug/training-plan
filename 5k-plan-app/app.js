(function () {
  "use strict";
  var KEY = "training-plan-v1";
  var STARTS = { "Squat": 20, "Bench": 20, "Overhead press": 20, "Barbell row": 30, "Deadlift": 40 };
  var DEFAULT_PACE = { vo2: "5:50-6:05", thr: "6:40-7:00", tt: "6:25" };
  var ESTIMATE_5K = 1920;
  var sessions = window.PLAN.sessions, text = window.PLAN.text;
  var view = document.getElementById("view");
  var tab = "today", openId = null, listScroll = {};
  var state = load();

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.sessions) return s;
    } catch (e) {}
    return { sessions: {}, lastBackup: null };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { alert("Could not save on this device. Export a backup from More."); }
  }
  function log(id) { return state.sessions[id] || (state.sessions[id] = {}); }
  function peek(id) { return state.sessions[id] || {}; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Dates are plain local calendar days, never UTC.
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() {
    var q = new URLSearchParams(location.search).get("today");
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : iso(new Date());
  }
  function nice(s, long) {
    return parse(s).toLocaleDateString("en-GB", long
      ? { weekday: "long", day: "numeric", month: "long" }
      : { weekday: "short", day: "numeric", month: "short" });
  }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function fmt(sec) { sec = Math.round(sec); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }

  function latestTT(before) {
    var best = null;
    sessions.forEach(function (s) {
      var t = peek(s.id).ttSec;
      if (t && (!before || s.date <= before)) best = { sec: t, date: s.date };
    });
    return best;
  }
  function paces() {
    var t = latestTT();
    if (!t) return DEFAULT_PACE;
    var p = t.sec / 5;
    return { vo2: fmt(p - 35) + "-" + fmt(p - 20), thr: fmt(p + 15) + "-" + fmt(p + 35), tt: fmt(p), from: t.date };
  }
  function detail(s) {
    var p = paces();
    return s.run.detail.replace("{VO2}", p.vo2).replace("{THR}", p.thr).replace("{TT}", p.tt);
  }

  function parts(s) { return s.order; }
  function status(s) {
    var l = peek(s.id);
    if (l.skipped) return "skip";
    var n = parts(s).filter(function (p) { return l[p + "Done"]; }).length;
    if (n === parts(s).length) return "done";
    if (n > 0) return "part";
    return s.date < today() ? "missed" : "todo";
  }
  function mark(st) {
    var g = { done: "✓", part: "•", skip: "–", missed: "!", todo: "" }[st];
    var name = { done: "Done", part: "Partly done", skip: "Skipped", missed: "Not logged", todo: "To do" }[st];
    return '<span class="mark ' + st + '" role="img" aria-label="' + name + '">' + g + "</span>";
  }
  function title(s) {
    var t = [];
    s.order.forEach(function (p) {
      if (p === "run") t.push(s.run.title);
      if (p === "bowl") t.push("Bowl " + s.bowl.balls);
      if (p === "lift") t.push("Lift " + s.lift.name);
    });
    return t.join(" + ");
  }
  function sessionRow(s) {
    var isToday = s.date === today();
    return '<button class="row' + (isToday ? " today" : "") + '" data-open="' + s.id + '">' + mark(status(s)) +
      '<span class="main"><span class="date">' + nice(s.date) + (isToday ? " · Today" : "") + "</span><br>" + esc(title(s)) + "</span></button>";
  }

  // Weights: last logged weight, plus 2.5 kg if all reps were clean and it isn't a hold week.
  function suggest(s, name) {
    var last = null;
    sessions.forEach(function (o) {
      if (o.date >= s.date) return;
      var x = peek(o.id).lifts && peek(o.id).lifts[name];
      if (x && x.kg != null) last = x;
    });
    if (!last) return STARTS[name] != null ? STARTS[name] : null;
    return last.clean && !s.lift.hold ? last.kg + 2.5 : last.kg;
  }
  function currentLift(name) {
    var last = null;
    sessions.forEach(function (o) {
      var x = peek(o.id).lifts && peek(o.id).lifts[name];
      if (x && x.kg != null) last = { kg: x.kg, date: o.date };
    });
    return last;
  }

  function renderToday() {
    var t = today();
    var cur = sessions.filter(function (s) { return s.date === t; })[0];
    var next = sessions.filter(function (s) { return s.date > t; })[0];
    var overdue = sessions.filter(function (s) { return s.date < t && status(s) === "missed"; }).pop();
    var h = "<h1>" + (cur ? "Today" : "Rest day") + '</h1><p class="sub">' + nice(t, true) + "</p>";
    if (t < sessions[0].date) {
      h = '<h1>Starts soon</h1><p class="sub">' + nice(t, true) + " · first session in " + daysBetween(t, sessions[0].date) + " days</p>";
    } else if (!cur && !next) {
      h = '<h1>Plan complete</h1><p class="sub">Your season is here. Switch to StrongLifts Mini and keep one hard midweek session.</p>';
    }
    if (cur) {
      h += sessionBody(cur);
    } else if (next) {
      h += '<div class="card"><div class="kind">Next · ' + nice(next.date) + "</div><h2>" + esc(title(next)) + '</h2><button class="btn primary" data-open="' + next.id + '">View session</button></div>';
    }
    if (overdue && overdue !== cur) {
      h += '<div class="card notice"><strong>Not logged: ' + nice(overdue.date) + "</strong><p>" + esc(title(overdue)) +
        '. Missed it? Skip it and don\'t double up.</p><button class="btn" data-open="' + overdue.id + '">Log or skip</button></div>';
    }
    return h;
  }

  function runCard(s) {
    var l = peek(s.id), done = l.runDone, tt = s.run.type === "tt", extra = "";
    if (tt) {
      var sec = l.ttSec;
      extra = '<label class="field">Your 5K time</label><div class="time">' +
        '<input type="number" inputmode="numeric" min="12" max="60" placeholder="min" aria-label="Minutes" data-tt="min" value="' + (sec ? Math.floor(sec / 60) : "") + '"><span>:</span>' +
        '<input type="number" inputmode="numeric" min="0" max="59" placeholder="sec" aria-label="Seconds" data-tt="sec" value="' + (sec ? sec % 60 : "") + '"></div>' +
        '<button class="btn" data-savett="' + s.id + '">Save time and update paces</button>';
    }
    return '<div class="card"><div class="kind">Run</div><h2>' + esc(s.run.title) + "</h2><p>" + esc(detail(s)) + "</p>" + extra + doneBtn(s, "run", done) + "</div>";
  }
  function doneBtn(s, p, done) {
    return '<button class="btn ' + (done ? "done" : "primary") + '" data-done="' + p + '" data-id="' + s.id + '" aria-pressed="' + !!done + '">' + (done ? "✓ Done" : "Mark done") + "</button>";
  }
  function bowlCard(s) {
    var l = peek(s.id), balls = l.balls != null ? l.balls : s.bowl.balls;
    return '<div class="card"><div class="kind">Bowling</div><h2>' + s.bowl.balls + " balls · " + esc(s.bowl.effort) + "</h2>" +
      '<p class="small">' + esc(text.bowl) + "</p>" +
      '<label class="field">Balls bowled</label><div class="stepper">' +
      '<button data-balls="-6" data-id="' + s.id + '" aria-label="6 fewer balls">−</button>' +
      '<input type="number" inputmode="numeric" min="0" aria-label="Balls bowled" data-ballsinput="' + s.id + '" value="' + balls + '">' +
      '<button data-balls="6" data-id="' + s.id + '" aria-label="6 more balls">+</button></div>' +
      doneBtn(s, "bowl", l.bowlDone) + "</div>";
  }
  function liftCard(s) {
    var l = peek(s.id), h = '<div class="card"><div class="kind">Lift ' + s.lift.name + " · StrongLifts Lite</div>" +
      (s.lift.hold ? "<p><strong>No weight increases this week.</strong></p>" : "");
    s.lift.ex.forEach(function (e) {
      var rec = (l.lifts && l.lifts[e.name]) || {};
      var kg = rec.kg != null ? rec.kg : suggest(s, e.name);
      h += '<div class="lift"><div class="lift-head"><span>' + esc(e.name) + "</span><span>" + esc(e.sets) + "</span></div>" +
        (e.note ? '<div class="small">' + esc(e.note) + "</div>" : "");
      if (e.weighted) {
        h += '<div class="stepper"><button data-kg="-2.5" data-ex="' + esc(e.name) + '" data-id="' + s.id + '" aria-label="Less weight">−</button>' +
          '<input type="number" inputmode="decimal" step="0.5" min="0" aria-label="' + esc(e.name) + ' weight in kg" data-kginput="' + esc(e.name) + '" data-id="' + s.id + '" value="' + (kg == null ? "" : kg) + '">' +
          '<span class="unit">kg</span><button data-kg="2.5" data-ex="' + esc(e.name) + '" data-id="' + s.id + '" aria-label="More weight">+</button></div>' +
          '<label class="check"><input type="checkbox" data-clean="' + esc(e.name) + '" data-id="' + s.id + '"' + (rec.clean ? " checked" : "") + "> All reps clean</label>";
      }
      h += "</div>";
    });
    return h + '<p class="small">' + esc(text.lift) + "</p>" + doneBtn(s, "lift", l.liftDone) + "</div>";
  }
  function sessionBody(s) {
    var l = peek(s.id), h = "";
    if (s.note) h += '<div class="card notice"><strong>This week</strong><p>' + esc(s.note) + "</p></div>";
    var cards = { run: runCard, bowl: bowlCard, lift: liftCard };
    s.order.forEach(function (p) { h += cards[p](s); });
    h += '<div class="card"><div class="kind">How it went</div><label class="field">Effort, 1–10</label><div class="chips">';
    for (var i = 1; i <= 10; i++) h += '<button data-rpe="' + i + '" data-id="' + s.id + '" class="' + (l.rpe === i ? "on" : "") + '" aria-pressed="' + (l.rpe === i) + '">' + i + "</button>";
    h += '</div><label class="field">Notes<textarea data-notes="' + s.id + '" placeholder="Average heart rate, how your legs felt…">' + esc(l.notes) + "</textarea></label></div>";
    h += '<button class="btn text" data-skip="' + s.id + '">' + (l.skipped ? "Undo skip" : "Skip this session") + "</button>";
    return h;
  }
  function renderSession(s) {
    return '<button class="back" data-back>‹ Back</button><h1>' + nice(s.date, true) + '</h1><p class="sub">Week ' + s.wk + " · " + esc(s.phase) + "</p>" + sessionBody(s);
  }

  function renderPlan() {
    var h = '<h1>Plan</h1><p class="sub">25 weeks · 10 Nov to 2 May</p>', t = today();
    var phase = null, weeks = {};
    sessions.forEach(function (s) { (weeks[s.wk] = weeks[s.wk] || []).push(s); });
    var curWk = (sessions.filter(function (s) { return s.date >= t; })[0] || sessions[sessions.length - 1]).wk;
    Object.keys(weeks).forEach(function (w) {
      var list = weeks[w];
      if (list[0].phase !== phase) { phase = list[0].phase; h += "<h3>" + esc(phase) + "</h3>"; }
      var n = list.filter(function (s) { return status(s) === "done"; }).length;
      h += "<details" + (+w === curWk ? " open" : "") + "><summary><span>Week " + w + '</span><span class="small">' + nice(list[0].date) + " · " + n + "/3 done</span></summary>" +
        list.map(sessionRow).join("") + "</details>";
    });
    return h;
  }

  function renderProgress() {
    var t = today(), past = sessions.filter(function (s) { return s.date <= t; });
    var done = past.filter(function (s) { return status(s) === "done"; }).length;
    var km = sessions.reduce(function (a, s) { return a + (peek(s.id).runDone && s.run.km ? s.run.km : 0); }, 0);
    var h = '<h1>Progress</h1><p class="sub">Up to ' + nice(t) + "</p><h3>Consistency</h3><div class=\"card\">" +
      statRow("Sessions completed", done + " of " + past.length) + statRow("Planned km completed", km.toFixed(1) + " km") + "</div>";
    h += '<h3>5K time trials</h3><div class="card">';
    sessions.filter(function (s) { return s.run.type === "tt"; }).forEach(function (s) {
      var sec = peek(s.id).ttSec;
      h += '<button class="row" data-open="' + s.id + '"><span class="main">' + nice(s.date) + '</span><span class="val">' + (sec ? fmt(sec) : "–") + "</span></button>";
    });
    var p = paces(), tt = latestTT();
    h += '<p class="small">Estimated start: ' + fmt(ESTIMATE_5K) + " (projected from a shorter effort, so a rough comparison).</p></div>";
    h += '<h3>Current paces</h3><div class="card">' + statRow("VO2 intervals", p.vo2 + "/km") + statRow("Threshold", p.thr + "/km") +
      '<p class="small">' + (tt ? "Based on your " + nice(tt.date) + " time trial." : "Starting estimates until you log a time trial.") + "</p></div>";
    h += '<h3>Current lifts</h3><div class="card">';
    ["Squat", "Bench", "Overhead press", "Barbell row", "Deadlift", "Calf raises"].forEach(function (n) {
      var c = currentLift(n);
      h += statRow(n, c ? c.kg + " kg" : "–");
    });
    h += "</div>";
    var bowlWeeks = {};
    sessions.forEach(function (s) {
      if (!s.bowl) return;
      var b = bowlWeeks[s.wk] = bowlWeeks[s.wk] || { plan: 0, did: 0, date: s.date };
      b.plan += s.bowl.balls;
      var l = peek(s.id);
      if (l.bowlDone) b.did += l.balls != null ? l.balls : s.bowl.balls;
    });
    h += '<h3>Bowling, balls per week</h3><div class="card">';
    Object.keys(bowlWeeks).forEach(function (w) {
      h += statRow("Week " + w, bowlWeeks[w].did + " of " + bowlWeeks[w].plan);
    });
    return h + "</div>";
  }
  function statRow(k, v) { return '<div class="row static"><span class="main">' + esc(k) + '</span><span class="val">' + esc(v) + "</span></div>"; }

  function renderMore() {
    var last = state.lastBackup ? "Last backup: " + nice(state.lastBackup) : "No backup yet.";
    return '<h1>More</h1><p class="sub">Plan overview, rules and backups</p>' +
      '<h3>Backup</h3><div class="card"><p>Your logs are saved only on this iPhone. Export a backup regularly, and before you delete the app or change phone.</p><p class="small">' + last + "</p>" +
      '<button class="btn primary" data-export>Export backup</button><button class="btn" data-import>Restore from backup</button></div>' +
      '<h3>Overview</h3><div class="card"><p class="prewrap">' + esc(text.overview) + "</p></div>" +
      '<h3>Reset</h3><div class="card"><button class="btn danger" data-reset>Delete all my logs</button></div>';
  }

  function render() {
    document.querySelectorAll("#tabs button").forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    if (openId) {
      view.innerHTML = renderSession(sessions.filter(function (s) { return s.id === openId; })[0]);
    } else {
      view.innerHTML = { today: renderToday, plan: renderPlan, progress: renderProgress, more: renderMore }[tab]();
    }
  }
  // Redraw in place, keeping the scroll position.
  function refresh() { var y = window.scrollY; render(); window.scrollTo(0, y); }

  function setLift(id, name, kg) {
    var l = log(id);
    l.lifts = l.lifts || {};
    l.lifts[name] = l.lifts[name] || {};
    l.lifts[name].kg = kg;
  }
  function sessionById(id) { return sessions.filter(function (s) { return s.id === id; })[0]; }

  document.getElementById("tabs").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    tab = b.dataset.tab; openId = null; render(); window.scrollTo(0, 0);
    var cur = tab === "plan" && view.querySelector("details[open]");
    if (cur) window.scrollTo(0, cur.getBoundingClientRect().top - 40);
  });

  view.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var d = b.dataset, id = d.id;
    if (d.open) { listScroll[tab] = window.scrollY; openId = d.open; render(); window.scrollTo(0, 0); return; }
    if (b.hasAttribute("data-back")) { openId = null; render(); window.scrollTo(0, listScroll[tab] || 0); return; }
    if (d.done) {
      var l = log(id), key = d.done + "Done";
      l[key] = !l[key];
      if (l[key]) l.skipped = false;
      // A finished lift records the weights shown, including untouched suggestions.
      if (d.done === "lift" && l[key]) {
        var s = sessionById(id);
        s.lift.ex.forEach(function (ex) {
          if (!ex.weighted) return;
          var cur = l.lifts && l.lifts[ex.name];
          if (!cur || cur.kg == null) { var k = suggest(s, ex.name); if (k != null) setLift(id, ex.name, k); }
        });
      }
      save(); refresh(); return;
    }
    if (d.balls) {
      var ses = sessionById(id), lg = log(id);
      lg.balls = Math.max(0, (lg.balls != null ? lg.balls : ses.bowl.balls) + +d.balls);
      save(); refresh(); return;
    }
    if (d.kg) {
      var se = sessionById(id), rec = peek(id).lifts && peek(id).lifts[d.ex];
      var base = rec && rec.kg != null ? rec.kg : suggest(se, d.ex);
      setLift(id, d.ex, Math.max(0, (base || 0) + +d.kg));
      save(); refresh(); return;
    }
    if (d.rpe) { var r = log(id); r.rpe = r.rpe === +d.rpe ? null : +d.rpe; save(); refresh(); return; }
    if (d.skip) { var q = log(d.skip); q.skipped = !q.skipped; save(); refresh(); return; }
    if (d.savett) {
      var mi = view.querySelector('[data-tt="min"]').value, se2 = view.querySelector('[data-tt="sec"]').value;
      var m = parseInt(mi, 10), x = parseInt(se2 || "0", 10);
      if (isNaN(m) || m < 12 || m > 60 || isNaN(x) || x < 0 || x > 59) { alert("Enter a time like 31 min 45 sec."); return; }
      var tl = log(d.savett);
      tl.ttSec = m * 60 + x; tl.runDone = true; tl.skipped = false;
      save(); refresh(); return;
    }
    if (b.hasAttribute("data-export")) { exportBackup(); return; }
    if (b.hasAttribute("data-import")) { document.getElementById("importFile").click(); return; }
    if (b.hasAttribute("data-reset")) {
      if (confirm("Delete all your logs from this iPhone? This can't be undone unless you have a backup.")) {
        state = { sessions: {}, lastBackup: null }; save(); refresh();
      }
    }
  });

  view.addEventListener("input", function (e) {
    var t = e.target, d = t.dataset;
    if (d.notes) { log(d.notes).notes = t.value; save(); }
    if (d.ballsinput) { var n = parseInt(t.value, 10); if (!isNaN(n) && n >= 0) { log(d.ballsinput).balls = n; save(); } }
    if (d.kginput) { var k = parseFloat(t.value); if (!isNaN(k) && k >= 0) { setLift(d.id, d.kginput, k); save(); } }
  });
  view.addEventListener("change", function (e) {
    var t = e.target, d = t.dataset;
    if (d.clean) {
      var s = sessionById(d.id), l = log(d.id);
      l.lifts = l.lifts || {};
      var rec = l.lifts[d.clean] = l.lifts[d.clean] || {};
      if (rec.kg == null) rec.kg = suggest(s, d.clean);
      rec.clean = t.checked;
      save();
    }
  });

  function exportBackup() {
    var name = "training-plan-backup-" + iso(new Date()) + ".json";
    state.lastBackup = iso(new Date());
    save();
    var body = JSON.stringify({ app: "training-plan", version: 1, exported: new Date().toISOString(), state: state }, null, 1);
    var file;
    try { file = new File([body], name, { type: "application/json" }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).then(refresh).catch(refresh);
      return;
    }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    refresh();
  }
  document.getElementById("importFile").addEventListener("change", function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = JSON.parse(r.result);
        if (data.app !== "training-plan" || !data.state || typeof data.state.sessions !== "object") throw new Error("bad");
        if (confirm("Replace the logs on this iPhone with this backup?")) { state = data.state; save(); refresh(); }
      } catch (err) { alert("That file isn't a training plan backup."); }
      e.target.value = "";
    };
    r.readAsText(f);
  });

  // Reopened after midnight: move on to the new day.
  var shown = today();
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && today() !== shown) { shown = today(); refresh(); }
  });

  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }
  if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch(function () {}); }
  render();
})();
