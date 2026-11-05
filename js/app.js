(function () {
  const G = window.Gloom, $ = (s, r = document) => r.querySelector(s);
  let state = G.load();
  state.tasks = state.tasks.filter(t => !t.done).map(t => Object.assign({ price: 0 }, t)); // migrate old to-do items
  let view = location.hash.slice(1) || 'overview';
  let editingId = null;
  const persist = () => G.save(state);

  const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CHF'];
  const money = (n, frac) => new Intl.NumberFormat(undefined, { style: 'currency', currency: state.currency, minimumFractionDigits: frac ?? (Number.isInteger(n) ? 0 : 2), maximumFractionDigits: 2 }).format(n);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
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
    const barItems = sorted.slice(-12).map(c => ({ label: esc(c.name.length > 9 ? c.name.slice(0, 8) + '…' : c.name), value: c.price, tip: `${esc(c.name)} · ${money(c.price)} · ${fmtDate(c.date)}` }));
    const lineItems = series.map(m => ({ label: monthName(m.key), value: m.count, tip: `${monthName(m.key, true)} · ${m.count} commission${m.count === 1 ? '' : 's'}` }));
    const rows = series.slice().reverse().map(m => `<tr><td>${monthName(m.key, true)}</td><td>${m.count}</td><td>${m.count ? money(m.avg) : '–'}</td><td class="r">${money(m.revenue)}</td></tr>`).join('');
    return `
    <section class="hero card rise">
      <div><div class="eyebrow">${monthName(nowKey, true)}</div>
      <div class="big" id="bigRev" data-value="${st.monthRevenue}">${money(st.monthRevenue)}</div>
      <div class="sub">${delta}${st.delta === null ? '' : '<span class="muted">vs last month</span>'}</div></div>
      <button class="btn primary" data-act="add">${icon('plus')}<span>Commission</span></button>
    </section>
    <section class="stats">
      ${stat('wallet', 'This month', st.monthCount, 'commissions')}
      ${stat('grid', 'Average', money(st.monthAvg), 'per commission')}
      ${stat('clock', 'Time tracked', `<span id="totalTime">${hours(timeMs)}</span>`, 'all work')}
      ${stat('up', 'All time', money(st.total), `${st.count} total`)}
    </section>
    <section class="charts">
      <div class="card rise"><h3>Revenue per commission</h3>${Charts.bars(barItems)}</div>
      <div class="card rise"><h3>Commissions per month</h3>${Charts.line(lineItems)}</div>
    </section>
    <section class="card rise"><h3>Monthly overview</h3>
      <div class="scroll"><table><thead><tr><th>Month</th><th>Count</th><th>Average</th><th class="r">Revenue</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${st.best ? `<div class="best">${icon('up')}<span>Top: <b>${esc(st.best.name)}</b> · ${money(st.best.price)}</span></div>` : ''}
    </section>`;
  }
  const stat = (ic, label, val, note) => `<div class="card stat rise">${icon(ic)}<div class="lab">${label}</div><div class="val">${val}</div><div class="muted">${note}</div></div>`;

  function commissions() {
    const list = G.sortByDate(state.commissions).reverse();
    const items = list.map((c, i) => `<li class="item rise" style="animation-delay:${Math.min(i, 10) * 30}ms">
      <div class="grow"><div class="name">${esc(c.name)}</div><div class="muted">${fmtDate(c.date)}${c.time >= 60000 ? ' · ' + hours(c.time) : ''}</div></div>
      <div class="price">${money(c.price)}</div>
      <button class="icon" data-act="edit" data-id="${c.id}" aria-label="Edit">${icon('edit')}</button>
      <button class="icon danger" data-act="del" data-id="${c.id}" aria-label="Delete">${icon('trash')}</button></li>`).join('');
    return `<div class="bar-head"><h1>Commissions</h1><button class="btn primary" data-act="add">${icon('plus')}<span>Add</span></button></div>
      ${list.length ? `<ul class="list card">${items}</ul>` : `<div class="empty card">${icon('wallet')}<p>No commissions yet</p></div>`}`;
  }

  function taskItem(t) {
    const running = !!t.startedAt;
    return `<li class="item task ${running ? 'running' : ''}">
      <div class="grow"><div class="name">${esc(t.title)}</div><div class="muted">${money(t.price || 0)}</div></div>
      <span class="time" data-timer="${t.id}">${clock(G.taskElapsed(t))}</span>
      <button class="icon ${running ? 'live' : ''}" data-act="${running ? 'pause' : 'start'}" data-id="${t.id}" aria-label="${running ? 'Pause' : 'Start'}">${icon(running ? 'pause' : 'play')}</button>
      <button class="icon" data-act="reset" data-id="${t.id}" aria-label="Reset timer">${icon('reset')}</button>
      <button class="icon" data-act="edittask" data-id="${t.id}" aria-label="Edit">${icon('edit')}</button>
      <button class="icon danger" data-act="deltask" data-id="${t.id}" aria-label="Delete">${icon('trash')}</button>
      <button class="btn complete" data-act="complete" data-id="${t.id}">${icon('check')}<span>Complete</span></button></li>`;
  }

  function tasks() {
    return `<div class="bar-head"><h1>Pending</h1></div>
      <form class="newtask card" id="newTask" autocomplete="off">
        <input name="t" placeholder="New pending commission" maxlength="80" required aria-label="Commission name">
        <input name="p" class="pr" type="number" min="0" step="0.01" placeholder="Price" required inputmode="decimal" aria-label="Price">
        <button class="btn primary" type="submit" aria-label="Add">${icon('plus')}</button></form>
      ${state.tasks.length ? `<ul class="list card">${state.tasks.map(taskItem).join('')}</ul>` : `<div class="empty card">${icon('list')}<p>Nothing pending</p></div>`}`;
  }

  /* ---------- Rendering ---------- */
  function render(animate = true) {
    const el = $('#view');
    el.className = animate ? 'fade' : '';
    el.innerHTML = { overview, commissions, tasks }[view]();
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    movePill();
    countUp();
  }
  function movePill() {
    const b = $('#tabs button.on'), p = $('#pill');
    if (b) { p.style.width = b.offsetWidth + 'px'; p.style.transform = `translateX(${b.offsetLeft}px)`; }
  }
  function countUp() {
    const el = $('#bigRev'); if (!el) return;
    const target = +el.dataset.value, t0 = performance.now();
    if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    (function f(t) {
      const p = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - p, 3);
      el.textContent = money(p < 1 ? Math.round(target * e) : target);
      if (p < 1) requestAnimationFrame(f);
    })(t0);
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
    $('#dateLabel').hidden = kind === 'task'; form.date.required = kind !== 'task';
    form.name.value = c ? (c.name || c.title) : ''; form.price.value = c ? c.price : ''; form.date.value = (c && c.date) || G.today();
    dlg.showModal(); form.name.focus();
  }
  form.addEventListener('submit', e => {
    const name = form.name.value.trim(), price = parseFloat(form.price.value), date = form.date.value, isTask = editingKind === 'task';
    if (!name || !isFinite(price) || price < 0 || (!isTask && !date)) { e.preventDefault(); return; }
    if (isTask) Object.assign(task(editingId), { title: name, price });
    else if (editingId) Object.assign(state.commissions.find(c => c.id === editingId), { name, price, date });
    else state.commissions.push({ id: G.uid(), name, price, date, time: 0, created: Date.now() });
    persist(); render(false);
  });
  $('#cancel').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  function toast(msg) {
    const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = icon('check') + esc(msg);
    document.body.appendChild(el); setTimeout(() => el.remove(), 2400);
  }

  /* ---------- Actions ---------- */
  const pauseT = t => { if (t.startedAt) { t.elapsed = G.taskElapsed(t); t.startedAt = null; } };
  const actions = {
    add: () => openDialog(),
    edit: id => openDialog(id),
    del: id => { const c = state.commissions.find(x => x.id === id); if (c && confirm(`Delete “${c.name}”?`)) { state.commissions = state.commissions.filter(x => x.id !== id); persist(); render(false); } },
    start: id => { const t = task(id); if (!t.startedAt) t.startedAt = Date.now(); persist(); render(false); },
    pause: id => { pauseT(task(id)); persist(); render(false); },
    reset: id => { const t = task(id), was = !!t.startedAt; t.elapsed = 0; t.startedAt = was ? Date.now() : null; persist(); render(false); },
    edittask: id => openDialog(id, 'task'),
    deltask: id => { const t = task(id); if (t && confirm(`Delete “${t.title}”?`)) { state.tasks = state.tasks.filter(x => x.id !== id); persist(); render(false); } },
    complete: id => {
      const t = task(id); if (!t) return;
      pauseT(t);
      state.commissions.push({ id: G.uid(), name: t.title, price: t.price || 0, date: G.today(), time: t.elapsed, created: Date.now() });
      state.tasks = state.tasks.filter(x => x.id !== id);
      persist(); render(false); toast('Added to your commissions');
    }
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (b) actions[b.dataset.act](b.dataset.id);
    const t = e.target.closest('#tabs button'); if (t) setView(t.dataset.view);
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'newTask') return;
    e.preventDefault();
    const title = e.target.t.value.trim(), price = parseFloat(e.target.p.value);
    if (!title || !isFinite(price) || price < 0) return;
    state.tasks.unshift({ id: G.uid(), title, price, elapsed: 0, startedAt: null, created: Date.now() });
    persist(); render(false); $('#newTask input').focus();
  });

  /* ---------- Tooltip ---------- */
  const tip = $('#tip');
  document.addEventListener('mousemove', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) { tip.classList.remove('on'); return; }
    tip.textContent = t.dataset.tip; tip.classList.add('on');
    tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 12) + 'px'; tip.style.top = (e.clientY - 38) + 'px';
  });

  /* ---------- Currency, timers, boot ---------- */
  const cur = $('#currency');
  cur.innerHTML = CURRENCIES.map(c => `<option>${c}</option>`).join('');
  cur.value = state.currency;
  cur.onchange = () => { state.currency = cur.value; persist(); render(false); };

  setInterval(() => {
    const now = Date.now();
    state.tasks.forEach(t => { const el = $(`[data-timer="${t.id}"]`); if (el) el.textContent = clock(G.taskElapsed(t, now)); });
    const tt = $('#totalTime'); if (tt) tt.textContent = hours(totalTime(now));
  }, 250);

  window.addEventListener('resize', movePill);
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (['overview', 'commissions', 'tasks'].includes(v) && v !== view) { view = v; render(); } });
  window.addEventListener('storage', () => { state = G.load(); render(false); });
  if (!['overview', 'commissions', 'tasks'].includes(view)) view = 'overview';
  render();
  document.fonts && document.fonts.ready.then(movePill);
})();
