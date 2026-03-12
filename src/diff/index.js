const store = require('../store');
const { logger } = require('../utils');

const EVENT_TYPES = {
  JOB_NEW: 'JOB_NEW',
  JOB_UPDATED: 'JOB_UPDATED',
  JOB_REMOVED: 'JOB_REMOVED',
};

async function detectChanges(normalizedJobs, company) {
  const changes = [];
  const currentActiveJobIds = normalizedJobs.map(j => j.jobId);

  for (const job of normalizedJobs) {
    const result = await store.upsertJob(job);

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

  const removedJobs = await store.markRemovedJobs(company, currentActiveJobIds);

  for (const removed of removedJobs) {
    changes.push({
      type: EVENT_TYPES.JOB_REMOVED,
      job: {
        jobId: removed.job_id,
        company: removed.company,
        title: removed.title,
        location: removed.location,
        team: removed.team,
        department: removed.department,
        employmentType: removed.employment_type,
        remote: Boolean(removed.remote),
        applyUrl: removed.apply_url,
        jobUrl: removed.job_url,
      },
    });
    logger.debug(`REMOVED: ${removed.title} at ${company}`);
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
