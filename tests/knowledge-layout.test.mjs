import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { projects, filterDocuments, filterMeetings, meetingMetrics } from '../knowledge/web/data.mjs';
import { renderLibraryOverview } from '../knowledge/web/overview.mjs';
import { meetingMonthNow, renderMeetingOverview, renderMeetingCalendar, renderMeetingFollowups } from '../knowledge/web/meetings-overview.mjs';
import { renderMeetingTrail } from '../knowledge/web/meeting-trail.mjs';
import {libraryScopes,libraryMetrics,libraryDocuments,documentSpecialties,regionalOfficeSections,compactDriveDocuments} from '../knowledge/library-model.mjs';
import {handoverStages,operationsCategories,documentLifecycle,lifecycleDocuments} from '../knowledge/lifecycle.mjs';
import {canonicalDirectoryId,visibleDirectory,directoryDocuments,documentDirectory} from '../knowledge/directory.mjs';

test('related file cards collapse by subject without merging vendors, projects, directories or documents',async()=>{
 const {table}=await fixture();
 const row=(id,title,other={})=>({id,title,nature:'设备技术规格',specialty:'暖通',directoryId:'prep:equipment-specifications',libraryScope:'project',projectScope:'泰国',edit:{title},links:[{url:`https://example.com/${id}`}],...other});
 const rows=[row('bac-1','技术审核意见-BAC（第一轮）'),row('bac-2','技术审核意见-BAC （第一轮-2补充）.xlsx'),row('bac-3','技术审核意见-BAC（第一轮）'),row('bacnet','技术审核意见-BACnet（第一轮）'),row('evapco','技术审核意见-EVAPCO（第一轮）'),row('other-project','技术审核意见-BAC（第一轮）',{projectScope:'马来'}),row('other-directory','技术审核意见-BAC（第一轮）',{directoryId:'custom-other'}),row('other-discipline','技术审核意见-BAC（第一轮）',{specialty:'电气'}),row('drawing-01','施工图 ARAYA-A-01'),row('drawing-02','施工图 ARAYA-A-02')];
 const html=table(rows,{limit:4,editable:true});
 assert.equal((html.match(/class="material-series"/g)||[]).length,1);
 assert.match(html,/技术审核意见-BAC<\/span><b>3<\/b>/);
 for(const id of ['bac-1','bac-2','bac-3']){
  assert.ok(html.includes(`href="https://example.com/${id}"`));
  assert.ok(html.includes(`data-edit-document="${id}"`));
 }
 assert.match(html,/加载更多（4 \/ 8）/);
 const search=table(rows.slice(0,3),{selection:{query:'BAC'}});
 assert.doesNotMatch(search,/class="material-series"/);
 assert.equal((search.match(/class="material-card"/g)||[]).length,3);
});

test('云盘归档可下钻到业务子目录，并保留总目录直达',async()=>{
 const {table}=await fixture();
 const parent='https://vnet.feishu.cn/drive/folder/DxRoot';
 const first='https://vnet.feishu.cn/drive/folder/AirCooled';
 const second='https://vnet.feishu.cn/drive/folder/DualCoil';
 const row={id:'dx1',nature:'DX空调',title:'文件',projectScope:'泰国',driveCollection:{title:'DX 空调资料云盘',url:parent}};
 const children=[{name:'风冷精密空调（电力方舱空调）技术文件',url:first},{name:'双盘管空调技术文件',url:second}];
 const options={selection:{directory:'prep:equipment-specifications'},driveFolders:{[parent]:children}};
 const html=table([row],options);
 assert.match(html,/<details class="material-drive-children" open>/);
 assert.match(html,/<span>资料入口<\/span><b>2<\/b>/);
 assert.ok(html.includes('href="'+parent+'"')&&html.includes('href="'+first+'"')&&html.includes('href="'+second+'"'));
 const long=table([row],{...options,driveFolders:{[parent]:Array.from({length:5},(_,i)=>({name:'设备'+i,url:first+i}))}});
 assert.match(long,/<details class="material-drive-children">/);
 assert.doesNotMatch(table([row],{...options,selection:{}}),/双盘管/);
});

