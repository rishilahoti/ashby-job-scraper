const { program } = require('commander');
const config = require('./src/config');
const { logger } = require('./src/utils');

logger.setLevel(config.logging.level);

program
  .name('ashby-scraper')
  .description('AshbyHQ Job Scraper — track job listings and surface opportunities')
  .version('1.0.0');

program
  .command('run')
  .description('Run a single scrape cycle immediately')
  .action(async () => {
    const { runPipeline } = require('./src/scheduler/pipeline');
    try {
      await runPipeline();
    } catch (err) {
      logger.error(`Run failed: ${err.message}`);
      process.exit(1);
    } finally {
      const { closeDb } = require('./src/store');
      await closeDb();
    }
  });

program
  .command('start')
  .description('Start the cron-based scheduler')
  .action(async () => {
    const { startScheduler, runPipeline } = require('./src/scheduler');
    logger.info('Running initial scrape before starting scheduler...');
    try {
      await runPipeline();
    } catch (err) {
      logger.error(`Initial run failed: ${err.message}`);
    }
    startScheduler();
  });

program
  .command('migrate')
  .description('Apply pending database schema migrations (no scrape) — safe to run anytime, idempotent')
  .action(async () => {
    const store = require('./src/store');
    try {
      await store.initDb();
      logger.info('Migrations applied.');
    } catch (err) {
      logger.error(`Migration failed: ${err.message}`);
      process.exit(1);
    } finally {
      await store.closeDb();
    }
  });

program
  .command('report')
  .description('Generate a Markdown report from existing data')
  .action(async () => {
    const store = require('./src/store');
    const intelligence = require('./src/intelligence');
    const { generateReportFromDb } = require('./src/notify');
    try {
      await store.initDb();
      const reportPath = await generateReportFromDb(store, intelligence);
      logger.info(`Report generated: ${reportPath}`);
    } catch (err) {
      logger.error(`Report generation failed: ${err.message}`);
      process.exit(1);
    } finally {
      await store.closeDb();
    }
  });

program
  .command('add <slug>')
  .description('Add a company to the source registry')
  .option('-n, --name <name>', 'Company display name')
  .option('-s, --source <source>', 'ATS source: ashby, lever, or greenhouse', 'ashby')
  .action((slug, options) => {
    const { addCompany } = require('./src/sources');
    const success = addCompany(slug, options.name, options.source);
    if (success) {
      console.log(`Added "${options.name || slug}" (${slug}, ${options.source}) to registry.`);
    } else {
      console.log(`Company with slug "${slug}" already exists for source "${options.source}", or the input is invalid.`);
    }
  });

program
  .command('discover')
  .description('Crawl Common Crawl for new Ashby/Greenhouse company slugs, verify against the live API, and add them')
  .requiredOption('-s, --source <source>', 'ashby or greenhouse (Lever blocks Common Crawl\'s bot — not supported here)')
  .option('--cdx-limit <n>', 'max Common Crawl URLs to scan', (v) => parseInt(v, 10), 3000)
  .option('--verify-limit <n>', 'max new candidates to verify against the live API', (v) => parseInt(v, 10), 300)
  .option('--dry-run', 'print what would be added without writing to the database')
  .action(async (options) => {
    const { discoverCompanies } = require('./src/discovery');
    try {
      await discoverCompanies({
        source: options.source,
        cdxLimit: options.cdxLimit,
        verifyLimit: options.verifyLimit,
        dryRun: !!options.dryRun,
      });
    } catch (err) {
      logger.error(`Discovery failed: ${err.message}`);
      process.exit(1);
    } finally {
      const { closeDb } = require('./src/store');
      await closeDb();
    }
  });

program.parse();
