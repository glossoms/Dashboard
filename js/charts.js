/* Dependency-free SVG charts with CSS-driven animation. */
(function (root) {
  const W = 640, H = 240, P = { t: 16, r: 12, b: 30, l: 44 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }
  const compact = n => (n >= 1000 ? +(n / 1000).toFixed(1) + 'k' : String(Math.round(n * 100) / 100));

  function frame(max, ticks = 4) {
    let g = '';
    for (let i = 0; i <= ticks; i++) {
      const v = (max / ticks) * i, y = P.t + ih - (v / max) * ih;
      g += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}"/><text class="axis" x="${P.l - 8}" y="${y + 4}" text-anchor="end">${compact(v)}</text>`;
    }
    return g;
  }
  const empty = msg => `<div class="chart-empty">${msg}</div>`;

  /** Bars: items = [{label, value, tip}] */
  function bars(items) {
    if (!items.length) return empty('No data yet');
    const max = niceMax(Math.max(...items.map(i => i.value)));
    const step = iw / items.length, bw = Math.min(40, step * 0.6);
    const showEvery = Math.ceil(items.length / 8);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${frame(max)}`;
    items.forEach((it, i) => {
      const h = Math.max(2, (it.value / max) * ih), x = P.l + step * i + (step - bw) / 2, y = P.t + ih - h;
      s += `<rect class="bar" data-tip="${it.tip.replace(/"/g, '&quot;')}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="${Math.min(8, bw / 2)}" style="animation-delay:${i * 40}ms"/>`;
      if (i % showEvery === 0) s += `<text class="axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${it.label}</text>`;
    });
    return s + '</svg>';
  }

  /** Line: items = [{label, value, tip}] */
  function line(items) {
    if (!items.length) return empty('No data yet');
    const max = Math.max(4, Math.ceil(Math.max(...items.map(i => i.value)) / 4) * 4); // whole-number ticks for counts
    const step = items.length > 1 ? iw / (items.length - 1) : 0;
    const pts = items.map((it, i) => [P.l + (items.length > 1 ? step * i : iw / 2), P.t + ih - (it.value / max) * ih]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = `${d} L${pts[pts.length - 1][0]} ${P.t + ih} L${pts[0][0]} ${P.t + ih} Z`;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>${frame(max)}`;
    s += `<path class="area" d="${area}" fill="url(#lg)"/><path class="stroke" pathLength="1" d="${d}"/>`;
    pts.forEach((p, i) => {
      s += `<circle class="dot" data-tip="${items[i].tip.replace(/"/g, '&quot;')}" cx="${p[0]}" cy="${p[1]}" r="5" style="animation-delay:${400 + i * 60}ms"/>`;
      s += `<text class="axis" x="${p[0]}" y="${H - 8}" text-anchor="middle">${items[i].label}</text>`;
    });
    return s + '</svg>';
  }

  /** Grouped bars: items = [{label, a, b, late, tip}] — a = allotted, b = actual */
  function grouped(items) {
    if (!items.length) return empty('Complete a pending commission that has a deadline');
    const max = niceMax(Math.max(...items.flatMap(i => [i.a, i.b])));
    const step = iw / items.length, bw = Math.min(24, step * 0.3), gap = 4;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${frame(max)}`;
    items.forEach((it, i) => {
      const cx = P.l + step * i + step / 2, tip = it.tip.replace(/"/g, '&quot;');
      [[it.a, 'a', cx - bw - gap / 2], [it.b, it.late ? 'late' : 'ok', cx + gap / 2]].forEach(([v, cls, x], k) => {
        const h = Math.max(2, (v / max) * ih);
        s += `<rect class="gb ${cls}" data-tip="${tip}" x="${x}" y="${P.t + ih - h}" width="${bw}" height="${h}" rx="${Math.min(7, bw / 2)}" style="animation-delay:${i * 50 + k * 80}ms"/>`;
      });
      s += `<text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${it.label}</text>`;
    });
    return s + '</svg>';
  }

  root.Charts = { bars, line, grouped, niceMax };
})(window);
