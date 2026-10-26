// Shared visual elements from the approved A template.
import { groupTopics } from '/research/topics.mjs';
import { topicProgress } from '/research/topic-progress.mjs';
import { nextPollDelay } from '/research/sync-policy.mjs';
import { renderPlatformHeader } from '/src/platform-navigation.js';
import { renderComparisonEntry, comparisonForQuestion, createImageDiagram } from '/src/diagram-viewer.js';
import { researchProjects, questionDestination, researchApiUrl, pendingPrefix } from '/research/project-scope.mjs';
import { rangeOptions, matchesResearchRange, rangeProjectKeys, questionTarget, mergeProjectSnapshots } from '/research/unified-research.mjs';
const requestedProject=new URLSearchParams(location.search).get('project');
const project=researchProjects.some(p=>p.key===requestedProject)?requestedProject:'malaysia';
const defaultScope=()=>rangeProjectKeys(state.ranges).length===1?rangeProjectKeys(state.ranges)[0]:project;
const snapshots = {};
let projectOptions = [];
let data = null;
const app = document.querySelector('#app');
const dialog = document.querySelector('#detailDialog');
const editor = document.querySelector('#editDialog');
let teamComparisonViewer = null;
let questionMap = new Map(), findingsByQuestion = new Map(), evidenceByQuestion = new Map(), companyMap = new Map();
let state = { category: '全部专题', categories: null, ranges: rangeOptions.map(r=>r.key), query: '', filter: 'all', companies: [], page: 1, pageSize: 0, density: 'compact' };
let renderedViewKey = '';
let operations = [], currentDetail = null, formState = null, refreshPending = false;
let lastSync = '', statusMessage = '', polling = false, initialAttempts = 0;
let pollTimer = null, pollFailures = 0;
let disposePreview = null;
let attachmentContext = null, pdfModule = null, warmTimer;
const warming = new Map();
const uploadBatches = new Map(), activeUploads = new Set();
const syncBadge = sync => !sync || sync.status === 'success' ? '' : `<span class="record-sync ${['error', 'blocked'].includes(sync.status) ? 'failed' : 'pending'}" title="${esc(sync.error || '')}">${['error', 'blocked'].includes(sync.status) ? '同步失败' : sync.status === 'waiting_upload' ? '附件待上传' : '同步中'}</span>`;
const topicStatus = name => Object.hasOwn(data.topicSync || {}, name) ? data.topicSync[name] : null;
const loadPDF = () => pdfModule ||= import('/research/pdf-viewer.mjs').catch(error => { pdfModule = null; throw error; });
const downloadUrl = e => `${e.url}${e.url.includes('?') ? '&' : '?'}download=1`;
const feishuView = (e, label = '在飞书中查看', cls = 'primary-button') => (e.id.startsWith('local-')||e.id.includes(':local-')) ? '<span class="record-sync pending">附件后台同步中</span>' : link(e.feishuUrl || data.baseUrl, `${label} ${icon('external')}`, cls);

