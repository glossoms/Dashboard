if (typeof window !== 'undefined') (window.GLOOM_FILES = window.GLOOM_FILES || {})['store.js'] = '12';
/* Data layer + calculations. Pure functions are exported for testing in Node. */
(function (root) {
  const KEY = 'gloom.v1';
  const empty = () => ({
    commissions: [],
    awaiting: [],
    percentages: [],
    revenueTarget: 0,
    tasks: [],
    clients: [],
    todos: [],
    events: [],
    notes: {},
    quote: null,
    lastSplash: '',
    sound: true,
    currency: 'USD',
    rate: { value: 95, manual: false, updated: 0 }
  });
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

  const arr = v => (Array.isArray(v) ? v : []);
  /** Brings any saved state (old, partial or from another version) up to the current shape. Safe to run repeatedly. */
  function normalize(raw) {
    const s = Object.assign(empty(), raw && typeof raw === 'object' ? raw : {});
    if (s.currency !== 'INR') s.currency = 'USD';
    if (!s.rate || !(s.rate.value > 0)) s.rate = empty().rate;
    s.commissions = arr(s.commissions);
    s.percentages = arr(s.percentages);
    s.todos = arr(s.todos);
    s.events = arr(s.events);
    s.tasks = arr(s.tasks)
      .filter(t => !t.done)
      .map(t =>
        Object.assign({ price: 0, deadline: null, elapsed: 0 }, t, {
          firstStart: t.firstStart || t.startedAt || (t.elapsed ? t.created : null)
        })
      );
    s.awaiting = arr(s.awaiting).map(c => Object.assign({ paymentMethod: 'wise' }, c)); // keep a method the user already chose
    s.clients = arr(s.clients).map(c => Object.assign({ experiences: [] }, c));
    if (!s.notes || typeof s.notes !== 'object') s.notes = {};
    return s;
  }

  function load() {
    try {
      return normalize(JSON.parse(localStorage.getItem(KEY)));
    } catch (e) {
      return normalize(null);
    }
  }

  let pending = null,
    timer = null;
  function save(state) {
    pending = null;
    clearTimeout(timer);
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* storage unavailable or full */
    }
  }
  /** Coalesces rapid changes (typing, bursts of clicks) into one write. Always flushed when the page is hidden or closed. */
  function saveSoon(state, ms = 150) {
    pending = state;
    clearTimeout(timer);
    timer = setTimeout(flush, ms);
  }
  function flush() {
    if (pending) save(pending);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flush();
    });
  }

  const pad = n => String(n).padStart(2, '0');
  const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKey = s => s.slice(0, 7);
  const shiftMonth = (key, delta) => {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

  /** Monthly buckets for the last `n` months ending at the month of `nowKey`. */
  function monthlySeries(commissions, n, nowKey) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const key = shiftMonth(nowKey, -i);
      const items = commissions.filter(c => monthKey(c.date) === key);
      const revenue = round2(items.reduce((s, c) => s + c.price, 0));
      out.push({ key, count: items.length, revenue, avg: items.length ? round2(revenue / items.length) : 0 });
    }
    return out;
  }

  function stats(commissions, nowKey) {
    const cur = commissions.filter(c => monthKey(c.date) === nowKey);
    const prevKey = shiftMonth(nowKey, -1);
    const monthRevenue = round2(cur.reduce((s, c) => s + c.price, 0));
    const prevRevenue = round2(commissions.filter(c => monthKey(c.date) === prevKey).reduce((s, c) => s + c.price, 0));
    const total = round2(commissions.reduce((s, c) => s + c.price, 0));
    let delta = null;
    if (prevRevenue > 0) delta = round2(((monthRevenue - prevRevenue) / prevRevenue) * 100);
    const best = commissions.reduce((b, c) => (!b || c.price > b.price ? c : b), null);
    return {
      monthRevenue,
      prevRevenue,
      delta,
      monthCount: cur.length,
      monthAvg: cur.length ? round2(monthRevenue / cur.length) : 0,
      total,
      count: commissions.length,
      best
    };
  }

  /** Deadline comparison: tracked time is the actual bar when available; elapsed wall-clock remains available for context. */
  function turnaround(commissions) {
    const items = commissions
      .filter(c => c.workStart && c.completedAt)
      .sort((a, b) => a.completedAt - b.completedAt)
      .map(c => {
        const elapsed = Math.max(0, c.completedAt - c.workStart),
          tracked = Math.max(0, Number(c.time) || 0);
        return {
          id: c.id,
          name: c.name,
          focus: tracked,
          elapsed,
          tracked: tracked || elapsed,
          actual: elapsed,
          allotted: c.deadline ? Math.max(0, c.deadline - c.workStart) : null,
          late: c.deadline ? c.completedAt > c.deadline : null
        };
      });
    const avg = items.length ? Math.round(items.reduce((s, i) => s + i.actual, 0) / items.length) : 0;
    return { items, avg, withDeadline: items.filter(i => i.allotted !== null) };
  }

  /* ---- Today page helpers (all pure) ---- */
  const addDays = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return today(new Date(y, m - 1, d + n));
  };
  /** Today's to-dos: those dated today plus unfinished ones carried over from earlier days. */
  const todosFor = (todos, ymd) => todos.filter(t => t.date === ymd || (!t.done && t.date < ymd));
  const eventsOn = (events, ymd) =>
    events.filter(e => e.date === ymd).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const upcomingEvents = (events, ymd, days) => {
    const end = addDays(ymd, days);
    return events
      .filter(e => e.date > ymd && e.date <= end)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  };
  /** Pending commissions that are overdue or due within `days`, soonest first. */
  const dueList = (tasks, now, days) =>
    tasks.filter(t => t.deadline && t.deadline <= now + days * 864e5).sort((a, b) => a.deadline - b.deadline);
  const dueStatus = (deadline, now) =>
    deadline < now ? 'overdue' : today(new Date(deadline)) === today(new Date(now)) ? 'today' : 'soon';
  function clientStats(commissions) {
    const out = {};
    commissions.forEach(c => {
      if (!c.clientId) return;
      const s = (out[c.clientId] = out[c.clientId] || { count: 0, revenue: 0, last: '' });
      s.count++;
      s.revenue = round2(s.revenue + c.price);
      if (c.date > s.last) s.last = c.date;
    });
    return out;
  }
  /** Roblox avatars load by numeric user ID. Accepts an ID or a profile link; returns '' if it can't find one. */
  function parseRobloxId(input) {
    const s = String(input || '').trim();
    if (/^\d{1,15}$/.test(s)) return s;
    const m = s.match(/roblox\.com\/(?:[a-z-]+\/)?users\/(\d{1,15})/i);
    return m ? m[1] : '';
  }
  /** Minimal .ics reader: SUMMARY + DTSTART of each VEVENT (recurrence rules are not expanded). */
  function parseICS(text) {
    const lines = String(text)
      .replace(/\r\n?/g, '\n')
      .replace(/\n[ \t]/g, '')
      .split('\n');
    const out = [];
    let cur = null;
    for (const l of lines) {
      if (l.startsWith('BEGIN:VEVENT')) cur = {};
      else if (l.startsWith('END:VEVENT')) {
        if (cur && cur.title && cur.date) out.push(cur);
        cur = null;
      } else if (cur) {
        const i = l.indexOf(':');
        if (i < 0) continue;
        const name = l.slice(0, i).split(';')[0].toUpperCase(),
          val = l.slice(i + 1).trim();
        if (name === 'SUMMARY') cur.title = val.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
        if (name === 'DTSTART') {
          const m = val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?(Z)?/);
          if (!m) continue;
          if (m[6] && m[4]) {
            const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
            cur.date = today(d);
            cur.time = pad(d.getHours()) + ':' + pad(d.getMinutes());
          } else {
            cur.date = `${m[1]}-${m[2]}-${m[3]}`;
            cur.time = m[4] ? `${m[4]}:${m[5]}` : '';
          }
        }
      }
    }
    return out;
  }

  const taskElapsed = (t, now = Date.now()) => t.elapsed + (t.startedAt ? Math.max(0, now - t.startedAt) : 0);
  const sortByDate = list =>
    list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created - b.created));

  const api = {
    load,
    normalize,
    save,
    saveSoon,
    flush,
    uid,
    today,
    monthKey,
    shiftMonth,
    monthlySeries,
    stats,
    turnaround,
    addDays,
    todosFor,
    eventsOn,
    upcomingEvents,
    dueList,
    dueStatus,
    clientStats,
    parseRobloxId,
    parseICS,
    taskElapsed,
    sortByDate,
    round2
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gloom = api;
})(typeof window !== 'undefined' ? window : globalThis);
