// HTML for article pages (/<lang>/<slug>/) and language hubs (/<lang>/),
// in the same look as the landing page (index.html), which is not touched.
// Fonts: the same system font stack as the landing page; all of these
// fonts cover Vietnamese, and no web fonts are loaded (privacy policy).
import { CTA_MARKER, appLink } from './links.mjs';
import { escapeHtml as e, parseBlocks, parseFaq, renderBlocks, splitFaq } from './markdown.mjs';

const CSS = `
:root{--bg:#F7F5F0;--accent:#E8501A;--accent-dark:#C93F10;--text:#1F1B17;--text-muted:#6B6459;--card-bg:#FFFFFF;--border:#E8E3D9}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans",Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--accent-dark)}
.container{max-width:760px;margin:0 auto;padding:0 20px}
header{padding:24px 0}
.nav-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.logo{font-size:22px;font-weight:800;letter-spacing:-.02em;color:var(--text);text-decoration:none}
.logo .dot{color:var(--accent)}
.brand-tagline{font-size:12px;font-weight:600;color:var(--text-muted);margin-top:2px}
.lang-switch{display:flex;gap:6px;flex-wrap:wrap;font-size:14px}
.lang-switch a,.lang-switch span{padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:var(--card-bg);text-decoration:none;color:var(--text);font-weight:600}
.lang-switch span{border-color:var(--accent);color:var(--accent-dark)}
.crumbs{font-size:14px;color:var(--text-muted);margin:8px 0 20px}
.crumbs a{color:var(--text-muted)}
article{background:var(--card-bg);border:1px solid var(--border);border-radius:20px;padding:36px 32px;box-shadow:0 2px 8px rgba(31,27,23,.04)}
article h1{font-size:clamp(28px,4.5vw,40px);line-height:1.15;letter-spacing:-.02em;font-weight:800;margin-bottom:10px}
.meta-line{font-size:14px;color:var(--text-muted);margin-bottom:24px}
article h2{font-size:24px;line-height:1.25;font-weight:800;margin:36px 0 12px}
article h3{font-size:18px;font-weight:700;margin:24px 0 8px}
article p,article ul,article ol{margin:0 0 16px;font-size:17px}
article ul,article ol{padding-left:24px}
article li{margin-bottom:6px}
blockquote{margin:0 0 16px;padding:14px 18px;border-left:4px solid var(--accent);background:#FBF6F1;border-radius:0 12px 12px 0;font-size:16px}
.faq{margin-top:36px;border-top:1px solid var(--border);padding-top:8px}
.cta{margin:40px 0 0;background:#FBEBE3;border:1px solid #F3D3C0;border-radius:16px;padding:24px}
.cta-mid{margin:28px 0}
.cta-title{font-size:20px;font-weight:800;margin-bottom:8px!important}
.cta p{font-size:16px;margin-bottom:16px}
.cta-actions{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;padding:12px 24px;border-radius:12px;font-weight:700;background:var(--accent);color:#fff;text-decoration:none}
.btn:hover{background:var(--accent-dark)}
.play-link{font-weight:700}
.play-badge img{height:46px;width:auto;display:block}
.other-langs{margin-top:28px;font-size:15px;color:var(--text-muted)}
.hub-list{list-style:none;padding:0}
.hub-list li{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:20px 22px;margin-bottom:14px}
.hub-list a{font-weight:800;font-size:19px;text-decoration:none;color:var(--text)}
.hub-list p{color:var(--text-muted);margin-top:6px;font-size:15px}
.hub-head h1{font-size:clamp(28px,4.5vw,40px);line-height:1.15;font-weight:800;margin-bottom:10px}
.hub-head p{color:var(--text-muted);margin-bottom:28px}
footer{padding:40px 0;text-align:center;font-size:14px;color:var(--text-muted)}
footer a{color:var(--accent-dark);font-weight:600}
.footer-cookie-link{background:none;border:0;padding:0;font:inherit;cursor:pointer;color:inherit;text-decoration:underline}
.cookie-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:1000;max-width:640px;margin:0 auto;background:var(--card-bg);color:var(--text);border:1px solid var(--border);border-radius:14px;box-shadow:0 8px 28px rgba(31,27,23,.18);padding:16px 18px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px}
.cookie-banner[hidden]{display:none}
.cookie-banner p{margin:0;flex:1 1 280px;font-size:14px;line-height:1.45;color:var(--text-muted)}
.cookie-actions{display:flex;gap:10px}
.cookie-btn{font:inherit;font-size:14px;font-weight:600;cursor:pointer;min-width:96px;padding:10px 16px;border-radius:10px;border:1.5px solid var(--accent);background:var(--card-bg);color:var(--accent-dark)}
@media (max-width:520px){article{padding:24px 18px}.cookie-actions{width:100%}.cookie-btn{flex:1}}
`.trim();

