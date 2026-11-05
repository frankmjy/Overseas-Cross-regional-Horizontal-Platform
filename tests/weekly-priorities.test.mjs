import test from 'node:test';
import assert from 'node:assert/strict';
import { priorityExamples, validatePriority, savePriorityPreview, renderWeeklyPriorities, priorityPage } from '../src/weekly-priorities.js';
import { buildProjectWeekly, renderProjectWeekly } from '../src/project-weekly.js';
import { validatePriorityResources, renderPriorityResources, createPriorityPreviewStore } from '../src/priority-resources.js';

test('independent priority examples and card counts do not inherit plan records', () => {
  const options = { anchor: '2026-10-27', today: '2026-10-27' };
  const empty = buildProjectWeekly({ keyRows: [] }, options);
  const plan = buildProjectWeekly({ keyRows: [{ type: 'task', recordId: 'real-base-record', title: '真实计划任务', priority: 'P0', start: '2026-10-01', end: '2026-11-01' }] }, options);
  assert.deepEqual(empty.priorityItems, plan.priorityItems);
  assert.equal(plan.priorityItems.length, 6);
  const html = renderProjectWeekly(plan, { view: 'focus' });
  assert.match(html, /示例|新增事项|推进分布/);
  assert.doesNotMatch(html.split('<dialog')[0], /真实计划任务|real-base-record|data-weekly-update|weekly-table/);
});

test('preview additions and progress changes preserve independent identity and history', () => {
  const items = priorityExamples('2026-10-26'), item = items[0];
  const id = 'priority-manual-test';
  const added = savePriorityPreview(items, { ...item, title: '  示例新增  ', progress: '第一条跟进' }, { id, time: '2026-10-27 10:00' });
  assert.equal(added.length, 7); assert.equal(added[0].title, '示例新增');
  const saved = savePriorityPreview(added, { ...added[0], status: '已解决', progress: '第二条跟进' }, { id, time: '2026-10-27 10:01' });
  assert.equal(saved.length, 7); assert.equal(saved[0].history.length, 2);
  assert.equal(saved[0].history[1].time, '2026-10-27 10:01');
  assert.equal(items.length, 6); assert.equal(items[0].history.length, 0);
  assert.equal(savePriorityPreview(saved, saved[0], { id }).at(0).history.length, 2);
  assert.throws(() => savePriorityPreview(items, item, { id: 'real-base-id' }), /identity/);
});

test('manual preview validates fields, dates, categories and bounded text', () => {
  const item = priorityExamples('2026-10-26')[0];
  assert.throws(() => validatePriority({ ...item, title: ' ' }), /名称/);
  assert.throws(() => validatePriority({ ...item, owner: '' }), /责任人/);
  assert.throws(() => validatePriority({ ...item, due: '2026-02-30' }), /日期/);
  assert.throws(() => validatePriority({ ...item, due: '2026-13-01' }), /日期/);
  assert.throws(() => validatePriority({ ...item, status: 'invalid' }), /状态/);
  assert.throws(() => validatePriority({ ...item, progress: 'x'.repeat(2001) }), /2000/);
});

