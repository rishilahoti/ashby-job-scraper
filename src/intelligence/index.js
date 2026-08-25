const config = require('../config');
const { logger } = require('../utils');
const { computeScore } = require('./rules-engine');

function scoreJob(job) {
  const rules = config.intelligence.rules;
  const result = computeScore(job, rules);
  const signals = [];

  for (const { keyword, weight } of result.keywords.matched) {
    signals.push(`keyword:"${keyword}" (${weight > 0 ? '+' : ''}${weight})`);
  }
  if (result.location.match) {
    signals.push(`location:"${result.location.match}" (+${result.location.boost})`);
  }
  if (result.remote) {
    signals.push(`remote (+${result.remote})`);
  }
  if (result.department.match) {
    signals.push(`department:"${result.department.match}" (+${result.department.boost})`);
  }
  if (result.freshness.boost) {
    signals.push(`fresh:${Math.round(result.freshness.hoursAgo)}h (+${result.freshness.boost})`);
  }

  return { score: result.score, signals };
}

function filterAndRank(jobs) {
  const minScore = config.intelligence.minScore;

  const scored = jobs.map(job => {
    const { score, signals } = scoreJob(job);
    return { ...job, relevanceScore: score, signals };
  });

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const aboveThreshold = scored.filter(j => j.relevanceScore >= minScore);

  logger.info(
    `Intelligence: ${aboveThreshold.length}/${scored.length} jobs above threshold (min: ${minScore})`
  );

  return { all: scored, filtered: aboveThreshold };
}

module.exports = { scoreJob, filterAndRank };
