const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const config = require('../src/config');
const { fetchJobBoard, FetchError } = require('../src/fetch/client');

// Tests hit a local server instead of the real ATS APIs — swap the configured
// baseUrl for the duration of each test, restore after.
async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withAshbyBaseUrl(baseUrl, run) {
  const original = config.fetch.sources.ashby.baseUrl;
  config.fetch.sources.ashby.baseUrl = baseUrl;
  try {
    await run();
  } finally {
    config.fetch.sources.ashby.baseUrl = original;
  }
}

test('fetchJobBoard parses an ashby-shaped { jobs: [...] } response', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jobs: [{ id: 1 }, { id: 2 }] }));
    },
    (baseUrl) =>
      withAshbyBaseUrl(baseUrl, async () => {
        const { jobs } = await fetchJobBoard('acme', 'ashby');
        assert.equal(jobs.length, 2);
      })
  );
});

test('fetchJobBoard sends includeCompensation query param for ashby', async () => {
  let receivedQuery;
  await withServer(
    (req, res) => {
      receivedQuery = new URL(req.url, 'http://x').search;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jobs: [] }));
    },
    (baseUrl) =>
      withAshbyBaseUrl(baseUrl, async () => {
        await fetchJobBoard('acme', 'ashby');
        assert.match(receivedQuery, /includeCompensation=true/);
      })
  );
});

test('fetchJobBoard retries on 5xx and succeeds once the server recovers', async () => {
  let attempts = 0;
  await withServer(
    (req, res) => {
      attempts++;
      if (attempts < 3) {
        res.writeHead(500);
        res.end('boom');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jobs: [{ id: 1 }] }));
    },
    (baseUrl) =>
      withAshbyBaseUrl(baseUrl, async () => {
        const originalRetryBaseMs = config.fetch.retryBaseMs;
        config.fetch.retryBaseMs = 5; // keep the test fast
        try {
          const { jobs } = await fetchJobBoard('acme', 'ashby');
          assert.equal(attempts, 3);
          assert.equal(jobs.length, 1);
        } finally {
          config.fetch.retryBaseMs = originalRetryBaseMs;
        }
      })
  );
});

test('fetchJobBoard throws without retrying on a 404', async () => {
  let attempts = 0;
  await withServer(
    (req, res) => {
      attempts++;
      res.writeHead(404);
      res.end('not found');
    },
    (baseUrl) =>
      withAshbyBaseUrl(baseUrl, async () => {
        await assert.rejects(() => fetchJobBoard('acme', 'ashby'), FetchError);
        assert.equal(attempts, 1);
      })
  );
});

test('fetchJobBoard throws when the response shape is invalid', async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ notJobs: [] }));
    },
    (baseUrl) =>
      withAshbyBaseUrl(baseUrl, async () => {
        await assert.rejects(() => fetchJobBoard('acme', 'ashby'), FetchError);
      })
  );
});

test('fetchJobBoard throws FetchError for an unknown source', async () => {
  await assert.rejects(() => fetchJobBoard('acme', 'bogus'), FetchError);
});
