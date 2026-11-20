import test from 'node:test';
import assert from 'node:assert/strict';
import {pageDefinitions,weeklyData,monthlyData,renderOverview,organizationData,renderOrganization,renderOrganizationVacancies,overviewAgenda,overviewCalendarCells,overviewCycle,stageInsight,stageInsightRows,ganttRowControls,taskDeliverableCount} from '../samples/handover-preview/pages.mjs';
const tasks=[{id:'late',code:'1',title:'逾期检查',stage:1,status:'逾期进行',start:'2026-10-01',end:'2026-10-20',actualCompletion:''},{id:'done',code:'2',title:'已完成检查',stage:1,status:'已完成',start:'2026-10-01',end:'2026-11-01',actualCompletion:'2026-11-01'},{id:'next',code:'3',title:'下周检查',stage:1,status:'未开始',start:'2026-11-02',end:'2026-11-06',actualCompletion:''}];
test('只读状态标签替代完成勾选，交付物及优先级仍在原行',()=>{
 const row={...tasks[1],priority:'🔴P0-高优',attachments:[{name:'交付.txt'}],deliverableLinks:'https://example.com/doc\nhttps://example.com/doc'};
 const controls=ganttRowControls(row,{editable:true});assert.equal(taskDeliverableCount(row),2);
 assert.match(controls.status,/>已完成<|已完成<\/span>/);assert.doesNotMatch(controls.status,/button|checkbox|aria-checked|data-complete-task|tabindex/);assert.equal(ganttRowControls(row).status,controls.status);
 assert.match(controls.priority,/>P0<\/button>/);assert.match(controls.delivery,/data-task-deliverables="done"/);assert.match(controls.delivery,/aria-label="查看交付物：已完成检查，2份"/);assert.doesNotMatch(controls.delivery,/task-resource-tags|添加交付物/);
 assert.equal(ganttRowControls(tasks[0],{editable:true}).delivery,'');assert.match(ganttRowControls(row,{editable:true,pending:true}).priority,/disabled/);
 for(const [status,label,tone]of [['未开始','未开始','planned'],['进行中','进行中','active'],['逾期进行','逾期','overdue'],['逾期完成','已完成','done']]){const html=ganttRowControls({...row,status}).status;assert.ok(html.includes(label));assert.ok(html.includes('task-status-'+tone));}
});

