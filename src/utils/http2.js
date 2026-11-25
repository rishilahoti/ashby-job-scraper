const http2 = require('node:http2');

// Workday sits behind Cloudflare, which answered HTTP 429 to every HTTP/1.1
// request from Node (fetch only speaks 1.1), even the first one to a board,
// and 200 to the same request over HTTP/2 (tested 2026-11-25 from the server).
// A fetch-shaped subset: { ok, status, body (async iterable), json() }.

// One connection per host, reused for a board's pages (up to 10) instead of a
// TLS handshake per page; closed after IDLE_MS without requests.
const IDLE_MS = 10000;
const sessions = new Map();

function sessionFor(origin) {
  const open = sessions.get(origin);
  if (open && !open.closed && !open.destroyed) return open;
  const session = http2.connect(origin);
  sessions.set(origin, session);
  const forget = () => { if (sessions.get(origin) === session) sessions.delete(origin); };
  session.on('close', forget);
  session.on('error', forget);
  session.setTimeout(IDLE_MS, () => session.close());
  return session;
}

/**
 * @param {string | URL} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string, signal?: AbortSignal }} [options]
 */
function fetchHttp2(url, { method = 'GET', headers = {}, body, signal } = {}) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const session = sessionFor(target.origin);
    const onSessionError = (err) => reject(err);
    session.once('error', onSessionError);
    // No accept-encoding: http2 doesn't decompress, unlike fetch.
    const lowered = Object.fromEntries(
      Object.entries(headers)
        .map(([k, v]) => [k.toLowerCase(), v])
        .filter(([k]) => k !== 'accept-encoding')
    );
    const req = session.request({ ':method': method, ':path': target.pathname + target.search, ...lowered }, { signal });
    req.on('error', reject);
    req.on('close', () => session.off('error', onSessionError));
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
