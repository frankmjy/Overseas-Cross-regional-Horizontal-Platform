import test from 'node:test';
import assert from 'node:assert/strict';
import { LoginAuditSink, auditFields as f } from '../auth/audit.mjs';
import { exchangeIdentity } from '../auth/service.mjs';

const event = { id: 'a1b2-test-login', user: { name: '测试人员', openId: 'ou_verified' }, loginTime: '2026-10-24T00:00:00.999Z', logoutTime: null, entryPage: '/project-management', method: '飞书授权' };
const table = rows => ({ fields: Object.values(f), record_id_list: rows.map(() => 'rec_test'), data: rows.map(row => Object.values(f).map(name => row[name] ?? null)), has_more: false });
function adapter({ loseCreate = false, wrongUser = false, incompleteSearch = false } = {}) {
  let row, creates = 0, writes = 0;
  return { get creates() { return creates; }, get writes() { return writes; }, async cli(command, args) {
    assert.ok(args.includes('--table-id')); assert.equal(args[args.indexOf('--table-id') + 1], 'tblActual');
    if (command === '+record-search') {
      assert.deepEqual(JSON.parse(args[args.indexOf('--json') + 1]), { keyword: event.id, search_fields: [f.id], select_fields: [f.id], limit: 2 });
      return { ...table(row ? [row] : []), has_more: incompleteSearch };
    }
    if (command === '+record-upsert') {
      writes++;
      assert.ok(!args.includes('--format'), 'upsert does not support --format');
      if (!args.includes('--record-id')) creates++;
      row = { ...row, ...JSON.parse(args[args.indexOf('--json') + 1]) };
      if (wrongUser) row[f.account] = [{ id: 'ou_someone_else' }];
      if (loseCreate) { loseCreate = false; throw Error('unknown result'); }
      return { record: { record_id_list: ['rec_test'] } };
    }
    if (command === '+record-get') return table([row]);
    assert.fail(command);
  } };
}
test('audit recovers an uncertain create by login id and semantically verifies typed fields', async () => {
  const base = adapter({ loseCreate: true }), sink = new LoginAuditSink({ tableId: 'tblActual' }, base);
  await assert.rejects(sink.sync(event), /unknown result/);
  assert.equal(await sink.sync(event), 'rec_test'); assert.equal(base.creates, 1); assert.equal(base.writes, 1);
  assert.equal(await sink.sync({ ...event, logoutTime: '2026-10-24T01:00:00.100Z' }), 'rec_test'); assert.equal(base.creates, 1); assert.equal(base.writes, 2);
});
test('audit refuses a name-only or wrong linked Feishu account', async () => {
  await assert.rejects(new LoginAuditSink({ tableId: 'tblActual' }, adapter({ wrongUser: true })).sync(event), /回读/);
});

test('audit refuses an incomplete search before creating a possible duplicate', async () => {
  const base = adapter({ incompleteSearch: true });
  await assert.rejects(new LoginAuditSink({ tableId: 'tblActual' }, base).sync(event), /查询不完整/);
  assert.equal(base.creates, 0);
});
test('OAuth requests official endpoints with no redirects and validates real identity', async () => {
  const calls = [];
  const request = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => calls.length === 1 ? { code: 0, access_token: 'ephemeral-test-token' } : { code: 0, data: { open_id: 'ou_verified', name: '测试人员', tenant_key: 'tenant-test', email: 'unneeded@example.test' } } }; };
  const identity = await exchangeIdentity({ appId: 'cli_test', appSecret: 'test-private', code: 'test-code', redirectUri: 'https://localhost:3333/api/auth/feishu/callback' }, request);
  assert.equal(calls[0].url, 'https://accounts.feishu.cn/oauth/v3/token');
  assert.equal(calls[1].url, 'https://open.feishu.cn/open-apis/authen/v1/user_info');
  assert.ok(calls.every(call => call.options.redirect === 'error'));
  assert.equal(JSON.parse(calls[0].options.body).redirect_uri, 'https://localhost:3333/api/auth/feishu/callback');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer ephemeral-test-token');
  assert.doesNotMatch(JSON.stringify(identity), /ephemeral-test-token|unneeded|test-private/);
});
test('OAuth failures never expose upstream credentials, codes or token bodies', async () => {
  await assert.rejects(exchangeIdentity({}, async () => { throw Error('private-code-secret'); }), error => !error.message.includes('private-code-secret') && error.status === 502);
  await assert.rejects(exchangeIdentity({}, async () => ({ ok: true, json: async () => ({ code: 0, access_token: 'test-only', data: { name: 'unverified' } }) })), /有效身份/);
});
