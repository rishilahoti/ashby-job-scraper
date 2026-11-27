// A job's location text -> the places it names, each with its state and country:
// "Whitefield, Bangalore, India" -> ["Bengaluru (India)", "Karnataka (India)", "India"].
// The feed's location filter matches these, so a job in any Indian city is in
// India's results. Labels have no commas: ?location= is a comma list.
//
// Every 1-5 word phrase is looked up in GeoNames (places-data.json.gz, built by
// scripts/build-places-data.js), longest first. The places in one string then
// vote on which namesake is meant ("London, ON" is in Canada), and words that
// agree with nothing are dropped as neighbourhood or shop names.
// ponytail: ~1 s and ~200 MB to load, ~10 µs a string; scraper only (the web
// app reads the stored labels).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'places-data.json.gz'))));

const key = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Workday URLs drop accented letters entirely: "München" arrives as "Mnchen".
const stripped = (s) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, ' ').trim();

const countries = new Map(data.countries.map(([iso2, , name]) => [iso2, name]));
const byIso3 = new Map(data.countries.map(([iso2, iso3]) => [iso3, iso2]));
const byCountryName = new Map(data.countries.map(([iso2, , name]) => [name, iso2]));
const COUNTRY_ALIASES = {
  US: ['usa', 'u s a', 'u s', 'united states of america', 'america', 'us'], GB: ['uk', 'u k', 'great britain', 'england', 'scotland', 'wales', 'britain'],
  DE: ['deutschland'], ES: ['espana'], IT: ['italia'], NL: ['nederland', 'the netherlands', 'holland'], CH: ['schweiz', 'suisse', 'svizzera'],
  AT: ['osterreich', 'oesterreich'], BR: ['brasil'], PL: ['polska'], SE: ['sverige'], NO: ['norge'], DK: ['danmark'], FI: ['suomi'],
  BE: ['belgique', 'belgie'], TR: ['turkey', 'turkiye'], CZ: ['czech republic', 'czechia', 'cesko'], KR: ['korea', 'south korea', 'republic of korea'],
  AE: ['uae', 'u a e'], SA: ['ksa'], MX: ['mexico'], VN: ['viet nam'], RU: ['russia', 'russian federation'], HK: ['hong kong sar'], TW: ['taiwan'], IN: ['bharat'],
  // ISO's formal names, which some boards print.
  SY: ['syrian arab republic'], IR: ['iran islamic republic of', 'islamic republic of iran'], TZ: ['united republic of tanzania', 'tanzania united republic of'],
  LA: ['lao people s democratic republic'], MD: ['republic of moldova', 'moldova republic of'], BO: ['bolivia plurinational state of'],
  VE: ['venezuela bolivarian republic of'],
};

// Phrase key -> candidate places.
const dict = new Map();
const add = (k, c) => {
  if (!k) return;
  let list = dict.get(k);
  if (!list) dict.set(k, (list = []));
  if (!list.some((x) => x.id === c.id && x.primary >= c.primary)) list.push(c);
};
for (const [iso, name] of countries) {
  const c = { type: 'country', id: 'C:' + iso, country: iso, pop: 1e9, primary: 1 };
  add(key(name), c);
  for (const alias of COUNTRY_ALIASES[iso] || []) add(alias, c);
}
const regions = new Map(); // "IN.19" -> "Karnataka"
const regionCand = (code) => ({ type: 'region', id: 'R:' + code, country: code.slice(0, 2), region: code, pop: 1e6, primary: 1 });
for (const [code, name, ascii] of data.regions) {
  regions.set(code, name.replace(/\s*\(.*\)\s*/g, ' ').trim());
  add(key(name), regionCand(code));
  add(key(ascii), regionCand(code));
}
// State codes ("CA", "ON", "KA") count only as uppercase words. GeoNames keys US
// states by their postal code; elsewhere its codes are numbers, so they're listed.
const REGION_CODES = new Map();
const addCode = (code, region) => REGION_CODES.set(code, [...(REGION_CODES.get(code) || []), region]);
for (const code of regions.keys()) if (/^US\.[A-Z]{2}$/.test(code)) addCode(code.slice(3), code);
for (const [cc, pairs] of Object.entries({
  CA: 'AB:01 BC:02 MB:03 NB:04 NL:05 NS:07 ON:08 PE:09 QC:10 SK:11',
  AU: 'ACT:01 NSW:02 NT:03 QLD:04 SA:05 TAS:06 VIC:07 WA:08',
  IN: 'DL:07 GJ:09 HR:10 KA:19 KL:13 MH:16 TN:25 TG:40 TS:40 UP:36 WB:28 RJ:24 PB:23',
  DE: 'BW:01 BY:02 HB:03 HH:04 HE:05 NI:06 NW:07 NRW:07 RP:08 SL:09 SH:10 BB:11 MV:12 SN:13 ST:14 TH:15 BE:16',
})) for (const pair of pairs.split(' ')) { const [code, n] = pair.split(':'); addCode(code, `${cc}.${n}`); }
// German state names as boards write them ("Beilngries, Bayern, Deutschland").
for (const [name, n] of Object.entries({ bayern: '02', hessen: '05', niedersachsen: '06', 'nordrhein westfalen': '07', 'rheinland pfalz': '08',
  sachsen: '13', 'sachsen anhalt': '14', thuringen: '15', thueringen: '15', 'baden wuerttemberg': '01' })) add(name, regionCand('DE.' + n));

