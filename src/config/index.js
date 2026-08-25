const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const rules = require('./rules.json');

const config = {
  schedule: {
    cron: process.env.CRON_SCHEDULE || '0 */12 * * *',
    defaultFrequencyHours: parseInt(process.env.DEFAULT_FREQUENCY_HOURS, 10) || 12,
    jitterMaxMinutes: parseInt(process.env.JITTER_MAX_MINUTES, 10) || 5,
  },

  db: {
    // DATABASE_URLS: comma-separated, priority order (primary first). Falls back to
    // single DATABASE_URL when unset — existing single-DB setups need no changes.
    urls: (process.env.DATABASE_URLS || process.env.DATABASE_URL || '')
      .split(',')
      .map(u => u.trim())
      .filter(Boolean),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  fetch: {
    sources: {
      ashby: { baseUrl: 'https://api.ashbyhq.com/posting-api/job-board' },
      lever: { baseUrl: 'https://api.lever.co/v0/postings' },
      greenhouse: { baseUrl: 'https://boards-api.greenhouse.io/v1/boards' },
    },
    includeCompensation: true,
    maxRetries: 3,
    retryBaseMs: 1000,
    delayBetweenCompaniesMin: 2000,
    delayBetweenCompaniesMax: 10000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  },

  intelligence: {
    rules,
    minScore: parseInt(process.env.MIN_RELEVANCE_SCORE, 10) || rules.minScore || 5,
  },

  notify: {
    cli: process.env.ENABLE_CLI_OUTPUT !== 'false',
    markdown: process.env.ENABLE_MARKDOWN_REPORT !== 'false',
    reportsDir: process.env.REPORTS_DIR || './reports',
  },
};

module.exports = config;
