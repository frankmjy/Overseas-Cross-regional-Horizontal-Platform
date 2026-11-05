import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { projects, filterDocuments, filterMeetings, meetingMetrics } from '../knowledge/web/data.mjs';
import { renderLibraryOverview } from '../knowledge/web/overview.mjs';
import { meetingMonthNow, renderMeetingOverview, renderMeetingCalendar, renderMeetingFollowups } from '../knowledge/web/meetings-overview.mjs';
import {libraryScopes,libraryMetrics,libraryDocuments} from '../knowledge/library-model.mjs';
import {handoverStages,operationsCategories,documentLifecycle,lifecycleDocuments} from '../knowledge/lifecycle.mjs';
import {visibleDirectory,directoryDocuments} from '../knowledge/directory.mjs';

async function fixture(overrides = {}) {
  const uiContext=vm.createContext({libraryScopes,libraryMetrics,libraryDocuments,handoverStages,operationsCategories,documentLifecycle,lifecycleDocuments,visibleDirectory,directoryDocuments,URL,URLSearchParams});
  vm.runInContext((await readFile(new URL('../knowledge/web/library-ui.mjs',import.meta.url),'utf8')).replace(/^import .+;\r?\n/gm,'').replace(/^export /gm,''),uiContext);
  const nodes = new Map();
  const document = {
    title: '',
    querySelectorAll() { return []; },
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', textContent: '', addEventListener() {} });
      return nodes.get(selector);
    }
  };
  const context = vm.createContext({ document, location: { search: '', pathname: '/knowledge-sharing' },
    history: { replaceState() {} }, addEventListener() {}, URLSearchParams,
    currentPageEditable:()=>true,projects, filterDocuments, filterMeetings, meetingMetrics, renderLibraryOverview,libraryDocuments,primeDocumentOptions:()=>Promise.resolve(),
    renderLibraryShell:uiContext.renderLibraryShell,renderDocumentCards:uiContext.renderDocumentCards,renderTemplateEntries:uiContext.renderTemplateEntries,
    selectedProject:{id:'th-001',name:'泰国 Araya 项目',knowledgeKey:'thailand'},
    meetingMonthNow, renderMeetingOverview, renderMeetingCalendar, renderMeetingFollowups,
    handoverStages,operationsCategories,documentLifecycle,lifecycleDocuments,visibleDirectory,directoryDocuments,
    renderPlatformHeader: active => `<header data-active="${active}"></header>` });
  const source = (await readFile(new URL('../knowledge/web/app.mjs', import.meta.url), 'utf8'))
    .replace(/^import .+;\r?\n/gm, '').replace('const platformProject = await requirePlatformProject();','const platformProject = selectedProject;').replace(/render\(\);load\(\)(?:\.then\([\s\S]*)?;\s*$/, '');
  vm.runInContext(source, context);
  context.fixture = {
    documents: [{ id: 'doc', title: '真实资料', category: 'standards', subcategory: '规范', specialty: '电气', summary: '', date: '', sourceName: '标准', tags: [], sections: [] }],
    meetings: [{ id: 'meeting', project: 'thailand', title: '项目会议', summary: '', date: '2026-10-24', time: '', type: '', links: [], actions: [], participants: [], decisions: [] }],
    categories: [{ id: 'standards', name: '01 Standards（标准与界面）' }],
    feed: { state: 'ready', errors: [], updatedAt: '2026-10-24T10:00:00Z' }, ...overrides
  };
  vm.runInContext('({documents, meetings, categories, feed} = fixture);', context);
  return { nodes, table:uiContext.renderDocumentCards, render(view = 'library',selection={}) { context.view = view;context.selection=selection; vm.runInContext('state={...state,...selection,view};render();', context); } };
}

test('compact knowledge layout keeps classification, search and refresh together without repeated heroes', async () => {
  const f = await fixture(); f.render();
  const page = f.nodes.get('#app').innerHTML;
  assert.match(page, /knowledge-toolbar/);
  assert.match(page, /aria-label="资料分类"/);
  assert.match(page, /aria-label="搜索知识资料"/);
  assert.match(page, /aria-label="刷新数据"/);
  assert.equal((page.match(/<h1>/g) || []).length, 1);
  assert.doesNotMatch(page, /knowledge-hero|library-search|category-grid|module-nav/);
  assert.match(f.nodes.get('#results').innerHTML, /真实资料/);
  assert.doesNotMatch(f.nodes.get('#results').innerHTML, /详见源表|<p><\/p>/);
});

