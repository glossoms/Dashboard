/* Dependency-free SVG charts. Each function takes (data, options) and returns an SVG string.
   Options: { w, h, id, big, pad } — `big` renders at a fixed pixel size for the expanded view. */
(function (root) {
  const q = s => String(s).replace(/"/g, '&quot;');
  const compact = n => (n >= 1000 ? +(n / 1000).toFixed(1) + 'k' : String(Math.round(n * 100) / 100));
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }
  function ctx(o = {}) {
    const w = o.w || 640, h = o.h || 240, p = Object.assign({ t: 18, r: 14, b: 34, l: 48 }, o.pad);
    return { w, h, p, iw: w - p.l - p.r, ih: h - p.t - p.b, id: o.id || 'c', big: !!o.big };
  }
  const yOf = (c, v, max) => c.p.t + c.ih - (v / max) * c.ih;
  const open = c => `<svg viewBox="0 0 ${c.w} ${c.h}" class="chart${c.big ? ' bigc' : ''}"${c.big ? ` width="${c.w}" height="${c.h}"` : ''} role="img">`;
  const empty = msg => `<div class="chart-empty">${msg}</div>`;

  function frame(c, max, right) {
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, y = yOf(c, v, max);
      g += `<line class="grid" x1="${c.p.l}" x2="${c.w - c.p.r}" y1="${y}" y2="${y}"/><text class="axis" x="${c.p.l - 8}" y="${y + 4}" text-anchor="end">${compact(v)}</text>`;
      if (right) g += `<text class="axis" x="${c.w - c.p.r + 8}" y="${y + 4}">${compact((right / 4) * i)}</text>`;
    }
    return g;
  }
  /* Faded, outlined fill: colour at the top dissolving to transparent below, with a matching fading outline. */
  const grad = (c, name, v) =>
    `<linearGradient id="${c.id}-${name}-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(${v})" stop-opacity=".45"/><stop offset="1" stop-color="var(${v})" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="${c.id}-${name}-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(${v})" stop-opacity="1"/><stop offset=".8" stop-color="var(${v})" stop-opacity=".15"/><stop offset="1" stop-color="var(${v})" stop-opacity="0"/></linearGradient>`;
  const bar = (c, name, x, y, w, h, tip, delay) =>
    `<rect class="bar" fill="url(#${c.id}-${name}-f)" stroke="url(#${c.id}-${name}-s)" stroke-width="1.5" data-tip="${q(tip)}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(9, w / 2)}" style="animation-delay:${delay}ms"/>`;
  /* Dotted guide line; the wide invisible twin makes it easy to hover. */
  const dash = (c, y, tip) => `<line class="dash" x1="${c.p.l}" x2="${c.w - c.p.r}" y1="${y}" y2="${y}"/><line class="hit" x1="${c.p.l}" x2="${c.w - c.p.r}" y1="${y}" y2="${y}" data-tip="${q(tip)}"/>`;
  const endMark = (c, y, tip) => `<circle class="mark" cx="${c.w - c.p.r}" cy="${y}" r="4.5" data-tip="${q(tip)}"/>`;

  function bars(items, o = {}) {
    if (!items.length) return empty(o.empty || 'No data yet');
    const c = ctx(o), max = niceMax(Math.max(...items.map(i => i.value), o.avg ? o.avg.value : 0));
    const step = c.iw / items.length, bw = Math.min(c.big ? 54 : 40, step * 0.6);
    const every = Math.ceil(items.length / (o.maxLabels || 8));
    let s = `${open(c)}<defs>${grad(c, 'acc', '--accent')}</defs>${frame(c, max)}`;
    if (o.avg) s += dash(c, yOf(c, o.avg.value, max), o.avg.tip);
    items.forEach((it, i) => {
      const h = Math.max(2, (it.value / max) * c.ih), x = c.p.l + step * i + (step - bw) / 2;
      s += bar(c, 'acc', x, c.p.t + c.ih - h, bw, h, it.tip, i * 40);
      if (i % every === 0) s += `<text class="axis" x="${x + bw / 2}" y="${c.h - 10}" text-anchor="middle">${it.label}</text>`;
    });
    if (o.avg) s += endMark(c, yOf(c, o.avg.value, max), o.avg.tip);
    if (o.best != null) {
      const it = items[o.best], x = c.p.l + step * o.best + step / 2, y = yOf(c, it.value, max) - 12;
      s += `<circle class="mark star" cx="${x}" cy="${y}" r="4.5" data-tip="${q(o.bestTip)}"/>`;
    }
    return s + '</svg>';
  }

  function line(items, o = {}) {
    if (!items.length) return empty('No data yet');
    const c = ctx(o), max = Math.max(4, Math.ceil(Math.max(...items.map(i => i.value), o.target || 0) / 4) * 4);
    const step = items.length > 1 ? c.iw / (items.length - 1) : 0;
    const pts = items.map((it, i) => [c.p.l + (items.length > 1 ? step * i : c.iw / 2), yOf(c, it.value, max)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = `${d} L${pts[pts.length - 1][0]} ${c.p.t + c.ih} L${pts[0][0]} ${c.p.t + c.ih} Z`;
    let s = `${open(c)}<defs><linearGradient id="${c.id}-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".25"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${frame(c, max)}`;
    s += `<path class="area" d="${area}" fill="url(#${c.id}-area)"/><path class="stroke" pathLength="1" d="${d}"/>`;
    if (o.target > 0) s += dash(c, yOf(c, o.target, max), o.targetTip || `Target · ${compact(o.target)}`);
    pts.forEach((p, i) => {
      s += `<circle class="dot" data-tip="${q(items[i].tip)}" cx="${p[0]}" cy="${p[1]}" r="5" style="animation-delay:${400 + i * 60}ms"/>`;
      s += `<text class="axis" x="${p[0]}" y="${c.h - 10}" text-anchor="middle">${items[i].label}</text>`;
    });
    return s + '</svg>';
  }

  /* Expanded "commissions per month": count line (left axis) + each commission's price as a dot (right axis) + dotted average price. */
  function combo(months, dots, o = {}) {
    const c = ctx(Object.assign({}, o, { pad: { r: 58 } }));
    const maxC = Math.max(4, Math.ceil(Math.max(...months.map(m => m.count)) / 4) * 4);
    const maxP = niceMax(Math.max(1, ...dots.map(d => d.price), o.avg ? o.avg.value : 0));
    const step = c.iw / months.length, cx = i => c.p.l + step * (i + 0.5);
    const pts = months.map((m, i) => [cx(i), yOf(c, m.count, maxC)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    let s = `${open(c)}<defs><linearGradient id="${c.id}-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
    s += frame(c, maxC, maxP);
    if (o.avg) s += dash(c, yOf(c, o.avg.value, maxP), o.avg.tip);
    s += `<path class="area" d="${d} L${pts[pts.length - 1][0]} ${c.p.t + c.ih} L${pts[0][0]} ${c.p.t + c.ih} Z" fill="url(#${c.id}-area)"/><path class="stroke" pathLength="1" d="${d}"/>`;
    pts.forEach((p, i) => {
      s += `<circle class="dot" data-tip="${q(months[i].tip)}" cx="${p[0]}" cy="${p[1]}" r="5" style="animation-delay:${400 + i * 50}ms"/>`;
      s += `<text class="axis" x="${p[0]}" y="${c.h - 10}" text-anchor="middle">${months[i].label}</text>`;
    });
    const by = {}; dots.forEach(dt => (by[dt.i] = by[dt.i] || []).push(dt));
    Object.values(by).forEach(g => g.forEach((dt, j) => {
      const off = (j - (g.length - 1) / 2) * Math.min(16, (step * 0.7) / g.length);
      s += `<circle class="pdot" data-tip="${q(dt.tip)}" cx="${cx(dt.i) + off}" cy="${yOf(c, dt.price, maxP)}" r="5" style="animation-delay:${700 + dt.i * 40}ms"/>`;
    }));
    if (o.avg) s += endMark(c, yOf(c, o.avg.value, maxP), o.avg.tip);
    return s + '</svg>';
  }

  /* Deadline window vs actual. Expanded adds focus-time dots and a dotted average. items: {label,a,b,late,tip,f,ftip} */
  function grouped(items, o = {}) {
    if (!items.length) return empty('Complete a pending commission that has a deadline');
    const c = ctx(o), max = niceMax(Math.max(...items.flatMap(i => [i.a, i.b]), o.avg ? o.avg.value : 0));
    const step = c.iw / items.length, bw = Math.min(c.big ? 34 : 24, step * 0.3), gap = 4;
    const every = Math.ceil(items.length / (o.maxLabels || 8));
    let s = `${open(c)}<defs>${grad(c, 'mute', '--mute')}${grad(c, 'ok', '--green')}${grad(c, 'late', '--red')}</defs>${frame(c, max)}`;
    if (o.avg) s += dash(c, yOf(c, o.avg.value, max), o.avg.tip);
    items.forEach((it, i) => {
      const mid = c.p.l + step * i + step / 2, ha = Math.max(2, (it.a / max) * c.ih), hb = Math.max(2, (it.b / max) * c.ih);
      s += bar(c, 'mute', mid - bw - gap / 2, c.p.t + c.ih - ha, bw, ha, it.tip, i * 50);
      s += bar(c, it.late ? 'late' : 'ok', mid + gap / 2, c.p.t + c.ih - hb, bw, hb, it.tip, i * 50 + 80);
      if (i % every === 0) s += `<text class="axis" x="${mid}" y="${c.h - 10}" text-anchor="middle">${it.label}</text>`;
    });
    if (o.focus) items.forEach((it, i) => {
      if (!(it.f > 0)) return;
      const mid = c.p.l + step * i + step / 2;
      s += `<circle class="fdot" data-tip="${q(it.ftip)}" cx="${mid + gap / 2 + bw / 2}" cy="${yOf(c, Math.min(it.f, max), max)}" r="5" style="animation-delay:${600 + i * 50}ms"/>`;
    });
    if (o.avg) s += endMark(c, yOf(c, o.avg.value, max), o.avg.tip);
    return s + '</svg>';
  }

  root.Charts = { bars, line, combo, grouped, niceMax };
})(window);
