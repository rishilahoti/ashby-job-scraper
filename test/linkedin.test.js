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

test('postSlots: 09:00, 15:00 and 21:00 IST; a late digest keeps only the times still ahead', () => {
  const iso = (dates) => dates.map((d) => d.toISOString());
  assert.deepEqual(iso(postSlots(3, new Date('2026-10-09T00:15:00Z'))), [
    '2026-10-09T03:30:00.000Z', '2026-10-09T09:30:00.000Z', '2026-10-09T15:30:00.000Z',
  ]);
  // 10:30 IST: 09:00 has passed, 15:00 and 21:00 stay put.
  assert.deepEqual(iso(postSlots(3, new Date('2026-10-09T05:00:00Z'))), ['2026-10-09T09:30:00.000Z', '2026-10-09T15:30:00.000Z']);
  assert.deepEqual(postSlots(3, new Date('2026-10-09T16:00:00Z')), []);
});
