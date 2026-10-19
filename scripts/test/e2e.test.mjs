// End to end against a fake Anthropic API on 127.0.0.1 (no real API call):
// generate -> quality gate -> draft -> publish -> pages, hreflang, sitemap.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function paragraphs(sentences, n) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(sentences.slice(i % 3, (i % 3) + 4).join(' '));
  return out.join('\n\n');
}

const NO = [
  'Når du skriver søknaden, bør du vise hva du kan gjøre for arbeidsgiveren og ikke bare hva du ønsker deg.',
  'Noen søkere skriver mye om seg selv, men det er bedre å vise etter hvert hvorfor jobben passer deg.',
  'Les stillingsannonsen nøye og plukk ut de kravene som går igjen, for det er dem arbeidsgiveren bryr seg mest om.',
  'Et konkret eksempel fra skole, frivillig arbeid eller en deltidsjobb sier mer enn en lang liste av egenskaper.',
  'Skriv kort og tydelig, og be gjerne noen du stoler på om å lese gjennom teksten før du sender den.',
  'Har du jobbet i butikk, kan du fortelle hvordan du hjalp kunder, og det viser serviceinnstilling bedre enn ordet alene.',
];
const EN = [
  'When you write your cover letter, show what you can do for the employer rather than only what you want from the job.',
  'Some applicants write a lot about themselves, but it is better to show how the job fits your experience and skills.',
  'Read the job advert carefully and pick out the requirements that come up again and again, because those matter most.',
  'A concrete example from school, volunteering or a part-time job says more than a long list of personal qualities.',
  'Keep it short and clear, and ask someone you trust to read it through before you send it to the employer.',
  'If you have worked in a shop, explain how you helped customers, which shows customer focus better than the word itself.',
];

function article(lang, { price = false } = {}) {
  const s = lang === 'no' ? NO : EN;
  const h = lang === 'no'
    ? ['Start med det arbeidsgiveren trenger', 'Vis det med eksempler', 'Gjør teksten kort', 'Les gjennom før du sender', 'Oppsummert']
    : ['Start with what the employer needs', 'Show it with examples', 'Keep it short', 'Proofread before sending', 'In short'];
  const app = lang === 'no' ? 'Vil du ha et utkast å jobbe videre med, kan du [prøve ReadyCV](https://app.aerlig.no).' : 'If you want a first draft to edit, you can [try ReadyCV](https://app.aerlig.no).';
  const body = [paragraphs(s, 2), ...h.flatMap((x, i) => [`## ${x}`, paragraphs(s, 3), i === 1 ? app : ''])].filter(Boolean).join('\n\n')
    + (price ? (lang === 'no' ? '\n\nAbonnementet koster 79 kr i måneden.' : '\n\nThe subscription costs $9 a month.') : '');
  const faq = Array.from({ length: 4 }, (_, i) => (lang === 'no'
    ? { q: `Spørsmål nummer ${i + 1} om søknaden?`, a: `${NO[i]} ${NO[i + 1]}` }
    : { q: `Question number ${i + 1} about the letter?`, a: `${EN[i]} ${EN[i + 1]}` }));
  return lang === 'no'
    ? { title: 'Slik skriver du CV uten arbeidserfaring', description: 'Ingen erfaring ennå? Slik viser du skole, frivillig arbeid og deltidsjobber i CV-en, med eksempler du kan bruke med en gang.', h1: 'CV uten arbeidserfaring: slik får du den til', body_markdown: body, faq, cta_mid_text: 'Har du skole og fritidsjobber å vise til, kan du lage CV-en din gratis i ReadyCV – uten innlogging.', cta_mid_button: 'Lag CV-en gratis', cta_end_title: 'Klar til å lage din første CV?', cta_end_text: 'Last opp det du har, og få en ryddig CV tilpasset jobben. Gratis å prøve.', cta_end_button: 'Prøv ReadyCV' }
    : { title: 'How to write a CV with no work experience', description: 'No experience yet? How to show school, volunteering and part-time work on your CV, with examples you can use straight away.', h1: 'A CV with no work experience: how to make it work', body_markdown: body, faq, cta_mid_text: 'If you have school and spare-time work to show, you can make your CV for free in ReadyCV – no login needed.', cta_mid_button: 'Make my CV free', cta_end_title: 'Ready to write your first CV?', cta_end_text: 'Add what you have and get a clean CV tailored to the job. Free to try.', cta_end_button: 'Try ReadyCV' };
}

