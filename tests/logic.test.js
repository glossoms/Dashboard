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
assert.deepStrictEqual(
  ser.map(m => m.key),
  ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']
);
assert.strictEqual(ser[5].count, 2);
assert.strictEqual(ser[4].revenue, 200);
assert.strictEqual(ser[0].count, 0);

// float precision
assert.strictEqual(G.stats([c(0.1, '2026-11-01'), c(0.2, '2026-11-02')], '2026-11').monthRevenue, 0.3);

// edit / delete reflected in stats
list[0].price = 300;
assert.strictEqual(G.stats(list, '2026-11').monthRevenue, 350.5);
list.splice(0, 1);
assert.strictEqual(G.stats(list, '2026-11').monthCount, 1);

// timers
assert.strictEqual(G.taskElapsed({ elapsed: 5000, startedAt: null }, 99999), 5000);
assert.strictEqual(G.taskElapsed({ elapsed: 5000, startedAt: 1000 }, 4000), 8000);

// sorting
assert.deepStrictEqual(
  G.sortByDate([c(1, '2026-03-01'), c(2, '2026-01-01')]).map(x => x.price),
  [2, 1]
);
// turnaround: deadline vs actual (wall-clock from first Start to Complete)
const H = 36e5,
  T0 = 1_000_000_000_000;
const done = [
  { id: 'a', name: 'A', workStart: T0, deadline: T0 + 10 * H, completedAt: T0 + 6 * H, time: 2 * H }, // on time
  { id: 'b', name: 'B', workStart: T0, deadline: T0 + 4 * H, completedAt: T0 + 9 * H, time: 3 * H }, // late
  { id: 'c', name: 'C', workStart: T0, completedAt: T0 + 3 * H }, // no deadline
  { id: 'd', name: 'D', price: 5 } // manual, ignored
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
// ---- Today helpers ----
assert.strictEqual(G.addDays('2026-11-05', -1), '2026-11-04');
assert.strictEqual(G.addDays('2026-12-31', 1), '2027-01-01');
assert.strictEqual(G.addDays('2026-03-01', -1), '2026-02-28');
const todos = [
  { id: 1, date: '2026-11-05', done: false },
  { id: 2, date: '2026-11-05', done: true },
  { id: 3, date: '2026-11-04', done: false }, // carried over
  { id: 4, date: '2026-11-04', done: true }, // finished yesterday: hidden
  { id: 5, date: '2026-11-06', done: false } // future: hidden
];
assert.deepStrictEqual(
  G.todosFor(todos, '2026-11-05').map(t => t.id),
  [1, 2, 3]
);
const evs = [
  { date: '2026-11-05', time: '14:00', title: 'b' },
  { date: '2026-11-05', time: '', title: 'a' },
  { date: '2026-11-07', time: '09:00', title: 'c' },
  { date: '2026-11-20', title: 'far' }
];
assert.deepStrictEqual(
  G.eventsOn(evs, '2026-11-05').map(e => e.title),
  ['a', 'b']
); // all-day first, then by time
assert.deepStrictEqual(
  G.upcomingEvents(evs, '2026-11-05', 7).map(e => e.title),
  ['c']
);
const N = new Date(2026, 10, 5, 12, 0).getTime();
const dueTasks = [
  { id: 'x', deadline: N + 3 * 864e5 },
  { id: 'y', deadline: N - 36e5 },
  { id: 'z', deadline: N + 20 * 864e5 },
  { id: 'w' }
];
assert.deepStrictEqual(
  G.dueList(dueTasks, N, 7).map(t => t.id),
  ['y', 'x']
); // overdue first, far/none excluded
assert.strictEqual(G.dueStatus(N - 1, N), 'overdue');
assert.strictEqual(G.dueStatus(N + 2 * 36e5, N), 'today');
assert.strictEqual(G.dueStatus(N + 2 * 864e5, N), 'soon');

// clients
const cs = G.clientStats([
  { clientId: 'a', price: 10.1, date: '2026-01-01' },
  { clientId: 'a', price: 20.2, date: '2026-02-01' },
  { clientId: 'b', price: 5, date: '2026-03-01' },
  { price: 99, date: '2026-04-01' }
]);
assert.deepStrictEqual(cs.a, { count: 2, revenue: 30.3, last: '2026-02-01' });
assert.strictEqual(cs.b.count, 1);
assert.strictEqual(Object.keys(cs).length, 2);
assert.strictEqual(G.parseRobloxId('  123456789 '), '123456789');
assert.strictEqual(G.parseRobloxId('https://www.roblox.com/users/987654/profile'), '987654');
assert.strictEqual(G.parseRobloxId('https://www.roblox.com/en/users/42/profile'), '42');
assert.strictEqual(G.parseRobloxId('SomeUsername'), '');
assert.strictEqual(G.parseRobloxId(''), '');
assert.strictEqual(G.parseRobloxId('12ab'), '');

// ics
const ics = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'SUMMARY:Call with Acme\\, Inc',
  'DTSTART:20261110T143000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Holiday',
  'DTSTART;VALUE=DATE:20261112',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Long',
  ' title here',
  'DTSTART:20261115T090000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20261116',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');
const parsed = G.parseICS(ics);
assert.deepStrictEqual(parsed, [
  { title: 'Call with Acme, Inc', date: '2026-11-10', time: '14:30' },
  { title: 'Holiday', date: '2026-11-12', time: '' },
  { title: 'Longtitle here', date: '2026-11-15', time: '09:00' }
]); // folded line joined, no-summary event skipped
const z = G.parseICS('BEGIN:VEVENT\nSUMMARY:Z\nDTSTART:20261110T100000Z\nEND:VEVENT')[0];
const zd = new Date(Date.UTC(2026, 10, 10, 10, 0));
assert.strictEqual(z.date, G.today(zd));
assert.strictEqual(z.time, String(zd.getHours()).padStart(2, '0') + ':' + String(zd.getMinutes()).padStart(2, '0'));
assert.deepStrictEqual(G.parseICS('garbage'), []);
// ---- normalize: any saved shape loads safely, and user choices survive ----
const n1 = G.normalize(null);
assert.deepStrictEqual(
  [n1.tasks, n1.awaiting, n1.percentages, n1.clients, n1.events, n1.todos, n1.commissions].map(a => a.length),
  [0, 0, 0, 0, 0, 0, 0]
);
assert.strictEqual(G.normalize('junk').currency, 'USD');
assert.strictEqual(G.normalize({ currency: 'EUR' }).currency, 'USD');
assert.ok(G.normalize({ rate: { value: -3 } }).rate.value > 0);
const n2 = G.normalize({
  tasks: [
    { id: 'a', done: true },
    { id: 'b', title: 'k', elapsed: 5, created: 9 }
  ],
  awaiting: [{ id: 'w', paymentMethod: 'payoneer' }, { id: 'v' }],
  clients: [{ id: 'c' }],
  notes: 7
});
assert.deepStrictEqual(
  n2.tasks.map(t => t.id),
  ['b']
); // finished legacy to-dos dropped
assert.strictEqual(n2.tasks[0].firstStart, 9);
assert.strictEqual(n2.tasks[0].price, 0);
assert.strictEqual(n2.awaiting[0].paymentMethod, 'payoneer'); // a chosen method is never reset
assert.strictEqual(n2.awaiting[1].paymentMethod, 'wise'); // default only when missing
assert.deepStrictEqual(n2.clients[0].experiences, []);
assert.deepStrictEqual(n2.notes, {});
assert.strictEqual(JSON.stringify(G.normalize(G.normalize(n2))), JSON.stringify(G.normalize(n2))); // idempotent
console.log('logic tests passed');
