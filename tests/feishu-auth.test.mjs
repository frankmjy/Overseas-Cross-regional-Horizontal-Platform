import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { AuthService, safeReturnTo, requestOrigin, authConfig } from '../auth/service.mjs';
import { createAuthHandler } from '../auth/http.mjs';
import { readProjectWeather } from '../auth/project-weather.mjs';

const origin = 'https://localhost:3333';
const config = () => ({ appId: 'cli_test', appSecret: 'private-test-only', origins: [origin] });
const profile = { open_id: 'ou_verified', name: '测试人员', tenant_key: 'test-tenant' };
function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vnet-auth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let calls = 0, now = Date.parse('2026-10-24T00:00:00Z');
  const oauth = async () => { calls++; return profile; };
  const service = new AuthService({ dir, config, oauth, now: () => now, ...options });
  return { service, dir, calls: () => calls, advance: n => { now += n; } };
}
function req(url, cookie = '', extra = {}) { return { url, method: 'GET', headers: { host: 'localhost:3333', cookie }, socket: { encrypted: true, remoteAddress: '127.0.0.1' }, ...extra }; }
function res() { return { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, writeHead(status, headers = {}) { this.status = status; for (const [k, v] of Object.entries(headers)) this.setHeader(k, v); }, end(body = '') { this.body = body; } }; }
async function login(service) { const started = service.begin(origin, '/project-management'); return service.finish(origin, started.state, started.browser, 'code'); }

test('business translation is optional and requires an authenticated same-origin session', async t => {
  const f = fixture(t), logged = await login(f.service);
  const cookie = `__Host-vnet_session=${logged.token}`;
  const url = '/api/translation';
  const translated = [];
  const handle = createAuthHandler({service:f.service,root:process.cwd(),translateBusiness:async value => {
    translated.push(value);
    return 'Meeting follow-up';
  }});
  const call = async (handler, sessionCookie, source = origin) => {
    const request = Object.assign(Readable.from(['{"text":"会议跟进"}']), req(url, sessionCookie, {
      method: 'POST', headers: {host:'localhost:3333',cookie:sessionCookie,origin:source,'content-type':'application/json'},
    }));
    const response = res();
    assert.equal(await handler(request,response),true);
    return response;
  };
  const disabled = createAuthHandler({service:f.service,root:process.cwd()});
  assert.equal((await call(disabled,cookie)).status,503);
  assert.equal((await call(handle,'')).status,401);
  assert.equal((await call(handle,cookie,'https://foreign.invalid')).status,403);
  assert.deepEqual(translated,[]);
  const result = await call(handle,cookie);
  assert.equal(result.status,200);
  assert.equal(JSON.parse(result.body).translation,'Meeting follow-up');
  assert.deepEqual(translated,['会议跟进']);
});

test('return destinations reject external, encoded and auth-loop redirects', () => {
  for (const value of ['//evil.example', '/\\evil', '/%2f%2fevil', '/%5cevil', 'https://evil', '/api/auth/feishu/authorize', '/login', '/\r\nfoo', '/%252f%252fevil']) assert.equal(safeReturnTo(value), '/');
  assert.equal(safeReturnTo('/project-management?code=secret&project=thailand#plan'), '/project-management?project=thailand#plan');
  assert.equal(safeReturnTo('/project-management?tab=gantt&stage=2&q=phase%20one'), '/project-management?tab=gantt&stage=2&q=phase%20one');
});

test('meeting login return preserves only allowed filters',()=>{assert.equal(safeReturnTo('/meeting-trail?project=thailand&date=2026-10-15&type=已开&token=secret'),'/meeting-trail?project=thailand&date=2026-10-15&type=%E5%B7%B2%E5%BC%80');});
test('coordination login preserves platform and discards credentials',()=>{assert.equal(safeReturnTo('/cross-coordination?platform=materials&q=pump&token=secret'),'/cross-coordination?platform=materials&q=pump');});
test('coordination login preserves specialty and list layout',()=>{const target='/cross-coordination?specialty=%E7%94%B5%E6%B0%94&group=specialty-category&pageSize=50&page=2';assert.equal(safeReturnTo(target+'&token=secret'),target);assert.equal(safeReturnTo('/knowledge-sharing?specialty=test&group=test&pageSize=50'),'/knowledge-sharing');});
test('coordination pages and API require the existing authenticated session',async t=>{const f=fixture(t),handler=createAuthHandler({service:f.service,root:process.cwd()});for(const [url,status]of [['/cross-coordination?platform=materials',303],['/api/coordination',401],['/coordination/model.mjs',401]]){const response=res();assert.equal(await handler(req(url),response),true);assert.equal(response.status,status);}});

