import test from 'node:test';
import assert from 'node:assert/strict';
import { handoverStages, operationsCategories, documentLifecycle, lifecycleDocuments } from '../knowledge/lifecycle.mjs';
import { libraryDocuments } from '../knowledge/library-model.mjs';
import { filterDocuments } from '../knowledge/web/data.mjs';

test('handover uses all seven handbook stages and 68 unique document folders', () => {
  assert.deepEqual(handoverStages.map(stage => stage.name), ['选址阶段','项目筹备','机电进场','验证测试','验收阶段','开服准备','反馈优化']);
  const folders = handoverStages.flatMap(stage => stage.groups.flatMap(group => group.folders));
  assert.equal(folders.length, 68);
  assert.equal(new Set(folders.map(folder => folder.code)).size, 68);
  assert.equal(folders.find(folder => folder.code === 'S1.3.3').name, '运维需求与技术规格');
  assert.equal(operationsCategories.length, 6);
});

test('explicit document classification resolves the full lifecycle path without changing its source', () => {
  const document = { id:'equipment', title:'UPS', libraryScope:'shared', classification:'S1.3.3' };
  const before = structuredClone(document);
  assert.deepEqual(documentLifecycle(document), { chapter:'handover', stage:'1', group:'s1g3', folder:'S1.3.3', path:['接维篇','项目筹备','工程技术与平台筹备','运维需求与技术规格'] });
  assert.deepEqual(document, before);
});

test('references are not relabelled overseas and ambiguous records stay findable', () => {
  assert.equal(documentLifecycle({title:'UPS日常巡检', libraryScope:'domestic', classification:'S1.3.3'}).chapter, '');
  assert.equal(documentLifecycle({title:'未知资料', libraryScope:'shared'}).chapter, '');
  const rows = [{id:'known', libraryScope:'shared', classification:'S1.3.3'}, {id:'unknown', libraryScope:'shared'}];
  assert.equal(lifecycleDocuments(rows, {}).length, 2);
  assert.deepEqual(lifecycleDocuments(rows, {chapter:'handover', stage:'1', group:'s1g3', folder:'S1.3.3'}).map(row=>row.id), ['known']);
  assert.equal(lifecycleDocuments(rows, {chapter:'operations'}).length, 0);
});

test('stage selection retains shared files and never reveals another project', () => {
  const rows = [
    {id:'th',libraryScope:'project',projectScope:'泰国',classification:'S1.1.1'},
    {id:'my',libraryScope:'project',projectScope:'马来',classification:'S1.1.1'},
    {id:'shared',libraryScope:'shared',classification:'S1.3.3'},
  ];
  const selected = libraryDocuments(rows, {project:'malaysia'});
  assert.deepEqual(lifecycleDocuments(selected, {chapter:'handover',stage:'1'}).map(row=>row.id), ['my','shared']);
});

test('operations categories require an explicit assignment and do not absorb domestic EHS', () => {
  const doc = {id:'operation',libraryScope:'project',lifecycle:{chapter:'operations',category:'maintenance'}};
  assert.equal(documentLifecycle(doc).category, 'maintenance');
  assert.equal(lifecycleDocuments([doc], {chapter:'operations',group:'maintenance'}).length, 1);
  assert.equal(lifecycleDocuments([doc], {chapter:'operations',group:'safety'}).length, 0);
});

test('search matches lifecycle folder names as well as document titles', () => {
  const document={id:'ups',title:'UPS',libraryScope:'shared',classification:'S1.3.3',summary:'',tags:[],sections:[],date:''};
  assert.equal(filterDocuments([document],{query:'工程技术与平台筹备'}).length,1);
  assert.equal(filterDocuments([document],{query:'运维需求与技术规格'}).length,1);
});

test('quick nature tags match any selected nature and combine with specialty and project filters', () => {
  const rows = [
    {id:'a',title:'UPS',nature:'设备技术规格',specialty:'电气',tags:[],sections:[],date:''},
    {id:'b',title:'水泵',nature:'运维维保需求规范',specialty:'暖通',tags:[],sections:[],date:''},
    {id:'c',title:'图纸',nature:'项目规划',specialty:'电气',tags:[],sections:[],date:''},
  ];
  assert.deepEqual(filterDocuments(rows,{natures:['设备技术规格','运维维保需求规范']}).map(row=>row.id).sort(), ['a','b']);
  assert.deepEqual(filterDocuments(rows,{natures:['设备技术规格','运维维保需求规范'],specialties:['电气']}).map(row=>row.id),['a']);
});
