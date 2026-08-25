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

module.exports = { sanitizeDescription, decodeHtmlEntities };
