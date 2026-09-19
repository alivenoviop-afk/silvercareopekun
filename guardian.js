/* SilverCare Опекун — мини-сайт для проектора. Тот же ntfy, что у бота и old.html.
   Токен только в localStorage опекуна, в пакет не попадает. Везде try/catch. */
(function () {
'use strict';
var BUILD_G = '20260919-f'; // сборка: сверяй с бабушкой, должна совпадать

function $(id) { try { return document.getElementById(id); } catch (e) { return null; } }
function say(el, t) { try { if (el) el.textContent = t; } catch (e) {} }
function load(k, fb) { try { var v = localStorage.getItem(k); return v === null ? fb : v; } catch (e) { return fb; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function loadJ(k) { try { return JSON.parse(localStorage.getItem(k) || ''); } catch (e) { return null; } }

var LOCKED_FAMILY = '5814-k7q2'; // зафиксированный код: держим только его
var K_F = 'guardian_family', K_V = 'guardian_v', K_M = 'guardian_meds',
    K_T = 'guardian_token', K_S = 'guardian_site', K_J = 'guardian_journal', K_SEEN = 'guardian_seen', K_PUB = 'guardian_pub', K_PH = 'guardian_phone', K_SOS = 'guardian_sos', K_DEL = 'guardian_del';
var VOICE_LIMIT = 90 * 1024;
var COLORS = { blue: '#0066FF', red: '#FF0000', yellow: '#FFD800', white: '#FFFFFF' };

var state = {
  family: load(K_F, ''), v: parseInt(load(K_V, '0'), 10) || 0,
  meds: loadJ(K_M) || [], journal: loadJ(K_J) || [],
  seen: loadJ(K_SEEN) || [], lastAlive: null
};
var voice = { blob: null, b64: '', url: '', mime: '' }; // голос текущей формы
var rec = { mr: null, chunks: [], timer: null, stream: null, secs: 0 };
var formDays = [0, 1, 2, 3, 4, 5, 6]; // дни новой таблетки: 0=Вс..6=Сб, все = каждый день
var DAYN = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
var KIND_RU = { pill: 'таблетка', inhal: 'ингаляция', gargle: 'полоскание', custom: 'своё' };
var KIND_HEAD = { pill: 'Время пить лекарство!', inhal: 'Время делать ингаляцию!', gargle: 'Время полоскать горло!' };
var UNIT_G = {
  'штука': ['штука', 'штуки', 'штук'], 'флакон': ['флакон', 'флакона', 'флаконов'],
  'стаканчик': ['стаканчик', 'стаканчика', 'стаканчиков'], 'капля': ['капля', 'капли', 'капель'],
  'ложка': ['ложка', 'ложки', 'ложек'], 'вдох': ['вдох', 'вдоха', 'вдохов']
};
function pluralN(n, f) {
  try {
    if (Math.abs(n % 1) > 0.001) return f[1];
    var a = Math.abs(n) % 10, b = Math.abs(n) % 100;
    if (a === 1 && b !== 11) return f[0];
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return f[1];
    return f[2];
  } catch (e) { return f[0]; }
}
function unitWordG(unit, qty) {
  try { return pluralN(parseFloat(qty) || 0, UNIT_G[unit] || [unit, unit, unit]); } catch (e) { return unit || ''; }
}
function buildPhrase(o) {
  try { // фраза как скажет опекун: действие + название + количество + цвет
    var head = (o.kind === 'custom') ? ((o.custom || '').trim() || 'Время по расписанию!') : (KIND_HEAD[o.kind] || KIND_HEAD.pill);
    var qp = '';
    try { var q = parseFloat(String(o.qty).replace(',', '.')); if (!isNaN(q)) qp = String(o.qty) + ' ' + unitWordG(o.unit || 'штука', q); } catch (e) {}
    var col = '';
    try {
      if ((o.kind || 'pill') === 'pill' && o.color) {
        var cn = { blue: 'синяя', red: 'красная', green: 'зелёная', yellow: 'жёлтая', white: 'белая', orange: 'оранжевая', pink: 'розовая' }[o.color];
        if (cn) col = ', ' + cn;
      }
    } catch (e) {}
    return (head + ' ' + (o.name || '') + (qp ? ', ' + qp : '') + col + '.').replace(/\s+/g, ' ').trim();
  } catch (e) { return 'Время пить лекарство!'; }
}
function daysLabel(ds) {
  try {
    if (!ds || ds.length >= 7) return 'каждый день';
    return ds.slice().sort().map(function (d) { return DAYN[d]; }).join(', ');
  } catch (e) { return 'каждый день'; }
}
function paintDays() {
  try {
    var box = $('fDays'); if (!box) return;
    var btns = box.querySelectorAll('button[data-d]');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        try {
          var k = b.getAttribute('data-d');
          var on = (k === 'all') ? (formDays.length >= 7) : (formDays.indexOf(parseInt(k, 10)) !== -1);
          if (on) b.classList.add('on'); else b.classList.remove('on');
        } catch (e) {}
      })(btns[i]);
    }
  } catch (e) {}
}

/* ---------- Ссылки и пакет ---------- */
var BABA_URL = 'https://alivenoviop-afk.github.io/silvercarebaba'; // адрес бабушки БЕЗ слэша на конце
function site() {
  try {
    var v = '';
    try { if (typeof BABA_URL === 'string' && BABA_URL) v = BABA_URL.replace(/\/+$/, ''); } catch (e) {}
    if (!v) {
      try { // один домен на двоих: угадываем соседа по своему пути
        var o = window.location.origin || '', p = window.location.pathname || '';
        if (o.indexOf('http') === 0) {
          if (p.indexOf('/opekun/') !== -1) v = o + '/baba';
          else if (p.indexOf('/apk/') !== -1) v = o + '/apk';
          else v = o;
        }
      } catch (e) {}
    }
    if (!v) { try { v = load(K_S, ''); } catch (e) {} }
    if (!v) v = 'https://BABA-XXX.workers.dev';
    return v.replace(/\/+$/, '');
  } catch (e) { return 'https://BABA-XXX.workers.dev'; }
}
/* Ящик: ntfy.sh общий или свой (Deck+туннель). Меняется ОДНОЙ строкой */
var NTFY_BASE = 'https://advice-apache-suspension-portion.trycloudflare.com';
function downUrl() { return NTFY_BASE + '/silvercare-' + encodeURIComponent(state.family) + '-down'; }
function upUrl() { return NTFY_BASE + '/silvercare-' + encodeURIComponent(state.family) + '-up'; }
function packet() {
  try {
    return { family: state.family, v: state.v, updatedAt: new Date().toISOString(), meds: state.meds, settings: {}, del: loadJ(K_DEL) || [] };
  } catch (e) { return { family: '', v: 0, meds: [], settings: {} }; }
}
function shortLink() { try { return site() + '/old.html#family=' + state.family; } catch (e) { return ''; } }
function fullLink() {
  try {
    var raw = JSON.stringify(packet());
    var p = (window.LZString) ? window.LZString.compressToEncodedURIComponent(raw) : '';
    return site() + '/old.html#p=' + p;
  } catch (e) { return ''; }
}
function medsKeyG(v, meds) {
  try {
    var s = JSON.stringify(meds || []);
    var h = 0;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return v + ':' + (h >>> 0);
  } catch (e) { return String(v) + ':0'; }
}
function persist() {
  try {
    save(K_F, state.family); save(K_V, String(state.v));
    save(K_M, JSON.stringify(state.meds)); save(K_J, JSON.stringify(state.journal.slice(0, 80)));
    save(K_SEEN, JSON.stringify(state.seen.slice(-300)));
    try {
      /* Зеркало для old.html на том же адресе: подхватит мгновенно, без ссылок и ntfy */
      if (state.family) {
        localStorage.setItem('silver_family', state.family);
        localStorage.setItem('silver_v', String(state.v));
        localStorage.setItem('silver_meds', JSON.stringify(state.meds));
        try { localStorage.setItem('silver_key', medsKeyG(state.v, state.meds)); } catch (e) {}
      }
    } catch (e) {}
  } catch (e) {}
}
function todayLocal() {
  try {
    var n = new Date();
    return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2);
  } catch (e) { return ''; }
}
function copyText(t, msg) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { say($('gPubStatus'), msg || 'Скопировано!'); }).catch(function () { fallbackCopy(t); });
    } else fallbackCopy(t);
  } catch (e) { fallbackCopy(t); }
}
function fallbackCopy(t) {
  try {
    var ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    say($('gPubStatus'), 'Скопировано!');
  } catch (e) { say($('gPubStatus'), 'Не скопировалось, выделите вручную.'); }
}

