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
console.log('logic tests passed');
