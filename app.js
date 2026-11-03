/* Jarvis minimalist slides. ES5 only, for old TV browsers. */
(function () {
  var DATA = null, EVENTS = null, quoteIdx = 0, WXT = '';
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function safe(fn) { try { fn(); } catch (e) { if (window.console) console.log(e); } }
  function getJSON(url, ok, fail) {
    var x = new XMLHttpRequest();
    x.open('GET', url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + new Date().getTime(), true);
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      if (x.status === 200 || (x.status === 0 && x.responseText)) {
        var d; try { d = JSON.parse(x.responseText); } catch (e) { if (fail) fail(); return; }
        ok(d);
      } else if (fail) fail();
    };
    try { x.send(); } catch (e) { if (fail) fail(); }
  }
  function money(v) {
    if (v === null || v === undefined || v === '' || isNaN(v)) return '<span class="edit">EDIT ME</span>';
    var n = Math.round(Number(v) * 100) / 100, s = Math.floor(Math.abs(n)).toString(), out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    var c = Math.round((Math.abs(n) % 1) * 100);
    return (n < 0 ? '-' : '') + '$' + s + out + (c ? '.' + pad(c) : '');
  }
  function fmtTime(d) {
    var h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + pad(m) + ' ' + ap;
  }
  /* Parse "2026-11-03T05:00:00-06:00", "...Z", or "2026-11-03" without trusting Date.parse. */
  function parseISO(s) {
    var m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?(Z|[+-]\d\d:?\d\d)?)?/.exec(s || '');
    if (!m) return null;
    if (!m[4]) return new Date(+m[1], +m[2] - 1, +m[3]);
    if (!m[7]) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    var utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    if (m[7] !== 'Z') {
      var sign = m[7].charAt(0) === '-' ? -1 : 1, z = m[7].replace(':', '');
      utc -= sign * (parseInt(z.substr(1, 2), 10) * 60 + parseInt(z.substr(3, 2), 10)) * 60000;
    }
    return new Date(utc);
  }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }


  var SLIDES = ['Overview', 'Schedule', 'Habits', 'Workout', 'Finances'];
  var ROTATE_MS = 20000, IDLE_MS = 60000, cur = 0, paused = false, manualPause = false, lastKey = 0, rotTimer = null;

  /* ---------- clock + night mode ---------- */
  function tickClock() {
    var d = new Date(), h = d.getHours(), h12 = h % 12 || 12;
    $('clock').innerHTML = h12 + '<span class="colon">:</span>' + pad(d.getMinutes()) + '<span class="ampm">' + (h >= 12 ? 'PM' : 'AM') + '</span>';
    $('miniClock').innerHTML = h12 + ':' + pad(d.getMinutes()) + ' ' + (h >= 12 ? 'PM' : 'AM');
    $('date').innerHTML = DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + WXT;
    var deep = h >= 1 && h < 5, dimmed = h >= 21 || h < 6;
    $('night').style.display = deep ? 'block' : 'none';
    if (deep) $('nightClock').innerHTML = h12 + ':' + pad(d.getMinutes());
    document.body.className = document.body.className.replace(/ ?dark/g, '') + (dimmed ? ' dark' : '');
    $('stage').style.opacity = dimmed ? '0.55' : '1';
    if (h === 3 && d.getMinutes() === 0 && d.getSeconds() < 2) location.reload();
  }
  function nextQuote(first) {
    var q = (DATA && DATA.quotes && DATA.quotes.length) ? DATA.quotes : ['Never miss twice.'], el = $('mantra');
    if (first) { el.innerHTML = esc(q[quoteIdx % q.length]); return; }
    el.style.opacity = '0';
    setTimeout(function () { quoteIdx++; el.innerHTML = esc(q[quoteIdx % q.length]); el.style.opacity = '1'; }, 600);
  }
  function loadWeather() {
    var c = (DATA && DATA.config) || {};
    getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + (c.lat || 42.03) + '&longitude=' + (c.lon || -93.62) +
      '&current_weather=true&temperature_unit=fahrenheit&timezone=America%2FChicago&forecast_days=1', function (d) {
        safe(function () { WXT = ' &middot; ' + Math.round(d.current_weather.temperature) + '&deg;'; tickClock(); });
      }, function () { WXT = ''; });
  }

  /* ---------- events ---------- */
  function itemsFor(day) {
    var list = [], i, e, s, en, evs = (EVENTS && EVENTS.events) || [];
    for (i = 0; i < evs.length; i++) {
      e = evs[i]; if (e.allDay) continue;
      s = parseISO(e.start); en = parseISO(e.end) || s;
      if (s && sameDay(s, day)) list.push({ title: e.title, s: s, e: en });
    }
    if (!list.length && DATA && DATA.defaultSchedule) {
      for (i = 0; i < DATA.defaultSchedule.length; i++) {
        e = DATA.defaultSchedule[i];
        if (e.days && e.days.indexOf(day.getDay()) < 0) continue;
        s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +e.start.split(':')[0], +e.start.split(':')[1]);
        en = new Date(day.getFullYear(), day.getMonth(), day.getDate(), +e.end.split(':')[0], +e.end.split(':')[1]);
        list.push({ title: e.title, s: s, e: en });
      }
    }
    list.sort(function (a, b) { return a.s - b.s; });
    return list;
  }
  function tomorrow(now) { return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); }
  function nextItem(now) {
    var t = itemsFor(now).concat(itemsFor(tomorrow(now))), i;
    for (i = 0; i < t.length; i++) if (t[i].s <= now && t[i].e > now) return { it: t[i], now: true };
    for (i = 0; i < t.length; i++) if (t[i].s > now) return { it: t[i], now: false };
    return null;
  }

  /* ---------- 1 overview ---------- */
  function renderOverview() {
    var s = DATA.streak || {}, p = DATA.points || {}, t = DATA.today || {}, now = new Date();
    $('ovStreak').innerHTML = s.streak_current || 0;
    $('ovPri').innerHTML = t.priority ? esc(t.priority) : '<span class="edit">EDIT ME</span>';
    $('ovPts').innerHTML = (p.today || 0) + '<span class="small">/' + (p.dailyTarget || 10) + '</span>';
    var n = nextItem(now);
    $('ovNext').innerHTML = n ? (n.now ? '<span class="accent">Now</span> ' : '<span class="accent">' + fmtTime(n.it.s).replace(' ', '&nbsp;') +
      (sameDay(n.it.s, now) ? '' : ' tmrw') + '</span> ') + esc(n.it.title) : 'Open day';
  }

  /* ---------- 2 schedule ---------- */
  function renderSchedule() {
    var now = new Date(), items = itemsFor(now), i, it, curI = -1, nxtI = -1, out = '';
    for (i = 0; i < items.length; i++) {
      if (items[i].s <= now && items[i].e > now && curI < 0) curI = i;
      if (items[i].s > now && nxtI < 0) nxtI = i;
    }
    var focus = curI >= 0 ? curI : (nxtI >= 0 ? nxtI : items.length);
    var start = Math.max(0, Math.min(focus - 1, items.length - 6));
    var rows = items.slice(start, start + 6);
    for (i = 0; i < rows.length; i++) {
      it = rows[i]; var idx = start + i, cls = '', tag = '';
      if (idx === curI) { cls = ' now'; tag = 'NOW'; }
      else if (idx === nxtI && curI < 0) { cls = ' now'; tag = 'NEXT'; }
      else if (idx === nxtI) tag = 'NEXT';
      else if (it.e <= now) cls = ' past';
      out += '<div class="row' + cls + '"><span class="t">' + fmtTime(it.s) + '</span><span class="n">' + esc(it.title) + '</span>' +
        (tag ? '<span class="tag">' + tag + '</span>' : '') + '</div>';
    }
    $('sched').innerHTML = out || '<div class="empty">Open day. Make it count.</div>';
    var tm = itemsFor(tomorrow(now)), t2 = '';
    for (i = 0; i < tm.length && i < 3; i++) t2 += '<div class="trow"><div class="tt">' + fmtTime(tm[i].s) + '</div><div class="tn">' + esc(tm[i].title) + '</div></div>';
    $('tmr').innerHTML = t2 || '<div class="trow"><div class="tn">Nothing yet</div></div>';
  }

  /* ---------- 3 habits ---------- */
  function renderHabits() {
    var c = DATA.checklist || [], out = '', i, p = DATA.points || {}, s = DATA.streak || {};
    for (i = 0; i < c.length && i < 5; i++)
      out += '<div class="hab' + (c[i].done ? ' done' : '') + '"><span class="mark">' + (c[i].done ? '&#10003;' : '') + '</span><span class="ht">' + esc(c[i].text) + '</span></div>';
    $('habits').innerHTML = out;
    $('hStreak').innerHTML = s.streak_current || 0;
    $('hWeek').innerHTML = (p.week || 0) + '<span class="small">/' + (p.weeklyTarget || 60) + '</span>';
    $('hMonth').innerHTML = (p.month || 0) + '<span class="small">/' + (p.monthlyTarget || 240) + '</span>';
    var cs = DATA.courses || [], done = 0, nx = null;
    for (i = 0; i < cs.length; i++) { if (cs[i].done) done++; else if (!nx) nx = cs[i]; }
    $('hCourses').innerHTML = done + '<span class="small">/' + cs.length + '</span>';
    $('hCourse').innerHTML = nx ? 'Now: ' + esc(nx.name) : 'All done';
  }

  /* ---------- 4 workout ---------- */
  function renderWorkout() {
    var w = DATA.workout || {}, d = new Date(), day = (w.plan || {})[String(d.getDay())], i, out = '';
    $('woDay').innerHTML = DAYS[d.getDay()] + (day ? ' &middot; ' + esc(w.time || '5:00 to 6:15 AM') : '');
    if (day) {
      $('woName').innerHTML = esc(day.name);
      $('woTag').innerHTML = w.placeholder ? '<span class="warn">PLACEHOLDER</span> split. Edit workout in data.json' : (w.notes ? esc(w.notes) : '&nbsp;');
      var ex = day.exercises || [];
      for (i = 0; i < ex.length && i < 5; i++) out += '<div class="wi">' + (/EDIT ME/.test(ex[i]) ? '<span class="edit">' + esc(ex[i]) + '</span>' : esc(ex[i])) + '</div>';
    } else {
      $('woName').innerHTML = 'Rest day';
      $('woTag').innerHTML = 'Recover. Walk. Sleep.';
    }
    $('woList').innerHTML = out;
    $('woStreak').innerHTML = w.gymStreak || 0;
    var tgt = w.targetWeek || 4, n = w.sessionsWeek || 0, pips = '';
    $('woWeek').innerHTML = n + '<span class="small">/' + tgt + '</span>';
    for (i = 0; i < tgt; i++) pips += '<span class="pip' + (i < n ? ' f' : '') + '"></span>';
    $('woPips').innerHTML = pips;
    $('woDone').innerHTML = w.doneToday ? '&#10003; Done today' : (day ? 'Not logged yet' : '&nbsp;');
  }

  /* ---------- 5 finances (never account numbers) ---------- */
  function goal(label) { var g = (DATA.money && DATA.money.goals) || [], i; for (i = 0; i < g.length; i++) if (g[i].label === label) return g[i]; return {}; }
  function renderFinances() {
    var m = DATA.money || {}, ef = goal('Emergency fund'), debt = goal('Debt still to pay'), tgt = ef.target || 1000;
    $('efAmt').innerHTML = money(ef.current) + '<span class="small"> of ' + money(tgt) + '</span>';
    var pct = (ef.current != null && tgt) ? Math.min(100, Math.round(ef.current * 100 / tgt)) : 0;
    setTimeout(function () { $('efFill').style.width = pct + '%'; }, 50);
    $('efNote').innerHTML = ef.current == null ? '&nbsp;' : (ef.current < tgt ? '<span class="warn">Under by ' + money(tgt - ef.current) + '</span>. Refill first.' : 'Floor met.');
    var spent = m.spending_today != null ? m.spending_today : null;
    $('fSpent').innerHTML = money(spent);
    $('fTips').innerHTML = money(m.tips_week);
    var shift = m.shift_income_week != null ? m.shift_income_week : (m.ledger_income_week ? m.ledger_income_week : null);
    $('fShift').innerHTML = money(shift);
    $('fDebt').innerHTML = 'Debt still to pay: ' + money(debt.current);
    var a = m.asOf ? parseISO(m.asOf) : null;
    $('fAsOf').innerHTML = a ? (m.stale ? '<span class="warn">Stale</span> ' : '') + 'Ledger as of ' + MONTHS[a.getMonth()] + ' ' + a.getDate() : 'Ledger: EDIT ME';
  }

  function renderAll() {
    if (!DATA) return;
    safe(renderOverview); safe(renderSchedule); safe(renderHabits); safe(renderWorkout); safe(renderFinances);
  }
  function loadData() {
    getJSON('data.json', function (d) { DATA = d; renderAll(); }, renderAll);
    getJSON((DATA && DATA.config && DATA.config.eventsFile) || 'events.json', function (d) { EVENTS = d; renderAll(); }, renderAll);
  }

  /* ---------- slides + remote ---------- */
  function show(i) {
    cur = (i + SLIDES.length) % SLIDES.length;
    var k, dots = '';
    for (k = 0; k < SLIDES.length; k++) {
      $('s' + (k + 1)).className = 'slide' + (k === cur ? ' on' : '');
      dots += '<span class="dot' + (k === cur ? ' on' : '') + '"></span>';
    }
    $('dots').innerHTML = dots;
    $('slideName').innerHTML = cur === 0 ? '&nbsp;' : SLIDES[cur];
    $('miniClock').style.visibility = cur === 0 ? 'hidden' : 'visible';
    if (cur === 1) safe(renderSchedule);
    if (cur === 0) safe(renderOverview);
  }
  function setPaused(p) {
    paused = p;
    var b = $('stage');
    b.className = p ? 'paused' : '';
  }
  function rotTick() {
    var now = new Date().getTime();
    if (paused && !manualPause && now - lastKey >= IDLE_MS) setPaused(false);
    if (manualPause && now - lastKey >= IDLE_MS) { manualPause = false; setPaused(false); }
    if (!paused && now - lastSwitch >= ROTATE_MS) { show(cur + 1); lastSwitch = now; }
  }
  var lastSwitch = new Date().getTime();
  function onKey(e) {
    e = e || window.event;
    var k = e.keyCode || e.which, key = e.key || '', now = new Date().getTime(), handled = true;
    if (k === 39 || k === 40 || key === 'ArrowRight' || key === 'ArrowDown') show(cur + 1);
    else if (k === 37 || k === 38 || key === 'ArrowLeft' || key === 'ArrowUp') show(cur - 1);
    else if (k === 13 || k === 32 || key === 'Enter') {
      manualPause = !paused; lastKey = now; setPaused(!paused); lastSwitch = now;
      if (e.preventDefault) e.preventDefault(); return false;
    }
    else if (k >= 49 && k <= 53) show(k - 49);
    else if (k >= 97 && k <= 101) show(k - 97);
    else handled = false;
    if (handled) {
      lastKey = now; lastSwitch = now;
      if (!paused) { setPaused(true); manualPause = false; }
      if (e.preventDefault) e.preventDefault();
      return false;
    }
  }
  if (document.addEventListener) document.addEventListener('keydown', onKey, false); else document.onkeydown = onKey;
  window.jarvisShow = show; /* test hook */

  /* ---------- scale 1920x1080 to any screen + burn-in drift ---------- */
  var DX = 0, DY = 0;
  function fit() {
    var w = window.innerWidth || document.documentElement.clientWidth || 1920,
        h = window.innerHeight || document.documentElement.clientHeight || 1080,
        s = Math.min(w / 1920, h / 1080), st = $('stage').style;
    var t = 'translate(' + (Math.round((w - 1920 * s) / 2) + DX) + 'px,' + (Math.round((h - 1080 * s) / 2) + DY) + 'px) scale(' + s + ')';
    st.webkitTransform = t; st.transform = t;
  }
  window.onresize = fit;
  function drift() { DX = Math.round(Math.random() * 12 - 6); DY = Math.round(Math.random() * 12 - 6); fit(); }

  function start() {
    if (/still=1/.test(location.search)) document.body.className += ' no-motion';
    var m = /slide=(\d)/.exec(location.search);
    show(m ? +m[1] - 1 : 0);
    if (/pause=1/.test(location.search)) { manualPause = true; lastKey = new Date().getTime(); setPaused(true); }
    tickClock(); setInterval(tickClock, 1000);
    getJSON('data.json', function (d) { DATA = d; nextQuote(true); loadWeather(); loadData(); },
      function () { DATA = {}; nextQuote(true); loadData(); });
    setInterval(function () { loadData(); loadWeather(); }, 5 * 60000);
    setInterval(function () { safe(renderSchedule); safe(renderOverview); }, 30000);
    setInterval(function () { nextQuote(false); }, 30000);
    setInterval(rotTick, 1000);
    setInterval(drift, 5 * 60000); drift();
  }
  start();
})();
