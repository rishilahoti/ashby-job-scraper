const { setTimeout: delay } = require('node:timers/promises');

function jitteredDelay(minMs, maxMs) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return delay(ms);
}

module.exports = { delay, jitteredDelay };
