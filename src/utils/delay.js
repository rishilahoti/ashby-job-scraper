const { setTimeout: delay } = require('node:timers/promises');

function jitteredDelay(minMs, maxMs) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return delay(ms);
}

// Rejects when `promise` hasn't settled within `ms`. A fetch's own abort signal
// isn't enough: on 2026-10-09 a request never settled although its signal had
// fired and its socket was gone, and the nightly run, its cleanup and the
// digest waited on it for three hours. A plain timer always ends the wait.
function timeLimit(promise, ms) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no response within ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

module.exports = { delay, jitteredDelay, timeLimit };
