const cron = require('node-cron');
const config = require('../config');
const { logger, jitteredDelay } = require('../utils');
const { runPipeline } = require('./pipeline');
const store = require('../store');
const linkedin = require('../linkedin');

function startScheduler() {
  const cronExpr = config.schedule.cron;
  logger.info(`Scheduler starting with cron: "${cronExpr}"`);

  const task = cron.schedule(cronExpr, async () => {
    const jitterMs = Math.random() * config.schedule.jitterMaxMinutes * 60 * 1000;
    logger.info(`Scheduled run triggered. Jitter delay: ${Math.round(jitterMs / 1000)}s`);

    await jitteredDelay(0, jitterMs);
    await runPipeline();
  });

  // Publishes the LinkedIn posts the digest queued, as their times come.
  if (linkedin.enabled()) {
    cron.schedule('*/10 * * * *', () => linkedin.postDue(store.getPool())
      .catch((err) => logger.error(`LinkedIn posting failed: ${err.message}`)));
    logger.info('LinkedIn posting is on');
  }

  logger.info('Scheduler is running. Press Ctrl+C to stop.');
  return task;
}

module.exports = { startScheduler, runPipeline };