test('工作台导航分页面，不提供独立任务清单或项目日历入口',()=>{assert.ok(pageDefinitions.some(p=>p.id==='overview'));assert.ok(pageDefinitions.some(p=>p.id==='gantt'));assert.ok(pageDefinitions.some(p=>p.id==='weekly'));assert.ok(!pageDefinitions.some(p=>['list','calendar'].includes(p.id)));});
test('周跟进包含未完成逾期和本周实际完成，下周计划独立',()=>{const v=weeklyData(tasks,'2026-11-01','2026-11-01');assert.equal(v.start,'2026-10-26');assert.equal(v.end,'2026-11-01');assert.deepEqual(v.overdue.map(r=>r.id),['late']);assert.deepEqual(v.completed.map(r=>r.id),['done']);assert.deepEqual(v.next.map(r=>r.id),['next']);});
test('总览展示会议待办，保留会议直达与真实状态',()=>{
 const model={tasks,parents:[],milestones:[],stages:[]};
 const options={month:'2026-11',today:'2026-11-16'};
 const html=renderOverview(model,{...options,meetingTodos:{state:'ready',items:[{
  title:'<检查>',owner:'马进宇',due:'2026-11-19T12:00',priority:'P1',
  meetingId:'shared:rec11',meetingTitle:'海外双周会',meetingDate:'2026-11-13',
 }]}});
 const panel=html.match(/<section class="overview-weekly".*?<\/section>/s)?.[0];
 assert.ok(panel);
 assert.match(panel,/&lt;检查&gt;/);
 assert.match(panel,/海外双周会/);
 assert.match(panel,/马进宇/);
 assert.match(panel,/datetime="2026-11-19T12:00"/);
 assert.match(panel,/href="\/meeting-trail\?meeting=shared%3Arec11"/);
 assert.doesNotMatch(panel,/逾期检查|每周跟进/);
 assert.match(renderOverview(model,{...options,meetingTodos:{state:'ready'}}),/近期会议暂无待办/);
 assert.doesNotMatch(renderOverview(model,{...options,meetingTodos:{state:'forbidden'}}),/id="overviewWeeklyTitle"/);
});
test('总览把同场会议信息展示一次，不重复标题中已包含的日期',()=>{
 const model={tasks,parents:[],milestones:[],stages:[]};
 const meeting={meetingId:'rec11',meetingTitle:'11-13 | 海外双周会',meetingDate:'2026-11-13'};
 const render=items=>renderOverview(model,{month:'2026-11',today:'2026-11-16',meetingTodos:{state:'ready',items}});
 const same=render([{...meeting,title:'事项一',owner:'王鹏'},{...meeting,title:'事项二',owner:'马进宇'}]);
 assert.equal(same.match(/海外双周会/g).length,1);
 assert.equal(same.match(/datetime="2026-11-13"/g).length,1);
 assert.doesNotMatch(same,/11-13 \|/);
 assert.match(same,/王鹏/);
 assert.match(same,/马进宇/);
 const separate=render([{...meeting,title:'事项一'},{...meeting,meetingId:'rec12',meetingTitle:'项目周会',title:'事项二'}]);
 assert.doesNotMatch(separate,/class="overview-weekly-source"/);
 assert.match(separate,/海外双周会/);
 assert.match(separate,/项目周会/);
});
test('超过三条待办可滚动，简述及跳转与原事项对应',()=>{
 const options={month:'2026-11',today:'2026-11-16',meetingTodos:{state:'ready',items:Array.from({length:6},(_,index)=>({
  title:'原待办'+index,brief:'简述'+index,owner:'负责人',due:'2026-11-20T15:30',meetingId:'rec'+index,
 }))}};
 const html=renderOverview({tasks,parents:[],milestones:[],stages:[]},options);
 assert.match(html,/class="overview-weekly-items" tabindex="0"/);
 assert.match(html,/<brief-ticker data-can-scroll>/);
 assert.match(html,/href="\/meeting-trail\?meeting=rec5" title="原待办5"/);
 assert.match(html,/简述5/);
 assert.match(html,/11\/20 15:30/);
});
test('月度完成只按实际完成日期，不把计划结束当作完成',()=>{const v=monthlyData(tasks,'2026-11');assert.deepEqual(v.completed.map(r=>r.id),['done']);assert.deepEqual(v.rows.map(r=>r.id).sort(),['done','next']);});
test('总览中提供日历，空数据无虚构进度，图表分类转义',()=>{const model={tasks:[...tasks,{...tasks[0],id:'xss',category:'<img onerror=alert(1)>'}],parents:[],milestones:[],stages:[{id:1,name:'项目筹备',color:'#4f7fe0',total:4}],summary:{tasks:4,groups:0,milestones:0,unscheduled:0,completed:1}};const html=renderOverview(model,{month:'2026-11',today:'2026-11-01'});assert.ok(html.includes('项目日历'));assert.ok(!html.includes('<img onerror'));assert.ok(html.includes('&lt;img'));});
test('项目组织按已确认任职显示主岗，兼任不重复计人，不按旧岗位猜楼栋',()=>{const data=organizationData({people:[{id:'a',name:'甲',project:'泰国A项目',status:'已确认',active:true,assignments:['第二栋 · 楼栋经理（兼任）','园区 · 运维经理']},{id:'b',name:'乙',project:'泰国A项目',status:'待入场',active:true,assignments:[]},{id:'x',name:'退出',status:'已确认',active:false,assignments:['园区 · 园区经理']}],positions:[{building:'第一栋',role:'专业主管-电气',candidates:'乙'}]});assert.equal(data.people.length,2);assert.equal(data.people[0].building,'园区');assert.equal(data.people[0].role,'运维经理');assert.match(data.people[0].concurrent,/第二栋/);assert.equal(data.people[1].building,'第一栋');});

