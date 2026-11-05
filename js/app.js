(function () {
  const G = window.Gloom, $ = (s, r = document) => r.querySelector(s);
  let state = G.load();
  state.tasks = state.tasks.filter(t => !t.done).map(t => Object.assign({ price: 0, deadline: null }, t, { firstStart: t.firstStart || t.startedAt || (t.elapsed ? t.created : null) })); // migrate older items
  const VIEWS = ['today', 'overview', 'commissions', 'tasks', 'clients'];
  let view = location.hash.slice(1) || 'today';
  let editingId = null, editingRate = false;
  const persist = () => G.save(state);

  /* All amounts are stored in USD; INR is a display conversion using state.rate. */
  const rate = () => (state.currency === 'INR' ? state.rate.value : 1);
  const SYM = { USD: '$', INR: '₹' };
  const money = usd => {
    const v = usd * rate();
    if (state.currency === 'INR') return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v);
  };
  const dur = ms => { const m = Math.round(ms / 60000); if (m < 1) return '<1m'; const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60; return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`; };
  const dueInfo = (due, now = Date.now()) => { const diff = due - now; return diff < 0 ? { text: 'Overdue ' + dur(-diff), cls: 'late' } : { text: dur(diff) + ' left', cls: diff < 864e5 ? 'soon' : '' }; };
  const toLocalInput = ts => { const d = new Date(ts), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const rateNote = () => {
    if (state.currency !== 'INR') return '';
    const r = state.rate;
    const val = editingRate ? `<input class="rate-in" type="number" step="0.01" min="0.01" value="${r.value}" aria-label="Conversion rate">` : `<b>${r.value.toFixed(2)}</b>`;
    const tools = editingRate ? '' : `<button class="icon xs" data-act="editrate" aria-label="Edit rate">${icon('edit')}</button>${r.manual ? `<button class="icon xs" data-act="liverate" aria-label="Use live rate">${icon('reset')}</button>` : ''}`;
    return `<div class="rate">Current conversion rate : ${val} INR / 1 $${tools}</div>`;
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
  const clientOf = id => state.clients.find(c => c.id === id);
  const hue = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  /* Client avatar: Roblox headshot when an ID is set (loaded as a plain image); initials on a colour otherwise. */
  function avatar(c, size = '') {
    if (!c) return '';
    const ini = esc(c.name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase());
    const img = c.roblox ? `<img src="https://www.roblox.com/headshot-thumbnail/image?userId=${c.roblox}&width=150&height=150&format=png" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
    return `<span class="av ${size}" style="--h:${hue(c.name)}" title="${esc(c.name)}"><span class="av-f">${ini}</span>${img}</span>`;
  };
  const clientOpts = sel => '<option value="">No client</option>' + state.clients.map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = s => parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const monthName = (k, long) => parseDate(k + '-01').toLocaleDateString(undefined, { month: long ? 'long' : 'short', ...(long ? { year: 'numeric' } : {}) });
  const clock = ms => { const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; };
  const totalTime = (now = Date.now()) => state.tasks.reduce((s, t) => s + G.taskElapsed(t, now), 0) + state.commissions.reduce((s, c) => s + (c.time || 0), 0);
  const hours = ms => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

  /* ---------- Views ---------- */
  function overview() {
    const nowKey = G.monthKey(G.today()), st = G.stats(state.commissions, nowKey);
    const sorted = G.sortByDate(state.commissions);
    const series = G.monthlySeries(state.commissions, 6, nowKey);
    const timeMs = totalTime();
    const delta = st.delta === null ? '' : `<span class="chip ${st.delta >= 0 ? 'up' : 'down'}">${icon(st.delta >= 0 ? 'up' : 'down')}${Math.abs(st.delta)}%</span>`;
    const barItems = sorted.slice(-12).map(c => ({ label: esc(c.name.length > 9 ? c.name.slice(0, 8) + '…' : c.name), value: c.price * rate(), tip: `${esc(c.name)} · ${money(c.price)} · ${fmtDate(c.date)}` }));
    const lineItems = series.map(m => ({ label: monthName(m.key), value: m.count, tip: `${monthName(m.key, true)} · ${m.count} commission${m.count === 1 ? '' : 's'}` }));
    const ta = G.turnaround(state.commissions), dl = ta.withDeadline.slice(-8);
    const maxMs = Math.max(0, ...dl.flatMap(i => [i.allotted, i.actual])), big = maxMs >= 48 * 36e5, div = big ? 864e5 : 36e5;
    const gItems = dl.map(i => ({ label: esc(i.name.length > 9 ? i.name.slice(0, 8) + '…' : i.name), a: i.allotted / div, b: i.actual / div, late: i.late, tip: `${esc(i.name)} · deadline window ${dur(i.allotted)} · actual ${dur(i.actual)}${i.late ? ' · late' : ' · on time'}` }));
    const rows = series.slice().reverse().map(m => `<tr><td>${monthName(m.key, true)}</td><td>${m.count}</td><td>${m.count ? money(m.avg) : '–'}</td><td class="r">${money(m.revenue)}</td></tr>`).join('');
    return `
    <section class="hero card rise">
      <div><div class="eyebrow">${monthName(nowKey, true)}</div>
      <div class="big" id="bigRev" data-count="${st.monthRevenue}" data-kind="money">${money(st.monthRevenue)}</div>
      <div class="sub">${delta}${st.delta === null ? '' : '<span class="muted">vs last month</span>'}</div>${rateNote()}</div>
      <button class="btn primary" data-act="add">${icon('plus')}<span>Commission</span></button>
    </section>
    <section class="stats">
      ${stat('wallet', 'This month', st.monthCount, 'commissions', [st.monthCount, 'int'])}
      ${stat('grid', 'Average', money(st.monthAvg), 'per commission', [st.monthAvg, 'money'])}
      ${stat('clock', 'Time tracked', `<span id="totalTime">${hours(timeMs)}</span>`, 'all work')}
      ${stat('up', 'All time', money(st.total), `${st.count} total`, [st.total, 'money'])}
    </section>
    <section class="charts">
      <div class="card rise">${expandBtn('rev')}<h3>Revenue per commission</h3>${Charts.bars(barItems, { id: 'rev' })}</div>
      <div class="card rise">${expandBtn('cnt')}<h3>Commissions per month</h3>${Charts.line(lineItems, { id: 'cnt' })}</div>
    </section>
    <section class="charts"><div class="card rise">${expandBtn('ddl')}<div class="head"><h3>Deadline vs actual <span class="muted">(${big ? 'days' : 'hours'})</span></h3><span class="muted">Avg turnaround <b>${ta.items.length ? dur(ta.avg) : '–'}</b></span></div>
      ${Charts.grouped(gItems, { id: 'ddl' })}${gItems.length ? '<div class="legend"><span><i style="background:color-mix(in srgb,var(--mute) 45%,transparent)"></i>Deadline window</span><span><i style="background:var(--green)"></i>On time</span><span><i style="background:var(--red)"></i>Late</span></div>' : ''}</div>
    <div class="card rise"><h3>Monthly overview</h3>
      <div class="scroll"><table><thead><tr><th>Month</th><th>Count</th><th>Average</th><th class="r">Revenue</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${st.best ? `<div class="best">${icon('up')}<span>Top: <b>${esc(st.best.name)}</b> · ${money(st.best.price)}</span></div>` : ''}
    </div></section>`;
  }
  const stat = (ic, label, val, note, count) => `<div class="card stat rise">${icon(ic)}<div class="lab">${label}</div><div class="val"${count ? ` data-count="${count[0]}" data-kind="${count[1]}"` : ''}>${val}</div><div class="muted">${note}</div></div>`;
  const expandBtn = id => `<button class="expand" data-act="expand" data-id="${id}" aria-label="Expand chart">${icon('expand')}</button>`;

  function commissions() {
    const list = G.sortByDate(state.commissions).reverse();
    const items = list.map((c, i) => `<li class="item rise" style="animation-delay:${Math.min(i, 10) * 30}ms">
      ${avatar(clientOf(c.clientId), 'sm')}<div class="grow"><div class="name">${esc(c.name)}</div><div class="muted">${clientOf(c.clientId) ? esc(clientOf(c.clientId).name) + ' · ' : ''}${fmtDate(c.date)}${c.time >= 60000 ? ' · ' + hours(c.time) : ''}</div></div>
      <div class="price">${money(c.price)}</div>
      <button class="icon" data-act="edit" data-id="${c.id}" aria-label="Edit">${icon('edit')}</button>
      <button class="icon danger" data-act="del" data-id="${c.id}" aria-label="Delete">${icon('trash')}</button></li>`).join('');
    return `<div class="bar-head"><div><h1>Commissions</h1>${rateNote()}</div><button class="btn primary" data-act="add">${icon('plus')}<span>Add</span></button></div>
      ${list.length ? `<ul class="list card">${items}</ul>` : `<div class="empty card">${icon('wallet')}<p>No commissions yet</p></div>`}`;
  }

  function taskItem(t) {
    const running = !!t.startedAt;
    return `<li class="item task ${running ? 'running' : ''}">
      ${avatar(clientOf(t.clientId), 'sm')}<div class="grow"><div class="name">${esc(t.title)}</div><div class="muted">${clientOf(t.clientId) ? esc(clientOf(t.clientId).name) + ' · ' : ''}${money(t.price || 0)}${t.deadline ? (d => ` · <span class="due ${d.cls}" data-due="${t.deadline}">${d.text}</span>`)(dueInfo(t.deadline)) : ''}</div></div>
      <span class="time" data-timer="${t.id}">${clock(G.taskElapsed(t))}</span>
      <button class="icon ${running ? 'live' : ''}" data-act="${running ? 'pause' : 'start'}" data-id="${t.id}" aria-label="${running ? 'Pause' : 'Start'}">${icon(running ? 'pause' : 'play')}</button>
      <button class="icon" data-act="reset" data-id="${t.id}" aria-label="Reset timer">${icon('reset')}</button>
      <button class="icon" data-act="edittask" data-id="${t.id}" aria-label="Edit">${icon('edit')}</button>
      <button class="icon danger" data-act="deltask" data-id="${t.id}" aria-label="Delete">${icon('trash')}</button>
      <button class="btn complete" data-act="complete" data-id="${t.id}">${icon('check')}<span>Complete</span></button></li>`;
  }

  function tasks() {
    return `<div class="bar-head"><div><h1>Pending</h1>${rateNote()}</div></div>
      <form class="newtask card" id="newTask" autocomplete="off">
        <input name="t" placeholder="New pending commission" maxlength="80" required aria-label="Commission name">
        <input name="p" class="pr" type="number" min="0" step="0.01" placeholder="Price ${SYM[state.currency]}" required inputmode="decimal" aria-label="Price">
        ${state.clients.length ? `<select name="c" class="cl" aria-label="Client">${clientOpts('')}</select>` : ''}
        <input name="d" class="dl" type="datetime-local" aria-label="Deadline" title="Deadline (optional)">
        <button class="btn primary" type="submit" aria-label="Add">${icon('plus')}</button></form>
      ${state.tasks.length ? `<ul class="list card">${state.tasks.map(taskItem).join('')}</ul>` : `<div class="empty card">${icon('list')}<p>Nothing pending</p></div>`}`;
  }

  /* ---------- Rendering ---------- */
  function render(animate = true) {
    const el = $('#view');
    el.className = animate ? 'fade' : 'still';
    el.innerHTML = { today: todayView, overview, commissions, tasks, clients: clientsView }[view]();
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    movePill();
    if (animate) countUp();
    document.querySelectorAll('#currency button').forEach(b => b.classList.toggle('on', b.dataset.cur === state.currency));
    const ri = $('.rate-in'); if (ri) { ri.focus(); ri.select(); }
    if (view === 'today') setupTodayLayout();
  }
  function movePill() {
    const b = $('#tabs button.on'), p = $('#pill');
    if (b) { p.style.width = b.offsetWidth + 'px'; p.style.transform = `translateX(${b.offsetLeft}px)`; }
  }
  function countUp() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('[data-count]').forEach(el => {
      const target = +el.dataset.count, int = el.dataset.kind === 'int', r = rate(), t0 = performance.now();
      if (!target) return;
      (function f(t) {
        if (!el.isConnected) return;
        const p = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - p, 3);
        el.textContent = int ? String(Math.round(target * e)) : money(p < 1 ? Math.round(target * e * r) / r : target);
        if (p < 1) requestAnimationFrame(f);
      })(t0);
    });
  }
  const setView = v => { view = v; location.hash = v; render(); };

  /* ---------- Dialog (commission or pending commission) ---------- */
  const dlg = $('#dlg'), form = $('#form');
  let editingKind = 'commission';
  const task = id => state.tasks.find(t => t.id === id);
  function openDialog(id, kind = 'commission') {
    editingKind = kind; editingId = id || null;
    const c = kind === 'task' ? task(id) : state.commissions.find(x => x.id === id);
    $('#dlgTitle').textContent = kind === 'task' ? 'Edit pending commission' : (c ? 'Edit commission' : 'New commission');
    $('#dateLabel').hidden = kind === 'task'; $('#dueLabel').hidden = kind !== 'task'; form.date.required = kind !== 'task';
    $('#priceText').textContent = `Price (${state.currency})`;
    form.client.innerHTML = clientOpts(c ? c.clientId : ''); $('#clientLabel').hidden = !state.clients.length; Sound.play('open');
    const shown = c ? Math.round(c.price * rate() * 100) / 100 : '';
    form.name.value = c ? (c.name || c.title) : ''; form.price.value = shown; form.price.dataset.orig = shown; form.price.dataset.usd = c ? c.price : '';
    form.date.value = (c && c.date) || G.today(); form.due.value = c && c.deadline ? toLocalInput(c.deadline) : '';
    dlg.showModal(); form.name.focus();
  }
  form.addEventListener('submit', e => {
    const name = form.name.value.trim(), entered = parseFloat(form.price.value), date = form.date.value, isTask = editingKind === 'task';
    if (!name || !isFinite(entered) || entered < 0 || (!isTask && !date)) { e.preventDefault(); return; }
    const unchanged = form.price.dataset.usd !== '' && entered === +form.price.dataset.orig;
    const price = unchanged ? +form.price.dataset.usd : Math.round((entered / rate()) * 1e4) / 1e4;
    if (isTask) Object.assign(task(editingId), { title: name, price, deadline: form.due.value ? new Date(form.due.value).getTime() : null, clientId: form.client.value || null });
    else if (editingId) Object.assign(state.commissions.find(c => c.id === editingId), { name, price, date, clientId: form.client.value || null });
    else state.commissions.push({ id: G.uid(), name, price, date, time: 0, created: Date.now(), clientId: form.client.value || null });
    persist(); Sound.play('add'); render(false);
  });
  $('#cancel').onclick = () => { Sound.play('close'); dlg.close(); };
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  function toast(msg) {
    const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = icon('check') + esc(msg);
    document.body.appendChild(el); setTimeout(() => el.remove(), 2400);
  }

  /* ---------- Actions ---------- */
  const pauseT = t => { if (t.startedAt) { t.elapsed = G.taskElapsed(t); t.startedAt = null; } };
  const actions = {
    layoutmode: () => { layoutEditing = !layoutEditing; render(false); },
    togglewidget: id => { const ids=['stats','quote','todos','schedule','deadlines','notes']; state.todayLayout=state.todayLayout||{order:ids.slice(),hidden:[]}; state.todayLayout.hidden=state.todayLayout.hidden||[]; state.todayLayout.hidden=state.todayLayout.hidden.includes(id)?state.todayLayout.hidden.filter(x=>x!==id):state.todayLayout.hidden.concat(id); persist(); render(false); },
    add: () => openDialog(),
    edit: id => openDialog(id),
    del: id => { const c = state.commissions.find(x => x.id === id); if (c && confirm(`Delete “${c.name}”?`)) { state.commissions = state.commissions.filter(x => x.id !== id); persist(); render(false); } },
    start: id => { const t = task(id); if (!t.startedAt) { t.startedAt = Date.now(); if (!t.firstStart) t.firstStart = t.startedAt; } persist(); render(false); },
    pause: id => { pauseT(task(id)); persist(); render(false); },
    reset: id => { const t = task(id), was = !!t.startedAt; t.elapsed = 0; t.startedAt = was ? Date.now() : null; t.firstStart = t.startedAt; persist(); render(false); },
    edittask: id => openDialog(id, 'task'),
    deltask: id => { const t = task(id); if (t && confirm(`Delete “${t.title}”?`)) { state.tasks = state.tasks.filter(x => x.id !== id); persist(); render(false); } },
    expand: (id, btn) => openBig(id, btn.closest('.card')),
    sound: () => { state.sound = !state.sound; persist(); syncSound(); if (state.sound) Sound.play('tap'); },
    goto: id => setView(id),
    todo: id => { const t = state.todos.find(x => x.id === id); if (!t) return; t.done = !t.done; persist(); Sound.play(t.done ? 'done' : 'undo'); render(false); },
    deltodo: id => { state.todos = state.todos.filter(x => x.id !== id); persist(); render(false); },
    delevent: id => { state.events = state.events.filter(x => x.id !== id); persist(); render(false); },
    importics: () => $('#icsFile').click(),
    newquote: async () => { const r = await Quotes.get(G.today()); state.quote = { date: G.today(), text: r.text, author: r.author }; persist(); if (view === 'today') render(false); },
    addclient: () => openClient(),
    editclient: id => openClient(id),
    toggleclient: id => { openClientId = openClientId === id ? null : id; render(false); },
    delclient: id => {
      const c = clientOf(id); if (!c || !confirm(`Delete “${c.name}”? Their commissions are kept.`)) return;
      state.clients = state.clients.filter(x => x.id !== id);
      state.commissions.forEach(x => { if (x.clientId === id) x.clientId = null; }); state.tasks.forEach(x => { if (x.clientId === id) x.clientId = null; });
      persist(); render(false);
    },
    editrate: () => { editingRate = true; render(false); },
    liverate: () => { state.rate.manual = false; persist(); render(false); refreshRate(true); },
    complete: id => {
      const t = task(id); if (!t) return;
      pauseT(t);
      state.commissions.push({ id: G.uid(), name: t.title, price: t.price || 0, date: G.today(), time: t.elapsed, created: Date.now(), workStart: t.firstStart || t.created, deadline: t.deadline || null, completedAt: Date.now(), clientId: t.clientId || null });
      state.tasks = state.tasks.filter(x => x.id !== id);
      persist(); render(false); toast('Added to your commissions');
    }
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (b) { const k = b.dataset.act in SOUND ? SOUND[b.dataset.act] : 'tap'; if (k) Sound.play(k); actions[b.dataset.act](b.dataset.id, b); }
    const t = e.target.closest('#tabs button'); if (t) { Sound.play('tab'); setView(t.dataset.view); }
    const c = e.target.closest('#currency button');
    if (c && c.dataset.cur !== state.currency) { Sound.play('tab'); state.currency = c.dataset.cur; persist(); render(false); if (c.dataset.cur === 'INR') refreshRate(); }
  });
  function commitRate(inp, save) {
    const v = parseFloat(inp.value); editingRate = false;
    if (save && v > 0) { state.rate = { value: Math.round(v * 100) / 100, manual: true, updated: Date.now() }; persist(); }
    render(false);
  }
  document.addEventListener('keydown', e => {
    if (!e.target.classList || !e.target.classList.contains('rate-in')) return;
    if (e.key === 'Enter') commitRate(e.target, true); else if (e.key === 'Escape') commitRate(e.target, false);
  });
  document.addEventListener('focusout', e => { if (editingRate && e.target.classList && e.target.classList.contains('rate-in')) commitRate(e.target, true); });

  /* Live USD→INR rate (free public APIs; falls back to the last saved rate) */
  async function fetchRate() {
    for (const u of ['https://open.er-api.com/v6/latest/USD', 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR']) {
      try { const j = await (await fetch(u, { cache: 'no-store' })).json(); const v = j.rates && j.rates.INR; if (v > 0) return v; } catch (err) { /* try next */ }
    }
    return null;
  }
  async function refreshRate(force) {
    if (!force && (state.rate.manual || Date.now() - state.rate.updated < 36e5)) return;
    const v = await fetchRate();
    if (v) { state.rate = { value: Math.round(v * 100) / 100, manual: false, updated: Date.now() }; persist(); if (!editingRate) render(false); }
    else if (force) toast('Couldn’t reach live rates');
  }
  document.addEventListener('submit', e => {
    const fid = e.target.id;
    if (fid === 'newTodo' || fid === 'newEvent') { e.preventDefault(); return fid === 'newTodo' ? addTodo(e.target) : addEvent(e.target); }
    if (fid !== 'newTask') return;
    e.preventDefault();
    const title = e.target.t.value.trim(), entered = parseFloat(e.target.p.value), d = e.target.d.value;
    if (!title || !isFinite(entered) || entered < 0) return;
    state.tasks.unshift({ id: G.uid(), title, price: Math.round((entered / rate()) * 1e4) / 1e4, deadline: d ? new Date(d).getTime() : null, elapsed: 0, startedAt: null, firstStart: null, clientId: e.target.c ? e.target.c.value || null : null, created: Date.now() });
    persist(); Sound.play('add'); render(false); $('#newTask input').focus();
  });

  /* ---------- Today (home) ---------- */
  const greet = (d = new Date()) => { const h = d.getHours(); return h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
  const longDate = (d = new Date()) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  function todayView() {
    const now = new Date(), nowMs = now.getTime(), ymd = G.today(now), st = G.stats(state.commissions, G.monthKey(ymd));
    const todos = G.todosFor(state.todos, ymd).sort((a, b) => (a.done - b.done) || (a.created - b.created));
    const done = todos.filter(t => t.done).length, p = todos.length ? done / todos.length : 0, C = 2 * Math.PI * 22;
    const due = G.dueList(state.tasks, nowMs, 7), next = due[0], nd = next && dueInfo(next.deadline, nowMs);
    const pendVal = state.tasks.reduce((s, t) => s + (t.price || 0), 0);
    const evToday = G.eventsOn(state.events, ymd), evNext = G.upcomingEvents(state.events, ymd, 7).slice(0, 5);
    const yKey = G.addDays(ymd, -1), yNote = state.notes[yKey] || '', running = state.tasks.filter(t => t.startedAt);
    const q = state.quote && state.quote.date === ymd ? state.quote : null;
    const wk = k => parseDate(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

    const todoItem = t => `<li class="item"><button class="check ${t.done ? 'on' : ''}" data-act="todo" data-id="${t.id}" aria-label="Toggle">${icon('check')}</button>
      <div class="grow"><div class="name ${t.done ? 'strike' : ''}">${esc(t.title)}</div>${t.date < ymd && !t.done ? '<div class="muted">Carried over</div>' : ''}</div>
      <button class="icon danger" data-act="deltodo" data-id="${t.id}" aria-label="Delete">${icon('trash')}</button></li>`;
    const evItem = (e, label) => `<li class="item"><span class="when">${label}</span><div class="grow name">${esc(e.title)}</div><button class="icon danger" data-act="delevent" data-id="${e.id}" aria-label="Delete">${icon('trash')}</button></li>`;
    const dueItem = t => {
      const d = dueInfo(t.deadline, nowMs), s = G.dueStatus(t.deadline, nowMs), cl = clientOf(t.clientId);
      return `<li class="item"><span class="flagic ${s}">${icon('flag')}</span>${avatar(cl, 'sm')}<div class="grow"><div class="name">${esc(t.title)}</div><div class="muted">${money(t.price || 0)} · <span class="due ${d.cls}" data-due="${t.deadline}">${d.text}</span></div></div><span class="tag ${s}">${s === 'overdue' ? 'Overdue' : s === 'today' ? 'Today' : 'This week'}</span></li>`;
    };
    const empty = msg => `<div class="empty slim"><p>${msg}</p></div>`;

    const layout = state.todayLayout || { order: ['stats','quote','todos','schedule','deadlines','notes'], hidden: [] };
    const ordered = a => a.slice().sort((x,y) => (layout.order.indexOf(x.id) < 0 ? 999 : layout.order.indexOf(x.id)) - (layout.order.indexOf(y.id) < 0 ? 999 : layout.order.indexOf(y.id)));
    const widgets = [
      {id:'stats',label:'Daily overview',html:`<section class="stats">
      <div class="card stat rise">${icon('check')}<svg class="ring" viewBox="0 0 52 52"><circle class="ring-bg" cx="26" cy="26" r="22"/><circle class="ring-fg" cx="26" cy="26" r="22" style="--c:${C};stroke-dasharray:${C};stroke-dashoffset:${C * (1 - p)}"/></svg><div class="lab">Today</div><div class="val">${done}/${todos.length}</div><div class="muted">tasks done</div></div>
      ${stat('wallet', 'This month', money(st.monthRevenue), `${st.monthCount} commission${st.monthCount === 1 ? '' : 's'}`, [st.monthRevenue, 'money'])}
      ${stat('list', 'In progress', money(pendVal), `${state.tasks.length} pending`, [pendVal, 'money'])}
      ${stat('flag', 'Next deadline', next ? `<span class="due ${nd.cls}" data-due="${next.deadline}">${nd.text}</span>` : '–', next ? esc(next.title) : 'Nothing this week')}
    </section>`},
      {id:'quote',label:'Quote',html:q ? `<figure class="quote card rise" id="todayQuote"><blockquote>“${esc(q.text)}”</blockquote><figcaption><span>— ${esc(q.author)}</span><button class="icon xs" data-act="newquote" aria-label="New quote">${icon('reset')}</button></figcaption></figure>` : ''},
      {id:'todos',label:'Today’s tasks',html:`<div class="card rise"><div class="head free"><h3>Today <span class="muted">${done}/${todos.length}</span></h3></div>
        <form class="qa" id="newTodo" autocomplete="off"><input name="t" placeholder="Add a task for today" maxlength="120" aria-label="New task"><button class="icon" type="submit" aria-label="Add">${icon('plus')}</button></form>
        ${todos.length ? `<ul class="list flat">${todos.map(todoItem).join('')}</ul>` : empty('A clear day')}</div>`},
      {id:'schedule',label:'Schedule',html:`<div class="card rise"><div class="head free"><h3>Schedule</h3><button class="icon" data-act="importics" aria-label="Import calendar file" title="Import a .ics calendar file">${icon('upload')}</button></div>
        <form class="qa" id="newEvent" autocomplete="off"><input name="t" placeholder="Reminder or event" maxlength="100" aria-label="Event title"><input name="tm" type="time" class="mini" aria-label="Time"><input name="d" type="date" class="mini" value="${ymd}" aria-label="Date"><button class="icon" type="submit" aria-label="Add">${icon('plus')}</button></form>
        ${evToday.length ? `<ul class="list flat">${evToday.map(e => evItem(e, e.time || 'All day')).join('')}</ul>` : empty('Nothing scheduled today')}
        ${evNext.length ? `<div class="subh">Coming up</div><ul class="list flat">${evNext.map(e => evItem(e, `${wk(e.date)}${e.time ? ' · ' + e.time : ''}`)).join('')}</ul>` : ''}</div>`},
      {id:'deadlines',label:'Deadlines',html:`<div class="card rise"><div class="head free"><h3>Deadlines</h3><button class="icon" data-act="goto" data-id="tasks" aria-label="Open pending">${icon('list')}</button></div>
        ${due.length ? `<ul class="list flat">${due.map(dueItem).join('')}</ul>` : empty('Nothing due this week')}</div>`},
      {id:'notes',label:'Notes',html:`<div class="card rise notes"><div class="head free"><h3>Notes</h3></div>
        <div class="ncols">
          <div class="ncol"><div class="nl">Yesterday · ${wk(yKey)} <span class="need" id="needBadge" ${yNote.trim() ? 'hidden' : ''}>Needs filling</span></div><textarea data-note="${yKey}" class="${yNote.trim() ? '' : 'attn'}" placeholder="What got done? What’s left?">${esc(yNote)}</textarea></div>
          <div class="ncol"><div class="nl">Today</div><textarea data-note="${ymd}" placeholder="Wins, blockers, ideas…">${esc(state.notes[ymd] || '')}</textarea></div>
        </div></div>`}
    ].filter(w => w.html && !layout.hidden.includes(w.id));
    return `<section class="today-head rise"><div><div class="eyebrow">${longDate(now)}</div><h1>${greet(now)}</h1></div><div class="today-heading-tools"><button class="icon layout-toggle" data-act="layoutmode" aria-label="Customize Today page" title="Customize Today page">${icon('edit')}</button></div></section>
      ${running.length ? `<section class="live card rise"><span class="pulse"></span><div class="grow"><div class="muted">Working on${running.length > 1 ? ` · +${running.length - 1} more` : ''}</div><div class="name">${esc(running[0].title)}</div></div><span class="time" data-timer="${running[0].id}">${clock(G.taskElapsed(running[0], nowMs))}</span><button class="icon live" data-act="pause" data-id="${running[0].id}" aria-label="Pause">${icon('pause')}</button></section>` : ''}
      <div class="today-layout">${ordered(widgets).map(w => `<div class="today-widget" data-widget="${w.id}" draggable="false"><button class="widget-remove" data-act="togglewidget" data-id="${w.id}" aria-label="Hide ${w.label}">−</button>${w.html}</div>`).join('')}</div>
      <div class="widget-picker" aria-label="Hidden Today sections"></div>`;
  }

  let layoutEditing = false, holdTimer = null;
  function setupTodayLayout() {
    const host = $('.today-layout'); if (!host) return;
    host.classList.toggle('editing', layoutEditing);
    host.querySelectorAll('.today-widget').forEach(w => { w.draggable = layoutEditing; });
    const picker = $('.widget-picker');
    if (picker) {
      const all = [['stats','Daily overview'],['quote','Quote'],['todos','Today’s tasks'],['schedule','Schedule'],['deadlines','Deadlines'],['notes','Notes']];
      const hidden = (state.todayLayout && state.todayLayout.hidden) || [];
      picker.innerHTML = layoutEditing ? `<div class="picker-label">Add a section</div>${all.filter(x => hidden.includes(x[0])).map(x => `<button class="widget-ghost" data-act="togglewidget" data-id="${x[0]}">＋ ${x[1]}</button>`).join('') || '<span class="muted">All sections are visible</span>'}<button class="btn ghost done-edit" data-act="layoutmode">Done</button>` : '';
    }
    if (!host.dataset.bound) {
      host.dataset.bound = '1';
      host.addEventListener('pointerdown', e => { if (e.target.closest('button,input,textarea,select')) return; holdTimer = setTimeout(() => { layoutEditing = true; render(false); }, 3000); });
      ['pointerup','pointercancel','pointerleave'].forEach(n => host.addEventListener(n, () => clearTimeout(holdTimer)));
      host.addEventListener('dragstart', e => { const w=e.target.closest('.today-widget'); if(w&&layoutEditing){e.dataTransfer.setData('text/plain',w.dataset.widget);e.dataTransfer.effectAllowed='move';} });
      host.addEventListener('dragover', e => { if(layoutEditing) e.preventDefault(); });
      host.addEventListener('drop', e => { if(!layoutEditing)return;e.preventDefault();const from=e.dataTransfer.getData('text/plain'),to=e.target.closest('.today-widget');if(!to||from===to.dataset.widget)return;const ids=[...host.querySelectorAll('.today-widget')].map(x=>x.dataset.widget),a=ids.indexOf(from),b=ids.indexOf(to.dataset.widget);ids.splice(b,0,ids.splice(a,1)[0]);state.todayLayout=state.todayLayout||{hidden:[]};state.todayLayout.order=ids;persist();render(false); });
    }
  }
  function addTodo(f) {
    const t = f.t.value.trim(); if (!t) return;
    state.todos.push({ id: G.uid(), title: t, date: G.today(), done: false, created: Date.now() });
    persist(); Sound.play('add'); render(false); $('#newTodo input').focus();
  }
  function addEvent(f) {
    const title = f.t.value.trim(); if (!title) return;
    state.events.push({ id: G.uid(), title, date: f.d.value || G.today(), time: f.tm.value || '' });
    persist(); Sound.play('add'); render(false); $('#newEvent input').focus();
  }
  document.addEventListener('input', e => {
    const key = e.target.dataset && e.target.dataset.note; if (!key) return;
    state.notes[key] = e.target.value; persist();
    if (key === G.addDays(G.today(), -1)) { const ok = !!e.target.value.trim(); $('#needBadge').hidden = ok; e.target.classList.toggle('attn', !ok); }
  });
  $('#icsFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    let n = 0;
    G.parseICS(await f.text()).forEach(ev => {
      if (!state.events.some(x => x.title === ev.title && x.date === ev.date && x.time === ev.time)) { state.events.push({ id: G.uid(), title: ev.title, date: ev.date, time: ev.time }); n++; }
    });
    persist(); render(false); toast(n ? `Imported ${n} event${n === 1 ? '' : 's'}` : 'No new events found');
  });

  /* ---------- Clients ---------- */
  const cdlg = $('#cdlg'), cform = $('#cform');
  let editingClient = null, openClientId = null, prevTimer;
  function previewClient() {
    const rbx = G.parseRobloxId(cform.rbx.value);
    $('#cPrev').innerHTML = avatar({ name: cform.name.value.trim() || '?', roblox: rbx }, 'lg');
    cform.rbx.setCustomValidity(cform.rbx.value.trim() && !rbx ? 'Use the numeric Roblox ID or a profile link' : '');
  }
  function openClient(id) {
    editingClient = id || null; const c = clientOf(id);
    $('#cTitle').textContent = c ? 'Edit client' : 'New client';
    cform.name.value = c ? c.name : ''; cform.rbx.value = c ? c.roblox || '' : '';
    previewClient(); Sound.play('open'); cdlg.showModal(); cform.name.focus();
  }
  cform.addEventListener('input', () => { clearTimeout(prevTimer); prevTimer = setTimeout(previewClient, 350); cform.rbx.setCustomValidity(''); });
  cform.addEventListener('submit', e => {
    previewClient();
    const name = cform.name.value.trim(), rbx = G.parseRobloxId(cform.rbx.value);
    if (!name || (cform.rbx.value.trim() && !rbx)) { e.preventDefault(); cform.reportValidity(); return; }
    if (editingClient) Object.assign(clientOf(editingClient), { name, roblox: rbx });
    else state.clients.push({ id: G.uid(), name, roblox: rbx, created: Date.now() });
    persist(); Sound.play('add'); render(false);
  });
  $('#cCancel').onclick = () => { Sound.play('close'); cdlg.close(); };
  cdlg.addEventListener('click', e => { if (e.target === cdlg) cdlg.close(); });

  function clientsView() {
    const stats = G.clientStats(state.commissions);
    const list = state.clients.slice().sort((a, b) => ((stats[b.id] || {}).revenue || 0) - ((stats[a.id] || {}).revenue || 0));
    const card = c => {
      const s = stats[c.id] || { count: 0, revenue: 0, last: '' }, open = openClientId === c.id;
      const pend = state.tasks.filter(t => t.clientId === c.id), hist = G.sortByDate(state.commissions.filter(x => x.clientId === c.id)).reverse();
      const rows = pend.map(t => `<li><span>${esc(t.title)}</span><span class="muted">In progress</span><b>${money(t.price || 0)}</b></li>`).join('') + hist.map(x => `<li><span>${esc(x.name)}</span><span class="muted">${fmtDate(x.date)}</span><b>${money(x.price)}</b></li>`).join('');
      return `<div class="card client rise ${open ? 'open' : ''}">
        <div class="c-top" data-act="toggleclient" data-id="${c.id}">${avatar(c, 'lg')}<div class="grow"><div class="name">${esc(c.name)}</div><div class="muted">${c.roblox ? 'Roblox · ' + c.roblox : 'No Roblox ID'}</div></div>
          <button class="icon" data-act="editclient" data-id="${c.id}" aria-label="Edit">${icon('edit')}</button><button class="icon danger" data-act="delclient" data-id="${c.id}" aria-label="Delete">${icon('trash')}</button></div>
        <div class="c-stats"><div><b>${s.count}</b><span>commissions</span></div><div><b>${money(s.revenue)}</b><span>earned</span></div><div><b>${pend.length}</b><span>in progress</span></div></div>
        ${open ? (rows ? `<ul class="c-list">${rows}</ul>` : '<div class="muted c-none">Nothing yet</div>') : ''}</div>`;
    };
    return `<div class="bar-head"><h1>Clients</h1><button class="btn primary" data-act="addclient">${icon('plus')}<span>Add</span></button></div>
      ${list.length ? `<div class="cgrid">${list.map(card).join('')}</div>` : `<div class="empty card">${icon('users')}<p>No clients yet</p></div>`}`;
  }

  /* ---------- Daily splash with a quote ---------- */
  function syncSound() {
    $('#soundBtn use').setAttribute('href', state.sound ? '#i-sound' : '#i-mute');
    $('#soundBtn').classList.toggle('off', !state.sound); Sound.set(state.sound);
  }
  let splashClose = null;
  async function startSplash() {
    const sp = $('#splash'), day = G.today();
    if (state.lastSplash === day) return;
    $('#spDate').textContent = longDate(); $('#spGreet').textContent = greet();
    $('#spQuote').innerHTML = '<span class="sk"></span>'; $('#spAuthor').textContent = '';
    sp.hidden = false; document.body.classList.add('splashing');
    let timer = null, closed = false;
    splashClose = () => {
      if (closed) return; closed = true; clearTimeout(timer); splashClose = null;
      state.lastSplash = day; persist(); Sound.play('done'); sp.classList.add('out');
      setTimeout(() => { sp.hidden = true; sp.classList.remove('out'); document.body.classList.remove('splashing'); render(); }, 650);
    };
    $('#spGo').onclick = () => splashClose && splashClose();
    let q = state.quote && state.quote.date === day ? state.quote : null;
    if (!q) { const r = await Quotes.get(day); q = { date: day, text: r.text, author: r.author }; state.quote = q; persist(); }
    if (closed) return;
    $('#spQuote').innerHTML = q.text.split(/\s+/).map((w, i) => `<span class="w" style="--i:${i}">${esc(w)} </span>`).join('');
    $('#spAuthor').textContent = '— ' + q.author; $('#spAuthor').classList.add('in');
    $('#spBar').style.animation = 'spbar 10s linear forwards'; timer = setTimeout(() => splashClose && splashClose(), 10000);
  }
  document.addEventListener('keydown', e => { if (splashClose && (e.key === 'Enter' || e.key === 'Escape')) splashClose(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && view === 'today') render(false); });

  /* ---------- Expanded chart view ---------- */
  const SOUND = { complete: 'done', del: 'del', deltask: 'del', deltodo: 'del', delevent: 'del', delclient: 'del', start: 'start', pause: 'pause', add: 'add', addclient: null, edit: null, edittask: null, editclient: null, expand: 'open', todo: null, sound: null };
  const big = $('#big'), EASE = 'cubic-bezier(.22,.8,.24,1)';
  let bigId = null, bigCard = null;
  const short = (s, n) => esc(s.length > n ? s.slice(0, n - 1) + '…' : s);
  const chip = (lab, val) => `<div class="chip2"><span class="lab">${lab}</span><b>${val}</b></div>`;
  const noData = (msg, title, sub) => ({ title, sub, chips: '', svg: `<div class="chart-empty">${msg}</div>`, legend: '' });
  const key = '<span class="k d"></span>', dotR = '<span class="k r"></span>', dotF = '<span class="k f"></span>';

  const SPECS = {
    rev(w, h) {
      const list = G.sortByDate(state.commissions);
      if (!list.length) return noData('No commissions yet', 'Revenue per commission', 'Every commission');
      const total = list.reduce((s, c) => s + c.price, 0), avg = total / list.length;
      const top = list.reduce((b, c, i) => (c.price > list[b].price ? i : b), 0);
      const tracked = list.filter(c => c.time > 0), hrs = tracked.reduce((s, c) => s + c.time, 0) / 36e5;
      const perHr = hrs > 0 ? tracked.reduce((s, c) => s + c.price, 0) / hrs : null;
      const items = list.map(c => ({ label: short(c.name, 11), value: c.price * rate(),
        tip: `${esc(c.name)} · ${money(c.price)} · ${fmtDate(c.date)}${c.time >= 6e4 ? ` · ${dur(c.time)} tracked` : ''}${c.time >= 36e4 ? ` · ${money(c.price / (c.time / 36e5))}/hr` : ''}` }));
      const W = Math.max(w, list.length * 64 + 80);
      return { title: 'Revenue per commission', sub: `${list.length} commission${list.length === 1 ? '' : 's'}, oldest to newest`,
        chips: chip('Total', money(total)) + chip('Average', money(avg)) + chip('Highest', money(list[top].price)) + chip('Per tracked hour', perHr ? money(perHr) : '–'),
        svg: Charts.bars(items, { w: W, h, id: 'revB', big: true, maxLabels: Math.floor((W - 62) / 70), avg: { value: avg * rate(), tip: `Average · ${money(avg)} per commission` }, best: top, bestTip: `Top earner · ${esc(list[top].name)} · ${money(list[top].price)}` }),
        legend: `<span>${key}Average price</span><span>${dotR}Top earner</span>` };
    },
    cnt(w, h) {
      const nowKey = G.monthKey(G.today()), months = G.monthlySeries(state.commissions, 12, nowKey);
      const idx = Object.fromEntries(months.map((m, i) => [m.key, i]));
      const dots = state.commissions.filter(c => G.monthKey(c.date) in idx).map(c => ({ i: idx[G.monthKey(c.date)], price: c.price * rate(), tip: `${esc(c.name)} · ${money(c.price)} · ${fmtDate(c.date)}` }));
      const count = months.reduce((s, m) => s + m.count, 0), bestM = months.reduce((b, m) => (m.count > b.count ? m : b), months[0]);
      const avg = state.commissions.length ? state.commissions.reduce((s, c) => s + c.price, 0) / state.commissions.length : 0;
      const mi = months.map(m => ({ label: monthName(m.key), count: m.count, tip: `${monthName(m.key, true)} · ${m.count} commission${m.count === 1 ? '' : 's'} · ${money(m.revenue)}` }));
      return { title: 'Commissions per month', sub: 'Last 12 months, with every commission’s price',
        chips: chip('Last 12 months', count) + chip('Busiest month', bestM.count ? `${monthName(bestM.key)} · ${bestM.count}` : '–') + chip('Average / month', (count / 12).toFixed(1)) + chip('Average price', money(avg)),
        svg: Charts.combo(mi, dots, { w, h, id: 'cntB', big: true, avg: avg ? { value: avg * rate(), tip: `Average price · ${money(avg)}` } : null }),
        legend: `<span><i style="background:var(--accent)"></i>Commissions (left)</span><span><i style="background:var(--warm)"></i>Price per commission (right)</span><span>${key}Average price</span>` };
    },
    ddl(w, h) {
      const ta = G.turnaround(state.commissions), dl = ta.withDeadline;
      if (!dl.length) return noData('Complete a pending commission that has a deadline', 'Deadline vs actual', 'Allotted time against what you took');
      const maxMs = Math.max(...dl.flatMap(i => [i.allotted, i.actual])), days = maxMs >= 48 * 36e5, div = days ? 864e5 : 36e5;
      const onTime = dl.filter(i => !i.late).length, sumA = dl.reduce((s, i) => s + i.actual, 0), sumF = dl.reduce((s, i) => s + i.focus, 0), avgA = sumA / dl.length;
      const items = dl.map(i => ({ label: short(i.name, 11), a: i.allotted / div, b: i.actual / div, late: i.late, f: i.focus / div,
        tip: `${esc(i.name)} · deadline window ${dur(i.allotted)} · actual ${dur(i.actual)}${i.late ? ' · late by ' + dur(i.actual - i.allotted) : ' · ' + dur(i.allotted - i.actual) + ' to spare'}`,
        ftip: `${esc(i.name)} · focused ${dur(i.focus)}${i.actual ? ` · ${Math.round((i.focus / i.actual) * 100)}% of elapsed time` : ''}` }));
      const W = Math.max(w, dl.length * 96 + 80);
      return { title: 'Deadline vs actual', sub: `In ${days ? 'days' : 'hours'} · actual runs from your first Start to Complete`,
        chips: chip('On time', `${onTime} of ${dl.length} · ${Math.round((onTime / dl.length) * 100)}%`) + chip('Avg turnaround', dur(ta.avg)) + chip('Focus share', sumA ? `${Math.round((sumF / sumA) * 100)}% of elapsed` : '–'),
        svg: Charts.grouped(items, { w: W, h, id: 'ddlB', big: true, focus: true, maxLabels: Math.floor((W - 62) / 90), avg: { value: avgA / div, tip: `Average actual · ${dur(avgA)}` } }),
        legend: `<span><i style="background:color-mix(in srgb,var(--mute) 45%,transparent)"></i>Deadline window</span><span><i style="background:var(--green)"></i>On time</span><span><i style="background:var(--red)"></i>Late</span><span>${dotR}Focused time</span><span>${key}Average actual</span>` };
    }
  };

  function renderBig() {
    const body = $('#bigBody'), w = Math.max(300, body.clientWidth || 300), h = Math.max(260, Math.min(460, innerHeight - 360));
    const sp = SPECS[bigId](w, h);
    $('#bigTitle').textContent = sp.title; $('#bigSub').textContent = sp.sub;
    $('#bigChips').innerHTML = sp.chips;
    body.innerHTML = sp.svg; $('#bigLegend').innerHTML = sp.legend;
  }
  function openBig(id, card) {
    bigId = id; bigCard = card;
    big.showModal(); renderBig();
    const from = card.getBoundingClientRect(), to = big.getBoundingClientRect();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const s = Math.min(1.2, from.width / to.width), dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
    big.animate([{ transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 0 }, { opacity: 1, offset: .35 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: EASE });
  }
  function closeBig() {
    if (!big.open || big.closing) return;
    big.closing = true;
    const fin = () => { big.closing = false; big.close(); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return fin();
    let end = 'scale(.96)';
    if (bigCard && bigCard.isConnected) {
      const f = bigCard.getBoundingClientRect(), t = big.getBoundingClientRect();
      end = `translate(${f.left + f.width / 2 - (t.left + t.width / 2)}px,${f.top + f.height / 2 - (t.top + t.height / 2)}px) scale(${Math.min(1.2, f.width / t.width)})`;
    }
    big.animate([{ transform: 'none', opacity: 1 }, { opacity: 0, offset: .8 }, { transform: end, opacity: 0 }], { duration: 380, easing: EASE }).onfinish = fin;
  }
  $('#bigClose').onclick = closeBig;
  big.addEventListener('cancel', e => { e.preventDefault(); closeBig(); });
  big.addEventListener('click', e => { if (e.target === big) closeBig(); });
  let rz; window.addEventListener('resize', () => { if (big.open) { clearTimeout(rz); rz = setTimeout(renderBig, 160); } });

  /* ---------- Tooltip ---------- */
  const tip = $('#tip');
  document.addEventListener('mousemove', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { tip.classList.remove('on'); return; }
    const host = big.open ? big : document.body; // the open dialog sits in the top layer, so the tooltip must live inside it
    if (tip.parentNode !== host) host.appendChild(tip);
    tip.textContent = t.dataset.tip; tip.classList.add('on');
    tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 12) + 'px'; tip.style.top = (e.clientY - 38) + 'px';
  });

  /* ---------- Currency, timers, boot ---------- */
  if (state.currency === 'INR') refreshRate();

  setInterval(() => {
    const now = Date.now();
    state.tasks.forEach(t => { const el = $(`[data-timer="${t.id}"]`); if (el) el.textContent = clock(G.taskElapsed(t, now)); });
    document.querySelectorAll('[data-due]').forEach(el => { const d = dueInfo(+el.dataset.due, now); el.textContent = d.text; el.className = 'due ' + d.cls; });
    const tt = $('#totalTime'); if (tt) tt.textContent = hours(totalTime(now));
  }, 250);

  window.addEventListener('resize', movePill);
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS.includes(v) && v !== view) { view = v; render(); } });
  window.addEventListener('storage', () => { state = G.load(); render(false); });
  if (!VIEWS.includes(view)) view = 'today';
  syncSound();
  render();
  startSplash();
  setInterval(async () => {
    if (view !== 'today' || document.hidden) return;
    const r = await Quotes.get(G.today());
    if (state.quote && state.quote.date !== G.today()) return;
    state.quote = { date: G.today(), text: r.text, author: r.author }; persist();
    const card = $('#todayQuote');
    if (card) { card.querySelector('blockquote').textContent = `“${r.text}”`; card.querySelector('figcaption span').textContent = '— ' + r.author; }
  }, 20000);
  document.fonts && document.fonts.ready.then(movePill);
})();