const paths = {
  edit: '<path d="m16 3 5 5-12 12H4v-5zM14 5l5 5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  external: '<path d="M14 3h7v7m0-7L10 14"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  file: '<path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8m-8 4h6"/>',
  paperclip: '<path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8a7 7 0 0 1 10 10l-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16m6-10v10"/>',
  book: '<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-4c0-4 12-4 12 0v4M17 4a3 3 0 0 1 0 6m2 5c2 0 3 1 3 3v3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 1-1 2-1 2m0 3h.01"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6z"/><path d="m8 12 3 3 5-6"/>',
  box: '<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5m-9 5v10M7 4l9 5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
  home: '<path d="m2 11 10-9 10 9M5 9v12h14V9m-10 12v-8h6v8"/>',
  building: '<path d="M5 22V2h14v20M2 22h20M9 6h1m4 0h1M9 10h1m4 0h1M9 14h1m4 0h1m-5 8v-4h4v4"/>',
  layers: '<path d="m12 2 10 6-10 6L2 8zM2 12l10 6 10-6M2 16l10 6 10-6"/>',
  store: '<path d="M3 10v12h18V10M2 10l3-8h14l3 8c0 4-5 4-5 0 0 4-5 4-5 0 0 4-5 4-5 0 0 4-5 4-5 0ZM8 22v-7h8v7"/>',
  activity: '<path d="M2 12h5l3-9 4 18 3-9h5"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
  filter: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v7m0-10h.01"/>',
};
const icon = name => `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.file}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = value => {
  try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : '#'; }
  catch { return '#'; }
};
const link = (url, label, cls = '') => `<a class="${cls}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const meta = name => companyMap.get(name);
const companyMark = name => `<span class="company-mark ${meta(name).color}" aria-hidden="true">${esc(meta(name).code)}</span>`;
const companyLabel = name => [...new Set(rangeProjectKeys(state.ranges).map(key=>meta(name).labels?.[key]||meta(name).displayName||name))].join(' / ')||meta(name).displayName||name;
const materials = id => findingsByQuestion.get(id).filter(f => f.hasMaterial).length;
const getFinding = (id, name) => findingsByQuestion.get(id).find(f => f.company === name);
const getEvidence = (id, name) => evidenceByQuestion.get(id).filter(e => !name || e.company === name);
const sizeLabel = bytes => bytes ? bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB` : '外部引用';
const fileKind = e => e.pendingUpload ? '待上传' : !e.downloadable ? 'LINK' : /image\//.test(e.mime) ? 'IMG' : /\.pdf$/i.test(e.name) ? 'PDF' : /\.xlsx?$/i.test(e.name) ? 'XLS' : /\.pptx?$/i.test(e.name) ? 'PPT' : /\.docx?$/i.test(e.name) ? 'DOC' : /\.(txt|md|csv)$/i.test(e.name) ? 'TXT' : /\.(zip|7z)$/i.test(e.name) ? 'ZIP' : 'FILE';

function filteredQuestions({ ignoreTopics = false } = {}) {
  const query = state.query.trim().toLocaleLowerCase();
  return data.questions.filter(q => {
    if (!matchesResearchRange(q,state.ranges)) return false;
    if (!ignoreTopics && state.categories && !state.categories.includes(q.category)) return false;
    if (state.filter === 'priority' && !q.priority) return false;
    if (state.filter === 'unclassified' && q.category !== '待确认分类') return false;
    if (state.filter === 'gaps' && state.companies.every(name => getFinding(q.id, name).hasMaterial)) return false;
    if (!query) return true;
    return [q.title, q.id, q.category, ...findingsByQuestion.get(q.id).filter(f => state.companies.includes(f.company)).map(f => f.content), ...getEvidence(q.id).filter(e => state.companies.includes(e.company)).map(e => e.name)].join('\n').toLocaleLowerCase().includes(query);
  }).sort((a, b) => data.categories.indexOf(a.category) - data.categories.indexOf(b.category)
    || Number(state.companies.some(name => getFinding(b.id, name).hasMaterial)) - Number(state.companies.some(name => getFinding(a.id, name).hasMaterial)));
}
function renderCategories(horizontal = false) {
  const scoped=data.questions.filter(q=>matchesResearchRange(q,state.ranges));
  const item=c=>`<div class="topic-filter-row ${state.categories?.length===1&&state.categories[0]===c.name?'is-focused':''}"><div class="category-button ${!state.categories||state.categories.includes(c.name)?'selected':''}"><input type="checkbox" aria-label="包含专题：${esc(c.name)}" data-category-check="${esc(c.name)}" ${!state.categories||state.categories.includes(c.name)?'checked':''}><button class="topic-link" data-topic-focus="${esc(c.name)}" aria-pressed="${state.categories?.length===1&&state.categories[0]===c.name}" title="只查看${esc(c.name)}">${esc(c.name)}${syncBadge(topicStatus(c.name))}</button><b>${c.count}</b></div><button class="rename-button" data-rename-topic="${esc(c.name)}" aria-label="修改专题名称：${esc(c.name)}">${icon('edit')}</button></div>`;
  return `<nav class="category-nav ${horizontal ? 'horizontal' : ''}" aria-label="调研专题"><label class="category-button"><input type="checkbox" data-all-categories ${state.categories===null?'checked':''}><span>全部专题</span><b>${scoped.length}</b></label>${groupTopics(data.categories).map(g => `<section class="topic-group" aria-label="${esc(g.name)}"><h3 class="topic-group-title">${esc(g.name)}</h3>${g.topics.map(c => item({ ...c, count: scoped.filter(q => q.category === c.name).length })).join('')}</section>`).join('')}</nav>`;
}
function excerpt(f) {
  if (!f.content.trim() && getEvidence(f.questionId, f.company).some(e => e.pendingUpload)) return '附件待上传';
  if (!f.content.trim()) return f.hasMaterial ? '已收录证据资料，待补充调研文字。' : '';
  if (getEvidence(f.questionId, f.company).some(e => e.name === f.content.trim())) return '已收录原始资料，点开查看文件。';
  if (f.questionId === 'Q-001') {
    const line = f.content.split('\n').find(line => /(?:园区及1号楼合计|人员合计：|6\. 人员合计：)/.test(line));
    if (line) return line.replace(/^6\.\s*/, '');
  }
  return f.content.replace(/\s+/g, ' ').trim();
}
function matrixPage(list) {
  const pageSize = [25, 50].includes(state.pageSize) ? state.pageSize : 0;
  const pages = pageSize ? Math.max(1, Math.ceil(list.length / pageSize)) : 1;
  state.page = Math.max(1, Math.min(state.page, pages));
  const start = pageSize ? (state.page - 1) * pageSize : 0;
  return { rows: pageSize ? list.slice(start, start + pageSize) : list, pageSize, pages, start };
}
function renderMatrix(list) {
  const { rows, pageSize } = matrixPage(list);
  let lastCategory;
  return `<div class="comparison-shell density-${state.density}"><div class="table-scroll" tabindex="0" role="region" aria-label="调研横向对比，可滚动查看"><table class="comparison-table" style="--company-count:${state.companies.length}"><caption class="sr-only">问题与调研对象的原始材料对比，点击摘要查看完整内容，点击加号补充调研</caption><colgroup><col class="question-col">${state.companies.map(() => '<col>').join('')}</colgroup><thead><tr><th scope="col"><span class="table-heading">调研问题</span></th>${state.companies.map(name => `<th scope="col" class="company-column ${meta(name).color}"><div class="company-heading">${companyMark(name)}<span>${esc(companyLabel(name))}</span><button class="rename-button" data-rename-company="${esc(name)}" aria-label="修改调研对象名称：${esc(companyLabel(name))}">${icon('edit')}</button></div></th>`).join('')}</tr></thead><tbody>${rows.map(q => {
    const topicQuestions = list.filter(x => x.category === q.category);
    const group = q.category !== lastCategory ? `<tr class="table-group"><td colspan="${state.companies.length + 1}"><div class="group-label"><span class="group-index">${String(data.categories.indexOf(q.category) + 1).padStart(2, '0')}</span><strong>${esc(q.category)}</strong><span class="group-count">${topicQuestions.length} 个问题</span></div></td></tr>` : '';
    lastCategory = q.category;
    return `${group}<tr class="question-row"><th scope="row"><button class="question-button" data-question="${q.id}"><span class="question-kicker">${q.priority ? '<span class="priority-tag">重点</span>' : ''}<span class="row-project">${esc(q.projectName)}</span></span><strong>${esc(q.title)}${q.applicability === '通用' ? '<span class="applicability-tag">通用</span>' : ''}</strong>${syncBadge(q.sync)}<span class="question-bottom"><span class="mini-progress">${state.companies.map(name => `<i class="${getFinding(q.id, name).hasMaterial ? 'filled' : ''}"></i>`).join('')}</span>${state.companies.filter(name => getFinding(q.id, name).hasMaterial).length} / ${state.companies.length} ${icon('chevron')}</span></button><button class="rename-button row-rename" data-rename-question="${esc(q.id)}" aria-label="修改问题标题：${esc(q.title)}">${icon('edit')}</button>${renderComparisonEntry(q)}</th>${state.companies.map(name => { const f = getFinding(q.id, name); const docs = getEvidence(q.id, name); return `<td data-company-label="${esc(name)}"><div class="matrix-cell ${f.hasMaterial ? '' : 'empty-cell'}"><button class="answer-cell ${f.hasMaterial ? 'has-material' : 'missing-material'}" ${f.hasMaterial ? `data-question="${q.id}" data-detail-company="${esc(name)}"` : `data-add-finding="${q.id}" data-entry-company="${esc(name)}" aria-label="为 ${esc(q.title)} ${esc(name)} 新增调研内容" title="点击新增调研内容"`}><span class="mobile-company">${companyMark(name)}${esc(companyLabel(name))}</span>${f.hasMaterial ? `<span class="answer-excerpt">${esc(excerpt(f))}</span>${syncBadge(f.sync)}` : '<span class="empty-slash" aria-hidden="true">＋</span>'}</button>${docs.length ? `<div class="cell-attachments"><button class="attachment-chip" data-file="${docs[0].id}" title="${esc(docs[0].name)}"><span class="attachment-kind">${fileKind(docs[0])}</span><span>${esc(docs[0].name)}</span></button><button class="attachment-count" data-files-question="${q.id}" data-files-company="${esc(name)}" aria-label="查看 ${esc(q.title)} ${esc(name)} 全部 ${docs.length} 份资料">${icon('paperclip')}<b>${docs.length}</b>${icon('chevron')}</button></div>` : ''}</div></td>`; }).join('')}</tr>`;
  }).join('')}</tbody></table></div>${renderPagination(list.length, pageSize)}</div>`;
}
function renderPagination(count, pageSize) {
  const pages = pageSize ? Math.max(1, Math.ceil(count / pageSize)) : 1;
  return `<div class="pagination"><span class="results-summary">${!count ? '0 项' : pageSize ? `${(state.page - 1) * pageSize + 1}–${Math.min(state.page * pageSize, count)} / ${count} 项` : `${count} 项 · 连续浏览`}</span><div class="footer-tools"><button data-deleted-questions>已删除${data.deletedQuestions?.length ? ` (${data.deletedQuestions.length})` : ''}</button><button data-tasks>同步任务</button></div><div class="page-navigation"><select id="rowsPerPage" aria-label="每页显示数量">${[[0,'连续浏览'],[25,'25 条 / 页'],[50,'50 条 / 页']].map(([value,label])=>`<option value="${value}"${pageSize===value?' selected':''}>${label}</option>`).join('')}</select>${pageSize ? `<button class="icon-button" data-page="${state.page - 1}" aria-label="上一页" ${state.page === 1 ? 'disabled' : ''}>${icon('chevron')}</button><select id="pageJump" aria-label="跳转页码">${Array.from({length:pages},(_,index)=>`<option value="${index+1}"${state.page===index+1?' selected':''}>${index+1} / ${pages}</option>`).join('')}</select><button class="icon-button" data-page="${state.page + 1}" aria-label="下一页" ${state.page >= pages ? 'disabled' : ''}>${icon('chevron')}</button>` : ''}</div></div>`;
}
function renderCompanyArticle(id, name) {
  const f = getFinding(id, name);
  const docs = getEvidence(id, name);
  return `<section class="company-article"><div class="company-article-title">${companyMark(name)}<h4>${esc(meta(name).labels?.[questionMap.get(id)?.projectKey]||name)}</h4>${syncBadge(f.sync)}<button class="secondary-button content-correct" data-edit-content>${f.hasMaterial ? '修正并同步' : '新增并同步'}</button></div>${f.content ? `<p class="original-text">${esc(f.content)}</p>` : `<p class="no-content">${f.hasMaterial ? '已收录举证资料，暂未填写调研文字。' : '原表暂未提供这一项的调研材料。'}</p>`}${docs.length ? `<div class="inline-evidence">${docs.map(renderFileRow).join('')}</div>` : ''}${f.proof ? `<p class="original-proof">${esc(f.proof)}</p>` : ''}</section>`;
}
function renderFileRow(e) {
  return `<button class="file-row" data-file="${e.id}" aria-label="查看资料：${esc(e.name)}"><span class="file-symbol ${fileKind(e).toLowerCase()}">${fileKind(e)}</span><span class="file-info"><strong>${esc(e.name)}</strong><small>${sizeLabel(e.size)} · ${esc(e.company)}</small></span><span class="file-open">${icon('external')}</span></button>`;
}
function renderEmpty() {
  return `<div class="empty-state">${icon('search')}<h3>没有找到匹配的内容</h3><p>试试其他关键词，或清除筛选后查看全部调研。</p><button class="primary-button" data-reset>清除筛选</button></div>`;
}
function indexData(next) {
  data = next;
  data.categories = groupTopics(data.categories).flatMap(g => g.topics.map(t => t.name));
  data.questions.sort((a, b) => data.categories.indexOf(a.category) - data.categories.indexOf(b.category));
  questionMap = new Map(data.questions.map(q => [q.id, q]));
  findingsByQuestion = new Map(data.questions.map(q => [q.id, data.findings.filter(f => f.questionId === q.id)]));
  evidenceByQuestion = new Map(data.questions.map(q => [q.id, data.evidence.filter(e => e.questionId === q.id)]));
  companyMap = new Map(data.companies.map(c => [c.name, c]));
  if (!state.companies.length) state.companies = data.companies.map(c => c.name);
  if (!data.categories.includes(state.category)) state.category = '全部专题';
}
function readState() {
  const p = new URLSearchParams(location.search);
  state.category = data.categories.includes(p.get('category')) ? p.get('category') : '全部专题';
  state.categories=p.has('categories')?p.get('categories').split('|').filter(c=>data.categories.includes(c)):state.category==='全部专题'?null:[state.category];
  state.ranges=p.has('ranges')?rangeOptions.filter(r=>p.get('ranges').split(',').includes(r.key)).map(r=>r.key):rangeOptions.map(r=>r.key);
  state.query = (p.get('q') || '').slice(0, 200);
  state.filter = ['all', 'priority', 'gaps', 'unclassified'].includes(p.get('filter')) ? p.get('filter') : 'all';
  state.companies = data.companies.filter((c, i) => !p.has('companies') || p.get('companies').split(',').includes(String(i))).map(c => c.name);
  if (!state.companies.length) state.companies = data.companies.map(c => c.name);
  state.page = 1;
  state.pageSize = [25,50].includes(Number(p.get('rows'))) ? Number(p.get('rows')) : 0;
  state.density = p.get('density') === 'comfortable' ? 'comfortable' : 'compact';
}
function updateUrl() {
  const p = new URLSearchParams();
  if(state.ranges.length!==rangeOptions.length)p.set('ranges',state.ranges.join(','));
  if(state.categories!==null)p.set('categories',state.categories.join('|'));
  if (state.query) p.set('q', state.query);
  if (state.filter !== 'all') p.set('filter', state.filter);
  if (state.pageSize) p.set('rows', state.pageSize);
  if (state.density !== 'compact') p.set('density', state.density);
  if (state.companies.length !== data.companies.length) p.set('companies', data.companies.map((c, i) => state.companies.includes(c.name) ? i : null).filter(i => i !== null).join(','));
  history.replaceState(null, '', `${location.pathname}${p.size ? `?${p}` : ''}`);
}
const timeLabel = value => value ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '尚未同步';
function renderActions() {
  return `<div class="workspace-actions heading-actions">${link(data.baseUrl, `查看多维表 ${icon('external')}`, 'secondary-button')}<button class="secondary-button" data-refresh aria-label="手动同步飞书" ${refreshPending ? 'disabled' : ''}>${icon('activity')}${refreshPending ? '正在同步…' : '手动同步'}</button><button class="secondary-button" data-new-content>补充内容</button><button class="primary-button" data-new-question>＋ 新增问题</button><button class="secondary-button export-button" data-export aria-label="导出当前视图">${icon('download')}</button></div>`;
}
function renderHeader() {
  return `${renderPlatformHeader('research')}<section class="research-heading"><div class="research-project-title"><h1>海外项目调研</h1><fieldset class="research-range"><legend class="sr-only">筛选范围</legend>${rangeOptions.map(p => `<label><input type="checkbox" data-range="${p.key}" ${state.ranges.includes(p.key)?'checked':''}>${esc(p.name)}</label>`).join('')}</fieldset></div>${renderActions()}</section>`;
}
function renderSidebar() {
  return `<aside class="sidebar"><div class="sidebar-heading"><span>专题目录</span><span class="subtle">${data.categories.length} 组</span></div><div class="sidebar-shortcuts"><button class="priority-shortcut ${state.filter === 'priority' ? 'selected' : ''}" data-priority>${icon('star')}优先关注<span>${data.questions.filter(q => q.priority&&matchesResearchRange(q,state.ranges)).length}</span></button></div>${renderCategories()}<div class="sidebar-footer"><button class="new-topic" data-new-topic>＋ 新增专题</button></div></aside>`;
}
function renderControls() {
  return `<div class="workspace-heading"><div class="workspace-title"><h2>调研清单<span id="resultCount" class="count-badge"></span></h2><div id="syncStatus" class="sync-status" role="status"></div><div class="density-picker" role="group" aria-label="表格显示密度"><button data-density="compact" aria-pressed="${state.density==='compact'}" title="紧凑：显示两行摘要">紧凑</button><button data-density="comfortable" aria-pressed="${state.density==='comfortable'}" title="舒展：显示四行摘要">舒展</button></div></div></div><div class="controls"><label class="search-field">${icon('search')}<input id="search" type="search" aria-label="搜索问题、调研内容或资料" placeholder="搜索问题、调研内容或附件…" value="${esc(state.query)}" maxlength="200"><kbd>/</kbd></label><label class="select-control">${icon('filter')}<select id="filter" aria-label="筛选问题状态"><option value="all">全部问题</option><option value="priority">重点问题</option><option value="gaps">未收录完整</option><option value="unclassified">分类待确认</option></select></label><details class="company-picker"><summary>${icon('building')}调研对象 <b>${state.companies.length}</b><span class="down-chevron">⌄</span></summary><div class="company-options"><p>至少选择一个调研对象</p>${data.companies.map(c => `<label><input type="checkbox" data-company="${esc(c.name)}" ${state.companies.includes(c.name) ? 'checked' : ''}>${companyMark(c.name)}<span>${esc(companyLabel(c.name))}</span></label>`).join('')}</div></details></div>`;
}
function renderTopicProgress(items) {
  const summary = topicProgress({ questions: items, findings: data.findings, categories: data.categories, companies: state.companies });
  const overview = topicProgress({ questions: filteredQuestions({ ignoreTopics: true }), findings: data.findings, categories: data.categories, companies: state.companies });
  return `<section class="topic-progress" aria-labelledby="topicProgressTitle"><div class="topic-progress-heading"><h3 id="topicProgressTitle">专题进度</h3><span class="topic-progress-legend">已有数据 / 条目数</span><div class="topic-progress-total"><strong>${summary.percent === null ? '—' : `${summary.percent}%`}</strong><span>${summary.filled} / ${summary.total} 项</span></div></div><div class="topic-progress-grid">${overview.topics.map((topic, index) => `<button type="button" data-topic-focus="${esc(topic.name)}" aria-pressed="${state.categories?.length === 1 && state.categories[0] === topic.name}" class="topic-progress-item ${topic.percent === null ? 'is-empty' : topic.percent === 100 ? 'is-complete' : ''}"><span class="topic-progress-name"><span>${String(index + 1).padStart(2, '0')}</span><strong title="${esc(topic.name)}">${esc(topic.name)}</strong></span><span class="topic-progress-value"><strong>${topic.filled}<small>项</small></strong><span><i> / ${topic.total} 项</i></span></span><span class="topic-progress-track"${topic.percent === null ? '' : ` role="progressbar" aria-label="${esc(topic.name)}已有数据比例" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${topic.percent}" aria-valuetext="${topic.filled} / ${topic.total} 条已有数据"`}><span style="width:${topic.percent || 0}%"></span></span></button>`).join('')}</div></section>`;
}
function renderResults() {
  const scroll = document.querySelector('.table-scroll');
  const position = { top: scroll?.scrollTop || 0, left: scroll?.scrollLeft || 0 };
  const viewKey = JSON.stringify([state.categories,state.ranges,state.query,state.filter,state.companies,state.page,state.pageSize,state.density]);
  const items = filteredQuestions();
  document.querySelector('#resultCount').textContent = `${items.length} 项`;
  document.querySelector('#topicProgress').innerHTML = renderTopicProgress(items);
  document.querySelector('#results').innerHTML = items.length ? renderMatrix(items) : `<div class="comparison-shell">${renderEmpty()}${renderPagination(0,state.pageSize)}</div>`;
  const nextScroll = document.querySelector('.table-scroll');
  if (nextScroll && viewKey === renderedViewKey) { nextScroll.scrollTop = position.top; nextScroll.scrollLeft = position.left; }
  renderedViewKey = viewKey;
}
function renderPage() {
  const focus = document.activeElement?.id, selection = document.activeElement?.selectionStart;
  const focusTopic = document.activeElement?.dataset.topicFocus, focusDensity = document.activeElement?.dataset.density;
  const oldTable = document.querySelector('.table-scroll'), oldViewKey = renderedViewKey;
  const position = { top: oldTable?.scrollTop || 0, left: oldTable?.scrollLeft || 0, topics: document.querySelector('.category-nav')?.scrollTop || 0 };
  const picker = document.querySelector('.company-picker')?.open;
  app.innerHTML = `${renderHeader()}<main class="page-container"><div id="workspace" class="workspace" tabindex="-1">${renderSidebar()}<section class="main-panel" aria-label="调研内容">${renderControls()}<div id="topicProgress"></div><div id="results" aria-live="polite"></div></section></div></main>`;
  document.querySelector('#filter').value = state.filter;
  if (picker) document.querySelector('.company-picker').open = true;
  renderResults(); renderSyncStatus(); updateUrl();
  const table = document.querySelector('.table-scroll');
  if (table && oldViewKey === renderedViewKey) { table.scrollTop = position.top; table.scrollLeft = position.left; }
  document.querySelector('.category-nav').scrollTop = position.topics;
  if (focus && document.getElementById(focus)) { const target = document.getElementById(focus); target.focus({ preventScroll: true }); if (selection != null && target.setSelectionRange && target.type !== 'search') target.setSelectionRange(selection, selection); }
  else if (focusTopic || focusDensity) [...document.querySelectorAll('[data-topic-focus],[data-density]')].find(button => focusTopic ? button.dataset.topicFocus === focusTopic : button.dataset.density === focusDensity)?.focus({ preventScroll: true });
}
function renderQuestionStepper(id) {
  const items = filteredQuestions(), index = items.findIndex(question => question.id === id);
  if (index < 0) return '';
  return `<div class="question-stepper" aria-label="连续查看问题"><button class="secondary-button" data-detail-step="-1" ${index===0?'disabled':''}>上一个问题</button><small>${index+1} / ${items.length}</small><button class="secondary-button" data-detail-step="1" ${index===items.length-1?'disabled':''}>下一个问题</button></div>`;
}
function renderSyncStatus() {
  const target = document.querySelector('#syncStatus'); if (!target) return;
  const failed = operations.filter(o => ['error', 'blocked'].includes(o.status)), pending = operations.filter(o => ['accepted', 'syncing', 'waiting_upload'].includes(o.status));
  const message = data.syncError || statusMessage || (refreshPending ? '正在从飞书读取最新数据…' : `最近同步 ${timeLabel(data.syncedAt)}`);
  target.innerHTML = `<span class="${data.syncError || statusMessage ? 'sync-error' : ''}">${esc(message)}</span>${pending.length || failed.length ? `<button data-tasks>${pending.length} 项后台任务 · ${failed.length} 项失败 ${icon('chevron')}</button>` : ''}`;
}
function showQuestion(id, company) {
  const q = questionMap.get(id); if (!q) return;
  disposePreview?.(); disposePreview = null;
  attachmentContext = null;
  currentDetail = { id, company: companyMap.has(company) ? company : state.companies[0] };
  const qurl = q.baseUrl;
  dialog.className = 'detail-dialog';
  dialog.innerHTML = `<div class="dialog-heading"><div><span class="question-kicker"><span class="category-chip">${esc(q.category)}</span>${q.priority ? '<span class="priority-tag">重点</span>' : ''}</span><h2 id="dialogTitle">${esc(q.title)}</h2></div><button class="icon-button dialog-close" data-close aria-label="关闭问题详情">${icon('close')}</button></div><div class="detail-company-tabs" role="tablist" aria-label="选择调研对象">${data.companies.map(c => `<button role="tab" id="detail-tab-${c.code}" aria-controls="detail-company-panel" aria-selected="${c.name === currentDetail.company}" tabindex="${c.name === currentDetail.company ? 0 : -1}" data-tab-company="${esc(c.name)}">${companyMark(c.name)}${esc(c.labels?.[q.projectKey]||c.short)}<i class="material-dot ${getFinding(q.id, c.name).hasMaterial ? 'available' : ''}"></i></button>`).join('')}</div><div id="detail-company-panel" class="dialog-body" role="tabpanel" aria-labelledby="detail-tab-${meta(currentDetail.company).code}">${renderCompanyArticle(q.id, currentDetail.company)}</div><div class="dialog-footer">${renderQuestionStepper(q.id)}<button class="danger-link" data-delete-question="${q.id}">删除问题</button><button class="primary-button" data-edit-content>补充 / 编辑调研内容</button>${link(qurl, `查看多维表 ${icon('external')}`, 'secondary-button')}</div>`;
  if (!dialog.open) dialog.showModal();
}
function showDeletedQuestions() {
  disposePreview?.(); disposePreview = null; currentDetail = null; attachmentContext = null;
  dialog.className = 'detail-dialog attachment-list-dialog';
  const items = data.deletedQuestions || [];
  dialog.innerHTML = `<div class="dialog-heading"><div><h2 id="dialogTitle">已删除问题</h2></div><button class="icon-button" data-close aria-label="关闭已删除问题">${icon('close')}</button></div><div class="dialog-body deleted-question-list">${items.length ? items.map(q => `<article><div><small>${esc(q.category)}</small><strong>${esc(q.title)}${q.applicability === '通用' ? '<span class="applicability-tag">通用</span>' : ''}</strong>${syncBadge(q.sync)}</div><button class="secondary-button" data-restore-question="${esc(q.id)}">恢复</button></article>`).join('') : '<p class="no-content">暂无已删除问题。</p>'}</div>`;
  if (!dialog.open) dialog.showModal();
}
function showQuestionVisibility(id, deleted) {
  const q = [...data.questions, ...(data.deletedQuestions || [])].find(q => q.id === id); if (!q) return;
  const action = deleted ? '删除' : '恢复';
  dialog.close();
  formState = { kind: 'question-visibility', id: crypto.randomUUID(), phase: 'idle', version: q.version, deleted, action, uploads: [] };
  editor.innerHTML = `<div class="dialog-heading"><div><h2 id="editTitle">${action}调研问题</h2></div><button class="icon-button" data-form-close aria-label="关闭${action}确认">${icon('close')}</button></div><form><div class="dialog-body form-fields"><input type="hidden" name="questionId" value="${esc(q.id)}"><div class="removal-question"><small>${esc(q.category)}</small><strong>${esc(q.title)}</strong></div><p class="removal-impact">${deleted ? '该问题及五个调研对象的内容、附件将从清单移除。飞书保留原记录，可在“已删除”中恢复。' : '恢复该问题，并重新展示原有调研内容和附件。'}</p><div id="formStatus" class="form-status" role="status" aria-live="polite"></div></div><div class="dialog-footer"><button type="button" class="secondary-button" data-form-close>取消</button><button type="submit" id="submitForm" class="${deleted ? 'danger-button' : 'primary-button'}">${action}并同步</button></div></form>`;
  editor.showModal();
}
function showAttachments(id, company) {
  const q = questionMap.get(id); if (!q) return;
  disposePreview?.(); disposePreview = null;
  currentDetail = null; attachmentContext = { id, company };
  const docs = getEvidence(id, company);
  dialog.className = 'detail-dialog attachment-list-dialog';
  dialog.innerHTML = `<div class="dialog-heading"><div><span class="question-kicker">${esc(q.category)}</span><h2 id="dialogTitle">${esc(q.title)} · 附件</h2><p>${esc(company)} · ${docs.length} 份资料</p></div><button class="icon-button" data-close aria-label="关闭附件清单">${icon('close')}</button></div><div class="dialog-body attachment-list">${docs.map(renderFileRow).join('')}</div><div class="dialog-footer"><button class="secondary-button" data-back-question="${id}" data-back-company="${esc(company)}">查看问题详情</button><button class="primary-button" data-list-edit="${id}" data-entry-company="${esc(company)}">补充调研内容</button></div>`;
  if (!dialog.open) dialog.showModal();
}
function showFile(id) {
  const e = data.evidence.find(e => e.id === id); if (!e) return;
  if (e.pendingUpload) { showTasks(); return; }
  if (!e.downloadable) { const a = document.createElement('a'); a.href = safeUrl(e.url); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click(); return; }
  const back = currentDetail, list = attachmentContext;
  disposePreview?.(); disposePreview = null;
  dialog.className = 'detail-dialog image-dialog';
  dialog.innerHTML = `<div class="dialog-heading"><div><span class="question-kicker">${esc(questionMap.get(e.questionId)?.title || '调研附件')} · ${esc(e.company)}</span><h2 id="dialogTitle">${esc(e.name)}</h2></div><button class="icon-button" data-close aria-label="关闭附件预览">${icon('close')}</button></div><div class="attachment-preview">${fileKind(e) === 'IMG' ? `<p class="file-loading" role="status">正在读取附件…</p><img src="${esc(e.url)}" alt="${esc(e.name)}">` : fileKind(e) === 'PDF' ? `<div data-pdf-mount><p class="file-loading">正在准备 PDF 查看器…</p></div>` : `<div class="document-preview">${icon('file')}<h3>${esc(e.name)}</h3><p>${sizeLabel(e.size)} · ${fileKind(e)}</p><p>使用飞书在线阅览，或下载原件。</p>${feishuView(e, '转到飞书阅览')}</div>`}</div><div class="dialog-footer">${list ? `<button class="secondary-button" data-files-question="${list.id}" data-files-company="${esc(list.company)}">返回附件清单</button>` : back ? `<button class="secondary-button" data-back-question="${back.id}" data-back-company="${esc(back.company)}">返回问题详情</button>` : `<button class="secondary-button" data-files-question="${e.questionId}" data-files-company="${esc(e.company)}">查看全部资料</button>`}<div class="preview-actions">${fileKind(e) === 'PDF' ? link(e.url, '浏览器直接阅览', 'secondary-button') : ''}${feishuView(e)}<a class="secondary-button" href="${esc(downloadUrl(e))}">${icon('download')}下载原件</a></div></div>`;
  const img = dialog.querySelector('img');
  const pdf = dialog.querySelector('[data-pdf-mount]');
  if (pdf) loadPDF().then(module => { if (pdf.isConnected) disposePreview = module.mountPDF(pdf, e.url); }).catch(() => { if (pdf.isConnected) pdf.innerHTML = `<div class="document-preview" role="status">${icon('file')}<h3>在线查看组件暂不可用</h3><p>可在飞书中继续阅览，或使用浏览器直接打开 PDF。</p><div class="preview-actions">${feishuView(e, '转到飞书阅览')}${link(e.url, '直接打开 PDF', 'secondary-button')}</div></div>`; });
  if (img) {
    const status = dialog.querySelector('.file-loading');
    const deadline = setTimeout(() => { status.innerHTML = `读取较慢，可以关闭后再打开。<button class="secondary-button" data-file="${esc(e.id)}">重新读取</button>`; }, 25000);
    disposePreview = () => clearTimeout(deadline);
    const ready = () => { clearTimeout(deadline); status.remove(); };
    const failed = () => { clearTimeout(deadline); status.textContent = '附件读取失败，请同步飞书后重新打开，或检查服务器附件下载权限。'; };
    img.addEventListener('load', ready, { once: true }); img.addEventListener('error', failed, { once: true });
    if (img.complete) { if (img.naturalWidth) ready(); else failed(); }
  }
  if (!dialog.open) dialog.showModal();
}
const statusLabels = { accepted: '后台同步中', syncing: '后台同步中', waiting_upload: '附件待上传', blocked: '等待前置记录', success: '已同步成功', error: '同步失败', unconfirmed: '提交结果待确认' };
function taskLabel(operation) {
  const projectName=researchProjects.find(p=>p.key===operation.project)?.name||'';
  const label=operation.label||'名称修改';
  const question=[...data.questions,...(data.deletedQuestions||[])].find(q=>q.projectKey===operation.project&&label.includes(q.sourceId));
  return `${projectName} · ${question?label.replace(question.sourceId,question.title):label}`;
}

let taskSignature = '';
function showTasks() {
  currentDetail = null; dialog.className = 'detail-dialog';
  taskSignature = JSON.stringify(operations);
  dialog.innerHTML = `<div class="dialog-heading"><div><h2 id="dialogTitle">同步任务</h2><p>业务记录已保存到服务器，飞书在后台同步。</p></div><button class="icon-button" data-close aria-label="关闭同步任务">${icon('close')}</button></div><div class="dialog-body task-list">${operations.length ? operations.map(o => `<article><div><b>${esc(taskLabel(o))}</b><span class="task-state ${o.status}">${statusLabels[o.status]}</span></div><small>${timeLabel(o.createdAt)}</small>${o.error ? `<p class="sync-error">${esc(o.error)}</p><button class="secondary-button" data-retry="${o.id}" data-task-project="${o.project}">重试失败步骤</button>` : ''}${(o.uploads || []).filter(upload => !upload.ready).map(upload => `<label class="upload-resume">${esc(upload.name)} · ${sizeLabel(upload.size)}<span>${esc(upload.error || '文件尚未传到服务器，可选择原文件补传。')}</span><input type="file" data-upload-task="${o.id}" data-task-project="${o.project}" data-upload-id="${upload.id}" aria-label="补传 ${esc(upload.name)}"></label>`).join('')}</article>`).join('') : '<p>暂无同步任务。</p>'}</div>`;
  if (!dialog.open) dialog.showModal();
}
function categoriesForScope(scope) {
  const destination = questionDestination(scope).project;
  return snapshots[destination]?.categories || [];
}
function renderScopeField() {
  return `<label>归属<select name="scope" required aria-label="问题归属">${researchProjects.map(p => `<option value="${p.key}" ${p.key === defaultScope() ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}<option value="common">通用</option></select></label>`;
}
editor.addEventListener('change', event => {
  if (event.target.name !== 'scope') return;
  const select = editor.querySelector('select[name="category"]'), selected = select.value;
  select.innerHTML = categoriesForScope(event.target.value).map(c => `<option ${c === selected ? 'selected' : ''}>${esc(c)}</option>`).join('');
});
function showForm(kind, questionId, company) {
  if (dialog.open) dialog.close();
  if (kind === 'finding' && !data.questions.length) { toast('请先新增调研问题'); return; }
  const qid = questionId || filteredQuestions()[0]?.id || data.questions[0]?.id;
  const name = company || state.companies[0];
  formState = { kind, id: crypto.randomUUID(), phase: 'ready', uploads: [], version: kind === 'finding' ? getFinding(qid, name).version : '', questionId: qid, company: name };
  editor.innerHTML = `<div class="dialog-heading"><div><h2 id="editTitle">${kind === 'question' ? '新增调研问题' : kind === 'topic' ? '新增专题' : '补充调研内容'}</h2></div><button class="icon-button" data-form-close aria-label="关闭编辑表单">${icon('close')}</button></div><form id="researchForm"><div class="dialog-body form-fields">${kind === 'topic' ? `<label>项目<select name="project">${researchProjects.map(p=>`<option value="${p.key}" ${p.key===defaultScope()?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label>专题名称<input name="name" required maxlength="60" placeholder="输入专题名称"></label><label>专题说明<textarea name="description" maxlength="2000" rows="4" placeholder="说明调研范围和关注点（选填）"></textarea></label>` : kind === 'question' ? `${renderScopeField()}<label>调研问题<textarea name="title" required maxlength="1000" rows="3" placeholder="输入要向各调研对象了解的问题"></textarea></label><label>所属专题<select name="category" required>${categoriesForScope(defaultScope()).map(c => `<option ${c === state.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label><label class="checkbox-label"><input name="priority" type="checkbox">标记为重点问题</label>` : `<div class="form-pair"><label>调研问题<select name="questionId">${data.questions.map(q => `<option value="${q.id}" ${q.id === qid ? 'selected' : ''}>${esc(q.projectName)} · ${esc(q.title)}</option>`).join('')}</select></label><label>调研对象<select name="company">${data.companies.map(c => `<option ${c.name === name ? 'selected' : ''}>${esc(c.displayName||c.name)}</option>`).join('')}</select></label></div><label>调研内容<textarea name="content" maxlength="50000" rows="9" placeholder="填写调研事实、访谈记录或相关说明">${esc(getFinding(qid, name).content)}</textarea></label><label>举证补充说明<textarea name="proof" maxlength="20000" rows="3">${esc(getFinding(qid, name).proof)}</textarea></label><label>新增附件（最多 10 份，单个不超过 64 MB）<input name="files" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.7z,.txt,.csv,.md"></label><div id="selectedFiles" class="form-hint">现有 ${getEvidence(qid, name).length} 份附件及引用保留。</div>`}<div id="formStatus" class="form-status" role="status" aria-live="polite"></div></div><div class="dialog-footer"><button type="button" class="secondary-button" data-form-close>取消</button><button class="primary-button" id="submitForm" type="submit">保存</button></div></form>`;
  editor.showModal();
}
function showNameEditor(kind,key){
  const q=kind==='question-title'?questionMap.get(key):null;
  if(kind==='question-title'&&!q)return;
  if(dialog.open)dialog.close();
  const value=q?.title||(kind==='company-rename'?meta(key).displayName||key:key);
  formState={kind,renameKey:key,id:crypto.randomUUID(),phase:'ready',uploads:[],version:q?.version};
  const title=kind==='question-title'?'修改问题标题':kind==='topic-rename'?'修改专题名称':'修改调研对象名称';
  editor.innerHTML=`<div class="dialog-heading"><h2 id="editTitle">${title}</h2><button class="icon-button" data-form-close aria-label="关闭编辑">${icon('close')}</button></div><form><div class="dialog-body form-fields">${q?`<p class="row-project">${esc(q.projectName)}</p>`:`<label>同步范围<select name="renameProject"><option value="all">泰国、马来项目</option>${researchProjects.map(p=>`<option value="${p.key}">${esc(p.name)}</option>`).join('')}</select></label>`}<label>名称<input name="name" required maxlength="${q?1000:60}" value="${esc(value)}"></label><div id="formStatus" class="form-status" role="status" aria-live="polite"></div></div><div class="dialog-footer"><button type="button" class="secondary-button" data-form-close>取消</button><button id="submitForm" class="primary-button" type="submit">保存并同步</button></div></form>`;
  editor.showModal();editor.querySelector('[name="name"]').focus();
}
async function submitNameEdit(form){
  const submission=formState;
  try{
    if(!submission.batch){
      const values=Object.fromEntries(new FormData(form)),name=values.name?.trim();if(!name)throw Error('请填写名称。');
      const q=submission.kind==='question-title'?questionMap.get(submission.renameKey):null;
      const targets=q?[q.projectKey]:researchProjects.filter(p=>values.renameProject==='all'||p.key===values.renameProject).filter(p=>submission.kind!=='topic-rename'||snapshots[p.key].categories.includes(submission.renameKey)).map(p=>p.key);
      if(!targets.length)throw Error('所选范围没有该专题。');
      submission.batch=targets.map(key=>{const payload={kind:submission.kind,project:key,clientMutationId:crypto.randomUUID(),name};if(q)Object.assign(payload,{questionId:q.sourceId,version:q.version});else if(submission.kind==='topic-rename')payload.oldName=submission.renameKey;else{payload.company=submission.renameKey;payload.oldName=snapshots[key].companies.find(c=>c.name===submission.renameKey)?.displayName||submission.renameKey;}return {payload,accepted:false};}).filter(item=>item.payload.kind==='question-title'||item.payload.oldName!==item.payload.name);
      if(!submission.batch.length){submission.batch=null;throw Error('名称未变化。');}
      for(const item of submission.batch)localStorage.setItem(`${pendingPrefix(item.payload.project)}${item.payload.clientMutationId}`,JSON.stringify(item.payload));
    }
    setFormPhase('submitting','正在保存到服务器…');
    for(const item of submission.batch){
      if(item.accepted)continue;
      const result=await post('/api/research/operations',item.payload);item.accepted=true;
      localStorage.removeItem(`${pendingPrefix(item.payload.project)}${item.payload.clientMutationId}`);
      operations.unshift({...result.operation,project:item.payload.project});if(result.data)snapshots[item.payload.project]=result.data;
    }
    if(submission.kind==='topic-rename'&&state.categories?.includes(submission.renameKey))state.categories=[...new Set([...state.categories,submission.batch[0].payload.name])];
    if(submission.kind==='question-title')state.query='';
    indexData(mergeProjectSnapshots(snapshots));renderPage();editor.close();toast('已保存，后台同步中。');pollFailures=0;poll();
  }catch(error){setFormPhase('error',error.message);if(submission.batch)for(const field of editor.querySelectorAll('input,select'))field.disabled=true;}
}
async function request(url, options = {}, targetProject = project) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(researchApiUrl(url, targetProject), { ...options, signal: controller.signal });
    const result = await response.json();
    if (!response.ok || result.ok === false) { const e = new Error(result.error || `请求失败（${response.status}）`); e.status = response.status; throw e; }
    return result;
  } catch (e) { if (e.name === 'AbortError') throw new Error('请求超时，请重试核对结果；重复提交不会重复创建。'); throw e; }
  finally { clearTimeout(timeout); }
}
const post = (url, payload={}, target) => {
  const operationId=/\/operations\/([a-f0-9-]{36})/.exec(url)?.[1];
  if(operationId&&!target&&!payload.project)throw Error('同步任务缺少项目归属，请刷新后重试。');
  const destination=target||payload.project||project;
  return request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,project:destination})},destination);
};
function setFormPhase(phase, message) {
  formState.phase = phase; const locked = ['submitting', 'accepted', 'syncing', 'success'].includes(phase);
  for (const control of editor.querySelectorAll('input,textarea,select,button')) control.disabled = locked;
  document.querySelector('#formStatus').className = `form-status ${phase}`;
  document.querySelector('#formStatus').textContent = message;
  document.querySelector('#submitForm').textContent = phase === 'submitting' ? '正在保存…' : phase === 'success' ? `已${formState.action || '保存'}` : formState.action ? `${formState.action}并同步` : '保存';
}
editor.addEventListener('submit', async event => {
  event.preventDefault(); if (!formState || ['submitting', 'accepted', 'syncing'].includes(formState.phase)) return;
  if(['question-title','topic-rename','company-rename'].includes(formState.kind))return submitNameEdit(event.target);
  const form = event.target, values = Object.fromEntries(new FormData(form));
  const files = form.elements.files ? [...form.elements.files.files] : [];
  if (files.length > 10 || files.some(f => f.size > 64 * 1024 * 1024 || !f.size)) { setFormPhase('error', '附件最多 10 份，单个文件必须为 1 字节至 64 MB。'); return; }
  setFormPhase('submitting', '正在保存到服务器…');
  const submission = formState;
  try {
    if (!formState.payload) {
      if (formState.kind === 'finding') {
        formState.uploads = files.map(file => ({ id: crypto.randomUUID(), ready: false, file }));
      }
      formState.payload = { ...values, kind: formState.kind, clientMutationId: formState.id, priority: values.priority === 'on', version: formState.version, uploadIds: formState.uploads.map(f => f.id) };
      Object.assign(formState.payload, formState.kind === 'question' ? questionDestination(values.scope) : values.questionId ? questionTarget(values.questionId) : {project:values.project||project});
      delete formState.payload.scope;
      if (formState.kind === 'finding') formState.payload.uploadPlans = formState.uploads.map(upload => ({ id: upload.id, name: upload.file.name, size: upload.file.size }));
      if (formState.kind === 'question-visibility') formState.payload.deleted = formState.deleted;
      delete formState.payload.files;
    }
    localStorage.setItem(`${pendingPrefix(formState.payload.project)}${formState.id}`, JSON.stringify(formState.payload));
    const result = await post('/api/research/operations', formState.payload);
    localStorage.removeItem(`${pendingPrefix(formState.payload.project)}${formState.id}`);
    const op = result.operation;
    op.project=formState.payload.project;
    if (!operations.some(o => o.id === op.id)) operations.unshift(op);
    formState.operationId = op.id;
    const snapshot=result.data||(await request('/api/research',{},op.project)).data;
    snapshots[op.project]=snapshot;indexData(mergeProjectSnapshots(snapshots));lastSync=data.revision;
    if (submission.kind === 'question' || submission.kind === 'topic') {
      state.category = submission.payload.category || submission.payload.name; state.categories=[state.category]; state.ranges=rangeOptions.map(r=>r.key); state.query = ''; state.filter = 'all'; state.page = 1;
    }
    formState.phase = op.status; editor.close(); renderPage();
    toast(op.status === 'success' ? '已保存并同步。' : op.status === 'error' || op.status === 'blocked' ? '已保存，同步失败，可在同步任务中重试。' : '已保存，后台同步中。');
    if (submission.uploads.length) transferUploads(op.id, submission.uploads,op.project);
    pollFailures = 0; poll();
  } catch (e) {
    setFormPhase('error', e.message);
    if (submission.uploads.length) uploadBatches.set(`${submission.payload.project}:${submission.id}`, submission.uploads);
    if (formState.payload) { for (const field of editor.querySelectorAll('input,textarea,select')) field.disabled = true; document.querySelector('#formStatus').textContent += ' 当前提交已冻结，重试将核对同一任务。'; }
  }
});
async function transferUploads(operationId, incoming, targetProject) {
  if(!targetProject){toast('附件任务缺少项目归属，请刷新后重试。');return;}
  const batchKey=`${targetProject}:${operationId}`;
  const batch = uploadBatches.get(batchKey) || [];
  for (const item of incoming) { const known = batch.find(upload => upload.id === item.id); if (known) { known.file = item.file; known.ready = item.ready || false; } else batch.push(item); }
  uploadBatches.set(batchKey, batch);
  if (activeUploads.has(batchKey)) return;
  activeUploads.add(batchKey);
  try {
    for (const upload of batch) {
      if (upload.ready) continue;
      try {
        await request(`/api/research/uploads?name=${encodeURIComponent(upload.file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Upload-ID': upload.id }, body: upload.file },targetProject);
        upload.ready = true;
      } catch (error) {
        toast(`文字已保存，${upload.file.name} 上传失败，可在同步任务补传。`);
        try { await post(`/api/research/uploads/${upload.id}/failed`,{},targetProject); } catch { toast('附件传输失败，暂时无法记录失败状态；可在同步任务中核对并补传。'); }
      }
    }
  } finally {
    activeUploads.delete(batchKey);
    if (batch.every(upload => upload.ready)) uploadBatches.delete(batchKey);
    pollFailures = 0; poll();
  }
}
dialog.addEventListener('change', event => {
  const target = event.target;
  if (!target.dataset.uploadTask) return;
  const op = operations.find(item => item.id === target.dataset.uploadTask&&item.project===target.dataset.taskProject), descriptor = op?.uploads?.find(item => item.id === target.dataset.uploadId), file = target.files?.[0];
  if (!descriptor || !file) return;
  if (file.name !== descriptor.name || file.size !== descriptor.size) { toast('文件名称和大小与原附件任务不一致，请重新选择原文件。'); target.value = ''; return; }
  transferUploads(op.id, [{ id: descriptor.id, file, ready: false }],op.project);
});
editor.addEventListener('change', event => {
  if (!formState || formState.payload) return;
  const form = editor.querySelector('form');
  if (['questionId', 'company'].includes(event.target.name)) {
    const f = getFinding(form.elements.questionId.value, form.elements.company.value);
    form.elements.content.value = f.content; form.elements.proof.value = f.proof; formState.version = f.version;
    document.querySelector('#selectedFiles').textContent = `现有 ${getEvidence(f.questionId, f.company).length} 份附件及引用保留。`;
  }
  if (event.target.name === 'files') { formState.uploads = []; document.querySelector('#selectedFiles').textContent = [...event.target.files].map(f => `${f.name}（${sizeLabel(f.size)}）`).join('、') || '未选择新附件。'; }
});
editor.addEventListener('click', e => { if (e.target.closest('[data-form-close]') && !['submitting'].includes(formState?.phase)) editor.close(); });
editor.addEventListener('cancel', e => { if (formState?.phase === 'submitting') e.preventDefault(); });
let toastTimer;
function toast(message) { const target = document.querySelector('#toast'); target.textContent = message; target.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => target.hidden = true, 3000); }
function exportCurrent() {
  const csv = v => `"${(/^[=+\-@]/.test(String(v || '')) ? "'" : '') + String(v ?? '').replaceAll('"', '""')}"`;
  const rows = [['项目', '问题编号', '专题', '问题', ...state.companies.map(n=>companyLabel(n))], ...filteredQuestions().map(q => [q.projectName, q.sourceId, q.category, q.title, ...state.companies.map(name => getFinding(q.id, name).content)])];
  const url = URL.createObjectURL(new Blob(['\ufeff', rows.map(r => r.map(csv).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `海外项目调研-${data.date}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
app.addEventListener('click', async event => {
  const b = event.target.closest('button'); if (!b || b.disabled) return;
  if (b.hasAttribute('data-team-comparison')) {
    const entry=[...questionMap.values()].find(q=>comparisonForQuestion(q));
    if(entry){teamComparisonViewer ||= createImageDiagram();teamComparisonViewer.open(comparisonForQuestion(entry),b);}
  }
  else if (b.dataset.renameTopic) showNameEditor('topic-rename', b.dataset.renameTopic);
  else if(b.dataset.renameCompany) showNameEditor('company-rename', b.dataset.renameCompany);
  else if(b.dataset.renameQuestion) showNameEditor('question-title', b.dataset.renameQuestion);
  else if (b.dataset.addFinding) showForm('finding', b.dataset.addFinding, b.dataset.entryCompany);
  else if (b.dataset.filesQuestion) showAttachments(b.dataset.filesQuestion, b.dataset.filesCompany);
  else if (b.dataset.question) showQuestion(b.dataset.question, b.dataset.detailCompany);
  else if (b.dataset.file) showFile(b.dataset.file);
  else if (b.dataset.category) { state.category = b.dataset.category; state.page = 1; renderPage(); }
  else if (b.dataset.topicFocus) { state.categories = [b.dataset.topicFocus]; state.category = b.dataset.topicFocus; state.page = 1; renderPage(); }
  else if (b.dataset.density) { state.density = b.dataset.density === 'comfortable' ? 'comfortable' : 'compact'; renderPage(); }
  else if (b.dataset.page) { state.page = Number(b.dataset.page); renderResults(); }
  else if (b.hasAttribute('data-priority')) { state.filter = state.filter === 'priority' ? 'all' : 'priority'; state.page = 1; renderPage(); }
  else if (b.hasAttribute('data-home') || b.hasAttribute('data-reset')) { state.category = '全部专题'; state.categories=null; state.ranges=rangeOptions.map(r=>r.key); state.query = ''; state.filter = 'all'; state.page = 1; renderPage(); }
  else if (b.hasAttribute('data-new-topic')) showForm('topic');
  else if (b.hasAttribute('data-new-question')) showForm('question');
  else if (b.hasAttribute('data-new-content')) showForm('finding');
  else if (b.hasAttribute('data-export')) exportCurrent();
  else if (b.hasAttribute('data-tasks')) showTasks();
  else if (b.hasAttribute('data-deleted-questions')) showDeletedQuestions();
  else if (b.hasAttribute('data-refresh')) {
    refreshPending = true; statusMessage = ''; pollFailures = 0; renderPage();
    try { await Promise.all(researchProjects.map(p=>post('/api/research/refresh',{},p.key))); await poll(); } catch (e) { refreshPending = false; statusMessage = e.message; renderPage(); }
  }
});
app.addEventListener('input', e => { if (e.target.id === 'search') { state.query = e.target.value; state.page = 1; renderResults(); updateUrl(); } });
app.addEventListener('change', e => {
  if (e.target.id === 'rowsPerPage') { state.pageSize = [25,50].includes(Number(e.target.value)) ? Number(e.target.value) : 0; state.page = 1; renderResults(); updateUrl(); }
  if (e.target.id === 'pageJump') { state.page = Number(e.target.value); renderResults(); }
  if(e.target.dataset.range){state.ranges=rangeOptions.filter(r=>r.key===e.target.dataset.range?e.target.checked:state.ranges.includes(r.key)).map(r=>r.key);state.page=1;renderPage();}
  if(e.target.hasAttribute('data-all-categories')){state.categories=e.target.checked?null:[];state.page=1;renderPage();}
  if(e.target.dataset.categoryCheck){const selected=state.categories||data.categories;state.categories=data.categories.filter(c=>c===e.target.dataset.categoryCheck?e.target.checked:selected.includes(c));state.page=1;renderPage();}
  if (e.target.id === 'filter') { state.filter = e.target.value; state.page = 1; renderPage(); }
  if (e.target.dataset.company) { if (!e.target.checked && state.companies.length === 1) { e.target.checked = true; toast('至少保留一个调研对象'); return; } state.companies = data.companies.filter(c => c.name === e.target.dataset.company ? e.target.checked : state.companies.includes(c.name)).map(c => c.name); state.page = 1; renderPage(); }
});
dialog.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (b?.hasAttribute('data-close')) dialog.close();
  else if (b?.dataset.detailStep) { const items = filteredQuestions(), index = items.findIndex(q => q.id === currentDetail?.id), next = items[index + Number(b.dataset.detailStep)]; if (next) showQuestion(next.id, currentDetail.company); }
  else if (b?.hasAttribute('data-tasks')) showTasks();
  else if (b?.dataset.deleteQuestion) showQuestionVisibility(b.dataset.deleteQuestion, true);
  else if (b?.dataset.restoreQuestion) showQuestionVisibility(b.dataset.restoreQuestion, false);
  else if (b?.dataset.filesQuestion) showAttachments(b.dataset.filesQuestion, b.dataset.filesCompany);
  else if (b?.dataset.listEdit) showForm('finding', b.dataset.listEdit, b.dataset.entryCompany);
  else if (b?.dataset.backQuestion) showQuestion(b.dataset.backQuestion, b.dataset.backCompany);
  else if (b?.dataset.tabCompany) { showQuestion(currentDetail.id, b.dataset.tabCompany); dialog.querySelector('[aria-selected="true"]').focus(); }
  else if (b?.dataset.file) showFile(b.dataset.file);
  else if (b?.hasAttribute('data-edit-content')) showForm('finding', currentDetail.id, currentDetail.company);
  else if (b?.dataset.retry) { b.disabled = true; try {
    const op = operations.find(o => o.id === b.dataset.retry&&o.project===b.dataset.taskProject);
    if (op?.status === 'unconfirmed') { const payload = JSON.parse(localStorage.getItem(`${pendingPrefix(op.project)}${op.id}`)); if (!payload) throw new Error('本地提交草稿不存在。'); await post('/api/research/operations', payload); localStorage.removeItem(`${pendingPrefix(op.project)}${op.id}`); }
    else await post(`/api/research/operations/${b.dataset.retry}/retry`,{},b.dataset.taskProject);
    const uploads = uploadBatches.get(`${b.dataset.taskProject}:${b.dataset.retry}`);
    if (uploads?.some(upload => !upload.ready)) transferUploads(b.dataset.retry, uploads,b.dataset.taskProject);
    await poll(); showTasks();
  } catch (error) { toast(error.message); b.disabled = false; } }
});
dialog.addEventListener('close', () => { currentDetail = null; attachmentContext = null; disposePreview?.(); disposePreview = null; });
dialog.addEventListener('keydown', e => {
  if (e.target.getAttribute('role') !== 'tab' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); const n = data.companies.length, i = data.companies.findIndex(c => c.name === currentDetail.company);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
  showQuestion(currentDetail.id, data.companies[next].name); dialog.querySelector('[aria-selected="true"]').focus();
});
document.addEventListener('keydown', e => { if (!dialog.open && !editor.open && e.key === '/' && !e.target.closest('input,textarea,select')) { e.preventDefault(); document.querySelector('#search')?.focus(); } });
document.addEventListener('pointerdown', e => { if (!e.target.closest('.company-picker')) document.querySelector('.company-picker')?.removeAttribute('open'); });
function prepareAttachment(event) {
  const button = event.target.closest('[data-file],[data-files-question]');
  if (!button || button.contains(event.relatedTarget)) return;
  clearTimeout(warmTimer);
  const e = button.dataset.file ? data.evidence.find(e => e.id === button.dataset.file) : getEvidence(button.dataset.filesQuestion, button.dataset.filesCompany)[0];
  if (!e?.downloadable || !['IMG', 'PDF'].includes(fileKind(e))) return;
  warmTimer = setTimeout(() => {
    if (fileKind(e) === 'PDF') loadPDF().catch(() => {});
    if (!e.size || e.size > 2 * 1024 * 1024 || warming.has(e.url) || [...warming.values()].filter(x => x === 'loading').length >= 2) return;
    if (warming.size >= 32) { const old = [...warming].find(([, value]) => value === 'ready'); if (old) warming.delete(old[0]); }
    warming.set(e.url, 'loading');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    fetch(e.url, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('预读失败');
      await response.arrayBuffer(); warming.set(e.url, 'ready');
    }).catch(() => { warming.delete(e.url); }).finally(() => clearTimeout(timeout));
  }, 180);
}
for (const surface of [app, dialog]) {
  surface.addEventListener('pointerover', prepareAttachment);
  surface.addEventListener('focusin', prepareAttachment);
  surface.addEventListener('pointerout', event => { const button = event.target.closest('[data-file],[data-files-question]'); if (button && !button.contains(event.relatedTarget)) clearTimeout(warmTimer); });
  surface.addEventListener('focusout', () => clearTimeout(warmTimer));
}
window.addEventListener('popstate', () => { if (data) { readState(); renderPage(); } });
function pollDelay() {
  const pending = operations.some(o => ['accepted', 'syncing'].includes(o.status)) || formState?.operationId && !operations.some(o => o.id === formState.operationId) && ['accepted', 'syncing'].includes(formState.phase);
  return nextPollDelay({ hasData: !!data, refreshing: refreshPending, pending, initialAttempts, failures: pollFailures });
}
async function poll() {
  if (polling) return; polling = true;
  clearTimeout(pollTimer);
  try {
    const batches=await Promise.all(researchProjects.map(async p=>{
      const [result,jobs]=await Promise.all([request('/api/research',{},p.key),request('/api/research/operations',{},p.key)]);
      if(result.data&&result.data.project?.key!==p.key)throw Error(`${p.name}正式数据源不匹配。`);
      if(result.data)snapshots[p.key]=result.data;
      const items=jobs.operations.map(o=>({...o,project:p.key}));
      for(const key of Object.keys(localStorage).filter(k=>k.startsWith(pendingPrefix(p.key))&&/^[a-f0-9-]{36}$/i.test(k.slice(pendingPrefix(p.key).length)))){
        const id=key.slice(pendingPrefix(p.key).length);
        if(items.some(o=>o.id===id)){localStorage.removeItem(key);continue;}
        try{const known=await request(`/api/research/operations/${id}`,{},p.key);items.unshift({...known.operation,project:p.key});localStorage.removeItem(key);}
        catch(e){if(e.status!==404)throw e;const payload=JSON.parse(localStorage.getItem(key));items.unshift({id,project:p.key,kind:payload.kind,label:payload.title||payload.name||payload.questionId,status:'unconfirmed',error:'上次提交未查到受理记录，请重试核对。'});}
      }
      return {result,items};
    }));
    projectOptions=batches[0].result.projects||[];pollFailures=0;operations=batches.flatMap(b=>b.items);
    const complete=researchProjects.every(p=>snapshots[p.key]);
    const result={data:complete?mergeProjectSnapshots(snapshots):null,refreshing:batches.some(b=>b.result.refreshing),state:batches.some(b=>b.result.state==='error')?'error':'loading',error:batches.map((b,i)=>b.result.error?`${researchProjects[i].name}：${b.result.error}`:'').filter(Boolean).join('；')};
    if (result.data) {
      const changed = lastSync !== (result.data.revision || result.data.syncedAt), first = !data;
      indexData(result.data); lastSync = data.revision || data.syncedAt;
      if (dialog.open && [currentDetail?.id, attachmentContext?.id].some(id => id && !questionMap.has(id))) { dialog.close(); disposePreview?.(); disposePreview = null; currentDetail = null; attachmentContext = null; }
      refreshPending = result.refreshing;
      statusMessage = result.error || '';
      if (first) readState();
      if (changed || first) renderPage(); else { renderSyncStatus(); const b = document.querySelector('[data-refresh]'); if (b) { b.disabled = refreshPending; b.innerHTML = `${icon('activity')}${refreshPending ? '正在同步…' : '手动同步'}`; } }
    } else {
      initialAttempts++;
      app.innerHTML = `<div class="initial-loading" role="status"><h2>${result.state === 'error' || initialAttempts >= 15 ? '暂时无法读取调研数据' : '正在读取飞书多维表…'}</h2><p>${esc(result.error || (initialAttempts >= 15 ? '同步耗时较长，请检查服务器应用和多维表配置。' : '首次读取完成后即可使用工作台。'))}</p><button class="secondary-button" data-initial-retry>重新读取</button></div>`;
      document.querySelector('[data-initial-retry]').onclick = async () => { try { initialAttempts = 0; pollFailures = 0; await Promise.all(researchProjects.map(p=>post('/api/research/refresh',{},p.key))); await poll(); } catch (e) { toast(e.message); } };
    }
    if (formState?.operationId && editor.open) {
      const op = operations.find(o => o.id === formState.operationId&&o.project===formState.payload?.project);
      if (op && op.status !== formState.phase) {
        setFormPhase(op.status, op.status === 'success' ? '已同步成功，飞书记录和字段回读校验通过。' : op.status === 'error' ? op.error : '正在同步飞书，可关闭窗口，任务仍会继续。');
        for (const b of editor.querySelectorAll('[data-form-close]')) b.disabled = false;
        if (op.status === 'success') { editor.querySelector('#submitForm').hidden = true; if (formState.kind === 'topic') toast('专题已同步，可以添加调研问题'); }
        if (op.status === 'error') { editor.querySelector('#submitForm').hidden = true; document.querySelector('#formStatus').textContent += ' 请到同步任务重试；内容冲突时刷新后重新编辑。'; }
      }
    }
    if (dialog.open && dialog.querySelector('.task-list') && taskSignature !== JSON.stringify(operations)) showTasks();
  } catch (e) { pollFailures++; statusMessage = pollFailures >= 3 ? `${e.message} 已暂停自动查询，请手动同步重试。` : e.message; if (data) { if (pollFailures >= 3) { refreshPending = false; renderPage(); } else renderSyncStatus(); } else { app.innerHTML = `<div class="initial-loading"><h2>连接失败</h2><p>${esc(statusMessage)}</p><button class="secondary-button" id="retryConnection">刷新页面</button></div>`; document.querySelector('#retryConnection').addEventListener('click', () => location.reload()); } }
  finally { polling = false; const delay = pollDelay(); if (delay !== null && !document.hidden) pollTimer = setTimeout(poll, delay); }
}
poll();
document.addEventListener('visibilitychange', () => { clearTimeout(pollTimer); if (!document.hidden && pollDelay() !== null) poll(); });