async function fixture(overrides = {}) {
  const uiContext=vm.createContext({libraryScopes,libraryMetrics,libraryDocuments,documentSpecialties,regionalOfficeSections,compactDriveDocuments,handoverStages,operationsCategories,documentLifecycle,lifecycleDocuments,visibleDirectory,directoryDocuments,documentDirectory,URL,URLSearchParams});
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
    currentPageEditable:()=>true,projects, filterDocuments, filterMeetings, meetingMetrics, renderLibraryOverview,libraryDocuments,primeDocumentOptions:()=>Promise.resolve(),cancelMinutes(){},readMinutes(){},
    renderLibraryShell:uiContext.renderLibraryShell,renderDocumentCards:uiContext.renderDocumentCards,renderTemplateEntries:uiContext.renderTemplateEntries,
    selectedProject:{id:'th-001',name:'泰国 Araya 项目',knowledgeKey:'thailand'},
    meetingMonthNow, renderMeetingOverview, renderMeetingCalendar, renderMeetingFollowups, renderMeetingTrail,
    handoverStages,operationsCategories,documentLifecycle,lifecycleDocuments,visibleDirectory,directoryDocuments,canonicalDirectoryId,
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
  return { nodes, table:uiContext.renderDocumentCards, render(view = 'library',selection={}) { context.view = view;context.selection=selection; vm.runInContext('state={...state,...selection,view};render();', context); },
    detail(kind,id) { const dialog=nodes.get('#detail'); dialog.querySelector=selector=>selector==='[data-meeting-minutes]'?{addEventListener(){}}:null;dialog.showModal=()=>{};context.detailArgs=[kind,id];vm.runInContext('openDetail(...detailArgs)',context);return dialog.innerHTML; } };
}

test('meeting detail shows one original recording link and omits the source section without it',async()=>{
 const meeting={id:'meeting',title:'例会',summary:'会议结论\n下一步安排',participants:[],actions:[{title:'提交整改报告：补齐验收数据',status:'待办',priority:'P1',owner:'张工',due:'2026-11-20T10:30',structured:true,sourceLink:'https://example.com/action'},{title:'共1条待办（详见会议待办表）',status:'未标注'}],sourceLink:'https://example.com/record',
  links:[{label:'会议纪要',url:'https://example.com/notes'},{label:'会议妙记',url:'https://example.com/minutes/example'},{label:'会议妙记',url:'https://example.com/minutes/other'}]};
 const f=await fixture({meetings:[meeting,{...meeting,id:'without',links:[meeting.links[0]]}]});
 const html=f.detail('meeting','meeting');
 assert.match(html,/<h3>来源<\/h3>/);
 assert.match(html,/href="https:\/\/example\.com\/minutes\/example"/);
 assert.equal((html.match(/<a /g)||[]).length,1);
 assert.match(html,/<h4>待办 <span>1<\/span><\/h4>/);
 assert.match(html,/<strong data-business-text>提交整改报告<\/strong><p data-business-text>补齐验收数据<\/p>/);
 assert.match(html,/<time datetime="2026-11-20T10:30">2026-11-20 10:30<\/time>/);
 assert.match(html,/<details class="followup-group"><summary>历史待办<\/summary>/);
 assert.match(html,/会议结论<\/p><p data-business-text>下一步安排/);
 assert.match(html,/id="meeting-minutes"/);
 assert.doesNotMatch(f.detail('meeting','without'),/class="source-links"/);
});

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

