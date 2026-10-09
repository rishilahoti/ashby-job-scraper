const rules = require('../config/rules.json');
const { classifyNiche } = require('../intelligence/rules-engine');

// Display names and LinkedIn hashtags for rules.json's "niches", plus
// 'software': a software title that matched none of them.
const NICHE_LABELS = {
  ai: { emoji: '🤖', name: 'AI/ML', tags: ['#AI', '#MachineLearning'] },
  fullstack: { emoji: '🧩', name: 'Full-stack', tags: ['#FullStack', '#WebDevelopment'] },
  mobile: { emoji: '📱', name: 'Mobile', tags: ['#MobileDevelopment', '#AppDevelopment'] },
  frontend: { emoji: '🎨', name: 'Frontend', tags: ['#Frontend', '#WebDevelopment'] },
  backend: { emoji: '⚙️', name: 'Backend', tags: ['#Backend', '#APIs'] },
  data: { emoji: '📊', name: 'Data', tags: ['#DataEngineering', '#DataScience'] },
  security: { emoji: '🔐', name: 'Security', tags: ['#CyberSecurity', '#InfoSec'] },
  devops: { emoji: '☁️', name: 'DevOps/SRE', tags: ['#DevOps', '#SRE'] },
  qa: { emoji: '🧪', name: 'QA', tags: ['#SoftwareTesting', '#QA'] },
  embedded: { emoji: '🔌', name: 'Embedded', tags: ['#EmbeddedSystems', '#Firmware'] },
  web3: { emoji: '⛓️', name: 'Web3', tags: ['#Web3', '#Blockchain'] },
  software: { emoji: '💻', name: 'Software', tags: ['#SoftwareEngineering'] },
};

module.exports = { classifyNiche: (job) => classifyNiche(job, rules), NICHE_LABELS };
