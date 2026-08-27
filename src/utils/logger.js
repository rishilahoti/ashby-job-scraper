const { styleText } = require('node:util');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function setLevel(level) {
  currentLevel = LEVELS[level] ?? LEVELS.info;
}

function timestamp() {
  return new Date().toISOString();
}

function debug(...args) {
  if (currentLevel <= LEVELS.debug) {
    console.log(styleText('gray', `[${timestamp()}] [DEBUG]`), ...args);
  }
}

function info(...args) {
  if (currentLevel <= LEVELS.info) {
    console.log(styleText('blue', `[${timestamp()}] [INFO]`), ...args);
  }
}

function warn(...args) {
  if (currentLevel <= LEVELS.warn) {
    console.warn(styleText('yellow', `[${timestamp()}] [WARN]`), ...args);
  }
}

function error(...args) {
  if (currentLevel <= LEVELS.error) {
    console.error(styleText('red', `[${timestamp()}] [ERROR]`), ...args);
  }
}

module.exports = { debug, info, warn, error, setLevel };