test('actual knowledge page exposes lifecycle chapters and handbook stages instead of ownership as primary cards', async () => {
  const f = await fixture(); f.render();
  const page=f.nodes.get('#app').innerHTML;
  assert.match(page,/接维篇/);assert.match(page,/运维篇/);assert.match(page,/选址阶段/);assert.match(page,/项目筹备/);assert.match(page,/反馈优化/);
  assert.doesNotMatch(page,/chapter-card|knowledge-entry-grid/);
  assert.match(page,/nature-tags/);
});

test('handover stage uses actual document natures instead of displaying handbook task folders', async () => {
  const document={id:'spec',title:'UPS技术规格',libraryScope:'shared',classification:'S1.3.3',category:'shared',subcategory:'设备技术规格',nature:'设备技术规格',date:'',tags:[],sections:[],links:[]};
  const f=await fixture({documents:[document]});f.render('library',{scope:'handover',stage:'1',group:'s1g3',folder:'S1.3.3'});
  const page=f.nodes.get('#app').innerHTML;
  assert.match(page,/设备技术规格/);
  assert.match(f.nodes.get('#results').innerHTML,/UPS技术规格/);
  assert.doesNotMatch(page,/任务描述|海外差异化|任务要点|交付物|lifecycle-folders|S1\.1\.2|用工成本与预算测算/);
  assert.match(f.nodes.get('#results').innerHTML,/document-group-toggle/);
  assert.match(f.nodes.get('#results').innerHTML,/material-grid/);
  assert.doesNotMatch(f.nodes.get('#results').innerHTML,/<table/);
});

test('compact material cards omit empty metadata and collapsed groups preserve their counts', async () => {
  const f=await fixture();
  const rows=[{id:'a',title:'UPS',nature:'设备技术规格',specialty:'电气',date:'2026-11-01',links:[]}];
  const mobile=f.table(rows,{compact:true});
  assert.match(mobile,/material-card/);assert.doesNotMatch(mobile,/<table|更新日期|file-date|file-specialty/);
  const collapsed=f.table(rows,{collapsedGroups:['设备技术规格']});
  assert.match(collapsed,/aria-expanded="false"/);assert.match(collapsed,/设备技术规格<\/span><b>1<\/b>/);
  assert.doesNotMatch(collapsed,/class="material-card"/);
});

test('compact meetings follow login project and omit empty summary filler', async () => {
  const f = await fixture(); f.render('meetings');
  const page = f.nodes.get('#app').innerHTML;
  assert.match(page, /泰国 Araya 项目/); assert.doesNotMatch(page,/class="project-tabs"/);
  assert.match(page, /data-active="meetings"/);
  assert.doesNotMatch(page, /module-nav/);
  assert.match(page, /meeting-dashboard-layout/);
  assert.match(f.nodes.get('#results').innerHTML, /项目会议/);
  assert.doesNotMatch(f.nodes.get('#results').innerHTML, /源表暂未填写|<p><\/p>/);
  assert.match(f.nodes.get('#pending-actions').innerHTML, /暂无跟进事项/);
});

test('compact toolbar retains explicit external read errors', async () => {
  const f = await fixture({ feed: { state: 'partial', errors: [{ name: '会议', message: '读取超时' }] } }); f.render();
  assert.match(f.nodes.get('#app').innerHTML, /role="alert"/);
  assert.match(f.nodes.get('#app').innerHTML, /读取超时/);
});

test('empty user categories appear under the selected chapter and parent, and category selection filters documents',async()=>{
 const nodes=[{id:'root',name:'交付文件',chapter:'operations',parentId:'',project:'thailand'},{id:'child',name:'移交清单',chapter:'operations',parentId:'root',project:'thailand'}];
 const f=await fixture({documents:[{id:'d',title:'移交资料',directoryId:'child',lifecycle:{chapter:'operations'},libraryScope:'project',projectScope:'泰国',nature:'清单',links:[],sections:[],tags:[]}],feed:{state:'ready',errors:[],directoryNodes:nodes}});
 f.render('library',{scope:'operations',directory:'root'});const page=f.nodes.get('#app').innerHTML;assert.match(page,/交付文件/);assert.match(page,/directory-children/);assert.match(page,/移交清单/);assert.match(f.nodes.get('#results').innerHTML,/移交资料/);
});
