if (typeof window !== 'undefined') (window.GLOOM_FILES = window.GLOOM_FILES || {})['quotes.js'] = '12';
/* Short, curated lines used for the daily quote and the morning intro. */
(function (root) {
  const LINES = [
    ['Begin again.', 'Unknown'],
    ['Make it count.', 'Unknown'],
    ['Small steps. Every day.', 'Unknown'],
    ['Do the next right thing.', 'Unknown'],
    ['Start where you are.', 'Arthur Ashe'],
    ['Action is the antidote to despair.', 'Joan Baez'],
    ['Well begun is half done.', 'Aristotle'],
    ['Fortune favors the bold.', 'Virgil'],
    ['Nothing will work unless you do.', 'Maya Angelou'],
    ['Great things are done by a series of small things brought together.', 'Vincent van Gogh'],
    ['The secret of getting ahead is getting started.', 'Mark Twain'],
    ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
    ['You do not have to see the whole staircase. Just take the first step.', 'Martin Luther King Jr.'],
    ['It always seems impossible until it is done.', 'Nelson Mandela'],
    ['The beginning is the most important part of the work.', 'Plato'],
    ['Well done is better than well said.', 'Benjamin Franklin'],
    ['Dream big. Start small. Act now.', 'Robin Sharma'],
    ['Great acts are made up of small deeds.', 'Lao Tzu'],
    ['Amateurs wait for inspiration. The rest of us just get up and go to work.', 'Chuck Close'],
    ['Do what you can, with what you have, where you are.', 'Theodore Roosevelt'],
    ['Discipline is choosing what you want most over what you want now.', 'Unknown'],
    ['One day or day one. You decide.', 'Unknown'],
    ['You are allowed to be a beginner.', 'Unknown'],
    ['Progress, not perfection.', 'Unknown'],
    ['Nothing changes if nothing changes.', 'Unknown'],
    ['Focus on the step in front of you, not the whole staircase.', 'Unknown'],
    ['Work in silence. Let progress make the noise.', 'Unknown'],
    ['You have made it through every hard day so far.', 'Unknown'],
    ['The future depends on what you do today.', 'Mahatma Gandhi'],
    ['Be where your feet are.', 'Unknown']
  ];
  const hash = s => {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  };
  const asQuote = entry => ({ text: entry[0], author: entry[1], source: 'curated' });
  function get(seed) {
    return Promise.resolve(asQuote(LINES[hash(seed) % LINES.length]));
  }
  function next(seed, current) {
    const currentText = typeof current === 'string' ? current : current && current.text;
    let i = hash(seed + ':' + Date.now()) % LINES.length;
    if (LINES[i][0] === currentText) i = (i + 1) % LINES.length;
    return Promise.resolve(asQuote(LINES[i]));
  }
  root.Quotes = { get, next, local: seed => asQuote(LINES[hash(seed) % LINES.length]) };
})(window);
