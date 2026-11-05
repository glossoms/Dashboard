const assert = require('node:assert');
const G = require('../js/store.js');

const c = (price, date) => ({ id: G.uid(), name: 'x', price, date, created: 0 });
const list = [c(100, '2026-11-02'), c(50.5, '2026-11-04'), c(200, '2026-10-15'), c(10, '2026-01-31')];

// stats
const s = G.stats(list, '2026-11');
assert.strictEqual(s.monthRevenue, 150.5);
assert.strictEqual(s.monthCount, 2);
assert.strictEqual(s.monthAvg, 75.25);
assert.strictEqual(s.prevRevenue, 200);
assert.strictEqual(s.delta, -24.75);
assert.strictEqual(s.total, 360.5);
assert.strictEqual(s.best.price, 200);
assert.strictEqual(G.stats([], '2026-11').delta, null);

// month shifting across year boundary
assert.strictEqual(G.shiftMonth('2026-01', -1), '2025-12');
assert.strictEqual(G.shiftMonth('2026-12', 1), '2027-01');

// series
const ser = G.monthlySeries(list, 6, '2026-11');
assert.strictEqual(ser.length, 6);
assert.deepStrictEqual(ser.map(m => m.key), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
assert.strictEqual(ser[5].count, 2); assert.strictEqual(ser[4].revenue, 200); assert.strictEqual(ser[0].count, 0);

// float precision
assert.strictEqual(G.stats([c(0.1, '2026-11-01'), c(0.2, '2026-11-02')], '2026-11').monthRevenue, 0.3);

// edit / delete reflected in stats
list[0].price = 300; assert.strictEqual(G.stats(list, '2026-11').monthRevenue, 350.5);
list.splice(0, 1); assert.strictEqual(G.stats(list, '2026-11').monthCount, 1);

// timers
assert.strictEqual(G.taskElapsed({ elapsed: 5000, startedAt: null }, 99999), 5000);
assert.strictEqual(G.taskElapsed({ elapsed: 5000, startedAt: 1000 }, 4000), 8000);

// sorting
assert.deepStrictEqual(G.sortByDate([c(1, '2026-03-01'), c(2, '2026-01-01')]).map(x => x.price), [2, 1]);
// turnaround: deadline vs actual (wall-clock from first Start to Complete)
const H = 36e5, T0 = 1_000_000_000_000;
const done = [
  { id: 'a', name: 'A', workStart: T0, deadline: T0 + 10 * H, completedAt: T0 + 6 * H, time: 2 * H },   // on time
  { id: 'b', name: 'B', workStart: T0, deadline: T0 + 4 * H, completedAt: T0 + 9 * H, time: 3 * H },    // late
  { id: 'c', name: 'C', workStart: T0, completedAt: T0 + 3 * H },                                      // no deadline
  { id: 'd', name: 'D', price: 5 }                                                                      // manual, ignored
];
const ta = G.turnaround(done);
assert.strictEqual(ta.items.length, 3);
assert.strictEqual(ta.withDeadline.length, 2);
assert.strictEqual(ta.items.find(i => i.id === 'a').late, false);
assert.strictEqual(ta.items.find(i => i.id === 'b').late, true);
assert.strictEqual(ta.items.find(i => i.id === 'b').allotted, 4 * H);
assert.strictEqual(ta.avg, 6 * H); // (6+9+3)/3 hours
assert.strictEqual(ta.items.find(i => i.id === 'c').allotted, null);
assert.deepStrictEqual(G.turnaround([]).items, []);
console.log('logic tests passed');
