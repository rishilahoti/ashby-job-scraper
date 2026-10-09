// Groq writes the words of the LinkedIn posts; content.js slots them around
// the numbers, which never come from the model. A draft that fails
// checkCopy() twice is dropped for the templates, so a bad one never posts.
const { logger, timeLimit } = require('../utils');

const MODEL = 'openai/gpt-oss-120b';

const SYSTEM = `You write LinkedIn copy for a solo developer building Ashby Jobs in public, in their voice (first person). Ashby Jobs is a free job board: every night a scraper reads the career pages of thousands of companies across many hiring platforms (FACTS.platforms; Ashby is only one of them) and lists every live job straight from the company, with no reposts.

Readers: software engineers looking for work, and builders following the project. They scroll fast, so the first line decides everything.

Return JSON with exactly these keys:
{
  "hook": "first line of today's update post",
  "hookLine2": "a second line that sharpens the hook, or an empty string",
  "shipped": ["one line per FACTS.shipped item, same order, saying in plain words what changed for a job seeker; an empty string for anything a job seeker wouldn't notice or that you can't tell from the title"],
  "broke": "one line about FACTS.broke, or an empty string when nothing broke",
  "closer": "one short line that makes a job seeker want to try the site; the link is added after it",
  "jobHooks": ["three opening lines for a separate post listing FACTS.jobsPost"]
}

Hooks:
- Under 100 characters. Specific beats clever: lead with the most surprising fact or tension in FACTS.
- Never start with "Day", "Here's", "Update", "Exciting", "Discover" or "Check out".
- The three jobHooks take different angles: apply-early urgency, a company or niche named in FACTS.jobsPost, and curiosity.
- The shape of a good hook (don't copy the wording or numbers): "1,812 jobs vanished overnight. 2,240 new ones took their place." / "Notion, Vercel and Figma all opened engineering roles yesterday."
- Bad: "Exciting update on Ashby Jobs!", "Discover the latest openings today."

Rules:
- Plain text only: no markdown, hashtags, links, URLs or questions.
- Only use numbers that appear in FACTS, exactly as given. Don't compute new numbers, percentages or rankings, and don't claim anything FACTS doesn't say.
- broke: name the companies and say their job boards stopped loading. No promises, apologies, "on it" or "stay tuned".
- No hype words: thrilled, excited, game-changer, revolutionary, unlock, delve, leverage, journey, seamless. No rocket emoji.`;

const BANNED = /\b(on it|stay tuned|thrilled|excited|game[- ]changer|revolutionary|unlock|delve|leverage|journey|seamless)\b|🚀/i;
const numbersIn = (s) => (s.match(/\d[\d,]*/g) || []).map((n) => n.replace(/,/g, ''));

// Why a draft can't go out, or null when it can.
function checkCopy(copy, facts) {
  if (!copy || typeof copy !== 'object') return 'not a JSON object';
  const { hook, hookLine2 = '', shipped, broke = '', closer, jobHooks } = copy;
  if (!Array.isArray(shipped) || shipped.length !== facts.shipped.length) return 'shipped lines don\'t match the PRs';
  if (!Array.isArray(jobHooks) || jobHooks.length !== 3) return 'need 3 job hooks';
  const lines = [hook, hookLine2, broke, closer, ...shipped, ...jobHooks];
  if (lines.some((l) => typeof l !== 'string')) return 'a field isn\'t text';
  if (!hook || !closer || jobHooks.some((h) => !h) || new Set(jobHooks).size !== 3) return 'empty or repeated lines';
  if (facts.broke.boards && !facts.broke.companies.every((c) => broke.includes(c))) return 'broke line leaves out a company';
  const allowed = new Set(numbersIn(JSON.stringify(facts)));
  for (const line of lines) {
    if (line.length > 160 || line.includes('\n')) return `too long: "${line.slice(0, 60)}…"`;
    if (/https?:|www\.|#|\*\*|\?/.test(line)) return `link, hashtag, markdown or question: "${line}"`;
    if (BANNED.test(line)) return `banned phrase: "${line}"`;
    const invented = numbersIn(line).find((n) => !allowed.has(n));
    if (invented) return `${invented} isn't in the facts: "${line}"`;
  }
  return null;
}

async function askGroq(key, facts) {
  const res = await timeLimit(fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `FACTS:\n${JSON.stringify(facts, null, 1)}` }],
      response_format: { type: 'json_object' },
      temperature: 0.9,
      reasoning_effort: 'medium',
    }),
    signal: AbortSignal.timeout(60000),
  }), 60000);
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${(await timeLimit(res.text(), 10000)).slice(0, 200)}`);
  const body = await timeLimit(res.json(), 60000);
  return JSON.parse(body.choices[0].message.content);
}

// { copy, note }: copy is null when the templates should be used, and note
// says which it was, for the email.
async function writeCopy(facts) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { copy: null, note: 'Template copy: GROQ_API_KEY isn\'t set.' };
  let problem;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const copy = await askGroq(key, facts);
      problem = checkCopy(copy, facts);
      if (!problem) return { copy, note: `Wording by Groq (${MODEL}), numbers from the database.` };
    } catch (err) {
      problem = err.message;
    }
    logger.warn(`Groq copy, attempt ${attempt}: ${problem}`);
  }
  return { copy: null, note: `Template copy: Groq's draft failed a check (${problem}).` };
}

module.exports = { writeCopy, checkCopy };
