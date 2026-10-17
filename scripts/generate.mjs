#!/usr/bin/env node
// Writes new article drafts with the Anthropic API.
//
//   node scripts/generate.mjs                     # scheduled run: active languages, weekly limits
//   node scripts/generate.mjs --lang no --count 1 # one Norwegian draft
//   node scripts/generate.mjs --lang da,sv,vi --count 2 --include-disabled
//   node scripts/generate.mjs --lang no --topic cv-uten-erfaring
//   node scripts/generate.mjs --dry-run           # show what would be written, no API calls
//
// Every article passes the checks in scripts/lib/quality.mjs (plus a review
// by a second model call) or is NOT saved: the topic stays queued, with the
// reason in topics.json (last_error). Drafts go to content/drafts/<lang>/,
// which is never part of the public site (_config.yml excludes content/).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { complete, extractJson } from './lib/anthropic.mjs';
import { DRAFTS, PUBLISHED, ROOT, activeLanguages, articlePath, loadLanguages, loadSite, loadTopics, saveTopics } from './lib/config.mjs';
import { serializeDoc } from './lib/frontmatter.mjs';
import { FAQ_MARKER, parseBlocks, splitFaq, toPlainText } from './lib/markdown.mjs';
import { CTA_FIELDS, TITLE_MAX, DESCRIPTION_MAX, runChecks } from './lib/quality.mjs';
import { insertCtaMarker, withAppUtm } from './lib/links.mjs';
import { readArticles } from './lib/site.mjs';

const WEEK_MS = 7 * 24 * 3600 * 1000;
const MAX_REVISIONS = 1;

function parseArgs(argv) {
  const a = { lang: null, count: null, includeDisabled: false, dryRun: false, topic: null, report: null };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (k === '--lang') a.lang = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--count') a.count = Number(argv[++i]);
    else if (k === '--include-disabled') a.includeDisabled = true;
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--topic') a.topic = argv[++i];
    else if (k === '--report') a.report = argv[++i];
    else throw new Error(`ukjent argument: ${k}`);
  }
  return a;
}

export function draftedThisWeek(topics, lang, now = Date.now()) {
  return topics.filter((t) => t.lang === lang && t.drafted_at && now - Date.parse(t.drafted_at) < WEEK_MS).length;
}

export function nextTopics(topics, lang, n, maxAttempts) {
  return topics
    .filter((t) => t.lang === lang && t.status === 'queued' && (t.attempts || 0) < maxAttempts)
    .sort((x, y) => (x.priority - y.priority) || x.slug.localeCompare(y.slug))
    .slice(0, n);
}

