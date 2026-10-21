import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fetchBasePlan } from '../base-sync.mjs';

async function runner(t, source) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-cli-'));
  const script = path.join(dir, 'runner.mjs');
  await fs.writeFile(script, source);
  const previous = process.env.LARK_CLI_SCRIPT;
  process.env.LARK_CLI_SCRIPT = script;
  t.after(async () => {
    if (previous) process.env.LARK_CLI_SCRIPT = previous; else delete process.env.LARK_CLI_SCRIPT;
    await fs.rm(dir, { recursive: true, force: true });
  });
}

test('invalid application credentials produce an actionable error without internal command details', async t => {
  await runner(t, `console.error(JSON.stringify({ok:false,error:{type:'api_error',message:'TAT API error: [10014] app secret invalid private-value'}}));process.exitCode=1;`);
  await assert.rejects(fetchBasePlan(), error => {
    assert.match(error.message, /10014/);
    assert.match(error.message, /App Secret/);
    assert.doesNotMatch(error.message, /Command failed|node\.exe|base-token|private-value|run\.mjs/);
    assert.equal(error.publicMessage, error.message);
    return true;
  });
});

test('malformed CLI output is never reflected into the public error', async t => {
  await runner(t, `console.log('private-upstream-output not-json');`);
  await assert.rejects(fetchBasePlan(), error => {
    assert.match(error.message, /格式/);
    assert.doesNotMatch(error.message, /private-upstream-output/);
    return true;
  });
});

test('successful application reads still normalize projected plan fields', async t => {
  await runner(t, `console.log(JSON.stringify({ok:true,data:{fields:['任务编号','团队组建小阶段','任务详情','开始时间','截止时间','项目进度','优先级'],data:[['QA-1','团队筹建准备','代表性任务','2026-06-01','2026-06-05','已完成','P1']],has_more:false}}));`);
  const plan = await fetchBasePlan();
  assert.equal(plan.recordCount, 1);
  assert.equal(plan.ganttPlan.totalTasks, 1);
  assert.equal(plan.phases[0].total, 1);
});

test('overdue unfinished tasks remain unfinished in rows and phase progress', async t => {
  await runner(t, `console.log(JSON.stringify({ok:true,data:{fields:['任务编号','团队组建小阶段','任务详情','开始时间','截止时间','项目进度','优先级'],data:[['TH-1','团队筹建准备','逾期任务','2026-06-01','2026-06-05',['逾期未完成'],'P0']],has_more:false}}));`);
  const plan = await fetchBasePlan();
  const row = plan.ganttPlan.keyRows.find(r => r.code === 'TH-1');
  assert.equal(row.status, '逾期未完成');
  assert.ok(row.progress < 100);
  assert.notEqual(plan.ganttPlan.phases[0].status, '已完成');
});

test('migrated English-first bilingual fields feed the project page', async t => {
  await runner(t, `console.log(JSON.stringify({ok:true,data:{fields:['Task Code（任务编号）','Team Setup Phase（团队组建小阶段）','Task Description（任务详情）','Start Time（开始时间）','Due Time（截止时间）','Project Status（项目进度）','Priority（优先级）'],data:[['001-1','团队筹建准备','新平台任务','2026-06-01','2026-06-05',['正常完成'],['P0']]],has_more:false}}));`);
  const plan = await fetchBasePlan();
  const row = plan.ganttPlan.keyRows.find(r => r.code === '001-1');
  assert.equal(row?.title, '新平台任务');
  assert.equal(row.status, '已完成');
  assert.equal(plan.ganttPlan.p0Tasks, 1);
});

test('live task statuses drive completion counts without estimating progress from dates', async t => {
  await runner(t, `console.log(JSON.stringify({ok:true,data:{fields:['任务编号','团队组建小阶段','任务详情','开始时间','截止时间','项目进度','优先级'],data:[['TH-1','团队筹建准备','完成任务','2026-06-01','2026-06-05',['逾期完成'],'P0'],['TH-2','团队筹建准备','未开始任务','2026-06-01','2026-06-05',['未开始'],'P1'],['TH-3','团队筹建准备','进行中任务','2026-06-01','2026-06-05',['进行中'],'P1']],has_more:false}}));`);
  const plan = await fetchBasePlan();
  assert.equal(plan.phases[0].completed, 1);
  assert.equal(plan.phases[0].remaining, 2);
  assert.equal(plan.phases[0].progress, 33);
  assert.equal(plan.phases[0].status, '进行中');
  assert.equal(plan.ganttPlan.phases[0].status, '进行中');
  const rows = plan.ganttPlan.keyRows.filter(row => row.type !== 'phase');
  assert.deepEqual(rows.map(row => row.progress), [100, 0, 0]);
  assert.equal(rows[0].sourceStatus, '逾期完成');
});

