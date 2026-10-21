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
  assert.equal(minYears(job('Junior Developer', '0-1 years of experience')), 0);
  assert.equal(minYears(job('Software Engineer', 'Founded 10 years ago. Options vest over 4 years.')), null);
  assert.equal(minYears(job('Engineer', 'Our founders have 20+ years of experience.')), null);
});
