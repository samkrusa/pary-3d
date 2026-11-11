/* Пары 3D — расписание КНИТУ
   Логика данных и команд сохранены как в проекте «Пары»;
   оформление, анимации и фоновая сцена — оригинальные. */

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн",
    "июл", "авг", "сен", "окт", "ноя", "дек"];

  const DESKTOP_MQ = window.matchMedia("(min-width: 1000px)");
  const REDUCED_MQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const FINE_POINTER = window.matchMedia("(hover: hover) and (pointer: fine)");

  const TYPE_STYLE = {
    "ЛЕКЦ": ["#64f0d8", "rgba(100, 240, 216, .14)"],
    "ПЗ": ["#7fd3ff", "rgba(127, 211, 255, .14)"],
    "ЛР": ["#ffc26b", "rgba(255, 194, 107, .14)"],
    "КСР": ["#9d8cff", "rgba(157, 140, 255, .14)"],
    "СРС": ["#a8b6d4", "rgba(168, 182, 212, .13)"],
    "МК": ["#5fe0c8", "rgba(95, 224, 200, .14)"],
    "УП": ["#ff9f7a", "rgba(255, 159, 122, .14)"],
  };

  const BUILDINGS = {
    "А": { name: "Корпус А", address: "ул. Карла Маркса, 68", lat: 55.7944756, lon: 49.1381967 },
    "Б": { name: "Корпус Б", address: "ул. Карла Маркса, 72", lat: 55.7939835, lon: 49.1415543 },
    "В": { name: "Корпус В", address: "ул. Карла Маркса, 72", lat: 55.7939835, lon: 49.1415543 },
    "О": { name: "Корпус О", address: "ул. Карла Маркса, 72", lat: 55.7939835, lon: 49.1415543 },
    "Г": { name: "Корпус Г", address: "ул. Попова, 10", lat: 55.8095609, lon: 49.1843710 },
    "Д": { name: "Корпус Д", address: "Сибирский тракт, 12", lat: 55.8077859, lon: 49.1846024 },
    "Е": { name: "Корпус Е", address: "Сибирский тракт, 12", lat: 55.8077859, lon: 49.1846024 },
    "Л": { name: "Корпус Л", address: "Сибирский тракт, 12", lat: 55.8077859, lon: 49.1846024 },
    "М": { name: "Корпус М", address: "Сибирский тракт, 12", lat: 55.8077859, lon: 49.1846024 },
  };

  const state = {
    meta: null,
    institutes: [],
    groupsByInst: new Map(),
    allGroups: null,
    group: null,
    data: null,
    weekOffset: 0,
    day: null,
    loading: false,
    sheetInst: null,
    sheetQuery: "",
  };

  /* ── Утилиты ─────────────────────────────────────────── */

  const pad = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const mondayOf = (d) => {
    const x = new Date(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const safeSlug = (v) => typeof v === "string" && /^[a-z0-9-]+$/.test(v);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  function parityOf(dateStr) {
    const anchor = state.meta ? parseISO(state.meta.anchor) : new Date(2026, 10, 2);
    const anchorEven = state.meta ? !!state.meta.anchorEven : true;
    const weeks = Math.round((mondayOf(parseISO(dateStr)) - anchor) / 604800000);
    const even = weeks % 2 === 0 ? anchorEven : !anchorEven;
    return even ? 2 : 1;
  }

  function fmtRange(mon) {
    const sat = addDays(mon, 5);
    const a = mon.getMonth();
    const b = sat.getMonth();
    return a === b
      ? `${mon.getDate()} – ${sat.getDate()} ${MONTHS[a]}`
      : `${mon.getDate()} ${MONTHS_SHORT[a]} – ${sat.getDate()} ${MONTHS_SHORT[b]}`;
  }

  const toMin = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("is-on"), 2000);
  }

  /* ── Загрузка данных ─────────────────────────────────── */

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function cachedJSON(url, key) {
    try {
      const data = await fetchJSON(url);
      try {
        localStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
      } catch (_) { /* переполнение — не страшно */ }
      return data;
    } catch (err) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try { return JSON.parse(raw).data; } catch (_) { /* ignore */ }
      }
      throw err;
    }
  }

  async function boot() {
    wireUI();
    initMotion();
    initScene();

    try {
      const idx = await cachedJSON("data/index.json", "idx");
      state.meta = idx.meta;
      state.institutes = idx.institutes || [];
    } catch (_) {
      state.meta = { anchor: "2026-11-02", anchorEven: true, generated: "", semester: "" };
      state.institutes = [];
    }

    const total = state.institutes.reduce((s, i) => s + (i.n || 0), 0);
    animateNumber($("#statGroups"), total || 0, 0);
    const sem = $("#heroSemester");
    if (sem) sem.textContent = (state.meta && state.meta.semester) || "расписание КНИТУ";

    let saved = readSavedGroup();
    if (!saved) {
      const cookieFile = readGroupCookie();
      if (cookieFile) saved = await findGroupByFile(cookieFile);
    }
    if (saved) {
      await selectGroup(saved, { silent: true });
    } else {
      const hash = new URLSearchParams(location.hash.slice(1)).get("g");
      if (hash) {
        const g = await findGroupByFile(hash);
        if (g) await selectGroup(g, { silent: true });
      }
    }

    if (!state.group) openSheet();
    render();
  }

  function readSavedGroup() {
    try {
      const raw = localStorage.getItem("group");
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  const GROUP_COOKIE = "pary_group";

  function writeGroupCookie(file) {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = GROUP_COOKIE + "=" + encodeURIComponent(file) +
      "; Max-Age=31536000; Path=/; SameSite=Lax" + secure;
  }

  function readGroupCookie() {
    const m = document.cookie.match(new RegExp("(?:^|; )" + GROUP_COOKIE + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function findGroupByFile(file) {
    for (const inst of state.institutes) {
      const groups = await loadInstitute(inst.id).catch(() => []);
      const hit = groups.find((g) => g.file === file);
      if (hit) return hit;
    }
    return null;
  }

  async function loadInstitute(id) {
    if (state.groupsByInst.has(id)) return state.groupsByInst.get(id);
    const inst = state.institutes.find((x) => x.id === id);
    if (!inst) return [];
    const arr = await cachedJSON(`data/i/${inst.file}.json`, `i:${inst.file}`);
    const withInst = arr.map((g) => ({ ...g, i: id, in: inst.name }));
    state.groupsByInst.set(id, withInst);
    return withInst;
  }

  async function loadAllGroups() {
    if (state.allGroups) return state.allGroups;
    const lists = await Promise.all(
      state.institutes.map((i) => loadInstitute(i.id).catch(() => []))
    );
    state.allGroups = lists.flat();
    return state.allGroups;
  }

  async function selectGroup(g, opts = {}) {
    if (!g || !safeSlug(g.file)) {
      toast("Некорректная группа");
      return;
    }
    state.group = g;
    state.loading = true;
    render();
    try {
      state.data = await cachedJSON(`data/g/${g.file}.json`, `g:${g.file}`);
    } catch (_) {
      state.data = null;
      toast("Не удалось загрузить расписание");
    }
    state.loading = false;
    state.weekOffset = 0;
    state.day = isoOf(new Date());
    try {
      localStorage.setItem("group", JSON.stringify(g));
    } catch (_) { /* ignore */ }
    writeGroupCookie(g.file);
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    history.replaceState(null, "", `#g=${g.file}`);
    render();
    if (!opts.silent) toast(`${g.g} · сохранено`);
  }

  /* ── Рендер ──────────────────────────────────────────── */

  function currentMonday() {
    return addDays(mondayOf(new Date()), state.weekOffset * 7);
  }

  function lessonsFor(dateStr) {
    if (!state.data) return [];
    const wd = ((parseISO(dateStr).getDay() + 6) % 7) + 1;
    const par = parityOf(dateStr);
    return state.data.s
      .filter((l) => l.d === wd && dateStr >= l.f && dateStr <= l.u && (l.w === 0 || l.w === par))
      .sort((a, b) => a.b.localeCompare(b.b));
  }

  function dayHas(dateStr) {
    return lessonsFor(dateStr).length > 0;
  }

  function render() {
    const off = $("#offline");
    if (off) off.hidden = navigator.onLine;
    renderHeader();
    renderWeek();
    renderStatus();
    renderDays();
    renderContent();
    renderFoot();
    renderStats();
    const btn = $("#groupBtn");
    if (btn) btn.disabled = state.loading && !state.group;
    bindTilt();
  }

  function renderHeader() {
    const name = state.group ? state.group.g : "Выбрать группу";
    $("#groupName").textContent = name;
    const course = state.group && state.group.k ? ` · ${state.group.k} курс` : "";
    $("#groupSub").textContent = state.group
      ? `${state.group.i}${course}`
      : "КНИТУ · расписание";
    document.title = state.group ? `${state.group.g} — Пары 3D` : "Пары 3D — расписание КНИТУ";

    const heroName = $("#heroGroup");
    if (heroName) heroName.textContent = state.group ? state.group.g : "Расписание";
    const heroInst = $("#heroInst");
    if (heroInst) {
      heroInst.textContent = state.group
        ? `${state.group.in || state.group.i}${course}`
        : "КНИТУ · группы, преподаватели, аудитории";
    }
    const share = $("#shareBtn");
    if (share) share.hidden = !state.group;
  }

  function renderStats() {
    const mon = currentMonday();
    let week = 0;
    for (let i = 0; i < 7; i++) week += lessonsFor(isoOf(addDays(mon, i))).length;
    animateNumber($("#statToday"), lessonsFor(isoOf(new Date())).length, 0);
    animateNumber($("#statWeek"), week, 0);
  }

  function animateNumber(el, value, delay) {
    if (!el) return;
    const from = Number(el.dataset.v || 0);
    const to = Number(value) || 0;
    el.dataset.v = String(to);
    if (from === to) { el.textContent = String(to); return; }
    if (REDUCED_MQ.matches) { el.textContent = String(to); return; }
    const dur = 620;
    const t0 = performance.now() + (delay || 0);
    const step = (now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderWeek() {
    const mon = currentMonday();
    const today = isoOf(new Date());
    const inWeek = today >= isoOf(mon) && today <= isoOf(addDays(mon, 6));
    $("#weekLabel").innerHTML =
      `<span class="week-dates">${esc(fmtRange(mon))}</span>` +
      `<span class="week-parity">${parityOf(isoOf(mon)) === 2 ? "чётная" : "нечётная"} неделя${inWeek ? " · текущая" : ""}</span>`;
  }

  function renderDays() {
    const mon = currentMonday();
    const today = isoOf(new Date());
    if (!state.day || state.day < isoOf(mon) || state.day > isoOf(addDays(mon, 6))) {
      state.day = today >= isoOf(mon) && today <= isoOf(addDays(mon, 6))
        ? today : isoOf(mon);
    }
    const wrap = $("#days");
    wrap.innerHTML = "";
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i);
      const ds = isoOf(d);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "day";
      b.dataset.date = ds;
      if (ds === today) b.classList.add("is-today");
      if (ds === state.day) {
        b.classList.add("is-active");
        b.setAttribute("aria-current", "date");
      }
      if (state.data && dayHas(ds)) b.classList.add("has");
      b.innerHTML = `<span class="dow">${DOW[i]}</span><span class="num">${d.getDate()}</span><span class="dot"></span>`;
      b.addEventListener("click", () => {
        state.day = ds;
        renderDays();
        renderContent();
      });
      wrap.appendChild(b);
    }
    const active = wrap.querySelector(".is-active");
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function typeStyle(t) {
    return TYPE_STYLE[t] || ["#a8b6d4", "rgba(168, 182, 212, .13)"];
  }

  function subLabel(x) {
    if (!x) return "";
    const m = x.match(/(\d+([.,]\d+)?\s*(?:подгр|п\/г|гр))/i);
    if (m) return m[1].replace(/\s+/g, " ");
    if (/крзал/i.test(x)) return "";
    return "";
  }

  function renderContent() {
    const box = $("#content");
    if (state.loading) {
      box.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
      return;
    }
    if (state.group && !state.data) {
      box.innerHTML = `
        <div class="empty">
          <div class="emoji">📡</div>
          <div class="title">Не удалось загрузить</div>
          <div class="hint">Проверь интернет и попробуй ещё раз.</div>
          <button class="btn-primary" type="button" id="retry">Повторить</button>
        </div>`;
      const r = $("#retry");
      if (r) r.addEventListener("click", () => selectGroup(state.group, { silent: true }));
      return;
    }

    if (!state.group || !state.data) {
      box.innerHTML = `
        <div class="welcome">
          <div class="big">🛰️</div>
          <h2>Расписание в глубину</h2>
          <p>Выбери свою группу — пары, преподаватели и аудитории появятся здесь объёмными карточками. Работает и без сети.</p>
          <button class="btn-primary" type="button" id="pickGroup">Выбрать группу</button>
        </div>`;
      const btn = $("#pickGroup");
      if (btn) btn.addEventListener("click", openSheet);
      return;
    }

    if (DESKTOP_MQ.matches) {
      renderWeekGrid(box);
      return;
    }

    const list = lessonsFor(state.day);
    if (!list.length) {
      box.innerHTML = `
        <div class="empty">
          <div class="emoji">${state.day === isoOf(new Date()) ? "☕" : "🌿"}</div>
          <div class="title">Пар нет</div>
          <div class="hint">${state.day === isoOf(new Date()) ? "Сегодня можно выдохнуть." : "Свободный день — хорошее время для конспектов."}</div>
        </div>`;
      return;
    }

    const today = isoOf(new Date());
    const isToday = state.day === today;
    const now = nowMinutes();
    box.innerHTML = list.map((l, i) => {
      const [fg, bg] = typeStyle(l.t);
      const start = toMin(l.b);
      const end = toMin(l.e);
      const live = isToday && now >= start && now <= end;
      const past = isToday && now > end;
      const sub = subLabel(l.x);
      return `
        <article class="lesson tilt${live ? " is-now" : ""}${past ? " is-past" : ""}"
                 style="--type-color:${fg};--type-bg:${bg};--i:${i}">
          ${live ? '<span class="now-badge"><i></i>сейчас</span>' : ""}
          <div class="time">
            <div class="start">${esc(l.b)}</div>
            <div class="end">${esc(l.e)}</div>
          </div>
          <div class="body">
            <div class="subject">${esc(l.n)}</div>
            <div class="meta">
              <span class="type">${esc(l.t)}</span>
              ${l.st ? `<span class="status-badge">${esc(l.st)}</span>` : ""}
              ${l.r ? `<span class="room">${esc(l.r)}</span>` : ""}
              ${l.p ? `<span class="teacher">${esc(l.p)}</span>` : ""}
              ${sub ? `<span class="sub">${esc(sub)}</span>` : ""}
            </div>
          </div>
        </article>`;
    }).join("");

    box.querySelectorAll(".lesson").forEach((el, i) => bindLesson(el, list[i], state.day));
  }

  function slotCard(l, isToday) {
    const [fg, bg] = typeStyle(l.t);
    const live = isToday && nowMinutes() >= toMin(l.b) && nowMinutes() <= toMin(l.e);
    const past = isToday && nowMinutes() > toMin(l.e);
    const sub = subLabel(l.x);
    return `
      <article class="slot${live ? " is-now" : ""}${past ? " is-past" : ""}"
               style="--type-color:${fg};--type-bg:${bg}">
        ${live ? '<span class="slot-now">сейчас</span>' : ""}
        <div class="slot-time"><b>${esc(l.b)}</b><span>${esc(l.e)}</span></div>
        <div class="slot-subject">${esc(l.n)}</div>
        <div class="slot-meta">
          <span class="type">${esc(l.t)}</span>
          ${l.st ? `<span class="status-badge">${esc(l.st)}</span>` : ""}
          ${l.r ? `<span class="room">${esc(l.r)}</span>` : ""}
        </div>
        ${l.p ? `<div class="slot-teacher">${esc(l.p)}</div>` : ""}
        ${sub ? `<div class="slot-sub">${esc(sub)}</div>` : ""}
      </article>`;
  }

  function renderWeekGrid(box) {
    const mon = currentMonday();
    const today = isoOf(new Date());
    const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    const showSunday = lessonsFor(isoOf(days[6])).length > 0;
    const count = showSunday ? 7 : 6;

    let html = `<div class="weekgrid" style="--cols:${count}">`;
    for (let i = 0; i < count; i++) {
      const d = days[i];
      const ds = isoOf(d);
      const list = lessonsFor(ds);
      const isToday = ds === today;
      html += `
        <section class="daycol${isToday ? " is-today" : ""}" data-date="${ds}" style="--ci:${i}">
          <header class="daycol-head">
            <span class="dow">${DOW[i]}</span>
            <span class="num">${d.getDate()}</span>
            <span class="mon">${MONTHS_SHORT[d.getMonth()]}</span>
          </header>
          ${list.length
            ? list.map((l) => slotCard(l, isToday)).join("")
            : '<div class="daycol-empty">нет пар</div>'}
        </section>`;
    }
    html += "</div>";
    box.innerHTML = html;

    box.querySelectorAll(".daycol").forEach((col) => {
      const ds = col.dataset.date;
      const items = lessonsFor(ds);
      col.querySelectorAll(".slot").forEach((el, i) => bindLesson(el, items[i], ds));
    });
  }

  function buildingFor(room) {
    if (!room) return null;
    const m = room.match(/^\s*([А-ЯЁ])-/);
    const letter = m ? m[1] : (/круглый/i.test(room) ? "А" : null);
    return letter ? BUILDINGS[letter] || null : null;
  }

  function mapUrl(b) {
    return "https://yandex.ru/maps/?ll=" + b.lon + "%2C" + b.lat +
      "&pt=" + b.lon + "%2C" + b.lat + ",pm2rdm&z=17&l=map";
  }

  function fmtDay(iso) {
    const d = parseISO(iso);
    return d.getDate() + " " + MONTHS[d.getMonth()];
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) { /* fallback */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  function bindLesson(el, l, dateStr) {
    if (!l) return;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", l.b + " " + l.n + (l.r ? ", аудитория " + l.r : ""));
    el.addEventListener("click", () => openLesson(l, dateStr));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLesson(l, dateStr);
      }
    });
  }

  function openLesson(l, dateStr) {
    const dt = parseISO(dateStr);
    const dow = DOW[(dt.getDay() + 6) % 7];
    const dateLabel = dow + ", " + dt.getDate() + " " + MONTHS[dt.getMonth()];
    const [fg, bg] = typeStyle(l.t);
    const b = buildingFor(l.r);
    const sub = subLabel(l.x);
    const parity = l.w === 0 ? "каждую неделю" : l.w === 1 ? "нечётная неделя" : "чётная неделя";
    const status = l.st ? `<span class="status-badge">${esc(l.st)}</span>` : "";
    const map = b
      ? `<a class="lm-btn" href="${mapUrl(b)}" target="_blank" rel="noopener">Открыть на карте</a>`
      : "";

    $("#lessonBody").innerHTML = `
      <h2 class="lm-title" id="lessonTitle">${esc(l.n)}</h2>
      <div class="lm-sub">
        <span class="type" style="--type-color:${fg};--type-bg:${bg}">${esc(l.t)}</span>
        ${status}
        <span>${esc(dateLabel)} · ${esc(l.b)}–${esc(l.e)}</span>
      </div>
      <dl class="lm-rows">
        ${l.r ? `<div class="lm-row"><dt>Аудитория</dt><dd>${esc(l.r)}</dd></div>` : ""}
        ${b ? `<div class="lm-row"><dt>Корпус</dt><dd>${esc(b.name)}, ${esc(b.address)}</dd></div>` : ""}
        ${l.p ? `<div class="lm-row"><dt>Преподаватель</dt><dd>${esc(l.p)}</dd></div>` : ""}
        ${sub ? `<div class="lm-row"><dt>Подгруппа</dt><dd>${esc(sub)}</dd></div>` : ""}
        <div class="lm-row"><dt>Период</dt><dd>${esc(fmtDay(l.f))} – ${esc(fmtDay(l.u))}</dd></div>
        <div class="lm-row"><dt>Неделя</dt><dd>${parity}</dd></div>
        <div class="lm-row"><dt>Статус</dt><dd>${l.st ? esc(l.st) : "не отмечено"}</dd></div>
      </dl>
      <div class="lm-actions">
        ${l.r ? '<button class="lm-btn is-primary" type="button" id="lmCopyRoom">Скопировать аудиторию</button>' : ""}
        ${map}
      </div>
      <p class="lm-note">Если вуз укажет отмену или перенос в расписании, здесь появится отметка. Аудиторию всегда стоит сверять с деканатом.</p>
    `;

    const modal = $("#lessonModal");
    modal._lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    const card = modal.querySelector(".modal-card");
    if (card) card.focus();

    const btn = $("#lmCopyRoom");
    if (btn) {
      btn.addEventListener("click", async () => {
        const ok = await copyText(l.r);
        toast(ok ? "Аудитория скопирована" : "Не удалось скопировать");
      });
    }
  }

  function closeLesson() {
    const modal = $("#lessonModal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    const back = modal._lastFocus;
    if (back && typeof back.focus === "function") back.focus();
  }

  function renderStatus() {
    const el = $("#updated");
    const g = state.meta && state.meta.generated;
    if (!g) { el.hidden = true; return; }
    const d = new Date(g);
    if (Number.isNaN(d.getTime())) { el.hidden = true; return; }
    const hours = (Date.now() - d.getTime()) / 3600000;
    const stale = hours > 48;
    el.hidden = false;
    el.classList.toggle("is-stale", stale);
    el.querySelector("span").textContent =
      "Обновлено " + d.getDate() + " " + MONTHS[d.getMonth()] + ", " +
      pad(d.getHours()) + ":" + pad(d.getMinutes()) +
      (stale ? " · данные могли устареть" : "");
  }

  function renderFoot() {
    const g = state.meta && state.meta.generated;
    const upd = g ? ` · обновлено ${esc(fmtDay(g.slice(0, 10)))}` : "";
    $("#foot").innerHTML =
      `Данные: <a href="https://www.kstu.ru" target="_blank" rel="noopener">kstu.ru</a>${upd}` +
      `<br><span class="foot-legal">Оформление — 3D-версия проекта ` +
      `<a href="https://samkrusa.github.io/pary/" target="_blank" rel="noopener">«Пары»</a>. ` +
      `Неофициальный студенческий проект, не связан с КНИТУ.</span>`;
  }

  /* ── Выбор группы ────────────────────────────────────── */

  let scrollToCurrent = false;

  function openSheet() {
    const sheet = $("#sheet");
    sheet.hidden = false;
    scrollToCurrent = true;
    document.body.style.overflow = "hidden";
    state.sheetInst = state.group ? state.group.i : undefined;
    state.sheetQuery = "";
    $("#searchInput").value = "";
    renderChips();
    renderGroupList();
    sheet._lastFocus = document.activeElement;
    setTimeout(() => {
      const panel = sheet.querySelector(".sheet-panel");
      if (panel) panel.focus();
    }, 120);
  }

  function closeSheet() {
    const sheet = $("#sheet");
    sheet.hidden = true;
    document.body.style.overflow = "";
    const back = sheet._lastFocus;
    if (back && typeof back.focus === "function") back.focus();
  }

  function trapFocus(e) {
    if (e.key !== "Tab") return;
    const sheet = $("#sheet");
    if (sheet.hidden) return;
    const panel = sheet.querySelector(".sheet-panel");
    if (!panel) return;
    const items = [...panel.querySelectorAll("button, input, a[href], [tabindex]:not([tabindex='-1'])")]
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function renderChips() {
    const wrap = $("#instChips");
    const chips = [{ id: null, name: "Все" }, ...state.institutes.map((i) => ({ id: i.id, name: i.id }))];
    wrap.innerHTML = chips.map((c) =>
      `<button class="chip${state.sheetInst === c.id ? " is-active" : ""}" type="button" data-inst="${esc(c.id ?? "")}">${esc(c.name)}</button>`
    ).join("");
    wrap.querySelectorAll(".chip").forEach((el) => {
      el.addEventListener("click", () => {
        state.sheetInst = el.dataset.inst || null;
        renderChips();
        renderGroupList();
      });
    });
    if (scrollToCurrent) {
      const act = wrap.querySelector(".chip.is-active");
      if (act) {
        const ar = act.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        wrap.scrollLeft += ar.left - wr.left - (wr.width - ar.width) / 2;
      }
    }
  }

  async function renderGroupList() {
    const list = $("#groupList");

    if (state.sheetInst === undefined && !state.sheetQuery.trim()) {
      list.innerHTML = '<div class="pick-hint"><b>Выбери институт</b><span>или введи номер группы — например, 861</span></div>';
      return;
    }

    list.innerHTML = '<div class="course-title">Загрузка…</div>';
    let groups;
    try {
      groups = state.sheetInst ? await loadInstitute(state.sheetInst) : await loadAllGroups();
    } catch (_) {
      list.innerHTML = '<div class="course-title">Не удалось загрузить список групп</div>';
      return;
    }

    const q = state.sheetQuery.trim().toLowerCase();
    if (q) {
      groups = groups.filter((g) =>
        g.g.toLowerCase().includes(q) || (g.in || "").toLowerCase().includes(q));
    }
    if (!groups.length) {
      list.innerHTML = '<div class="course-title">Ничего не нашлось</div>';
      return;
    }

    const byCourse = new Map();
    for (const g of groups) {
      const k = g.k || 0;
      if (!byCourse.has(k)) byCourse.set(k, []);
      byCourse.get(k).push(g);
    }

    let html = "";
    for (const k of [...byCourse.keys()].sort((a, b) => a - b)) {
      html += `<div class="course-title">${k ? k + " курс" : "Другое"}</div>`;
      for (const g of byCourse.get(k)) {
        const badge = g.l === "магистратура" ? "маг" : g.l === "специалитет" ? "спец" : "бак";
        const cur = state.group && state.group.file === g.file;
        html += `
          <button class="group-row${cur ? " is-current" : ""}" type="button" data-file="${esc(g.file)}">
            <span class="g-name">${esc(g.g)}</span>
            <span class="g-badge">${badge}</span>
            <span class="g-sub">${esc(g.f === "заоч" ? "заоч" : "очн")}${state.sheetInst ? "" : " · " + esc(g.i)}</span>
          </button>`;
      }
    }
    list.innerHTML = html;
    if (scrollToCurrent) {
      scrollToCurrent = false;
      const cur = list.querySelector(".group-row.is-current");
      if (cur) {
        const cr = cur.getBoundingClientRect();
        const lr = list.getBoundingClientRect();
        const top = cr.top - lr.top + list.scrollTop;
        list.scrollTop = top - list.clientHeight / 2 + cur.offsetHeight / 2;
      }
    }

    list.querySelectorAll(".group-row").forEach((el) => {
      el.addEventListener("click", async () => {
        const file = el.dataset.file;
        let g = groups.find((x) => x.file === file);
        if (!g) return;
        if (!g.i) g = (await findGroupByFile(file)) || g;
        closeSheet();
        await selectGroup(g);
      });
    });
  }

  /* ── Живой интерфейс: наклон и подсветка ─────────────── */

  const tiltState = new WeakMap();

  function bindTilt() {
    if (!FINE_POINTER.matches || REDUCED_MQ.matches) return;
    $$(".tilt").forEach((el) => {
      if (tiltState.get(el)) return;
      tiltState.set(el, true);

      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5;
        const py = (e.clientY - r.top) / r.height - .5;
        const rx = (-py * 7).toFixed(2);
        const ry = (px * 9).toFixed(2);
        el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px)`;
        el.style.setProperty("--mx", `${(px + .5) * 100}%`);
        el.style.setProperty("--my", `${(py + .5) * 100}%`);
      });

      el.addEventListener("pointerleave", () => {
        el.style.transform = "";
      });
    });
  }

  function initMotion() {
    if (REDUCED_MQ.matches) {
      const glow = $("#cursorGlow");
      if (glow) glow.style.display = "none";
      return;
    }

    const glow = $("#cursorGlow");
    if (glow && FINE_POINTER.matches) {
      let tx = innerWidth / 2, ty = innerHeight / 2;
      let cx = tx, cy = ty;
      addEventListener("pointermove", (e) => {
        tx = e.clientX;
        ty = e.clientY;
        glow.style.opacity = "1";
      }, { passive: true });

      const loop = () => {
        cx += (tx - cx) * .12;
        cy += (ty - cy) * .12;
        glow.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  /* ── Трёхмерный фон ─────────────────────────────────── */

  function initScene() {
    if (typeof THREE === "undefined") return;
    if (REDUCED_MQ.matches) return;
    const canvas = $("#scene");
    if (!canvas) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (_) {
      return;
    }

    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight, false);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070e, 0.045);

    const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 200);
    camera.position.set(0, 1.6, 13);

    scene.add(new THREE.AmbientLight(0x94b8ff, 0.75));

    const key = new THREE.PointLight(0x64f0d8, 190, 60);
    key.position.set(-9, 8, 9);
    scene.add(key);

    const rim = new THREE.PointLight(0x9d8cff, 210, 70);
    rim.position.set(10, -6, 7);
    scene.add(rim);

    const warm = new THREE.PointLight(0xffc26b, 90, 60);
    warm.position.set(4, 10, -8);
    scene.add(warm);

    const group = new THREE.Group();
    scene.add(group);

    // центральный кристалл
    const geo = new THREE.IcosahedronGeometry(2.35, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1b2c4a,
      metalness: 0.92,
      roughness: 0.24,
      flatShading: true,
      emissive: 0x0b2b33,
      emissiveIntensity: 0.85,
    });
    const core = new THREE.Mesh(geo, mat);
    group.add(core);

    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.62, 1),
      new THREE.MeshBasicMaterial({ color: 0x64f0d8, wireframe: true, transparent: true, opacity: 0.16 })
    );
    group.add(wire);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(3.6, 0.012, 8, 140),
      new THREE.MeshBasicMaterial({ color: 0x9d8cff, transparent: true, opacity: 0.5 })
    );
    halo.rotation.set(1.36, 0.3, 0);
    group.add(halo);

    const halo2 = new THREE.Mesh(
      new THREE.TorusGeometry(4.35, 0.008, 8, 160),
      new THREE.MeshBasicMaterial({ color: 0x64f0d8, transparent: true, opacity: 0.34 })
    );
    halo2.rotation.set(1.9, -0.5, 0.6);
    group.add(halo2);

    // пылинки
    const COUNT = 420;
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - .5) * 34;
      positions[i * 3 + 1] = (Math.random() - .5) * 22;
      positions[i * 3 + 2] = (Math.random() - .5) * 26 - 4;
      speeds[i] = .25 + Math.random() * .8;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: 0xbfe6ff, size: 0.055, sizeAttenuation: true,
      transparent: true, opacity: 0.66, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    scene.add(dust);

    // сетка-плоскость внизу
    const grid = new THREE.GridHelper(80, 40, 0x2b4a6e, 0x152538);
    grid.material.transparent = true;
    grid.material.opacity = 0.4;
    grid.position.y = -7.2;
    scene.add(grid);

    // на узких экранах кристалл меньше и уходит вверх-вправо, чтобы не мешать тексту
    const layout = () => {
      const wide = innerWidth >= 1000;
      group.position.x = wide ? 4.5 : 0.7;
      group.position.y = wide ? 0.9 : 3.4;
      group.scale.setScalar(wide ? 0.88 : 0.58);
    };
    layout();

    let mx = 0, my = 0, tx = 0, ty = 0;
    addEventListener("pointermove", (e) => {
      tx = (e.clientX / innerWidth - .5) * 2;
      ty = (e.clientY / innerHeight - .5) * 2;
    }, { passive: true });

    let visible = !document.hidden;

    const onResize = () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setSize(innerWidth, innerHeight, false);
      layout();
    };
    addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", () => { visible = !document.hidden; });

    const clock = new THREE.Clock();
    const pos = dustGeo.attributes.position;

    const frame = () => {
      requestAnimationFrame(frame);
      if (!visible) return;

      const dt = Math.min(clock.getDelta(), 0.06);
      const t = clock.elapsedTime;

      mx += (tx - mx) * 0.045;
      my += (ty - my) * 0.045;

      const scrollK = Math.min(scrollY / Math.max(1, document.body.scrollHeight - innerHeight), 1);

      group.rotation.y += dt * 0.16;
      group.rotation.x += (Math.sin(t * 0.28) * 0.14 + my * 0.25 + scrollK * 0.5 - group.rotation.x) * 0.05;
      group.rotation.z += (Math.cos(t * 0.19) * 0.09 - group.rotation.z) * 0.05;

      wire.rotation.y -= dt * 0.24;
      wire.rotation.x += dt * 0.1;
      halo.rotation.z += dt * 0.34;
      halo2.rotation.z -= dt * 0.22;

      const pulse = 1 + Math.sin(t * 1.15) * 0.055;
      core.scale.setScalar(pulse);

      key.position.x = Math.sin(t * 0.42) * 10;
      rim.position.y = -6 + Math.cos(t * 0.36) * 6;

      camera.position.x += (mx * 2.4 - camera.position.x) * 0.06;
      camera.position.y += (1.6 - my * 1.6 - camera.position.y) * 0.06;
      camera.lookAt(0, 0, 0);

      grid.position.z = ((t * 1.4) % 2) - 1;

      for (let i = 0; i < COUNT; i++) {
        let y = pos.getY(i) + speeds[i] * dt * 0.9;
        if (y > 11) y = -11;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      dust.rotation.y = t * 0.02;

      renderer.render(scene, camera);
    };

    requestAnimationFrame(frame);
  }

  /* ── События ─────────────────────────────────────────── */

  function wireUI() {
    $("#groupBtn").addEventListener("click", openSheet);
    $("#shareBtn").addEventListener("click", shareGroup);
    $("#todayBtn").addEventListener("click", () => {
      state.weekOffset = 0;
      state.day = isoOf(new Date());
      render();
    });
    $("#prevWeek").addEventListener("click", () => setWeek(-1));
    $("#nextWeek").addEventListener("click", () => setWeek(1));

    let sx = null;
    const content = $("#content");
    content.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
    content.addEventListener("touchend", (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 60) setWeek(dx > 0 ? -1 : 1);
      sx = null;
    }, { passive: true });

    $("#searchInput").addEventListener("input", (e) => {
      state.sheetQuery = e.target.value;
      renderGroupList();
    });

    $("#lessonModal").addEventListener("click", (e) => {
      if (e.target.closest("[data-lesson-close]")) closeLesson();
    });

    $("#sheet").addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) closeSheet();
    });

    if (DESKTOP_MQ.addEventListener) DESKTOP_MQ.addEventListener("change", render);
    else if (DESKTOP_MQ.addListener) DESKTOP_MQ.addListener(render);

    addEventListener("online", render);
    addEventListener("offline", render);

    document.addEventListener("keydown", trapFocus);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#lessonModal").hidden) closeLesson();
      if (e.key === "Escape" && !$("#sheet").hidden) closeSheet();
      if (e.target.matches("input, textarea")) return;
      if (e.key === "ArrowLeft") setWeek(-1);
      if (e.key === "ArrowRight") setWeek(1);
    });

    const bar = $("#topbar");
    addEventListener("scroll", () => {
      if (bar) bar.classList.toggle("is-scrolled", scrollY > 4);
    }, { passive: true });

    // перерисовываем карточки раз в минуту, чтобы «сейчас» было актуальным
    setInterval(() => {
      if (!state.data || document.hidden) return;
      if (!DESKTOP_MQ.matches) renderContent();
    }, 60000);

    if ("serviceWorker" in navigator) {
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
    }
  }

  async function shareGroup() {
    if (!state.group) return;
    const url = location.origin + location.pathname + "#g=" + state.group.file;
    const title = "Расписание " + state.group.g + " — КНИТУ";
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (_) { /* отменили — пробуем скопировать */ }
    }
    if (await copyText(url)) {
      toast("Ссылка на группу скопирована");
      return;
    }
    window.prompt("Скопируй ссылку на группу:", url);
  }

  function setWeek(delta) {
    const mon = currentMonday();
    const weekday = state.day
      ? (parseISO(state.day).getDay() + 6) % 7
      : (new Date().getDay() + 6) % 7;
    state.weekOffset += delta;
    const nm = addDays(mon, delta * 7);
    state.day = isoOf(addDays(nm, weekday));
    render();
  }

  boot();
})();