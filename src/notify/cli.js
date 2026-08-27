const { styleText } = require('node:util');
const { EVENT_TYPES } = require('../diff');

function printRunSummary(allChanges, scoredJobs) {
  console.log('\n' + styleText('bold', '═══════════════════════════════════════════'));
  console.log(styleText('bold', '  AshbyHQ Job Scraper — Run Summary'));
  console.log(styleText('bold', '═══════════════════════════════════════════') + '\n');

  if (allChanges.length === 0) {
    console.log(styleText('gray', '  No changes detected.\n'));
    return;
  }

  const byCompany = groupBy(allChanges, c => c.job.company);

  for (const [company, changes] of Object.entries(byCompany)) {
    const newCount = changes.filter(c => c.type === EVENT_TYPES.JOB_NEW).length;
    const updatedCount = changes.filter(c => c.type === EVENT_TYPES.JOB_UPDATED).length;
    const removedCount = changes.filter(c => c.type === EVENT_TYPES.JOB_REMOVED).length;

    console.log(styleText(['bold', 'cyan'], `  ${company}`));
    console.log(styleText('gray', `  ${newCount} new · ${updatedCount} updated · ${removedCount} removed`));
    console.log();

    const newJobs = changes.filter(c => c.type === EVENT_TYPES.JOB_NEW);
    for (const { job } of newJobs) {
      const scored = scoredJobs?.find(s => s.jobId === job.jobId && s.company === job.company);
      const scoreTag = scored ? styleText('yellow', ` [score: ${scored.relevanceScore}]`) : '';
      console.log(`    ${styleText('green', '+')} ${job.title}${scoreTag}`);
      console.log(`      ${styleText('gray', formatMeta(job))}`);
      if (job.compensationSummary) {
        console.log(`      ${styleText('green', job.compensationSummary)}`);
      }
      console.log(`      ${styleText('blue', job.applyUrl)}`);
      console.log();
    }

    const updatedJobs = changes.filter(c => c.type === EVENT_TYPES.JOB_UPDATED);
    for (const { job } of updatedJobs) {
      console.log(`    ${styleText('yellow', '~')} ${job.title}`);
      console.log(`      ${styleText('gray', formatMeta(job))}`);
      console.log();
    }

    const removedJobs = changes.filter(c => c.type === EVENT_TYPES.JOB_REMOVED);
    for (const { job } of removedJobs) {
      console.log(`    ${styleText('red', '-')} ${styleText('strikethrough', job.title)}`);
      console.log(`      ${styleText('gray', formatMeta(job))}`);
      console.log();
    }
  }

  if (scoredJobs && scoredJobs.length > 0) {
    console.log(styleText('bold', '───────────────────────────────────────────'));
    console.log(styleText('bold', `  Top Opportunities (${scoredJobs.length} above threshold)`));
    console.log(styleText('bold', '───────────────────────────────────────────\n'));

    const top = scoredJobs.slice(0, 10);
    for (const job of top) {
      console.log(`  ${styleText(['bold', 'white'], job.title)} ${styleText('gray', 'at')} ${styleText('cyan', job.company)}`);
      console.log(`    Score: ${styleText('yellow', String(job.relevanceScore))} — ${styleText('gray', job.signals.join(', '))}`);
      console.log(`    ${styleText('gray', formatMeta(job))}`);
      if (job.compensationSummary) {
        console.log(`    ${styleText('green', job.compensationSummary)}`);
      }
      console.log(`    ${styleText('blue', job.applyUrl)}`);
      console.log();
    }
  }

  console.log(styleText('bold', '═══════════════════════════════════════════\n'));
}

function formatMeta(job) {
  const parts = [job.location];
  if (job.remote) parts.push('Remote');
  if (job.department) parts.push(job.department);
  if (job.team) parts.push(job.team);
  if (job.employmentType || job.employment_type) {
    parts.push(job.employmentType || job.employment_type);
  }
  return parts.filter(Boolean).join(' · ');
}

function groupBy(arr, keyFn) {
  const map = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return map;
}

module.exports = { printRunSummary };
