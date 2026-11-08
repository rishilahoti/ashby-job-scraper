const test = require('node:test');
const assert = require('node:assert/strict');

const { littleText, postSlots } = require('../src/linkedin');

test('littleText escapes what LinkedIn reserves and keeps hashtags', () => {
  assert.equal(littleText('1. ML Engineer at Acme (Remote)'), '1. ML Engineer at Acme \\(Remote\\)');
  assert.equal(
    littleText('C# dev, snake_case, a*b, x@y, [1] {2} <3> ~4 | 5 \\ 6'),
    'C\\# dev, snake\\_case, a\\*b, x\\@y, \\[1\\] \\{2\\} \\<3\\> \\~4 \\| 5 \\\\ 6'
  );
  assert.equal(littleText('#Hiring #OpenToWork\n#TechJobs'), '#Hiring #OpenToWork\n#TechJobs');
});

test('postSlots: 10:00 and 18:00 IST on weekdays; a late run keeps only the times still ahead', () => {
  const iso = (dates) => dates.map((d) => d.toISOString());
  assert.deepEqual(iso(postSlots(new Date('2026-11-09T01:30:00Z'))), ['2026-11-09T04:30:00.000Z', '2026-11-09T12:30:00.000Z']);
  // 11:00 IST: 10:00 has passed.
  assert.deepEqual(iso(postSlots(new Date('2026-11-09T05:30:00Z'))), ['2026-11-09T12:30:00.000Z']);
  assert.deepEqual(postSlots(new Date('2026-11-09T13:00:00Z')), []);
  // A Saturday.
  assert.deepEqual(postSlots(new Date('2026-11-07T01:30:00Z')), []);
});