function landingText() {
  const p = join(ROOT, 'index.html');
  if (!existsSync(p)) return '';
  return readFileSync(p, 'utf8').replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function writerSystem(lang, site) {
  const unit = lang.code === 'vi' ? 'syllables (space-separated words)' : 'words';
  return `You write help articles for job seekers on readycvapp.no, the website of the app ReadyCV.

LANGUAGE AND MARKET
Write in ${lang.englishName} (${lang.code}) for this audience: ${lang.market}.
${lang.marketNotes}
Write as a native ${lang.englishName}-speaking career adviser who knows this job market. The text must be written from scratch for this market: local examples (typical jobs, local first names, local ways of applying), local terminology and local application culture. It must never read like a translation of an article from another language.

FACTS – THE MOST IMPORTANT RULE
Do not state statistics, percentages, survey or study results, amounts of money, salaries, laws, legal paragraphs, official rules, deadlines, or quotes attributed to any person, company or organisation. Do not claim what "most recruiters" or "studies" say. If something cannot be verified, leave it out. Give practical advice as advice ("it is usually wise to ...", "many employers ask for ..."), not as facts with numbers. Allowed numbers: page counts (e.g. one to two pages), the number of items in a list, years inside an example CV. Do not describe features of job portals in detail; mentioning them by name and what they are is enough.

THE PRODUCT (mention only what is true)
${site.product}
The page shows two calm app boxes that link to the web app: one in the middle of the article and one at the end. You write their text (fields cta_* below), in ${lang.englishName}, fitted to THIS topic – e.g. for a CV article something like "make your CV for free", for a cover-letter article "get help with your application", for an interview article "practise the questions". Say that it is free to try and needs no login (true for everything except interview practice, which needs a free account – then do not promise "no login"). No hype, no exclamation marks in a row, never prices. Do not end the body with a sales pitch; the end box does that job. You may additionally link the app once inside the body text where it genuinely helps the reader, with the exact URL ${site.appUrl} – optional.

PRICES
Never mention prices, amounts or what the subscription/pass costs – prices change. "Free to try" is fine.

LINKS
Use only these URLs in Markdown links:
- the app: ${site.appUrl}
- articles on this site (internal links, use the exact path): see the list in the user message
${lang.portals.length ? `- these job portals, only if relevant: ${lang.portals.join(', ')}` : ''}
No other links.

FORMAT
Markdown subset only: "## " and "### " headings, paragraphs, "- " and "1. " lists, "> " for example sentences, **bold**, *italic*, [text](url). No tables, no HTML, no "# " heading in the body, no images.
Structure: a short introduction (no heading), then 4–7 "## " sections with concrete, practical advice and real examples (example sentences, before/after rewrites, short checklists), then a short summary section.
Length of body + FAQ together: ${lang.wordMin}–${lang.wordMax} ${unit}.
FAQ: 4–6 questions a real reader of this market would ask, each answered in 2–4 sentences.

OUTPUT
Only one JSON object, no other text:
{"title": "...", "description": "...", "h1": "...", "body_markdown": "...", "faq": [{"q": "...", "a": "..."}], "cta_mid_text": "...", "cta_mid_button": "...", "cta_end_title": "...", "cta_end_text": "...", "cta_end_button": "..."}
- title: unique, natural, contains the main keyword, max ${TITLE_MAX} characters including spaces (the site name is NOT added).
- description: the meta description, 120–${DESCRIPTION_MAX} characters, invites the click without clickbait.
- h1: the page heading; may be a little longer than the title.
- cta_mid_text: one sentence (max 200 characters) that connects the advice just given to trying the app.
- cta_mid_button / cta_end_button: 2–5 words, max 40 characters, different from each other.
- cta_end_title: max 60 characters. cta_end_text: one or two sentences, max 200 characters, different from cta_mid_text.`;
}

function writerUser(topic, ctx) {
  const internal = ctx.internal.length
    ? ctx.internal.map((a) => `- ${a.title}: ${a.url}`).join('\n')
    : '(none published yet – then link only the app)';
  return `Topic (working title): ${topic.title}
Main keyword: ${topic.keyword}
Purpose of the article: ${topic.purpose}
How the app fits naturally: ${topic.appAngle}

Articles already published in this language (link 1–2 that are genuinely related, if any):
${internal}

Titles already used in this language (yours must be clearly different):
${ctx.usedTitles.length ? ctx.usedTitles.map((t) => `- ${t}`).join('\n') : '(none)'}`;
}

function reviewerSystem(lang) {
  return `You are a strict native ${lang.englishName} editor and career adviser for this audience: ${lang.market}.
Review the article below and answer with one JSON object only:
{"language_correct": true|false, "language_detected": "<ISO code>", "reads_as_translation": true|false, "translation_evidence": "<short>", "local_market_fit": 1-5, "unverifiable_claims": ["<exact sentence>", ...], "invented_quotes": true|false, "notes": "<max 2 sentences>"}

- language_correct: the whole text is natural ${lang.englishName} (${lang.code}) – for Norwegian: Bokmål, not Danish/Swedish/Nynorsk.
- reads_as_translation: true if wording, idioms, examples or structure feel translated from another language (calques, foreign idioms, examples from another country), or if the structure mirrors the sibling-article headings given below one to one.
- local_market_fit: 5 = clearly written for this market (local terms, local application culture, relevant local portals or examples); 1 = generic or wrong for this market.
- unverifiable_claims: every sentence that states a statistic, percentage, amount, salary, study/survey result, law, legal rule, official rule or deadline, or a specific claim about how a named portal, authority or company works that you cannot be sure is true. Empty list if none. Ordinary practical advice is not a claim.
- invented_quotes: true if the text quotes or attributes statements to real people, companies or organisations.`;
}

function reviewerUser(meta, body, siblings) {
  const sib = siblings.length
    ? siblings.map((s) => `[${s.lang}] ${s.headings.join(' | ')}`).join('\n')
    : '(none)';
  return `Sibling articles on the same topic in other languages (headings only):
${sib}

TITLE: ${meta.title}
DESCRIPTION: ${meta.description}
H1: ${meta.h1}
APP BOX (middle): ${meta.cta_mid_text} [${meta.cta_mid_button}]
APP BOX (end): ${meta.cta_end_title} – ${meta.cta_end_text} [${meta.cta_end_button}]

${body}`;
}

// Body + FAQ, with the mid-article app box marker and the UTM tags on every
// web-app link put in by the script (not left to the model).
export function assembleBody(json, site, slug) {
  const faq = (Array.isArray(json.faq) ? json.faq : [])
    .filter((f) => f && f.q && f.a)
    .map((f) => `### ${String(f.q).trim()}\n\n${String(f.a).trim()}`)
    .join('\n\n');
  const body = `${String(json.body_markdown || '').trim()}\n\n${FAQ_MARKER}\n\n${faq}\n`;
  return withAppUtm(insertCtaMarker(body), site, slug);
}

export function ctaMeta(json) {
  return Object.fromEntries(CTA_FIELDS.map((f) => [f, String(json[f] || '').trim()]));
}

function headings(body) {
  return parseBlocks(splitFaq(body).main).filter((b) => b.type === 'h2').map((b) => b.text);
}

async function writeOne(topic, lang, site, ctx, log) {
  const system = writerSystem(lang, site);
  let user = writerUser(topic, ctx);
  let last = null;
  for (let round = 0; round <= MAX_REVISIONS; round += 1) {
    const { text, usage } = await complete({ model: site.model, system, user, maxTokens: 12000 });
    let json;
    try {
      json = extractJson(text);
    } catch (e) {
      last = { ok: false, problems: [`svaret var ikke gyldig JSON (${e.message})`] };
      continue;
    }
    const meta = {
      slug: topic.slug,
      title: String(json.title || '').trim(),
      description: String(json.description || '').trim(),
      h1: String(json.h1 || '').trim(),
      ...ctaMeta(json),
    };
    const body = assembleBody(json, site, topic.slug);
    const reviewText = await complete({
      model: site.reviewModel,
      system: reviewerSystem(lang),
      user: reviewerUser(meta, body, ctx.siblings),
      maxTokens: 2000,
    });
    let review;
    try { review = extractJson(reviewText.text); } catch { review = null; }
    const result = runChecks({ meta, body, lang, linkContext: ctx.linkContext, corpus: ctx.corpus, review });
    log(`  [${lang.code}/${topic.slug}] runde ${round + 1}: ${result.ok ? 'OK' : `${result.problems.length} problem(er)`} (${result.words} ord, ${usage.output_tokens || '?'} tokens)`);
    last = { ...result, meta, body, review };
    if (result.ok) return last;
    // One revision with the concrete problems; the checks run again.
    user = `${writerUser(topic, ctx)}

Your previous answer is below. Rewrite it and fix ALL of these problems (keep what was good, and return the complete JSON again):
${result.problems.map((p) => `- ${p}`).join('\n')}

Previous answer:
${text}`;
  }
  return last;
}

function contextFor(lang, site, topics, topic) {
  const published = readArticles(PUBLISHED, [lang.code]);
  const drafts = readArticles(DRAFTS, [lang.code]);
  const internal = published.map((a) => ({ title: a.h1 || a.title, url: articlePath(a.lang, a.slug) }));
  const corpus = [...published, ...drafts]
    .filter((a) => !(a.lang === topic.lang && a.slug === topic.slug))
    .map((a) => ({ id: relative(ROOT, a.path), title: a.title, text: toPlainText(a.body) }));
  if (lang.code === 'no') corpus.push({ id: 'index.html', title: '', text: landingText() });
  const siblingSlugs = Object.entries(topic.translations || {});
  const siblings = [];
  for (const [code, slug] of siblingSlugs) {
    const found = [...readArticles(PUBLISHED, [code]), ...readArticles(DRAFTS, [code])].find((a) => a.slug === slug);
    if (found) siblings.push({ lang: code, headings: headings(found.body) });
  }
  const usedTitles = [...published, ...drafts].map((a) => a.title).filter(Boolean);
  return {
    internal,
    corpus,
    siblings,
    usedTitles,
    linkContext: {
      appUrl: site.appUrl,
      siteUrl: site.siteUrl,
      internalPaths: internal.map((a) => a.url),
      portals: lang.portals,
      requireInternal: internal.length > 0,
    },
  };
}

export async function main(argv = process.argv.slice(2), log = console.log) {
  const args = parseArgs(argv);
  const site = loadSite();
  const languages = loadLanguages();
  const topicsData = loadTopics();
  const topics = topicsData.topics;

  let langs;
  if (args.lang) {
    langs = args.lang.map((c) => {
      const l = languages.find((x) => x.code === c);
      if (!l) throw new Error(`ukjent språk: ${c} (finnes ikke i content/languages.json)`);
      if (!l.enabled && !args.includeDisabled) throw new Error(`${c} er enabled=false; bruk --include-disabled for et eksempelutkast`);
      return l;
    });
  } else {
    langs = activeLanguages(languages, site);
  }

  const report = { created: [], rejected: [], skipped: [] };
  for (const lang of langs) {
    const used = draftedThisWeek(topics, lang.code);
    const room = Math.max(0, site.maxArticlesPerLanguagePerWeek - used);
    const want = args.count ?? site.maxArticlesPerRun;
    const n = Math.min(want, room);
    if (n === 0) {
      report.skipped.push(`${lang.code}: ukegrensen er nådd (${used}/${site.maxArticlesPerLanguagePerWeek} siste 7 dager)`);
      continue;
    }
    const picked = args.topic
      ? topics.filter((t) => t.lang === lang.code && t.slug === args.topic)
      : nextTopics(topics, lang.code, n, site.maxAttemptsPerTopic);
    if (!picked.length) {
      report.skipped.push(`${lang.code}: ingen temaer i køen`);
      continue;
    }
    log(`[${lang.code}] ${picked.length} artikkel/artikler: ${picked.map((t) => t.slug).join(', ')}`);
    for (const topic of picked) {
      const ctx = contextFor(lang, site, topics, topic);
      if (args.dryRun) {
        log(`--- systemprompt (${lang.code}) ---\n${writerSystem(lang, site)}\n--- melding ---\n${writerUser(topic, ctx)}\n`);
        continue;
      }
      let res;
      try {
        res = await writeOne(topic, lang, site, ctx, log);
      } catch (e) {
        res = { ok: false, problems: [`feil: ${e.message}`] };
        if (e.status === 0 || e.status === 401 || e.status === 403) {
          // Missing/invalid key: no point trying the other topics.
          report.rejected.push({ lang: lang.code, slug: topic.slug, problems: res.problems });
          finish(topicsData, report, args, log);
          throw e;
        }
      }
      const now = new Date().toISOString();
      if (res.ok) {
        const file = join(DRAFTS, lang.code, `${topic.slug}.md`);
        mkdirSync(join(DRAFTS, lang.code), { recursive: true });
        const meta = {
          lang: lang.code,
          slug: topic.slug,
          group: topic.group,
          keyword: topic.keyword,
          title: res.meta.title,
          description: res.meta.description,
          h1: res.meta.h1,
          ...ctaMeta(res.meta),
          approved: false,
          generated_at: now,
          model: site.model,
          words: res.words,
          review_local_fit: res.review?.local_market_fit ?? null,
          review_notes: String(res.review?.notes || '').slice(0, 300),
        };
        writeFileSync(file, serializeDoc(meta, res.body));
        Object.assign(topic, { status: 'draft', drafted_at: now, draft: relative(ROOT, file), last_error: undefined });
        report.created.push({ lang: lang.code, slug: topic.slug, title: res.meta.title, words: res.words, file: relative(ROOT, file) });
      } else {
        topic.attempts = (topic.attempts || 0) + 1;
        topic.last_error = res.problems.slice(0, 8).join(' | ').slice(0, 1000);
        topic.last_attempt_at = now;
        report.rejected.push({ lang: lang.code, slug: topic.slug, problems: res.problems });
      }
      saveTopics(topicsData);
    }
  }
  finish(topicsData, report, args, log);
  return report;
}

function finish(topicsData, report, args, log) {
  saveTopics(topicsData);
  const lines = ['## Nye utkast', ''];
  if (report.created.length) {
    for (const c of report.created) lines.push(`- [ ] **${c.lang}** – ${c.title} (${c.words} ord) – \`${c.file}\``);
  } else lines.push('Ingen.');
  if (report.rejected.length) {
    lines.push('', '## Stoppet av kvalitetskontrollen (ikke lagret)', '');
    for (const r of report.rejected) lines.push(`- **${r.lang}/${r.slug}**: ${r.problems.slice(0, 5).join('; ')}`);
  }
  if (report.skipped.length) lines.push('', '## Hoppet over', '', ...report.skipped.map((s) => `- ${s}`));
  const md = lines.join('\n') + '\n';
  if (args.report) writeFileSync(args.report, md);
  log(`\n${md}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`[generate] ${e.message}`);
    process.exit(1);
  });
}
