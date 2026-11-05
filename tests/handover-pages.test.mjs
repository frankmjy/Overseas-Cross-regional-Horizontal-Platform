import test from 'node:test';
import assert from 'node:assert/strict';
import {pageDefinitions,weeklyData,monthlyData,renderOverview,organizationData,overviewAgenda,overviewCalendarCells,stageInsight,stageInsightRows,ganttRowControls,taskDeliverableCount} from '../samples/handover-preview/pages.mjs';
const tasks=[{id:'late',code:'1',title:'逾期检查',stage:1,status:'逾期进行',start:'2026-10-01',end:'2026-10-20',actualCompletion:''},{id:'done',code:'2',title:'已完成检查',stage:1,status:'已完成',start:'2026-10-01',end:'2026-11-01',actualCompletion:'2026-11-01'},{id:'next',code:'3',title:'下周检查',stage:1,status:'未开始',start:'2026-11-02',end:'2026-11-06',actualCompletion:''}];
test('交付物收为独立小图标，不占第二行，保留完成和优先级',()=>{
 const row={...tasks[1],priority:'🔴P0-高优',attachments:[{name:'交付.txt'}],deliverableLinks:'https://example.com/doc\nhttps://example.com/doc'};
 const controls=ganttRowControls(row,{editable:true});
 assert.equal(taskDeliverableCount(row),2);assert.match(controls.finish,/aria-checked="true"/);assert.match(controls.finish,/data-complete-task="done"/);
 assert.match(controls.priority,/>P0<\/button>/);assert.match(controls.priority,/data-priority-task="done"/);
 assert.match(controls.delivery,/data-task-deliverables="done"/);assert.match(controls.delivery,/<svg/);assert.match(controls.delivery,/aria-label="查看交付物：已完成检查，2份"/);assert.doesNotMatch(controls.delivery,/task-resource-tags|class="resource-kind"|添加交付物|data-deliver-task/);
 assert.equal(ganttRowControls(tasks[0],{editable:true}).delivery,'');
 assert.match(ganttRowControls(row,{editable:true,pending:true}).finish,/disabled/);
 assert.match(ganttRowControls(row).priority,/disabled/);
 assert.match(ganttRowControls({...tasks[0],title:'<img onerror=x>'},{editable:true}).finish,/&lt;img/);
 assert.match(ganttRowControls(tasks[0],{editable:true}).finish,/aria-checked="false"/);
});
test('工作台导航分页面，不提供独立任务清单或项目日历入口',()=>{assert.ok(pageDefinitions.some(p=>p.id==='overview'));assert.ok(pageDefinitions.some(p=>p.id==='gantt'));assert.ok(pageDefinitions.some(p=>p.id==='weekly'));assert.ok(!pageDefinitions.some(p=>['list','calendar'].includes(p.id)));});
test('周跟进包含未完成逾期和本周实际完成，下周计划独立',()=>{const v=weeklyData(tasks,'2026-11-01','2026-11-01');assert.equal(v.start,'2026-10-26');assert.equal(v.end,'2026-11-01');assert.deepEqual(v.overdue.map(r=>r.id),['late']);assert.deepEqual(v.completed.map(r=>r.id),['done']);assert.deepEqual(v.next.map(r=>r.id),['next']);});
test('月度完成只按实际完成日期，不把计划结束当作完成',()=>{const v=monthlyData(tasks,'2026-11');assert.deepEqual(v.completed.map(r=>r.id),['done']);assert.deepEqual(v.rows.map(r=>r.id).sort(),['done','next']);});
test('总览中提供日历，空数据无虚构进度，图表分类转义',()=>{const model={tasks:[...tasks,{...tasks[0],id:'xss',category:'<img onerror=alert(1)>'}],parents:[],milestones:[],stages:[{id:1,name:'项目筹备',color:'#4f7fe0',total:4}],summary:{tasks:4,groups:0,milestones:0,unscheduled:0,completed:1}};const html=renderOverview(model,{month:'2026-11',today:'2026-11-01'});assert.ok(html.includes('项目日历'));assert.ok(!html.includes('<img onerror'));assert.ok(html.includes('&lt;img'));});
test('项目组织按已确认任职显示主岗，兼任不重复计人，不按旧岗位猜楼栋',()=>{const data=organizationData({people:[{id:'a',name:'甲',active:true,assignments:['第二栋 · 楼栋经理（兼任）','园区 · 运维经理']},{id:'b',name:'乙',active:true,assignments:[]},{id:'x',name:'退出',active:false,assignments:['园区 · 园区经理']}],positions:[{building:'第一栋',role:'专业主管-电气',candidates:'乙'}]});assert.equal(data.people.length,2);assert.equal(data.people[0].building,'园区');assert.equal(data.people[0].role,'运维经理');assert.match(data.people[0].concurrent,/第二栋/);assert.equal(data.people[1].building,'第一栋');});
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

 test('逐条操作仅编辑者可见，待同步禁用并提供菜单语义',()=>{
 assert.equal(ganttRowControls(tasks[0]).actions,'');
 assert.match(ganttRowControls(tasks[0],{editable:true}).actions,/aria-haspopup="menu"/);
 assert.match(ganttRowControls(tasks[0],{editable:true,pending:true}).actions,/disabled/);
 });
