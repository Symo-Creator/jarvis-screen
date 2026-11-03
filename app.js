/* Jarvis mirror screen. ES5 only, for old TV browsers. */
(function () {
  var DATA = null, EVENTS = null, quoteIdx = 0, rot = { course: 0, money: 0 };
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

  /* ---------- clock + night mode ---------- */
  function tickClock() {
    var d = new Date(), h = d.getHours(), h12 = h % 12 || 12;
    $('clock').innerHTML = h12 + '<span class="colon">:</span>' + pad(d.getMinutes()) + '<span class="ampm">' + (h >= 12 ? 'PM' : 'AM') + '</span>';
    $('date').innerHTML = DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();
    var deep = h >= 1 && h < 5, dimmed = h >= 21 || h < 6;
    $('night').style.display = deep ? 'block' : 'none';
    if (deep) $('nightClock').innerHTML = h12 + ':' + pad(d.getMinutes());
    $('stage').style.opacity = dimmed ? '0.55' : '1';
    if (h === 3 && d.getMinutes() === 0 && d.getSeconds() < 2) location.reload();
  }

  /* ---------- mantra ---------- */
  function nextQuote(first) {
    var q = (DATA && DATA.quotes && DATA.quotes.length) ? DATA.quotes : ['Never miss twice.'];
    var el = $('mantra');
    if (first) { el.innerHTML = esc(q[quoteIdx % q.length]); return; }
    el.style.opacity = '0';
    setTimeout(function () { quoteIdx++; el.innerHTML = esc(q[quoteIdx % q.length]); el.style.opacity = '1'; }, 600);
  }

  /* ---------- weather (Open-Meteo, no key) ---------- */
  var WX = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
    56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers',
    86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
  function loadWeather() {
    var c = (DATA && DATA.config) || {}, lat = c.lat || 42.03, lon = c.lon || -93.62;
    getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=America%2FChicago&forecast_days=1', function (d) {
        safe(function () {
          var cw = d.current_weather;
          $('temp').innerHTML = Math.round(cw.temperature) + '&deg;';
          $('cond').innerHTML = esc(WX[cw.weathercode] || 'Weather');
          $('hilo').innerHTML = 'H ' + Math.round(d.daily.temperature_2m_max[0]) + '&deg; L ' + Math.round(d.daily.temperature_2m_min[0]) +
            '&deg;';
        });
      }, function () { $('cond').innerHTML = 'Weather offline'; $('hilo').innerHTML = esc(c.city || 'Ames, IA'); });
  }

  /* ---------- schedule ---------- */
  function todaysItems(now) {
    var list = [], i, e, s, en;
    var evs = (EVENTS && EVENTS.events) || [];
    for (i = 0; i < evs.length; i++) {
      e = evs[i]; s = parseISO(e.start); en = parseISO(e.end) || s;
      if (s && (sameDay(s, now) || (s < now && en > now))) list.push({ title: e.title, s: s, e: en, allDay: !!e.allDay });
    }
    if (!list.length && DATA && DATA.defaultSchedule) {   /* fallback when no calendar data for today */
      for (i = 0; i < DATA.defaultSchedule.length; i++) {
        e = DATA.defaultSchedule[i];
        if (e.days && e.days.indexOf(now.getDay()) < 0) continue;
        s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +e.start.split(':')[0], +e.start.split(':')[1]);
        en = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +e.end.split(':')[0], +e.end.split(':')[1]);
        list.push({ title: e.title, s: s, e: en });
      }
    }
    list.sort(function (a, b) { return a.s - b.s; });
    return list;
  }
  function upcoming(now) {
    var evs = (EVENTS && EVENTS.events) || [], best = null, i, s;
    for (i = 0; i < evs.length; i++) {
      if (evs[i].allDay) continue;
      s = parseISO(evs[i].start);
      if (s && s > now && (!best || s < best.s)) best = { title: evs[i].title, s: s, e: parseISO(evs[i].end) };
    }
    return best;
  }
  function renderSchedule() {
    var now = new Date(), items = todaysItems(now), timed = [], i, it, cur = null, next = null;
    for (i = 0; i < items.length; i++) if (!items[i].allDay) timed.push(items[i]);
    for (i = 0; i < timed.length; i++) {
      it = timed[i];
      if (it.s <= now && it.e > now && !cur) cur = it;
      if (it.s > now && !next) next = it;
    }
    if (!next) next = upcoming(now);
    var nu = next || cur, html;
    if (nu) {
      var mins = Math.round((nu.s - now) / 60000), inTxt;
      if (nu === cur || mins <= 0) inTxt = 'NOW';
      else if (mins < 60) inTxt = 'in ' + mins + ' min';
      else if (mins < 24 * 60) inTxt = 'in ' + Math.floor(mins / 60) + 'h ' + pad(mins % 60) + 'm';
      else inTxt = DAYS[nu.s.getDay()];
      html = '<div class="nu-title">' + esc(nu.title) + '</div><div class="nu-when"><span class="nu-in">' + inTxt + '</span>' +
        ' <span class="dim">&middot; ' + fmtTime(nu.s) + (sameDay(nu.s, now) ? '' : ' ' + DAYS[nu.s.getDay()].slice(0, 3)) + '</span></div>' +
        (cur && next ? '<div class="nu-when dim">Now: ' + esc(cur.title) + '</div>' : '');
    } else html = '<div class="nu-title">Rest. Reset.</div><div class="nu-when dim">Nothing else on the calendar</div>';
    $('nextup').innerHTML = html;
    /* rows: up to 6, starting one before the current/next item */
    var start = 0;
    for (i = 0; i < timed.length; i++) { if (timed[i].e > now) { start = Math.max(0, i - 1); break; } start = Math.max(0, timed.length - 6); }
    var rows = timed.slice(start, start + 6), out = '';
    for (i = 0; i < rows.length; i++) {
      it = rows[i];
      var cls = it.e <= now ? ' past' : (it.s <= now ? ' now' : '');
      out += '<div class="row' + cls + '"><span class="t">' + fmtTime(it.s) + '</span><span class="n">' + esc(it.title) + '</span></div>';
    }
    $('sched').innerHTML = out || '<div class="empty">Open day. Make it count.</div>';
  }

  /* ---------- streak + checklist ---------- */
  function renderStreak() {
    var s = DATA.streak || {}, p = DATA.points || {};
    $('streakNum').innerHTML = s.streak_current || 0;
    $('pts').innerHTML = 'Today <b>' + (p.today || 0) + '/' + (p.dailyTarget || 10) + '</b> pts<br>' +
      'Week <b>' + (p.week || 0) + '/' + (p.weeklyTarget || 60) + '</b><br>' +
      'Month <b>' + (p.month || 0) + '/' + (p.monthlyTarget || 240) + '</b>';
    var c = DATA.checklist || [], out = '', i;
    for (i = 0; i < c.length && i < 6; i++) {
      out += '<div class="ci' + (c[i].done ? ' done' : '') + (c[i].must ? ' must' : '') + '"><span class="box">' +
        (c[i].done ? '&#10003;' : '') + '</span><span class="lbl">' + esc(c[i].text) + '</span></div>';
    }
    $('check').innerHTML = out;
  }

  /* ---------- courses (rotates two views) ---------- */
  function renderCourse() {
    var cs = DATA.courses || [], done = 0, hrs = 0, hdone = 0, nxt = null, i;
    for (i = 0; i < cs.length; i++) {
      hrs += cs[i].hours || 0;
      if (cs[i].done) { done++; hdone += cs[i].hours || 0; } else if (!nxt) nxt = cs[i];
    }
    var pct = cs.length ? Math.round(done * 100 / cs.length) : 0, html;
    if (rot.course % 2 === 0 || !nxt) {
      html = '<div class="big">' + done + '/' + cs.length + '</div><div class="lbl2">courses done</div>' +
        '<div class="bar"><div class="fill" data-w="' + pct + '"></div></div>' +
        '<div class="lbl2">' + Math.round(hdone) + ' of ' + Math.round(hrs) + ' hours</div>';
    } else {
      html = '<div class="lbl2">Now studying</div><div class="txt">' + esc(nxt.name) + '</div>' +
        '<div class="lbl2">' + esc(nxt.provider) + '</div><div class="lbl2">~' + nxt.hours + ' h &middot; due ' + esc(nxt.targetMonth) + '</div>';
    }
    $('course').innerHTML = html; fillBars($('course'));
  }

  /* ---------- money (rotates goal cards) ---------- */
  function renderMoney() {
    var m = DATA.money || {}, g = m.goals || [], b = m.balances || [], cards = [], i, html;
    var asOf = m.asOf ? parseISO(m.asOf) : null;
    $('moneyTitle').innerHTML = 'Money' + (asOf ? ' &middot; as of ' + (asOf.getMonth() + 1) + '/' + asOf.getDate() : '');
    var stale = m.stale ? '<div class="lbl2 warn">Stale: update ledger</div>' : '';
    for (i = 0; i < g.length; i++) {
      var x = g[i], pct;
      if (x.kind === 'payoff') pct = null;
      else pct = (x.current != null && x.target) ? Math.min(100, Math.round(x.current * 100 / x.target)) : 0;
      cards.push(stale + '<div class="lbl2">' + esc(x.label) + '</div><div class="amt">' + money(x.current) + '</div>' +
        (pct === null ? '<div class="lbl2">to $0</div>' :
          '<div class="bar"><div class="fill" data-w="' + pct + '"></div></div><div class="lbl2">of ' + money(x.target) + ' floor</div>') +
        (x.note ? '<div class="lbl2' + (pct !== null && pct < 100 ? ' warn' : '') + '">' + esc(x.note) + '</div>' : ''));
    }
    if (b.length) {
      html = stale;
      for (i = 0; i < b.length && i < 4; i++) html += '<div class="lbl2">' + esc(b[i].label) + ': <span style="color:#F5F5F0">' + money(b[i].value) + '</span></div>';
      cards.push(html);
    }
    $('money').innerHTML = cards.length ? cards[rot.money % cards.length] : '<div class="lbl2 edit">EDIT ME</div>';
    fillBars($('money'));
  }
  function fillBars(root) {
    var f = root.getElementsByTagName('div'), i;
    setTimeout(function () {
      for (i = 0; i < f.length; i++) if (f[i].className === 'fill') f[i].style.width = f[i].getAttribute('data-w') + '%';
    }, 50);
  }

  function renderAll() {
    if (!DATA) return;
    safe(renderSchedule); safe(renderStreak); safe(renderCourse); safe(renderMoney);
  }
  function loadData() {
    getJSON('data.json', function (d) { DATA = d; renderAll(); }, function () { renderAll(); });
    var ef = (DATA && DATA.config && DATA.config.eventsFile) || 'events.json';
    getJSON(ef, function (d) { EVENTS = d; safe(renderSchedule); }, function () { safe(renderSchedule); });
  }

  /* ---------- scale 1920x1080 design to any screen + burn-in drift ---------- */
  var DX = 0, DY = 0;
  function fit() {
    var w = window.innerWidth || document.documentElement.clientWidth || 1920,
        h = window.innerHeight || document.documentElement.clientHeight || 1080,
        s = Math.min(w / 1920, h / 1080), st = $('stage').style;
    var ox = Math.round((w - 1920 * s) / 2) + DX, oy = Math.round((h - 1080 * s) / 2) + DY;
    var t = 'translate(' + ox + 'px,' + oy + 'px) scale(' + s + ')';
    st.webkitTransform = t; st.transform = t;
  }
  window.onresize = fit;
  function drift() {
    DX = Math.round(Math.random() * 12 - 6); DY = Math.round(Math.random() * 12 - 6); fit();
    var day = new Date().getDate(), o = (day % 17) - 8;
    $('mantra').style.left = o + 'px'; $('hilo').style.left = (-o) + 'px';
  }

  function start() {
    if (/still=1/.test(location.search)) document.body.className += ' no-motion';
    var t0 = new Date().getTime(), raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
    if (raf) raf(function () { if (new Date().getTime() - t0 > 50) document.body.className += ' no-motion'; });
    var ps = ['pClock', 'pMantra', 'pWeather', 'pSched', 'pStreak', 'pCourse', 'pMoney'], i;
    for (i = 0; i < ps.length; i++) (function (el, k) { setTimeout(function () { el.className += ' in'; }, 60 * k); })($(ps[i]), i);
    tickClock(); setInterval(tickClock, 1000);
    getJSON('data.json', function (d) { DATA = d; nextQuote(true); loadWeather(); loadData(); },
      function () { DATA = {}; nextQuote(true); loadWeather(); loadData(); });
    var mins = 5;
    setInterval(function () { loadData(); loadWeather(); }, mins * 60000);
    setInterval(function () { safe(renderSchedule); }, 30000);
    setInterval(function () { nextQuote(false); }, 30000);
    setInterval(function () { rot.course++; rot.money++; safe(renderCourse); safe(renderMoney); }, 15000);
    setInterval(drift, 5 * 60000); drift();
  }
  start();
})();
