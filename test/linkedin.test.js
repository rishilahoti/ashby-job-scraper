const test = require('node:test');
const assert = require('node:assert/strict');

const { littleText, postSlots, isWeekend, enabled } = require('../src/linkedin');

test('littleText escapes what LinkedIn reserves and keeps hashtags', () => {
  assert.equal(littleText('1. ML Engineer at Acme (Remote)'), '1. ML Engineer at Acme \\(Remote\\)');
  assert.equal(
    littleText('C# dev, snake_case, a*b, x@y, [1] {2} <3> ~4 | 5 \\ 6'),
    'C\\# dev, snake\\_case, a\\*b, x\\@y, \\[1\\] \\{2\\} \\<3\\> \\~4 \\| 5 \\\\ 6'
  );
  assert.equal(littleText('#Hiring #OpenToWork\n#TechJobs'), '#Hiring #OpenToWork\n#TechJobs');
});

test('postSlots: 09:00, 15:00 and 21:00 IST every day; a late digest keeps only the times still ahead', () => {
  const iso = (dates) => dates.map((d) => d.toISOString());
  // A Saturday.
  assert.deepEqual(iso(postSlots(3, new Date('2026-10-10T00:15:00Z'))), [
    '2026-10-10T03:30:00.000Z', '2026-10-10T09:30:00.000Z', '2026-10-10T15:30:00.000Z',
  ]);
  // 10:30 IST: 09:00 has passed, 15:00 and 21:00 stay put.
  assert.deepEqual(iso(postSlots(3, new Date('2026-10-10T05:00:00Z'))), ['2026-10-10T09:30:00.000Z', '2026-10-10T15:30:00.000Z']);
  assert.deepEqual(postSlots(3, new Date('2026-10-10T16:00:00Z')), []);
  // Weekdays too: the Page posts every day.
  assert.equal(postSlots(3, new Date('2026-10-09T00:15:00Z')).length, 3);
  assert.deepEqual(iso(postSlots(1, new Date('2026-10-11T00:15:00Z'))), ['2026-10-11T03:30:00.000Z']);
});

test('isWeekend: Saturday and Sunday only', () => {
  assert.equal(isWeekend(new Date('2026-10-10T00:15:00Z')), true); // Saturday
  assert.equal(isWeekend(new Date('2026-10-11T00:15:00Z')), true); // Sunday
  assert.equal(isWeekend(new Date('2026-10-09T00:15:00Z')), false); // Friday
});

test('enabled: the Page needs its token and id, the profile its own token', () => {
  const saved = { ...process.env };
  try {
    delete process.env.LINKEDIN_ACCESS_TOKEN;
    process.env.LINKEDIN_PAGE_ACCESS_TOKEN = 't';
    delete process.env.LINKEDIN_PAGE_ID;
    assert.equal(enabled('page'), false);
    assert.equal(enabled(), false);
    process.env.LINKEDIN_PAGE_ID = '1';
    assert.equal(enabled('page'), true);
    assert.equal(enabled('profile'), false);
    assert.equal(enabled(), true);
  } finally {
    process.env = saved;
  }
});
