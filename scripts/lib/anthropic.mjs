// Minimal Anthropic Messages API client (Node 20+ fetch, no dependencies).
// Key from ANTHROPIC_API_KEY. ANTHROPIC_BASE_URL can point at a local test
// server (see scripts/test).

const VERSION = '2023-06-01';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Cost guard: at most MAX_API_CALLS_PER_RUN calls per process (set by
// generate.mjs from content/site.json or the environment). Retries of the
// same call are not counted twice.
let callsMade = 0;
let callBudget = Infinity;
export function setCallBudget(n) { callBudget = n; }
export function callsUsed() { return callsMade; }
export class BudgetError extends Error {}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function complete({ model, system, user, maxTokens = 8000, retries = 4 }) {
  const key = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) throw new ApiError('ANTHROPIC_API_KEY er ikke satt', 0);
  if (callsMade >= callBudget) throw new BudgetError(`kostnadsgrensen er nådd (${callBudget} API-kall per kjøring)`);
  callsMade += 1;
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  for (let attempt = 0; ; attempt += 1) {
    let res;
    try {
      res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': VERSION },
        body,
        signal: AbortSignal.timeout(300_000),
      });
    } catch (e) {
      if (attempt < retries) { await sleep(2000 * 2 ** attempt); continue; }
      throw new ApiError(`nettverksfeil mot Anthropic: ${e.name}`, 0);
    }
    if (res.ok) {
      const data = await res.json();
      const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      if (data.stop_reason === 'max_tokens') throw new ApiError('svaret ble kuttet (max_tokens)', 200);
      return { text, usage: data.usage || {} };
    }
    // Never echo the request (it would contain the key header); the error
    // body from the API has no secrets.
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 3000 * 2 ** attempt;
      await sleep(Math.min(wait, 60_000));
      continue;
    }
    throw new ApiError(`Anthropic svarte ${res.status}: ${detail}`, res.status);
  }
}

// The first JSON object in a model answer (tolerates ```json fences).
export function extractJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const src = fenced ? fenced[1] : text;
  const start = src.indexOf('{');
  const end = src.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('fant ikke JSON i svaret');
  return JSON.parse(src.slice(start, end + 1));
}
