const { contentHash } = require('../../utils');
const { sanitizeUrl, sanitizeDescription, decodeHtmlEntities, normalizeLocation } = require('../shared');

// One <tag>…</tag> of a posting from {slug}.jobs.personio.de/xml, CDATA unwrapped.
// ponytail: regex over Personio's flat, machine-written feed, not a real XML
// parser; switch to one if the feed ever nests tags with the same name deeper.
function tag(xml, name) {
  const value = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1];
  if (value == null) return null;
  const cdata = value.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (cdata ? cdata[1] : decodeHtmlEntities(value)).trim() || null;
}

// The feed splits a description into named sections ("Your mission", ...).
function description(xml) {
  const sections = xml.match(/<jobDescription>[\s\S]*?<\/jobDescription>/g) ?? [];
  const html = sections.map((s) => `${tag(s, 'name') ?? ''}\n${tag(s, 'value') ?? ''}`).join('\n\n');
  return sanitizeDescription(html) || null;
}

// raw = { posting: '<position>…</position>', slug } (see fetch/client.js).
function normalizeJob(raw, company) {
  const xml = raw?.posting ?? '';
  // The posting's own fields, minus <jobDescriptions>, whose sections have
  // <name>s of their own.
  const head = xml.replace(/<jobDescriptions>[\s\S]*?<\/jobDescriptions>/, '');
  const jobId = tag(head, 'id');
  if (!jobId) return null;

  const title = tag(head, 'name') || 'Untitled';
  const office = tag(head, 'office');
  const normalizedLocation = normalizeLocation(office);
  const department = tag(head, 'department');
  const employmentType = [tag(head, 'employmentType'), tag(head, 'schedule')].filter(Boolean).join(', ') || null;
  const text = description(xml);
  const createdAt = tag(head, 'createdAt');
  const url = sanitizeUrl(`https://${raw.slug}.jobs.personio.de/job/${jobId}`);

  return {
    jobId,
    company,
    source: 'personio',
    title,
    location: normalizedLocation.location,
    team: null,
    department,
    employmentType,
    remote: normalizedLocation.remote,
    description: text,
    applyUrl: url,
    jobUrl: url,
    publishedAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
    scrapedAt: new Date().toISOString(),
    compensationSummary: null,
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    compensationInterval: null,
    contentHash: contentHash(title, normalizedLocation.location, text, employmentType, String(normalizedLocation.remote), department),
  };
}

// A posting can arrive twice (default-language and English feeds, see
// fetch/client.js): keep one per id, preferring the copy with a description.
function filterRaw(rawJobs) {
  const byId = new Map();
  for (const raw of rawJobs) {
    const id = tag(raw?.posting ?? '', 'id');
    if (!id) continue;
    if (!byId.has(id) || (!description(byId.get(id).posting) && description(raw.posting))) byId.set(id, raw);
  }
  return [...byId.values()];
}

module.exports = { normalizeJob, filterRaw };
