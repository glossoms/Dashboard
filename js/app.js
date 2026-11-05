(function () {
  const G = window.Gloom, $ = (s, r = document) => r.querySelector(s);
  let state = G.load();
  let view = location.hash.slice(1) || 'overview';
  let editingId = null, editingTask = null;
  const persist = () => G.save(state);

  const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CHF'];
  const money = (n, frac) => new Intl.NumberFormat(undefined, { style: 'currency', currency: state.currency, minimumFractionDigits: frac ?? (Number.isInteger(n) ? 0 : 2), maximumFractionDigits: 2 }).format(n);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = s => parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const monthName = (k, long) => parseDate(k + '-01').toLocaleDateString(undefined, { month: long ? 'long' : 'short', ...(long ? { year: 'numeric' } : {}) });
  const clock = ms => { const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; };
  const hours = ms => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

  /* ---------- Views ---------- */
  function overview() {
    const nowKey = G.monthKey(G.today()), st = G.stats(state.commissions, nowKey);
    const sorted = G.sortByDate(state.commissions);
    const series = G.monthlySeries(state.commissions, 6, nowKey);
    const timeMs = state.tasks.reduce((s, t) => s + G.taskElapsed(t), 0);
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
      ${stat('clock', 'Time tracked', `<span id="totalTime">${hours(timeMs)}</span>`, 'all tasks')}
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
      <div class="grow"><div class="name">${esc(c.name)}</div><div class="muted">${fmtDate(c.date)}</div></div>
      <div class="price">${money(c.price)}</div>
      <button class="icon" data-act="edit" data-id="${c.id}" aria-label="Edit">${icon('edit')}</button>
      <button class="icon danger" data-act="del" data-id="${c.id}" aria-label="Delete">${icon('trash')}</button></li>`).join('');
    return `<div class="bar-head"><h1>Commissions</h1><button class="btn primary" data-act="add">${icon('plus')}<span>Add</span></button></div>
      ${list.length ? `<ul class="list card">${items}</ul>` : `<div class="empty card">${icon('wallet')}<p>No commissions yet</p></div>`}`;
  }

  function taskItem(t) {
    const running = !!t.startedAt;
    const title = editingTask === t.id
      ? `<input class="inline" data-edit="${t.id}" value="${esc(t.title)}" maxlength="120">`
      : `<div class="name ${t.done ? 'strike' : ''}">${esc(t.title)}</div>`;
    return `<li class="item task ${running ? 'running' : ''}" data-id="${t.id}">
      <button class="check ${t.done ? 'on' : ''}" data-act="toggle" data-id="${t.id}" aria-label="Complete">${icon('check')}</button>
      <div class="grow">${title}</div>
      <span class="time" data-timer="${t.id}">${clock(G.taskElapsed(t))}</span>
      ${t.done ? '' : `<button class="icon ${running ? 'live' : ''}" data-act="${running ? 'pause' : 'start'}" data-id="${t.id}" aria-label="${running ? 'Pause' : 'Start'}">${icon(running ? 'pause' : 'play')}</button>`}
      <button class="icon" data-act="reset" data-id="${t.id}" aria-label="Reset timer">${icon('reset')}</button>
      <button class="icon" data-act="rename" data-id="${t.id}" aria-label="Edit">${icon('edit')}</button>
      <button class="icon danger" data-act="deltask" data-id="${t.id}" aria-label="Delete">${icon('trash')}</button></li>`;
  }

  function tasks() {
    const pending = state.tasks.filter(t => !t.done), done = state.tasks.filter(t => t.done);
    const sec = (label, arr, msg) => `<h3 class="sec">${label}<span>${arr.length}</span></h3>${arr.length ? `<ul class="list card">${arr.map(taskItem).join('')}</ul>` : `<div class="empty card slim"><p>${msg}</p></div>`}`;
    return `<div class="bar-head"><h1>Tasks</h1></div>
      <form class="newtask card" id="newTask" autocomplete="off"><input name="t" placeholder="New task" maxlength="120" aria-label="New task"><button class="btn primary" type="submit" aria-label="Add task">${icon('plus')}</button></form>
      ${sec('Pending', pending, 'All clear')}${sec('Completed', done, 'Nothing completed yet')}`;
  }

  /* ---------- Rendering ---------- */
  function render(animate = true) {
    const el = $('#view');
    el.className = animate ? 'fade' : '';
    el.innerHTML = { overview, commissions, tasks }[view]();
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    movePill();
    countUp();
    const inp = $('[data-edit]'); if (inp) { inp.focus(); inp.select(); }
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

  /* ---------- Commission dialog ---------- */
  const dlg = $('#dlg'), form = $('#form');
  function openDialog(id) {
    editingId = id || null;
    const c = state.commissions.find(x => x.id === id);
    $('#dlgTitle').textContent = c ? 'Edit commission' : 'New commission';
    form.name.value = c ? c.name : ''; form.price.value = c ? c.price : ''; form.date.value = c ? c.date : G.today();
    dlg.showModal(); form.name.focus();
  }
  form.addEventListener('submit', e => {
    const name = form.name.value.trim(), price = parseFloat(form.price.value), date = form.date.value;
    if (!name || !isFinite(price) || price < 0 || !date) { e.preventDefault(); return; }
    if (editingId) Object.assign(state.commissions.find(c => c.id === editingId), { name, price, date });
    else state.commissions.push({ id: G.uid(), name, price, date, created: Date.now() });
    persist(); render(false);
  });
  $('#cancel').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  /* ---------- Actions ---------- */
  const task = id => state.tasks.find(t => t.id === id);
  const pauseT = t => { if (t.startedAt) { t.elapsed = G.taskElapsed(t); t.startedAt = null; } };
  const actions = {
    add: () => openDialog(),
    edit: id => openDialog(id),
    del: id => { const c = state.commissions.find(x => x.id === id); if (c && confirm(`Delete “${c.name}”?`)) { state.commissions = state.commissions.filter(x => x.id !== id); persist(); render(false); } },
    toggle: id => { const t = task(id); pauseT(t); t.done = !t.done; persist(); render(false); },
    start: id => { const t = task(id); if (!t.startedAt) t.startedAt = Date.now(); persist(); render(false); },
    pause: id => { pauseT(task(id)); persist(); render(false); },
    reset: id => { const t = task(id), was = !!t.startedAt; t.elapsed = 0; t.startedAt = was ? Date.now() : null; persist(); render(false); },
    rename: id => { editingTask = id; render(false); },
    deltask: id => { const t = task(id); if (t && confirm(`Delete “${t.title}”?`)) { state.tasks = state.tasks.filter(x => x.id !== id); persist(); render(false); } }
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (b) actions[b.dataset.act](b.dataset.id);
    const t = e.target.closest('#tabs button'); if (t) setView(t.dataset.view);
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'newTask') return;
    e.preventDefault();
    const v = e.target.t.value.trim(); if (!v) return;
    state.tasks.unshift({ id: G.uid(), title: v, done: false, elapsed: 0, startedAt: null, created: Date.now() });
    persist(); render(false); $('#newTask input').focus();
  });
  function commitEdit(inp, save) {
    const t = task(inp.dataset.edit), v = inp.value.trim();
    if (save && v && t) { t.title = v; persist(); }
    editingTask = null; render(false);
  }
  document.addEventListener('keydown', e => {
    if (e.target.dataset && e.target.dataset.edit) {
      if (e.key === 'Enter') commitEdit(e.target, true);
      if (e.key === 'Escape') commitEdit(e.target, false);
    }
  });
  document.addEventListener('focusout', e => { if (e.target.dataset && e.target.dataset.edit && editingTask) commitEdit(e.target, true); });

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
    const tt = $('#totalTime'); if (tt) tt.textContent = hours(state.tasks.reduce((s, t) => s + G.taskElapsed(t, now), 0));
  }, 250);

  window.addEventListener('resize', movePill);
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (['overview', 'commissions', 'tasks'].includes(v) && v !== view) { view = v; render(); } });
  window.addEventListener('storage', () => { state = G.load(); render(false); });
  if (!['overview', 'commissions', 'tasks'].includes(view)) view = 'overview';
  render();
  document.fonts && document.fonts.ready.then(movePill);
})();
