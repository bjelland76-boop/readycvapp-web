// Opens every external link and reports the ones that don't work.
//   - no answer, DNS error, 404/410 or 5xx            -> problem (link is dead)
//   - redirect to ANOTHER host (www. ignored)          -> problem: use the final address
//   - 401/403/429 (bot protection such as Cloudflare)  -> accepted; real browsers get in
// Results are cached per run. Set CONTENT_SKIP_LINKCHECK=1 to skip (tests, offline).

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const cache = new Map();

export function linkCheckEnabled() {
  return !['1', 'true', 'yes'].includes(String(process.env.CONTENT_SKIP_LINKCHECK || '').toLowerCase());
}

const bareHost = (u) => new URL(u).hostname.replace(/^www\./, '');

async function fetchOnce(url) {
  return fetch(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,*/*' }, signal: AbortSignal.timeout(20_000) });
}

// null if fine, else a problem (string, Norwegian).
export async function checkUrl(url) {
  if (cache.has(url)) return cache.get(url);
  let result = null;
  let res = null;
  for (let attempt = 0; attempt < 2 && !res; attempt += 1) {
    try {
      const r = await fetchOnce(url);
      if (r.status >= 500 && attempt === 0) { await r.body?.cancel(); continue; }
      res = r;
    } catch (e) {
      if (attempt === 1) result = `lenken svarer ikke (${e.cause?.code || e.name}): ${url}`;
    }
  }
  if (res) {
    await res.body?.cancel();
    if ([401, 403, 429].includes(res.status)) result = null; // bot protection; opens in a browser
    else if (res.status === 404 || res.status === 410) result = `lenken finnes ikke (${res.status}): ${url}`;
    else if (res.status >= 400) result = `lenken gir feil ${res.status}: ${url}`;
    else if (bareHost(res.url) !== bareHost(url)) result = `lenken videresender til en annen adresse (${res.url}); bruk den i stedet: ${url}`;
  }
  cache.set(url, result);
  return result;
}

export async function checkUrls(urls) {
  const unique = [...new Set(urls)];
  const out = await Promise.all(unique.map((u) => checkUrl(u)));
  return out.filter(Boolean);
}