test('未确认候选人不进入项目组织，空缺按编制及已确认主岗人数计算', () => {
 const people = [
   {id:'a',name:'甲',project:'泰国A项目',active:true,status:'已确认'},
   {id:'b',name:'乙',project:'泰国A项目',active:true,status:'待沟通'},
   {id:'c',name:'丙',project:'泰国A项目',active:true,status:'已退出'},
 ];
 const positions = [
   {id:'electrical',building:'第一栋',role:'白班工程师-电气',need:4,candidates:'甲、乙、丙',interviewTotal:3},
   {id:'hvac',building:'第一栋',role:'专业主管-暖通',need:1,candidates:''},
   {id:'disabled',building:'第二栋',role:'白班工程师-消防',need:0,candidates:''},
 ];
 const model = organizationData({people,positions});
 assert.deepEqual(model.people.map(p=>p.id),['a']);
 assert.equal(model.positions.length,2);
 assert.equal(model.positions.find(p=>p.id==='electrical').assignments.length,1);
 const html = renderOrganization(model);
 assert.match(html,/<span>空缺<\/span><div><strong>4<\/strong>/);
 assert.match(html,/data-position-id="hvac"[^>]*>\s*<h4 class="organization-role">专业主管-暖通<\/h4>\s*<\/article>/);
 for (const [,card] of html.matchAll(/<article class="organization-position"[^>]*>([\s\S]*?)<\/article>/g)) {
   assert.doesNotMatch(card,/编制|空缺|—/);
 }
 assert.doesNotMatch(html,/data-person-id="(?:b|c)"|data-position-id="disabled"/);
 assert.match(html,/<details class="organization-branch" open>/);
 assert.equal(people[1].status,'待沟通');
});

test('组织兼任按原岗位注明，兼职不重复占编制', () => {
 const person={id:'manager',name:'甲',project:'泰国A项目',active:true,status:'已确认',assignments:['园区 · 运维经理','第二栋 · 楼栋经理（兼任）']};
 const model=organizationData({people:[person],positions:[{id:'second',building:'第二栋',role:'楼栋经理',need:1,candidates:'甲'}]});
 assert.equal(model.people.length,1);
 const posts=model.positions;
 assert.equal(posts.reduce((n,p)=>n+(p.need||0),0),1);
 const second=posts.find(p=>p.id==='second');
 assert.equal(second.need,0);
 assert.equal(second.assignments[0].concurrent,true);
 const html=renderOrganization(model);
 assert.match(html,/is-concurrent/);
 assert.doesNotMatch(html,/<span>空缺<\/span><div><strong>[1-9]/);
});

test('每栋楼展示 A–D 班组卡，已确认未分班人员留在楼栋并占对应岗位名额', () => {
 const person = {id:'operator',name:'甲',project:'泰国A项目',status:'已确认',assignments:['第一栋 · 值班员']};
 const model = organizationData({people:[person],positions:[
   {id:'lead', building:'第一栋', role:'值班长', need:4,own:4},
   {id:'operator', building:'第一栋', role:'值班员', need:32,own:7,lh:7,os:18},
   {id:'second', building:'第二栋', role:'值班员', need:31},
   {id:'supervisor', building:'园区', role:'值班主管', need:1},
 ]});
 const html = renderOrganization(model);
 const cards=[...html.matchAll(/class="organization-shift-card" data-shift-team="([A-D])">([\s\S]*?)<\/article>/g)];
 assert.deepEqual(cards.map(match=>match[1]),[...'ABCDABCD']);
 assert.match(cards[0][2],/值班长<\/li>.*?<li class="organization-shift-role">值班员<\/li>/s);
 assert.ok(cards.every(([,code,content])=>content.includes(`${code} 班`)&&!/data-person-id|编制|空缺/.test(content)));
 assert.doesNotMatch(html,/<table/);
 assert.match(html,/<span class="organization-shift-plan">\s*<span>值班长<\/span> <b>1<\/b>/);
 assert.match(html,/<span class="organization-shift-plan">\s*<span>值班员<\/span> <b>8<\/b>/);
 assert.match(html,/班别待定[\s\S]*?data-person-id="operator"/);
 assert.match(html,/各班编制待定/);
 assert.match(html,/<article class="organization-position" data-position-id="supervisor"/);
 assert.deepEqual([...html.matchAll(/<strong>(\d+)<\/strong>/g)].map(match=>match[1]),['1','68','67']);
});