// Same consent logic as index.html (Google Consent Mode, GA only after
// "accept"; the choice is shared with the landing page via localStorage).
function consentScript(gaId) {
  if (!gaId) return '';
  return `<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
gtag('js',new Date());gtag('config','${gaId}');
(function(){var KEY='readycv_cookie_consent',MAX=365*864e5;
function read(){try{var c=JSON.parse(localStorage.getItem(KEY)||'null');if(c&&(c.v==='granted'||c.v==='denied')&&Date.now()-c.t<MAX)return c.v}catch(e){}return null}
function save(v){try{localStorage.setItem(KEY,JSON.stringify({v:v,t:Date.now()}))}catch(e){}}
function load(){if(window.__readycvGaLoaded)return;window.__readycvGaLoaded=true;var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${gaId}';document.head.appendChild(s)}
function del(){document.cookie.split(';').forEach(function(c){var n=c.split('=')[0].trim();if(n.indexOf('_ga')!==0)return;['','; domain='+location.hostname,'; domain=.'+location.hostname.replace(/^www\\./,'')].forEach(function(d){document.cookie=n+'=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'+d})})}
function b(){return document.getElementById('cookie-banner')}
window.readycvConsent={accept:function(){save('granted');gtag('consent','update',{analytics_storage:'granted'});load();b().hidden=true},
reject:function(){save('denied');gtag('consent','update',{analytics_storage:'denied'});del();b().hidden=true},open:function(){b().hidden=false}};
var c=read();if(c==='granted'){gtag('consent','update',{analytics_storage:'granted'});load()}else{del();if(c===null)document.addEventListener('DOMContentLoaded',window.readycvConsent.open)}})();
</script>`;
}

function hreflangTags(self, alternates, site) {
  if (!alternates.length) return '';
  const all = [self, ...alternates];
  const tags = all.map((a) => `<link rel="alternate" hreflang="${e(a.hreflang)}" href="${e(site.siteUrl + a.url)}">`);
  const def = all.find((a) => a.lang === 'en') || self;
  tags.push(`<link rel="alternate" hreflang="x-default" href="${e(site.siteUrl + def.url)}">`);
  return tags.join('\n');
}

function langSwitch(self, alternates) {
  if (!alternates.length) return '';
  const items = [self, ...alternates].sort((a, b) => a.order - b.order).map((a) => (a.lang === self.lang
    ? `<span aria-current="page" lang="${e(a.htmlLang)}">${e(a.name)}</span>`
    : `<a href="${e(a.url)}" hreflang="${e(a.hreflang)}" lang="${e(a.htmlLang)}">${e(a.name)}</a>`));
  return `<nav class="lang-switch" aria-label="${e(self.ui.otherLanguages)}">${items.join('')}</nav>`;
}

function head({ lang, title, description, url, site, alternates, self, ogType, jsonLd }) {
  return `<!DOCTYPE html>
<html lang="${e(lang.htmlLang)}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${e(title)}</title>
<meta name="description" content="${e(description)}">
<link rel="canonical" href="${e(site.siteUrl + url)}">
${hreflangTags(self, alternates, site)}
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${e(site.siteUrl + url)}">
<meta property="og:site_name" content="ReadyCV">
<meta property="og:locale" content="${e(lang.ogLocale)}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}">
<meta property="og:image" content="${e(site.siteUrl)}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
${jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
<style>${CSS}</style>
${consentScript(site.gaMeasurementId)}
</head>`;
}

