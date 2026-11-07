if (typeof window !== 'undefined') (window.GLOOM_FILES = window.GLOOM_FILES || {})['app.js'] = '21';
(function () {
  const G = window.Gloom,
    $ = (s, r = document) => r.querySelector(s);
  /* Helper modules degrade gracefully, so one missing file can never blank the app. */
  const Sound = window.Sound || { play() {}, set() {}, get: () => false };
  const Quotes = window.Quotes || {
    get: async () => ({ text: 'Begin where you are.', author: 'Gloom' }),
    next: async () => ({ text: 'Begin where you are.', author: 'Gloom' })
  };
  const Charts = window.Charts || { bars: () => '', line: () => '', combo: () => '', grouped: () => '' };
  const Dom = window.Dom || {
    morph: (el, html) => {
      el.innerHTML = html;
    },
    closeDialog: d => d.close(),
    swapText: (el, t, apply) => (apply ? apply() : (el.textContent = t)),
    reduced: () => false
  };
  const Roblox = window.Roblox || {
    cached: () => undefined,
    thumbnail: async () => null,
    invalidate() {},
    parseExperience: () => null,
    experience: async () => {
      throw new Error('roblox.js is missing');
    },
    pool: async () => [],
    isDown: () => true
  };
  let state = G.load();
  const VIEWS = ['today', 'overview', 'commissions', 'tasks', 'clients'];
  let view = location.hash.slice(1) || 'today';
  let editingId = null,
    editingRate = false,
    overviewRangeOpen = false,
    editingAwaitingId = null,
    editingPercentId = null,
    editingTimeId = null;
  const persist = () => G.saveSoon(state);
  const syncBrand = () => {
    const brand = $('#brand');
    if (brand) brand.textContent = state.name || 'Gloom';
  };

  /* All amounts are stored in USD; INR is a display conversion using state.rate. */
  const rate = () => (state.currency === 'INR' ? state.rate.value : 1);
  const SYM = { USD: '$', INR: '₹' };
  const money = usd => {
    const v = usd * rate();
    if (state.currency === 'INR')
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
      maximumFractionDigits: 2
    }).format(v);
  };
  const dur = ms => {
    const m = Math.round(ms / 60000);
    if (m < 1) return '<1m';
    const d = Math.floor(m / 1440),
      h = Math.floor((m % 1440) / 60),
      mm = m % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
  };
  const dueInfo = (due, now = Date.now()) => {
    const diff = due - now;
    return diff < 0
      ? { text: 'Overdue ' + dur(-diff), cls: 'late' }
      : { text: dur(diff) + ' left', cls: diff < 864e5 ? 'soon' : '' };
  };
  const nextMonthStart = (ts = Date.now()) => {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  };
  const countdown = (ts, now = Date.now()) => {
    if (ts <= now) return 'Payout due';
    const s = Math.ceil((ts - now) / 1000),
      d = Math.floor(s / 86400),
      h = Math.floor((s % 86400) / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = s % 60;
    return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
  };
  const toLocalInput = ts => {
    const d = new Date(ts),
      p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const rateNote = () => {
    if (state.currency !== 'INR') return '';
    const r = state.rate;
    const val = editingRate
      ? `<input class="rate-in" type="number" step="0.01" min="0.01" value="${r.value}" aria-label="Conversion rate">`
      : `<b>${r.value.toFixed(2)}</b>`;
    const tools = editingRate
      ? ''
      : `<button class="icon xs" data-act="editrate" aria-label="Edit rate">${icon('edit')}</button>${r.manual ? `<button class="icon xs" data-act="liverate" aria-label="Use live rate">${icon('reset')}</button>` : ''}`;
    return `<div class="rate">Current conversion rate : ${val} INR / 1 $${tools}</div>`;
  };
  const esc = s =>
    String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
  const clientOf = id => state.clients.find(c => c.id === id);
  const hue = s => {
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  };
  /* Client avatar: the Roblox headshot when an ID is set (cached, loaded in the background); initials otherwise. */
  function avatar(c, size = '') {
    if (!c) return '';
    const ini = esc(
      c.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(w => w[0] || '')
        .join('')
        .toUpperCase()
    );
    let img = '';
    if (c.roblox) {
      const url = Roblox.cached(c.roblox);
      img = `<img data-roblox-id="${esc(c.roblox)}"${url ? ` src="${esc(url)}"` : ' hidden'} alt="" loading="lazy" referrerpolicy="no-referrer">`;
    }
    return `<span class="av ${size}" style="--h:${hue(c.name)}" title="${esc(c.name)}"><span class="av-f">${ini}</span>${img}</span>`;
  }
  const boundAvatars = new WeakSet();
  function loadRobloxAvatars(root = document) {
    root.querySelectorAll('img[data-roblox-id]').forEach(img => {
      if (boundAvatars.has(img)) return;
      boundAvatars.add(img);
      const id = img.dataset.robloxId;
      img.addEventListener(
        'error',
        () => {
          Roblox.invalidate(id);
          img.remove();
        },
        { once: true }
      );
      if (img.getAttribute('src')) {
        img.hidden = false;
        return;
      }
      Roblox.thumbnail(id).then(url => {
        if (url && img.isConnected) {
          img.src = url;
          img.hidden = false;
        }
      });
    });
  }
  const clientOpts = sel =>
    '<option value="">No client</option>' +
    state.clients
      .map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`)
      .join('');
  const parseDate = s => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const fmtDate = s => parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const monthName = (k, long) =>
    parseDate(k + '-01').toLocaleDateString(undefined, {
      month: long ? 'long' : 'short',
      ...(long ? { year: 'numeric' } : {})
    });
  const clock = ms => {
    const t = Math.floor(ms / 1000),
      h = Math.floor(t / 3600),
      m = Math.floor(t / 60) % 60,
      s = t % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  const totalTime = (now = Date.now()) =>
    state.tasks.reduce((s, t) => s + G.taskElapsed(t, now), 0) +
    state.commissions.reduce((s, c) => s + (c.time || 0), 0);
  const hours = ms => {
    const m = Math.floor(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  };
  const wiseFee = amount => (amount > 0 ? Math.round((amount * 0.018 * 1.18 + 2) * 100) / 100 : 0);

  /* ---------- Views ---------- */
  const OVERVIEW_PERIODS = {
    '30d': { days: 30, label: '30 days' },
    '90d': { days: 90, label: '90 days' },
    '6m': { days: 183, label: '6 months' },
    '12m': { days: 365, label: '12 months' }
  };
  const recognizedAmount = c => (c.netPrice == null ? c.price : c.netPrice);
  function overviewData() {
    const period = OVERVIEW_PERIODS[state.overviewRange] || OVERVIEW_PERIODS['6m'];
    const since = new Date();
    since.setDate(since.getDate() - period.days);
    const startKey = G.today(since),
      nowKey = G.monthKey(G.today());
    const [sy, sm] = startKey.slice(0, 7).split('-').map(Number),
      [ny, nm] = nowKey.split('-').map(Number);
    const months = Math.max(1, (ny - sy) * 12 + nm - sm + 1);
    return {
      ...period,
      startKey,
      nowKey,
      months,
      commissions: state.commissions.filter(c => c.date >= startKey).map(c => ({ ...c, price: recognizedAmount(c) }))
    };
  }
  function overviewTime(range) {
    const unpaidPercentTime = state.percentages.reduce(
      (sum, contract) =>
        sum +
        (Array.isArray(contract.works) ? contract.works : []).reduce((workSum, work) => {
          const finishedAt = new Date(work.finishedAt).getTime();
          return finishedAt && G.today(new Date(finishedAt)) >= range.startKey
            ? workSum + Math.max(0, Number(work.time) || 0)
            : workSum;
        }, 0),
      0
    );
    return (
      range.commissions.reduce((s, c) => s + (c.time || 0), 0) +
      state.tasks
        .filter(t => t.created && G.today(new Date(t.created)) >= range.startKey)
        .reduce((s, t) => s + G.taskElapsed(t), 0) +
      unpaidPercentTime
    );
  }
  function timeItemsFor(range, limit = null) {
    const items = [
      ...range.commissions
        .filter(c => Number(c.time) > 0)
        .map(c => ({
          stamp: new Date(c.date + 'T00:00:00').getTime(),
          label: String(c.name || 'Commission').slice(0, 9),
          value: Math.max(0, Number(c.time) || 0) / 36e5,
          tip: `${esc(c.name || 'Commission')} · ${hours(c.time)} tracked${c.payoutWorkCount ? ` · ${c.payoutWorkCount} works` : ''}`
        })),
      ...state.percentages.flatMap(contract =>
        (Array.isArray(contract.works) ? contract.works : [])
          .filter(work => work.time > 0 && work.finishedAt && G.today(new Date(work.finishedAt)) >= range.startKey)
          .map(work => ({
            stamp: Number(work.finishedAt),
            label: String(work.name || 'Percentage work').slice(0, 9),
            value: Math.max(0, Number(work.time) || 0) / 36e5,
            tip: `${esc(work.name || 'Percentage work')} · ${hours(work.time)} tracked · unpaid percentage work`
          }))
      )
    ].sort((a, b) => a.stamp - b.stamp);
    return limit ? items.slice(-limit) : items;
  }
  function overview() {
    const range = overviewData(),
      list = range.commissions,
      sorted = G.sortByDate(list);
    const series = G.monthlySeries(list, range.months, range.nowKey);
    const revenue = list.reduce((s, c) => s + c.price, 0),
      count = list.length,
      average = count ? revenue / count : 0;
    const timeMs = overviewTime(range);
    const timedPaid = list.filter(c => c.payoutType !== 'monthly-percentage' && c.time > 0),
      trackedPaidMs = timedPaid.reduce((s, c) => s + c.time, 0),
      hourlyRevenue = timedPaid.reduce((s, c) => s + c.price, 0),
      hourly = trackedPaidMs ? hourlyRevenue / (trackedPaidMs / 36e5) : null;
    const clientCounts = new Map();
    state.commissions
      .filter(c => c.payoutType !== 'monthly-percentage')
      .forEach(c => {
        if (c.clientId) clientCounts.set(c.clientId, (clientCounts.get(c.clientId) || 0) + 1);
      });
    const clientTotal = state.clients.length,
      repeatClients = state.clients.filter(c => (clientCounts.get(c.id) || 0) > 1).length,
      retention = clientTotal ? Math.round((repeatClients / clientTotal) * 100) : null;
    const allNet = state.commissions.map(c => ({ ...c, price: recognizedAmount(c) })),
      monthPair = G.monthlySeries(allNet, 2, range.nowKey),
      previousMonth = monthPair[0],
      currentMonth = monthPair[1];
    const growth = previousMonth.revenue
      ? ((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100
      : null;
    const growthValue =
      growth === null ? (currentMonth.revenue ? 'New' : '–') : `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`;
    const growthNote = previousMonth.revenue
      ? `${currentMonth.revenue >= previousMonth.revenue ? '+' : '−'}${money(Math.abs(currentMonth.revenue - previousMonth.revenue))} vs ${monthName(previousMonth.key, true)}`
      : `No ${monthName(previousMonth.key)} revenue to compare`;
    const target = Number(state.revenueTarget) || 0,
      currentMonthRevenue = currentMonth.revenue;
    const targetProgress = target > 0 ? Math.min(100, (currentMonthRevenue / target) * 100) : 0;
    const revenueItems = series.map(m => ({
      label: monthName(m.key),
      value: m.revenue * rate(),
      tip: `${monthName(m.key, true)} · revenue ${money(m.revenue)}`
    }));
    const barItems = sorted.slice(-12).map(c => ({
      label: esc(c.name.length > 9 ? c.name.slice(0, 8) + '…' : c.name),
      value: c.price * rate(),
      tip: `${esc(c.name)} · ${money(c.price)} · ${fmtDate(c.date)}`
    }));
    const timeItems = timeItemsFor(range, 12);
    const lineItems = series.map(m => ({
      label: monthName(m.key),
      value: m.count,
      tip: `${monthName(m.key, true)} · ${m.count} commission${m.count === 1 ? '' : 's'}`
    }));
    const ta = G.turnaround(list),
      dl = ta.withDeadline.slice(-8);
    const maxMs = Math.max(0, ...dl.flatMap(i => [i.allotted, i.tracked, i.elapsed])),
      big = maxMs >= 48 * 36e5,
      div = big ? 864e5 : 36e5;
    const gItems = dl.map(i => ({
      label: esc(i.name.length > 9 ? i.name.slice(0, 8) + '…' : i.name),
      a: i.allotted / div,
      b: i.tracked / div,
      f: i.elapsed / div,
      late: i.late,
      tip: `${esc(i.name)} · deadline window ${dur(i.allotted)} · tracked ${dur(i.tracked)} · completed ${i.late ? 'late' : 'on time'}`,
      ftip: `${esc(i.name)} · elapsed from Start to Complete ${dur(i.elapsed)}`
    }));
    const rows = series
      .slice()
      .reverse()
      .map(
        m =>
          `<tr><td>${monthName(m.key, true)}</td><td>${m.count}</td><td>${m.count ? money(m.avg) : '–'}</td><td class="r">${money(m.revenue)}</td></tr>`
      )
      .join('');
    const best = list.reduce((b, c) => (!b || c.price > b.price ? c : b), null),
      bestClient = best && clientOf(best.clientId);
    return `
    <section class="hero card rise">
      <div><div class="eyebrow">Collected revenue</div>
      <button class="big range-trigger" id="bigRev" type="button" data-act="toggleperiod" aria-controls="overviewRangePanel" aria-expanded="${overviewRangeOpen}" title="Choose overview period" data-count="${revenue}" data-kind="money">${money(revenue)}</button>
      <div class="range-panel ${overviewRangeOpen ? 'open' : ''}" id="overviewRangePanel" aria-hidden="${!overviewRangeOpen}"><span class="muted">${range.label} · since ${fmtDate(range.startKey)}</span><select id="overviewRange" aria-label="Overview date range" tabindex="${overviewRangeOpen ? '0' : '-1'}">${Object.entries(
        OVERVIEW_PERIODS
      )
        .map(
          ([k, v]) =>
            `<option value="${k}"${k === (state.overviewRange || '6m') ? ' selected' : ''}>${v.label}</option>`
        )
        .join('')}</select></div>
      <div class="sub"><span class="muted">${count} paid commission${count === 1 ? '' : 's'} in this period</span></div>${rateNote()}</div>
      <button class="btn primary" data-act="add">${icon('plus')}<span>Commission</span></button>
    </section>
    <div class="overview-section-label">${icon('grid')}<span>Performance</span></div>
    <section class="stats">
      ${stat('wallet', 'Paid commissions', count, 'in selected period', [count, 'int'])}
      ${stat('grid', 'Average commission value', money(average), 'per paid commission', [average, 'money'])}
      ${stat('clock', 'Time tracked', `<span id="totalTime">${hours(timeMs)}</span>`, 'in selected period')}
      ${stat('up', 'Revenue growth', growthValue, growthNote)}
    </section>
    <section class="stats insight-stats">
      ${stat('clock', 'Average hourly earnings', hourly === null ? '–' : money(hourly), trackedPaidMs ? 'net revenue per tracked hour' : 'No paid work time tracked')}
      ${stat('users', 'Client retention', retention === null ? '–' : `${retention}%`, clientTotal ? `${repeatClients} of ${clientTotal} clients returned` : 'Add clients to track repeat work')}
      ${stat('up', 'Monthly target progress', target ? `${Math.round(targetProgress)}%` : 'Not set', target ? `${money(currentMonthRevenue)} of ${money(target)} this month` : 'Set a goal below')}
    </section>
    <div class="overview-section-label">${icon('wallet')}<span>Commission trends</span></div>
    <section class="charts">
      <div class="card rise">${expandBtn('rev')}<div class="overview-card-title">${icon('wallet')}<h3>Revenue per commission</h3></div>${Charts.bars(barItems, { id: 'rev', trend: true, trendDots: false, stagger: false })}</div>
      <div class="card rise">${expandBtn('cnt')}<div class="overview-card-title">${icon('grid')}<h3>Commissions per month</h3></div>${Charts.line(lineItems, { id: 'cnt' })}</div>
      <div class="card rise">${expandBtn('time')}<div class="overview-card-title">${icon('clock')}<h3>Time per commission</h3></div>${Charts.bars(timeItems, { id: 'time', trend: true, trendDots: false, stagger: false, empty: 'Add tracked time to a paid commission to see it here' })}</div>
    </section>
    <div class="overview-section-label">${icon('flag')}<span>Delivery & monthly totals</span></div>
    <section class="charts"><div class="card rise">${expandBtn('ddl')}<div class="head"><div class="overview-card-title">${icon('flag')}<h3>Deadline vs actual <span class="muted">(${big ? 'days' : 'hours'})</span></h3></div><span class="muted">Avg turnaround <b>${ta.items.length ? dur(ta.avg) : '–'}</b></span></div>
      ${Charts.grouped(gItems, { id: 'ddl', focus: true })}${gItems.length ? '<div class="legend"><span><i style="background:color-mix(in srgb,var(--mute) 45%,transparent)"></i>Deadline window</span><span><i style="background:var(--green)"></i>On time</span><span><i style="background:var(--red)"></i>Late</span><span>● Elapsed time</span><span>Bar: tracked time when available</span></div>' : ''}</div>
    <div class="card rise"><div class="overview-card-title">${icon('cal')}<h3>Monthly overview</h3></div>
      <div class="scroll"><table><thead><tr><th>Month</th><th>Count</th><th>Average</th><th class="r">Revenue</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${best ? `<div class="best">${icon('up')}<span>Top: ${bestClient ? `<b>${esc(bestClient.name)}</b> · ` : ''}<b>${esc(best.name)}</b> · ${money(best.price)}</span></div>` : ''}
    </div></section>
    <section class="charts target-chart"><div class="card rise">
      <div class="target-head"><div><div class="overview-card-title">${icon('up')}<h3>Monthly revenue vs target</h3></div><div class="muted">Dotted line marks your monthly goal</div></div><form id="revenueTargetForm" class="target-form"><label for="revenueTargetInput">Goal (${SYM[state.currency]})</label><input id="revenueTargetInput" name="target" type="number" min="0" step="0.01" value="${target ? (Math.round(target * rate() * 100) / 100).toFixed(2) : ''}" placeholder="Set monthly goal"><button class="btn primary" type="submit">Save</button></form></div>
      ${target ? `<div class="target-progress"><div class="target-progress-label"><span>This month</span><b>${money(currentMonthRevenue)} / ${money(target)}</b></div><div class="target-track"><i style="width:${targetProgress}%"></i></div></div>` : ''}
      ${Charts.line(revenueItems, { id: 'targetRevenue', target: target * rate(), targetTip: `Monthly target · ${money(target)}` })}
    </div></section>`;
  }
  const stat = (ic, label, val, note, count) =>
    `<div class="card stat rise">${icon(ic)}<div class="lab">${label}</div><div class="val"${count ? ` data-count="${count[0]}" data-kind="${count[1]}"` : ''}>${val}</div><div class="muted">${note}</div></div>`;
  const expandBtn = id =>
    `<button class="expand" data-act="expand" data-id="${id}" aria-label="Expand chart">${icon('expand')}</button>`;

  function commissions() {
    const list = G.sortByDate(state.commissions).reverse();
    const awaiting = state.awaiting || [];
    const percentages = state.percentages || [];
    const items = list
      .map(
        (c, i) => `<li class="item rise" data-key="${c.id}" style="animation-delay:${Math.min(i, 10) * 30}ms">
      ${avatar(clientOf(c.clientId), 'sm')}<div class="grow"><div class="name">${esc(c.name)}</div><div class="muted">${clientOf(c.clientId) ? esc(clientOf(c.clientId).name) + ' · ' : ''}${fmtDate(c.date)}${c.time >= 60000 ? ' · ' + hours(c.time) : c.time > 0 ? ' · <1m' : ''}${c.payoutType === 'monthly-percentage' ? ` · ${Number(c.payoutRate || 0)}% monthly payout${Number.isFinite(Number(c.payoutWorkCount)) ? ` · ${Number(c.payoutWorkCount)} work${Number(c.payoutWorkCount) === 1 ? '' : 's'}` : ''}` : ''}${c.netPrice != null ? ` · Gross ${money(c.grossPrice ?? c.price)} · Wise est. fee ${money(c.paymentFee || 0)} · Net ${money(c.netPrice)}` : ''}</div></div>
      <div class="price">${money(c.grossPrice ?? c.price)}</div>
      <button class="icon" data-act="edit" data-id="${c.id}" aria-label="Edit">${icon('edit')}</button>
      <button class="icon danger" data-act="del" data-id="${c.id}" aria-label="Delete">${icon('trash')}</button></li>`
      )
      .join('');
    const waitingItems = awaiting
      .map(c => {
        const fee = wiseFee(c.price || 0),
          net = Math.max(0, (c.price || 0) - fee),
          editing = editingAwaitingId === c.id;
        return `<li class="item awaiting-item" data-key="${c.id}">
        ${avatar(clientOf(c.clientId), 'sm')}<div class="grow"><div class="name">${esc(c.name)}</div><div class="muted">${clientOf(c.clientId) ? esc(clientOf(c.clientId).name) + ' · ' : ''}Work finished ${fmtDate(c.finishedDate || G.today())}${c.time >= 60000 ? ' · ' + hours(c.time) : ''}</div>
        <div class="awaiting-estimate" title="Approximation: 1.8% conversion fee, 18% GST on that fee, plus a fixed $2 transfer charge">Wise estimate: ${money(fee)} fee · ${money(net)} net <span class="muted">(approx.)</span></div></div>
        ${editing ? `<div class="awaiting-price-edit"><label for="awaitingPrice">Gross amount (${SYM[state.currency]})</label><input id="awaitingPrice" type="number" min="0" step="0.01" value="${(Math.round((c.price || 0) * rate() * 100) / 100).toFixed(2)}"><button class="btn primary" data-act="saveawaiting" data-id="${c.id}">Save</button><button class="btn ghost" data-act="cancelawaiting">Cancel</button></div>` : `<div class="awaiting-payment"><div class="awaiting-gross"><button class="icon awaiting-edit-btn" data-act="editawaiting" data-id="${c.id}" aria-label="Edit expected amount" title="Edit expected amount">${icon('edit')}</button><span class="price">${money(c.price || 0)}</span></div><select class="payment-method" data-awaiting-method="${c.id}" aria-label="Payment method"><option value="wise"${(c.paymentMethod || 'wise') === 'wise' ? ' selected' : ''}>Wise</option><option value="paypal" disabled>PayPal · coming soon</option></select><button class="btn primary paid-btn" data-act="paid" data-id="${c.id}">${icon('check')}<span>Payment completed</span></button></div>`}
      </li>`;
      })
      .join('');
    const percentItems = percentages
      .map(c => {
        const works = Array.isArray(c.works) ? c.works : [{ name: c.name, time: 0 }],
          projectNames = works.map(w => w.name).filter(Boolean).join(' · '),
          trackedTime = works.reduce((total, work) => total + Math.max(0, Number(work.time) || 0), 0),
          trackedTimeLabel = trackedTime > 0 ? ` · ${hours(trackedTime)} tracked` : '',
          who = clientOf(c.clientId);
        return `<li class="item percentage-item" data-key="${c.id}">${avatar(who, 'sm')}<div class="grow"><div class="name">${who ? esc(who.name) : esc(c.name || projectNames)}</div><div class="muted">${Number(c.percentRate || 0)}% monthly · ${works.length} work${works.length === 1 ? '' : 's'} since last payout${trackedTimeLabel}${projectNames ? ` · ${esc(projectNames)}` : ''}</div><div class="muted">Next payout ${fmtDate(G.today(new Date(c.nextPaymentAt)))}</div><div class="next-payout" data-next-payout="${c.nextPaymentAt}">${countdown(c.nextPaymentAt)}</div></div>
      ${editingPercentId === c.id ? `<div class="percent-entry"><label for="percentPayoutAmount">Amount received (USD)</label><input id="percentPayoutAmount" type="number" min="0.01" step="0.01" placeholder="0.00"><button class="btn primary" data-act="savepercent" data-id="${c.id}">Add payout</button><button class="btn ghost" data-act="cancelpercent">Cancel</button></div>` : `<button class="btn primary" data-act="recordpercent" data-id="${c.id}">${icon('plus')}<span>Record payout</span></button><button class="icon danger" data-act="endpercent" data-id="${c.id}" aria-label="End monthly percentage" title="End monthly percentage">${icon('close')}</button>`}</li>`;
      })
      .join('');
    return `<div class="bar-head"><div><h1>Commissions</h1>${rateNote()}</div><button class="btn primary" data-act="add">${icon('plus')}<span>Add</span></button></div>
      ${awaiting.length ? `<section class="awaiting-section"><div class="section-title"><h2>Awaiting payment</h2><span class="muted">${awaiting.length} finished</span></div><ul class="list card">${waitingItems}</ul></section>` : ''}
      ${percentages.length ? `<section class="awaiting-section"><div class="section-title"><h2>Outstanding %</h2><span class="muted">Monthly payouts</span></div><ul class="list card">${percentItems}</ul></section>` : ''}
      ${list.length ? `<section class="commission-history"><div class="section-title"><h2>Paid commissions</h2><span class="muted">Double-click an entry for advanced settings</span></div><ul class="list card">${items}</ul></section>` : `<div class="empty card">${icon('wallet')}<p>${awaiting.length ? 'No paid commissions yet' : 'No commissions yet'}</p></div>`}`;
  }

  function taskItem(t) {
    const running = !!t.startedAt,
      elapsed = G.taskElapsed(t),
      seconds = Math.floor(elapsed / 1000);
    const hours = Math.floor(seconds / 3600),
      minutes = Math.floor(seconds / 60) % 60,
      secs = seconds % 60;
    const timerControl =
      editingTimeId === t.id
        ? `<form class="manual-time-form" id="manualElapsedForm" data-id="${t.id}"><span class="manual-time-label">Time taken</span><div class="manual-time-fields"><input id="manualHours" name="hours" type="number" min="0" step="1" value="${hours}" aria-label="Hours" required><span>h</span><input name="minutes" type="number" min="0" max="59" step="1" value="${minutes}" aria-label="Minutes" required><span>m</span><input name="seconds" type="number" min="0" max="59" step="1" value="${secs}" aria-label="Seconds" required><span>s</span><button class="btn primary" type="submit">Save</button><button class="btn ghost manual-time-cancel" type="button" data-act="canceledittime" aria-label="Cancel time edit">Cancel</button></div></form>`
        : `<button class="time time-edit" type="button" data-act="edittime" data-id="${t.id}" aria-label="Edit tracked time" title="Edit tracked time"><span data-timer="${t.id}">${clock(elapsed)}</span><span class="timer-edit-hint">${icon('edit')}<span>Edit</span></span></button>`;
    return `<li class="item task ${running ? 'running' : ''}" data-key="${t.id}">
      ${avatar(clientOf(t.clientId), 'sm')}<div class="grow"><div class="name">${esc(t.title)}</div><div class="muted">${clientOf(t.clientId) ? esc(clientOf(t.clientId).name) + ' · ' : ''}${t.rateType === 'percent' ? `${Number(t.percentRate || 0)}% monthly` : money(t.price || 0)}${t.deadline ? (d => ` · <span class="due ${d.cls}" data-due="${t.deadline}">${d.text}</span>`)(dueInfo(t.deadline)) : ''}</div></div>
      ${timerControl}
      <button class="icon ${running ? 'live' : ''}" data-act="${running ? 'pause' : 'start'}" data-id="${t.id}" aria-label="${running ? 'Pause' : 'Start'}">${icon(running ? 'pause' : 'play')}</button>
      <button class="icon" data-act="reset" data-id="${t.id}" aria-label="Reset timer">${icon('reset')}</button>
      <button class="icon" data-act="edittask" data-id="${t.id}" aria-label="Edit">${icon('edit')}</button>
      <button class="icon danger" data-act="deltask" data-id="${t.id}" aria-label="Delete">${icon('trash')}</button>
      <button class="btn complete" data-act="complete" data-id="${t.id}">${icon('check')}<span>Work finished</span></button></li>`;
  }

  function tasks() {
    return `<div class="bar-head"><div><h1>Pending</h1>${rateNote()}</div></div>
      <form class="newtask card" id="newTask" autocomplete="off">
        <input name="t" placeholder="New pending commission" maxlength="80" required aria-label="Commission name">
        <div class="pay-picker" role="group" aria-label="Payment type"><button type="button" class="pay-option on" data-pay-type="fixed" aria-pressed="true">Fixed</button><button type="button" class="pay-option" data-pay-type="percent" aria-pressed="false">Monthly %</button></div><input type="hidden" name="pay" value="fixed">
        <input name="p" class="pr" type="number" min="0" step="0.01" placeholder="Price ${SYM[state.currency]}" required inputmode="decimal" aria-label="Price">
        ${state.clients.length ? `<select name="c" class="cl" aria-label="Client">${clientOpts('')}</select>` : ''}
        <input name="d" class="dl" type="datetime-local" aria-label="Deadline" title="Deadline (optional)">
        <button class="btn primary" type="submit" aria-label="Add">${icon('plus')}</button></form>
      ${state.tasks.length ? `<ul class="list card">${state.tasks.map(taskItem).join('')}</ul>` : `<div class="empty card">${icon('list')}<p>Nothing pending</p></div>`}`;
  }

  /* ---------- Rendering ---------- */
  /* animate=true: entering a view (staggered entrance). animate=false: update in place, so transitions play,
     focus/scroll/typed text survive, and only new or removed items animate. */
  function render(animate = true) {
    const el = $('#view'),
      html = { today: todayView, overview, commissions, tasks, clients: clientsView }[view]();
    const enteringView = animate || el.dataset.view !== view;
    if (enteringView) {
      el.dataset.view = view;
      el.innerHTML = html;
    } else Dom.morph(el, html);
    loadRobloxAvatars(el);
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    movePill();
    if (animate) countUp();
    document
      .querySelectorAll('#currency button')
      .forEach(b => b.classList.toggle('on', b.dataset.cur === state.currency));
    const ri = $('.rate-in');
    if (ri && document.activeElement !== ri) {
      ri.focus();
      ri.select();
    }
    if (view === 'today') setupTodayLayout();
    collectLive();
  }
  function movePill() {
    const b = $('#tabs button.on'),
      p = $('#pill');
    if (b) {
      p.style.width = b.offsetWidth + 'px';
      p.style.transform = `translateX(${b.offsetLeft}px)`;
    }
  }
  function countUp() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('[data-count]').forEach(el => {
      const target = +el.dataset.count,
        int = el.dataset.kind === 'int',
        r = rate(),
        t0 = performance.now();
      if (!target) return;
      (function f(t) {
        if (!el.isConnected) return;
        const p = Math.min(1, (t - t0) / 700),
          e = 1 - Math.pow(1 - p, 3);
        el.textContent = int ? String(Math.round(target * e)) : money(p < 1 ? Math.round(target * e * r) / r : target);
        if (p < 1) requestAnimationFrame(f);
      })(t0);
    });
  }
  /* Switches page with a direction-aware transition (forward = to the right in the tab order). */
  function navigate(v, updateHash = true) {
    if (v === view) return;
    const dir = VIEWS.indexOf(v) >= VIEWS.indexOf(view) ? 'fwd' : 'back';
    Dom.transition(() => {
      view = v;
      if (updateHash) location.hash = v;
      render();
    }, dir);
  }
  const setView = v => navigate(v);

  /* ---------- Dialog (commission or pending commission) ---------- */
  const dlg = $('#dlg'),
    form = $('#form');
  let editingKind = 'commission',
    editingTaskRateType = 'fixed';
  const task = id => state.tasks.find(t => t.id === id);
  function openDialog(id, kind = 'commission', advanced = false) {
    editingKind = kind;
    editingId = id || null;
    const c = kind === 'task' ? task(id) : state.commissions.find(x => x.id === id);
    const advancedTime = advanced && kind !== 'task' && !!c;
    $('#advancedTime').hidden = !advancedTime;
    $('#dlgTitle').textContent = kind === 'task' ? 'Edit pending commission' : advancedTime ? 'Advanced commission settings' : c ? 'Edit commission' : 'New commission';
    $('#dateLabel').hidden = kind === 'task';
    $('#dueLabel').hidden = kind !== 'task';
    form.date.required = kind !== 'task';
    editingTaskRateType = kind === 'task' && c && c.rateType === 'percent' ? 'percent' : 'fixed';
    $('#taskRatePicker').hidden = kind !== 'task';
    document.querySelectorAll('[data-edit-pay]').forEach(btn => {
      const selected = btn.dataset.editPay === editingTaskRateType;
      btn.classList.toggle('on', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
    const percentTask = editingTaskRateType === 'percent' && kind === 'task';
    $('#priceText').textContent = percentTask ? 'Monthly percentage rate (%)' : `Price (${state.currency})`;
    form.price.max = percentTask ? '100' : '';
    form.client.innerHTML = clientOpts(c ? c.clientId : '');
    $('#clientLabel').hidden = !state.clients.length;
    Sound.play('open');
    const shown = c ? (percentTask ? c.percentRate : Math.round(c.price * rate() * 100) / 100) : '';
    form.name.value = c ? c.name || c.title : '';
    form.price.value = shown;
    form.price.dataset.orig = shown;
    form.price.dataset.usd = c ? c.price : '';
    form.date.value = (c && c.date) || G.today();
    form.due.value = c && c.deadline ? toLocalInput(c.deadline) : '';
    const totalSeconds = Math.floor(Math.max(0, Number(c && c.time) || 0) / 1000);
    form.elements.timeHours.value = advancedTime ? Math.floor(totalSeconds / 3600) : '';
    form.elements.timeMinutes.value = advancedTime ? Math.floor(totalSeconds / 60) % 60 : '';
    form.elements.timeSeconds.value = advancedTime ? totalSeconds % 60 : '';
    dlg.showModal();
    form.name.focus();
  }
  form.addEventListener('submit', e => {
    const name = form.name.value.trim(),
      entered = parseFloat(form.price.value),
      date = form.date.value,
      isTask = editingKind === 'task';
    const currentTask = isTask ? task(editingId) : null,
      percentTask = isTask && editingTaskRateType === 'percent';
    if (!name || !isFinite(entered) || entered < 0 || (percentTask && entered > 100) || (!isTask && !date)) {
      e.preventDefault();
      return;
    }
    const unchanged = form.price.dataset.usd !== '' && entered === +form.price.dataset.orig;
    const price = percentTask ? 0 : unchanged ? +form.price.dataset.usd : Math.round((entered / rate()) * 1e4) / 1e4;
    let editedTime = null;
    if ($('#advancedTime').hidden === false && !isTask) {
      const timeFields = ['timeHours', 'timeMinutes', 'timeSeconds'].map(n => form.elements[n].value),
        [h, m, s] = timeFields.map(Number);
      if (timeFields.some(v => v === '') || ![h, m, s].every(Number.isInteger) || h < 0 || m < 0 || m > 59 || s < 0 || s > 59) {
        e.preventDefault();
        $('#advancedTime').querySelector('input:invalid')?.focus();
        return;
      }
      editedTime = (h * 3600 + m * 60 + s) * 1000;
    }
    if (isTask)
      Object.assign(
        currentTask,
        percentTask
          ? {
              title: name,
              price: 0,
              rateType: 'percent',
              percentRate: entered,
              deadline: form.due.value ? new Date(form.due.value).getTime() : null,
              clientId: form.client.value || null
            }
          : {
              title: name,
              price,
              rateType: 'fixed',
              percentRate: null,
              deadline: form.due.value ? new Date(form.due.value).getTime() : null,
              clientId: form.client.value || null
            }
      );
    else if (editingId) {
      const existing = state.commissions.find(c => c.id === editingId);
      if (existing.netPrice != null) {
        const fee = existing.paymentMethod === 'wise' ? wiseFee(price) : 0;
        Object.assign(existing, {
          name,
          price,
          grossPrice: price,
          paymentFee: fee,
          netPrice: Math.max(0, Math.round((price - fee) * 1e4) / 1e4),
          date,
          clientId: form.client.value || null
        });
      } else Object.assign(existing, { name, price, date, clientId: form.client.value || null });
      if (editedTime !== null) existing.time = editedTime;
    } else
      state.commissions.push({
        id: G.uid(),
        name,
        price,
        date,
        time: 0,
        created: Date.now(),
        clientId: form.client.value || null
      });
    persist();
    Sound.play('add');
    const refreshCommissionList = !isTask && !!editingId;
    editingId = null;
    render(refreshCommissionList);
    e.preventDefault();
    Dom.closeDialog(dlg);
  });
  $('#cancel').onclick = () => {
    Sound.play('close');
    Dom.closeDialog(dlg);
  };
  dlg.addEventListener('click', e => {
    if (e.target === dlg) Dom.closeDialog(dlg);
  });

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = icon('check') + esc(msg);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  /* ---------- Actions ---------- */
  const pauseT = t => {
    if (t.startedAt) {
      t.elapsed = G.taskElapsed(t);
      t.startedAt = null;
    }
  };
  const actions = {
    layoutmode: () => {
      layoutEditing = !layoutEditing;
      render(false);
    },
    toggleperiod: () => {
      overviewRangeOpen = !overviewRangeOpen;
      const panel = $('#overviewRangePanel'),
        trigger = $('#bigRev'),
        select = $('#overviewRange');
      panel.classList.toggle('open', overviewRangeOpen);
      panel.setAttribute('aria-hidden', String(!overviewRangeOpen));
      trigger.setAttribute('aria-expanded', String(overviewRangeOpen));
      select.tabIndex = overviewRangeOpen ? 0 : -1;
    },
    togglewidget: id => {
      const ids = ['stats', 'quote', 'todos', 'schedule', 'deadlines', 'notes'];
      state.todayLayout = state.todayLayout || { order: ids.slice(), hidden: [] };
      state.todayLayout.hidden = state.todayLayout.hidden || [];
      state.todayLayout.hidden = state.todayLayout.hidden.includes(id)
        ? state.todayLayout.hidden.filter(x => x !== id)
        : state.todayLayout.hidden.concat(id);
      persist();
      render(false);
    },
    editawaiting: id => {
      editingAwaitingId = id;
      render(false);
      $('#awaitingPrice').focus();
      $('#awaitingPrice').select();
    },
    saveawaiting: id => {
      const c = state.awaiting.find(x => x.id === id),
        entered = parseFloat($('#awaitingPrice').value);
      if (!c || !isFinite(entered) || entered < 0) return;
      c.price = Math.round((entered / rate()) * 1e4) / 1e4;
      editingAwaitingId = null;
      persist();
      render(false);
    },
    cancelawaiting: () => {
      editingAwaitingId = null;
      render(false);
    },
    recordpercent: id => {
      editingPercentId = id;
      render(false);
      $('#percentPayoutAmount').focus();
    },
    savepercent: id => {
      const c = state.percentages.find(x => x.id === id),
        amount = parseFloat($('#percentPayoutAmount').value);
      if (!c || !isFinite(amount) || amount <= 0) return;
      const works = Array.isArray(c.works) ? c.works.slice() : [{ name: c.name, time: 0 }];
      const workNames = works.map(w => w.name).filter(Boolean);
      const payoutTime = works.reduce((total, work) => total + Math.max(0, Number(work.time) || 0), 0);
      state.commissions.push({
        id: G.uid(),
        name: workNames.join(', ') || `${Number(c.percentRate || 0)}% monthly payout`,
        price: Math.round(amount * 100) / 100,
        date: G.today(),
        time: payoutTime,
        created: Date.now(),
        clientId: c.clientId || null,
        payoutRate: c.percentRate,
        payoutWorkCount: works.length,
        payoutWorkNames: workNames,
        payoutType: 'monthly-percentage'
      });
      c.works = [];
      c.lastPayout = Date.now();
      c.nextPaymentAt = nextMonthStart(Date.now());
      c.payoutCount = (c.payoutCount || 0) + 1;
      editingPercentId = null;
      persist();
      render(false);
      toast('Monthly payout added to Overview');
    },
    cancelpercent: () => {
      editingPercentId = null;
      render(false);
    },
    endpercent: id => {
      const c = state.percentages.find(x => x.id === id);
      if (c && confirm(`End monthly percentage payments for “${c.name}”?`)) {
        state.percentages = state.percentages.filter(x => x.id !== id);
        persist();
        render(false);
      }
    },
    add: () => openDialog(),
    edit: id => openDialog(id),
    del: id => {
      const c = state.commissions.find(x => x.id === id);
      if (c && confirm(`Delete “${c.name}”?`)) {
        state.commissions = state.commissions.filter(x => x.id !== id);
        persist();
        render(false);
      }
    },
    start: id => {
      const t = task(id);
      if (!t.startedAt) {
        t.startedAt = Date.now();
        if (!t.firstStart) t.firstStart = t.startedAt;
      }
      persist();
      render(false);
    },
    pause: id => {
      pauseT(task(id));
      persist();
      render(false);
    },
    reset: id => {
      const t = task(id),
        was = !!t.startedAt;
      t.elapsed = 0;
      t.startedAt = was ? Date.now() : null;
      t.firstStart = t.startedAt;
      persist();
      render(false);
    },
    edittime: id => {
      editingTimeId = id;
      render(false);
      const input = $('#manualHours');
      if (input) input.focus();
    },
    canceledittime: () => {
      editingTimeId = null;
      render(false);
    },
    saveelapsed: id => {
      const t = task(id),
        form = $('#manualElapsedForm');
      if (!t || !form) return;
      const h = Number(form.elements.hours.value),
        m = Number(form.elements.minutes.value),
        s = Number(form.elements.seconds.value);
      if (![h, m, s].every(Number.isFinite) || h < 0 || m < 0 || m > 59 || s < 0 || s > 59) return;
      t.elapsed = Math.floor((h * 3600 + m * 60 + s) * 1000);
      if (t.startedAt) t.startedAt = Date.now();
      editingTimeId = null;
      persist();
      render(false);
    },
    edittask: id => openDialog(id, 'task'),
    deltask: id => {
      const t = task(id);
      if (t && confirm(`Delete “${t.title}”?`)) {
        state.tasks = state.tasks.filter(x => x.id !== id);
        persist();
        render(false);
      }
    },
    expand: (id, btn) => openBig(id, btn.closest('.card')),
    sound: () => {
      state.sound = !state.sound;
      persist();
      syncSound();
      if (state.sound) Sound.play('tap');
    },
    goto: id => setView(id),
    todo: id => {
      const t = state.todos.find(x => x.id === id);
      if (!t) return;
      t.done = !t.done;
      persist();
      Sound.play(t.done ? 'done' : 'undo');
      render(false);
    },
    deltodo: id => {
      state.todos = state.todos.filter(x => x.id !== id);
      persist();
      render(false);
    },
    delevent: id => {
      state.events = state.events.filter(x => x.id !== id);
      persist();
      render(false);
    },
    importics: () => $('#icsFile').click(),
    newquote: async () => {
      const r = await Quotes.next(G.today(), state.quote);
      state.quote = { date: G.today(), text: r.text, author: r.author };
      persist();
      if (view === 'today') render(false);
    },
    endtoday: () => {
      const d = $('#dayConfirm');
      d.returnValue = '';
      d.showModal();
    },
    addclient: () => openClient(),
    editclient: id => openClient(id),
    toggleclient: id => {
      openClientId = openClientId === id ? null : id;
      render(false);
    },
    addexperience: id => {
      addingExperienceClientId = addingExperienceClientId === id ? null : id;
      render(false);
      const input = $('#experienceUrl');
      if (input) input.focus();
    },
    removeexperience: (id, btn) => {
      const c = clientOf(btn.dataset.client);
      if (!c) return;
      c.experiences = (c.experiences || []).filter(x => x.universeId !== btn.dataset.place);
      persist();
      render(false);
    },
    refreshallexperiences: () => refreshAllClientExperiences(),
    delclient: id => {
      const c = clientOf(id);
      if (!c || !confirm(`Delete “${c.name}”? Their commissions are kept.`)) return;
      state.clients = state.clients.filter(x => x.id !== id);
      state.commissions.forEach(x => {
        if (x.clientId === id) x.clientId = null;
      });
      state.awaiting.forEach(x => {
        if (x.clientId === id) x.clientId = null;
      });
      state.percentages.forEach(x => {
        if (x.clientId === id) x.clientId = null;
      });
      state.tasks.forEach(x => {
        if (x.clientId === id) x.clientId = null;
      });
      persist();
      render(false);
    },
    editrate: () => {
      editingRate = true;
      render(false);
    },
    liverate: () => {
      state.rate.manual = false;
      persist();
      render(false);
      refreshRate(true);
    },
    complete: id => {
      const t = task(id);
      if (!t) return;
      pauseT(t);
      if (t.rateType === 'percent') {
        const rate = Number(t.percentRate || 0),
          existing =
            t.clientId && state.percentages.find(p => p.clientId === t.clientId && Number(p.percentRate) === rate);
        if (existing) {
          if (!Array.isArray(existing.works))
            existing.works = [{ name: existing.name, finishedAt: existing.created || Date.now(), time: 0 }];
          existing.works.push({ name: t.title, finishedAt: Date.now(), time: Math.max(0, Number(t.elapsed) || 0) });
        } else
          state.percentages.unshift({
            id: G.uid(),
            name: t.title,
            works: [{ name: t.title, finishedAt: Date.now(), time: Math.max(0, Number(t.elapsed) || 0) }],
            percentRate: rate,
            clientId: t.clientId || null,
            created: Date.now(),
            nextPaymentAt: nextMonthStart(Date.now()),
            payoutCount: 0
          });
      } else
        state.awaiting.unshift({
          id: t.id,
          name: t.title,
          price: t.price || 0,
          paymentMethod: 'wise',
          finishedDate: G.today(),
          time: t.elapsed,
          created: t.created || Date.now(),
          workStart: t.firstStart || t.created,
          deadline: t.deadline || null,
          completedAt: Date.now(),
          clientId: t.clientId || null
        });
      state.tasks = state.tasks.filter(x => x.id !== id);
      persist();
      render(false);
      toast(t.rateType === 'percent' ? 'Added to outstanding monthly percentages' : 'Moved to awaiting payment');
    },
    paid: id => {
      const c = (state.awaiting || []).find(x => x.id === id);
      if (!c) return;
      const grossPrice = c.price || 0,
        fee = wiseFee(grossPrice),
        netPrice = Math.max(0, Math.round((grossPrice - fee) * 10000) / 10000);
      state.commissions.push({
        id: G.uid(),
        name: c.name,
        price: grossPrice,
        grossPrice,
        netPrice,
        paymentFee: fee,
        paymentMethod: c.paymentMethod || 'wise',
        date: G.today(),
        time: c.time || 0,
        created: Date.now(),
        workStart: c.workStart || c.created,
        deadline: c.deadline || null,
        completedAt: c.completedAt || Date.now(),
        clientId: c.clientId || null
      });
      state.awaiting = state.awaiting.filter(x => x.id !== id);
      persist();
      render(false);
      toast('Payment recorded');
    }
  };
  /* Fixed price vs monthly-percentage toggle on the quick-add form. */
  function setPayType(form, percent) {
    form.elements.namedItem('pay').value = percent ? 'percent' : 'fixed';
    form.querySelectorAll('[data-pay-type]').forEach(btn => {
      const on = (btn.dataset.payType === 'percent') === percent;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    const price = form.elements.namedItem('p');
    price.max = percent ? '100' : '';
    price.placeholder = percent ? 'Rate (%)' : `Price ${SYM[state.currency]}`;
    price.setAttribute('aria-label', percent ? 'Monthly percentage rate' : 'Price');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b) {
      const k = b.dataset.act in SOUND ? SOUND[b.dataset.act] : 'tap';
      if (k) Sound.play(k);
      actions[b.dataset.act](b.dataset.id, b);
    }
    const payChoice = e.target.closest('[data-pay-type]');
    if (payChoice && payChoice.closest('#newTask'))
      setPayType(payChoice.closest('#newTask'), payChoice.dataset.payType === 'percent');
    const editPayChoice = e.target.closest('[data-edit-pay]');
    if (editPayChoice && editingKind === 'task' && dlg.open) {
      editingTaskRateType = editPayChoice.dataset.editPay;
      document.querySelectorAll('[data-edit-pay]').forEach(btn => {
        const selected = btn === editPayChoice;
        btn.classList.toggle('on', selected);
        btn.setAttribute('aria-pressed', String(selected));
      });
      const percent = editingTaskRateType === 'percent';
      $('#priceText').textContent = percent ? 'Monthly percentage rate (%)' : `Price (${state.currency})`;
      form.price.max = percent ? '100' : '';
      form.price.value = '';
      form.price.dataset.orig = '';
      form.price.dataset.usd = '';
      form.price.focus();
    }
    const t = e.target.closest('#tabs button');
    if (t) {
      Sound.play('tab');
      setView(t.dataset.view);
    }
    const c = e.target.closest('#currency button');
    if (c && c.dataset.cur !== state.currency) {
      Sound.play('tab');
      state.currency = c.dataset.cur;
      persist();
      render(false);
      if (c.dataset.cur === 'INR') refreshRate();
    }
  });
  document.addEventListener('dblclick', e => {
    if (view !== 'commissions' || e.target.closest('button, a, input, select, textarea')) return;
    const row = e.target.closest('.commission-history li.item[data-key]');
    if (row) openDialog(row.dataset.key, 'commission', true);
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'overviewRange') {
      if (!OVERVIEW_PERIODS[e.target.value]) return;
      state.overviewRange = e.target.value;
      persist();
      render(false);
      return;
    }
    if (e.target.matches('[data-awaiting-method]')) {
      const c = state.awaiting.find(x => x.id === e.target.dataset.awaitingMethod);
      if (!c) return;
      c.paymentMethod = e.target.value;
      persist();
      render(false);
    }
  });
  function commitRate(inp, save) {
    const v = parseFloat(inp.value);
    editingRate = false;
    if (save && v > 0) {
      state.rate = { value: Math.round(v * 100) / 100, manual: true, updated: Date.now() };
      persist();
    }
    render(false);
  }
  document.addEventListener('keydown', e => {
    if (!e.target.classList || !e.target.classList.contains('rate-in')) return;
    if (e.key === 'Enter') commitRate(e.target, true);
    else if (e.key === 'Escape') commitRate(e.target, false);
  });
  document.addEventListener('focusout', e => {
    if (editingRate && e.target.classList && e.target.classList.contains('rate-in')) commitRate(e.target, true);
  });

  /* Live USD→INR rate (free public APIs; falls back to the last saved rate) */
  async function fetchRate() {
    for (const u of [
      'https://open.er-api.com/v6/latest/USD',
      'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR'
    ]) {
      try {
        const j = await (await fetch(u, { cache: 'no-store' })).json();
        const v = j.rates && j.rates.INR;
        if (v > 0) return v;
      } catch (err) {
        /* try next */
      }
    }
    return null;
  }
  async function refreshRate(force) {
    if (!force && (state.rate.manual || Date.now() - state.rate.updated < 36e5)) return;
    const v = await fetchRate();
    if (v) {
      state.rate = { value: Math.round(v * 100) / 100, manual: false, updated: Date.now() };
      persist();
      if (!editingRate) render(false);
    } else if (force) toast('Couldn’t reach live rates');
  }
  document.addEventListener('submit', e => {
    const fid = e.target.id;
    if (fid === 'manualElapsedForm') {
      e.preventDefault();
      actions.saveelapsed(e.target.dataset.id);
      return;
    }
    if (fid === 'revenueTargetForm') {
      e.preventDefault();
      const value = parseFloat(e.target.elements.namedItem('target').value);
      if (!isFinite(value) || value < 0) return;
      state.revenueTarget = Math.round((value / rate()) * 1e4) / 1e4;
      persist();
      render(false);
      return;
    }
    if (fid === 'newTodo' || fid === 'newEvent') {
      e.preventDefault();
      return fid === 'newTodo' ? addTodo(e.target) : addEvent(e.target);
    }
    if (fid !== 'newTask') return;
    e.preventDefault();
    const title = e.target.t.value.trim(),
      entered = parseFloat(e.target.p.value),
      d = e.target.d.value,
      percent = e.target.elements.namedItem('pay').value === 'percent';
    if (!title || !isFinite(entered) || entered < 0 || (percent && entered > 100)) return;
    state.tasks.unshift({
      id: G.uid(),
      title,
      price: percent ? 0 : Math.round((entered / rate()) * 1e4) / 1e4,
      rateType: percent ? 'percent' : 'fixed',
      percentRate: percent ? entered : null,
      deadline: d ? new Date(d).getTime() : null,
      elapsed: 0,
      startedAt: null,
      firstStart: null,
      clientId: e.target.c ? e.target.c.value || null : null,
      created: Date.now()
    });
    e.target.reset();
    setPayType(e.target, false);
    persist();
    Sound.play('add');
    render(false);
    $('#newTask input').focus();
  });

  /* ---------- Today (home) ---------- */
  const greet = (d = new Date()) => {
    const h = d.getHours();
    return h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  };
  const longDate = (d = new Date()) =>
    d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  function todayView() {
    const now = new Date(),
      nowMs = now.getTime(),
      ymd = G.today(now),
      st = G.stats(state.commissions, G.monthKey(ymd));
    const todos = G.todosFor(state.todos, ymd).sort((a, b) => a.done - b.done || a.created - b.created);
    const done = todos.filter(t => t.done).length,
      p = todos.length ? done / todos.length : 0,
      C = 2 * Math.PI * 22;
    const due = G.dueList(state.tasks, nowMs, 7),
      next = due[0],
      nd = next && dueInfo(next.deadline, nowMs);
    const pendVal = state.tasks.reduce((s, t) => s + (t.price || 0), 0);
    const evToday = G.eventsOn(state.events, ymd),
      evNext = G.upcomingEvents(state.events, ymd, 7).slice(0, 5);
    const yKey = G.addDays(ymd, -1),
      yNote = state.notes[yKey] || '',
      running = state.tasks.filter(t => t.startedAt);
    const q = state.quote && state.quote.date === ymd ? state.quote : null;
    const wk = k => parseDate(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

    const todoItem =
      t => `<li class="item" data-key="todo-${t.id}"><button class="check ${t.done ? 'on' : ''}" data-act="todo" data-id="${t.id}" aria-label="Toggle">${icon('check')}</button>
      <div class="grow"><div class="name ${t.done ? 'strike' : ''}">${esc(t.title)}</div>${t.date < ymd && !t.done ? '<div class="muted">Carried over</div>' : ''}</div>
      <button class="icon danger" data-act="deltodo" data-id="${t.id}" aria-label="Delete">${icon('trash')}</button></li>`;
    const evItem = (e, label) =>
      `<li class="item" data-key="ev-${e.id}"><span class="when">${label}</span><div class="grow name">${esc(e.title)}</div><button class="icon danger" data-act="delevent" data-id="${e.id}" aria-label="Delete">${icon('trash')}</button></li>`;
    const dueItem = t => {
      const d = dueInfo(t.deadline, nowMs),
        s = G.dueStatus(t.deadline, nowMs),
        cl = clientOf(t.clientId);
      return `<li class="item" data-key="due-${t.id}"><span class="flagic ${s}">${icon('flag')}</span>${avatar(cl, 'sm')}<div class="grow"><div class="name">${esc(t.title)}</div><div class="muted">${t.rateType === 'percent' ? `${Number(t.percentRate || 0)}% monthly` : money(t.price || 0)} · <span class="due ${d.cls}" data-due="${t.deadline}">${d.text}</span></div></div><span class="tag ${s}">${s === 'overdue' ? 'Overdue' : s === 'today' ? 'Today' : 'This week'}</span></li>`;
    };
    const empty = msg => `<div class="empty slim"><p>${msg}</p></div>`;

    const layout = state.todayLayout || {
      order: ['stats', 'quote', 'todos', 'schedule', 'deadlines', 'notes'],
      hidden: []
    };
    const ordered = a =>
      a
        .slice()
        .sort(
          (x, y) =>
            (layout.order.indexOf(x.id) < 0 ? 999 : layout.order.indexOf(x.id)) -
            (layout.order.indexOf(y.id) < 0 ? 999 : layout.order.indexOf(y.id))
        );
    const widgets = [
      {
        id: 'stats',
        label: 'Daily overview',
        html: `<section class="stats">
      <div class="card stat rise">${icon('check')}<svg class="ring" viewBox="0 0 52 52"><circle class="ring-bg" cx="26" cy="26" r="22"/><circle class="ring-fg" cx="26" cy="26" r="22" style="--c:${C};stroke-dasharray:${C};stroke-dashoffset:${C * (1 - p)}"/></svg><div class="lab">Today</div><div class="val">${done}/${todos.length}</div><div class="muted">tasks done</div></div>
      ${stat('wallet', 'This month', money(st.monthRevenue), `${st.monthCount} commission${st.monthCount === 1 ? '' : 's'}`, [st.monthRevenue, 'money'])}
      ${stat('list', 'In progress', money(pendVal), `${state.tasks.length} pending`, [pendVal, 'money'])}
      ${stat('flag', 'Next deadline', next ? `<span class="due ${nd.cls}" data-due="${next.deadline}">${nd.text}</span>` : '–', next ? esc(next.title) : 'Nothing this week')}
    </section>`
      },
      {
        id: 'quote',
        label: 'Quote',
        html: q
          ? `<figure class="quote card rise" id="todayQuote"><blockquote>“${esc(q.text)}”</blockquote><figcaption><span>— ${esc(q.author)}</span><button class="icon xs" data-act="newquote" aria-label="New quote">${icon('reset')}</button></figcaption></figure>`
          : ''
      },
      {
        id: 'todos',
        label: 'Today’s tasks',
        html: `<div class="card rise"><div class="head free"><h3>Today <span class="muted">${done}/${todos.length}</span></h3></div>
        <form class="qa" id="newTodo" autocomplete="off"><input name="t" placeholder="Add a task for today" maxlength="120" aria-label="New task"><button class="icon" type="submit" aria-label="Add">${icon('plus')}</button></form>
        ${todos.length ? `<ul class="list flat">${todos.map(todoItem).join('')}</ul>` : empty('A clear day')}</div>`
      },
      {
        id: 'schedule',
        label: 'Schedule',
        html: `<div class="card rise"><div class="head free"><h3>Schedule</h3><button class="icon" data-act="importics" aria-label="Import calendar file" title="Import a .ics calendar file">${icon('upload')}</button></div>
        <form class="qa" id="newEvent" autocomplete="off"><input name="t" placeholder="Reminder or event" maxlength="100" aria-label="Event title"><input name="tm" type="time" class="mini" aria-label="Time"><input name="d" type="date" class="mini" value="${ymd}" aria-label="Date"><button class="icon" type="submit" aria-label="Add">${icon('plus')}</button></form>
        ${evToday.length ? `<ul class="list flat">${evToday.map(e => evItem(e, e.time || 'All day')).join('')}</ul>` : empty('Nothing scheduled today')}
        ${evNext.length ? `<div class="subh">Coming up</div><ul class="list flat">${evNext.map(e => evItem(e, `${wk(e.date)}${e.time ? ' · ' + e.time : ''}`)).join('')}</ul>` : ''}</div>`
      },
      {
        id: 'deadlines',
        label: 'Deadlines',
        html: `<div class="card rise"><div class="head free"><h3>Deadlines</h3><button class="icon" data-act="goto" data-id="tasks" aria-label="Open pending">${icon('list')}</button></div>
        ${due.length ? `<ul class="list flat">${due.map(dueItem).join('')}</ul>` : empty('Nothing due this week')}</div>`
      },
      {
        id: 'notes',
        label: 'Notes',
        html: `<div class="card rise notes"><div class="head free"><h3>Notes</h3></div>
        <div class="ncols">
          <div class="ncol"><div class="nl">Yesterday · ${wk(yKey)} <span class="need" id="needBadge" title="Yesterday’s note needs filling" aria-label="Yesterday’s note needs filling" ${yNote.trim() ? 'hidden' : ''}>${icon('bell')}</span></div><textarea data-note="${yKey}" class="${yNote.trim() ? '' : 'attn'}" placeholder="What got done? What’s left?">${esc(yNote)}</textarea></div>
          <div class="ncol"><div class="nl">Today</div><textarea data-note="${ymd}" placeholder="Wins, blockers, ideas…">${esc(state.notes[ymd] || '')}</textarea></div>
        </div></div>`
      }
    ].filter(w => w.html && !layout.hidden.includes(w.id));
    return `<section class="today-head rise"><div><div class="eyebrow">${longDate(now)}</div><h1>${greet(now)}</h1></div><div class="today-heading-tools"><button class="icon layout-toggle" data-act="layoutmode" aria-label="Customize Today page" title="Customize Today page">${icon('edit')}</button></div></section>
      ${running.length ? `<section class="live card rise"><span class="pulse"></span><div class="grow"><div class="muted">Working on${running.length > 1 ? ` · +${running.length - 1} more` : ''}</div><div class="name">${esc(running[0].title)}</div></div><span class="time" data-timer="${running[0].id}">${clock(G.taskElapsed(running[0], nowMs))}</span><button class="icon live" data-act="pause" data-id="${running[0].id}" aria-label="Pause">${icon('pause')}</button></section>` : ''}
      <div class="today-layout${layoutEditing ? ' editing' : ''}">${ordered(widgets)
        .map(
          w =>
            `<div class="today-widget" data-widget="${w.id}" draggable="false"><button class="widget-remove" data-act="togglewidget" data-id="${w.id}" aria-label="Hide ${w.label}">−</button>${w.html}</div>`
        )
        .join('')}</div>
      <div class="widget-picker" aria-label="Hidden Today sections"></div>
      <div class="day-end"><span class="muted">That’s everything for today?</span><button class="btn ghost" data-act="endtoday">End today <span aria-hidden="true">↗</span></button></div>`;
  }

  let layoutEditing = false,
    holdTimer = null;
  const boundHosts = new WeakSet();
  function setupTodayLayout() {
    const host = $('.today-layout');
    if (!host) return;
    host.querySelectorAll('.today-widget').forEach(w => {
      w.draggable = layoutEditing;
    });
    const picker = $('.widget-picker');
    if (picker) {
      const all = [
        ['stats', 'Daily overview'],
        ['quote', 'Quote'],
        ['todos', 'Today’s tasks'],
        ['schedule', 'Schedule'],
        ['deadlines', 'Deadlines'],
        ['notes', 'Notes']
      ];
      const hidden = (state.todayLayout && state.todayLayout.hidden) || [];
      picker.innerHTML = layoutEditing
        ? `<div class="picker-label">Add a section</div>${
            all
              .filter(x => hidden.includes(x[0]))
              .map(x => `<button class="widget-ghost" data-act="togglewidget" data-id="${x[0]}">＋ ${x[1]}</button>`)
              .join('') || '<span class="muted">All sections are visible</span>'
          }<button class="btn ghost done-edit" data-act="layoutmode">Done</button>`
        : '';
    }
    if (!boundHosts.has(host)) {
      boundHosts.add(host);
      host.addEventListener('pointerdown', e => {
        if (e.target.closest('button,input,textarea,select')) return;
        holdTimer = setTimeout(() => {
          layoutEditing = true;
          render(false);
        }, 3000);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(n =>
        host.addEventListener(n, () => clearTimeout(holdTimer))
      );
      host.addEventListener('dragstart', e => {
        const w = e.target.closest('.today-widget');
        if (w && layoutEditing) {
          e.dataTransfer.setData('text/plain', w.dataset.widget);
          e.dataTransfer.effectAllowed = 'move';
        }
      });
      host.addEventListener('dragover', e => {
        if (layoutEditing) e.preventDefault();
      });
      host.addEventListener('drop', e => {
        if (!layoutEditing) return;
        e.preventDefault();
        const from = e.dataTransfer.getData('text/plain'),
          to = e.target.closest('.today-widget');
        if (!to || from === to.dataset.widget) return;
        const ids = [...host.querySelectorAll('.today-widget')].map(x => x.dataset.widget),
          a = ids.indexOf(from),
          b = ids.indexOf(to.dataset.widget);
        ids.splice(b, 0, ids.splice(a, 1)[0]);
        state.todayLayout = state.todayLayout || { hidden: [] };
        state.todayLayout.order = ids;
        persist();
        render(false);
      });
    }
  }
  function addTodo(f) {
    const t = f.t.value.trim();
    if (!t) return;
    state.todos.push({ id: G.uid(), title: t, date: G.today(), done: false, created: Date.now() });
    f.reset();
    persist();
    Sound.play('add');
    render(false);
    $('#newTodo input').focus();
  }
  function addEvent(f) {
    const title = f.t.value.trim();
    if (!title) return;
    state.events.push({ id: G.uid(), title, date: f.d.value || G.today(), time: f.tm.value || '' });
    f.t.value = '';
    f.tm.value = '';
    persist();
    Sound.play('add');
    render(false);
    $('#newEvent input').focus();
  }
  document.addEventListener('input', e => {
    const key = e.target.dataset && e.target.dataset.note;
    if (!key) return;
    state.notes[key] = e.target.value;
    persist();
    if (key === G.addDays(G.today(), -1)) {
      const ok = !!e.target.value.trim();
      $('#needBadge').hidden = ok;
      e.target.classList.toggle('attn', !ok);
    }
  });
  $('#icsFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let n = 0;
    G.parseICS(await f.text()).forEach(ev => {
      if (!state.events.some(x => x.title === ev.title && x.date === ev.date && x.time === ev.time)) {
        state.events.push({ id: G.uid(), title: ev.title, date: ev.date, time: ev.time });
        n++;
      }
    });
    persist();
    render(false);
    toast(n ? `Imported ${n} event${n === 1 ? '' : 's'}` : 'No new events found');
  });

  /* ---------- Clients ---------- */
  const cdlg = $('#cdlg'),
    cform = $('#cform');
  let editingClient = null,
    openClientId = null,
    prevTimer,
    addingExperienceClientId = null;
  function previewClient() {
    const rbx = G.parseRobloxId(cform.rbx.value);
    $('#cPrev').innerHTML = avatar({ name: cform.name.value.trim() || '?', roblox: rbx }, 'lg');
    loadRobloxAvatars($('#cPrev'));
    cform.rbx.setCustomValidity(cform.rbx.value.trim() && !rbx ? 'Use the numeric Roblox ID or a profile link' : '');
  }
  function openClient(id) {
    editingClient = id || null;
    const c = clientOf(id);
    $('#cTitle').textContent = c ? 'Edit client' : 'New client';
    cform.name.value = c ? c.name : '';
    cform.rbx.value = c ? c.roblox || '' : '';
    previewClient();
    Sound.play('open');
    cdlg.showModal();
    cform.name.focus();
  }
  cform.addEventListener('input', () => {
    clearTimeout(prevTimer);
    prevTimer = setTimeout(previewClient, 350);
    cform.rbx.setCustomValidity('');
  });
  cform.addEventListener('submit', e => {
    previewClient();
    const name = cform.name.value.trim(),
      rbx = G.parseRobloxId(cform.rbx.value);
    if (!name || (cform.rbx.value.trim() && !rbx)) {
      e.preventDefault();
      cform.reportValidity();
      return;
    }
    if (editingClient) Object.assign(clientOf(editingClient), { name, roblox: rbx });
    else state.clients.push({ id: G.uid(), name, roblox: rbx, created: Date.now() });
    persist();
    Sound.play('add');
    render(false);
    e.preventDefault();
    Dom.closeDialog(cdlg);
  });
  $('#cCancel').onclick = () => {
    Sound.play('close');
    Dom.closeDialog(cdlg);
  };
  cdlg.addEventListener('click', e => {
    if (e.target === cdlg) Dom.closeDialog(cdlg);
  });

  async function addRobloxExperience(form) {
    const client = clientOf(form.dataset.client),
      value = form.elements.url.value.trim(),
      button = form.querySelector('button[type="submit"]'),
      error = form.querySelector('.experience-error');
    if (!client) return;
    const ref = Roblox.parseExperience(value);
    if (!ref) {
      error.textContent = 'Paste a Roblox game link or place ID.';
      return;
    }
    button.disabled = true;
    button.textContent = 'Loading…';
    error.textContent = '';
    try {
      const experience = Object.assign({ id: G.uid(), url: value }, await Roblox.experience(ref)),
        items = client.experiences || (client.experiences = []);
      if (items.some(x => x.universeId === experience.universeId)) {
        error.textContent = 'That experience is already linked.';
        button.disabled = false;
        button.textContent = 'Submit';
        return;
      }
      items.push(experience);
      addingExperienceClientId = null;
      persist();
      render(false);
      toast('Experience linked');
    } catch (err) {
      error.textContent =
        err.name === 'AbortError'
          ? 'Roblox took too long to respond. Try again.'
          : err instanceof TypeError
            ? 'The stats relay could not be reached. Try again in a moment.'
            : err.message || 'Could not load public Roblox stats. Try the game link or place ID.';
      button.disabled = false;
      button.textContent = 'Submit';
    }
  }
  async function refreshAllClientExperiences() {
    const jobs = state.clients.flatMap(client =>
      (client.experiences || []).map(experience => ({ client, experience }))
    );
    if (!jobs.length) return;
    const results = await Roblox.pool(
      jobs,
      ({ experience }) => Roblox.experience({ placeId: experience.placeId, universeId: experience.universeId }),
      3
    );
    let updated = 0;
    results.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const old = jobs[i].experience;
      Object.assign(old, result.value, { id: old.id, url: old.url });
      updated++;
    });
    if (updated) {
      persist();
      render(false);
    }
    toast(updated === jobs.length ? 'All Roblox stats refreshed' : 'Some Roblox stats could not be refreshed');
  }
  document.addEventListener('submit', e => {
    if (e.target.id !== 'experienceForm') return;
    e.preventDefault();
    addRobloxExperience(e.target);
  });

  function clientsView() {
    const stats = G.clientStats(state.commissions);
    const list = state.clients
      .slice()
      .sort((a, b) => ((stats[b.id] || {}).revenue || 0) - ((stats[a.id] || {}).revenue || 0));
    const experienceMap = new Map();
    state.clients.forEach(c =>
      (c.experiences || []).forEach(x => experienceMap.set(String(x.universeId || x.placeId || x.id), x))
    );
    const linkedExperiences = [...experienceMap.values()];
    const totalVisits = linkedExperiences.reduce((n, x) => n + (Number(x.visits) || 0), 0);
    const totalPlaying = linkedExperiences.reduce((n, x) => n + (Number(x.playing) || 0), 0);
    const count = n => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
    const card = c => {
      const s = stats[c.id] || { count: 0, revenue: 0, last: '' },
        open = openClientId === c.id;
      const pend = state.tasks.filter(t => t.clientId === c.id),
        hist = G.sortByDate(state.commissions.filter(x => x.clientId === c.id)).reverse();
      const rows =
        pend
          .map(
            t =>
              `<li><span>${esc(t.title)}</span><span class="muted">In progress</span><b>${money(t.price || 0)}</b></li>`
          )
          .join('') +
        hist
          .map(
            x =>
              `<li><span>${esc(x.name)}</span><span class="muted">${fmtDate(x.date)}</span><b>${money(x.price)}</b></li>`
          )
          .join('');
      const experiences = c.experiences || [];
      const experienceCards = experiences
        .map(
          x =>
            `<article class="experience-card" data-key="${esc(x.id)}"><div class="experience-game-name">${esc(x.name)}</div><button class="experience-remove" data-act="removeexperience" data-client="${esc(c.id)}" data-place="${esc(x.universeId)}" aria-label="Remove ${esc(x.name)}">×</button></article>`
        )
        .join('');
      const experiencePanel = `<section class="client-experiences"><div class="experience-title"><h3>Linked experiences</h3></div>
        <div class="experience-grid">${experienceCards}${addingExperienceClientId === c.id ? `<form class="experience-form" id="experienceForm" data-client="${esc(c.id)}"><label for="experienceUrl">Roblox game link or place ID</label><div class="experience-input-row"><input id="experienceUrl" name="url" required placeholder="roblox.com/games/…" autocomplete="url"><button class="btn primary" type="submit">Submit</button></div><p class="experience-error" aria-live="polite"></p></form>` : `<button class="experience-add" data-act="addexperience" data-id="${esc(c.id)}"><span>+</span><small>Link an experience</small></button>`}</div>
        </section>`;
      return `<div class="card client rise ${open ? 'open' : ''}" data-key="${c.id}">
        <div class="c-top" data-act="toggleclient" data-id="${c.id}">${avatar(c, 'lg')}<div class="grow"><div class="name">${esc(c.name)}</div><div class="muted">${c.roblox ? 'Roblox · ' + c.roblox : 'No Roblox ID'}</div></div>
          <button class="icon" data-act="editclient" data-id="${c.id}" aria-label="Edit">${icon('edit')}</button><button class="icon danger" data-act="delclient" data-id="${c.id}" aria-label="Delete">${icon('trash')}</button></div>
        <div class="c-stats"><div><b>${s.count}</b><span>commissions</span></div><div><b>${money(s.revenue)}</b><span>earned</span></div><div><b>${pend.length}</b><span>in progress</span></div></div>
        ${experiencePanel}${open ? (rows ? `<ul class="c-list">${rows}</ul>` : '<div class="muted c-none">Nothing yet</div>') : ''}</div>`;
    };
    return `<div class="bar-head"><h1>Clients</h1><button class="btn primary" data-act="addclient">${icon('plus')}<span>Add</span></button></div>
      ${list.length ? `<div class="cgrid">${list.map(card).join('')}</div>` : `<div class="empty card">${icon('users')}<p>No clients yet</p></div>`}
      <section class="experience-overview card"><div class="experience-overview-head"><div><div class="eyebrow">Across every client</div><h2>Experiences contributed to</h2></div>${linkedExperiences.length ? `<button class="experience-refresh" data-act="refreshallexperiences">Refresh stats</button>` : ''}</div>
        <div class="experience-total"><span>Contributed to</span><strong title="${totalVisits.toLocaleString()}">${count(totalVisits)}</strong><span>visits and</span><strong title="${totalPlaying.toLocaleString()}">${count(totalPlaying)}</strong><span>CCU</span></div>
        <div class="experience-overview-foot">${linkedExperiences.length} unique experience${linkedExperiences.length === 1 ? '' : 's'} linked across your clients</div></section>`;
  }

  /* ---------- Daily splash with a quote ---------- */
  function syncSound() {
    $('#soundBtn use').setAttribute('href', state.sound ? '#i-sound' : '#i-mute');
    $('#soundBtn').classList.toggle('off', !state.sound);
    Sound.set(state.sound);
  }
  const welcomeDlg = $('#welcome'),
    welcomeForm = $('#welcomeForm');
  let welcomeFirstRun = !state.name;
  function openWelcome() {
    welcomeForm.elements.name.value = state.name || '';
    welcomeDlg.showModal();
    welcomeForm.elements.name.focus();
  }
  $('#editNameBtn').addEventListener('click', openWelcome);
  welcomeForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = welcomeForm.elements.name.value.trim();
    if (!name) {
      welcomeForm.elements.name.focus();
      return;
    }
    state.name = name;
    persist();
    syncBrand();
    Dom.closeDialog(welcomeDlg);
    if (welcomeFirstRun) {
      welcomeFirstRun = false;
      startSplash();
    }
  });
  $('#dayConfirm').addEventListener('close', e => {
    if (e.target.returnValue !== 'yes') return;
    showDaySplash('recap');
  });
  let splashMode = null;
  function splashGroup(title, items, emptyText, crossed) {
    const rows = items
      .map(
        (item, i) =>
          '<li class="sp-row ' +
          (crossed ? 'recap-row' : '') +
          '" style="--row:' +
          i +
          '"><i class="sp-dot">' +
          (crossed ? '✓' : '') +
          '</i><span>' +
          item +
          '</span></li>'
      )
      .join('');
    return (
      '<div class="sp-group"><div class="sp-group-title">' +
      title +
      '<span>' +
      items.length +
      '</span></div>' +
      (rows ? '<ul class="sp-list">' + rows + '</ul>' : '<p class="sp-empty">' + emptyText + '</p>') +
      '</div>'
    );
  }
  function morningBrief(day) {
    const todos = G.todosFor(state.todos, day).sort((a, b) => a.done - b.done || a.created - b.created);
    const due = state.tasks.filter(t => t.deadline).sort((a, b) => a.deadline - b.deadline);
    const events = G.eventsOn(state.events, day).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const todoRows = todos.map(t => (t.done ? '✓ ' : '') + esc(t.title));
    const dueRows = due.map(t => esc(t.title) + ' <small>· ' + esc(dueInfo(t.deadline, Date.now()).text) + '</small>');
    const eventRows = events.map(e => (e.time ? esc(e.time) + ' · ' : '') + esc(e.title));
    const note = (state.notes[day] || '').trim();
    return (
      '<div class="sp-brief-title">A little room to focus.</div><div class="sp-groups">' +
      splashGroup('Your checklist', todoRows, 'Nothing on your checklist yet') +
      splashGroup('Deadlines', dueRows, 'Nothing due right now') +
      splashGroup('On your calendar', eventRows, 'Your schedule is clear') +
      '</div>' +
      (note ? '<div class="sp-note"><span>Today’s note</span><p>' + esc(note) + '</p></div>' : '')
    );
  }
  function recapBrief(day) {
    const todos = G.todosFor(state.todos, day).sort((a, b) => (a.created || 0) - (b.created || 0));
    const done = todos.filter(t => t.done).map(t => esc(t.title));
    const open = todos.filter(t => !t.done).map(t => esc(t.title));
    const commissions = state.awaiting
      .filter(x => G.today(new Date(x.completedAt || x.finishedDate || x.created || 0)) === day)
      .map(x => x.name);
    state.commissions.forEach(x => {
      if (x.payoutType === 'monthly-percentage') return;
      const finished = x.completedAt || x.finishedDate || x.date || x.created;
      if (finished && G.today(new Date(finished)) === day) commissions.push(x.name);
    });
    state.percentages.forEach(x =>
      (x.works || []).forEach(w => {
        if (w.finishedAt && G.today(new Date(w.finishedAt)) === day) commissions.push(w.name);
      })
    );
    const encouragement =
      commissions.length === 0
        ? 'A day still counts. Tomorrow is another chance.'
        : commissions.length === 1
          ? 'One commission wrapped. You showed up and saw it through.'
          : commissions.length < 4
            ? `${commissions.length} commissions wrapped. That’s solid progress.`
            : `${commissions.length} commissions wrapped. Look at you go.`;
    const note = (state.notes[day] || '').trim();
    return (
      '<div class="sp-brief-title">' +
      (done.length
        ? 'You moved ' + done.length + ' thing' + (done.length === 1 ? '' : 's') + ' forward.'
        : 'A day still counts, even when it’s unfinished.') +
      '</div>' +
      '<div class="sp-commission-sequence" id="commissionMoment" data-count="' +
      commissions.length +
      '" data-encouragement="' +
      esc(encouragement) +
      '" data-items="' +
      esc(JSON.stringify(commissions)) +
      '" aria-live="polite"></div><div class="sp-groups">' +
      splashGroup('Done today', done, 'Your checklist is still waiting for its first win', true) +
      splashGroup('Still on your list', open, 'Your checklist is clear') +
      '</div>' +
      (note ? '<div class="sp-note"><span>Today’s note</span><p>' + esc(note) + '</p></div>' : '') +
      '<p class="sp-encouragement" id="recapEncouragement" aria-live="polite"></p>'
    );
  }
  let recapTimers = [];
  function playCommissionRecap() {
    recapTimers.forEach(clearTimeout);
    recapTimers = [];
    const box = $('#commissionMoment');
    if (!box) return;
    const items = JSON.parse(box.dataset.items || '[]'),
      encouragement = box.dataset.encouragement || '';
    let index = 0;
    const next = () => {
      if (splashMode !== 'recap' || !box.isConnected) return;
      if (index >= items.length) {
        if (!items.length) {
          box.innerHTML = '<p class="sp-no-commissions">No commissions finished today.</p>';
          const closing = $('#recapEncouragement');
          if (closing) {
            closing.textContent = encouragement;
            closing.classList.add('shown');
          }
        } else {
          box.innerHTML =
            '<div class="sp-commission-overview">' +
            items
              .map(
                (name, i) =>
                  '<div class="sp-summary-item" style="--row:' +
                  i +
                  '"><span class="sp-summary-check">✓</span><span class="sp-summary-name">' +
                  esc(name) +
                  '</span></div>'
              )
              .join('') +
            '</div>';
          requestAnimationFrame(() =>
            box.querySelectorAll('.sp-summary-item').forEach(item => item.classList.add('in'))
          );
          recapTimers.push(
            setTimeout(() => {
              if (splashMode !== 'recap') return;
              const closing = $('#recapEncouragement');
              if (closing) {
                closing.textContent = encouragement;
                closing.classList.add('shown');
              }
            }, 850)
          );
        }
        return;
      }
      box.innerHTML =
        '<div class="sp-commission-card"><span class="sp-commission-count">' +
        String(index + 1).padStart(2, '0') +
        ' / ' +
        String(items.length).padStart(2, '0') +
        '</span><span class="sp-commission-name">' +
        esc(items[index]) +
        '<i class="sp-commission-cross" aria-hidden="true"></i></span></div>';
      const card = box.firstElementChild;
      recapTimers.push(
        setTimeout(() => {
          if (splashMode !== 'recap') return;
          card.classList.add('crossing');
          Sound.play('cross');
        }, 1150)
      );
      recapTimers.push(
        setTimeout(() => {
          if (splashMode === 'recap') card.classList.add('fade');
        }, 1850)
      );
      recapTimers.push(
        setTimeout(() => {
          index++;
          next();
        }, 2500)
      );
    };
    next();
  }
  function dismissSplash() {
    const sp = $('#splash');
    if (sp.hidden) return;
    if (splashMode === 'morning') {
      state.lastSplash = G.today();
      persist();
    }
    splashMode = null;
    recapTimers.forEach(clearTimeout);
    recapTimers = [];
    Sound.play('done');
    sp.classList.add('out');
    setTimeout(() => {
      sp.hidden = true;
      sp.classList.remove('out', 'recap');
      document.body.classList.remove('splashing');
      render();
    }, 750);
  }
  async function showDaySplash(mode) {
    const sp = $('#splash'),
      day = G.today(),
      morning = mode === 'morning';
    splashMode = mode;
    $('#spDate').textContent = longDate();
    $('#spGreet').textContent = morning ? 'Let’s start your day.' : 'That was today.';
    $('#spBrief').innerHTML = morning ? morningBrief(day) : recapBrief(day);
    if (!morning) playCommissionRecap();
    $('#spGo').textContent = 'Start my day';
    $('#spGo').hidden = !morning;
    $('#spSkip').textContent = 'Skip intro';
    $('#spSkip').hidden = !morning;
    $('#spFarewell').hidden = morning;
    $('#spSecretClose').hidden = morning;
    $('#spQuote').innerHTML = '<span class="sk"></span>';
    $('#spAuthor').textContent = '';
    sp.classList.remove('out', 'recap');
    if (!morning) sp.classList.add('recap');
    sp.hidden = false;
    document.body.classList.add('splashing');
    const cached = state.quote && state.quote.date === day && state.quote.text.length <= 100 ? state.quote : null;
    const q = cached || (await Quotes.get(day));
    if (splashMode !== mode) return;
    state.quote = { date: day, text: q.text, author: q.author };
    persist();
    $('#spQuote').innerHTML = q.text
      .split(/\s+/)
      .map((w, i) => '<span class="w" style="--i:' + i + '">' + esc(w) + ' </span>')
      .join('');
    $('#spAuthor').textContent = '— ' + q.author;
    $('#spAuthor').classList.remove('in');
    void $('#spAuthor').offsetWidth;
    $('#spAuthor').classList.add('in');
  }
  async function startSplash() {
    if (state.lastSplash !== G.today()) await showDaySplash('morning');
  }
  $('#spGo').addEventListener('click', dismissSplash);
  $('#spSkip').addEventListener('click', dismissSplash);
  $('#spSecretClose').addEventListener('click', dismissSplash);
  document.addEventListener('keydown', e => {
    if (!$('#splash').hidden && splashMode === 'morning' && (e.key === 'Enter' || e.key === 'Escape')) dismissSplash();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && view === 'today') render(false);
  });

  /* ---------- Expanded chart view ---------- */
  const SOUND = {
    complete: 'done',
    del: 'del',
    deltask: 'del',
    deltodo: 'del',
    delevent: 'del',
    delclient: 'del',
    start: 'start',
    pause: 'pause',
    add: 'add',
    addclient: null,
    edit: null,
    edittask: null,
    editclient: null,
    expand: 'open',
    todo: null,
    sound: null
  };
  const big = $('#big'),
    EASE = 'cubic-bezier(.22,.8,.24,1)';
  let bigId = null,
    bigCard = null;
  const short = (s, n) => esc(s.length > n ? s.slice(0, n - 1) + '…' : s);
  const chip = (lab, val) => `<div class="chip2"><span class="lab">${lab}</span><b>${val}</b></div>`;
  const noData = (msg, title, sub) => ({
    title,
    sub,
    chips: '',
    svg: `<div class="chart-empty">${msg}</div>`,
    legend: ''
  });
  const key = '<span class="k d"></span>',
    dotR = '<span class="k r"></span>',
    dotF = '<span class="k f"></span>';

  const SPECS = {
    rev(w, h) {
      const period = overviewData(),
        list = G.sortByDate(period.commissions);
      if (!list.length) return noData('No commissions in this period', 'Revenue per commission', period.label);
      const total = list.reduce((s, c) => s + c.price, 0),
        avg = total / list.length;
      const top = list.reduce((b, c, i) => (c.price > list[b].price ? i : b), 0);
      const tracked = list.filter(c => c.time > 0),
        hrs = tracked.reduce((s, c) => s + c.time, 0) / 36e5;
      const perHr = hrs > 0 ? tracked.reduce((s, c) => s + c.price, 0) / hrs : null;
      const items = list.map(c => ({
        label: short(c.name, 11),
        value: c.price * rate(),
        tip: `${esc(c.name)} · ${money(c.price)} · ${fmtDate(c.date)}${c.time >= 6e4 ? ` · ${dur(c.time)} tracked` : ''}${c.time >= 36e4 ? ` · ${money(c.price / (c.time / 36e5))}/hr` : ''}`
      }));
      const W = Math.max(w, list.length * 64 + 80);
      return {
        title: 'Revenue per commission',
        sub: `${period.label} · ${list.length} commission${list.length === 1 ? '' : 's'}, oldest to newest`,
        chips:
          chip('Total', money(total)) +
          chip('Average', money(avg)) +
          chip('Highest', money(list[top].price)) +
          chip('Per tracked hour', perHr ? money(perHr) : '–'),
        svg: Charts.bars(items, {
          w: W,
          h,
          id: 'revB',
          big: true,
          stagger: false,
          trend: true,
          trendDots: false,
          maxLabels: Math.floor((W - 62) / 70),
          avg: { value: avg * rate(), tip: `Average · ${money(avg)} per commission` },
          best: top,
          bestTip: `Top earner · ${esc(list[top].name)} · ${money(list[top].price)}`
        }),
        legend: `<span>${key}Average price</span><span>${dotR}Top earner</span><span><i class="trend-key"></i>Revenue trend</span>`
      };
    },
    time(w, h) {
      const period = overviewData(),
        items = timeItemsFor(period);
      if (!items.length) return noData('Add tracked time to a paid commission to see it here', 'Time per commission', period.label);
      const total = items.reduce((sum, item) => sum + item.value, 0),
        average = total / items.length,
        top = items.reduce((best, item, index) => (item.value > items[best].value ? index : best), 0),
        W = Math.max(w, items.length * 64 + 80);
      return {
        title: 'Time per commission',
        sub: `${period.label} · tracked hours, oldest to newest`,
        chips:
          chip('Tracked total', hours(total * 36e5)) +
          chip('Average', hours(average * 36e5)) +
          chip('Entries', items.length) +
          chip('Longest', hours(items[top].value * 36e5)),
        svg: Charts.bars(items, {
          w: W,
          h,
          id: 'timeB',
          big: true,
          stagger: false,
          trend: true,
          trendDots: false,
          maxLabels: Math.floor((W - 62) / 70),
          avg: { value: average, tip: `Average · ${hours(average * 36e5)} per entry` },
          best: top,
          bestTip: `Longest · ${items[top].tip}`
        }),
        legend: `<span>${key}Average tracked time</span><span>${dotR}Longest entry</span><span><i class="trend-key"></i>Time trend</span>`
      };
    },
    cnt(w, h) {
      const period = overviewData(),
        months = G.monthlySeries(period.commissions, period.months, period.nowKey);
      const idx = Object.fromEntries(months.map((m, i) => [m.key, i]));
      const dots = period.commissions
        .filter(c => G.monthKey(c.date) in idx)
        .map(c => ({
          i: idx[G.monthKey(c.date)],
          price: c.price * rate(),
          tip: `${esc(c.name)} · ${money(c.price)} · ${fmtDate(c.date)}`
        }));
      const count = months.reduce((s, m) => s + m.count, 0),
        bestM = months.reduce((b, m) => (m.count > b.count ? m : b), months[0]);
      const avg = period.commissions.length
        ? period.commissions.reduce((s, c) => s + c.price, 0) / period.commissions.length
        : 0;
      const mi = months.map(m => ({
        label: monthName(m.key),
        count: m.count,
        tip: `${monthName(m.key, true)} · ${m.count} commission${m.count === 1 ? '' : 's'} · ${money(m.revenue)}`
      }));
      return {
        title: 'Commissions per month',
        sub: `${period.label}, with each commission’s price`,
        chips:
          chip(period.label, count) +
          chip('Busiest month', bestM.count ? `${monthName(bestM.key)} · ${bestM.count}` : '–') +
          chip('Average / month', (count / period.months).toFixed(1)) +
          chip('Average price', money(avg)),
        svg: Charts.combo(mi, dots, {
          w,
          h,
          id: 'cntB',
          big: true,
          avg: avg ? { value: avg * rate(), tip: `Average price · ${money(avg)}` } : null
        }),
        legend: `<span><i style="background:var(--accent)"></i>Commissions (left)</span><span><i style="background:var(--warm)"></i>Price per commission (right)</span><span>${key}Average price</span>`
      };
    },
    ddl(w, h) {
      const period = overviewData(),
        ta = G.turnaround(period.commissions),
        dl = ta.withDeadline;
      if (!dl.length)
        return noData(
          'Complete a pending commission that has a deadline',
          'Deadline vs actual',
          'Allotted time against what you took'
        );
      const maxMs = Math.max(...dl.flatMap(i => [i.allotted, i.tracked, i.elapsed])),
        days = maxMs >= 48 * 36e5,
        div = days ? 864e5 : 36e5;
      const onTime = dl.filter(i => !i.late).length,
        sumElapsed = dl.reduce((s, i) => s + i.elapsed, 0),
        sumTracked = dl.reduce((s, i) => s + i.tracked, 0),
        avgTracked = sumTracked / dl.length;
      const items = dl.map(i => ({
        label: short(i.name, 11),
        a: i.allotted / div,
        b: i.tracked / div,
        late: i.late,
        f: i.elapsed / div,
        tip: `${esc(i.name)} · deadline window ${dur(i.allotted)} · tracked ${dur(i.tracked)} · completed ${i.late ? 'late' : 'on time'}`,
        ftip: `${esc(i.name)} · elapsed from Start to Complete ${dur(i.elapsed)}`
      }));
      const W = Math.max(w, dl.length * 96 + 80);
      return {
        title: 'Deadline vs actual',
        sub: `In ${days ? 'days' : 'hours'} · bars use tracked time when available; dots show elapsed wall time`,
        chips:
          chip('On time', `${onTime} of ${dl.length} · ${Math.round((onTime / dl.length) * 100)}%`) +
          chip('Avg tracked', dur(avgTracked)) +
          chip('Avg elapsed', dur(sumElapsed / dl.length)),
        svg: Charts.grouped(items, {
          w: W,
          h,
          id: 'ddlB',
          big: true,
          focus: true,
          maxLabels: Math.floor((W - 62) / 90),
          avg: { value: avgTracked / div, tip: `Average tracked time · ${dur(avgTracked)}` }
        }),
        legend: `<span><i style="background:color-mix(in srgb,var(--mute) 45%,transparent)"></i>Deadline window</span><span><i style="background:var(--green)"></i>Tracked, on time</span><span><i style="background:var(--red)"></i>Tracked, late</span><span>${dotR}Elapsed time</span><span>${key}Average tracked</span>`
      };
    }
  };

  function renderBig() {
    const body = $('#bigBody'),
      w = Math.max(300, body.clientWidth || 300),
      h = Math.max(260, Math.min(460, innerHeight - 360));
    const sp = SPECS[bigId](w, h);
    $('#bigTitle').textContent = sp.title;
    $('#bigSub').textContent = sp.sub;
    $('#bigChips').innerHTML = sp.chips;
    body.innerHTML = sp.svg;
    $('#bigLegend').innerHTML = sp.legend;
  }
  function openBig(id, card) {
    bigId = id;
    bigCard = card;
    big.showModal();
    renderBig();
    const from = card.getBoundingClientRect(),
      to = big.getBoundingClientRect();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const s = Math.min(1.2, from.width / to.width),
      dx = from.left + from.width / 2 - (to.left + to.width / 2),
      dy = from.top + from.height / 2 - (to.top + to.height / 2);
    big.animate(
      [
        { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 0 },
        { opacity: 1, offset: 0.35 },
        { transform: 'none', opacity: 1 }
      ],
      { duration: 560, easing: EASE }
    );
  }
  function closeBig() {
    if (!big.open || big.closing) return;
    big.closing = true;
    const fin = () => {
      big.closing = false;
      big.close();
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return fin();
    let end = 'scale(.96)';
    if (bigCard && bigCard.isConnected) {
      const f = bigCard.getBoundingClientRect(),
        t = big.getBoundingClientRect();
      end = `translate(${f.left + f.width / 2 - (t.left + t.width / 2)}px,${f.top + f.height / 2 - (t.top + t.height / 2)}px) scale(${Math.min(1.2, f.width / t.width)})`;
    }
    big.animate(
      [
        { transform: 'none', opacity: 1 },
        { opacity: 0, offset: 0.8 },
        { transform: end, opacity: 0 }
      ],
      { duration: 380, easing: EASE }
    ).onfinish = fin;
  }
  $('#bigClose').onclick = closeBig;
  big.addEventListener('cancel', e => {
    e.preventDefault();
    closeBig();
  });
  big.addEventListener('click', e => {
    if (e.target === big) closeBig();
  });
  let rz;
  window.addEventListener('resize', () => {
    if (big.open) {
      clearTimeout(rz);
      rz = setTimeout(renderBig, 160);
    }
  });

  /* ---------- Tooltip ---------- */
  const tip = $('#tip');
  let tipEvent = null,
    tipFrame = 0;
  function placeTip() {
    tipFrame = 0;
    const e = tipEvent,
      t = e.target.closest && e.target.closest('[data-tip]');
    if (!t) {
      tip.classList.remove('on');
      return;
    }
    const host = big.open ? big : document.body; // an open dialog sits in the top layer, so the tooltip must live inside it
    if (tip.parentNode !== host) host.appendChild(tip);
    if (tip.textContent !== t.dataset.tip) tip.textContent = t.dataset.tip;
    tip.classList.add('on');
    tip.style.transform = `translate(${Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 12))}px, ${e.clientY - 38}px)`;
  }
  document.addEventListener(
    'mousemove',
    e => {
      tipEvent = e;
      if (!tipFrame) tipFrame = requestAnimationFrame(placeTip);
    },
    { passive: true }
  );

  /* ---------- Currency, timers, boot ---------- */
  if (state.currency === 'INR') refreshRate();

  /* One light loop drives every live readout (timers, countdowns, totals). It idles while the tab is hidden. */
  let live = { timers: [], dues: [], payouts: [], total: null };
  function collectLive() {
    live = {
      timers: [...document.querySelectorAll('[data-timer]')],
      dues: [...document.querySelectorAll('[data-due]')],
      payouts: [...document.querySelectorAll('[data-next-payout]')],
      total: $('#totalTime')
    };
  }
  const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };
  function tick() {
    if (!document.hidden) {
      const now = Date.now(),
        byId = new Map(state.tasks.map(t => [t.id, t]));
      live.timers.forEach(el => {
        const t = byId.get(el.dataset.timer);
        if (t) setText(el, clock(G.taskElapsed(t, now)));
      });
      live.dues.forEach(el => {
        const d = dueInfo(+el.dataset.due, now),
          cls = 'due ' + d.cls;
        setText(el, d.text);
        if (el.className !== cls) el.className = cls;
      });
      live.payouts.forEach(el => setText(el, countdown(+el.dataset.nextPayout, now)));
      if (live.total) setText(live.total, hours(view === 'overview' ? overviewTime(overviewData()) : totalTime(now)));
    }
    setTimeout(tick, live.timers.length ? 250 : 1000); // sub-second sampling only while a timer is actually on screen
  }
  tick();

  window.addEventListener('resize', movePill);
  window.addEventListener('hashchange', () => {
    const v = location.hash.slice(1);
    if (VIEWS.includes(v) && v !== view) navigate(v, false);
  });
  window.addEventListener('storage', () => {
    state = G.load();
    syncBrand();
    render(false);
  });
  if (!VIEWS.includes(view)) view = 'today';
  syncSound();
  syncBrand();
  render();
  if (state.name) startSplash();
  else openWelcome();
  /* The Today quote gently rotates; the swap cross-fades. */
  setInterval(async () => {
    if (view !== 'today' || document.hidden || layoutEditing || !$('#splash').hidden) return;
    const day = G.today(),
      r = await Quotes.next(day, state.quote);
    state.quote = { date: day, text: r.text, author: r.author };
    persist();
    const card = $('#todayQuote');
    if (card)
      Dom.swapText(card, '', () => {
        card.querySelector('blockquote').textContent = `“${r.text}”`;
        card.querySelector('figcaption span').textContent = '— ' + r.author;
      });
  }, 24000);
  document.fonts && document.fonts.ready.then(movePill);
})();
