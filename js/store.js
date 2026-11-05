/* Data layer + calculations. Pure functions are exported for testing in Node. */
(function (root) {
  const KEY = 'gloom.v1';
  const empty = () => ({ commissions: [], tasks: [], currency: 'USD', rate: { value: 95, manual: false, updated: 0 } });
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      const s = Object.assign(empty(), d || {});
      if (s.currency !== 'INR') s.currency = 'USD';
      if (!s.rate || !(s.rate.value > 0)) s.rate = empty().rate;
      return s;
    } catch (e) { return empty(); }
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
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
      monthRevenue, prevRevenue, delta,
      monthCount: cur.length,
      monthAvg: cur.length ? round2(monthRevenue / cur.length) : 0,
      total, count: commissions.length, best
    };
  }

  /** Deadline vs actual. workStart = first Start click, actual = Complete click - workStart (wall-clock, not focus time). */
  function turnaround(commissions) {
    const items = commissions.filter(c => c.workStart && c.completedAt)
      .sort((a, b) => a.completedAt - b.completedAt)
      .map(c => ({
        id: c.id, name: c.name, focus: c.time || 0,
        actual: Math.max(0, c.completedAt - c.workStart),
        allotted: c.deadline ? Math.max(0, c.deadline - c.workStart) : null,
        late: c.deadline ? c.completedAt > c.deadline : null
      }));
    const avg = items.length ? Math.round(items.reduce((s, i) => s + i.actual, 0) / items.length) : 0;
    return { items, avg, withDeadline: items.filter(i => i.allotted !== null) };
  }

  const taskElapsed = (t, now = Date.now()) => t.elapsed + (t.startedAt ? Math.max(0, now - t.startedAt) : 0);
  const sortByDate = list => list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created - b.created));

  const api = { load, save, uid, today, monthKey, shiftMonth, monthlySeries, stats, turnaround, taskElapsed, sortByDate, round2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gloom = api;
})(typeof window !== 'undefined' ? window : globalThis);
