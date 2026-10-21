import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeTerms, resumeYears } from './resume-terms.ts';

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

test('resumeYears: Experience dates only, overlaps once, null without the section', () => {
	const now = new Date(2026, 9, 21);
	// The shape of a real pasted PDF: one header per line, dates at the end of the title line.
	const resume = [
		'Jane Doe',
		'Experience',
		'AI Software Engineer Mar 2026 - Sep 2026',
		'• Built a multi-agent pipeline, sized for 100K+/month.',
		'Software Developer Nov 2025 - Feb 2026',
		'Front-End Developer Intern Feb 2025 - Aug 2025',
		'Projects',
		'Job Aggregator | Node.js | example.com Jan 2026 - Present',
		'Education',
		'Bachelor of Technology Nov 2021 - Aug 2025',
	].join('\n');
	assert.equal(resumeYears(resume, now), 1.5); // 7 + 4 + 7 months
	assert.equal(resumeYears('WORK EXPERIENCE\nAcme 01/2020 – 12/2020\nBeta June 2020 to Present', now), 6.8);
	assert.equal(resumeYears('Projects\nThing Jan 2024 - Present', now), null);
});
