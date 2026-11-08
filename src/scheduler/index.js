const path = require('path');
const { spawn } = require('child_process');
const cron = require('node-cron');
const config = require('../config');
const { logger, delay } = require('../utils');
const { runPipeline } = require('./pipeline');
const store = require('../store');
const linkedin = require('../linkedin');
const marketing = require('../marketing');
const outreach = require('../outreach');

function startScheduler() {
  const cronExpr = config.schedule.cron;
  logger.info(`Scheduler starting with cron: "${cronExpr}"`);

  const task = cron.schedule(cronExpr, async () => {
    const jitterMs = Math.random() * config.schedule.jitterMaxMinutes * 60 * 1000;
    logger.info(`Scheduled run triggered. Jitter delay: ${Math.round(jitterMs / 1000)}s`);

    await delay(jitterMs);
    await runPipeline();
  });

  const pool = store.getPool();
  const every = (expr, name, job) => cron.schedule(expr, () => job().catch((err) => logger.error(`${name} failed: ${err.message}`)));
  // Publishes the queued LinkedIn posts as their times come.
  if (linkedin.enabled()) every('*/10 * * * *', 'LinkedIn posting', () => linkedin.postDue(pool));
  every('*/10 * * * *', 'Morning marketing', () => marketing.morning(pool));
  every('* * * * *', 'Outreach sending', () => outreach.sendNext(pool));
  every('*/15 * * * *', 'Inbox scan', () => outreach.scanInbox(pool));
  // 00:30 IST, well clear of the job scrape. Its own process, because fetch keeps
  // a connection pool per site for the life of the process, and this visits hundreds.
  every('0 19 * * *', 'Brand scrape', () => new Promise((resolve, reject) => {
    spawn(process.execPath, [path.join(__dirname, '../../index.js'), 'outreach-collect'], { stdio: 'inherit', timeout: 40 * 60000 })
      .on('error', reject)
      .on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  }));

  logger.info('Scheduler is running. Press Ctrl+C to stop.');
  return task;
}

module.exports = { startScheduler, runPipeline };
