const sanitizeHtml = require('sanitize-html');
const cities = require('cities.json');

function sanitizeDescription(html) {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

// Greenhouse's `content` field comes back HTML-entity-encoded (e.g. "&lt;div&gt;"
// instead of "<div>") — decode once before sanitizing or the tags never get stripped.
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Normalizes ATS-specific pay period strings (Ashby: "1 YEAR", Lever:
// "per-hour-salary") down to schema.org JobPosting baseSalary unitText values.
function normalizeSalaryInterval(raw) {
  if (!raw) return null;
  const s = raw.toUpperCase();
  if (s.includes('HOUR')) return 'HOUR';
  if (s.includes('DAY')) return 'DAY';
  if (s.includes('WEEK')) return 'WEEK';
  if (s.includes('MONTH')) return 'MONTH';
  if (s.includes('YEAR')) return 'YEAR';
  return null;
}

// ATS fields are free text on their end — reject anything but http(s) so a
// malicious `javascript:` URL never reaches a rendered <a href>.
function sanitizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

const COUNTRY_ALIASES = new Map([
  ['us', 'United States'],
  ['usa', 'United States'],
  ['u.s.', 'United States'],
  ['u.s.a.', 'United States'],
  ['uk', 'United Kingdom'],
  ['gb', 'United Kingdom'],
  ['great britain', 'United Kingdom'],
  ['uae', 'United Arab Emirates'],
  ['ae', 'United Arab Emirates'],
  ['ca', 'Canada'],
  ['au', 'Australia'],
  ['at', 'Austria'],
  ['be', 'Belgium'],
  ['br', 'Brazil'],
  ['ch', 'Switzerland'],
  ['cn', 'China'],
  ['cz', 'Czechia'],
  ['de', 'Germany'],
  ['dk', 'Denmark'],
  ['es', 'Spain'],
  ['fi', 'Finland'],
  ['fr', 'France'],
  ['gr', 'Greece'],
  ['ie', 'Ireland'],
  ['il', 'Israel'],
  ['in', 'India'],
  ['it', 'Italy'],
  ['jp', 'Japan'],
  ['kr', 'South Korea'],
  ['mx', 'Mexico'],
  ['nl', 'Netherlands'],
  ['no', 'Norway'],
  ['nz', 'New Zealand'],
  ['pl', 'Poland'],
  ['pt', 'Portugal'],
  ['ro', 'Romania'],
  ['se', 'Sweden'],
  ['sg', 'Singapore'],
  ['tr', 'Türkiye'],
  ['za', 'South Africa'],
]);

const COUNTRY_CODES = new Map([
  ['United States', 'US'],
  ['United Kingdom', 'GB'],
  ['United Arab Emirates', 'AE'],
  ['Canada', 'CA'],
  ['Australia', 'AU'],
  ['Austria', 'AT'],
  ['Belgium', 'BE'],
  ['Brazil', 'BR'],
  ['Switzerland', 'CH'],
  ['China', 'CN'],
  ['Czechia', 'CZ'],
  ['Germany', 'DE'],
  ['Denmark', 'DK'],
  ['Spain', 'ES'],
  ['Finland', 'FI'],
  ['France', 'FR'],
  ['Greece', 'GR'],
  ['Ireland', 'IE'],
  ['Israel', 'IL'],
  ['India', 'IN'],
  ['Italy', 'IT'],
  ['Japan', 'JP'],
  ['South Korea', 'KR'],
  ['Mexico', 'MX'],
  ['Netherlands', 'NL'],
  ['Norway', 'NO'],
  ['New Zealand', 'NZ'],
  ['Poland', 'PL'],
  ['Portugal', 'PT'],
  ['Romania', 'RO'],
  ['Sweden', 'SE'],
  ['Singapore', 'SG'],
  ['Türkiye', 'TR'],
  ['South Africa', 'ZA'],
]);

function locationKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const citiesByCountryAndKey = new Map();
const citiesByCountry = new Map();
// Cities whose pre-rename English name still dominates real job postings even
// though cities.json only carries the current official name — the fuzzy
// matcher below can't catch these (edit distance 3-4, well past its typo
// threshold of 2), and correcting a genuine rename isn't a typo fix anyway.
// Not every renamed city needs an entry: Mumbai, Chennai, Kolkata, Beijing,
// Ho Chi Minh City, Yangon, Pune, and Gurugram's colonial/pre-rename names
// (Bombay, Madras, Calcutta, Peking, Saigon, Rangoon, Poona) have fallen out
// of professional use, so job postings already say the modern name and match
// cities.json directly. Add an entry here only once a specific old name is
// confirmed to still show up in real listings — verified against cities.json
// (`node -e "require('cities.json').some(c=>c.name==='X')"`) before adding.
const CITY_ALTERNATE_NAMES = new Map([
  ['bangalore', 'Bengaluru'],
  ['bengaluru', 'Bengaluru'],
  ['bengauru', 'Bengaluru'],
  ['gurgaon', 'Gurugram'],
  ['gurugram', 'Gurugram'],
]);
for (const city of cities) {
  const key = locationKey(city.name);
  if (!key) continue;
  const countryKey = city.country.toUpperCase();
  const exactKey = `${countryKey}:${key}`;
  if (!citiesByCountryAndKey.has(exactKey)) citiesByCountryAndKey.set(exactKey, city.name);
  if (!citiesByCountry.has(countryKey)) citiesByCountry.set(countryKey, []);
  citiesByCountry.get(countryKey).push({ key, name: city.name });
}

function cleanLocationText(value) {
  return String(value || '')
    .replace(/\([^)]*\bremote\b[^)]*\)/gi, ' ')
    .replace(/\b(remote|hybrid|work from home|work-from-home|wfh)\b/gi, ' ')
    .replace(/\s*[/|]\s*/g, ', ')
    .replace(/\s*-\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^(,\s*)+|(,\s*)+$/g, '')
    .trim();
}