/* ---------- Список лекарств ---------- */
function renderList() {
  try {
    var ul = $('gList'); if (!ul) return;
    ul.innerHTML = '';
    say($('gVer'), 'v' + state.v);
    if (!state.meds.length) { ul.innerHTML = '<li><div class="grow">Пока пусто. Добавьте первую таблетку ниже.</div></li>'; return; }
    var today = todayLocal();
    state.meds.slice().sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); }).forEach(function (m) {
      try {
        var li = document.createElement('li');
        // сторож: время+10мин прошло, а taken за сегодня нет
        var risk = isRisk(m, today);
        if (risk) li.className = 'risk';
        var d = document.createElement('div');
        d.className = 'dot'; d.style.background = COLORS[m.color] || '#0066FF';
        var g = document.createElement('div'); g.className = 'grow';
        g.innerHTML = '';
        var b = document.createElement('b'); b.textContent = (m.time || '') + ' · ' + (m.name || '');
        var sm = document.createElement('small');
        sm.textContent = (KIND_RU[m.kind] || 'таблетка') + ' · ' + (m.dose || '') + ' · ' + daysLabel(m.days) + ' · ' + (m.id || '') + ((m.voiceBase64 || m.voiceUrl) ? ' · 🎤' : ' · 🔇') + (risk ? ' · ВОЗМОЖНО ПРОПУСК' : '');
        g.appendChild(b); g.appendChild(document.createElement('br')); g.appendChild(sm);
        var del = document.createElement('button');
        del.className = 'del'; del.textContent = 'Удалить'; del.type = 'button';
        del.onclick = function () {
          try {
            state.meds = state.meds.filter(function (x) { return x.id !== m.id; });
            try { var dl = loadJ(K_DEL) || []; if (dl.indexOf(m.id) === -1) { dl.push(m.id); save(K_DEL, JSON.stringify(dl.slice(-200))); } } catch (e) {}
            persist(); renderList(); autoPublish();
          } catch (e) {}
        };
        li.appendChild(d); li.appendChild(g); li.appendChild(del);
        ul.appendChild(li);
      } catch (e) {}
    });
    renderWatch();
  } catch (e) {}
}
function takenToday(medId, today) {
  try {
    return state.journal.some(function (j) { return j.type === 'taken' && j.medId === medId && String(j.at).slice(0, 10) === today; });
  } catch (e) { return false; }
}
function isRisk(m, today) {
  try {
    if (!m.time || !/^\d\d:\d\d$/.test(m.time)) return false;
    try {
      if (m.days && m.days.length < 7 && m.days.indexOf(new Date().getDay()) === -1) return false;
    } catch (e) {}
    var n = new Date();
    if (todayLocal() !== today) return false; // сторож только на сегодня
    var parts = m.time.split(':');
    var t = new Date(); t.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
    if (n.getTime() < t.getTime() + 10 * 60 * 1000) return false;
    return !takenToday(m.id, today);
  } catch (e) { return false; }
}
function renderWatch() {
  try {
    var w = $('gWatch'); if (!w) return;
    var today = todayLocal();
    var risks = state.meds.filter(function (m) { try { return isRisk(m, today); } catch (e) { return false; } });
    if (!risks.length) { w.hidden = true; w.textContent = ''; return; }
    w.hidden = false;
    w.textContent = '⚠️ Возможно пропуск: ' + risks.map(function (m) { return m.name + ' (' + m.time + ')'; }).join(', ') + ' — позвоните!';
  } catch (e) {}
}

