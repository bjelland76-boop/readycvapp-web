// Links from the articles to the web app always carry
//   utm_source=readycvapp & utm_medium=artikkel & utm_campaign=<article slug>
// so traffic per article can be seen. The web app ignores these parameters
// (it only reacts to Stripe's session_id).

export const UTM_SOURCE = 'readycvapp';
export const UTM_MEDIUM = 'artikkel';
export const CTA_MARKER = '<!-- cta -->';

export function appOrigin(site) {
  return new URL(site.appUrl).origin;
}

export function isAppUrl(url, site) {
  try { return new URL(url).origin === appOrigin(site); } catch { return false; }
}

// The app URL (or a path in the app) with exactly our three UTM parameters.
export function appLink(site, campaign, url = site.appUrl) {
  const u = new URL(url);
  for (const k of [...u.searchParams.keys()]) if (k.startsWith('utm_')) u.searchParams.delete(k);
  u.searchParams.set('utm_source', UTM_SOURCE);
  u.searchParams.set('utm_medium', UTM_MEDIUM);
  u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}

// null if the link is correct, else what is wrong.
export function utmProblem(url, campaign) {
  let u;
  try { u = new URL(url); } catch { return 'ugyldig URL'; }
  const want = { utm_source: UTM_SOURCE, utm_medium: UTM_MEDIUM, utm_campaign: campaign };
  for (const [k, v] of Object.entries(want)) {
    const got = u.searchParams.getAll(k);
    if (got.length !== 1 || got[0] !== v) return `${k}=${got.join(',') || '(mangler)'} (skal være ${v})`;
  }
  return null;
}

// Rewrites every Markdown link to the app so it has the article's UTM tags.
export function withAppUtm(body, site, campaign) {
  return body.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text, url) => (isAppUrl(url, site) ? `[${text}](${appLink(site, campaign, url)})` : all));
}

// Puts the mid-article CTA marker before the middle "## " section (never
// before the first one, never inside the FAQ). Keeps an existing marker.
export function insertCtaMarker(body) {
  if (body.includes(CTA_MARKER)) return body;
  const faqAt = body.indexOf('<!-- faq -->');
  const main = faqAt < 0 ? body : body.slice(0, faqAt);
  const rest = faqAt < 0 ? '' : body.slice(faqAt);
  const lines = main.split('\n');
  const h2 = lines.map((l, i) => (/^##\s/.test(l.trim()) ? i : -1)).filter((i) => i >= 0);
  if (h2.length < 2) return body;
  const at = h2[Math.max(1, Math.floor(h2.length / 2))];
  lines.splice(at, 0, CTA_MARKER, '');
  return lines.join('\n') + rest;
}
