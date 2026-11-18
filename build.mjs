import { readFile, writeFile, mkdir, cp, readdir, rm, rename, access } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const input = process.argv[2] ? resolve(process.argv[2]) : join(root, '内容底稿.json');
const output = join(root, process.env.BISS_TARGET === 'github' ? 'docs' : 'Netlify上传目录');
const basePath = process.env.BISS_BASE_PATH ?? '/';
if (!/^\/(?:[A-Za-z0-9._-]+\/)*$/.test(basePath)) throw Error('BISS_BASE_PATH 应为带结尾斜杠的网站路径。');
const staging = join(root, '.build-' + randomUUID());
const json = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const [raw, config, baseline] = await Promise.all([
  json(input), json(join(root, '展示配置.json')), json(join(root, '内容底稿.json'))
]);

const sections = {
  about:['研究院概况','ABOUT'],
  research:['科学研究','RESEARCH'],
  news:['新闻实时','NEWS'],
  commentary:['时事评论','COMMENTARY'],
  notices:['重要通知','NOTICES'],
  resources:['资源共享','RESOURCES'],
  events:['学术活动','EVENTS']
};
const categoryMap = {...sections, 'research-updates':['科研动态','RESEARCH NEWS']};
const nav = ['about','research','news','commentary','notices','resources','events'];
const texts = {
  research:'浏览研究院成员公开发表的论文、著作及研究报告。',
  'research-updates':'关注研究院的项目进展与学术交流。',
  news:'白昃研究要闻及研究院动态。',
  commentary:'研究院成员对国际局势与安全议题的观察。',
  notices:'会议、征稿及其他重要事项。',
  resources:'按主题查阅公开资料与研究参考。'
};
const allowedCategories = new Set(Object.keys(texts));
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const printDate = value => String(value || '').replaceAll('-', '.');
const formatBody = value => String(value || '').split(/\n\s*\n/).filter(Boolean).map(s => `<p>${escape(s).replaceAll('\n','<br>')}</p>`).join('');
const arrow = '<span aria-hidden="true">↗</span>';
const pathOf = (section = '') => section ? section+'/' : '';
const articlePath = id => 'articles/'+id+'/';
const siteHost = 'biss.swupl.edu.cn';
function externalUrl(value) {
  if (!value) return '';
  let u;
  try { u = new URL(value); } catch { throw Error('来源链接格式无效：'+value); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw Error('来源链接必须是 HTTP 或 HTTPS：'+value);
  return u.href;
}
const linkOut = (url,label,cls='') => url ? `<a class="${cls}" href="${escape(externalUrl(url))}" target="_blank" rel="noopener noreferrer">${escape(label)} ${arrow}</a>` : '';
const onSite = url => Boolean(url && new URL(url).hostname === siteHost);
const publicSource = source => source?.replace(/白昃战略研究院\s*(?:[·｜|]\s*)?原站(?:\s*[·｜|]\s*研究院简介)?/g, '白昃战略研究院');
const topics = [['zzly','政治领域'],['jjly','经济领域'],['whly','文化领域'],['swly','生物领域'],['kjly','科技领域']];

if (!raw.about?.intro || !Array.isArray(raw.entries) || (raw.schemaVersion != null && raw.schemaVersion !== 2)) {
  throw Error('输入应为内容底稿或白昃 V2 导出的内容备份。');
}
const about = {...baseline.about,...raw.about};
const publicEntries = raw.schemaVersion === 2
  ? raw.entries.filter(row => !row.archived && row.published).map(row => ({...row.published,id:row.id}))
  : raw.entries.filter(row=>row.status==='published');
const entries = publicEntries.map(row => {
  const {id, category, date, title, author, source, url, videoUrl, summary, content, pinned} = row;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id || '') || typeof title !== 'string' || !title.trim() ||
      !allowedCategories.has(category) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) {
    throw Error('发现无法发布的条目，请检查编号、标题、日期和栏目：'+id);
  }
  const publishedUrl = externalUrl(url);
  return {id, category, date, title, author, source:publicSource(source), legacyUrl:onSite(publishedUrl) ? publishedUrl : '',
    url:onSite(publishedUrl) ? '' : publishedUrl, videoUrl:externalUrl(videoUrl), summary, content, pinned};
});
if (new Set(entries.map(x=>x.id)).size !== entries.length) throw Error('已发布内容存在重复编号。');
entries.sort((a,b)=>b.date.localeCompare(a.date));
function listFor(key) {
  const list=entries.filter(x=>x.category===key);
  return key==='notices' ? list.sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)) : list;
}
const assetNames = await readdir(join(root,'assets'));
for (const value of Object.values(config.covers)) {
  if (!assetNames.includes(value.file)) throw Error('封面图缺失：'+value.file);
}
const gallery = config.gallery ?? {order:[],items:{}};
for (const [id, item] of Object.entries(gallery.items)) {
  if (!/^[a-z0-9-]+$/.test(id) || !assetNames.includes(item.file)) throw Error('图文资料编号或图片不正确：'+id);
}
if (gallery.order.some(id=>!Object.hasOwn(gallery.items,id))) throw Error('图文资料顺序包含未知编号。');
const school = 'https://www.swupl.edu.cn/';