/* ---------- Голос: MediaRecorder 32kbps, 7 сек ---------- */
function recUi() {
  try {
    $('vStop').disabled = !rec.mr;
    $('vRec').disabled = !!rec.mr;
    var has = !!(voice.blob || voice.b64 || voice.url);
    $('vPlay').disabled = !has;
    $('vRe').disabled = !has;
  } catch (e) {}
}
function stopTracks() {
  try { if (rec.stream) { rec.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); rec.stream = null; } } catch (e) {}
  try { if (rec.timer) { clearInterval(rec.timer); rec.timer = null; } } catch (e) {}
}
async function startRec() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say($('vStatus'), 'Браузер не даёт микрофон.'); return; }
    var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    var mime = 'audio/webm;codecs=opus';
    try {
      if (window.MediaRecorder && !MediaRecorder.isTypeSupported(mime)) mime = '';
    } catch (e) { mime = ''; }
    var opts = { audioBitsPerSecond: 32000 };
    if (mime) opts.mimeType = mime;
    var mr;
    try { mr = new MediaRecorder(stream, opts); }
    catch (e) { mr = new MediaRecorder(stream); }
    rec.mr = mr; rec.stream = stream; rec.chunks = []; rec.secs = 0;
    mr.ondataavailable = function (ev) { try { if (ev.data && ev.data.size) rec.chunks.push(ev.data); } catch (e) {} };
    mr.onstop = function () { try { onRecStop(); } catch (e) {} };
    mr.start();
    say($('vStatus'), '🔴 Запись... 0 сек (макс 7)');
    rec.timer = setInterval(function () {
      try {
        rec.secs++;
        say($('vStatus'), '🔴 Запись... ' + rec.secs + ' сек (макс 7)');
        if (rec.secs >= 7) stopRec();
      } catch (e) {}
    }, 1000);
    recUi();
  } catch (e) { say($('vStatus'), 'Нет доступа к микрофону.'); stopTracks(); }
}
function stopRec() {
  try { if (rec.mr && rec.mr.state !== 'inactive') rec.mr.stop(); rec.mr = null; } catch (e) { rec.mr = null; }
  try { stopTracks(); recUi(); } catch (e) {}
}
function onRecStop() {
  try {
    var type = 'audio/webm';
    try { type = (rec.chunks[0] && rec.chunks[0].type) || type; } catch (e) {}
    var blob = new Blob(rec.chunks, { type: type });
    voice.blob = blob; voice.mime = type;
    say($('vStatus'), 'Обработка... (' + Math.round(blob.size / 1024) + ' КБ)');
    if (blob.size < VOICE_LIMIT) {
      var fr = new FileReader();
      fr.onload = function () {
        try { voice.b64 = String(fr.result || ''); voice.url = ''; say($('vStatus'), 'Голос внутри пакета ✅ (' + Math.round(blob.size / 1024) + ' КБ)'); recUi(); } catch (e) {}
      };
      fr.onerror = function () { say($('vStatus'), 'Не прочиталось, перезапишите.'); };
      fr.readAsDataURL(blob);
    } else {
      uploadCatbox(blob);
    }
    recUi();
  } catch (e) { say($('vStatus'), 'Ошибка записи, попробуйте ещё.'); }
}
function uploadCatbox(blob) {
  try {
    say($('vStatus'), 'Загрузка на catbox... (файл >90КБ)');
    var fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('time', '72h');
    fd.append('fileToUpload', blob, 'voice.webm');
    fetch('https://catbox.moe/user/api.php', { method: 'POST', body: fd }).then(function (r) { return r.text(); }).then(function (t) {
      try {
        t = (t || '').trim();
        if (t.indexOf('http') === 0) { voice.url = t; voice.b64 = ''; say($('vStatus'), 'Голос по ссылке ✅'); }
        else say($('vStatus'), 'Catbox не принял, перезапишите короче.');
        recUi();
      } catch (e) {}
    }).catch(function () { say($('vStatus'), 'Нет сети для catbox. Перезапишите короче.'); });
  } catch (e) {}
}
function playVoice() {
  try {
    var src = voice.b64 || voice.url;
    if (!src) { say($('vStatus'), 'Голоса нет.'); return; }
    new Audio(src).play().catch(function () { say($('vStatus'), 'Не играет здесь, на телефоне заиграет.'); });
  } catch (e) {}
}
function resetVoice(msg) {
  try {
    voice = { blob: null, b64: '', url: '', mime: '' };
    say($('vStatus'), msg || 'Голоса пока нет.'); recUi();
  } catch (e) {}
}

