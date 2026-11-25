const store = require('../store');
const { logger } = require('../utils');
const { ADAPTERS } = require('../normalize');

const EVENT_TYPES = {
  JOB_NEW: 'JOB_NEW',
  JOB_UPDATED: 'JOB_UPDATED',
  JOB_REMOVED: 'JOB_REMOVED',
};

// Boards whose list has no descriptions (Rippling, Breezy) cost one request per
// job for one. Only new or changed jobs need it, and at most this many per board
// per run, so a 2,000-job board's first scrape is spread over a few days instead
// of stalling the run. ponytail: sequential within a board; parallelize if the
// first scrape of big boards ever matters.
const MAX_DETAIL_FETCHES_PER_BOARD = 150;

// Marks a job stored without its description, so its hash never matches and
// the next run tries again.
const NO_DESCRIPTION = ':nodesc';

async function addDescription(job, adapter, budget) {
  if (job.description || !adapter?.fetchDescription) return;
  if (budget.left > 0) {
    budget.left--;
    try {
      job.description = await adapter.fetchDescription(job);
    } catch (err) {
      logger.debug(`No description for ${job.jobUrl}: ${err.message}`);
    }
  }
  if (!job.description) job.contentHash += NO_DESCRIPTION;
}

async function detectChanges(normalizedJobs, company, source, slug) {
  // The board's identity, lowercased the same way here and in the +Add route
  // (SmartRecruiters and Workday slugs keep their case for fetching).
  const board = slug?.toLowerCase();
  const changes = [];
  const currentActiveJobIds = normalizedJobs.map(j => j.jobId);
  const adapter = ADAPTERS[source];
  const budget = { left: MAX_DETAIL_FETCHES_PER_BOARD };

  // Skip re-sending the (large) description over the wire for jobs whose
  // content hasn't changed — this is what was blowing through Neon's egress cap.
  const existingHashes = await store.getContentHashesForCompany(company, source, board);
  const unchanged = [];

  // Jobs never tried for a description first, earlier failures after them in a
  // random order: the same failing jobs must not take the whole budget each run.
  const retryKey = new Map(normalizedJobs.map(j => [j.jobId, existingHashes.get(j.jobId)?.endsWith(NO_DESCRIPTION) ? 1 + Math.random() : 0]));
  const ordered = [...normalizedJobs].sort((a, b) => retryKey.get(a.jobId) - retryKey.get(b.jobId));

  for (const job of ordered) {
    if (existingHashes.get(job.jobId) === job.contentHash) {
      unchanged.push(job.jobId);
      continue;
    }

    await addDescription(job, adapter, budget);
    const result = await store.upsertJob({ ...job, board });

    if (result === 'inserted') {
      changes.push({ type: EVENT_TYPES.JOB_NEW, job });
      await store.saveSnapshot(job);
      logger.debug(`NEW: ${job.title} at ${company}`);
    } else if (result === 'updated') {
      // No need to re-fetch — the job object in hand IS the new version.
      // previousJob is not used in any consumer, so we omit the extra SELECT.
      changes.push({
        type: EVENT_TYPES.JOB_UPDATED,
        job,
      });
      await store.saveSnapshot(job);
      logger.debug(`UPDATED: ${job.title} at ${company}`);
    }
  }

  await store.touchJobs(company, unchanged, new Date().toISOString(), board);
  const removedJobs = await store.markRemovedJobs(company, currentActiveJobIds, source, board);

  for (const job of removedJobs) {
    changes.push({ type: EVENT_TYPES.JOB_REMOVED, job });
    logger.debug(`REMOVED: ${job.title} at ${company}`);
  }

  logger.info(
    `Diff for ${company}: ${countByType(changes, EVENT_TYPES.JOB_NEW)} new, ` +
    `${countByType(changes, EVENT_TYPES.JOB_UPDATED)} updated, ` +
    `${countByType(changes, EVENT_TYPES.JOB_REMOVED)} removed`
  );

  return changes;
}

function countByType(changes, type) {
  return changes.filter(c => c.type === type).length;
}

module.exports = { detectChanges, EVENT_TYPES };
