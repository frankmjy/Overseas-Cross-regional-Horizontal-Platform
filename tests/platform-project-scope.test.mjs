import test from 'node:test';
import assert from 'node:assert/strict';
import { filterDocuments, filterMeetings } from '../knowledge/web/data.mjs';
import { platformProjects, projectDestination } from '../src/project-context-model.mjs';
import { readPlatformSession, invalidatePlatformSession } from '../src/platform-context.js';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createMeetingHandler} from '../knowledge/meeting-http.mjs';

test('browser can load the shared project model through the production static route', () => {
  const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const resolver = source.slice(source.indexOf('function resolveRequestPath('), source.indexOf('async function findFile('));
  const context = vm.createContext({URL,path,ROOT:process.cwd(),HOST:'127.0.0.1',PORT:3333});
  vm.runInContext(resolver, context);
  assert.equal(context.resolveRequestPath('/src/project-context-model.mjs'), path.join(process.cwd(),'src/project-context-model.mjs'));
  assert.match(source, /'\.mjs':\s*'text\/javascript; charset=utf-8'/);
});
test('project documents follow login project while shared references stay visible to both', () => {
  const doc = (id, projectScope) => ({ id, projectScope, title: id, summary: '', sourceName: '', subcategory: '', specialty: '', date: '', tags: [], sections: [] });
  const documents = [doc('泰国资料', '泰国'), doc('马来资料', '马来'), doc('海外共用', '海外'), doc('国内参考', '')];
  assert.deepEqual(filterDocuments(documents, { project: 'thailand' }).map(d => d.id), ['国内参考','泰国资料','海外共用'].sort((a,b)=>a.localeCompare(b,'zh-CN')));
  assert(!filterDocuments(documents, { project: 'malaysia' }).some(d => d.id === '泰国资料'));
  assert(filterDocuments(documents, { project: 'malaysia' }).some(d => d.id === '海外共用'));
});
test('shared meetings remain visible with selected project, foreign project meetings stay out', () => {
  const meeting = (id, project) => ({ id, project, title: id, type: '', date: '', time: '', summary: '', participants: [], decisions: [], actions: [] });
  const rows = [meeting('thai', 'thailand'), meeting('my', 'malaysia'), meeting('shared', 'overseas')];
  assert.deepEqual(filterMeetings(rows, { project: 'malaysia', includeShared: true }).map(row => row.id), ['my', 'shared']);
});
test('workspace routes adapt to each module without changing the selected project', () => {
  const my = platformProjects.find(p => p.id === 'my-001');
  assert.equal(projectDestination('/staffing-reserve?project=th-001', my), '/staffing-reserve?project=my-001');
  assert.equal(projectDestination('/knowledge-sharing?project=thailand', my), '/knowledge-sharing?project=malaysia');
  assert.equal(projectDestination('/?project=malaysia', my), '/?project=overseas');
  assert.equal(projectDestination('/research?project=malaysia',my),'/research?project=overseas');
});
test('account and business modules reuse one session read', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; invalidatePlatformSession(); });
  invalidatePlatformSession(); let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ ok: true, authenticated: true, project: { id: 'my-001' } }) }; };
  const [account, workspace] = await Promise.all([readPlatformSession(), readPlatformSession()]);
  assert.equal(calls, 1); assert.equal(account, workspace);
});

test('meeting choices and writes keep the login project plus shared scope', async () => {
  const service={refreshing:true,state:{operations:{}},options:()=>({projects:[{id:'thailand'},{id:'malaysia'},{id:'overseas'}]}),accept(){throw Error('foreign write reached service');}};
  const handler=createMeetingHandler({service}),auth={openId:'ou_fixture',project:platformProjects[1]};
  const output=()=>({writeHead(status){this.status=status;},end(body){this.body=JSON.parse(body);}});
  const choices=output();await handler({url:'/api/knowledge/meetings/options',method:'GET',auth},choices);
  assert.deepEqual(choices.body.projects.map(p=>p.id),['malaysia','overseas']);
  const req=Readable.from([Buffer.from(JSON.stringify({project:'thailand'}))]);Object.assign(req,{url:'/api/knowledge/meetings/create',method:'POST',auth,headers:{host:'localhost:3333',origin:'https://localhost:3333','content-type':'application/json'}});
  const rejected=output();await handler(req,rejected);assert.equal(rejected.status,409);
});
