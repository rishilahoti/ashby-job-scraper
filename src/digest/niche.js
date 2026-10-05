const { matchesWord } = require('../intelligence/rules-engine');

// Which corner of software development a job is in, for the daily digest's
// LinkedIn jobs post. Decided by the title: descriptions mention every
// buzzword. Team/department only refine a generic title ("Software Engineer"
// on the "Infrastructure" team).

// Insertion order is priority, first match wins: narrower niches go before
// broader ones ("React Native" is mobile not frontend, "ML Platform" is AI not
// DevOps, "Data Infrastructure" is data not DevOps, "Cloud Security" is
// security not DevOps).
const NICHES = {
  ai: ['ai', 'ml', 'machine learning', 'deep learning', 'llm', 'llms', 'genai', 'generative ai', 'nlp', 'computer vision', 'mlops', 'applied scientist', 'research scientist', 'research engineer'],
  fullstack: ['full stack', 'full-stack', 'fullstack'],
  mobile: ['mobile', 'ios', 'android', 'react native', 'flutter'],
  frontend: ['frontend', 'front-end', 'front end', 'ui engineer', 'web engineer', 'design engineer', 'react'],
  backend: ['backend', 'back-end', 'back end', 'api engineer', 'distributed systems'],
  data: ['data engineer', 'data engineering', 'analytics engineer', 'data scientist', 'data science', 'data platform', 'data infrastructure'],
  security: ['security', 'appsec', 'infosec', 'cybersecurity', 'devsecops'],
  devops: ['devops', 'sre', 'site reliability', 'reliability', 'infrastructure', 'infra', 'platform engineer', 'platform engineering', 'cloud', 'kubernetes'],
  qa: ['qa', 'quality assurance', 'quality engineer', 'sdet', 'test engineer', 'test automation'],
  embedded: ['embedded', 'firmware'],
  web3: ['blockchain', 'web3', 'solidity', 'smart contract', 'smart contracts'],
};

const NICHE_LABELS = {
  ai: { emoji: '🤖', name: 'AI/ML' },
  fullstack: { emoji: '🧩', name: 'Full-stack' },
  mobile: { emoji: '📱', name: 'Mobile' },
  frontend: { emoji: '🎨', name: 'Frontend' },
  backend: { emoji: '⚙️', name: 'Backend' },
  data: { emoji: '📊', name: 'Data' },
  security: { emoji: '🔐', name: 'Security' },
  devops: { emoji: '☁️', name: 'DevOps/SRE' },
  qa: { emoji: '🧪', name: 'QA' },
  embedded: { emoji: '🔌', name: 'Embedded' },
  web3: { emoji: '⛓️', name: 'Web3' },
  software: { emoji: '💻', name: 'Software' },
};

// Enough to count as a software role when no niche matched. Not a bare
// "engineer": "Lighting and AV Engineer" and "QAQC Engineer" are construction.
const DEV_TITLE = /\b(software|developer|programmer|swe|sde|founding engineer|product engineer|forward deployed engineer|member of technical staff|engineering manager)\b/i;

// Not software development even when the title says "engineer" or "AI"
// (Sales Engineer, Hardware Engineer, AI Trainer, AI Product Manager).
// ponytail: a hand-kept word list; misses rare titles, add words as they show up.
const NON_DEV_TITLE = /\b(sales|accounts?|customer|support|success|solutions?|field|presales|partners?|partnerships|alliances|business|implementation|onboarding|consultant|marketing|recruit\w*|talent|people|hr|finance|legal|counsel|compliance|policy|officer|operations|analyst|specialist|mechanical|electrical|civil|construction|bridges?|tunnels?|highways?|geotechnical|resident engineer|site engineer|chemical|manufacturing|process|hardware|structural|biomedical|clinical|network|technician|designer|product manager|program manager|project manager|trainer|tutor|annotator|rater|writer|advocate|relations|evangelist)\b/i;

// A niche word alone isn't a role: "Strategic Foresight & AI Agents" interns,
// "Cloud Alliances Manager" and "Security Officer" all contain one. The title
// must also name a technical role.
const ROLE_WORD = /\b(engineer|engineering|developer|programmer|scientist|researcher|architect|sre|devops|swe|sde|sdet|qa|tester)\b/i;

function nicheIn(text) {
  for (const [niche, terms] of Object.entries(NICHES)) {
    if (terms.some((term) => matchesWord(text, term))) return niche;
  }
  return null;
}

// A NICHES key, 'software' for a generic software title, or null when the job
// isn't software development at all.
function classifyNiche({ title, team, department }) {
  if (!title || NON_DEV_TITLE.test(title)) return null;
  const devTitle = DEV_TITLE.test(title);
  const fromTitle = devTitle || ROLE_WORD.test(title) ? nicheIn(title) : null;
  if (fromTitle) return fromTitle;
  if (!devTitle) return null;
  return nicheIn(`${team || ''} ${department || ''}`) || 'software';
}

module.exports = { classifyNiche, NICHE_LABELS };
