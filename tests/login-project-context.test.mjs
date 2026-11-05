import test from 'node:test';
import {pageCatalog} from '../auth/page-access.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AuthService } from '../auth/service.mjs';
import { createAuthHandler } from '../auth/http.mjs';
const origin = 'https://localhost:3333';
const config = () => ({ appId: 'cli_fixture', appSecret: 'fixture-only', origins: [origin] });
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'login-project-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = new AuthService({ dir, config, oauth: async () => ({ open_id: 'ou_fixture', name: '测试人员' }) });
  const handler = createAuthHandler({ service, root: process.cwd(), canBootstrap: () => false });
  return { dir, service, handler };
}
const request = (url, cookie = '') => ({ url, method: 'GET', headers: { host: 'localhost:3333', cookie }, socket: { encrypted: true, remoteAddress: '192.0.2.1' } });
const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, writeHead(status, headers = {}) { this.status = status; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); }, end(body = '') { this.body = body; } });
async function login(service, project = 'my-001') { const start = service.begin(origin, '/project-management?project=th-001', project); const result=await service.finish(origin,start.state,start.browser,'fixture-code');service.commit(state=>{state.access={grants:{[service.config().appId]:{[result.user.openId]:{revision:1,permissions:Object.fromEntries(pageCatalog.map(p=>[p.id,{view:true,edit:true}]))}}},mutations:{}};});return result; }
test('OAuth state binds the selected project and session survives restart', async t => {
  const f = fixture(t), logged = await login(f.service);
  assert.equal(f.service.session(logged.token).projectId, 'my-001');
  assert.equal(logged.returnTo, '/project-management?project=my-001');
  assert.equal(new AuthService({ dir: f.dir, config }).session(logged.token).projectId, 'my-001');
});
test('invalid project is rejected before creating an OAuth state', t => {
  const f = fixture(t); assert.throws(() => f.service.begin(origin, '/', 'not-a-project'), /项目/);
  assert.equal(Object.keys(f.service.state.states).length, 0);
});
test('session exposes selected project and only actual login projects', async t => {
  const f = fixture(t), logged = await login(f.service), res = response();
  await f.handler(request('/api/auth/session', `__Host-vnet_session=${logged.token}`), res);
  const body = JSON.parse(res.body); assert.equal(body.project.id, 'my-001');
  assert.equal(body.project.knowledgeKey, 'malaysia');
  assert.deepEqual(body.projects.map(project => project.id), ['th-001', 'my-001']);
  assert.doesNotMatch(res.body, /fixture-code|ou_fixture|fixture-only/);
});
test('fresh authorize requires login project choice and keeps existing authorization flow', async t => {
  const f = fixture(t), res = response();
  await f.handler(request('/api/auth/feishu/authorize?returnTo=%2Fknowledge-sharing'), res);
  assert.equal(res.status, 303); assert.match(res.headers.location, /^\/login\?/);
  assert.equal(Object.keys(f.service.state.states).length, 0);
  const started = response(); await f.handler(request('/api/auth/feishu/authorize?project=my-001&returnTo=%2Fknowledge-sharing'), started);
  assert.equal(new URL(started.headers.location).hostname, 'accounts.feishu.cn');
  assert.equal(Object.values(f.service.state.states)[0].projectId, 'my-001');
});
test('page links follow session project; explicit change happens on login page', async t => {
  const f = fixture(t), logged = await login(f.service), cookie = `__Host-vnet_session=${logged.token}`;
  const page = response(); await f.handler(request('/knowledge-sharing?project=thailand', cookie), page);
  assert.equal(page.status, 303); assert.equal(page.headers.location, '/knowledge-sharing?project=malaysia');
  const choose = response(); await f.handler(request('/login?selectProject=1', cookie), choose);
  assert.equal(choose.status, 200); assert.match(String(choose.body), /id="loginProject"/);
});
test('legacy sessions can choose a project instead of silently defaulting to Thailand', async t => {
  const f = fixture(t), start = f.service.begin(origin, '/'), logged = await f.service.finish(origin, start.state, start.browser, 'legacy');
  const res = response(); await f.handler(request('/login', `__Host-vnet_session=${logged.token}`), res);
  assert.equal(res.status, 200); assert.match(String(res.body), /id="loginProject"/);
});
test('scoped API defaults come from session and unconnected Malaysia task data never falls back', async t => {
  const f = fixture(t), logged = await login(f.service), cookie = `__Host-vnet_session=${logged.token}`;
  const req = request('/api/priorities', cookie), res = response();
  assert.equal(await f.handler(req, res), false); assert.equal(new URL(req.url, origin).searchParams.get('project'), 'my-001');
  assert.equal(req.auth.project.id, 'my-001');
  const plan = response(); await f.handler(request('/api/base-sync', cookie), plan);
  assert.equal(plan.status, 409); assert.match(JSON.parse(plan.body).error, /未接入/);
});
