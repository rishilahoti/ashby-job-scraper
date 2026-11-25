const http2 = require('node:http2');

// Workday sits behind Cloudflare, which answered HTTP 429 to every HTTP/1.1
// request from Node (fetch only speaks 1.1), even the first one to a board,
// and 200 to the same request over HTTP/2 (tested 2026-11-25 from the server).
// A fetch-shaped subset: { ok, status, body (async iterable), json() }.
// ponytail: one connection per request; reuse sessions per host if the TLS
// handshakes ever show up in scrape time.
/**
 * @param {string | URL} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string, signal?: AbortSignal }} [options]
 */
function fetchHttp2(url, { method = 'GET', headers = {}, body, signal } = {}) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const session = http2.connect(target.origin);
    session.on('error', reject);
    // No accept-encoding: http2 doesn't decompress, unlike fetch.
    const lowered = Object.fromEntries(
      Object.entries(headers)
        .map(([k, v]) => [k.toLowerCase(), v])
        .filter(([k]) => k !== 'accept-encoding')
    );
    const req = session.request({ ':method': method, ':path': target.pathname + target.search, ...lowered }, { signal });
    req.on('error', reject);
    req.on('close', () => session.close());
    req.on('response', (h) => {
      const status = h[':status'];
      resolve({
        ok: status >= 200 && status < 300,
        status,
        body: req,
        json: async () => {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          return JSON.parse(Buffer.concat(chunks).toString('utf8'));
        },
      });
    });
    req.end(body);
  });
}

module.exports = { fetchHttp2 };
