// Pure scoring core, shared by the Node scraper (src/intelligence/index.js)
// and the web app (web/lib/scoring.ts). No Node-only deps so it can be
// imported from either side without pulling in fs/config/logger.

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesWord(text, term) {
  return new RegExp(`\\b${escapeRegex(term.toLowerCase())}\\b`, 'i').test(text);
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
  const matchedKeywords = keywords.matched.filter((m) => m.weight > 0).map((m) => m.keyword);
  return { baseScore, matchedKeywords };
}

module.exports = { matchesWord, escapeRegex, computeScore, computeStoredScore };
