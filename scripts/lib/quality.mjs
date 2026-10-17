// Quality gates for a generated article. Each check returns a list of
// problems (strings, in Norwegian for the owner); an empty list means it
// passed. Any problem stops the draft.
import { CTA_MARKER, appLink, utmProblem } from './links.mjs';
import { linksIn, parseBlocks, parseFaq, splitFaq, toPlainText } from './markdown.mjs';

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

const len = (s) => [...String(s || '')].length;

export function checkMeta(meta) {
  const p = [];
  if (!meta.title || !String(meta.title).trim()) p.push('mangler tittel');
  else if (len(meta.title) > TITLE_MAX) p.push(`tittelen er ${len(meta.title)} tegn (maks ${TITLE_MAX})`);
  if (!meta.description || !String(meta.description).trim()) p.push('mangler meta description');
  else if (len(meta.description) > DESCRIPTION_MAX) p.push(`meta description er ${len(meta.description)} tegn (maks ${DESCRIPTION_MAX})`);
  else if (len(meta.description) < 70) p.push(`meta description er bare ${len(meta.description)} tegn (for kort)`);
  if (!meta.h1 || !String(meta.h1).trim()) p.push('mangler H1');
  return p;
}

export function checkStructure(body) {
  const p = [];
  const { main, faqText } = splitFaq(body);
  const blocks = parseBlocks(main);
  if (blocks.some((b) => b.type === 'h1')) p.push('brødteksten har en H1 (bare én H1, i toppen)');
  const h2 = blocks.filter((b) => b.type === 'h2').length;
  if (h2 < 3) p.push(`bare ${h2} H2-overskrifter (minst 3)`);
  const faq = parseFaq(faqText);
  if (faq.length < 3) p.push(`FAQ-seksjonen har ${faq.length} spørsmål (minst 3)`);
  return p;
}

// Words separated by whitespace. For Vietnamese that counts syllables,
// hence the language's own wordMin/wordMax.
export function wordCount(body) {
  const text = toPlainText(body);
  return text ? text.split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w)).length : 0;
}

export function checkLength(body, lang) {
  const n = wordCount(body);
  if (n < lang.wordMin) return [`for kort: ${n} ord (minst ${lang.wordMin})`];
  if (n > Math.round(lang.wordMax * 1.15)) return [`for lang: ${n} ord (maks ${lang.wordMax})`];
  return [];
}

function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

// Allowed: the app (with the article's UTM tags), internal paths of
// PUBLISHED articles in this language, the landing page, and the market's
// portals. The two app boxes come from the cta_* fields (checkCta).
export function checkLinks(body, { appUrl, siteUrl, internalPaths, portals, requireInternal, campaign }) {
  const p = [];
  const links = linksIn(body);
  const appOrigin = originOf(appUrl);
  const portalOrigins = new Set(portals.map(originOf).filter(Boolean));
  let appLinks = 0;
  let internal = 0;
  for (const { url } of links) {
    const abs = url.startsWith('/') ? siteUrl + url : url;
    const o = originOf(abs);
    if (o === appOrigin) {
      appLinks += 1;
      const bad = campaign ? utmProblem(abs, campaign) : null;
      if (bad) p.push(`webapp-lenke med feil UTM: ${bad}`);
      continue;
    }
    if (o === originOf(siteUrl)) {
      const path = new URL(abs).pathname.replace(/\/?$/, '/');
      if (path === '/' || internalPaths.includes(path)) { if (path !== '/') internal += 1; continue; }
      p.push(`intern lenke til en side som ikke finnes: ${url}`);
      continue;
    }
    if (o && portalOrigins.has(o)) continue;
    p.push(`ekstern lenke som ikke er på tillatt-listen: ${url}`);
  }
  if (appLinks > 1) p.push(`${appLinks} lenker til appen i brødteksten (maks 1 i tillegg til de to app-boksene)`);
  if (requireInternal && internal === 0) p.push('mangler intern lenke til en annen artikkel');
  return p;
}

export const CTA_FIELDS = ['cta_mid_text', 'cta_mid_button', 'cta_end_title', 'cta_end_text', 'cta_end_button'];

