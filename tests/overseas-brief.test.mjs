import test from 'node:test';
import assert from 'node:assert/strict';
import {createOverseasBrief, selectOverseasBrief} from '../knowledge/overseas-brief.mjs';

const day = '2026-11-16';
const row = (title, values = {}) => ({
  新闻标题: title, 新闻简介: '公开摘要', 原文链接: 'https://example.test/' + title,
  展示日期: day, 展示状态: ['公开展示'], 消息来源: '公开来源', 地区: '泰国',
  ...values,
});

test('海外速览只返回北京时间当天明确公开的有限字段', () => {
  const entries = selectOverseasBrief([
    row('昨天', {展示日期: '2026-11-15'}),
    row('草稿', {展示状态: ['草稿']}),
    row('下架', {展示状态: ['下架']}),
    row('无链接', {原文链接: 'javascript:alert(1)'}),
    row('简讯', {内部备注: '不可公开'}),
    row('头条', {展示日期: '2026-11-15T16:00:00Z', 展示顺序: 1, 英文标题: 'Headline'}),
    row('重复', {原文链接: 'https://example.test/简讯'}),
  ], day);
  assert.deepEqual(entries.map(item => item.title), ['头条', '简讯']);
  assert.equal(entries[0].titleEn, 'Headline');
  assert.equal(entries[1].source, '公开来源');
  assert.doesNotMatch(JSON.stringify(entries), /内部备注|不可公开|javascript/);
});

test('后台共享一次抓取，登录读缓存，过了北京时间午夜即隐藏昨日内容', async () => {
  let time = Date.parse('2026-11-16T15:59:00Z'), calls = 0;
  const service = createOverseasBrief({now: () => time, async readRows() {calls++; return [row('头条')];}});
  assert.equal(service.snapshot().state, 'unavailable');
  await Promise.all([service.refresh(), service.refresh()]);
  assert.equal(calls, 1);
  assert.equal(service.snapshot().items.length, 1);
  assert.equal(calls, 1);
  time += 120000;
  assert.deepEqual(service.snapshot(), {day: '2026-11-17', items: [], state: 'unavailable'});
  await service.refresh();
  assert.equal(service.snapshot().state, 'ready');
  assert.deepEqual(service.snapshot().items, []);
});

test('海外速览提供五条以外的当日公开资讯供继续浏览',()=>{
  const entries=selectOverseasBrief(Array.from({length:7},(_,i)=>row('资讯'+i,{展示顺序:i})),day);
  assert.equal(entries.length,7);
  assert.equal(entries[6].title,'资讯6');
});

test('手动刷新立刻回读多维表，并复用并发及短间隔的结果',async()=>{
  let time=Date.parse('2026-11-16T07:00:00Z'),calls=0,paused=false;
  const service=createOverseasBrief({now:()=>time,isPaused:()=>paused,readRows:async()=>[row('第'+(++calls)+'次')]});
  await service.refresh();
  const first=await Promise.all([service.refreshOnDemand(),service.refreshOnDemand()]);
  assert.equal(calls,2);
  assert.deepEqual(first[0],first[1]);
  assert.equal(service.snapshot().items[0].title,'第2次');
  time+=6000;
  assert.equal((await service.refreshOnDemand()).items[0].title,'第3次');
  paused=true;
  await assert.rejects(service.refreshOnDemand());
  assert.equal(calls,3);
});

test('维护中启动后尽快补读，不等下一个十五分钟刷新点',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let paused=true,calls=0;
  const service=createOverseasBrief({now:()=>Date.parse('2026-11-16T12:03:00Z'),isPaused:()=>paused,readRows:async()=>{calls++;return [row('头条')];}});
  t.after(()=>service.close());
  service.start();
  t.mock.timers.tick(5000);
  assert.equal(calls,0);
  paused=false;
  t.mock.timers.tick(5000);
  await service.close();
  assert.equal(calls,1);
  assert.equal(service.snapshot().items[0].title,'头条');
});
