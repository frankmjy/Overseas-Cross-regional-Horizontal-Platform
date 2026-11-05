import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStaffing, staffingModel,openStaffingChart } from '../research/web/staffing.mjs';
test('staffing is derived from current text and local/dispatch remain separate',()=>{
 const a=parseStaffing('甲','B1号楼（24MW）：共5人，其中本地3人（电气2、暖通1），外派2人（楼长1、值班长1）。人员合计：5人。');assert.equal(a.total,5);assert.equal(a.local,3);assert.equal(a.dispatch,2);assert.equal(a.rows.find(r=>r.role==='设施经理').dispatch,1);
 const b=parseStaffing('甲','B1号楼：共6人，其中本地4人（电气3、暖通1），外派2人（楼长1、值班长1）。');assert.equal(b.total,6);assert.equal(b.rows.find(r=>r.role==='电气').local,3);
});
test('COCC and campus unspecified staff never become invented local or dispatch counts',()=>{const a=parseStaffing('秦淮数据','园区：共12人，园区经理2人、设施经理2人、运维值班员8人。COCC（集中运营控制中心）：共12人，设施经理2人、弱电工程师1人、消防工程师1人、运维值班长4人、运维值班员4人。');assert.equal(a.total,24);assert.equal(a.local,0);assert.equal(a.dispatch,0);assert.equal(a.unknown,24);const m=staffingModel([a],{scope:'cocc'});assert.equal(m.total,12);assert.equal(m.columns.length,1);});
test('shared each-count roles are parsed and unknown prose is reported without fabricated totals',()=>{const a=parseStaffing('甲','园区管理团队共4人，均为本地员工，包括园区经理、设施经理、EHS经理及值班主管各1人。');assert.equal(a.total,4);assert.equal(a.rows.length,4);assert.equal(a.local,4);const b=parseStaffing('甲','尚未确定人员数量');assert.equal(b.total,null);assert(b.issues.length);});
test('building summaries and detailed roles are not counted twice',()=>{const a=parseStaffing('甲','总配置8人，其中园区外派2人，园区本地0人；1号楼共配置6人，其中本地4人、外派2人。园区外派岗位：园区经理、楼长各1人。1号楼本地：电气工程师2人、值班员2人。1号楼外派：电气工程师2人。');assert.equal(a.total,8);assert.equal(a.local,4);assert.equal(a.dispatch,4);assert.equal(staffingModel([a],{roles:['电气']}).total,4);});
test('staffing cards follow scope and role selection along with the chart',()=>{const dialog={open:true,innerHTML:''},chart=openStaffingChart(dialog,[{company:'甲',content:'园区：共2人，园区经理2人。COCC：共3人，设施经理2人、值班员1人。'}],{backQuestion:'overseas:2.1.1'});assert.match(dialog.innerHTML,/>5<small>/);chart.setScope('cocc');assert.match(dialog.innerHTML,/>3<small>/);assert.doesNotMatch(dialog.innerHTML,/本地 0 · 外派 0/);chart.setRole('设施经理');assert.match(dialog.innerHTML,/>2<small>/);assert(!dialog.innerHTML.includes('甲 · 园区'));
});