function page({prefix,title,current,description,body}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${escape(description || '西南政法大学白昃战略研究院，关注区域国别、国际问题与全球安全治理。')}">
<title>${title ? escape(title)+'｜' : ''}白昃战略研究院</title>
<link rel="icon" href="${prefix}assets/mark.svg" type="image/svg+xml">
<link rel="stylesheet" href="${prefix}assets/site.css">
<script defer src="${prefix}assets/site.js"></script>
</head>
<body>
<a class="skip" href="#main">跳至正文</a>
<header class="header"><div class="wrap mast">
  <a class="brand" href="${prefix || './'}" aria-label="白昃战略研究院首页"><img src="${prefix}assets/brand.png" alt="" width="146" height="35"><span><strong>白昃战略研究院</strong><small>西南政法大学 · 国家安全学院</small></span></a>
  <div class="mast-links">${linkOut(school,'学校主页')}<a class="nav-search" href="${prefix}search/" ${current==='search'?'aria-current="page"':''}><span class="lens" aria-hidden="true"></span>站内搜索</a></div>
</div><div class="nav-band"><div class="wrap nav-inner"><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-navigation" hidden>栏目导航 <span aria-hidden="true">☰</span></button><nav id="site-navigation" class="main-nav" aria-label="主导航"><a href="${prefix || './'}" ${current==='home'?'aria-current="page"':''}>首页</a>${nav.map(s=>`<a href="${prefix+s}/" ${current===s?'aria-current="page"':''}>${sections[s][0]}</a>`).join('')}</nav></div></div></header>
<main id="main">${body}</main>
<footer class="footer"><div class="wrap footer-inner">
  <div><img src="${prefix}assets/brand.png" alt="白昃战略研究院"><p>西南政法大学 · 国家安全学院</p></div>
  <div><strong>联系研究院</strong><p><a href="tel:02367258452">023-67258452</a></p><p>重庆市渝北区宝圣大道 301 号</p></div>
  <div><strong>相关链接</strong><p>${linkOut(school,'西南政法大学')}</p><p><a href="${prefix}resources/">资源共享</a></p></div>
</div><div class="wrap footer-end">西南政法大学白昃战略研究院</div></footer>
</body>
</html>`;
}
function caption(en,heading,href,label='查看全部') {
  return `<div class="section-title"><div><p class="eyebrow">${en}</p><h2>${heading}</h2></div>${href ? `<a class="text-link" href="${href}">${label} <span aria-hidden="true">→</span></a>`:''}</div>`;
}
const empty = message => `<p class="empty">${message}</p>`;
function rows(items,prefix,emptyMessage='暂无相关内容。',filterable=false) {
  return items.length ? `<div class="list">${items.map(x=>`<a class="row" href="${prefix+articlePath(x.id)}" ${filterable ? `data-entry data-year="${x.date.slice(0,4)}" data-category="${x.category}" data-query="${escape([x.title,x.source,x.author,x.summary,x.content].filter(Boolean).join(' '))}"`:''}>
    <time datetime="${x.date}">${printDate(x.date)}</time>
    <div><h3>${x.pinned?'<span class="chip">置顶</span> ':''}${escape(x.title)}</h3><p>${escape(x.source || categoryMap[x.category][0])}${x.videoUrl?' · 视频':''}</p></div>
    <span class="row-arrow" aria-hidden="true">→</span></a>`).join('')}</div>` : empty(emptyMessage);
}
function cover(x,prefix,extra='') {
  const data = config.covers[x?.id];
  return data ? `<img class="${extra}" src="${prefix}assets/${escape(data.file)}" alt="${escape(data.alt)}" ${extra==='hero-image'?'fetchpriority="high"':'loading="lazy"'}>` : '';
}
const feature = entries.find(x=>x.id===config.featured);
const weekly = listFor('news').find(x=>x.url && new URL(x.url).hostname==='mp.weixin.qq.com');
const research = listFor('research')[0];
const notice = listFor('notices');
const editorialSelection = (config.selections || []).map(id=>entries.find(x=>x.id===id)).filter(Boolean);
const selections = [...new Set([...editorialSelection, weekly, research, listFor('commentary')[0]].filter(Boolean))].slice(0,3);
function brief(x) {
  const tag = categoryMap[x.category][0];
  return `<article class="feature-card"><a class="preview-link" href="${articlePath(x.id)}">
    <span class="card-meta"><span>${tag}</span><time datetime="${x.date}">${printDate(x.date)}</time></span>
    <h3>${escape(x.title)}</h3><p>${escape(x.summary || x.source)}</p>
    <span class="card-more">阅读详情 <span aria-hidden="true">→</span></span>
  </a></article>`;
}
const opening = `<section class="hero"><div class="wrap hero-grid">
 <div class="hero-text"><p class="eyebrow">BAIZE INSTITUTE FOR STRATEGIC STUDIES</p>
  <h1>白昃战略研究院</h1><p class="tagline">立足区域国别研究<br>关注全球安全与治理</p>
  <div class="actions"><a class="button solid" href="about/">走进研究院 <span aria-hidden="true">→</span></a><a class="button hero-secondary" href="research/">浏览科研成果 <span aria-hidden="true">↗</span></a></div>
 </div>
 ${feature && config.covers[feature.id] ? `<figure class="hero-visual"><a class="hero-preview" href="${articlePath(feature.id)}"><span class="hero-picture">${cover(feature,'','hero-image')}</span>
  <span class="hero-caption"><span class="poster-tag">学术活动 · ${printDate(config.forum.date)}</span><strong>${escape(config.forum.title)}</strong><span class="preview-note">${escape(config.forum.summary)}</span><span class="hero-arrow" aria-hidden="true">↗</span></span>
 </a></figure>` : `<div class="hero-campus"></div>`}
</div></section>`;
const home = opening + `<div class="portal-strip"><nav class="wrap portal-grid" aria-label="快捷入口">
  <a href="news/"><strong>新闻实时</strong><span>研究院动态与白昃要闻</span><i aria-hidden="true">↗</i></a>
  <a href="research/"><strong>科学研究</strong><span>论文、报告与研究进展</span><i aria-hidden="true">↗</i></a>
  <a href="events/"><strong>学术活动</strong><span>会议报道与学术交流</span><i aria-hidden="true">↗</i></a>
  <a href="notices/"><strong>重要通知</strong><span>会议预告与公告</span><i aria-hidden="true">↗</i></a>
</nav></div><div class="wrap">
 <section class="block home-feature">${caption('IN FOCUS','精选内容')}
  ${selections.length ? `<div class="feature-grid">${selections.map(brief).join('')}</div>` : empty('暂无精选内容。')}</section>
 <div class="news-grid block"><section>${caption('LATEST NEWS','新闻实时','news/')}${rows(listFor('news').slice(0,4),'')}</section>
 <section>${caption('NOTICES','重要通知','notices/')}${rows(notice.slice(0,3),'','暂无公开通知。')}</section></div>
 <section class="block directions">${caption('RESEARCH AREAS','研究方向','about/','研究院概况')}
  <div class="direction-grid">${config.directions.map(x=>`<article><h3>${escape(x.name)}</h3><p>${escape(x.description)}</p></article>`).join('')}</div>
 </section>
</div>`;

function top(title,en,desc,prefix) {
  return `<div class="page-top"><div class="wrap"><p class="crumb"><a href="${prefix}">首页</a> <span>›</span> ${escape(title)}</p><p class="eyebrow">${escape(en)}</p><h1>${escape(title)}</h1>${desc?`<p>${escape(desc)}</p>`:''}</div></div>`;
}
function filters(items,prefix, search=false) {
  if (!items.length) return empty('暂无相关内容。');
  const years = [...new Set(items.map(x=>x.date.slice(0,4)))].sort().reverse();
  const categories = [...new Set(items.map(x=>x.category))];
  return `<div data-filter><form class="filter" data-controls hidden>
  <label>关键词<input name="q" type="search" maxlength="100" placeholder="输入标题、作者或来源"></label>
  <label>年份<select name="year"><option value="">全部年份</option>${years.map(y=>`<option>${y}</option>`).join('')}</select></label>
  ${search ? `<label>栏目<select name="category"><option value="">全部栏目</option>${categories.map(c=>`<option value="${c}">${categoryMap[c][0]}</option>`).join('')}</select></label>`:''}
  <button type="submit" class="button solid">${search?'搜索':'筛选'}</button>
  <button type="reset" class="button line">清除</button>
  </form><p class="filter-status" aria-live="polite" data-count>${items.length} 条内容</p>${rows(items,prefix,'',true)}
  <p class="empty" data-empty hidden>没有找到符合条件的内容。</p></div>`;
}
function sectionPage(key) {
  const prefix='../';
  const [title,en]=categoryMap[key];
  const resources = key==='resources' ? `<nav class="resource-links" aria-label="资源分类">${topics.map(([slug,label])=>`<a class="button line" href="./${slug}/">${label}</a>`).join('')}</nav>`:'';
  const researchNav = key.startsWith('research') ? `<nav class="subnav" aria-label="科研子栏目"><a href="../research/" ${key==='research'?'aria-current="page"':''}>科研成果</a><a href="../research-updates/" ${key==='research-updates'?'aria-current="page"':''}>科研动态</a></nav>`:'';
  return top(title,en,texts[key],prefix)+`<div class="wrap page-body">${researchNav}${resources}${filters(listFor(key),prefix)}</div>`;
}
const introBlocks = Array.isArray(about.introBlocks) ? about.introBlocks : [];
const introChapters = introBlocks.filter(block=>block.type==='h2' && block.id);
function introBlock(block) {
  const tag = block.type === 'h2' ? 'h3' : block.type === 'h3' ? 'h4' : 'p';
  const id = block.id ? ` id="${escape(block.id)}"` : '';
  const lang = block.lang === 'en' ? ' lang="en"' : '';
  return `<${tag}${id}${lang}>${escape(block.text)}</${tag}>`;
}
function galleryImage(item, prefix, lazy = true) {
  return `<img src="${prefix}assets/${escape(item.file)}" alt="${escape(item.alt)}" width="473" height="314"${lazy?' loading="lazy"':''}>`;
}
function galleryGrid(prefix) {
  return `<div class="gallery-grid">${gallery.order.map(id=>{
    const item = gallery.items[id];
    return `<a class="gallery-card" href="${prefix}about/gallery/${id}/"><span class="gallery-image">${galleryImage(item,prefix)}</span><span class="gallery-caption"><strong>${escape(item.title)}</strong> <span aria-hidden="true">↗</span></span></a>`;
  }).join('')}</div>`;
}
const aboutPage = top('研究院概况','ABOUT THE INSTITUTE','','../')+`<div class="wrap page-body profile-grid">
  <nav class="profile-nav" aria-label="概况页目录"><a href="#introduction">研究院简介</a>${introChapters.map(block=>`<a href="#${escape(block.id)}">${escape(block.text)}</a>`).join('')}${about.team?'<a href="#team">研究团队</a>':''}<a href="#research-areas">研究方向</a>${gallery.order.length?'<a href="gallery/">图文资料 ↗</a>':''}</nav>
  <div class="profile-body prose">
    <article id="introduction"><header class="profile-title"><h2>${escape(about.title || '西南政法大学白昃战略研究院简介')}</h2>
    ${about.date?`<time datetime="${escape(about.date)}">${escape(printDate(about.date))}</time>`:''}</header>
    ${introBlocks.map(introBlock).join('')}
    ${about.introComplete ? '' : formatBody(about.intro)}</article>
    <section id="research-areas"><h2>研究方向</h2><div class="direction-grid mini">${config.directions.map(x=>`<article><h3>${escape(x.name)}</h3><p>${escape(x.description)}</p></article>`).join('')}</div></section>
    ${about.team?`<section id="team"><h2>研究团队</h2>${formatBody(about.team)}</section>`:''}
    ${gallery.order.length?`<section id="gallery"><div class="section-title"><h2>图文资料</h2><a class="text-link" href="gallery/">查看全部 <span aria-hidden="true">→</span></a></div>${galleryGrid('../')}</section>`:''}
  </div>
</div>`;
const galleryPage = top('图文资料','PHOTO ARCHIVE','','../../')+`<div class="wrap page-body"><nav class="subnav" aria-label="研究院概况子栏目"><a href="../">研究院简介</a><a href="./" aria-current="page">图文资料</a></nav>${galleryGrid('../../')}</div>`;
const galleryDetail = (item) => `<article class="wrap article-shell">
  <p class="crumb"><a href="../../../">首页</a> <span>›</span> <a href="../../">研究院概况</a> <span>›</span> <a href="../">图文资料</a></p>
  <h1>${escape(item.title)}</h1><figure class="article-figure gallery-figure">${galleryImage(item,'../../../',false)}<figcaption>图片来源：西南政法大学新闻网</figcaption></figure>
  <div class="actions"><a class="button line" href="../">返回图文资料</a></div>
</article>`;
const eventPage = top('学术活动','ACADEMIC EVENTS','回顾研究院参与和组织的公开学术交流。','../')+`<div class="wrap page-body">
  ${feature ? `<article class="event">${cover(feature,'../')}<div><p class="eyebrow">${printDate(config.forum.date)} · ${escape(config.forum.place)}</p><h2>${escape(config.forum.title)}</h2><p>${escape(config.forum.summary)}</p><p class="small">图片来源 ${linkOut(config.forum.source,'复旦大学中国研究院')}</p><div class="actions"><a class="button solid" href="../${articlePath(feature.id)}">查看报道</a></div></div></article>`:''}
  <section class="block">${caption('ANNOUNCEMENTS','会议与通知','../notices/')}${rows(notice,'../','暂无公开会议通知。')}</section>
</div>`;
function article(x) {
  const prefix='../../';
  const cat=categoryMap[x.category][0];
  const video = x.videoUrl && x.videoUrl.startsWith('https:') ? `<section class="media"><h2>相关视频</h2>
    ${/\.(mp4|webm)$/i.test(new URL(x.videoUrl).pathname) ? `<video src="${escape(x.videoUrl)}" controls playsinline preload="none" aria-label="相关视频"></video>`:''}
    ${linkOut(x.videoUrl,'打开视频来源','text-link')}</section>`:'';
  const related=listFor(x.category).filter(y=>y.id!==x.id).slice(0,3);
  return `<div class="wrap article-shell"><article>
  <p class="crumb"><a href="${prefix}">首页</a> <span>›</span> <a href="${prefix+pathOf(x.category)}">${cat}</a></p>
  <p class="eyebrow">${categoryMap[x.category][1]}</p><h1>${escape(x.title)}</h1>
  <div class="byline"><time datetime="${x.date}">${printDate(x.date)}</time>${[x.author,x.source].filter(Boolean).map(s=>`<span>${escape(s)}</span>`).join('')}</div>
  ${x.summary?`<p class="summary">${escape(x.summary)}</p>`:''}
  ${config.covers[x.id]?`<figure class="article-figure">${cover(x,prefix)}<figcaption>图片来源：${escape(config.covers[x.id].credit)}</figcaption></figure>`:''}
  <div class="prose">${formatBody(x.content)}</div>${video}
  <div class="actions">${linkOut(x.url,'阅读原文','button solid')}<a class="button line" href="${prefix+pathOf(x.category)}">返回${cat}</a></div>
  </article>${related.length ? `<section class="block">${caption('RELATED','同栏阅读')}${rows(related,prefix)}</section>` : ''}</div>`;
}
const searchPage=top('站内搜索','SEARCH','查找已发布的新闻、评论、科研成果和通知。','../')+`<div class="wrap page-body">${filters(entries,'../',true)}</div>`;
const routes = [
  ['index.html',{prefix:'',current:'home',body:home}],
  ['about/index.html',{prefix:'../',title:'研究院概况',current:'about',body:aboutPage}],
  ['about/gallery/index.html',{prefix:'../../',title:'图文资料',current:'about',body:galleryPage}],
  ...Object.entries(gallery.items).map(([id,item])=>[`about/gallery/${id}/index.html`,{prefix:'../../../',title:item.title,current:'about',body:galleryDetail(item)}]),
  ['events/index.html',{prefix:'../',title:'学术活动',current:'events',body:eventPage}],
  ['search/index.html',{prefix:'../',title:'站内搜索',current:'search',body:searchPage}],
  ['404.html',{prefix:basePath,title:'页面未找到',body:`<div class="wrap page-body"><h1>页面未找到</h1><p>请通过导航查找相关栏目。</p><div class="actions"><a class="button solid" href="${basePath}">返回首页</a></div></div>`}],
  ...[...allowedCategories].map(key=>[key+'/index.html',{prefix:'../',title:categoryMap[key][0],current:key==='research-updates'?'research':key,body:sectionPage(key)}]),
  ...topics.map(([slug,label])=>[`resources/${slug}/index.html`,{prefix:'../../',title:label,current:'resources',body:
    top(label,'RESOURCES','','../../')+`<div class="wrap page-body"><nav class="resource-links" aria-label="资源分类"><a class="button line" href="../">全部资料</a>${topics.map(([key,name])=>`<a class="button line" href="../${key}/"${key===slug?' aria-current="page"':''}>${name}</a>`).join('')}</nav>${filters(listFor('resources').filter(x=>config.resourceTopics?.[x.id]===slug),'../../')}</div>`}]),
  ...entries.map(x=>[articlePath(x.id)+'index.html',{prefix:'../../',title:x.title,current:x.category==='research-updates'?'research':x.category,description:x.summary,body:article(x)}])
];

const legacyRoutes = new Map(Object.entries(config.compatibility || {}));
function keepLegacy(url, target) {
  const path = new URL(url).pathname;
  if (path.endsWith('.htm')) legacyRoutes.set(path.slice(1),target);
}
for (const [slug] of topics) legacyRoutes.set(`zygx/${slug}/index.htm`,`resources/${slug}/`);
for (const item of entries) if(item.legacyUrl) keepLegacy(item.legacyUrl,articlePath(item.id));
const introUrl = externalUrl(baseline.about.url);
if (onSite(introUrl)) keepLegacy(introUrl,'about/');
const generatedRoutes = new Set(routes.map(([path])=>path));
for (const [legacy, target] of legacyRoutes) {
  if (!/^[\w/-]+\.htm$/.test(legacy) || !generatedRoutes.has(target+'index.html')) throw Error('旧地址映射无效：'+legacy);
}

await mkdir(staging);
try {
  await cp(join(root,'assets'),join(staging,'assets'),{recursive:true});
  await Promise.all(routes.map(async ([filename, options])=>{
    const full = join(staging, filename);
    await mkdir(dirname(full),{recursive:true});
    await writeFile(full,page(options),'utf8');
  }));
  await Promise.all([...legacyRoutes].map(async ([filename,target])=>{
    const full=join(staging,filename);
    const href=('../'.repeat(filename.split('/').length-1)+target)||'./';
    await mkdir(dirname(full),{recursive:true});
    await writeFile(full,`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${href}"><title>白昃战略研究院</title></head><body><p><a href="${href}">前往白昃战略研究院</a></p></body></html>`,'utf8');
  }));
  await writeFile(join(staging,'_redirects'),[...legacyRoutes].map(([from,to])=>`/${from} /${to} 301!`).join('\n')+'\n','utf8');
  await writeFile(join(staging,'.nojekyll'),'','utf8');
  const backup = join(root, '.previous-' + randomUUID());
  const hasOld = await access(output).then(()=>true,()=>false);
  if (hasOld) await rename(output,backup);
  try { await rename(staging,output); }
  catch (error) {
    if (hasOld) await rename(backup,output);
    throw error;
  }
  if (hasOld) await rm(backup,{recursive:true});
} finally {
  await rm(staging,{recursive:true,force:true});
}
console.log('已生成 '+routes.length+' 个页面，含 '+entries.length+' 篇已发布内容，并兼容 '+legacyRoutes.size+' 个既有地址。');
console.log(relative(root,output));
