// Regenerates the crawler-facing copies of the page content from the DATA/STR blocks in index.html:
//   - JSON-LD (<!-- seo:jsonld --> … <!-- /seo:jsonld -->) for search engines
//   - a <noscript> résumé (<!-- seo:text --> … <!-- /seo:text -->) for crawlers that don't run JavaScript
//   - llms.txt for AI assistants
// Run after editing DATA:  node scripts/build-seo.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const SITE = 'https://yeongyu.me/';
const EMAIL = 'mail@yeongyu.me';
const SAME_AS = ['https://github.com/uygnoey', 'https://www.instagram.com/uygnoey/', 'https://yeongyucareer.notion.site/info'];
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

// pull STR and DATA out of the page script and evaluate them in isolation
const grab = (name) => {
  const start = html.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`${name} not found`);
  let depth = 0, i = html.indexOf('{', start);
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) break;
  }
  return html.slice(html.indexOf('{', start), i + 1);
};
const STR = Function(`return (${grab('STR')})`)();
const DATA = Function(`return (${grab('DATA')})`)();

const L = (v, lang) => (v && typeof v === 'object' && !Array.isArray(v) && ('ko' in v || 'en' in v) ? (v[lang] || v.ko || '') : (v || ''));
const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => strip(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const t = (k, lang) => strip((STR[lang] && STR[lang][k]) || STR.ko[k] || '');
const co = (key, lang) => L(DATA.companies[key], lang);
const projList = (e, lang) => (Array.isArray(e.projects) ? e.projects : L(e.projects, lang) || []);
const stackText = DATA.stack.map((c) => `${c.h}: ${c.lines.map(strip).join(' · ')}`);
const skills = [...new Set(DATA.stack.flatMap((c) => c.lines.map(strip).join(' · ').replace(/\([^)]*\)/g, '').split(/·/).map((s) => s.trim()).filter(Boolean)))];

/* ---------- JSON-LD ---------- */
const person = {
  '@type': 'Person',
  '@id': SITE + '#person',
  name: '양연규',
  alternateName: ['Yeongyu Yang', 'YeonGyu Yang', 'uygnoey'],
  jobTitle: 'Full-Stack Engineer',
  description: t('hero.quote', 'en'),
  url: SITE,
  email: 'mailto:' + EMAIL,
  image: SITE + 'og.png',
  sameAs: SAME_AS,
  worksFor: { '@type': 'Organization', name: 'Oprimed' },
  knowsAbout: skills,
};
const works = DATA.featured.map((f) => ({
  '@type': 'CreativeWork',
  name: L(f.title, 'en'),
  description: L(f.desc, 'en'),
  creator: { '@id': SITE + '#person' },
  sourceOrganization: { '@type': 'Organization', name: L(f.company, 'en') },
  temporalCoverage: f.period.replace(/\s*[—–]\s*/, '/').replace(/\./g, '-'),
  keywords: (f.tech || []).join(', '),
}));
const code = DATA.lab.filter((l) => l.url).map((l) => ({
  '@type': 'SoftwareSourceCode',
  name: l.title,
  description: L(l.desc, 'en'),
  codeRepository: l.url,
  ...(l.metaUrl && l.metaUrl.startsWith('https://') && !l.metaUrl.includes('instagram') ? { url: l.metaUrl } : {}),
  author: { '@id': SITE + '#person' },
}));
const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': SITE + '#website', url: SITE, name: 'Yeongyu Yang · 양연규', inLanguage: ['ko', 'en'], publisher: { '@id': SITE + '#person' } },
    { '@type': 'ProfilePage', '@id': SITE + '#profile', url: SITE, name: t('meta.title', 'ko'), inLanguage: 'ko', dateModified: today, isPartOf: { '@id': SITE + '#website' }, mainEntity: { '@id': SITE + '#person' } },
    person,
    { '@type': 'ItemList', name: 'Selected work', itemListElement: works.map((w, i) => ({ '@type': 'ListItem', position: i + 1, item: w })) },
    { '@type': 'ItemList', name: 'Open source', itemListElement: code.map((c, i) => ({ '@type': 'ListItem', position: i + 1, item: c })) },
  ],
};
const jsonld = `<script type="application/ld+json">\n${JSON.stringify(graph, null, 1).replace(/</g, '\\u003c')}\n</script>`;

