const { program } = require('commander');
// Before anything that loads the logger: it reads LOG_LEVEL from the .env this loads.
const config = require('./src/config');
const { logger } = require('./src/utils');

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
      // Runs on every container restart (each Watchtower redeploy), so it
      // only sends the digest when none went out today (see sendDailyDigest).
      await runPipeline();
    } catch (err) {
      logger.error(`Initial run failed: ${err.message}`);
    }
    startScheduler();
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
  .command('digest')
  .description('Email the daily digest now (everything since the last one), or preview it with --dry-run')
  .option('--hours <n>', 'look back N hours instead of to the last digest', (v) => parseInt(v, 10))
  .option('--dry-run', 'write the email to the reports folder instead of sending it')
  .action(async (options) => {
    const store = require('./src/store');
    const { runDigest } = require('./src/digest');
    try {
      // No initDb: the digest only reads, apart from recording when it was sent.
      const since = options.hours ? new Date(Date.now() - options.hours * 60 * 60 * 1000) : undefined;
      await runDigest(store.getPool(), { since, dryRun: !!options.dryRun });
    } catch (err) {
      logger.error(`Digest failed: ${err.message}`);
      process.exit(1);
    } finally {
      await store.closeDb();
    }
  });

program
  .command('outreach-collect')
  .description('Run the daily brand scrape now')
  .option('--target <n>', 'stop after this many new brands', (v) => parseInt(v, 10), 40)
  .option('--minutes <n>', 'stop after this long', (v) => parseInt(v, 10), 25)
  .action(async (options) => {
    const store = require('./src/store');
    const { collectBrands } = require('./src/outreach/stores');
    try {
      await store.initDb();
      await collectBrands(store.getPool(), options);
    } catch (err) {
      logger.error(`Brand scrape failed: ${err.message}`);
      process.exit(1);
    } finally {
      await store.closeDb();
    }
  });

program
  .command('outreach-preview')
  .description('Email yourself the sequence for the best few brands. Nobody else gets anything and nothing is recorded')
  .option('--count <n>', 'how many brands', (v) => parseInt(v, 10), 3)
  .action(async (options) => {
    const store = require('./src/store');
    const { previewTo } = require('./src/outreach');
    try {
      await previewTo(store.getPool(), process.env.DIGEST_EMAIL_TO || process.env.EMAIL_SERVER_USER, options.count);
    } catch (err) {
      logger.error(`Preview failed: ${err.message}`);
      process.exit(1);
    } finally {
      await store.closeDb();
    }
  });

program
  .command('marketing-preview')
  .description('Write today\'s posts and print them, without queueing or sending anything')
  .action(async () => {
    const store = require('./src/store');
    const { buildDay } = require('./src/marketing');
    try {
      console.log(JSON.stringify(await buildDay(store.getPool(), new Date(), { queue: false }), null, 2));
    } catch (err) {
      logger.error(`Preview failed: ${err.message}`);
      process.exit(1);
    } finally {
      await store.closeDb();
    }
  });

program
  .command('migrate')
  .description('Run one-time database backfills that don\'t run automatically on startup (currently: canonicalize existing job locations, resplit compound search terms), then re-score and regroup jobs if the rules changed')
  .action(async () => {
    const store = require('./src/store');
    try {
      await store.initDb();
      await store.canonicalizeJobLocations();
      await store.resplitCompoundSearchTerms();
      // The scraper does this on its next run too; doing it here fills new
      // columns (e.g. department_group) before a web deploy starts reading them.
      await store.rescoreJobsIfRulesChanged(config.intelligence.rules);
    } catch (err) {
      logger.error(`Migration failed: ${err.message}`);
      process.exit(1);
    } finally {
      await store.closeDb();
    }
  });

program
  .command('add <slug>')
  .description('Add a company to the source registry')
  .option('-n, --name <name>', 'Company display name')
  .option('-s, --source <source>', 'ATS source: ashby, lever, greenhouse, workable, recruitee, teamtailor, pinpoint, smartrecruiters, or workday', 'ashby')
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
  .description('Crawl Common Crawl for new company boards, verify against the live API, and add them')
  .requiredOption('-s, --source <source>', 'ashby, greenhouse, workable, smartrecruiters, recruitee, teamtailor, pinpoint, workday, or keka (Lever blocks Common Crawl\'s bot, so it isn\'t supported here)')
  .option('--cdx-limit <n>', 'max Common Crawl URLs to scan (path-based sources; subdomain sources read every page)', (v) => parseInt(v, 10), 3000)
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
