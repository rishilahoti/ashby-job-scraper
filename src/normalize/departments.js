// Sorts every job into one of a short list of departments the feed can filter
// on, instead of the thousands of free-text names ATSs return ("Eng -
// Platform", "GTM", "People Ops", "Vertrieb") — or don't return at all, like
// Greenhouse. Pure like rules-engine.js: the scraper stores the group in
// jobs.department_group, and the web app lists the names.

// Bump when GROUPS changes: the scraper then regroups every stored job (the
// version is part of rescoreJobsIfRulesChanged's rules hash).
const DEPARTMENT_RULES_VERSION = 1;

// First match wins, so qualifiers come before the broad groups they'd
// otherwise fall into: "Technical Recruiter" is People, "Sales Engineer" is
// Sales, "Product Designer" is Design, and Operations goes last. Product
// managers come first of all: "AI Product Manager" is still Product. `weak`
// words only count when nothing matched a `strong` one: a "Growth" team is
// Marketing, but "Growth Engineering" is Engineering.
// ponytail: hand-kept word lists; add words as unmatched departments show up.
const GROUPS = [
  { name: 'Product', strong: /\b(product (manag(er|ers|ement)|owners?|leads?|directors?)|head of product|(vp|director|chief) (of )?product)\b/i },
  { name: 'People & HR', strong: /\b(people|hr|hris|human resources?|ressources humaines|recursos humanos|recruit(ing|er|ers|ment)?|talent(?! (pool|community|network|pipeline|hub))|total rewards|learning (and|&) development|employee experience)\b/i },
  { name: 'Legal & Compliance', strong: /\b(legal|counsel|attorneys?|lawyers?|paralegal|compliance|regulatory|privacy|policy|government (affairs|relations)|risk|trust (and|&) safety|aml|kyc)\b/i },
  { name: 'Finance', strong: /\b(finance|financial|finanzen|finanzas|accounting|accountants?|buchhaltung|comptabilité|fp&a|tax|treasury|controller|bookkeep(er|ing)|audit(or|ing)?|billing|payroll|investor relations|credit)\b/i },
  { name: 'Security', strong: [/\bSOC\b/, /\b(security|infosec|cyber ?security|appsec|grc)\b/i] },
  { name: 'IT', strong: [/\bIT\b/, /\b(information technology|informatik|informatique|help ?desk|service desk|desktop support|sysadmin|system administrat(or|ion)|corporate (systems|technology))\b/i] },
  { name: 'Hardware & Manufacturing', strong: /\b(hardware|mechanical|electrical|electronics?|manufacturing|assembly|fabrication|machinist|asic|fpga|silicon|semiconductors?|rtl|pcb|analog|mixed[- ]signal|physical design|design verification|data cent(er|re))\b/i },
  { name: 'Design', strong: /\b(design(er|ers)?|ux|user experience|user research|creative|illustrat(or|ion)|graphic|animat(or|ion)|art direct(or|ion))\b/i },
  { name: 'Data & AI', strong: [/\bAI\b/, /\b(data|analytics|machine learning|ml|deep learning|artificial intelligence|llms?|nlp|computer vision|business intelligence|bi)\b/i] },
  { name: 'Customer Success & Support', strong: /\b(customer|clients?|kundenservice|kundendienst|service client|support|success|cx|onboarding|implementation|professional services|technical account manag(er|ers|ement))\b/i },
  { name: 'Sales', strong: /\b(sales|vertrieb|ventes|verkoop|ventas|vendas|account executives?|account manag(er|ers|ement)|business development|bdr|sdr|go[- ]to[- ]market|gtm|revenue|partnerships?|channel|alliances|solutions? (engineer(s|ing)?|consult(ant|ants|ing)|architects?)|pre-?sales|commercial)\b/i },
  { name: 'Marketing', strong: /\b(marketing|brand|content|communications?|comms|pr|public relations|seo|social media|events?|community|developer relations|devrel|demand gen(eration)?|copywrit(er|ing)|editorial)\b/i, weak: /\b(growth|media)\b/i },
  { name: 'Product', strong: /\b(products?|produkt|produit|producto)\b/i },
  { name: 'Healthcare', strong: /\b(clinical|clinicians?|medical|nurs(e|es|ing)|pflege|physicians?|doctors?|health ?care|patients?|pharmac(y|ist|ists)|therap(y|ist|ists)|dental|behavioral health|psychiatr(y|ist|ic)|psycholog(y|ist))\b/i },
  { name: 'Research & Science', strong: /\b(research|researchers?|science|scientists?|laboratory|biology|chemistry|physics|bioinformatics)\b/i },
  { name: 'Engineering', strong: /\b(engineer(s|ing)?|ingenieur(e|in)?|ingénierie|developers?|development|entwicklung|développement|ontwikkeling|desarrollo|desenvolvimento|software|swe|sde|programm(er|ers|ing)|devops|sre|site reliability|infrastructure|platform|backend|back-end|front-?end|full[- ]?stack|mobile|ios|android|web|qa|quality assurance|test(ers?|ing)?|automation|cloud|systems|architect(s|ure)?|firmware|embedded|database|dba|tech lead|member of technical staff|mts)\b/i, weak: /\b(technology|tech|r&d|research (and|&) development|digital|innovation)\b/i },
  { name: 'Operations', strong: /\b(operations|ops|bizops|strategy|supply chain|logistics|logistik|logistique|procurement|purchasing|facilities|workplace|office|admin|administrat(ive|ion|or)|executive assistants?|chief of staff|program manag(er|ers|ement)|project manag(er|ers|ement)|business analysts?|fulfil?ment|warehouse|inventory|real estate|g&a)\b/i },
];

const DEPARTMENT_GROUPS = [...new Set(GROUPS.map((g) => g.name)), 'Other'];

const matches = (pattern, text) => [].concat(pattern).some((re) => re.test(text));

function groupFor(text, kind) {
  return text ? GROUPS.find((g) => g[kind] && matches(g[kind], text))?.name : undefined;
}

// The title names the role, so it decides when it can: first its leading part
// ("Software Engineer" in "Software Engineer, Payments Risk" — the rest names
// a domain, not the job), then all of it. The department and team cover
// titles like "Associate" or "Coordinator".
function departmentGroup(department, team, title) {
  const role = title?.split(/\s[-–—|]\s|[,(:|]/)[0];
  for (const text of [role, title, department, team]) {
    const group = groupFor(text, 'strong');
    if (group) return group;
  }
  return [title, department, team].map((text) => groupFor(text, 'weak')).find(Boolean) ?? 'Other';
}

module.exports = { departmentGroup, DEPARTMENT_GROUPS, DEPARTMENT_RULES_VERSION };
