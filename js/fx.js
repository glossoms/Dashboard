if (typeof window !== 'undefined') (window.GLOOM_FILES = window.GLOOM_FILES || {})['fx.js'] = '13';
/* Cursor light.
   Two subtle layers that follow the pointer, like the specular light on Apple hardware:
   - #aura: a very soft ambient glow behind the page.
   - cards: a surface glow plus a lit edge, positioned by the --mx / --my custom properties.
   Pointer-only: skipped on touch devices and with reduced motion. One rAF-throttled listener, no timers. */
(function (root) {
  if (
    !matchMedia('(hover: hover) and (pointer: fine)').matches ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return;

  const aura = document.createElement('div');
  aura.id = 'aura';
  aura.setAttribute('aria-hidden', 'true');
  document.body.prepend(aura);

  const LIT = '.card, .btn.primary';
  let x = 0,
    y = 0,
    target = null,
    frame = 0,
    lit = null;

  function paint() {
    frame = 0;
    aura.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    aura.classList.add('on');
    const el = target && target.closest ? target.closest(LIT) : null;
    if (lit && lit !== el) lit.classList.remove('lit');
    if (el) {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', x - r.left + 'px');
      el.style.setProperty('--my', y - r.top + 'px');
      el.classList.add('lit');
    }
    lit = el;
  }

  document.addEventListener(
    'pointermove',
    e => {
      if (e.pointerType === 'touch') return;
      x = e.clientX;
      y = e.clientY;
      target = e.target;
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { passive: true }
  );

  document.documentElement.addEventListener('mouseleave', () => {
    aura.classList.remove('on');
    if (lit) {
      lit.classList.remove('lit');
      lit = null;
    }
  });
})(window);