/* ---------- Публикация и ссылки ---------- */
async function mergeDown() {
  /* Слияние с ящиком: чужое (бот) не затираем, удалённое не воскрешаем */
  try {
    if (!state.family) return;
    var r = await fetch(downUrl() + '/json?poll=1', { cache: 'no-store' });
    if (!r.ok) return;
    var txt = await r.text();
    var best = null;
    parseItems(txt).forEach(function (it) {
      try {
        var raw = it && it.message; if (!raw) return;
        var p = (typeof raw === 'string') ? JSON.parse(raw) : raw;
        if (p && Array.isArray(p.meds) && (best === null || (parseInt(p.v || 0, 10) > parseInt(best.v || 0, 10)))) best = p;
      } catch (e) {}
    });
    if (!best) return;
    var del = loadJ(K_DEL) || [];
    try { // чужие могилки тоже наши
      var rd = best.del || [], chg = false;
      rd.forEach(function (id) { try { if (id && del.indexOf(id) === -1) { del.push(id); chg = true; } } catch (e) {} });
      if (chg) save(K_DEL, JSON.stringify(del.slice(-200)));
    } catch (e) {}
    var byId = {};
    (best.meds || []).forEach(function (m) { try { if (m && m.id && del.indexOf(m.id) === -1) byId[m.id] = m; } catch (e) {} });
    state.meds.forEach(function (m) { try { if (m && m.id) byId[m.id] = m; } catch (e) {} });
    var merged = Object.keys(byId).map(function (k) { return byId[k]; });
    var rv = parseInt(best.v || 0, 10) || 0;
    if (merged.length !== state.meds.length || rv >= state.v) {
      state.meds = merged;
      if (rv >= state.v) state.v = rv;
      persist(); renderList();
    }
  } catch (e) {}
}
async function publish(silent) {
  try {
    if (!state.family) { say($('gPubStatus'), 'Сначала введите код семьи.'); return false; }
    if (!state.meds.length) { say($('gPubStatus'), 'Список пуст.'); return false; }
    try { await mergeDown(); } catch (e) {}
    state.v += 1;
    var ok = false;
    try { // отправка: сначала PUT, если метод режут — запасной POST
      var r = await fetch(downUrl(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet()) });
      try { if (r && r.status === 429) pubCoolUntil = Date.now() + 5 * 60 * 1000; } catch (e) {}
      ok = r.ok;
    } catch (e) { ok = false; }
    if (!ok) {
      try {
        var r2 = await fetch(downUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet()) });
        try { if (r2 && r2.status === 429) pubCoolUntil = Date.now() + 5 * 60 * 1000; } catch (e) {}
        ok = r2.ok;
      } catch (e) { ok = false; }
    }
    if (!ok) state.v -= 1;
    else {
      persist(); save(K_PUB, String(state.v));
      try { // дублируем на короткий топик: сработает и ввод 4 цифр
        var hum = String(state.family).split('-')[0];
        if (hum && hum !== state.family) {
          await fetch('https://ntfy.sh/silvercare-' + encodeURIComponent(hum) + '-down', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet()) });
        }
      } catch (e) {}
    }
    renderList();
    if (!silent) say($('gPubStatus'), ok ? 'Опубликовано ✅ v' + state.v : '⚠️ Нет связи с ntfy, попробуйте позже.');
    return ok;
  } catch (e) { return false; }
}
var qrOpen = false;
function drawQr() {
  try {
    var q = $('gQrBox'); if (!q) return;
    q.innerHTML = '';
    if (!state.family) return;
    if (window.QRCode) new QRCode(q, { text: shortLink(), width: 200, height: 200 });
    else say($('gPubStatus'), 'QR-библиотеке нужен интернет 1 раз.');
  } catch (e) {}
}
function gdiag() {
  try { // техстрока для поддержки: семья, версия, ящик, сборка
    var el = $('gDiag');
    if (el) el.textContent = 'Семья ' + (state.family || '—') + ' • v' + state.v + ' • ' + String((typeof NTFY_BASE === 'string' && NTFY_BASE) || '').replace('https://', '') + ' • ' + BUILD_G;
  } catch (e) {}
}
function showLinksAuto() {
  try {
    var sb = $('gShortBox'), fb = $('gFullBox');
    if (!state.family) {
      if (sb) sb.textContent = 'Сначала введите код семьи в разделе 1.';
      if (fb) fb.textContent = '';
      var q0 = $('gQrBox'); if (q0) q0.innerHTML = '';
      return;
    }
    if (sb) sb.textContent = shortLink();
    if (fb) fb.textContent = fullLink();
    try { if (qrOpen) drawQr(); } catch (e) {}
    try { gdiag(); } catch (e) {}
  } catch (e) {}
}
async function autoPublish() {
  /* Опекуна не грузим: отправка сама после каждого изменения */
  try {
    var ok = await publish(true);
    if (ok) {
      say($('gPubStatus'), 'Отправила сама ✅ v' + state.v + ' — телефон обновится за ~10 сек. Ссылка та же.');
      showLinksAuto();
    } else say($('gPubStatus'), '⚠️ Нет связи, данные сохранены здесь. Отправлю сама, как появится интернет.');
  } catch (e) {}
}
function hmNow(plusMin) {
  try {
    var n = new Date(Date.now() + (plusMin || 0) * 60000);
    return ('0' + n.getHours()).slice(-2) + ':' + ('0' + n.getMinutes()).slice(-2);
  } catch (e) { return '08:00'; }
}

