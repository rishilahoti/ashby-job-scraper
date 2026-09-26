// Pure SQL-fragment builders for job search — split out of query.ts (which
// pulls in next/cache) so this logic is importable from a plain node:test
// file without a Next.js runtime.

export type SqlParam = string | number | boolean | string[];

export function pushParam(params: SqlParam[], value: SqlParam): string {
  params.push(value);
  return `$${params.length}`;
}

// Postgres's two-letter english stopwords (share/tsearch_data/english.stop).
const SHORT_STOPWORDS = new Set([
  "me", "my", "we", "he", "it", "am", "is", "be", "do", "an", "if",
  "or", "as", "of", "at", "by", "to", "up", "in", "on", "no", "so",
]);

// Only the terms FTS actually loses: `+`/`#` are dropped during tokenization
// (so "C++", "C#", and "C" all collapse to the same "c" lexeme — tokenizer
// behavior, not fixed by switching dictionaries), and an all-caps acronym
// spelled like a stopword ("IT") is dropped outright. Lowercase "it" is
// presumably the pronoun, so only the caps form counts. Everything else —
// "AI", "UK", "front-end", "Engineer," — stays on FTS, which also searches
// description/location and ignores punctuation.
export function isSpecialTerm(raw: string): boolean {
  if (/[+#]/.test(raw)) return true;
  return /^[A-Z]$/.test(raw) || (/^[A-Z]{2}$/.test(raw) && SHORT_STOPWORDS.has(raw.toLowerCase()));
}

// Documents are indexed with dotted compound words split ("Node.js" ->
// "node" "js", split_compound_words in src/store/db.js); queries must be
// split the same way or "Node.js" would look for a lexeme no row has.
export function tsquerySql(params: SqlParam[], text: string): string {
  return `websearch_to_tsquery('english', split_compound_words(${pushParam(params, text)}))`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// `~*` word-boundary match, not ILIKE '%term%': ILIKE would let bare "C"
// match "Customer", "IT" match "Editor", etc. Boundary excludes only `+`/`#`
// (the characters that make "C++"/"C#" distinct terms in the first place) —
// a plain period still counts as a boundary, so this doesn't need to know
// about the title/search_tsv "Node.js" -> "node"+"js" split (src/store/db.js).
function titleWordBoundarySql(params: SqlParam[], term: string): string {
  const boundary = "[^a-zA-Z0-9+#]";
  const pattern = `(^|${boundary})${escapeRegex(term)}($|${boundary})`;
  return `title ~* ${pushParam(params, pattern)}`;
}

// Splits the search box text into FTS-friendly terms and fallback terms,
// combining "title must literally contain X" (fallback) with "full-text
// match on the rest" (AND) rather than replacing one with the other, so
// e.g. "Director of IT" still requires both "director" and literal "IT".
// Left alone (still goes straight through websearch_to_tsquery) when the
// query uses websearch syntax ("phrase", -exclude, OR) — splitting on
// whitespace would mangle that.
export function buildSearchSql(params: SqlParam[], search: string): string {
  if (search.includes('"') || /(^|\s)(-|OR\b)/.test(search)) {
    return `id IN (SELECT job_search_ids(${tsquerySql(params, search)}))`;
  }

  const terms = search.split(/\s+/).filter(Boolean);
  const clauses = terms
    .filter((t) => isSpecialTerm(t))
    .map((t) => titleWordBoundarySql(params, t));

  const ftsTerms = terms.filter((t) => !isSpecialTerm(t));
  if (ftsTerms.length > 0) {
    clauses.push(`id IN (SELECT job_search_ids(${tsquerySql(params, ftsTerms.join(" "))}))`);
  }

  return `(${clauses.join(" AND ")})`;
}