test('project preparation groups source records by topic and keeps project boundaries',async()=>{
 const prep={lifecycle:{chapter:'handover',stage:'1'},libraryScope:'shared',links:[],tags:[],sections:[],date:''};
 const documents=[
  {...prep,id:'spec',title:'变压器',nature:'设备技术规格'},
  {...prep,id:'maintenance',title:'变压器',nature:'运维维保需求规范'},
  {...prep,id:'review',title:'泰国施工图审图意见',nature:'项目规划',libraryScope:'project',projectScope:'泰国',directoryId:'handover:1'},
  {...prep,id:'other-project',title:'马来设备厂验计划',libraryScope:'project',projectScope:'马来'},
  {...prep,id:'domestic',title:'国内设备厂验计划',libraryScope:'domestic'},
  {...prep,id:'explicit',title:'泰国待审施工图',libraryScope:'project',projectScope:'泰国',directoryId:'custom-review'},
  {...prep,id:'general-prep',title:'筹备总体资料'},
 ];
 const directoryNodes=[
  {id:'custom-review',name:'需复核文件',chapter:'handover',parentId:'handover:1',stage:'1',project:'thailand'},
  {id:'empty-custom',name:'用户创建的空目录',chapter:'handover',parentId:'handover:1',stage:'1',project:'thailand'},
 ];
 const f=await fixture({documents,feed:{state:'ready',errors:[],directoryNodes}});
 f.render('library',{scope:'handover',directory:'handover:1'});
 const page=f.nodes.get('#app').innerHTML;
 assert.match(page,/项目筹备<\/span><b>5<\/b>/);
 assert.match(page,/设备技术规格<\/span><b>1<\/b>/);
 assert.match(page,/维保规范<\/span><b>1<\/b>/);
 assert.match(page,/施工图及图审记录<\/span><b>1<\/b>/);
 assert.match(page,/用户创建的空目录<\/span><b>0<\/b>/);
 assert.doesNotMatch(page,/data-directory-node="prep:factory-inspection"/);
 assert.equal(f.nodes.get('#doc-count').textContent,'5 份');
 f.render('library',{scope:'handover',directory:'prep:drawing-review'});
 assert.equal(f.nodes.get('#doc-count').textContent,'1 份');
 assert.match(f.nodes.get('#results').innerHTML,/泰国施工图审图意见/);
 assert.doesNotMatch(f.nodes.get('#results').innerHTML,/泰国待审施工图/);
});

test('历史能效目录归设备技术规格，人员资料与项目范围保留，子目录不重复阶段编号',async()=>{
 const legacy='handover:1:energy-models',equipment='prep:equipment-specifications';
 const prep={lifecycle:{chapter:'handover',stage:'1'},libraryScope:'shared',links:[],tags:[],sections:[],date:''};
 const documents=[
   {...prep,id:'pue',title:'Araya PUE 计算书',directoryId:legacy,nature:'项目交付物',libraryScope:'project',projectScope:'泰国',links:[{url:'https://example.com/pue'}]},
   {...prep,id:'clf',title:'CLF 能效模型',nature:'能效与计算模型'},
   {...prep,id:'staff',title:'泰国运维人力配置',nature:'项目规划',libraryScope:'project',projectScope:'泰国'},
   {...prep,id:'malaysia',title:'马来 PUE 计算书',directoryId:legacy,libraryScope:'project',projectScope:'马来'},
 ];
 const directoryNodes=[
   {id:legacy,name:'能效与计算模型',chapter:'handover',parentId:'handover:1',stage:'1',project:'shared'},
   {id:'handover:1:custom',name:'独立试验目录',chapter:'handover',parentId:'handover:1',stage:'1',project:'thailand'},
 ];
 const before=structuredClone(documents);
 const f=await fixture({documents,feed:{state:'ready',errors:[],directoryNodes}});
 f.render('library',{scope:'handover',directory:equipment});
 const page=f.nodes.get('#app').innerHTML;
 assert.doesNotMatch(page,/data-directory-node="handover:1:energy-models"/);
 assert.match(page,/data-directory-node="handover:1:custom"[^>]*><span>独立试验目录/);
 assert.match(page,/人员与组织<\/span><b>1<\/b>/);
 assert.equal(f.nodes.get('#doc-count').textContent,'2 份');
 const results=f.nodes.get('#results').innerHTML;
 assert.match(results,/Araya PUE 计算书/);
 assert.match(results,/https:\/\/example\.com\/pue/);
 assert.doesNotMatch(results,/马来 PUE/);
 assert.equal(documentDirectory(documents[0]),equipment);
 assert.deepEqual(directoryDocuments(documents,legacy),directoryDocuments(documents,equipment));
 assert.deepEqual(documents,before);
});

test('ordinary cards hide remarks and offer direct edit only for editable records',async()=>{
 const {table}=await fixture(),document={id:'tbl:rec1',title:'板换',nature:'运维维保需求规范',note:'中午12点前',links:[{url:'https://example.com/spec'}],edit:{title:'板换'}};
 const editor=table([document],{editable:true});
 assert.doesNotMatch(editor,/中午12点前/);
 assert.match(editor,/data-edit-document="tbl:rec1"/);
 assert.match(editor,/data-document="tbl:rec1"/);
 assert.match(editor,/href="https:\/\/example\.com\/spec"/);
 assert.doesNotMatch(table([document]),/data-edit-document/);
 assert.doesNotMatch(table([{...document,sync:{status:'syncing'}}],{editable:true}),/data-edit-document/);
 const collection=table([{...document,members:[document],note:'规范覆盖范围'}],{editable:true});
 assert.match(collection,/规范覆盖范围/);
 assert.doesNotMatch(collection,/data-edit-document/);
});