data.cities.forEach(([name, ascii, cc, a1, pop, pplx, alts], i) => {
  // Towns under 15K and city sections (Culver City, Brooklyn Heights) only count
  // next to their own state ("Ocean City, MD"): alone, their names are too often
  // ordinary words or company sites.
  const small = pop < 15000 || pplx === 1;
  const c = { type: 'city', id: 'P:' + i, name, country: cc, region: `${cc}.${a1}`, pop, primary: 1, small };
  add(key(name), c);
  if (ascii) add(key(ascii), c);
  if (small) return;
  // A state named like its big city takes the city's spelling, so the two share
  // one label ("Zürich (Switzerland)", not also "Zurich (Switzerland)").
  if (pop >= 100000 && key(regions.get(c.region)) === key(name)) regions.set(c.region, name);
  if (stripped(name) !== key(ascii || name) && stripped(name).length >= 4) add(stripped(name), c);
  for (const alt of alts ? alts.split('|') : []) {
    add(key(alt), { ...c, primary: 0 });
    if (stripped(alt) !== key(alt) && stripped(alt).length >= 4) add(stripped(alt), { ...c, primary: 0 });
  }
});
for (const [alias, name, region] of [['nyc', 'New York City', 'US.NY'], ['bay area', 'San Francisco', 'US.CA'], ['sf bay area', 'San Francisco', 'US.CA']]) {
  const c = dict.get(key(name)).find((x) => x.type === 'city' && x.region === region && x.primary);
  add(alias, { ...c, alias: true });
}

// Words that are never a place on their own in a job location.
const STOP = new Set(['remote', 'hybrid', 'onsite', 'on site', 'office', 'home', 'based', 'field', 'virtual', 'nationwide', 'anywhere', 'worldwide',
  'global', 'flexible', 'multiple', 'locations', 'location', 'various', 'other', 'hq', 'headquarters', 'campus', 'area', 'region', 'metro', 'greater',
  'central', 'north', 'south', 'east', 'west', 'downtown', 'center', 'centre', 'work', 'from', 'or', 'and', 'the', 'of', 'in', 'any', 'time',
  'zone', 'europe', 'asia', 'africa', 'emea', 'apac', 'latam', 'americas', 'us remote', 'distributed', 'travel', 'site', 'store', 'branch', 'valley',
  'port', 'job', 'corporate', 'western', 'eastern', 'northern', 'southern', 'republic', 'democratic', 'people', 'peoples', 'islamic', 'federal',
  'united', 'kingdom', 'state', 'states', 'outlet', 'outlets', 'county', 'city', 'district', 'province', 'island', 'islands', 'coast', 'mount', 'lake',
  // Indian neighbourhood words: "JP Nagar", "HSR Layout", "Sector 62".
  'nagar', 'layout', 'sector', 'phase', 'colony', 'block']);
// A segment naming a building, shop or street: places in it are weak evidence
// ("Ottawa - Tanger Outlets", "Market At Town Center, Houston").
const ADDRESS = /\b(outlets?|market|house|mall|plaza|hospital|medical|clinic|store|shop|warehouse|street|st|road|rd|avenue|ave|blvd|boulevard|suite|floor|building|bldg|tower|drive|highway|parkway|square|centre|center|barracks|airport|station|bahnhof|university|college|school)\b/i;

const MAX_WORDS = 5;
const isCode = (w) => /^[A-Z]{2,3}$/.test(w);
const countryCand = (cc) => dict.get(key(countries.get(cc))).find((c) => c.type === 'country');

