// Cities whose pre-rename English name still dominates real job postings even
// though cities.json only carries the current official name — the fuzzy
// matcher in shared.js can't catch these (edit distance 3-4, well past its typo
// threshold of 2), and correcting a genuine rename isn't a typo fix anyway.
// Not every renamed city needs an entry: Mumbai, Chennai, Kolkata, Beijing,
// Ho Chi Minh City, Yangon, Pune, and Gurugram's colonial/pre-rename names
// (Bombay, Madras, Calcutta, Peking, Saigon, Rangoon, Poona) have fallen out
// of professional use, so job postings already say the modern name and match
// cities.json directly. Add an entry here only once a specific old name is
// confirmed to still show up in real listings — verified against cities.json
// (`node -e "require('cities.json').some(c=>c.name==='X')"`) before adding.
// Its own file so the web app's location search can use it too (shared.js
// pulls in all of cities.json).
const CITY_ALTERNATE_NAMES = new Map([
  ['bangalore', 'Bengaluru'],
  ['bengaluru', 'Bengaluru'],
  ['bengauru', 'Bengaluru'],
  ['gurgaon', 'Gurugram'],
  ['gurugram', 'Gurugram'],
]);

module.exports = { CITY_ALTERNATE_NAMES };
