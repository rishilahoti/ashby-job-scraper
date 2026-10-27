const path = require('path');
try {
  process.loadEnvFile(path.resolve(__dirname, '../../.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const rules = require('./rules.json');

const config = {
  schedule: {
    cron: process.env.CRON_SCHEDULE || '0 0 * * *',
    jitterMaxMinutes: parseInt(process.env.JITTER_MAX_MINUTES, 10) || 5,
  },

  db: {
    url: (process.env.DATABASE_URL || '').trim(),
  },

  fetch: {
    sources: {
      ashby: { baseUrl: 'https://api.ashbyhq.com/posting-api/job-board' },
      lever: { baseUrl: 'https://api.lever.co/v0/postings' },
      greenhouse: { baseUrl: 'https://boards-api.greenhouse.io/v1/boards' },
      workable: { baseUrl: 'https://apply.workable.com/api/v1/widget/accounts' },
      smartrecruiters: { baseUrl: 'https://api.smartrecruiters.com/v1/companies' },
    },
    maxRetries: 3,
    retryBaseMs: 1000,
    timeoutMs: 30000,
    // The biggest real board (Bjak, ~34 MB) fits. A 109 MB Teamtailor feed
    // (Foveaassocies) ran the 1 GB VM out of heap on 2026-10-27, every restart.
    maxBodyBytes: 50 * 1024 * 1024,
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
