import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CTA_MARKER, appLink, insertCtaMarker, utmProblem, withAppUtm } from '../lib/links.mjs';
import { inline, parseBlocks, renderBlocks } from '../lib/markdown.mjs';
import { checkCta, checkLanguage, checkLinks, checkNumbers, checkPrices, checkDuplicate, checkMeta } from '../lib/quality.mjs';
import { parseDoc, serializeDoc } from '../lib/frontmatter.mjs';

const site = { appUrl: 'https://app.aerlig.no', siteUrl: 'https://readycvapp.no' };

test('markdown escapes HTML and renders the subset', () => {
  const html = renderBlocks(parseBlocks('## Tittel\n\nTekst med <script>x</script> og **fet** og [lenke](https://app.aerlig.no).\n\n- a\n- b\n\n> Eksempel'));
  assert.match(html, /<h2 id="tittel">Tittel<\/h2>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<strong>fet<\/strong>/);
  assert.match(html, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(html, /<blockquote>Eksempel<\/blockquote>/);
  assert.equal(inline('[x](/no/a/)', () => null), 'x');
  assert.match(inline('[x](javascript:alert(1))'), /href="javascript:alert\(1/, 'link filter decides; build filter must reject');
});

test('front matter round trip, also hand-typed values', () => {
  const doc = serializeDoc({ title: 'A: "b"', approved: false }, 'Body');
  const { meta, body } = parseDoc(doc);
  assert.equal(meta.title, 'A: "b"');
  assert.equal(meta.approved, false);
  assert.equal(body.trim(), 'Body');
  assert.equal(parseDoc('---\napproved: true\nnote: fri tekst\n---\nx').meta.note, 'fri tekst');
});

test('UTM links: set, replaced and verified', () => {
  const u = appLink(site, 'cv-uten-erfaring');
  assert.equal(u, 'https://app.aerlig.no/?utm_source=readycvapp&utm_medium=artikkel&utm_campaign=cv-uten-erfaring');
  assert.equal(utmProblem(u, 'cv-uten-erfaring'), null);
  assert.match(utmProblem('https://app.aerlig.no/', 'x'), /utm_source/);
  assert.match(utmProblem(appLink(site, 'feil'), 'riktig'), /utm_campaign/);
  const body = withAppUtm('Prøv [appen](https://app.aerlig.no/?utm_campaign=gammel) og [FINN](https://www.finn.no/job).', site, 'ny');
  assert.match(body, /utm_campaign=ny/);
  assert.doesNotMatch(body, /gammel/);
  assert.match(body, /\(https:\/\/www\.finn\.no\/job\)/);
});

test('CTA marker goes before the middle section, never into the FAQ', () => {
  const body = '## A\n\nx\n\n## B\n\nx\n\n## C\n\nx\n\n## D\n\nx\n\n<!-- faq -->\n\n### Q\n\nA';
  const out = insertCtaMarker(body);
  assert.equal(out.split(CTA_MARKER).length, 2);
  assert.ok(out.indexOf(CTA_MARKER) > out.indexOf('## B') && out.indexOf(CTA_MARKER) < out.indexOf('## C'));
  assert.equal(insertCtaMarker(out), out);
});

test('checkCta: missing text, missing marker, wrong place', () => {
  const meta = { cta_mid_text: 'Lag CV-en din gratis i ReadyCV.', cta_mid_button: 'Lag CV gratis', cta_end_title: 'Klar?', cta_end_text: 'Prøv gratis, uten innlogging.', cta_end_button: 'Prøv nå' };
  const good = `## A\n\nx\n\n${CTA_MARKER}\n\n## B\n\nx\n\n<!-- faq -->\n\n### Q\n\nA`;
  assert.deepEqual(checkCta(meta, good, { appUrl: site.appUrl, slug: 's' }), []);
  assert.ok(checkCta({ ...meta, cta_mid_button: '' }, good, { appUrl: site.appUrl, slug: 's' }).some((p) => p.includes('cta_mid_button')));
  assert.ok(checkCta(meta, good.replace(CTA_MARKER, ''), { appUrl: site.appUrl, slug: 's' }).some((p) => p.includes('mangler')));
  assert.ok(checkCta(meta, `${CTA_MARKER}\n\n## A\n\nx\n\n## B`, { appUrl: site.appUrl, slug: 's' }).some((p) => p.includes('mellom')));
});

test('checkLinks: wrong UTM, foreign links, unpublished internal links', () => {
  const ctx = { appUrl: site.appUrl, siteUrl: site.siteUrl, internalPaths: ['/no/a/'], portals: ['https://www.finn.no/job'], requireInternal: false, campaign: 'slug' };
  assert.deepEqual(checkLinks(`[app](${appLink(site, 'slug')}) [a](/no/a/) [finn](https://www.finn.no/job)`, ctx), []);
  assert.ok(checkLinks('[app](https://app.aerlig.no/)', ctx)[0].includes('feil UTM'));
  assert.ok(checkLinks('[x](https://example.com)', ctx)[0].includes('tillatt'));
  assert.ok(checkLinks('[x](/no/b/)', ctx)[0].includes('ikke finnes'));
});

test('prices are refused, "gratis" is fine', () => {
  for (const s of ['Abonnementet koster 79 kr i måneden.', 'Det koster 79,- per måned.', 'Only $9 a month.', 'Chỉ 99.000 đồng mỗi tháng.', 'Passet er 39 kr.', 'Pris: 79 kr/mnd.']) {
    assert.ok(checkPrices([s]).length, s);
  }
  assert.deepEqual(checkPrices(['Du kan prøve gratis, uten innlogging.', 'Skriv 3–5 punkter per jobb.']), []);
});

test('numbers: statistics stopped, practical numbers allowed', () => {
  assert.ok(checkNumbers('75 % av rekrutterere leser bare CV-en.').length);
  assert.ok(checkNumbers('Ifølge en undersøkelse fra 2023 bruker de 7 sekunder.').length);
  assert.ok(checkNumbers('Etter arbeidsmiljøloven § 14-9 kan du kreve det.').length);
  assert.ok(checkNumbers('8 av 10 arbeidsgivere sjekker LinkedIn.').length);
  assert.deepEqual(checkNumbers('Hold CV-en på én til to sider. Bruk 3–5 punkter. Butikkmedarbeider, Rema 1000, 2019–2023.'), []);
});

test('language heuristic separates no / da / sv / en / vi', () => {
  const no = 'Når du skriver søknaden, bør du vise hva du kan gjøre for arbeidsgiveren. Noen søkere skriver mye om seg selv, men det er bedre å vise etter hvert hvorfor jobben passer deg.';
  const da = 'Når du skriver ansøgningen, bør du vise hvad du kan gøre for arbejdsgiveren. Nogle ansøgere skriver meget om sig selv, men det er bedre at vise, hvorfor jobbet passer til dig efter din erfaring.';
  const sv = 'När du skriver ditt personliga brev ska du visa vad du kan göra för arbetsgivaren. Några skriver mycket om sig själva, men det är bättre att visa varför jobbet passar dig och inte bara vad du har gjort.';
  const en = 'When you write your cover letter, show what you can do for the employer. Some applicants write a lot about themselves, but it is better to show how the job fits your experience.';
  const vi = 'Khi viết thư xin việc, bạn nên cho nhà tuyển dụng thấy bạn có thể làm gì cho công ty. Nhiều người viết quá nhiều về bản thân, nhưng tốt hơn là nêu rõ vì sao công việc phù hợp với kinh nghiệm của bạn.';
  assert.deepEqual(checkLanguage(no, 'no'), []);
  assert.deepEqual(checkLanguage(da, 'da'), []);
  assert.deepEqual(checkLanguage(sv, 'sv'), []);
  assert.deepEqual(checkLanguage(en, 'en'), []);
  assert.deepEqual(checkLanguage(vi, 'vi'), []);
  assert.ok(checkLanguage(da, 'no').length, 'Danish is not Norwegian');
  assert.ok(checkLanguage(no, 'da').length, 'Norwegian is not Danish');
  assert.ok(checkLanguage(en, 'vi').length);
});

test('duplicate and meta checks', () => {
  const text = Array.from({ length: 60 }, (_, i) => `setning nummer ${i} handler om noe helt eget her`).join('. ');
  assert.ok(checkDuplicate(text, 'Ny', [{ id: 'gammel', title: 'Gammel', text }]).length);
  assert.deepEqual(checkDuplicate(text, 'Ny', [{ id: 'annen', title: 'Annen', text: 'helt annen tekst om intervju og forberedelser' }]), []);
  assert.ok(checkMeta({ title: 'x'.repeat(61), description: 'y'.repeat(100), h1: 'h' }).some((p) => p.includes('tittelen')));
  assert.ok(checkMeta({ title: 't', description: 'y'.repeat(156), h1: 'h' }).some((p) => p.includes('description')));
});
