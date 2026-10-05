const rules = require('../config/rules.json');
const { classifyNiche } = require('../intelligence/rules-engine');

// Display names for rules.json's "niches", plus 'software': a software title
// that matched none of them.
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

module.exports = { classifyNiche: (job) => classifyNiche(job, rules), NICHE_LABELS };