test('origin is explicit HTTPS allowlist, never a forwarded header or foreign host', () => {
  assert.equal(requestOrigin(req('/'), config().origins), origin);
  assert.throws(() => requestOrigin(req('/', '', { headers: { host: 'evil.example' } }), config().origins));
  assert.throws(() => requestOrigin(req('/', '', { headers: { host: 'localhost:3333', 'x-forwarded-host': 'evil.example' } }), config().origins));
  assert.throws(() => requestOrigin(req('/', '', { socket: { encrypted: false } }), config().origins));
});

test('approved formal and localhost origins generate their exact callback; other addresses stay denied', t => {
  const approved = ['https://www.sm.sjhl.online:3333', 'https://localhost:3333'];
  assert.deepEqual(authConfig().oauthOrigins, approved);
  const f = fixture(t, { config: () => ({ ...authConfig(), appId: 'cli_test', appSecret: 'private-test-only' }) });
  for (const address of approved) {
    const start = f.service.begin(address, '/project-management');
    assert.equal(new URL(start.url).searchParams.get('redirect_uri'), `${address}/api/auth/feishu/callback`);
  }
  for (const address of ['http://localhost:3333', 'https://127.0.0.1:3333', 'https://localhost:3334', 'https://evil.example']) {
    assert.throws(() => f.service.begin(address, '/'), /访问地址未启用飞书登录/);
  }
});

test('state is browser-bound, one-time, expires and does not expose tokens on disk', async t => {
  const f = fixture(t), start = f.service.begin(origin, '/project-management');
  await assert.rejects(f.service.finish(origin, start.state, 'wrong', 'code'));
  const result = await f.service.finish(origin, start.state, start.browser, 'code');
  assert.equal(result.returnTo, '/project-management'); assert.equal(result.user.name, '测试人员');
  assert.equal(f.service.session(result.token).user.openId, profile.open_id);
  await assert.rejects(f.service.finish(origin, start.state, start.browser, 'code'));
  assert.equal(f.calls(), 1);
  const persisted = fs.readFileSync(path.join(f.dir, 'ledger.json'), 'utf8');
  assert.ok(!persisted.includes(result.token)); assert.ok(!persisted.includes(start.browser));
  assert.doesNotMatch(persisted, /private-test-only|access_token|authorization_code/);
  const expired = f.service.begin(origin, '/'); f.advance(11 * 60_000);
  await assert.rejects(f.service.finish(origin, expired.state, expired.browser, 'code'));
});

test('parallel callbacks exchange once and persist record before returning session', async t => {
  const f = fixture(t), start = f.service.begin(origin, '/');
  const results = await Promise.allSettled([1, 2].map(() => f.service.finish(origin, start.state, start.browser, 'code')));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1); assert.equal(f.calls(), 1);
  const disk = JSON.parse(fs.readFileSync(path.join(f.dir, 'ledger.json'), 'utf8'));
  assert.equal(Object.keys(disk.events).length, 1); assert.equal(Object.keys(disk.sessions).length, 1);
});

test('sessions and outbox survive restart; logout revokes and expires are enforced', async t => {
  const f = fixture(t), logged = await login(f.service);
  const resumed = new AuthService({ dir: f.dir, config });
  // Use the fixture clock for this isolated historical input.
  resumed.now = f.service.now;
  assert.equal(resumed.session(logged.token).user.name, profile.name);
  resumed.logout(logged.token, logged.csrf);
  assert.equal(resumed.session(logged.token), null);
  assert.ok(Object.values(resumed.state.events)[0].logoutTime);
  const second = await login(f.service); f.advance(13 * 3600_000);
  assert.equal(f.service.session(second.token), null);
});

test('one hour idle expires even while status and business GETs poll', async t => {
  const f = fixture(t), logged = await login(f.service);
  const cookie = `__Host-vnet_session=${logged.token}`;
  const handle = createAuthHandler({ service: f.service, root: process.cwd() });
  const hour = 3600_000;
  for (let minute = 0; minute < 60; minute += 10) {
    if (minute) f.advance(600_000);
    const status = res();
    await handle(req('/api/auth/session', cookie), status);
    assert.equal(JSON.parse(status.body).expiresInMs, hour - minute * 60_000);
    assert.equal(await handle(req('/api/coordination', cookie), res()), false);
  }
  f.advance(600_000);
  assert.equal(f.service.session(logged.token), null);
  const expired = res();
  await handle(req('/api/coordination', cookie), expired);
  assert.equal(expired.status, 401);
  assert.equal(expired.headers['x-vnet-login-required'], '1');
  const page = res();
  await handle(req('/project-management?project=th-001&tab=gantt', cookie), page);
  assert.equal(page.status, 303);
  assert.equal(new URL(page.headers.location, origin).searchParams.get('returnTo'), '/project-management?project=th-001&tab=gantt');
});