function canonicalCountry(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  const knownCountry = [...COUNTRY_ALIASES.values()].find(
    country => country.toLowerCase() === normalized
  );
  return COUNTRY_ALIASES.get(normalized) || knownCountry ||
    normalized.replace(/\b\w/g, c => c.toUpperCase());
}

function isKnownCountry(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\.$/, '');
  return COUNTRY_ALIASES.has(normalized) ||
    [...COUNTRY_ALIASES.values()].some(country => country.toLowerCase() === normalized);
}

function canonicalCity(value) {
  const cleaned = String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\b(office|urban|city|area|region|hq|headquarters|campus|site)\b/gi, ' ')
    .replace(/\s*[,;:]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .map(word => {
      if (!word) return word;
      if (word.length > 1 && word === word.toUpperCase()) return word;
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function editDistanceWithin(left, right, limit) {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMinimum = current[0];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
      rowMinimum = Math.min(rowMinimum, current[j]);
    }
    if (rowMinimum > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length];
}

function resolveCity(value, countryPart) {
  const city = canonicalCity(value);
  const key = locationKey(city);
  if (!key) return '';
  const alternate = CITY_ALTERNATE_NAMES.get(key);
  if (alternate) return alternate;
  const country = countryPart ? COUNTRY_CODES.get(canonicalCountry(countryPart)) : null;
  if (!country) return city;

  const exact = citiesByCountryAndKey.get(`${country}:${key}`);
  if (exact) return locationKey(exact) === key ? city : exact;

  const candidates = citiesByCountry.get(country) || [];
  if (key.length < 5 || candidates.length === 0) return city;
  let best = null;
  for (const candidate of candidates) {
    // Fuzzy matching multi-word names is too permissive: common prefixes such
    // as "New" can make unrelated cities look like typo corrections.
    if (key.includes(' ') || candidate.key.includes(' ')) continue;
    if (candidate.key[0] !== key[0]) continue;
    const distance = editDistanceWithin(key, candidate.key, 2);
    if (distance > 2) continue;
    if (distance / Math.max(key.length, candidate.key.length) > 0.25) continue;
    if (!best || distance < best.distance || (distance === best.distance && candidate.name.length < best.name.length)) {
      best = { distance, name: candidate.name };
    }
  }
  return best ? best.name : city;
}

function normalizeLocation(rawLocation, remoteHint = false) {
  const raw = String(rawLocation || '').trim();
  if (!raw) return { location: 'Unknown', remote: Boolean(remoteHint) };

  const remote = Boolean(remoteHint) || /\b(remote|hybrid|work from home|work-from-home|wfh)\b/i.test(raw);
  const cleaned = cleanLocationText(raw);
  if (!cleaned) return { location: 'Unknown', remote };

  const parts = cleaned.split(',').map(part => part.trim()).filter(Boolean);
  const countryPart = parts.find(part => {
    return isKnownCountry(part);
  }) || [...parts].reverse().find(part => /^[A-Za-z]{2,3}$/.test(part));
  if (parts.length === 1 && isKnownCountry(parts[0])) {
    return { location: canonicalCountry(parts[0]), remote };
  }

  const countryIndex = countryPart ? parts.indexOf(countryPart) : -1;
  const cityCandidates = countryIndex > 0
    ? parts.slice(0, countryIndex)
    : countryIndex === 0
      ? parts.slice(1)
      : parts;
  const cityPart = cityCandidates.find(part => !/^[A-Za-z]{2,3}$/.test(part)) ||
    cityCandidates[0];

  return {
    location: resolveCity(cityPart || countryPart || cleaned, countryPart),
    remote,
  };
}

module.exports = {
  sanitizeDescription,
  decodeHtmlEntities,
  normalizeSalaryInterval,
  sanitizeUrl,
  normalizeLocation,
};