test('regional office shows its own sections and table even when a section is empty',async()=>{
 const base={libraryScope:'regional',links:[],tags:[],sections:[]};
 const reports={...base,id:'weekly',title:'第32周区域周报',nature:'区域周报'};
 const policy={...base,id:'policy',title:'办公管理办法',nature:'办公制度'};
 const f=await fixture({documents:[reports,policy],feed:{state:'ready',errors:[],sources:[{regionalOffice:true,url:'https://example.com/regional-base'}]}});
 f.render('library',{scope:'regional',directory:'regional:reports'});
 const page=f.nodes.get('#app').innerHTML;
 assert.match(page,/区域协作站/);
 for(const section of regionalOfficeSections)assert(page.includes(`data-directory-node="${section.id}"`));
 assert.match(page,/href="https:\/\/example\.com\/regional-base"/);
 assert.match(f.nodes.get('#results').innerHTML,/第32周区域周报/);
 assert.doesNotMatch(f.nodes.get('#results').innerHTML,/办公管理办法/);
 f.render('library',{scope:'regional',directory:'regional:administration'});
 assert.match(f.nodes.get('#app').innerHTML,/href="https:\/\/example\.com\/regional-base"/);
 assert.equal(f.nodes.get('#doc-count').textContent,'0 份');
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

test('equipment specialty groups have independent collapse states and count only open cards for pagination', async () => {
  const {table}=await fixture();
  const rows=[
    {id:'power',title:'电力方舱',nature:'运维维保需求规范',specialty:'电气'},
    {id:'hvac',title:'冷塔',nature:'运维维保需求规范',specialty:'暖通'},
    {id:'spec',title:'变压器规格',nature:'设备技术规格',specialty:'电气'},
    {id:'unknown',title:'待分类设备',nature:'设备技术规格'},
  ];
  const full=table(rows);
  assert.equal((full.match(/class="material-specialty"/g)||[]).length,4);
  assert.match(full,/未标注/);
  const key='specialty:'+JSON.stringify(['运维维保需求规范','电气']);
  const limited=table(rows,{limit:2,collapsedGroups:[key]});
  assert.match(limited,/aria-expanded="false"[^>]*>[^]*?电气<\/span><b>1<\/b>/);
  assert.doesNotMatch(limited,/电力方舱|待分类设备/);
  assert.match(limited,/冷塔/);
  assert.match(limited,/变压器规格/);
  assert.match(limited,/加载更多（2 \/ 3）/);
});

test('group add carries the visible classification into the editor without granting access to readers',async()=>{
 const {table}=await fixture();
 const nature='运维维保需求规范';
 const rows=[{id:'power',title:'电力方舱',nature,specialty:'电气',libraryScope:'shared',classification:'S1.3.3'},
  {id:'unknown',title:'待分类设备',nature,libraryScope:'shared',classification:'S1.3.3'}];
 const classify=html=>[...html.matchAll(/data-group-add="([^"]+)"/g)].map(([,value])=>JSON.parse(value.replaceAll('&quot;','"')));
 const expected={nature,scope:'shared',chapter:'handover',stage:'1',directoryId:'prep:maintenance-standards'};
 assert.deepEqual(classify(table(rows,{editable:true})),[expected,{...expected,specialty:'电气'},expected]);
 assert.deepEqual(classify(table(rows,{editable:true,collapsedGroups:[nature]})),[expected]);
 assert.deepEqual(classify(table(rows,{editable:false})),[]);
});

test('compact meetings follow login project and omit empty summary filler', async () => {
  const f = await fixture(); f.render('meetings',{meetingScope:'thailand'});
  const page = f.nodes.get('#app').innerHTML;
  assert.match(page, /泰国 Araya 项目/); assert.doesNotMatch(page,/class="project-tabs"/);
  assert.match(page, /data-active="meetings"/);
  assert.doesNotMatch(page, /module-nav/);
  assert.match(page, /meeting-trail/);
  const trail=f.nodes.get('#meetingTrail').innerHTML;
  assert.match(trail, /项目会议/);
  assert.doesNotMatch(trail, /源表暂未填写|未分类|<p><\/p>/);
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