test('same-origin activity with CSRF extends idle deadline across restart and cannot revive it', async t => {
  const f = fixture(t), logged = await login(f.service);
  const cookie = `__Host-vnet_session=${logged.token}`;
  const handle = createAuthHandler({ service: f.service, root: process.cwd() });
  const request = (source, csrf) => req('/api/auth/activity', cookie, { method: 'POST', headers: { host: 'localhost:3333', cookie, origin: source, 'x-csrf-token': csrf } });
  f.advance(3_500_000);
  for (const [source, csrf] of [['https://evil.example', logged.csrf], [origin, 'bad']]) {
    const denied = res();
    await handle(request(source, csrf), denied);
    assert.equal(denied.status, 403);
  }
  const active = res();
  await handle(request(origin, logged.csrf), active);
  assert.equal(active.status, 200);
  assert.equal(JSON.parse(active.body).expiresInMs, 3600_000);
  const resumed = new AuthService({ dir: f.dir, config, now: f.service.now });
  f.advance(3_599_999);
  assert.ok(resumed.session(logged.token));
  f.advance(1);
  assert.equal(resumed.session(logged.token), null);
  const expired = res();
  await handle(request(origin, logged.csrf), expired);
  assert.equal(expired.status, 401);
});

test('existing sessions without activity use their creation time as the idle baseline', async t => {
  const f = fixture(t), logged = await login(f.service);
  f.service.commit(next => { for (const session of Object.values(next.sessions)) delete session.lastActivity; });
  f.advance(3_600_000);
  assert.equal(Boolean(f.service.session(logged.token)), false);
});

test('weather uses the authenticated project even when a different project is requested', async t => {
  const f = fixture(t), queried = [];
  const handle = createAuthHandler({ service: f.service, root: process.cwd(),
    readWeather: async location => { queried.push(location); return { temperature: location.label === 'Araya' ? 29 : 25, symbol: 'cloudy' }; },
  });
  for (const id of ['th-001', 'my-001']) {
    const started = f.service.begin(origin, '/project-management', id);
    const logged = await f.service.finish(origin, started.state, started.browser, 'code');
    const response = res();
    await handle(req('/api/project-weather?project=th-001', `__Host-vnet_session=${logged.token}`), response);
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).weather?.temperature, id === 'th-001' ? 29 : 25);
  }
  assert.deepEqual(queried.map(location => location.label), ['Araya', '古来']);
  const guest = res();
  await handle(req('/api/project-weather'), guest);
  assert.equal(guest.status, 401);
});

test('weather requests share the provider cache and advance through forecast time slots', async t => {
  const initial = Date.parse('2026-11-08T06:00:00Z');
  let now = initial;
  t.mock.method(Date, 'now', () => now);
  const point = (offset, temperature) => ({
    time: new Date(initial + offset * 3600_000).toISOString(),
    data: { instant: { details: { air_temperature: temperature } }, next_1_hours: { summary: { symbol_code: 'cloudy' } } },
  });
  const modified = 'Sun, 08 Nov 2026 06:00:00 GMT';
  const request = t.mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options.headers['If-Modified-Since']) {
      assert.equal(options.headers['If-Modified-Since'], modified);
      return new Response(null, { status: 304 });
    }
    return Response.json({ properties: { timeseries: [point(0, 30), point(1, 29), point(3, 28)] } }, {
      headers: { 'Last-Modified': modified, Expires: new Date(initial + 4 * 3600_000).toUTCString() },
    });
  });
  const location = { latitude: 1.2345, longitude: 2.3456 };
  const first = await Promise.all([readProjectWeather(location), readProjectWeather(location)]);
  assert.deepEqual(first.map(weather => weather.temperature), [30, 30]);
  now += 3 * 3600_000;
  assert.equal((await readProjectWeather(location)).temperature, 28);
  assert.equal(request.mock.callCount(), 1);
  now += 3600_000;
  assert.equal((await readProjectWeather(location)).temperature, 28);
  assert.equal(request.mock.callCount(), 2);
});

test('failed disk commit does not leave an accepted in-memory login', async t => {
  const f = fixture(t), start = f.service.begin(origin, '/');
  fs.renameSync(f.dir, `${f.dir}-held`); fs.writeFileSync(f.dir, 'not a directory');
  t.after(() => { fs.rmSync(f.dir, { force: true }); fs.renameSync(`${f.dir}-held`, f.dir); });
  await assert.rejects(f.service.finish(origin, start.state, start.browser, 'code'));
  assert.equal(Object.keys(f.service.state.sessions).length, 0);
});

