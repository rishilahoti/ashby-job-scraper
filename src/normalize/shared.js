const sanitizeHtml = require('sanitize-html');

function sanitizeDescription(html) {
  if (!html) return '';
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

// Greenhouse's `content` field comes back HTML-entity-encoded (e.g. "&lt;div&gt;"
// instead of "<div>") — decode once before sanitizing or the tags never get stripped.
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Normalizes ATS-specific pay period strings (Ashby: "1 YEAR", Lever:
// "per-hour-salary") down to schema.org JobPosting baseSalary unitText values.
function normalizeSalaryInterval(raw) {
  if (!raw) return null;
  const s = raw.toUpperCase();
  if (s.includes('HOUR')) return 'HOUR';
  if (s.includes('DAY')) return 'DAY';
  if (s.includes('WEEK')) return 'WEEK';
  if (s.includes('MONTH')) return 'MONTH';
  if (s.includes('YEAR')) return 'YEAR';
  return null;
}

// ATS fields are free text on their end — reject anything but http(s) so a
// malicious `javascript:` URL never reaches a rendered <a href>.
function sanitizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

module.exports = { sanitizeDescription, decodeHtmlEntities, normalizeSalaryInterval, sanitizeUrl };
