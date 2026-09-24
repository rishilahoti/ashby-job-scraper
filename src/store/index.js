const { getPool, initDb, canonicalizeJobLocations, closeDb } = require('./db');
const companies = require('./companies');
const jobs = require('./jobs');

module.exports = {
  getPool,
  initDb,
  canonicalizeJobLocations,
  closeDb,
  ...companies,
  ...jobs,
};
