import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewModel, renderOverview } from '../research/web/overview.mjs';
const input={questions:[{id:'overseas:2.1.1',category:'组织',projectKey:'overseas',projectName:'海外项目',title:'人员',priority:true},{id:'overseas:2.2.1',category:'组织',projectKey:'overseas',title:'招聘'}],companies:[{name:'甲',code:'A'},{name:'乙',code:'B'}],findings:[{questionId:'overseas:2.1.1',company:'甲',hasMaterial:true}],evidence:[{id:'e1',questionId:'overseas:2.1.1',company:'甲',name:'a.png',mime:'image/png',downloadable:true}]};
test('overview counts unique cells and separates question coverage from object coverage',()=>{const m=overviewModel({...input,questions:[...input.questions,input.questions[0]],findings:[...input.findings,...input.findings],evidence:[...input.evidence,...input.evidence]});assert.equal(m.questions.length,2);assert.equal(m.total,4);assert.equal(m.covered,1);assert.equal(m.recordedQuestions,1);assert.equal(m.files,1);assert.equal(m.gaps.length,3);assert.equal(m.projects[0].total,4);});
test('the exact supplied filtered questions and selected companies define every overview section',()=>{const m=overviewModel({...input,questions:[input.questions[1]],companies:[input.companies[1]]});assert.equal(m.total,1);assert.equal(m.covered,0);assert.equal(m.files,0);assert.equal(m.priorityTotal,0);assert.equal(m.gaps[0].question.id,'overseas:2.2.1');});
test('empty coverage is unknown and rendered output escapes labels',()=>{const m=overviewModel({...input,questions:[]});assert.equal(m.rate,null);assert(!renderOverview(m).includes('NaN'));const html=renderOverview(overviewModel({...input,questions:[{...input.questions[0],title:'<img onerror=evil>'}]}));assert(!html.includes('<img onerror'));assert.match(html,/data-overview-question/);});

test('single-source overview prioritizes the coverage table without duplicate summary panels',()=>{
 const html=renderOverview(overviewModel(input));assert(html.indexOf('覆盖透视')<html.indexOf('调研对象覆盖'));assert.doesNotMatch(html,/覆盖概览|项目对比/);
 assert.match(html,/aria-label="资料类型分布"/);assert.match(html,/图片/);assert.match(html,/data-drill-company="甲"/);
});
test('gap preview groups each question once while preserving its missing company targets',()=>{
 const html=renderOverview(overviewModel(input));assert.equal((html.match(/data-overview-question="overseas:2.2.1"/g)||[]).length,1);assert.match(html,/甲、乙/);
});
test('multiple project comparisons remain available without changing the filtered totals',()=>{
 const m=overviewModel({...input,questions:[...input.questions,{...input.questions[1],id:'second:2.2.1',projectKey:'second',projectName:'第二范围'}]});const html=renderOverview(m);assert.match(html,/项目对比/);assert.match(html,/data-drill-project="second"/);assert.equal(m.total,6);
});
