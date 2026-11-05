/* Quote of the day. Pulls a few random quotes from the open-source DummyJSON API, scores them for
   "depth" (length + reflective keywords) and keeps the best. Falls back to a curated list offline. */
(function (root) {
  const LOCAL = [
    ['The impediment to action advances action. What stands in the way becomes the way.', 'Marcus Aurelius'],
    ['It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca'],
    ['Begin at once to live, and count each separate day as a separate life.', 'Seneca'],
    ['Waste no more time arguing what a good man should be. Be one.', 'Marcus Aurelius'],
    ['He who has a why to live can bear almost any how.', 'Friedrich Nietzsche'],
    ['The unexamined life is not worth living.', 'Socrates'],
    ['I learned that courage was not the absence of fear, but the triumph over it.', 'Nelson Mandela'],
    ['The only way to do great work is to love what you do.', 'Steve Jobs'],
    ['The best way out is always through.', 'Robert Frost'],
    ['To live is the rarest thing in the world. Most people exist, that is all.', 'Oscar Wilde'],
    ['Not all those who wander are lost.', 'J.R.R. Tolkien'],
    ['Well begun is half done.', 'Aristotle'],
    ['A journey of a thousand miles begins with a single step.', 'Lao Tzu'],
    ['A smooth sea never made a skilled sailor.', 'Proverb']
  ];
  const DEEP = /\b(life|time|mind|soul|truth|meaning|courage|fear|death|freedom|wisdom|purpose|silence|patience|habit|dream|become|nothing|everything|journey|moment)\b/i;
  const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  const score = q => (DEEP.test(q.text) ? 3 : 0) + Math.min(q.text.length, 160) / 40 - (q.text.length > 220 ? 10 : 0);
  const local = seed => { const [text, author] = LOCAL[hash(seed) % LOCAL.length]; return { text, author, source: 'local' }; };

  async function one(timeout) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
    try {
      const j = await (await fetch('https://dummyjson.com/quotes/random', { signal: ctl.signal })).json();
      return j && j.quote ? { text: j.quote, author: j.author || 'Unknown', source: 'dummyjson' } : null;
    } catch (e) { return null; } finally { clearTimeout(t); }
  }
  /** Resolves to the deepest of a few random quotes, or a curated local one. Never rejects. */
  async function get(seed, timeout = 2800) {
    const got = (await Promise.all([one(timeout), one(timeout), one(timeout)])).filter(Boolean);
    return got.length ? got.sort((a, b) => score(b) - score(a))[0] : local(seed + Math.random());
  }
  root.Quotes = { get, local, score };
})(window);
