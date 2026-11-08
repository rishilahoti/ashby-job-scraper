// One JSON call, three free models: Gemini writes best, and each fallback only
// runs when the one before is overloaded or out of quota. The keys are free
// tier, so hitting a limit fails the call instead of billing.
const { askGroq } = require('../digest/writer');
const { timeLimit, delay } = require('../utils');

const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash'];

async function askGemini(key, system, user, model = GEMINI_MODELS[0]) {
  const res = await timeLimit(fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9 },
    }),
    signal: AbortSignal.timeout(60000),
  }), 60000);
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await timeLimit(res.text(), 10000)).slice(0, 200)}`);
  const body = await timeLimit(res.json(), 60000);
  return JSON.parse(body.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '');
}

// The first model that answers. A rate limit waits a minute before Groq, whose
// free tier allows 8,000 tokens a minute.
async function writeJson(system, user) {
  const key = process.env.GEMINI_API_KEY;
  let lastError = new Error('GEMINI_API_KEY isn\'t set');
  if (key) {
    for (const model of GEMINI_MODELS) {
      try {
        return await askGemini(key, system, user, model);
      } catch (err) {
        lastError = err;
      }
    }
  }
  if (!process.env.GROQ_API_KEY) throw lastError;
  try {
    return await askGroq(process.env.GROQ_API_KEY, system, user);
  } catch (err) {
    if (/HTTP 429/.test(err.message)) await delay(65000);
    throw err;
  }
}

module.exports = { writeJson, askGemini };