test('outbox retries uncertain creates by stable id and syncs logout without duplicates', async t => {
  let writes = 0; const rows = new Map();
  const sink = { async sync(event) { if (!rows.has(event.id)) { rows.set(event.id, structuredClone(event)); writes++; throw Error('response lost'); } rows.set(event.id, structuredClone(event)); return 'rec_test'; } };
  const f = fixture(t, { sink }), logged = await login(f.service);
  await f.service.flush(); assert.equal(writes, 1); assert.equal(f.service.auditStatus(logged.token), 'pending');
  f.advance(60_000); await f.service.flush(); assert.equal(writes, 1); assert.equal(f.service.auditStatus(logged.token), 'synced');
  f.service.logout(logged.token, logged.csrf); await f.service.flush();
  assert.equal(writes, 1); assert.ok([...rows.values()][0].logoutTime);
});

test('logout while an audit request is in flight still queues its changed revision', async t => {
  let release; const sink = { sync: () => new Promise(resolve => { release = resolve; }) };
  const f = fixture(t, { sink }), logged = await login(f.service), pending = f.service.flush();
  f.service.logout(logged.token, logged.csrf); release('rec_test'); await pending;
  assert.equal(Object.values(f.service.state.events)[0].syncStatus, 'pending');
});

test('gate covers pages, API, SVG, spreadsheets and aliases before business handlers', async t => {
  const f = fixture(t), handle = createAuthHandler({ service: f.service, root: path.resolve('.') });
  for (const url of ['/', '/index.html', '/project-management', '/knowledge-sharing', '/meeting-trail', '/api/research', '/api/project-tasks', '/api/project-tasks/status', '/api/team-organization', '/assets/vnet-thailand-organization.svg', '/THAI_NEXUSLINK_BOI_original.xlsx', '/%61pi/research']) {
    const response = res(); assert.equal(await handle(req(url), response), true);
    assert.equal(response.status, url === '/' || ['/index.html', '/project-management', '/knowledge-sharing', '/meeting-trail'].includes(url) ? 303 : 401, url);
    assert.doesNotMatch(response.body, /测试人员/);
  }
  const logged = await login(f.service);
  const allowed = res();
  assert.equal(await handle(req('/api/coordination', `__Host-vnet_session=${logged.token}`), allowed), false);
  assert.equal(allowed.headers.vary, 'Cookie');
});

test('HTTP callback cleans URL, status exposes no identifiers, logout resists CSRF', async t => {
  const f = fixture(t), handle = createAuthHandler({ service: f.service, root: path.resolve('.') });
  const authorize = res(); await handle(req('/api/auth/feishu/authorize?project=th-001&returnTo=%2Fproject-management'), authorize);
  const state = new URL(authorize.headers.location).searchParams.get('state');
  const cookie = authorize.headers['set-cookie'].find(v => v.startsWith('__Host-vnet_oauth=')).split(';')[0];
  assert.match(cookie, /^__Host-/); assert.ok(authorize.headers['set-cookie'].every(c => /Secure; HttpOnly; SameSite=Lax/.test(c)));
  const callback = res(); await handle(req(`/api/auth/feishu/callback?state=${state}&code=private-code`, cookie), callback);
  assert.equal(callback.headers.location, '/cross-coordination');
  const sessionCookie = callback.headers['set-cookie'].find(v => v.startsWith('__Host-vnet_session=')).split(';')[0];
  const status = res(); await handle(req('/api/auth/session', sessionCookie), status);
  const json = JSON.parse(status.body); assert.equal(json.user.name, profile.name); assert.doesNotMatch(status.body, /ou_verified|tenant_key|private-code/);
  for (const headers of [{ origin: 'https://evil.example' }, { origin }, { origin, 'x-csrf-token': 'bad' }]) {
    const denied = res(); await handle(req('/api/auth/logout', sessionCookie, { method: 'POST', headers: { host: 'localhost:3333', cookie: sessionCookie, ...headers } }), denied); assert.equal(denied.status, 403);
  }
  const success = res(); await handle(req('/api/auth/logout', sessionCookie, { method: 'POST', headers: { host: 'localhost:3333', cookie: sessionCookie, origin, 'x-csrf-token': json.csrf } }), success);
  assert.equal(success.status, 200);
  const oldSession = res(); await handle(req('/api/auth/session', sessionCookie), oldSession); assert.equal(JSON.parse(oldSession.body).authenticated, false);
});

test('all authenticated business writes require allowed same origin', async t => {
  const f = fixture(t), logged = await login(f.service), handle = createAuthHandler({ service: f.service, root: path.resolve('.') });
  for (const source of ['', 'https://evil.example']) {
    const response = res(); await handle(req('/api/research/questions', '', { method: 'POST', headers: { host: 'localhost:3333', cookie: `__Host-vnet_session=${logged.token}`, origin: source } }), response); assert.equal(response.status, 403);
  }
});
