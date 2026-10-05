// Pure scoring core, shared by the Node scraper (src/intelligence/index.js)
// and the web app (web/lib/scoring.ts). No Node-only deps so it can be
// imported from either side without pulling in fs/config/logger.

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// One compiled regex per term: every keyword, tag and niche term is tested on
// every job, and a rules change re-scores all ~50k stored jobs.
const wordRegexes = new Map();

function matchesWord(text, term) {
  let re = wordRegexes.get(term);
  if (!re) {
    re = new RegExp(`\\b${escapeRegex(term.toLowerCase())}\\b`, 'i');
    wordRegexes.set(term, re);
  }
  return re.test(text);
}

// Bump when the tagging code below changes. rules.json changes are detected
// on their own; either one makes the scraper re-tag every stored job.
const TAGGING_VERSION = 1;

// Enough to count as a software role when no niche matched. Not a bare
// "engineer": "Lighting and AV Engineer" and "QAQC Engineer" are construction.
const DEV_TITLE = /\b(software|developer|programmer|swe|sde|founding engineer|product engineer|forward deployed engineer|member of technical staff|engineering manager)\b/i;

// Not software development even when the title says "engineer" or "AI"
// (Sales Engineer, Hardware Engineer, AI Trainer, AI Product Manager).
// ponytail: a hand-kept word list; misses rare titles, add words as they show up.
const NON_DEV_TITLE = /\b(sales|accounts?|customer|support|success|solutions?|field|presales|partners?|partnerships|alliances|business|implementation|onboarding|consultant|marketing|recruit\w*|talent|people|hr|finance|legal|counsel|compliance|policy|officer|operations|analyst|specialist|mechanical|electrical|civil|construction|bridges?|tunnels?|highways?|geotechnical|resident engineer|site engineer|chemical|manufacturing|process|hardware|structural|biomedical|clinical|network|technician|designer|product manager|program manager|project manager|trainer|tutor|annotator|rater|writer|advocate|relations|evangelist)\b/i;

// A niche word alone isn't a role: "Strategic Foresight & AI Agents" interns,
// "Cloud Alliances Manager" and "Security Officer" all contain one. The title
// must also name a technical role.
const ROLE_WORD = /\b(engineer|engineering|developer|programmer|scientist|researcher|architect|sre|devops|swe|sde|sdet|qa|tester)\b/i;

function nicheIn(text, niches) {
  for (const [niche, terms] of Object.entries(niches)) {
    if (terms.some((term) => matchesWord(text, term))) return niche;
  }
  return null;
}

// Which corner of software development a job is in: a rules.niches key (in
// priority order, first match wins), 'software' for a generic software title,
// or null when it isn't software development. Decided by the title, since
// descriptions mention every buzzword; team/department only refine a generic
// title ("Software Engineer" on the "Infrastructure" team).
function classifyNiche(job, rules) {
  const { title, team, department } = job;
  if (!title || NON_DEV_TITLE.test(title)) return null;
  const niches = rules.niches || {};
  const devTitle = DEV_TITLE.test(title);
  const fromTitle = devTitle || ROLE_WORD.test(title) ? nicheIn(title, niches) : null;
  if (fromTitle) return fromTitle;
  if (!devTitle) return null;
  return nicheIn(`${team || ''} ${department || ''}`, niches) || 'software';
}

// A job's filter tags: its niche, its positive keywords, and its tech tags.
// Niche first, because job rows show only the first few tags. Tech tags skip
// non-dev titles: a recruiter's post that mentions Go isn't a Go job.
function jobTags(job, rules, matchedKeywords) {
  const niche = classifyNiche(job, rules);
  const text = `${job.title} ${job.description}`;
  const devTitle = !NON_DEV_TITLE.test(job.title || '');
  return [...new Set([
    ...(niche && niche !== 'software' ? [niche] : []),
    ...matchedKeywords.filter((m) => m.weight > 0).map((m) => m.keyword),
    ...(devTitle ? (rules.tags || []).filter((tag) => matchesWord(text, tag)) : []),
  ])];
}

function scoreKeywords(job, rules) {
  const matched = [];
  if (!rules.keywords) return { total: 0, matched };

  let total = 0;
  const searchText = `${job.title} ${job.description}`.toLowerCase();

  for (const [keyword, weight] of Object.entries(rules.keywords)) {
    if (matchesWord(searchText, keyword)) {
      total += weight;
      matched.push({ keyword, weight });
    }
  }

  return { total, matched };
}

function scoreLocation(job, rules) {
  if (!rules.locations || !rules.locations.length) return { boost: 0, match: null };

  const jobLocation = (job.location || '').toLowerCase();
  for (const loc of rules.locations) {
    if (matchesWord(jobLocation, loc)) {
      return { boost: rules.locationBoost || 5, match: loc };
    }
  }
  return { boost: 0, match: null };
}

function scoreRemote(job, rules) {
  if (rules.remoteBoost && job.remote) return rules.remoteBoost;
  return 0;
}

function scoreDepartment(job, rules) {
  if (!rules.departments || !rules.departments.length) return { boost: 0, match: null };

  const dept = (job.department || '').toLowerCase();
  for (const d of rules.departments) {
    if (matchesWord(dept, d)) {
      return { boost: rules.departmentBoost || 3, match: d };
    }
  }
  return { boost: 0, match: null };
}

function scoreFreshness(job, rules) {
  if (!rules.freshnessBoostHours || !rules.freshnessBoost) return { boost: 0, hoursAgo: null };

  const published = new Date(job.publishedAt || job.published_at);
  const hoursAgo = (Date.now() - published.getTime()) / (1000 * 60 * 60);

  if (hoursAgo <= rules.freshnessBoostHours) {
    return { boost: rules.freshnessBoost, hoursAgo };
  }
  return { boost: 0, hoursAgo };
}

function computeScore(job, rules) {
  const keywords = scoreKeywords(job, rules);
  const location = scoreLocation(job, rules);
  const remote = scoreRemote(job, rules);
  const department = scoreDepartment(job, rules);
  const freshness = scoreFreshness(job, rules);

  const score = keywords.total + location.boost + remote + department.boost + freshness.boost;

  return { score, keywords, location, remote, department, freshness };
}

// Score minus the time-decaying freshness boost — safe to persist, since the
// freshness part is cheap to recompute inline from published_at at query time.
function computeStoredScore(job, rules) {
  const keywords = scoreKeywords(job, rules);
  const location = scoreLocation(job, rules);
  const remote = scoreRemote(job, rules);
  const department = scoreDepartment(job, rules);
  const baseScore = keywords.total + location.boost + remote + department.boost;
  return { baseScore, matchedKeywords: jobTags(job, rules, keywords.matched) };
}

module.exports = { matchesWord, escapeRegex, computeScore, computeStoredScore, classifyNiche, jobTags, TAGGING_VERSION };
