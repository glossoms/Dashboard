if (typeof window !== 'undefined') (window.GLOOM_FILES = window.GLOOM_FILES || {})['dom.js'] = '11';
/* DOM helpers.

   morph(root, html)  Updates `root` in place to match `html` instead of rebuilding it. Because existing
                      elements survive, CSS transitions play (check marks, strike-throughs, progress bars),
                      focus / scroll / typed text are kept, and only genuinely new or removed items animate.
   closeDialog(d)     Closes a <dialog> with an exit animation.
   swapText(el, txt)  Cross-fades a text change.

   Items are matched by a stable key: data-key, id, or data-widget. */
(function (root) {
  const tpl = document.createElement('template');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* Classes owned by JS (animation state); a morph must never strip them. */
  const OWNED = new Set(['enter', 'leaving']);
  /* Elements that get enter / leave animations when they appear or disappear. */
  const ANIMATED = 'li, .today-widget, .client, .awaiting-section, .toast';
  const LEAVE_MS = 260;

  const keyOf = el => (el.nodeType === 1 ? el.dataset.key || el.id || el.dataset.widget || null : null);
  const isLive = n => !(n.nodeType === 1 && n.classList.contains('leaving'));

  function syncClass(from, value) {
    const owned = [...from.classList].filter(c => OWNED.has(c));
    const next = value.split(/\s+/).filter(Boolean).concat(owned).join(' ');
    if (from.getAttribute('class') === next) return;
    if (next) from.setAttribute('class', next);
    else from.removeAttribute('class');
  }

  function syncAttrs(from, to) {
    /* The cursor light (js/fx.js) stores its position in inline custom properties; carry them across. */
    const mx = from.style && from.style.getPropertyValue('--mx'),
      my = from.style && from.style.getPropertyValue('--my');
    for (const a of [...from.attributes]) {
      if (a.name !== 'class' && !to.hasAttribute(a.name)) from.removeAttribute(a.name);
    }
    for (const a of to.attributes) {
      if (a.name === 'class') continue;
      if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
    }
    if (mx) {
      from.style.setProperty('--mx', mx);
      from.style.setProperty('--my', my);
    }
    syncClass(from, to.getAttribute('class') || '');
  }

  /* Live form state wins over the template while the user is interacting with it. */
  function syncControl(from, to) {
    const focused = document.activeElement === from;
    if (from.nodeName === 'INPUT') {
      if (from.type === 'file') return;
      if (from.type === 'checkbox' || from.type === 'radio') from.checked = to.hasAttribute('checked');
      else if (!focused && to.hasAttribute('value') && from.value !== to.getAttribute('value'))
        from.value = to.getAttribute('value');
    } else if (from.nodeName === 'TEXTAREA') {
      if (!focused && from.value !== to.textContent) from.value = to.textContent;
    } else if (from.nodeName === 'SELECT' && !focused) {
      const chosen = to.querySelector('option[selected]');
      if (chosen && from.value !== chosen.value) from.value = chosen.value;
    }
  }

  function enter(el) {
    if (reduced() || !el.matches || !el.matches(ANIMATED)) return;
    el.classList.add('enter');
    el.addEventListener('animationend', function done(e) {
      if (e.target !== el) return;
      el.removeEventListener('animationend', done);
      el.classList.remove('enter');
    });
  }

  function leave(el) {
    if (el.nodeType !== 1 || reduced() || !el.matches(ANIMATED)) return el.remove();
    el.style.height = el.offsetHeight + 'px';
    void el.offsetHeight; // commit the starting height so the collapse can transition
    el.classList.add('leaving');
    el.style.height = '0px';
    setTimeout(() => el.remove(), LEAVE_MS);
  }

  function morphNode(from, to) {
    if (from.nodeType === 3) {
      if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
      return;
    }
    /* Avatars are filled in by JS after load; never reset them. */
    if (from.nodeName === 'IMG' && from.dataset.robloxId && from.dataset.robloxId === to.dataset.robloxId) return;
    syncAttrs(from, to);
    morphChildren(from, to);
    syncControl(from, to);
  }

  function morphChildren(from, to) {
    const live = [...from.childNodes].filter(isLive);
    const byKey = new Map();
    live.forEach(n => {
      const k = keyOf(n);
      if (k) byKey.set(k, n);
    });
    const seen = new Set();
    let cur = live[0] || null;
    const advance = () => {
      do {
        cur = cur && cur.nextSibling;
      } while (cur && !isLive(cur));
    };

    for (const next of to.childNodes) {
      if (next.nodeType === 8) continue; // comments
      const k = keyOf(next);
      let match = null;
      if (k) match = byKey.get(k) || null;
      else if (cur && !keyOf(cur) && !seen.has(cur) && cur.nodeType === next.nodeType && cur.nodeName === next.nodeName)
        match = cur;

      if (match) {
        if (match === cur) advance();
        else from.insertBefore(match, cur);
        seen.add(match);
        morphNode(match, next);
      } else {
        const created = document.importNode(next, true);
        from.insertBefore(created, cur);
        seen.add(created);
        enter(created);
      }
    }
    for (const n of live) if (!seen.has(n) && n.parentNode === from) leave(n);
  }

  function morph(rootEl, html) {
    tpl.innerHTML = html;
    morphChildren(rootEl, tpl.content);
  }

  /* ---- dialogs ---- */
  function closeDialog(d, after) {
    if (!d.open || d.classList.contains('closing')) return;
    const finish = () => {
      if (!d.classList.contains('closing')) return;
      d.classList.remove('closing');
      d.close();
      if (after) after();
    };
    if (reduced()) {
      d.classList.add('closing');
      return finish();
    }
    d.classList.add('closing');
    d.addEventListener('animationend', function done(e) {
      if (e.target !== d) return;
      d.removeEventListener('animationend', done);
      finish();
    });
    setTimeout(finish, 420); // safety net if animationend never fires
  }
  /* Escape (and the browser's close request) should animate too. */
  document.addEventListener(
    'cancel',
    e => {
      const d = e.target;
      if (d.nodeName === 'DIALOG' && !d.classList.contains('bigdlg')) {
        e.preventDefault();
        closeDialog(d);
      }
    },
    true
  );

  /* ---- text ---- */
  function swapText(el, text, apply) {
    if (!el) return;
    if (reduced()) {
      (
        apply ||
        (() => {
          el.textContent = text;
        })
      )();
      return;
    }
    el.classList.add('swap-out');
    setTimeout(() => {
      (
        apply ||
        (() => {
          el.textContent = text;
        })
      )();
      el.classList.remove('swap-out');
    }, 180);
  }

  /* ---- page transitions ----
     Runs `update` inside a View Transition when supported: the old page dissolves while the new one rises in.
     `dir` ('fwd' | 'back') flips the direction of the drift. Falls back to a plain update. */
  function transition(update, dir = 'fwd') {
    if (!document.startViewTransition || reduced()) return update();
    const html = document.documentElement;
    html.dataset.vt = dir;
    const t = document.startViewTransition(update);
    const done = () => {
      delete html.dataset.vt;
    };
    t.finished.then(done, done);
  }

  root.Dom = { morph, closeDialog, swapText, reduced, transition };
})(window);
