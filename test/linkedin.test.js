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

test('postSlots: 09:00 IST then every 6 hours, or from now when the digest is late', () => {
  const iso = (dates) => dates.map((d) => d.toISOString());
  assert.deepEqual(iso(postSlots(3, new Date('2026-10-09T00:15:00Z'))), [
    '2026-10-09T03:30:00.000Z', '2026-10-09T09:30:00.000Z', '2026-10-09T15:30:00.000Z',
  ]);
  assert.deepEqual(iso(postSlots(2, new Date('2026-10-09T05:00:00Z'))), ['2026-10-09T05:00:00.000Z', '2026-10-09T11:00:00.000Z']);
});