function pageHeader(lang, self, alternates) {
  return `<header>
  <div class="container nav-row">
    <div class="brand">
      <a class="logo" href="/">ReadyCV<span class="dot">.</span></a>
      <div class="brand-tagline">${e(lang.ui.hubTitle)}</div>
    </div>
    ${langSwitch(self, alternates)}
  </div>
</header>`;
}

function pageFooter(lang) {
  const ui = lang.ui;
  return `<footer>
  <div class="container">
    <div>ReadyCV<span style="color:#E8501A">.</span> — © ${new Date().getUTCFullYear()} · <a href="/privacy-policy.html">${e(ui.privacy)}</a> · <button type="button" class="footer-cookie-link" onclick="readycvConsent.open()">${e(ui.cookieSettings)}</button></div>
  </div>
</footer>
<div id="cookie-banner" class="cookie-banner" role="dialog" aria-live="polite" aria-label="${e(ui.cookieLabel)}" hidden>
  <p>${e(ui.cookieText)} <a href="/privacy-policy.html#analyse">${e(ui.cookieMore)}</a>.</p>
  <div class="cookie-actions">
    <button type="button" class="cookie-btn" onclick="readycvConsent.reject()">${e(ui.cookieReject)}</button>
    <button type="button" class="cookie-btn" onclick="readycvConsent.accept()">${e(ui.cookieAccept)}</button>
  </div>
</div>
</body>
</html>
`;
}

// App box: the web app (with UTM tags) as the main link, Google Play as the
// secondary one. data-cta is read by the click event below.
function cta(lang, site, { title, text, button, campaign, position }) {
  const ui = lang.ui;
  const play = lang.code === 'no'
    ? `<a class="play-badge" data-cta="play-${position}" href="${e(site.playUrl)}" target="_blank" rel="noopener" aria-label="${e(ui.playLabel)}"><img src="/google-play-badge-no.png" alt="${e(ui.playLabel)}" width="646" height="250" loading="lazy"></a>`
    : `<a class="play-link" data-cta="play-${position}" href="${e(site.playUrl)}" target="_blank" rel="noopener">${e(ui.playLabel)}</a>`;
  return `<aside class="cta cta-${position}">
  ${title ? `<p class="cta-title">${e(title)}</p>` : ''}
  <p>${e(text)}</p>
  <div class="cta-actions"><a class="btn" data-cta="app-${position}" href="${e(appLink(site, campaign))}" target="_blank" rel="noopener">${e(button)}</a>${play}</div>
</aside>`;
}

// Click on an app box -> GA4 event "article_cta_click" through the page's
// existing gtag. Nothing is sent unless the visitor accepted the cookie
// banner (gtag.js is only loaded then; the queued event is dropped).
function ctaClickScript(slug, langCode) {
  return `<script>
document.addEventListener('click',function(ev){var a=ev.target.closest&&ev.target.closest('a[data-cta]');if(!a||typeof gtag!=='function')return;
gtag('event','article_cta_click',{article_slug:${JSON.stringify(slug)},article_lang:${JSON.stringify(langCode)},cta_position:a.getAttribute('data-cta'),link_url:a.href,transport_type:'beacon'})});
</script>`;
}

