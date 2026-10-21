import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildBusinessPlan,curateLessons,lessonTypes,buildWorkTemplates,customerText} from '../scripts/overseas-business-data.mjs';
const source=JSON.parse(fs.readFileSync(new URL('../reports/base-reorganize-20261018/full-source.json',import.meta.url),'utf8'));
test('formal customer wording is generic while original URLs remain intact',()=>{
 assert.equal(customerText('字节跳动、字节、抖音、ByteDance'), '客户、客户、客户、客户');
 assert.equal(customerText('字节资料 https://example.com/字节.pdf'), '客户资料 https://example.com/字节.pdf');
});
test('each unexecuted business has one explicit example without copied people, actual dates or results',()=>{
  const plans=buildBusinessPlan(source);assert.equal(plans.length,9);
  for(const p of plans){assert.equal(p.rows.length,1);const r=p.rows[0];assert.equal(r['Example（示例）'],true);assert.match(r[p.fields[0].name],/^\[Example／示例\]/);assert.ok(r['Reference（参考来源）'].startsWith('https://vnet.feishu.cn/wiki/'));
    assert.equal(new Set(p.fields.map(f=>f.name)).size,p.fields.length);
    for(const f of p.fields){if(['user','datetime','attachment','number'].includes(f.type))assert.equal(r[f.name]??null,null,`${p.key} ${f.name}`);assert.match(f.name,/^[A-Za-z].*（.+）$/);}
  }
});
test('reusable formal checklists preserve source requirements while clearing execution facts',()=>{
  const plans=buildWorkTemplates(source);
  assert.deepEqual(plans.map(p=>p.key),['live-initialization','live-training','live-routine','live-interfaces','live-sla','live-ehs']);
  for(const p of plans){assert.ok(p.rows.length>1,p.key);assert.equal(new Set(p.rows.map(r=>r['Setup Key（初始化标识）'])).size,p.rows.length);
    for(const r of p.rows){assert.equal(r['Example（示例）'],false);assert.equal(r['Project（项目）']??null,null);assert.ok(r['Reference（参考来源）']);
      for(const f of p.fields.filter(f=>['user','datetime','attachment'].includes(f.type)))assert.equal(r[f.name]??null,null,f.name);
      for(const n of ['Site Progress（现场工作进度）','Work Review（工作结果审核）','Result（工作结果）','Actual Value（实际结果）','Agreed Target（项目约定指标）'])assert.equal(r[n]??null,null,n);
    }
  }
  const init=plans[0];assert.ok(init.rows.some(r=>r['Checking Role（检查岗位）']));assert.ok(init.rows.some(r=>r['Priority（优先级）']));assert.ok(init.rows.every(r=>r['Method（实施方法）']||r['Target（工作目标）']));
  assert.ok(plans.find(p=>p.key==='live-ehs').rows.every(r=>!r['Annual Progress（年度完成进度）']));
});
test('formal lessons cover seven source categories and retain every contributing record link',()=>{
  const p=curateLessons(source);assert.ok(p.rows.length>100);assert.ok(p.rows.length<p.candidates);
  assert.deepEqual(new Set(p.rows.map(r=>r['Lesson Type（经验类别）'])),new Set(lessonTypes));
  assert.equal(p.rows.reduce((n,r)=>n+r['Source Records（来源记录）'].split('\n').length,0),p.candidates);
  assert.equal(new Set(p.rows.map(r=>r['Setup Key（初始化标识）'])).size,p.rows.length);
  for(const r of p.rows){assert.ok(r['Key Points（经验要点）']);assert.ok(!Object.hasOwn(r,'Project（项目）'));}
});