/* ---------- Журнал ВВЕРХ: polling + счётчики + сторож ---------- */
function parseItems(txt) {
  try {
    var items = [], t = (txt || '').trim();
    if (!t) return items;
    try {
      var p = JSON.parse(t);
      items = Array.isArray(p) ? p : [p];
    } catch (e) {
      t.split('\n').forEach(function (ln) { try { ln = ln.trim(); if (ln) items.push(JSON.parse(ln)); } catch (x) {} });
    }
    return items;
  } catch (e) { return []; }
}
function medName(id) {
  try {
    var m = state.meds.filter(function (x) { return x.id === id; })[0];
    return m ? (m.name + ' (' + m.time + ')') : 'лекарство';
  } catch (e) { return 'лекарство'; }
}
function addJournal(type, medId, at, text) {
  try {
    state.journal.unshift({ type: type, medId: medId, at: at, text: text });
    state.journal = state.journal.slice(0, 80);
    persist(); renderJournal(); renderWatch(); renderList();
  } catch (e) {}
}
/* ---------- SOS-РЕЖИМ: вибро + сирена + уведомление + кнопка ПОЗВОНИТЬ ---------- */
var sosCtx = null, sosTimer = null;
function sosAudio() {
  try {
    if (!sosCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      sosCtx = new AC();
    }
    try { var p = sosCtx.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  } catch (e) {}
}
function sosBeep() {
  try {
    sosAudio(); if (!sosCtx) return;
    var o = sosCtx.createOscillator(), g = sosCtx.createGain();
    try { g.gain.value = 1; o.type = 'square'; o.frequency.value = 988; } catch (e) {}
    try { o.connect(g); g.connect(sosCtx.destination); } catch (e) { return; }
    try { o.start(); } catch (e) { return; }
    setTimeout(function () { try { o.stop(); } catch (e) {} }, 700);
  } catch (e) {}
}
function sosSpeak() {
  try {
    if (!('speechSynthesis' in window)) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
    var u = new SpeechSynthesisUtterance('SOS! Бабушка зовёт! Позвони ей!');
    u.lang = 'ru-RU'; u.rate = 0.9; u.volume = 1;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}
function sosVib() {
  try { if (navigator.vibrate) navigator.vibrate([1000, 400, 1000, 400, 1000]); } catch (e) {}
}
function sosNotify() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var o = { body: 'Бабушка нажала SOS! Позвони!', tag: 'silver-sos', requireInteraction: true };
    try { new Notification('SOS ОТ БАБУШКИ!', o); } catch (e) {}
  } catch (e) {}
}
function sosFire() {
  try { sosVib(); sosBeep(); sosSpeak(); sosNotify(); } catch (e) {}
}
function refreshCallBtn() {
  try {
    var ph = '';
    try { ph = (($('gPhone') && $('gPhone').value) || load(K_PH, '') || '').replace(/[^\d+]/g, ''); } catch (e) {}
    var a = $('gCallBtn'), np = $('gNoPhone');
    if (ph && ph.length >= 6) {
      if (a) { a.href = 'tel:' + ph; a.style.display = 'block'; }
      if (np) np.style.display = 'none';
    } else {
      if (a) a.style.display = 'none';
      if (np) np.style.display = 'block';
    }
  } catch (e) {}
}
function startSosMode() {
  try {
    try { save(K_SOS, '1'); } catch (e) {} // ор живёт пока не нажмут Я ПРИНЯЛ, даже через перезагрузку
    var b = $('gSosMode'); if (b) b.hidden = false;
    refreshCallBtn();
    try { if (sosTimer) clearInterval(sosTimer); } catch (e) {}
    sosFire();
    sosTimer = setInterval(function () { try { sosFire(); } catch (e) {} }, 8000);
  } catch (e) {}
}
function stopSosMode() {
  try {
    try { save(K_SOS, ''); } catch (e) {}
    if (sosTimer) { clearInterval(sosTimer); sosTimer = null; }
    var b = $('gSosMode'); if (b) b.hidden = true;
  } catch (e) {}
}
function renderJournal() {
  try {
    var ul = $('gJournal'); if (!ul) return;
    ul.innerHTML = '';
    var t = 0, m = 0, s = 0;
    state.journal.forEach(function (j) {
      try {
        if (j.type === 'taken') t++;
        if (j.type === 'missed') m++;
        if (j.type === 'sos') s++;
        var li = document.createElement('li');
        li.className = j.type;
        li.textContent = String(j.at).slice(0, 16).replace('T', ' ') + ' — ' + j.text;
        ul.appendChild(li);
      } catch (e) {}
    });
    say($('cTaken'), t); say($('cMissed'), m); say($('cSos'), s);
    try { gdiag(); } catch (e) {}
    try { var jc = $('jCount'); if (jc) jc.textContent = state.journal.length; } catch (e) {}
    var al = $('gAlive');
    if (al) {
      if (!state.lastAlive) al.textContent = 'связь: ?';
      else {
        var mins = Math.round((Date.now() - state.lastAlive) / 60000);
        al.textContent = mins <= 60 ? 'связь: ✅ ' + mins + ' мин назад' : 'связь: 🟡 тишина ' + mins + ' мин!';
      }
    }
  } catch (e) {}
}
function routeUpEvent(ev) {
  /* Одно место разбора событий с телефона: и ntfy, и локальное зеркало */
  try {
    if (!ev || !ev.id || state.seen.indexOf(ev.id) !== -1) return;
    if (state.family && ev.family && ev.family !== state.family) return;
    if (!state.family && ev.family) {
      state.family = ev.family;
      try { var fi = $('gFamily'); if (fi) fi.value = state.family; persist(); showLinksAuto(); } catch (e) {}
    }
    state.seen.push(ev.id);
    if (state.seen.length > 300) state.seen = state.seen.slice(-300);
    try { save(K_SEEN, JSON.stringify(state.seen.slice(-300))); } catch (e) {}
    var at = ev.at || new Date().toISOString();
    var hm = String(at).slice(11, 16);
    if (ev.type === 'taken') addJournal('taken', ev.medId, at, '✅ ' + hm + ' Выпила: ' + medName(ev.medId));
    else if (ev.type === 'missed') addJournal('missed', ev.medId, at, '⚠️ ' + hm + ' НЕ выпила: ' + medName(ev.medId) + '! Позвони!');
        else if (ev.type === 'sos') { addJournal('sos', ev.medId, at, '🆘 SOS! Срочно позвони!'); try { startSosMode(); } catch (e) {} }
    else if (ev.type === 'alive') { state.lastAlive = Date.now(); renderJournal(); }
    // reminded: парсим, но молчим
  } catch (e) {}
}
function pullLocalUp() {
  /* Мгновенный журнал со вкладки бабушки на том же адресе */
  try {
    var arr = []; try { arr = JSON.parse(localStorage.getItem('silver_up_log') || '[]'); } catch (e) { arr = []; }
    arr.forEach(function (ev) { try { routeUpEvent(ev); } catch (e) {} });
  } catch (e) {}
}
var upCoolUntil = 0; // backoff: ntfy сказал 429 — не долбим 5 минут
var pubCoolUntil = 0;
async function pollUp() {
  try {
    if (!state.family) return;
    try { if (Date.now() < upCoolUntil) return; } catch (e) {}
    var r = await fetch(upUrl() + '/json?poll=1', { cache: 'no-store' });
    if (r.status === 429) { try { upCoolUntil = Date.now() + 5 * 60 * 1000; } catch (e) {} return; }
    if (!r.ok) return;
    var txt = await r.text();
    parseItems(txt).forEach(function (it) {
      try {
        var raw = it && it.message;
        if (!raw) return;
        var ev = (typeof raw === 'string') ? JSON.parse(raw) : raw;
        routeUpEvent(ev);
      } catch (e) {}
    });
    try { save(K_SEEN, JSON.stringify(state.seen.slice(-300))); } catch (e) {}
  } catch (e) {}
}

