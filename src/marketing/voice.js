// Catches the patterns people spot as machine writing, in posts and cold
// emails alike. A regex can't prove a draft is good, but a draft that trips
// this never goes out.
const WORDS = /\b(leverag\w*|utili[sz]\w*|robust|seamless\w*|cutting[- ]edge|game[- ]?chang\w*|unlock\w*|delv\w*|landscape|journey|elevat\w*|empower\w*|streamlin\w*|revolution\w*|testament|foster\w*|pivotal|harness\w*|supercharg\w*|tapestry|realm|synerg\w*|holistic|paradigm|bespoke|best[- ]in[- ]class|world[- ]class|next[- ]level|thrilled|humbled|moreover|furthermore|additionally|crucial|vital|imperative|effortless\w*|stunning|meticulous\w*|nuanced|ever[- ]evolving|fast[- ]paced)\b/i;

const PHRASES = /\b(in today'?s|in the world of|when it comes to|at the end of the day|here'?s (the thing|why|what|how)|here is (why|what|how)|let that sink in|read that again|the best part|what if i told you|imagine (a|if|this)|picture this|stop scrolling|hot take|unpopular opinion|nobody talks about|no one talks about|the secret to|the truth is|the reality is|in conclusion|to sum up|key takeaway|takes? it to|more than just|not just|isn'?t just|it'?s about|i hope this|i came across|quick question|just checking|circle back|touch base|reach out|excited to|proud to|happy to announce|dive (in|into|deep)|deep dive|look no further|whether you'?re|from .{3,30} to .{3,30}, (we|i|our))\b/i;

const CHECKS = [
  [/[—–]/, 'a long dash'],
  [/\p{Extended_Pictographic}|[→↳]/u, 'an emoji or arrow'],
  [/\*\*|^#{1,6} /m, 'markdown'],
  // "It isn't X. It's Y." and "not X but Y".
  [/\b(isn'?t|aren'?t|wasn'?t|not)\b[^.!?\n]{0,70}[.,;:]\s*(it'?s|they'?re|that'?s|but)\b/i, 'the "not X, but Y" pattern'],
  [/\bnot\b[^.!?\n]{1,50}\bbut\b/i, 'the "not X, but Y" pattern'],
  // "No studio. No models. No reshoots."
  [/\b(no|zero|without) \w+[.,] +(no|zero|without) \w+[.,]/i, 'stacked "no X. no Y."'],
  // "The result?" answered in the next breath.
  [/\b(the|my|our) (result|catch|twist|kicker|problem|best part|truth|secret|reality|answer|fix|lesson|outcome)\?/i, 'a one-word rhetorical question'],
];

const numbersIn = (s) => (s.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, ''));

// Reason a draft sounds machine-written, or null when it doesn't.
function voiceProblem(text) {
  const word = text.match(WORDS);
  if (word) return `the word "${word[0]}"`;
  const phrase = text.match(PHRASES);
  if (phrase) return `the phrase "${phrase[0]}"`;
  for (const [pattern, name] of CHECKS) if (pattern.test(text)) return name;
  // One short sentence per line, all the way down.
  const paragraphs = text.split(/\n+/).filter((l) => l.trim());
  const short = paragraphs.filter((l) => l.split(/\s+/).length <= 9).length;
  if (paragraphs.length >= 6 && short / paragraphs.length > 0.6) return 'too many one-line fragments';
  return null;
}

// The first number in `text` that isn't in `source`, or null. Small counting
// words ("2 photos") still have to be real, so nothing is exempt.
function inventedNumber(text, source) {
  const allowed = new Set(numbersIn(source));
  return numbersIn(text).find((n) => !allowed.has(n)) ?? null;
}

module.exports = { voiceProblem, inventedNumber };
