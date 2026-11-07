if (typeof window !== 'undefined') (window.GLOOM_FILES = window.GLOOM_FILES || {})['sound.js'] = '9';
/* Tiny synthesized UI sounds (Web Audio) — no files. Very quiet by design; can be muted from the header. */
(function (root) {
  let ctx = null,
    on = true;
  function ac() {
    if (!ctx) {
      const A = root.AudioContext || root.webkitAudioContext;
      if (!A) return null;
      ctx = new A();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, o = {}) {
    const c = ac();
    if (!c) return;
    const t = c.currentTime + (o.at || 0),
      osc = c.createOscillator(),
      g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(freq * o.slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain || 0.025, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }
  const kinds = {
    tap: () => tone(1250, 0.035, { gain: 0.016, slide: 0.7 }),
    tab: () => tone(900, 0.05, { gain: 0.015 }),
    add: () => {
      tone(660, 0.07, { gain: 0.02 });
      tone(990, 0.1, { gain: 0.016, at: 0.05 });
    },
    done: () => {
      tone(784, 0.1, { gain: 0.022 });
      tone(1175, 0.16, { gain: 0.02, at: 0.07 });
      tone(1568, 0.24, { gain: 0.014, at: 0.14 });
    },
    undo: () => tone(520, 0.07, { gain: 0.016, slide: 0.8 }),
    del: () => tone(260, 0.1, { gain: 0.026, slide: 0.6, type: 'triangle' }),
    start: () => {
      tone(700, 0.05, { gain: 0.016 });
      tone(1050, 0.08, { gain: 0.014, at: 0.04 });
    },
    pause: () => tone(720, 0.08, { gain: 0.016, slide: 0.75 }),
    open: () => tone(520, 0.13, { gain: 0.014, slide: 1.5 }),
    close: () => tone(640, 0.1, { gain: 0.012, slide: 0.7 }),
    cross: () => {
      tone(520, 0.12, { gain: 0.012, slide: 0.55, type: 'triangle' });
      tone(310, 0.15, { gain: 0.009, at: 0.04, slide: 0.75, type: 'sine' });
    }
  };
  root.Sound = {
    play(kind) {
      if (!on) return;
      try {
        (kinds[kind] || kinds.tap)();
      } catch (e) {
        /* audio unavailable */
      }
    },
    set(v) {
      on = !!v;
    },
    get: () => on
  };
})(window);