/* ---------- Привязка ---------- */
function bind() {
  try {
    $('gFamily').value = state.family;
    $('gFamily').addEventListener('input', function () {
      try { state.family = $('gFamily').value.trim(); persist(); showLinksAuto(); } catch (e) {}
    });
    var gn = $('gNew');
    if (gn) gn.onclick = function () {
      try {
        var mc = $('mvpCode'); if (mc) mc.textContent = state.family || LOCKED_FAMILY;
        var mm = $('mvpPanel'); if (mm) { mm.hidden = false; try { mm.scrollIntoView(); } catch (e) {} }
      } catch (e) {}
    };
    var mo = $('mvpOk');
    if (mo) mo.onclick = function () { try { var mm = $('mvpPanel'); if (mm) mm.hidden = true; } catch (e) {} };
    $('gCheck').onclick = async function () {
      try {
        if (!state.family) { say($('gFamStatus'), 'Введите код семьи.'); return; }
        say($('gFamStatus'), 'Проверяю...');
        var r = await fetch(downUrl() + '/json?poll=1', { cache: 'no-store' });
        var t = await r.text();
        say($('gFamStatus'), (t && t.indexOf('message') !== -1) ? 'В ящике уже есть пакет ✅' : 'Ящик пуст, публикуйте первым.');
        pollUp();
      } catch (e) { say($('gFamStatus'), 'Нет связи.'); }
    };
    $('vRec').onclick = function () { try { startRec(); } catch (e) {} };
    $('vStop').onclick = function () { try { stopRec(); } catch (e) {} };
    $('vPlay').onclick = function () { try { playVoice(); } catch (e) {} };
    $('vRe').onclick = function () { try { resetVoice('Запишите заново:'); startRec(); } catch (e) {} };
    var tq = $('tQuick');
    if (tq) tq.addEventListener('click', function (ev) {
      try {
        var b = ev.target.closest ? ev.target.closest('button[data-t]') : null;
        if (!b) return;
        var k = b.getAttribute('data-t');
        var el = $('fTime'); if (!el) return;
        if (k === 'now') el.value = hmNow(0);
        else if (k === '+1') el.value = hmNow(1);
        else el.value = k;
      } catch (e) {}
    });
    var fd = $('fDays');
    if (fd) fd.addEventListener('click', function (ev) {
      try {
        var b = ev.target.closest ? ev.target.closest('button[data-d]') : null;
        if (!b) return;
        var k = b.getAttribute('data-d');
        if (k === 'all') formDays = [0, 1, 2, 3, 4, 5, 6];
        else {
          var d = parseInt(k, 10);
          var ix = formDays.indexOf(d);
          if (ix === -1) formDays.push(d); else formDays.splice(ix, 1);
          if (!formDays.length) formDays = [0, 1, 2, 3, 4, 5, 6];
        }
        paintDays();
      } catch (e) {}
    });
    paintDays();
    var fk = $('fKind');
    if (fk) fk.addEventListener('change', function () { try { var w = $('fCustomWrap'); if (w) w.hidden = (fk.value !== 'custom'); } catch (e) {} });
    var pv = $('vPreview');
    if (pv) pv.onclick = function () {
      try {
        var o = { kind: $('fKind').value, custom: $('fCustom').value, name: ($('fName').value || '').trim() || 'Лекарство', qty: $('fQty').value, unit: $('fUnit').value, color: $('fColor').value };
        var ph = buildPhrase(o);
        say($('vStatus'), 'Скажет так: «' + ph + '»');
        try { if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(ph); u.lang = 'ru-RU'; u.rate = 0.9; u.volume = 1; window.speechSynthesis.speak(u); } } catch (e) {}
      } catch (e) {}
    };
    $('gAdd').onclick = function () {
      try {
        var name = ($('fName').value || '').trim().slice(0, 60);
        var time = ($('fTime').value || '').trim();
        if (!name) { say($('gPubStatus'), 'Введите название.'); return; }
        if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) { say($('gPubStatus'), 'Время как 08:00.'); return; }
        var kind = 'pill', qty = '1', unit = 'штука', custom = '';
        try { kind = $('fKind').value || 'pill'; qty = $('fQty').value || '1'; unit = $('fUnit').value || 'штука'; custom = ($('fCustom').value || '').trim().slice(0, 80); } catch (e) {}
        var doseStr = '';
        try { var qq = parseFloat(String(qty).replace(',', '.')); doseStr = isNaN(qq) ? '' : (String(qty) + ' ' + unitWordG(unit, qq)); } catch (e) {}
        if (!doseStr) doseStr = '1 штука';
        state.meds.push({ id: 'm' + Date.now(), name: name, time: time,
          dose: doseStr, kind: kind, qty: qty, unit: unit, action: custom, color: $('fColor').value,
          voiceUrl: voice.url || '', voiceBase64: voice.b64 || '' });
        $('fName').value = '';
        resetVoice('Голоса пока нет.');
        formDays = [0, 1, 2, 3, 4, 5, 6]; paintDays();
        persist(); renderList();
        autoPublish();
      } catch (e) {}
    };
    $('gCopyShort').onclick = function () { try { copyText(shortLink(), 'Короткая ссылка скопирована!'); } catch (e) {} };
    $('gCopyFull').onclick = function () { try { copyText(fullLink(), 'Полная ссылка скопирована!'); } catch (e) {} };
    var qb = $('gQrBtn');
    if (qb) qb.onclick = function () {
      try {
        qrOpen = !qrOpen;
        var q = $('gQrBox');
        if (!qrOpen) { if (q) q.innerHTML = ''; qb.textContent = '🔳 Показать QR'; return; }
        drawQr();
        qb.textContent = '🔳 Скрыть QR';
      } catch (e) {}
    };
    var snd = $('gSendNow');
    if (snd) snd.onclick = function () { try { autoPublish(); } catch (e) {} };
    $('gDemo').onclick = async function () {
      try {
        if (!state.meds.length) {
          state.meds.push({ id: 'm' + Date.now(), name: 'Давление', time: '08:00', dose: '1 шт', color: 'blue', voiceUrl: '', voiceBase64: '' });
        }
        var n = new Date(Date.now() + 60000);
        state.meds[0].time = ('0' + n.getHours()).slice(-2) + ':' + ('0' + n.getMinutes()).slice(-2);
        persist(); renderList();
        var ok = await publish(true);
        showLinksAuto();
        say($('gPubStatus'), ok ? '🧪 Демо: аларм через минуту (' + state.meds[0].time + '), v' + state.v : '⚠️ Нет связи с ntfy.');
      } catch (e) {}
    };
    try { window.addEventListener('storage', function (ev) { try { if (ev && ev.key === 'silver_up_log') pullLocalUp(); } catch (e) {} }); } catch (e) {}
    try { window.addEventListener('online', function () { try { var pv = parseInt(load(K_PUB, '0'), 10) || 0; if (state.v > pv && state.meds.length) autoPublish(); pollUp(); } catch (e) {} }); } catch (e) {}
    var phn = $('gPhone');
    if (phn) { phn.value = load(K_PH, ''); phn.addEventListener('input', function () { try { save(K_PH, phn.value); refreshCallBtn(); } catch (e) {} }); }
    refreshCallBtn();
    var ack = $('gSosAck'); if (ack) ack.onclick = function () { try { stopSosMode(); say($('gPubStatus'), 'SOS принят. Тихо.'); } catch (e) {} };
    try { document.addEventListener('pointerdown', function unlock() { try { sosAudio(); } catch (e) {} try { document.removeEventListener('pointerdown', unlock); } catch (e) {} }); } catch (e) {}
    try { if ('Notification' in window && Notification.permission === 'default' && Notification.requestPermission) Notification.requestPermission().catch(function () {}); } catch (e) {}
    var watchNote = null;
    try {
      document.addEventListener('visibilitychange', function () {
        try {
          if (document.hidden) {
            try {
              if ('Notification' in window && Notification.permission === 'granted') {
                try { if (watchNote) watchNote.close(); } catch (e) {}
                watchNote = new Notification('SilverCare следит', { body: 'Вкладка свёрнута. SOS от бабушки придёт сюда.', tag: 'g-watch', silent: true });
              }
            } catch (e) {}
          } else {
            try { if (watchNote) { watchNote.close(); watchNote = null; } } catch (e) {}
            try { var pvw = parseInt(load(K_PUB, '0'), 10) || 0; if (state.v > pvw && state.meds.length) autoPublish(); } catch (e) {}
            try { pollUp().then(function () { renderJournal(); }); } catch (e) {}
          }
        } catch (e) {}
      });
    } catch (e) {}
    var gpl = $('gPull');
    if (gpl) gpl.onclick = async function () {
      try {
        if (!state.family) { say($('gPubStatus'), 'Сначала введи код семьи.'); return; }
        say($('gPubStatus'), 'Тяну расписание...');
        var r = await fetch(downUrl() + '/json?poll=1', { cache: 'no-store' });
        if (!r.ok) { say($('gPubStatus'), 'Нет связи.'); return; }
        var txt = await r.text();
        var best = null;
        parseItems(txt).forEach(function (it) {
          try {
            var raw = it && it.message; if (!raw) return;
            var p = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            if (p && Array.isArray(p.meds) && (best === null || (parseInt(p.v || 0, 10) > parseInt(best.v || 0, 10)))) best = p;
          } catch (e) {}
        });
        if (!best) { say($('gPubStatus'), 'В ящике пусто.'); return; }
        state.meds = best.meds || [];
        state.v = parseInt(best.v || 0, 10) || 0;
        try { save(K_DEL, JSON.stringify((best.del || []).slice(-200))); } catch (e) {}
        try { save(K_PUB, String(state.v)); } catch (e) {}
        persist(); renderList(); showLinksAuto();
        say($('gPubStatus'), 'Подтянул ✅ v' + state.v + ': ' + state.meds.length + ' шт.');
      } catch (e) { say($('gPubStatus'), 'Не вышло.'); }
    };
    var gt = $('gTheme');
    if (gt) gt.onclick = function () { try { themeNext(); } catch (e) {} };
    themePaint();
    $('gPoll').onclick = function () { try { pollUp().then(function () { renderJournal(); }); } catch (e) {} };
    var tst = $('gTest');
    if (tst) tst.onclick = function () { try { sosFire(); say($('gPubStatus'), 'Проверка: вибро + звук + баннер. Почувствовал?'); } catch (e) {} };
  } catch (e) {}
}