// The two app boxes (mid-article and end): their text must be there, the
// mid-article marker must sit between two "## " sections, and the link the
// boxes use (appLink) must carry the article's UTM tags.
export function checkCta(meta, body, { appUrl, slug }) {
  const p = [];
  for (const f of CTA_FIELDS) {
    if (!meta[f] || !String(meta[f]).trim()) p.push(`mangler ${f} (webapp-lenken)`);
  }
  for (const f of ['cta_mid_button', 'cta_end_button']) if (len(meta[f]) > 40) p.push(`${f} er ${len(meta[f])} tegn (maks 40)`);
  for (const f of ['cta_mid_text', 'cta_end_text']) if (len(meta[f]) > 220) p.push(`${f} er ${len(meta[f])} tegn (maks 220)`);
  if (len(meta.cta_end_title) > 70) p.push(`cta_end_title er ${len(meta.cta_end_title)} tegn (maks 70)`);
  if (meta.cta_mid_button && meta.cta_mid_button === meta.cta_end_button && meta.cta_mid_text === meta.cta_end_text) {
    p.push('de to app-boksene har samme tekst');
  }
  const { main } = splitFaq(body);
  const markers = main.split(CTA_MARKER).length - 1;
  if (markers !== 1 || body.split(CTA_MARKER).length - 1 !== 1) p.push(`${markers === 0 ? 'mangler' : 'flere enn én'} ${CTA_MARKER} (app-boksen midt i artikkelen)`);
  else {
    const [before, after] = main.split(CTA_MARKER);
    if (!/^##\s/m.test(before) || !/^##\s/m.test(after)) p.push(`${CTA_MARKER} må stå mellom to «## »-avsnitt`);
  }
  const bad = utmProblem(appLink({ appUrl }, slug), slug);
  if (bad) p.push(`app-boksens lenke har feil UTM: ${bad}`);
  return p;
}

// Prices change, so articles never state them (body and app boxes).
const PRICE_RE = /\d[\d .,]*\s?(?:kr\b|kr\.|,-|kroner|kronor|nok\b|dkk\b|sek\b|eur\b|euro|usd\b|dollar|€|\$|đồng|vnd\b|triệu|nghìn)|[$€£]\s?\d|\d\s*(?:\/|per |pr\.? |om |i |a |mỗi |một )\s?(?:mnd|md\.?|måned|måneden|månad|månaden|month|uke|uge|vecka|week|tháng|tuần)\b/i;
export function checkPrices(texts) {
  const p = [];
  for (const t of texts) {
    for (const s of toPlainText(String(t || '')).match(SENTENCE_RE) || []) {
      if (PRICE_RE.test(s)) p.push(`pris eller beløp: «${s.trim().slice(0, 140)}»`);
    }
  }
  return p;
}

const SENTENCE_RE = /[^.!?\n]+[.!?]?/g;
const PERCENT_RE = /\d+(?:[.,]\d+)?\s?(?:%|prosent\b|procent\b|percent\b|per cent\b|phần trăm)/i;
const CURRENCY_RE = /(?:\d[\d .,]*\s?(?:kr\b|kr\.|kroner|kronor|nok\b|dkk\b|sek\b|eur\b|euro|usd\b|dollar|€|\$|đồng|vnd\b|triệu|tỷ))|(?:[$€£]\s?\d)/i;
const SOURCE_WORDS_RE = /\b(studie[rn]?|undersøkelse[rn]?|undersøgelse[rn]?|undersökning(?:ar|en)?|forskning(?:en)?|statistikk(?:en)?|statistik(?:ken)?|ifølge|enligt|research|study|studies|survey|surveys|according to|statistics)\b|khảo sát|nghiên cứu|thống kê|theo số liệu/i;
const RATIO_RE = /\b\d+\s+(?:av|af|out of|på|trên)\s+\d+\b|\b\d+\s*\/\s*\d+\s+(?:rekrutterer|arbeidsgiver|arbejdsgiver|rekryterare|recruiters|employers)/i;

function isYear(n) { return n >= 1950 && n <= 2039; }

// Statistics-like claims with numbers. Practical numbers ("1–2 pages",
// "3–5 bullet points", years in an example CV) are allowed.
export function checkNumbers(body) {
  const problems = [];
  const text = toPlainText(body);
  for (const s of text.match(SENTENCE_RE) || []) {
    const sentence = s.trim();
    if (!/\d/.test(sentence)) {
      if (/§/.test(sentence)) problems.push(`lovhenvisning: «${sentence.slice(0, 140)}»`);
      continue;
    }
    let why = null;
    if (PERCENT_RE.test(sentence)) why = 'prosent';
    else if (CURRENCY_RE.test(sentence)) why = 'beløp';
    else if (/§/.test(sentence)) why = 'lovhenvisning';
    else if (SOURCE_WORDS_RE.test(sentence)) why = 'tall med henvisning til studie/statistikk';
    else if (RATIO_RE.test(sentence)) why = 'andel («x av y»)';
    else {
      // Thousands with separators, or 5+ digits (names like "Rema 1000"
      // and years in an example CV are fine).
      const big = [...sentence.matchAll(/\b\d{1,3}(?:[ .,]\d{3})+\b|\b\d{5,}\b/g)]
        .map((m) => Number(m[0].replace(/[ .,]/g, '')))
        .filter((n) => !isYear(n));
      if (big.length) why = 'stort tall';
    }
    if (why) problems.push(`${why} uten kilde: «${sentence.slice(0, 140)}»`);
  }
  return problems;
}

// Function words that tell the Scandinavian languages (and English) apart.
const MARKERS = {
  no: ['hva', 'noen', 'mye', 'søknad', 'søknaden', 'søknader', 'gjennom', 'mer', 'etter', 'av', 'deg', 'jobb', 'jobben', 'kanskje', 'hvorfor', 'stillingen', 'vil', 'skal', 'fra', 'ikke'],
  da: ['hvad', 'nogle', 'meget', 'ansøgning', 'ansøgningen', 'ansøgninger', 'gennem', 'mere', 'efter', 'af', 'dig', 'job', 'jobbet', 'måske', 'hvorfor', 'stillingen', 'vil', 'skal', 'fra', 'ikke', 'arbejde', 'gøre', 'nogen', 'hvilke'],
  sv: ['inte', 'och', 'att', 'är', 'jag', 'hur', 'också', 'några', 'mycket', 'ansökan', 'genom', 'kanske', 'vad', 'varför', 'jobbet', 'tjänsten', 'från', 'ska', 'dig', 'arbete', 'göra', 'någon'],
  en: ['the', 'and', 'you', 'your', 'of', 'is', 'that', 'with', 'for', 'not', 'what', 'how', 'this', 'are', 'from'],
};
// Weight only the words that are unique to one language.
const UNIQUE = Object.fromEntries(Object.entries(MARKERS).map(([l, words]) => [l,
  new Set(words.filter((w) => !Object.entries(MARKERS).some(([o, ws]) => o !== l && ws.includes(w))))]));

export function languageScores(text) {
  const tokens = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const scores = Object.fromEntries(Object.keys(UNIQUE).map((l) => [l, 0]));
  for (const t of tokens) for (const [l, set] of Object.entries(UNIQUE)) if (set.has(t)) scores[l] += 1;
  const viChars = /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i;
  const viShare = tokens.length ? tokens.filter((t) => viChars.test(t)).length / tokens.length : 0;
  return { scores, viShare, tokens: tokens.length };
}

export function checkLanguage(body, langCode) {
  const { scores, viShare } = languageScores(toPlainText(body));
  if (langCode === 'vi') {
    return viShare >= 0.3 ? [] : [`teksten ser ikke vietnamesisk ut (bare ${Math.round(viShare * 100)} % ord med vietnamesiske tegn)`];
  }
  if (viShare > 0.1) return ['teksten inneholder mye vietnamesisk'];
  if (!(langCode in scores)) return [];
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const share = scores[langCode] / total;
  if (best !== langCode || share < 0.5) {
    return [`teksten ser ut til å være på feil språk (${best} ${Math.round((scores[best] / total) * 100)} %, ${langCode} ${Math.round(share * 100)} %)`];
  }
  return [];
}

function shingles(text, n = 5) {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + n <= words.length; i += 1) out.add(words.slice(i, i + n).join(' '));
  return out;
}