function dateLabel(iso, htmlLang) {
  try {
    return new Intl.DateTimeFormat(htmlLang, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function renderArticle({ lang, meta, body, url, self, alternates, site, linkFilter }) {
  const { main, faqText } = splitFaq(body);
  const slug = meta.slug;
  const [beforeCta, ...afterCta] = main.split(CTA_MARKER);
  const midCta = cta(lang, site, { text: meta.cta_mid_text, button: meta.cta_mid_button, campaign: slug, position: 'mid' });
  const mainHtml = afterCta.length
    ? `${renderBlocks(parseBlocks(beforeCta), linkFilter)}\n${midCta}\n${renderBlocks(parseBlocks(afterCta.join('\n')), linkFilter)}`
    : renderBlocks(parseBlocks(main), linkFilter);
  const endCta = cta(lang, site, { title: meta.cta_end_title, text: meta.cta_end_text, button: meta.cta_end_button, campaign: slug, position: 'end' });
  const faq = parseFaq(faqText);
  const ui = lang.ui;
  const published = meta.published_at || meta.generated_at;
  const updated = meta.updated_at || published;
  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.h1 || meta.title,
    description: meta.description,
    inLanguage: lang.htmlLang,
    datePublished: published,
    dateModified: updated,
    mainEntityOfPage: site.siteUrl + url,
    author: { '@type': 'Organization', name: 'ReadyCV', url: site.siteUrl + '/' },
    publisher: { '@type': 'Organization', name: 'ReadyCV', logo: { '@type': 'ImageObject', url: site.siteUrl + '/apple-touch-icon.png' } },
    image: site.siteUrl + '/og-image.png',
  }];
  if (faq.length) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*/g, '') } })),
    });
  }
  const faqHtml = faq.length
    ? `<section class="faq" aria-labelledby="faq"><h2 id="faq">${e(ui.faq)}</h2>\n${renderBlocks(faq.flatMap((f) => [{ type: 'h3', text: f.q }, { type: 'p', text: f.a }]), linkFilter)}</section>`
    : '';
  const others = alternates.length
    ? `<p class="other-langs">${e(ui.otherLanguages)}: ${alternates.map((a) => `<a href="${e(a.url)}" hreflang="${e(a.hreflang)}" lang="${e(a.htmlLang)}">${e(a.title)}</a>`).join(' · ')}</p>`
    : '';
  return `${head({ lang, title: meta.title, description: meta.description, url, site, alternates, self, ogType: 'article', jsonLd })}
<body>
${pageHeader(lang, self, alternates)}
<main class="container">
  <nav class="crumbs"><a href="/">ReadyCV</a> › <a href="/${e(lang.code)}/">${e(ui.articles)}</a></nav>
  <article>
    <h1>${e(meta.h1 || meta.title)}</h1>
    <p class="meta-line">${e(ui.published)} ${e(dateLabel(published, lang.htmlLang))}${updated && updated.slice(0, 10) !== published.slice(0, 10) ? ` · ${e(ui.updated)} ${e(dateLabel(updated, lang.htmlLang))}` : ''}</p>
${mainHtml}
${faqHtml}
${endCta}
${others}
  </article>
</main>
${ctaClickScript(slug, lang.code)}
${pageFooter(lang)}`;
}

export function renderHub({ lang, articles, url, self, alternates, site }) {
  const ui = lang.ui;
  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: ui.hubTitle,
    description: ui.hubDescription,
    inLanguage: lang.htmlLang,
    url: site.siteUrl + url,
  }];
  const list = articles.map((a) => `<li><a href="${e(a.url)}">${e(a.h1 || a.title)}</a><p>${e(a.description)}</p></li>`).join('\n');
  return `${head({ lang, title: `${ui.hubTitle} | ReadyCV`, description: ui.hubDescription, url, site, alternates, self, ogType: 'website', jsonLd })}
<body>
${pageHeader(lang, self, alternates)}
<main class="container">
  <div class="hub-head"><h1>${e(ui.hubTitle)}</h1><p>${e(ui.hubDescription)}</p></div>
  <ul class="hub-list">
${list}
  </ul>
  ${cta(lang, site, { title: ui.ctaTitle, text: ui.ctaText, button: ui.ctaButton, campaign: `oversikt-${lang.code}`, position: 'end' })}
</main>
${ctaClickScript(`oversikt-${lang.code}`, lang.code)}
${pageFooter(lang)}`;
}