let server;
let base;
const state = { price: false, calls: 0 };

before(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      state.calls += 1;
      const body = JSON.parse(raw);
      assert.equal(req.headers['x-api-key'], 'test-key');
      let text;
      if (body.system.includes('strict native')) {
        text = JSON.stringify({ language_correct: true, language_detected: 'x', reads_as_translation: false, translation_evidence: '', local_market_fit: 4, unverifiable_claims: [], invented_quotes: false, notes: 'ok' });
      } else {
        const lang = body.system.includes('Write in Norwegian') ? 'no' : 'en';
        text = '```json\n' + JSON.stringify(article(lang, { price: state.price })) + '\n```';
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { output_tokens: 1 } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'readycv-content-'));
  for (const f of ['content', 'index.html', 'sitemap.xml', 'privacy-policy.html']) cpSync(join(REPO, f), join(dir, f), { recursive: true });
  // Start from a clean queue with no drafts or published articles, whatever
  // the real repo holds, and with no and en as the active languages.
  for (const sub of ['drafts', 'published']) rmSync(join(dir, 'content', sub), { recursive: true, force: true });
  const t = JSON.parse(readFileSync(join(REPO, 'content', 'topics.json'), 'utf8'));
  t.topics = t.topics.map(({ group, lang, slug, title, keyword, purpose, appAngle, priority, translations }) => (
    { group, lang, slug, title, keyword, purpose, appAngle, priority, status: 'queued', translations }));
  writeFileSync(join(dir, 'content', 'topics.json'), JSON.stringify(t));
  const l = JSON.parse(readFileSync(join(REPO, 'content', 'languages.json'), 'utf8'));
  for (const x of l.languages) x.enabled = ['no', 'en'].includes(x.code);
  writeFileSync(join(dir, 'content', 'languages.json'), JSON.stringify(l));
  const s = JSON.parse(readFileSync(join(REPO, 'content', 'site.json'), 'utf8'));
  Object.assign(s, { maxArticlesPerLanguagePerWeek: 3, maxArticlesPerRun: 2, maxActiveLanguages: 2 });
  writeFileSync(join(dir, 'content', 'site.json'), JSON.stringify(s));
  // The real sitemap.xml also lists the articles already published in the
  // repo. The workspace has none of them, so keep only the static pages:
  // otherwise the test depends on what the routine has published (this made
  // the scheduled run of 2026-10-19 fail).
  writeFileSync(join(dir, 'sitemap.xml'), staticSitemap(readFileSync(join(REPO, 'sitemap.xml'), 'utf8')));
  return dir;
}

const LANG_CODES = JSON.parse(readFileSync(join(REPO, 'content', 'languages.json'), 'utf8')).languages.map((l) => l.code);
export function staticSitemap(xml) {
  return xml.replace(/[ \t]*<url>[\s\S]*?<\/url>\n?/g, (block) => {
    const path = (/<loc>https?:\/\/[^/<]+([^<]*)<\/loc>/.exec(block) || [])[1] || '/';
    return LANG_CODES.some((c) => path === `/${c}/` || path.startsWith(`/${c}/`)) ? '' : block;
  });
}