// Finds every phrase that names a place, longest first within each segment.
function findMatches(segments) {
  const matches = []; // { n, cands, code, weak, seg, full }
  for (const seg of segments) {
    const words = seg.split(/[\s\-_.]+/).filter(Boolean);
    const keys = words.map(key);
    const weak = ADDRESS.test(seg);
    let i = 0;
    while (i < words.length) {
      let hit = null;
      for (let n = Math.min(MAX_WORDS, words.length - i); n >= 1 && !hit; n--) {
        const k = keys.slice(i, i + n).join(' ');
        if (!k) continue;
        const text = words.slice(i, i + n).join(' ');
        if (STOP.has(k) && !(n === 1 && isCode(text))) continue;
        if (n === 1 && k.length <= 3) {
          if (text !== text.toUpperCase() || !/[A-Z]/.test(text)) {
            // Lowercase short words are never codes ("in"), and a short name
            // counts only as a whole segment ("Goa", "Rye").
            if (words.length === 1 && k.length === 3 && dict.has(k)) hit = { n, cands: dict.get(k), weak, seg };
            continue;
          }
          // Codes: "IN", "IND", "CA", plus "NYC", "UK", "UAE".
          const code = text.replace(/[^A-Z]/g, '');
          const cands = [];
          if (code.length === 2 && countries.has(code)) cands.push(countryCand(code));
          if (code.length === 3 && byIso3.has(code)) cands.push(countryCand(byIso3.get(code)));
          for (const r of REGION_CODES.get(code) || []) if (regions.has(r)) cands.push(regionCand(r));
          for (const c of dict.get(k) || []) if ((c.alias || c.type === 'country') && !cands.some((x) => x.id === c.id)) cands.push(c);
          if (cands.length) hit = { n, cands, code: true, weak, seg };
          continue;
        }
        if (dict.has(k)) hit = { n, cands: dict.get(k), weak, seg };
      }
      if (hit) { matches.push(hit); i += hit.n; } else i += 1;
    }
    // The place is all the segment says ("Radlett", not "Anne Arundel County").
    const segHits = matches.filter((m) => m.seg === seg);
    if (segHits.length === 1) segHits[0].full = keys.filter((k) => !STOP.has(k)).length === segHits[0].n;
  }
  return matches;
}

