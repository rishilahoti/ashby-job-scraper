const test = require('node:test');
const assert = require('node:assert/strict');

const { parsePlaces, boardCountry, tagPlaces } = require('../src/normalize/places');

// [raw location, places it must name, places it must not]
const CASES = [
  ['Bangalore', ['Bengaluru (India)', 'Karnataka (India)', 'India']],
  ['Whitefield, Bangalore, India', ['Bengaluru (India)', 'India']],
  ['JP Nagar, Bengaluru', ['Bengaluru (India)'], ['Nagar (India)']],
  ['IN-KA-Bangalore', ['Bengaluru (India)', 'Karnataka (India)']],
  ['Gurgaon', ['Gurugram (India)', 'Haryana (India)']],
  ['Bombay', ['Mumbai (India)']],
  ['München', ['Munich (Germany)', 'Bavaria (Germany)']],
  ['Mnchen', ['Munich (Germany)']], // Workday URL slug
  ['Beilngries, Bayern, Deutschland', ['Bavaria (Germany)', 'Germany']],
  ['Den Haag', ['The Hague (The Netherlands)']],
  ['NYC', ['New York City (United States)', 'New York (United States)']],
  ['Bay Area', ['San Francisco (United States)']],
  ['London, ON', ['London (Canada)', 'Ontario (Canada)'], ['London (United Kingdom)']],
  ['Cambridge, MA', ['Cambridge (United States)', 'Massachusetts (United States)']],
  ['Perth WA', ['Perth (Australia)', 'Western Australia (Australia)']],
  ['Seattle WA', ['Seattle (United States)', 'Washington (United States)']],
  ['Chennai TN', ['Chennai (India)', 'Tamil Nadu (India)']],
  ['Nashville TN', ['Nashville (United States)', 'Tennessee (United States)']],
  ['Ocean City, MD', ['Ocean City (United States)', 'Maryland (United States)']],
  ['Mission, KS', ['Mission (United States)', 'Kansas (United States)'], ['Texas (United States)']],
  ['Culver City, CA', ['Culver City (United States)', 'California (United States)']],
  ['Venice, CA', ['California (United States)'], ['Florida (United States)']],
  ['Gilbert, India', ['India'], ['Gilbert (United States)']],
  ['Milan Or Barcelona', ['Milan (Italy)', 'Barcelona (Spain)']],
  ['Austin, TX; Boston, MA', ['Austin (United States)', 'Boston (United States)', 'Massachusetts (United States)']],
  ['Brooklyn, New York, United States', ['Brooklyn (United States)', 'New York (United States)'], ['New York City (United States)']],
  ['Ontario (LON)', ['Ontario (Canada)'], ['Ontario (United States)']],
  ['Manchester', ['Manchester (United Kingdom)']],
  ['GB / IE / CA / US / Remote (GB; IE; CA; US)', ['United Kingdom', 'Ireland', 'Canada', 'United States'], ['California (United States)']],
  ['Kinshasa, , Congo (Democratic Republic of the)', ['Kinshasa (Democratic Republic of the Congo)'], ['Missouri (United States)']],
  ['Various Locations, Port of Spain, Trinidad and Tobago', ['Trinidad and Tobago'], ['Tobago (Trinidad and Tobago)']],
  ['Ottawa - Tanger Outlets (OTT)', ['Ottawa (Canada)'], ['Morocco']],
  ['Market At Town Center, Houston, TX', ['Houston (United States)'], ['Michigan (United States)']],
  ['Lodz Outlet (LOZ)', ['Poland']],
  ['Syrian Arab Republic', ['Syria']],
  ['UK - Remote', ['United Kingdom']],
];

test('parsePlaces reads real job locations', () => {
  for (const [raw, want, notWant = []] of CASES) {
    const got = parsePlaces(raw);
    for (const p of want) assert.ok(got.includes(p), `${raw}: missing ${p} in ${JSON.stringify(got)}`);
    for (const p of notWant) assert.ok(!got.includes(p), `${raw}: wrong ${p} in ${JSON.stringify(got)}`);
  }
});

test('parsePlaces leaves text with no place, or a bare code, unread', () => {
  for (const raw of ['Remote', 'Hybrid', '', null, 'Shipboard', 'MD', '3 Locations', 'Remote - CA']) assert.deepEqual(parsePlaces(raw), [], String(raw));
});

test('the board hint settles bare names and codes', () => {
  assert.ok(parsePlaces('Remote - CA', 'US').includes('California (United States)'));
  assert.ok(parsePlaces('Radlett', 'GB').includes('Radlett (United Kingdom)'));
  assert.ok(parsePlaces('Newcastle', 'GB').includes('Newcastle upon Tyne (United Kingdom)'));
  assert.deepEqual(parsePlaces('Anne Arundel County', 'US'), []);
});

test('boardCountry needs 60% of placed jobs', () => {
  assert.equal(boardCountry([['India'], ['Bengaluru (India)', 'India'], ['Germany'], []]), 'IN');
  assert.equal(boardCountry([['India'], ['Germany']]), null);
});

test('tagPlaces uses the board country for every job', () => {
  const jobs = [{ locationRaw: 'London, UK' }, { locationRaw: 'Leeds, England' }, { locationRaw: 'Radlett' }, { locationRaw: null }];
  tagPlaces(jobs);
  assert.ok(jobs[2].places.includes('Radlett (United Kingdom)'));
  assert.deepEqual(jobs[3].places, []);
});