// Async: the fake API runs in this process and must keep answering.
async function run(dir, script, args, extraEnv = {}) {
  const { stdout } = await promisify(execFile)(process.execPath, [join(REPO, 'scripts', script), ...args], {
    // No network in tests: links are not opened, but treated as working so
    // auto-approval can be tested (CONTENT_LINKCHECK_ASSUME_OK).
    env: { ...process.env, CONTENT_SKIP_LINKCHECK: '1', CONTENT_LINKCHECK_ASSUME_OK: '1', MAX_ARTICLES_PER_LANGUAGE_PER_WEEK: '', MAX_ARTICLES_PER_RUN: '',
      MAX_ACTIVE_LANGUAGES: '', MAX_API_CALLS_PER_RUN: '', MAX_ATTEMPTS_PER_TOPIC: '', CONTENT_ROOT: dir, ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: base, ...extraEnv },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return stdout;
}

test('generate -> draft with app boxes and UTM; nothing public yet', async () => {
  const dir = workspace();
  const indexBefore = readFileSync(join(dir, 'index.html'), 'utf8');
  const sitemapBefore = readFileSync(join(dir, 'sitemap.xml'), 'utf8');
  await run(dir, 'generate.mjs', ['--lang', 'no,en', '--count', '1']);
  const draft = readFileSync(join(dir, 'content', 'drafts', 'no', 'cv-uten-erfaring.md'), 'utf8');
  assert.match(draft, /approved: true/, 'passed every check -> approved automatically');
  assert.match(draft, /cta_mid_button: "Lag CV-en gratis"/);
  assert.match(draft, /<!-- cta -->/);
  assert.match(draft, /https:\/\/app\.aerlig\.no\/\?utm_source=readycvapp&utm_medium=artikkel&utm_campaign=cv-uten-erfaring/);
  assert.ok(existsSync(join(dir, 'content', 'drafts', 'en', 'cv-norway-no-experience.md')));
  const topics = JSON.parse(readFileSync(join(dir, 'content', 'topics.json'), 'utf8')).topics;
  assert.equal(topics.find((t) => t.lang === 'no' && t.slug === 'cv-uten-erfaring').status, 'draft');
  // Drafts never touch the public site.
  assert.equal(readFileSync(join(dir, 'index.html'), 'utf8'), indexBefore);
  assert.equal(readFileSync(join(dir, 'sitemap.xml'), 'utf8'), sitemapBefore);
  assert.ok(!existsSync(join(dir, 'no')));

  // The workflow's publish step.
  await run(dir, 'publish-drafts.mjs', ['--auto']);
  const html = readFileSync(join(dir, 'no', 'cv-uten-erfaring', 'index.html'), 'utf8');
  assert.match(html, /<html lang="nb">/);
  assert.match(html, /<meta charset="UTF-8">/);
  assert.match(html, /hreflang="en" href="https:\/\/readycvapp\.no\/en\/cv-norway-no-experience\/"/);
  assert.match(html, /hreflang="x-default"/);
  const appLinks = [...html.matchAll(/href="(https:\/\/app\.aerlig\.no[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  assert.equal(appLinks.length, 3, 'inline link + mid box + end box');
  for (const u of appLinks) assert.equal(new URL(u).searchParams.get('utm_campaign'), 'cv-uten-erfaring');
  assert.match(html, /data-cta="app-mid"/);
  assert.match(html, /data-cta="play-mid"/);
  assert.match(html, /article_cta_click/);
  assert.ok(html.indexOf('cta-mid') < html.indexOf('id="faq"'));
  assert.doesNotMatch(html, /79 kr|kr\/mnd/);
  assert.ok(existsSync(join(dir, 'no', 'index.html')) && existsSync(join(dir, 'en', 'index.html')));
  const sitemap = readFileSync(join(dir, 'sitemap.xml'), 'utf8');
  for (const old of sitemapBefore.match(/<url>[\s\S]*?<\/url>/g)) assert.ok(sitemap.includes(old), 'old entries kept as they are');
  assert.match(sitemap, /<loc>https:\/\/readycvapp\.no\/no\/cv-uten-erfaring\/<\/loc>/);
  assert.match(sitemap, /xhtml:link rel="alternate" hreflang="en"/);
  assert.equal(readFileSync(join(dir, 'index.html'), 'utf8'), indexBefore);
  assert.ok(!readdirSync(join(dir, 'content', 'drafts', 'no')).length);

  // Second Norwegian article is the same text -> duplicate -> stopped.
  await run(dir, 'generate.mjs', ['--lang', 'no', '--count', '1']);
  const t2 = JSON.parse(readFileSync(join(dir, 'content', 'topics.json'), 'utf8')).topics.find((t) => t.lang === 'no' && t.slug === 'feil-i-jobbsoknad');
  assert.equal(t2.status, 'queued');
  assert.match(t2.last_error, /duplikat|tittel/);
  assert.equal(t2.attempts, 1);
});

test('price in the article -> stopped, not saved', async () => {
  const dir = workspace();
  state.price = true;
  try {
    await run(dir, 'generate.mjs', ['--lang', 'en', '--count', '1']);
  } finally {
    state.price = false;
  }
  assert.ok(!existsSync(join(dir, 'content', 'drafts', 'en', 'cv-norway-no-experience.md')));
  const t = JSON.parse(readFileSync(join(dir, 'content', 'topics.json'), 'utf8')).topics.find((x) => x.lang === 'en' && x.slug === 'cv-norway-no-experience');
  assert.match(t.last_error, /priser: pris eller beløp/);
});

test('weekly limit and disabled languages', async () => {
  const dir = workspace();
  const out = await run(dir, 'generate.mjs', ['--dry-run']);
  assert.match(out, /\[no\] 2 artikkel/);
  assert.match(out, /\[en\] 2 artikkel/);
  assert.doesNotMatch(out, /\[da\]/);
  const t = JSON.parse(readFileSync(join(dir, 'content', 'topics.json'), 'utf8'));
  const now = new Date().toISOString();
  for (const x of t.topics.filter((y) => y.lang === 'no').slice(0, 3)) Object.assign(x, { status: 'draft', drafted_at: now });
  writeFileSync(join(dir, 'content', 'topics.json'), JSON.stringify(t));
  assert.match(await run(dir, 'generate.mjs', ['--dry-run']), /no: ukegrensen er nådd \(3\/3/);
  await assert.rejects(run(dir, 'generate.mjs', ['--lang', 'da', '--dry-run']), /enabled=false/);
});

test('auto publish: only active languages, never past the weekly limit', async () => {
  const dir = workspace();
  await run(dir, 'generate.mjs', ['--lang', 'no', '--count', '1']);
  // An approved draft in a disabled language must stay a draft.
  const daDraft = readFileSync(join(dir, 'content', 'drafts', 'no', 'cv-uten-erfaring.md'), 'utf8').replace('lang: "no"', 'lang: "da"').replace('"cv-uten-erfaring"', '"cv-uden-erfaring"');
  cpSync(join(dir, 'content', 'drafts', 'no'), join(dir, 'content', 'drafts', 'da'), { recursive: true });
  rmSync(join(dir, 'content', 'drafts', 'da', 'cv-uten-erfaring.md'));
  writeFileSync(join(dir, 'content', 'drafts', 'da', 'cv-uden-erfaring.md'), daDraft);
  // Three Norwegian articles were already published this week.
  const t = JSON.parse(readFileSync(join(dir, 'content', 'topics.json'), 'utf8'));
  const now = new Date().toISOString();
  for (const x of t.topics.filter((y) => y.lang === 'no' && y.status === 'queued').slice(0, 3)) Object.assign(x, { status: 'published', published_at: now });
  writeFileSync(join(dir, 'content', 'topics.json'), JSON.stringify(t));
  const out = await run(dir, 'publish-drafts.mjs', ['--auto']);
  assert.match(out, /da\/cv-uden-erfaring: språket er ikke aktivt/);
  assert.match(out, /no\/cv-uten-erfaring: ukegrensen for publisering er nådd/);
  assert.match(out, /publisert: 0/);
  assert.ok(existsSync(join(dir, 'content', 'drafts', 'no', 'cv-uten-erfaring.md')));
  assert.ok(!existsSync(join(dir, 'no')));
  // A week later the draft goes out.
  const t2 = JSON.parse(readFileSync(join(dir, 'content', 'topics.json'), 'utf8'));
  for (const x of t2.topics) if (x.published_at) x.published_at = new Date(Date.now() - 8 * 864e5).toISOString();
  writeFileSync(join(dir, 'content', 'topics.json'), JSON.stringify(t2));
  assert.match(await run(dir, 'publish-drafts.mjs', ['--auto']), /publisert: 1/);
  assert.ok(existsSync(join(dir, 'no', 'cv-uten-erfaring', 'index.html')));
  assert.ok(!existsSync(join(dir, 'da')));
});

test('a topic stopped 3 times is reported (for the issue); the cost limit stops the run cleanly', async () => {
  const dir = workspace();
  const sum = join(dir, 'summary.json');
  state.price = true;
  try {
    for (let i = 1; i <= 3; i += 1) {
      await run(dir, 'generate.mjs', ['--lang', 'en', '--count', '1', '--topic', 'cv-norway-no-experience', '--summary', sum]);
      const s = JSON.parse(readFileSync(sum, 'utf8'));
      assert.equal(s.stuck.length, i === 3 ? 1 : 0, `run ${i}`);
    }
  } finally {
    state.price = false;
  }
  const t = JSON.parse(readFileSync(join(dir, 'content', 'topics.json'), 'utf8')).topics.find((x) => x.lang === 'en' && x.slug === 'cv-norway-no-experience');
  assert.equal(t.attempts, 3);
  assert.match(t.last_error, /priser/);
  // Skipped from now on.
  assert.doesNotMatch(await run(dir, 'generate.mjs', ['--lang', 'en', '--count', '1', '--dry-run']), /cv-norway-no-experience/);

  // Cost limit: 3 calls allowed, an article needs 2 per round.
  const dir2 = workspace();
  const sum2 = join(dir2, 'summary.json');
  const before = state.calls;
  await run(dir2, 'generate.mjs', ['--lang', 'no,en', '--count', '2', '--summary', sum2], { MAX_API_CALLS_PER_RUN: '3' });
  assert.ok(state.calls - before <= 3, 'never more than the limit');
  const s2 = JSON.parse(readFileSync(sum2, 'utf8'));
  assert.match(s2.budgetStop, /kostnadsgrensen er nådd \(3 API-kall/);
  assert.equal(s2.created.length, 1);
  const stopped = JSON.parse(readFileSync(join(dir2, 'content', 'topics.json'), 'utf8')).topics.filter((x) => x.attempts);
  assert.equal(stopped.length, 0, 'the cost stop is not counted as an attempt');
});

test('the tests do not depend on what is already published in the repo (regression 2026-10-19)', async () => {
  // A repo sitemap with published articles, like main after the first run.
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + '  <url>\n    <loc>https://readycvapp.no/</loc>\n  </url>\n'
    + '  <url>\n    <loc>https://readycvapp.no/no/</loc>\n  </url>\n'
    + '  <url>\n    <loc>https://readycvapp.no/en/cv-x/</loc>\n  </url>\n'
    + '  <url>\n    <loc>https://readycvapp.no/slett-konto.html</loc>\n  </url>\n</urlset>\n';
  const out = staticSitemap(xml);
  assert.match(out, /<loc>https:\/\/readycvapp\.no\/<\/loc>/);
  assert.match(out, /slett-konto\.html/);
  assert.doesNotMatch(out, /\/no\/|\/en\//);
});

test('nothing to do (weekly limit reached, or empty queue) ends calmly with exit 0', async () => {
  const dir = workspace();
  const t = JSON.parse(readFileSync(join(dir, 'content', 'topics.json'), 'utf8'));
  const now = new Date().toISOString();
  for (const l of ['no', 'en']) for (const x of t.topics.filter((y) => y.lang === l).slice(0, 3)) Object.assign(x, { status: 'published', drafted_at: now, published_at: now });
  writeFileSync(join(dir, 'content', 'topics.json'), JSON.stringify(t));
  const before = state.calls;
  const out = await run(dir, 'generate.mjs', ['--summary', join(dir, 's.json')]); // rejects on a non-zero exit
  assert.match(out, /Ingenting å gjøre i denne kjøringen/);
  assert.match(out, /no: ukegrensen er nådd/);
  assert.equal(state.calls, before, 'no API calls');
  assert.match(await run(dir, 'publish-drafts.mjs', ['--auto']), /publisert: 0/);
  // Empty queue.
  for (const x of t.topics) Object.assign(x, { status: 'published', drafted_at: undefined, published_at: undefined });
  writeFileSync(join(dir, 'content', 'topics.json'), JSON.stringify(t));
  assert.match(await run(dir, 'generate.mjs', []), /ingen temaer i køen/);
});