// hint: the ISO code of the country most of the board's jobs are in. It settles
// strings with nothing else to go on ("Radlett" at a UK company, "Remote - CA"
// at a US one).
function parsePlaces(raw, hint = null) {
  // Separators that never sit inside a place name. Not "and": Trinidad and Tobago.
  const segments = String(raw || '').split(/[,;/|()[\]•·:+]+|\s+[-–—]\s+|\s+or\s+|\n/i).map((s) => s.trim()).filter(Boolean);
  // "GB / IE / CA / US" is a list of countries, not CA = California.
  const listed = segments.filter((s) => !STOP.has(key(s)));
  if (listed.length >= 2 && listed.every(isCode)) {
    const out = [];
    for (const code of listed) {
      const cc = code.length === 2 ? (code === 'UK' ? 'GB' : code) : byIso3.get(code);
      if (countries.has(cc) && !out.includes(countries.get(cc))) out.push(countries.get(cc));
    }
    return out;
  }

  const matches = findMatches(segments);
  // Small towns stay only next to their state, or next to their country when it
  // has one town by that name ("Weilheim an der Teck, DE"), or alone at a board
  // in their country.
  const bigRegions = matches.map((m) => new Set(m.cands.filter((c) => !c.small).map((c) => c.region).filter(Boolean)));
  const countriesNamed = matches.map((m) => new Set(m.cands.filter((c) => c.type === 'country').map((c) => c.country)));
  for (const [i, m] of matches.entries()) {
    const onlySmall = m.cands.every((c) => c.small);
    m.cands = m.cands.filter((c) => !c.small ||
      bigRegions.some((set, j) => j !== i && set.has(c.region)) ||
      (m.full && countriesNamed.some((set, j) => j !== i && set.has(c.country)) && m.cands.filter((x) => x.small && x.country === c.country).length === 1) ||
      (onlySmall && matches.length === 1 && m.full && c.country === hint));
  }
  const live = matches.filter((m) => m.cands.length);
  if (!live.length) return [];

  // A country spelled out ("India", "Deutschland") is firm context. Otherwise the
  // places in one string vote: a candidate gains for every other match with a
  // candidate in its country or state (London + Ontario -> Canada).
  const spelled = new Set();
  for (const m of live) if (!m.code && m.cands.length === 1 && m.cands[0].type === 'country') spelled.add(m.cands[0].country);
  const countriesOf = live.map((m) => new Set(m.cands.map((c) => c.country)));
  const regionsOf = live.map((m) => new Set(m.cands.map((c) => c.region).filter(Boolean)));
  const score = (c, i) => {
    let s = Math.log10(c.pop + 1);
    if (spelled.has(c.country)) s += 20;
    if (c.country === hint) s += 5;
    countriesOf.forEach((set, j) => { if (j !== i && set.has(c.country)) s += 8; });
    regionsOf.forEach((set, j) => { if (j !== i && c.region && set.has(c.region)) s += 4; });
    if (c.primary) s += 3;
    // A city of 300K+ beats a state of its name ("New York"; "Ontario" is the
    // province), unless another city in the string is in that state
    // ("Brooklyn, New York", "Sorocaba, São Paulo").
    const cityNearby = live.some((m, j) => j !== i && m.cands.some((x) => x.type === 'city' && x.region === c.region));
    if (c.type === 'city' && c.pop >= 300000 && !cityNearby) s += 3;
    if (c.type === 'region' && cityNearby) s += 3;
    return s;
  };
  const chosen = live.map((m, i) => {
    const ranked = [...m.cands].sort((a, b) => score(b, i) - score(a, i));
    // A bare code nothing backs up stays unread: "MD" is Moldova or Maryland.
    const backed = (c) => c.country === hint || countriesOf.some((set, j) => j !== i && set.has(c.country));
    if (m.code && ranked.length > 1 && !ranked.slice(0, 2).some(backed)) return null;
    return ranked[0];
  });
  // The state or country right after a city is that city's: "Venice, CA" is not
  // Venice, Florida, and "Gilbert, India" is not Gilbert, Arizona.
  chosen.forEach((c, i) => {
    const next = chosen[i + 1];
    if (c?.type !== 'city' || !next) return;
    if (next.type === 'region' && next.country === c.country && next.region !== c.region) chosen[i] = null;
    if (next.type === 'country' && next.country !== c.country) chosen[i] = null;
  });
  // A place that agrees with nothing while the rest agree is a neighbourhood or
  // noise ("Whitefield, Bangalore, India"): dropped, unless it is a country
  // spelled out or a big city (a real second location). A lone code always goes.
  const support = chosen.map((c, i) => (c ? chosen.filter((o, j) => j !== i && o && o.country === c.country).length : 0));
  const anyAgree = Math.max(...support) >= 1;
  chosen.forEach((c, i) => {
    if (!c || support[i] > 0 || !chosen.some((o, j) => j !== i && o)) return;
    if (live[i].code) chosen[i] = null;
    else if (anyAgree && !(c.type === 'country' || (c.type === 'city' && c.pop >= 200000))) chosen[i] = null;
  });
  // A place inside a shop or street name needs a neighbour in its own state.
  chosen.forEach((c, i) => {
    if (c && live[i].weak && chosen.some((o, j) => j !== i && o) &&
      !chosen.some((o, j) => j !== i && o && o.region === c.region)) chosen[i] = null;
  });
  // At a board in one country, a town elsewhere needs its own evidence: GeoNames
  // has no English counties, so "Burton, Staffordshire" and "Romford, Essex" at a
  // UK company found Burton, Michigan and Essex, Maryland. Cities of 100K+ stay (a UK
  // company's New York job).
  if (hint) {
    chosen.forEach((c, i) => {
      if (c?.type !== 'city' || c.country === hint || c.pop >= 100000 || spelled.has(c.country)) return;
      if (!chosen.some((o, j) => j !== i && o && o.country === c.country)) chosen[i] = null;
    });
  }

  const out = [];
  const push = (label) => { if (!out.includes(label)) out.push(label); };
  for (const c of chosen) {
    if (!c) continue;
    const country = countries.get(c.country);
    if (c.type === 'city' && c.name !== country) push(`${c.name} (${country})`);
    const region = regions.get(c.region);
    if (c.type !== 'country' && region && region !== country) push(`${region} (${country})`);
    push(country);
  }
  return out;
}

// The country 60%+ of a board's placed jobs name, as an ISO code.
function boardCountry(placeLists) {
  const counts = new Map();
  let placed = 0;
  for (const list of placeLists) {
    if (!list.length) continue;
    placed++;
    for (const label of list) if (byCountryName.has(label)) counts.set(label, (counts.get(label) || 0) + 1);
  }
  const [name, n] = [...counts].sort((a, b) => b[1] - a[1])[0] || [];
  return name && n >= 0.6 * placed ? byCountryName.get(name) : null;
}

// Sets job.places on one board's jobs, from job.locationRaw.
function tagPlaces(jobs) {
  const first = jobs.map((job) => parsePlaces(job.locationRaw));
  const hint = boardCountry(first);
  jobs.forEach((job, i) => { job.places = hint ? parsePlaces(job.locationRaw, hint) : first[i]; });
}

module.exports = { parsePlaces, boardCountry, tagPlaces };
