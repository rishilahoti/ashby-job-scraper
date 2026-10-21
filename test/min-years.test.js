const test = require('node:test');
const assert = require('node:assert/strict');
const { minYears } = require('../src/intelligence/rules-engine');

const job = (title, description = '') => ({ title, description });

test('minYears reads the stated years and the title, null when neither says', () => {
  assert.equal(minYears(job('Software Engineer', 'You have 3+ years of backend engineering experience.')), 3);
  assert.equal(minYears(job('Front End Developer', 'Minimum of 3 years of UI/UX development experience.')), 3);
  assert.equal(minYears(job('Engineer', '1 to 3 years in DS/AI/ML roles. 5+ years of software engineering or technical deployment experience.')), 5);
  assert.equal(minYears(job('Senior Software Engineer')), 5);
  assert.equal(minYears(job('Staff Engineer', '3+ years of experience')), 8);
  assert.equal(minYears(job('Member of Technical Staff, Applied AI')), null);
  assert.equal(minYears(job('Senior Member of Technical Staff')), 5);
  assert.equal(minYears(job('Junior Developer', '0-1 years of experience')), 0);
  assert.equal(minYears(job('Developer', 'Experience: three years in web development.')), 3);
  assert.equal(minYears(job('Developer', 'Experience: 4 years with Python.')), 4);
  assert.equal(minYears(job('Developer', 'Two to four years of professional experience.')), 2);
  assert.equal(minYears(job('Software Engineer', 'Founded 10 years ago. Options vest over 4 years. Someone with one year')), null);
  assert.equal(minYears(job('Engineer', 'Our founders have 20+ years of experience.')), null);
});
