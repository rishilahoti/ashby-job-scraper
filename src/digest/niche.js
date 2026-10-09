const rules = require('../config/rules.json');
const { classifyNiche } = require('../intelligence/rules-engine');

// Display names and LinkedIn hashtags for rules.json's "niches", plus
// 'software': a software title that matched none of them.
const NICHE_LABELS = {
  ai: { emoji: '🤖', name: 'AI/ML', tag: '#MachineLearning' },
  fullstack: { emoji: '🧩', name: 'Full-stack', tag: '#FullStack' },
  mobile: { emoji: '📱', name: 'Mobile', tag: '#MobileDev' },
  frontend: { emoji: '🎨', name: 'Frontend', tag: '#Frontend' },
  backend: { emoji: '⚙️', name: 'Backend', tag: '#Backend' },
  data: { emoji: '📊', name: 'Data', tag: '#DataEngineering' },
  security: { emoji: '🔐', name: 'Security', tag: '#CyberSecurity' },
  devops: { emoji: '☁️', name: 'DevOps/SRE', tag: '#DevOps' },
  qa: { emoji: '🧪', name: 'QA', tag: '#SoftwareTesting' },
  embedded: { emoji: '🔌', name: 'Embedded', tag: '#EmbeddedSystems' },
  web3: { emoji: '⛓️', name: 'Web3', tag: '#Web3' },
  software: { emoji: '💻', name: 'Software', tag: '#SoftwareEngineering' },
};

module.exports = { classifyNiche: (job) => classifyNiche(job, rules), NICHE_LABELS };
