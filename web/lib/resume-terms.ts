import { matchesWord } from '../../src/intelligence/rules-engine.js';

// What /match sends to /api/resume-years, and the most the model is given.
export const MAX_RESUME_CHARS = 12000;

interface Vocabulary {
	keywords: Record<string, number>;
	niches: Record<string, string[]>;
	tags: string[];
}

// Level words are left out: on a resume "Intern at X, 2019" is the past, not
// the job wanted. Seniority comes from /api/resume-years and the experience filter.
const LEVEL_WORDS = new Set(['new grad', 'entry level', 'junior', 'intern']);

// The feed tags a resume names, in the words the scraper tags jobs with
// (rules.json) and with its word-boundary matching (rules-engine.js), so every
// term returned can match a job's matched_keywords. A job's tags are: its niche
// key ("ai", "devops", ...), its positive-weight keywords, and its tech tags.
export function resumeTerms(text: string, rules: Vocabulary): string[] {
	// A niche is found by its terms, like the scraper does: the key alone
	// misfires ("data" is in nearly every resume, "data engineer" isn't).
	const niches = Object.entries(rules.niches)
		.filter(([, terms]) => terms.some((term) => matchesWord(text, term)))
		.map(([niche]) => niche);
	const words = [
		...Object.entries(rules.keywords)
			.filter(([term, weight]) => weight > 0 && !LEVEL_WORDS.has(term))
			.map(([term]) => term),
		...rules.tags,
	].filter((term) => matchesWord(text, term));
	return [...new Set([...niches, ...words])];
}

// A line that is only a section title. Experience sections are read; any of the
// others ends one, so Projects and Education dates aren't counted as jobs.
const EXPERIENCE_HEADER = /^(?:work |professional |relevant )?(?:experience|employment(?: history)?|work history|internships?)\s*:?$/i;
const OTHER_HEADER =
	/^(?:education|(?:personal |academic )?projects|(?:technical )?skills|certifications?|achievements|awards|publications|volunteering|interests|languages|summary|profile|leadership|activities|extracurriculars?(?: activities)?|open source)(?:\s*(?:&|and)\s*\w+)?\s*:?$/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// "Mar 2026", "March 2026", "03/2026" or "2026". Groups: month name, month number, year.
const DATE = String.raw`(?:\b([a-z]{3})[a-z]*\.?\s+|\b(\d{1,2})\s*/\s*)?((?:19|20)\d{2})`;
const RANGE = new RegExp(String.raw`${DATE}\s*(?:-|–|—|to)\s*(?:${DATE}|(present|current|now|ongoing))`, 'gi');

// Years of work experience from the dates in a resume's Experience section:
// each "Mar 2026 - Sep 2026" counts its months, overlapping jobs once. null when
// there's no such section or it has no date ranges: then /api/resume-years asks
// a model. Runs in the browser, so most resumes are never sent anywhere.
export function resumeYears(text: string, now = new Date()): number | null {
	let inside = false;
	const section: string[] = [];
	for (const line of text.split(/\r?\n/).map((l) => l.trim())) {
		if (EXPERIENCE_HEADER.test(line)) inside = true;
		else if (OTHER_HEADER.test(line)) inside = false;
		else if (inside) section.push(line);
	}
	const today = now.getFullYear() * 12 + now.getMonth();
	// Months since year 0; a month that isn't named counts as January.
	const month = (name: string | undefined, num: string | undefined, year: string) => {
		const m = name ? MONTHS.indexOf(name.toLowerCase()) : num ? Number(num) - 1 : 0;
		return Number(year) * 12 + (m >= 0 && m < 12 ? m : 0);
	};
	const spans = [...section.join('\n').matchAll(RANGE)]
		.map((m) => ({ start: month(m[1], m[2], m[3]), end: m[7] ? today : Math.min(month(m[4], m[5], m[6]), today) }))
		.filter((s) => s.end >= s.start)
		.sort((a, b) => a.start - b.start);
	if (spans.length === 0) return null;
	let months = 0;
	let reached = -1;
	for (const { start, end } of spans) {
		const from = Math.max(start, reached + 1);
		if (end >= from) months += end - from + 1; // both months count: Mar–Sep is 7
		reached = Math.max(reached, end);
	}
	return Math.round(months / 1.2) / 10;
}
