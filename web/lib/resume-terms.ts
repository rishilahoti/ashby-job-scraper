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
