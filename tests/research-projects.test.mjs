import test from 'node:test';
import assert from 'node:assert/strict';
import {researchProjectConfigs,resolveResearchProject,createProjectResearchHandler} from '../research/projects.mjs';
import {questionDestination,researchApiUrl,pendingPrefix} from '../research/web/project-scope.mjs';

const config=()=>({baseToken:'base',defaultProject:'malaysia',projects:Object.fromEntries(['thailand','malaysia'].map(key=>[key,{tables:Object.fromEntries(['questions','findings','evidence','topics'].map(t=>[t,`${key}-${t}`])),fieldIds:{}}]))});
test('official projects require disjoint tables and a known default; no reference fallback',()=>{
 const c=config(),projects=researchProjectConfigs(c);assert.equal(projects.malaysia.tables.findings,'malaysia-findings');
 c.projects.thailand.tables.evidence=c.projects.malaysia.tables.evidence;assert.throws(()=>researchProjectConfigs(c),/重复/);
 assert.throws(()=>researchProjectConfigs({tables:{}}),/正式/);
 const bad=config();bad.defaultProject='common';assert.throws(()=>researchProjectConfigs(bad),/默认/);
});
test('writes require one explicit known project and cannot fall back to a default',()=>{
 assert.equal(resolveResearchProject('/api/research','malaysia',false),'malaysia');
 assert.equal(resolveResearchProject('/api/research?project=thailand','malaysia',true),'thailand');
 for(const url of ['/api/research','/api/research?project=common','/api/research?project=malaysia&project=thailand','/api/research?project=../reference'])assert.throws(()=>resolveResearchProject(url,'malaysia',true),/项目/);
});
test('question scope routes common to Malaysia and request/draft scopes remain isolated',()=>{
 assert.deepEqual(questionDestination('common'),{project:'malaysia',applicability:'通用'});
 assert.deepEqual(questionDestination('thailand'),{project:'thailand',applicability:'本项目'});
 assert.deepEqual(questionDestination('malaysia'),{project:'malaysia',applicability:'本项目'});
 assert.throws(()=>questionDestination('reference'),/归属/);
 assert.equal(researchApiUrl('/api/research/uploads?name=one.pdf','thailand'),'/api/research/uploads?name=one.pdf&project=thailand');
 assert.notEqual(pendingPrefix('thailand'),pendingPrefix('malaysia'));
});
test('the router selects the project for every operation, retry and file request',async()=>{
 const calls=[],handlers=Object.fromEntries(['thailand','malaysia'].map(key=>[key,async req=>{calls.push([key,req.url]);return true;}]));
 const router=createProjectResearchHandler({handlers,defaultProject:'malaysia'});
 for(const route of ['/api/research','/api/research/operations/uuid/retry','/api/research/local-files/uuid','/api/research/files/rec1/0'])await router({url:route+'?project=thailand',method:route.endsWith('retry')?'POST':'GET'},{});
 assert(calls.every(([p])=>p==='thailand'));assert.equal(calls.length,4);
 const response={writeHead(status){this.status=status;},end(body){this.body=JSON.parse(body);}};
 await router({url:'/api/research/operations',method:'POST'},response);assert.equal(response.status,400);assert.equal(calls.length,4);
});
