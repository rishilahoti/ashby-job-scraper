// Builds src/normalize/places-data.json.gz, the gazetteer src/normalize/places.js
// reads, from GeoNames (https://www.geonames.org, CC BY 4.0). Rerun it to refresh:
//
//   curl -O https://download.geonames.org/export/dump/cities1000.zip && unzip cities1000.zip
//   curl -O https://download.geonames.org/export/dump/admin1CodesASCII.txt
//   curl -O https://download.geonames.org/export/dump/countryInfo.txt
//   node scripts/build-places-data.js <folder with those three .txt files>
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/build-places-data.js <geonames folder>');
const lines = (file) => fs.readFileSync(path.join(dir, file), 'utf8').split('\n').filter((l) => l && l[0] !== '#').map((l) => l.split('\t'));

const key = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const LATIN = /^[\p{Script=Latin}\s.'’\-()0-9]+$/u;

const countries = lines('countryInfo.txt').map((f) => [f[0], f[1], f[4]]);
const regions = lines('admin1CodesASCII.txt').filter((f) => f.length >= 3).map((f) => [f[0], f[1], f[2]]);
const cities = [];
for (const f of lines('cities1000.txt')) {
  if (f.length < 15) continue;
  const [, name, ascii, alts, , , , fcode, cc, , a1] = f;
  const pop = +f[14];
  const pplx = fcode === 'PPLX' ? 1 : 0;
  // Other-language names, only for towns places.js reads on their own (15K+, not
  // a city section). Short, non-Latin or all-caps ones are airport codes and
  // transliterations. Ones that are English words ("Luck" for Lutsk, "Market"
  // for Marquette) only for big cities or when they start like the real name.
  const keep = pop < 15000 || pplx ? [] : [...new Set(alts.split(','))].filter((alt) => {
    const k = key(alt);
    return k.length >= 4 && LATIN.test(alt) && alt !== alt.toUpperCase() && k !== key(ascii) && k !== key(name) &&
      (pop >= 400000 || k.slice(0, 4) === key(ascii).slice(0, 4));
  });
  cities.push([name, ascii === name ? '' : ascii, cc, a1, pop, pplx, keep.join('|')]);
}

const out = path.join(__dirname, '..', 'src', 'normalize', 'places-data.json.gz');
const data = { source: `GeoNames (geonames.org, CC BY 4.0), built ${new Date().toISOString().slice(0, 10)}`, countries, regions, cities };
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify(data), { level: 9 }));
console.log(`${countries.length} countries, ${regions.length} regions, ${cities.length} cities -> ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