test('空缺明细右侧显示可核实的渠道缺额，无法拆分的渠道留斜杠',()=>{
 const model={positions:[
   {id:'a',building:'第一栋',role:'值班员',need:32,own:7,lh:7,os:18,mode:'自有外派20%+Local Hire 20%+外包60%',gapOwn:3,assignments:[{concurrent:false},{concurrent:true}]},
   {id:'b',building:'第一栋',role:'值班长',need:1,own:1,assignments:[{concurrent:false}]},
   {id:'c',building:'第二栋',role:'值班员',need:10,own:2,lh:1,os:2,assignments:[]},
   {id:'d',building:'第二栋',role:'值班长',need:4,own:4,gapOwn:0,assignments:[{concurrent:false}]},
 ]};
 const detail=renderOrganizationVacancies(model);
 assert.match(renderOrganization(model),/data-action="organization-vacancies" aria-haspopup="dialog"/);
 assert.match(detail,/vacancy-total"><b>44<\/b>/);
 assert.match(detail,/aria-label="外包"[\s\S]*?aria-label="外派"[\s\S]*?aria-label="LH"/);
 const row = id => detail.match(new RegExp(`data-vacancy-position="${id}"[\\s\\S]*?</tr>`))[0];
 const channelGaps = id => [...row(id).matchAll(/data-channel="(?:os|own|lh)">([^<]+)/g)].map(match=>match[1]);
 assert.match(row('a'),/<th scope="row">值班员<\/th>\s*<td>32<\/td><td>1<\/td><td class="vacancy-number">31<\/td>/);
 assert.deepEqual(channelGaps('a'),['/','/','/']);
 assert.match(row('c'),/<td>10<\/td><td>\/<\/td><td class="vacancy-number">10<\/td>/);
 assert.deepEqual(channelGaps('c'),['2','2','1']);
 assert.deepEqual(channelGaps('d'),['/','3','/']);
 assert.doesNotMatch(detail,/data-vacancy-position="b"/);
 assert.match(detail,/data-channel="own"><span>外派<\/span>\s*<strong>14<\/strong><small>29.8%/);
 assert.doesNotMatch(detail,/目标比例|vacancy-channels/);
 assert.match(renderOrganizationVacancies({positions:[model.positions[1]]}),/当前暂无岗位空缺/);
});

test('总览展示阶段小结与图表，搜索不篡改阶段统计，不再抽取两条任务',()=>{
 const model={tasks,parents:[],milestones:[],stages:[{id:1,name:'项目筹备',color:'#4f7fe0'}]};
 const html=renderOverview(model,{month:'2026-11',today:'2026-11-01'});
 assert.match(html,/stage-summary-copy/);assert.ok(!html.includes('data-featured-task'));assert.match(html,/overview-metric-icon/);assert.match(html,/截止 2/);
 const filtered=renderOverview(model,{month:'2026-11',today:'2026-11-01',keyword:'下周检查'});
 assert.match(filtered,/data-stage-summary="1"/);assert.ok(filtered.includes('已完成 1/3'));
 const empty=renderOverview(model,{month:'2026-11',today:'2026-11-01',keyword:'不存在'});assert.match(empty,/没有匹配的事项/);
});
test('阶段小结由真实分类、状态、月份和字段覆盖计算，图表下钻口径一致',()=>{
 const rows=[{...tasks[0],category:'组织',batch:'一期60MW',owner:'甲'}, {...tasks[1],category:'技术',batch:'一期60MW',attachments:[{name:'验收.txt'}]}, {...tasks[2],category:'技术',batch:'二期40MW'}, {...tasks[2],id:'unplanned',start:'',end:'',category:'组织',batch:'二期40MW'}];
 const model={tasks:rows},data=stageInsight(model,1);
 assert.equal(data.total,4);assert.equal(data.completed,1);assert.equal(data.overdue,1);assert.equal(data.scheduled,3);assert.equal(data.owned,1);assert.equal(data.delivered,1);assert.equal(data.categories.reduce((n,c)=>n+c.count,0),4);
 assert.deepEqual(data.batches.map(b=>b.key),['一期60MW','二期40MW']);
 assert.deepEqual(stageInsightRows(model,{stage:1,kind:'category',key:'技术'}).map(r=>r.id),['done','next']);
 assert.deepEqual(stageInsightRows(model,{stage:1,kind:'month',key:'2026-11'}).map(r=>r.id),['done','next']);
 assert.deepEqual(stageInsightRows(model,{stage:1,kind:'unscheduled'}).map(r=>r.id),['unplanned']);
 assert.equal(stageInsightRows(model,{stage:1,kind:'batch',key:'二期40MW'}).length,2);
 assert.deepEqual(stageInsightRows(model,{stage:1,kind:'delivered'}).map(r=>r.id),['done']);
 assert.equal(stageInsight({tasks:[]},1).percent,0);
});
test('机电进场复用验收阶段的分类数量块，分类下钻不混入其他阶段',()=>{
 const rows=[{...tasks[0],stage:2,category:'调试跟进'},{...tasks[1],stage:2,category:'调试跟进'},{...tasks[2],stage:2,category:'人员培训'},{...tasks[2],id:'other',stage:4,category:'调试跟进'}];
 const model={tasks:rows,milestones:[],stages:[{id:2,name:'机电进场',color:'#21aaaa'},{id:4,name:'验收阶段',color:'#499aba'}]};
 const html=renderOverview(model,{month:'2026-11',today:'2026-11-02'});
 assert.equal((html.match(/class="insight-matrix"/g)||[]).length,2);
 assert.ok(!html.includes('insight-months'));assert.match(html,/覆盖2类进场工作，2项待完成/);
 assert.match(html,/data-stage-insight="2" data-insight-kind="category" data-insight-key="调试跟进" aria-label="调试跟进，2项"/);
 assert.equal(stageInsight(model,2).categories.reduce((n,c)=>n+c.count,0),3);
 assert.deepEqual(stageInsightRows(model,{stage:2,kind:'category',key:'调试跟进'}).map(r=>r.id),['late','done']);
});
test('月历与安排共享日期范围，打标任务去重，选中日期只显示当天事项',()=>{
 const flagged={...tasks[1],milestone:true},milestone={id:'m',title:'施工图评审',code:'M05',level:'里程碑',status:'未开始',start:'2026-11-25',end:'2026-11-25'};
 const model={tasks:[tasks[0],flagged,tasks[2]],milestones:[flagged,milestone],parents:[],stages:[{id:1,name:'项目筹备',color:'#4f7fe0'}]};
 assert.deepEqual(overviewAgenda(model,{month:'2026-11'}).map(r=>r.id),['done','next','m']);
 assert.deepEqual(overviewAgenda(model,{month:'2026-11',selectedDay:'2026-11-25'}).map(r=>r.id),['m']);
 const html=renderOverview(model,{month:'2026-11',today:'2026-11-02',selectedDay:'2026-11-25'});
 assert.match(html,/data-overview-day="2026-11-25"[^>]*aria-pressed="true"/);assert.match(html,/当日安排/);assert.match(html,/data-record="m"/);assert.ok(!html.includes('overview-feature'));assert.ok(!html.includes('交付：'));
});
test('总览月历按实际月份展示完整周，不额外留空周，今天与选中日期分别标明',()=>{
 const model={tasks:[],milestones:[],parents:[],stages:[]};
 assert.equal(overviewCalendarCells(model,'2027-02').length,28);
 assert.equal(overviewCalendarCells(model,'2026-12').length,35);
 assert.equal(overviewCalendarCells(model,'2026-11').length,42);
 const html=renderOverview(model,{month:'2026-11',today:'2026-11-02',selectedDay:'2026-11-25'});
 assert.match(html,/aria-label="日历年份"/);assert.match(html,/aria-label="日历月份"/);
 assert.match(html,/data-overview-day="2026-11-02"[^>]*aria-current="date"/);
 assert.match(html,/data-overview-day="2026-11-25"[^>]*aria-pressed="true"/);
});

test('项目周期覆盖独立里程碑日期，同日节点分组且可分别打开',()=>{
 const early={id:'start',title:'建设启动',end:'2026-09-30'},a={id:'delivery',title:'设备交付',end:'2026-11-30'},b={id:'review',title:'联合验收',end:a.end};
 const model={tasks,milestones:[a,b,early,{id:'pending',title:'未排期节点'}],stages:[]};
 const cycle=overviewCycle(model);
 assert.deepEqual([cycle.start,cycle.end,cycle.span],['2026-09-30','2026-11-30',62]);
 assert.deepEqual(cycle.groups.map(([d,items])=>[d,items.length]),[['2026-09-30',1],['2026-11-30',2]]);
 const html=renderOverview(model,{month:'2026-11',today:'2026-11-04'}),section=html.match(/<section class="overview-cycle".*?<\/section>/)[0];
 assert.match(section,/class="cycle-today" style="--cycle-position:57\.377%"/);
 for(const id of ['start','delivery','review'])assert.match(section,new RegExp(`data-record="${id}"`));
 assert.doesNotMatch(section,/未排期节点/);
 assert.equal(overviewCycle({tasks:[],milestones:[{id:'pending'}]}),null);
});

 test('逐条操作仅编辑者可见，待同步禁用并提供菜单语义',()=>{
 assert.equal(ganttRowControls(tasks[0]).actions,'');
 assert.match(ganttRowControls(tasks[0],{editable:true}).actions,/aria-haspopup="menu"/);
 assert.match(ganttRowControls(tasks[0],{editable:true,pending:true}).actions,/disabled/);
 });