test('undated tasks and unfinished milestones stay visible without fabricated dates or completion', async t => {
  await runner(t, `console.log(JSON.stringify({ok:true,data:{fields:['任务编号','团队组建小阶段','任务详情','开始时间','截止时间','项目进度','优先级','里程碑'],record_id_list:['recUndated','recMilestone'],data:[['TH-1','团队筹建准备','未排期任务',null,null,null,null,null],['TH-2','团队筹建准备','交付里程碑','2026-06-01','2026-06-05','未开始','P0','是']],has_more:false}}));`);
  const plan = await fetchBasePlan();
  const rows = plan.ganttPlan.keyRows.filter(row => row.type !== 'phase');
  assert.equal(rows.length, plan.recordCount);
  assert.equal(rows[0].recordId, 'recUndated');
  assert.equal(rows[0].start, '');
  assert.equal(rows[0].end, '');
  assert.equal(rows[0].status, '未填写');
  assert.equal(rows[0].priority, '未填写');
  assert.equal(rows[1].status, '未开始');
  assert.equal(rows[1].progress, 0);
});

test('sync reads the current Thailand table without view filters and follows all pages', async t => {
  await runner(t, `const args=process.argv.slice(2);const offset=Number(args[args.indexOf('--offset')+1]||0);if(args[args.indexOf('--table-id')+1]!=='tblSpSvqS2FMpHks'||args.includes('--view-id'))throw new Error('wrong source');console.log(JSON.stringify({ok:true,data:{fields:['任务编号','团队组建小阶段','任务详情'],record_id_list:[offset?'recSecond':'recFirst'],data:[[offset?'TH-2':'TH-1','团队筹建准备',offset?'第二页任务':'第一页任务']],has_more:offset===0,rev:1}}));`);
  const plan = await fetchBasePlan();
  assert.equal(plan.recordCount, 2);
  assert.deepEqual(plan.ganttPlan.keyRows.filter(row => row.type !== 'phase').map(row => row.title), ['第一页任务', '第二页任务']);
});

test('incomplete upstream envelopes fail instead of replacing live data with an empty plan', async t => {
  await runner(t, `console.log(JSON.stringify({ok:true,data:{has_more:false}}));`);
  await assert.rejects(fetchBasePlan(), /结构/);
});

test('an empty source has no invented plan dates', async t => {
  await runner(t, `console.log(JSON.stringify({ok:true,data:{fields:['任务详情'],data:[],has_more:false}}));`);
  const plan = await fetchBasePlan();
  assert.equal(plan.ganttPlan.rangeStart, '');
  assert.equal(plan.ganttPlan.rangeEnd, '');
  assert.equal(plan.ganttPlan.durationDays, 0);
});

test('task deliverables preserve source titles, deduplicate links and reject unsafe URLs', async t => {
  await runner(t, `console.log(JSON.stringify({ok:true,data:{fields:['任务编号','团队组建小阶段','任务详情','交付物-链接','交付物-附件'],record_id_list:['recFiles'],data:[['TH-1','团队筹建准备','有交付物的任务','[签证确认](https://vnet.feishu.cn/docx/test)\\n[拒绝](javascript:alert(1))','[签证确认](https://vnet.feishu.cn/docx/test)\\n[人员配置](https://vnet.feishu.cn/sheets/test)']],has_more:false}}));`);
  const plan = await fetchBasePlan();
  const row = plan.ganttPlan.keyRows.find(row => row.type !== 'phase');
  assert.deepEqual(row.deliverables.map(file => [file.name, file.url]), [
    ['签证确认', 'https://vnet.feishu.cn/docx/test'],
    ['人员配置', 'https://vnet.feishu.cn/sheets/test'],
  ]);
});

test('native attachments without a public URL open their real source record', async t => {
  await runner(t, `console.log(JSON.stringify({ok:true,data:{fields:['任务详情','交付物-附件'],record_id_list:['recFiles'],data:[['附件任务',[{name:'交付物.pdf',file_token:'opaque-token'}]]],has_more:false}}));`);
  const plan = await fetchBasePlan();
  const file = plan.ganttPlan.keyRows.find(row => row.type !== 'phase').deliverables[0];
  assert.equal(file.name, '交付物.pdf');
  assert.equal(file.url, 'https://vnet.feishu.cn/base/CID8b8V7CaCtKesWGFKcHTdqnlc?table=tblSpSvqS2FMpHks&record=recFiles');
  assert.equal(file.inSource, true);
});