/* ---------- noscript résumé ---------- */
const section = (lang) => {
  const exp = DATA.experience.map((e) => {
    const name = L(e.name, lang), alt = L(e.alt, lang);
    const period = e.current ? (lang === 'ko' ? '재직중' : 'Current') : e.period;
    const role = L(e.role, lang);
    const projects = projList(e, lang);
    return `<li><strong>${esc(name)}</strong>${alt ? ` (${esc(alt)})` : ''} · ${esc(period)}${role ? ` · ${esc(role)}` : ''} — ${esc(L(e.summary, lang))}${projects.length ? `<br>${esc(projects.join(', '))}` : ''}</li>`;
  }).join('\n');
  const feat = DATA.featured.map((f) => `<li><strong>${esc(L(f.title, lang))}</strong> · ${esc(L(f.company, lang))} · ${esc(f.period)} — ${esc(L(f.desc, lang))} (${esc((f.tech || []).join(', '))})</li>`).join('\n');
  const lab = DATA.lab.map((l) => `<li><strong>${l.url ? `<a href="${l.url}">${esc(l.title)}</a>` : esc(l.title)}</strong> — ${esc(L(l.desc, lang))}</li>`).join('\n');
  const arc = DATA.projects.map((p) => `<li>${esc(p.period)} · ${esc(L(p.title, lang))} · ${esc(co(p.co, lang))}${p.pl ? ' · PL' : ''} — ${esc(L(p.desc, lang))}</li>`).join('\n');
  const h = lang === 'ko'
    ? { exp: '경력', feat: '주요 프로젝트', lab: '오픈소스 · 개인 프로젝트', arc: '전체 프로젝트', stack: '기술 스택', contact: '연락처' }
    : { exp: 'Experience', feat: 'Selected work', lab: 'Open source & side projects', arc: 'All projects', stack: 'Stack', contact: 'Contact' };
  return `<section lang="${lang}">
<h2>${lang === 'ko' ? '양연규 · Full-Stack Engineer' : 'Yeongyu Yang · Full-Stack Engineer'}</h2>
<p>${esc(t('hero.quote', lang))}</p>
<p>${esc(t('about.p1', lang))}</p>
<h3>${h.exp}</h3>
<ul>
${exp}
</ul>
<h3>${h.feat}</h3>
<ul>
${feat}
</ul>
<h3>${h.lab}</h3>
<ul>
${lab}
</ul>
<h3>${h.arc}</h3>
<ul>
${arc}
</ul>
<h3>${h.stack}</h3>
<ul>
${stackText.map((s) => `<li>${esc(s)}</li>`).join('\n')}
</ul>
<h3>${h.contact}</h3>
<p>Email: ${EMAIL} · GitHub: <a href="https://github.com/uygnoey">github.com/uygnoey</a></p>
</section>`;
};
const noscript = `<noscript><div class="seo-text">\n${section('ko')}\n${section('en')}\n</div></noscript>`;

/* ---------- llms.txt ---------- */
const md = (lang) => {
  const lines = [];
  const T = (ko, en) => (lang === 'ko' ? ko : en);
  lines.push(`## ${T('경력', 'Experience')}`);
  for (const e of DATA.experience) {
    const period = e.current ? T('재직중', 'Current') : e.period;
    const role = L(e.role, lang);
    const projects = projList(e, lang);
    lines.push(`- **${strip(L(e.name, lang))}** (${period}${role ? `, ${strip(role)}` : ''}): ${strip(L(e.summary, lang))}${projects.length ? `. ${T('프로젝트', 'Projects')}: ${projects.map(strip).join(', ')}` : ''}`);
  }
  lines.push('', `## ${T('주요 프로젝트', 'Selected work')}`);
  for (const f of DATA.featured) lines.push(`- **${strip(L(f.title, lang))}** (${strip(L(f.company, lang))}, ${f.period}; ${(f.badges || []).map((b) => strip(L(b, lang))).join(', ')}): ${strip(L(f.desc, lang))} ${T('기술', 'Tech')}: ${(f.tech || []).join(', ')}`);
  lines.push('', `## ${T('오픈소스 · 개인 프로젝트', 'Open source & side projects')}`);
  for (const l of DATA.lab) lines.push(`- ${l.url ? `[${l.title}](${l.url})` : `**${l.title}**`}: ${strip(L(l.desc, lang))}`);
  return lines.join('\n');
};
const llms = `# Yeongyu Yang (양연규) — Full-Stack Engineer

> ${t('hero.quote', 'en')} Korean software engineer working since 2016 across broadcasting, advertising, e-commerce, finance and bio; currently at Oprimed building a data preprocessing solution.

- Website: ${SITE}
- GitHub: https://github.com/uygnoey
- Career document (Notion): https://yeongyucareer.notion.site/info
- Email: ${EMAIL}
- Updated: ${today}

## Quick facts
- Role: Full-Stack Engineer (Java · Spring Boot first; also Kotlin, Go, Python, TypeScript)
- Current: Oprimed — data preprocessing solution (current employer)
- Led as PL: DEEPOMICS FFPE Plus, TheraSTRAND P1 (THERAGEN BIO), EnergyShares JP Admin (Illuminarean)
- Projects on record: ${DATA.projects.length}
- Stack: ${stackText.join(' | ')}

${md('en')}

---

# 양연규 — Full-Stack Engineer (한국어)

> ${t('hero.quote', 'ko')}

${t('about.p1', 'ko')}

${md('ko')}
`;

/* ---------- write ---------- */
const swap = (src, tag, body) => {
  const re = new RegExp(`<!-- seo:${tag} -->[\\s\\S]*?<!-- /seo:${tag} -->`);
  const block = `<!-- seo:${tag} -->\n${body}\n<!-- /seo:${tag} -->`;
  if (!re.test(src)) throw new Error(`marker seo:${tag} missing in index.html`);
  return src.replace(re, block);
};
html = swap(html, 'jsonld', jsonld);
html = swap(html, 'text', noscript);
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(path.join(root, 'llms.txt'), llms);
const sm = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${today}</lastmod>`);
fs.writeFileSync(path.join(root, 'sitemap.xml'), sm);
console.log(`ok: ${DATA.experience.length} jobs, ${DATA.featured.length} featured, ${DATA.lab.length} lab, ${DATA.projects.length} projects`);
