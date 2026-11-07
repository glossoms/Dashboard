if (typeof window !== 'undefined') (window.GLOOM_FILES = window.GLOOM_FILES || {})['roblox.js'] = '9';
/* Roblox data (avatars + experience stats).

   Roblox's public APIs don't send CORS headers, so a read-only relay is used from the browser.
   Design goals: never hammer the relay, never spam the console.
   - Avatar URLs are cached in localStorage (6h) so most page loads make zero requests.
   - Requests are batched (up to 100 users per call), one batch in flight at a time.
   - A circuit breaker pauses all automatic requests for a while after a failure, instead of retrying per avatar.
   - "Pending" thumbnails (Roblox still rendering them) are re-checked a couple of times, gently. */
(function (root) {
  const RELAY = 'https://proxy.cors.dev/';
  const CACHE_KEY = 'gloom.rbx.v1',
    DOWN_KEY = 'gloom.rbx.down';
  const TTL_OK = 6 * 36e5,
    TTL_NONE = 36e5,
    TIMEOUT = 9000,
    BATCH = 100,
    PENDING_TRIES = 3;

  const read = (k, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(k)) || fallback;
    } catch (e) {
      return fallback;
    }
  };
  const write = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      /* storage unavailable */
    }
  };

  let cache = read(CACHE_KEY, {}); // id -> { url|null, ts }
  let saveT = null;
  const saveCache = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => write(CACHE_KEY, cache), 400);
  };

  /* ---- circuit breaker ---- */
  let fails = 0,
    downUntil = read(DOWN_KEY, 0);
  const isDown = () => Date.now() < downUntil;
  function trip() {
    fails++;
    downUntil = Date.now() + Math.min(10 * 60e3, 30e3 * 2 ** (fails - 1)); // 30s, 1m, 2m … capped at 10m
    write(DOWN_KEY, downUntil);
  }
  const healthy = () => {
    fails = 0;
    downUntil = 0;
    try {
      localStorage.removeItem(DOWN_KEY);
    } catch (e) {
      /* ignore */
    }
  };

  async function relay(url, ms = TIMEOUT) {
    const ctl = new AbortController(),
      t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(RELAY + url, { signal: ctl.signal, cache: 'no-store', credentials: 'omit' });
      if (!r.ok) throw new Error('Roblox returned ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  /* ---- avatars ---- */
  const waiting = new Map(); // id -> { promise, resolve, tries }
  const queue = new Set();
  let flushT = null,
    inFlight = false;

  /** Fresh cached URL, `null` if known to have none, `undefined` if unknown. Never makes a request. */
  function cached(id) {
    const e = cache[id];
    if (!e) return undefined;
    if (Date.now() - e.ts > (e.url ? TTL_OK : TTL_NONE)) return undefined;
    return e.url;
  }
  function invalidate(id) {
    delete cache[id];
    saveCache();
  }

  function settle(id, url) {
    const w = waiting.get(id);
    if (url !== undefined) {
      cache[id] = { url, ts: Date.now() };
      saveCache();
    }
    if (w) {
      w.resolve(url || null);
      waiting.delete(id);
    }
  }

  function thumbnail(id) {
    const hit = cached(id);
    if (hit !== undefined) return Promise.resolve(hit);
    if (waiting.has(id)) return waiting.get(id).promise;
    if (isDown()) return Promise.resolve(null);
    let resolve;
    const promise = new Promise(r => {
      resolve = r;
    });
    waiting.set(id, { promise, resolve, tries: 0 });
    queue.add(id);
    schedule(40);
    return promise;
  }

  function schedule(ms) {
    if (!flushT) flushT = setTimeout(flush, ms);
  }

  async function flush() {
    flushT = null;
    if (inFlight) return schedule(300);
    const ids = [...queue].slice(0, BATCH);
    ids.forEach(id => queue.delete(id));
    if (!ids.length) return;
    inFlight = true;
    try {
      const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(ids.join(','))}&size=150x150&format=Png&isCircular=false`;
      const json = await relay(url);
      healthy();
      const byId = new Map((json.data || []).map(x => [String(x.targetId), x]));
      ids.forEach(id => {
        const x = byId.get(String(id)),
          w = waiting.get(id);
        if (x && x.state === 'Completed' && x.imageUrl) settle(id, x.imageUrl);
        else if (x && x.state === 'Pending' && w && w.tries < PENDING_TRIES) {
          w.tries++;
          setTimeout(
            () => {
              if (waiting.has(id)) {
                queue.add(id);
                schedule(40);
              }
            },
            1500 * 2 ** (w.tries - 1)
          );
        } else settle(id, null);
      });
    } catch (e) {
      trip(); // one failure pauses everything; no per-avatar retry storm
      ids.forEach(id => settle(id, undefined)); // resolve null, but don't cache a transient failure
    } finally {
      inFlight = false;
      if (queue.size && !isDown()) schedule(60);
    }
  }

  /* ---- experiences (user-triggered, so not gated by the breaker) ---- */
  function parseExperience(input) {
    const value = String(input || '').trim();
    if (/^\d+$/.test(value)) return { placeId: value, universeId: null };
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value);
    } catch (e) {
      return null;
    }
    if (!/(^|\.)roblox\.com$/i.test(url.hostname)) return null;
    const placeId = (url.pathname.match(/\/games\/(\d+)/i) || [])[1] || url.searchParams.get('placeId');
    const universeId = (url.pathname.match(/\/experiences\/(\d+)/i) || [])[1] || url.searchParams.get('universeId');
    return placeId || universeId ? { placeId, universeId } : null;
  }

  async function experience(ref) {
    let universeId = ref.universeId;
    if (!universeId) {
      const resolved = await relay(
        'https://apis.roblox.com/universes/v1/places/' + encodeURIComponent(ref.placeId) + '/universe',
        12000
      );
      universeId = resolved.universeId;
    }
    if (!universeId) throw new Error('Could not find that Roblox experience.');
    const result = await relay(
      'https://games.roblox.com/v1/games?universeIds=' + encodeURIComponent(universeId),
      12000
    );
    const game = result && result.data && result.data[0];
    if (!game || !game.id || game.isContentRestricted)
      throw new Error('That experience has no public stats available.');
    return {
      placeId: String(game.rootPlaceId || ref.placeId || ''),
      universeId: String(game.id),
      name: game.name || 'Roblox experience',
      visits: Number(game.visits) || 0,
      playing: Number(game.playing) || 0,
      updatedAt: Date.now()
    };
  }

  /** Runs `worker` over `items` with at most `limit` in flight; resolves to settled results in order. */
  async function pool(items, worker, limit = 3) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(
      Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) {
          const n = i++;
          try {
            out[n] = { status: 'fulfilled', value: await worker(items[n]) };
          } catch (reason) {
            out[n] = { status: 'rejected', reason };
          }
        }
      })
    );
    return out;
  }

  root.Roblox = { cached, thumbnail, invalidate, parseExperience, experience, pool, isDown };
})(window);