// Share of this article's 5-word sequences found in an existing page in
// the same language. Templates and FAQ phrasings overlap a little; whole
// passages do not.
export function checkDuplicate(body, title, corpus, { threshold = 0.15 } = {}) {
  const p = [];
  const mine = shingles(toPlainText(body));
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  for (const doc of corpus) {
    if (title && doc.title && norm(doc.title) === norm(title)) p.push(`samme tittel som ${doc.id}`);
    if (!mine.size || !doc.text) continue;
    const theirs = shingles(doc.text);
    let shared = 0;
    for (const s of mine) if (theirs.has(s)) shared += 1;
    const share = shared / mine.size;
    if (share > threshold) p.push(`${Math.round(share * 100)} % av teksten finnes allerede i ${doc.id}`);
  }
  return p;
}

// Words the market must not see (languages.json "bannedTerms"), e.g.
// British school/charity terms in the English articles for Norway.
// "upper secondary school" is the usual English name of videregående and
// is allowed.
export function checkBannedTerms(text, terms = []) {
  const plain = toPlainText(text);
  const p = [];
  for (const term of terms) {
    const re = new RegExp(`(?<![\\p{L}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'giu');
    for (const m of plain.matchAll(re)) {
      if (/secondary school/i.test(term) && /upper\s+$/i.test(plain.slice(Math.max(0, m.index - 6), m.index))) continue;
      p.push(`ord som ikke passer markedet: «${m[0]}»`);
      break;
    }
  }
  return p;
}

// Placeholders and ordinary words that may stand before "skole", "AS" etc.
const ORG_OK = new Set(['x', 'y', 'z', 'abc', 'xyz', 'eksempel', 'example', 'den', 'det', 'din', 'ditt', 'en', 'et', 'ei', 'min', 'mitt',
  'vår', 'vores', 'the', 'a', 'an', 'your', 'my', 'our', 'local', 'lokal', 'lokale', 'samme', 'ny', 'nye', 'hver', 'annen', 'någon',
  'denne', 'dette', 'this', 'that', 'any', 'some', 'ett', 'samma', 'egen', 'egne', 'eget',
  // Generic school types written with capitals in English ("Upper Secondary School").
  'upper', 'secondary', 'lower', 'primary', 'high', 'middle', 'junior', 'vocational', 'international', 'adult', 'language', 'business']);
const ORG_SUFFIX = 'videregående skole|videregående|vgs|ungdomsskole|barneskole|grundskole|skole|skule|gymnasium|gymnasiet|gymnasieskola|skola|skolan|'
  + 'universitet|Universitet|høgskole|Høgskole|högskola|University|College|School|IL|IF|IK|FK|BK|SK|FF|AS|ASA|A/S|ApS|AB|Ltd|Inc|kommune|kommun';
const NAME = "[A-ZÆØÅÄÖÜ][\\p{L}'’-]+";
const ORG_RES = [
  new RegExp(`(?<![\\p{L}])(${NAME}(?: ${NAME})?) (?:${ORG_SUFFIX})(?![\\p{L}])`, 'gu'),
  new RegExp(`(?:Universitetet|Høgskolen|Høgskulen|University|Universität) (?:i|of|på) (${NAME})`, 'gu'),
  new RegExp(`(?:Trường (?:THPT|THCS|Đại học|Cao đẳng)|Đại học|Công ty(?: TNHH| cổ phần)?) (${NAME}(?: ${NAME})?)`, 'gu'),
];
// Well-known chains and employers that turn up in example CVs.
const KNOWN_ORGS = ['Rema 1000', 'Kiwi', 'Coop', 'Meny', 'Bunnpris', 'Joker', 'Elkjøp', 'IKEA', "McDonald's",
  'Burger King', 'Narvesen', '7-Eleven', 'Circle K', 'Vinmonopolet', 'XXL', 'Clas Ohlson', 'Telenor', 'Equinor', 'DNB', 'Posten', 'Netto',
  'Føtex', 'Bilka', 'Lidl', 'ICA', 'Hemköp', 'Willys', 'Systembolaget', 'Matas', 'H&M', 'Starbucks', 'Tesco', 'Walmart', 'Espresso House',
  'NTNU', 'UiO', 'UiB', 'UiT', 'OsloMet', 'NHH', 'NMBU', 'KTH', 'DTU', 'Vinamilk', 'Viettel', 'Vingroup'];

export function checkRealOrganizations(text) {
  const plain = toPlainText(text);
  const found = new Set();
  for (const re of ORG_RES) {
    for (const m of plain.matchAll(re)) {
      if (m[1].split(' ').every((w) => ORG_OK.has(w.toLowerCase()))) continue;
      found.add(m[0]);
    }
  }
  for (const o of KNOWN_ORGS) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u');
    if (re.test(plain)) found.add(o);
  }
  return [...found].map((n) => `ekte organisasjonsnavn i teksten (bruk oppdiktede/generiske navn): «${n}»`);
}

// Sentences that wave at something instead of giving a concrete example.
const VAGUE_RES = [
  /\b(?:each|every) country has (?:its|their) own\b/i,
  /\b(?:varies|vary|differ|differs) (?:from country to country|by country|between countries)\b/i,
  /\bdepending on the country\b/i,
  /\bhvert land har (?:sine|sitt|sin) egn/i,
  /\b(?:varierer|variere) fra land til land\b/i,
  /\bvarje land har (?:sina|sitt|sin) egn/i,
  /\bvarierar (?:mellan länder|från land till land)\b/i,
  /mỗi (?:quốc gia|nước) (?:đều )?(?:có|lại có) .{0,20}riêng/i,
];
export function checkVague(text) {
  const p = [];
  for (const s of toPlainText(text).match(SENTENCE_RE) || []) {
    if (VAGUE_RES.some((re) => re.test(s))) p.push(`vag setning uten konkrete eksempler: «${s.trim().slice(0, 140)}»`);
  }
  return p;
}

// The model reviewer's verdict (see generate.mjs, reviewArticle).
// local_market_fit must be at least 4 of 5.
export function checkReview(review, { minLocalFit = 4 } = {}) {
  if (!review || typeof review !== 'object') return ['mangler språkvurdering fra kontrollen'];
  const p = [];
  if (review.language_correct !== true) p.push(`feil språk ifølge kontrollen (${review.language_detected || 'ukjent'})`);
  if (review.reads_as_translation === true) p.push(`ser oversatt ut: ${String(review.translation_evidence || '').slice(0, 200)}`);
  const fit = Number(review.local_market_fit);
  if (!(fit >= minLocalFit)) p.push(`for lite tilpasset markedet (vurdering ${Number.isFinite(fit) ? fit : '?'} av 5)`);
  for (const c of Array.isArray(review.unverifiable_claims) ? review.unverifiable_claims : []) {
    p.push(`påstand som ikke kan bekreftes: «${String(c).slice(0, 160)}»`);
  }
  if (review.invented_quotes === true) p.push('inneholder sitater som ser oppdiktet ut');
  const list = (k) => (Array.isArray(review[k]) ? review[k] : []).filter((x) => String(x || '').trim());
  for (const o of list('real_organizations')) p.push(`ekte organisasjon/person i eksemplene: «${String(o).slice(0, 100)}»`);
  for (const s of list('vague_sentences')) p.push(`vag setning: «${String(s).slice(0, 160)}»`);
  for (const s of list('cta_overpromises')) p.push(`lover mer enn appen gjør: «${String(s).slice(0, 160)}»`);
  for (const s of list('language_errors')) p.push(`språkfeil: «${String(s).slice(0, 160)}»`);
  for (const s of list('contradictions')) p.push(`motsigelse i rådene: «${String(s).slice(0, 160)}»`);
  return p;
}

export function runChecks({ meta, body, lang, linkContext, corpus, review }) {
  const ctaText = CTA_FIELDS.map((f) => meta[f] || '').join('. ');
  const groups = {
    meta: checkMeta(meta),
    struktur: checkStructure(body),
    lengde: checkLength(body.split(CTA_MARKER).join(' '), lang),
    lenker: checkLinks(body, { ...linkContext, campaign: meta.slug }),
    webapp: checkCta(meta, body, { appUrl: linkContext.appUrl, slug: meta.slug }),
    priser: checkPrices([body, ctaText, meta.title, meta.description]),
    tall: checkNumbers(body),
    språk: checkLanguage(`${body}\n\n${ctaText}`, lang.code),
    duplikat: checkDuplicate(body, meta.title, corpus),
    begreper: checkBannedTerms(`${body}\n\n${ctaText}\n\n${meta.title}. ${meta.description}`, lang.bannedTerms || []),
    organisasjoner: checkRealOrganizations(`${body}\n\n${ctaText}`),
    vagt: checkVague(body),
  };
  if (review !== undefined) groups.kontroll = checkReview(review);
  const problems = Object.entries(groups).flatMap(([k, ps]) => ps.map((x) => `${k}: ${x}`));
  return { ok: problems.length === 0, problems, words: wordCount(body) };
}
