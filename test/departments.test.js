const test = require('node:test');
const assert = require('node:assert/strict');

const { departmentGroup, DEPARTMENT_GROUPS } = require('../src/normalize/departments');

// [department, team, title, expected group]
const CASES = [
  // The title's role decides, whatever domain follows it.
  [null, null, 'Senior Software Engineer', 'Engineering'],
  [null, null, 'Software Engineer, Payments Risk', 'Engineering'],
  [null, null, 'Backend Engineer (Billing)', 'Engineering'],
  [null, null, 'Product Manager - Security', 'Product'],
  [null, null, 'AI Product Manager', 'Product'],
  [null, null, 'Member of Technical Staff', 'Engineering'],
  // Qualifiers beat the broad group they contain.
  [null, null, 'Technical Recruiter', 'People & HR'],
  [null, null, 'Sales Engineer', 'Sales'],
  [null, null, 'Solutions Architect', 'Sales'],
  [null, null, 'Senior Product Designer', 'Design'],
  [null, null, 'Product Marketing Manager', 'Marketing'],
  [null, null, 'Data Engineer', 'Data & AI'],
  [null, null, 'Machine Learning Engineer', 'Data & AI'],
  [null, null, 'Security Engineer', 'Security'],
  [null, null, 'Customer Support Engineer', 'Customer Success & Support'],
  [null, null, 'IT Support Specialist', 'IT'],
  [null, null, 'Design Verification Engineer', 'Hardware & Manufacturing'],
  [null, null, 'Account Executive, Mid-Market', 'Sales'],
  [null, null, 'Financial Analyst', 'Finance'],
  [null, null, 'Legal Counsel', 'Legal & Compliance'],
  [null, null, 'Registered Nurse (RN)', 'Healthcare'],
  [null, null, 'Research Scientist', 'Research & Science'],
  [null, null, 'Chief of Staff', 'Operations'],
  // "AI" and "IT" only as capitalized words, not inside other words.
  [null, null, 'Waiter', 'Other'],
  [null, null, 'Maintenance Lead', 'Other'],
  // A vague title falls back to the department, then the team.
  ['Finance', null, 'Analyst', 'Finance'],
  ['Go To Market', null, 'Associate', 'Sales'],
  [null, 'People Ops', 'Coordinator', 'People & HR'],
  ['Vertrieb', null, 'Mitarbeiter', 'Sales'],
  // Vague department words count only when nothing clearer matched.
  ['Technology', null, 'Product Manager', 'Product'],
  ['R&D', null, 'Head of Things', 'Engineering'],
  [null, 'Growth', 'Lead', 'Marketing'],
  [null, null, 'Software Engineer, Growth', 'Engineering'],
  // Found in "Other" when sampling real boards.
  [null, null, 'Abuse Investigator - Scams & Fraud', 'Legal & Compliance'],
  [null, null, 'US Congressional Lead', 'Legal & Compliance'],
  [null, null, 'Red Team Specialist - Cyber', 'Security'],
  [null, null, 'Associate Renewals Manager', 'Sales'],
  [null, null, 'Senior Engagement Manager - Germany', 'Customer Success & Support'],
  [null, null, 'Manager, Strategic Programs', 'Operations'],
  // Phrases, not bare words, so these keep their real group.
  [null, null, 'Motion Capture Artist', 'Other'],
  [null, null, 'CRM Developer', 'Engineering'],
  [null, null, 'Developer Enablement Engineer', 'Engineering'],
  // "Talent Pool" is a general application, not an HR job.
  ['Talent Pool', null, 'General Application', 'Other'],
  [null, null, null, 'Other'],
];

test('departmentGroup sorts jobs by the role their title names', () => {
  for (const [department, team, title, expected] of CASES) {
    assert.equal(departmentGroup(department, team, title), expected, `${department} / ${team} / ${title}`);
  }
});

test('every group departmentGroup returns is listed in DEPARTMENT_GROUPS', () => {
  for (const [department, team, title] of CASES) {
    assert.ok(DEPARTMENT_GROUPS.includes(departmentGroup(department, team, title)));
  }
  assert.equal(new Set(DEPARTMENT_GROUPS).size, DEPARTMENT_GROUPS.length);
  assert.equal(DEPARTMENT_GROUPS.at(-1), 'Other');
});
