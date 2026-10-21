import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeTerms } from './resume-terms.ts';

const rules = {
	keywords: { react: 7, intern: 8, backend: 8, senior: -5 },
	niches: {
		data: ['data engineer', 'data science'],
		frontend: ['frontend', 'react'],
	},
	tags: ['kubernetes', 'postgres'],
};

test('resumeTerms: niche keys found by their terms, no level or negative words', () => {
	const resume = 'Senior engineer. Built data pipelines in React and Postgres. Software Engineering Intern, 2019.';
	assert.deepEqual(resumeTerms(resume, rules), ['frontend', 'react', 'postgres']);
});

test('resumeTerms: a niche term gives the niche key', () => {
	assert.deepEqual(resumeTerms('Data Engineer running Kubernetes', rules), ['data', 'kubernetes']);
});