test('filters and charts share the same independent records and escape entered content', () => {
  const items = priorityExamples('2026-10-26'); items[0].title = '<script>bad</script>';
  const html = renderWeeklyPriorities(items, { filter: '卡点' });
  assert.equal((html.match(/class="priority-row"/g) || []).length, 3);
  assert.match(html, /待协调2项，推进中3项，已解决1项/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(renderWeeklyPriorities([], { filter: '重点' }), /暂无事项/);
});

test('compact list searches, filters and paginates without changing the total record set', () => {
  const sample = priorityExamples('2026-10-26')[0];
  const rows = Array.from({ length: 30 }, (_, index) => ({ ...sample, id:`priority-manual-${index}`, title:`事项${index}`, owner:index % 2 ? '甲' : '乙', status:index === 0 ? '已解决' : '待协调' }));
  assert.equal(priorityPage(rows).rows.length, 8);
  assert.equal(priorityPage(rows, { page:99 }).rows.length, 6);
  assert.equal(priorityPage(rows, { page:99 }).current, 4);
  assert.equal(priorityPage(rows, { query:'甲' }).total, 15);
  assert.equal(priorityPage(rows, { filter:'已解决' }).total, 1);
  assert.equal(priorityPage(rows, { query:'不存在' }).rows.length, 0);
  assert.equal(rows.length, 30);
});

test('plan associations retain stable record IDs, reject another project and expose an edit selector', () => {
  const items = priorityExamples('2026-10-26');
  const values = { ...items[0], planIds:['recPlanOne','recPlanOne'] };
  const saved = savePriorityPreview(items, values, { id:items[0].id, allowedPlanIds:['recPlanOne'] });
  assert.deepEqual(saved[0].planIds, ['recPlanOne']);
  assert.throws(() => savePriorityPreview(items, values, { id:items[0].id, allowedPlanIds:['recOther'] }), /当前项目/);
  assert.throws(() => validatePriority({ ...values, planIds:['任务名称'] }), /关联计划/);
  const html = renderWeeklyPriorities(saved, { plans:[{ recordId:'recPlanOne',code:'001-1',title:'接口确认' }] });
  assert.match(html, /data-priority-plan="recPlanOne"/);
  assert.match(html, /name="planIds" value="recPlanOne"/);
  assert.match(html, /data-priority-plan-search/);
  assert.doesNotMatch(html, /data-weekly-update/);
});

test('resources persist with an item, remain compact and reject unsafe links and file metadata', () => {
  const rows = priorityExamples('2026-10-26'), id = rows[0].id;
  const attachments = [{ id:'a6644e62-a43b-416c-abc2-6148cf74f208', name:'验收清单.pdf', size:1024 }];
  const links = [{ title:'交付资料', url:'https://example.com/handover?q=1&v=2' }];
  const saved = savePriorityPreview(rows, { ...rows[0], attachments, links }, { id });
  assert.deepEqual(saved[0].attachments, attachments); assert.deepEqual(saved[0].links, links);
  const html = renderWeeklyPriorities(saved);
  assert.match(html, /附件 1 · 链接 1/); assert.match(html, /data-priority-files/);
  assert.match(html, /data-priority-link-add/);
  for (const url of ['javascript:alert(1)','data:text/html,x','file:///secret','https://user:password@example.com']) {
    assert.throws(() => validatePriority({ ...rows[0], links:[{ title:'资料', url }] }), /链接/);
  }
  assert.throws(() => validatePriority({ ...rows[0], attachments:[{ ...attachments[0], name:'../secret.txt' }] }), /附件/);
  assert.throws(() => validatePriority({ ...rows[0], attachments:[{ ...attachments[0], size:21*1024*1024 }] }), /20 MB/);
  assert.throws(() => validatePriority({ ...rows[0], links:Array.from({ length:11 }, () => links[0]) }), /10/);
});

test('resource bounds, safe rendering and unavailable storage produce explicit outcomes', async () => {
  const file = { id:'a6644e62-a43b-416c-abc2-6148cf74f208', name:'<验收>.txt', size:20*1024*1024 };
  assert.throws(() => validatePriorityResources({ attachments:[{ ...file, size:0 }] }), /附件/);
  assert.throws(() => validatePriorityResources({ attachments:[file, file] }), /重复/);
  assert.throws(() => validatePriorityResources({ attachments:[file, { ...file,id:'b6644e62-a43b-416c-abc2-6148cf74f208' }, { ...file,id:'c6644e62-a43b-416c-abc2-6148cf74f208' }] }), /50 MB/);
  const safe = validatePriorityResources({ attachments:[file], links:[{ title:'<script>x</script>', url:'https://example.com' }] });
  const html = renderPriorityResources(safe, new Map([[file.id, new Blob(['test'])]]));
  assert.match(html, /&lt;验收&gt;\.txt/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /noopener noreferrer/); assert.match(html, /待保存/);
  await assert.rejects(createPriorityPreviewStore(null).load('project:week'), /浏览器存储不可用/);
  await assert.rejects(createPriorityPreviewStore(null).save('project:week', []), /浏览器存储不可用/);
});

test('formal view uses live account choices, actual status and no preview wording or fallback examples',()=>{
 const row={...priorityExamples('2026-10-26')[0],id:'recLive',owner:'ou_owner',ownerName:'验收人员',sync:{id:'operation',status:'error',error:'暂未同步完成'}};
 const html=renderWeeklyPriorities([row],{formal:true,snapshot:{ready:true,projectName:'泰国项目',people:[{id:'ou_owner',name:'验收人员'}],impacts:['现场协同']}});
 assert.doesNotMatch(html,/示例|当前浏览器/);assert.match(html,/泰国项目/);assert.match(html,/value="ou_owner"/);assert.match(html,/data-priority-retry="operation"/);assert.match(html,/暂未同步完成/);
 assert.match(renderWeeklyPriorities([],{formal:true,snapshot:{ready:false}}),/正在读取事项/);
});