function themeCur() { try { return document.documentElement.getAttribute('data-theme') || 'light'; } catch (e) { return 'light'; } }
function themePaint() {
  try {
    var t = themeCur(), b = $('gTheme');
    if (b) b.textContent = t === 'dark' ? '☀️ Светлая' : '🌙 Тёмная';
  } catch (e) {}
}
function themeNext() {
  try {
    var nx = themeCur() === 'dark' ? 'light' : 'dark';
    if (nx === 'light') {
      try { document.documentElement.removeAttribute('data-theme'); } catch (e) {}
      try { localStorage.removeItem('guardian_theme'); } catch (e) {}
    } else {
      try { document.documentElement.setAttribute('data-theme', 'dark'); } catch (e) {}
      try { localStorage.setItem('guardian_theme', 'dark'); } catch (e) {}
    }
    themePaint();
  } catch (e) {}
}
function init() {
  try {
    try { if (LOCKED_FAMILY) { state.family = LOCKED_FAMILY; persist(); } } catch (e) {}
    bind(); renderList(); renderJournal(); showLinksAuto(); recUi();
    try { if ($('fTime') && !$('fTime').value) $('fTime').value = '08:00'; } catch (e) {}
    try { if (load(K_SOS, '') === '1') startSosMode(); } catch (e) {} // SOS не снят кнопкой — продолжаем орать
    pullLocalUp();
    try { var pv0 = parseInt(load(K_PUB, '0'), 10) || 0; if (state.v > pv0 && state.meds.length) autoPublish(); } catch (e) {}
    pollUp();
    setInterval(function () { try { pollUp(); } catch (e) {} }, 5000);
    try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('guardian-sw.js').catch(function () {}); } catch (e) {}
    try { // новая версия сайта — обновиться самому, если не пишем и не орём
      if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(function (reg) {
        try {
          if (reg.addEventListener) reg.addEventListener('updatefound', function () {
            try {
              var nw = reg.installing;
              if (nw && nw.addEventListener) nw.addEventListener('statechange', function () {
                try {
                  if (nw.state !== 'activated' || sosTimer) return;
                  var ae = null;
                  try { ae = document.activeElement; } catch (e) {}
                  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return;
                  window.location.reload();
                } catch (e) {}
              });
            } catch (e) {}
          });
        } catch (e) {}
      }).catch(function () {});
    } catch (e) {}
    setInterval(function () { try { renderJournal(); renderWatch(); } catch (e) {} try { var pv = parseInt(load(K_PUB, '0'), 10) || 0; if (state.v > pv && state.meds.length && Date.now() > pubCoolUntil) autoPublish(); } catch (e) {} try { var v0 = state.v; mergeDown().then(function () { try { if (state.v > v0) { renderList(); showLinksAuto(); say($('gPubStatus'), 'Подтянул сам ✅ v' + state.v); } } catch (e) {} }); } catch (e) {} }, 30000);
  } catch (e) {}
}
try {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
} catch (e) {}
})();
