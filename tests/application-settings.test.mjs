import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { ApplicationSettings, isLocalConfigurationRequest, createApplicationSettingsHandler } from '../application-settings.mjs';

test('configuration rejects remote access, rebinding hosts and foreign form origins', () => {
  const req = (remoteAddress, host, origin) => ({ socket: { remoteAddress }, headers: { host, origin } });
  assert.equal(isLocalConfigurationRequest(req('127.0.0.1', 'localhost:3333', 'https://localhost:3333')), true);
  assert.equal(isLocalConfigurationRequest(req('::ffff:127.0.0.1', '127.0.0.1:3333')), true);
  assert.equal(isLocalConfigurationRequest(req('10.0.0.2', 'localhost:3333')), false);
  assert.equal(isLocalConfigurationRequest(req('127.0.0.1', 'evil.example')), false);
  assert.equal(isLocalConfigurationRequest(req('127.0.0.1', 'localhost:3333', 'https://evil.example')), false);
  const proxied = req('127.0.0.1', 'localhost:3333'); proxied.headers['x-forwarded-for'] = '10.0.0.2';
  assert.equal(isLocalConfigurationRequest(proxied), false);
});

test('validated settings persist privately, apply once and survive restart without exposing secrets', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-settings-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let applied = 0, verified = 0;
  const settings = new ApplicationSettings({ dir, verify: async () => { verified++; }, apply: async () => { applied++; } });
  const input = { appId: 'cli_test', appSecret: 'test-secret-value', clientMutationId: 'ffdd6084-cf5a-4ec1-9eaf-44f7db90f1e7' };
  await settings.save(input);
  await settings.save(input);
  assert.equal(applied, 1); assert.equal(verified, 1);
  assert.doesNotMatch(JSON.stringify(settings.publicStatus()), /test-secret-value|appSecret/);
  const resumed = new ApplicationSettings({ dir, apply: async () => { applied++; } });
  await resumed.restore();
  assert.equal(applied, 2);
  assert.equal(resumed.publicStatus().appId, 'cli_test');
  await assert.rejects(settings.save({ ...input, appSecret: 'different-secret' }), /重复请求/);
});

test('failed validation leaves existing settings unchanged and never echoes credentials', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-settings-error-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const settings = new ApplicationSettings({ dir, verify: async () => { throw new Error('private-secret-from-upstream'); }, apply: async () => assert.fail('must not apply') });
  await assert.rejects(settings.save({ appId: 'cli_test', appSecret: 'secret-value', clientMutationId: 'ffdd6084-cf5a-4ec1-9eaf-44f7db90f1e7' }), error => {
    assert.doesNotMatch(error.message, /secret-value|private-secret/); return true;
  });
  assert.equal((await fs.readdir(dir)).length, 0);
});

test('settings HTTP endpoint refuses cross-site posts and returns only public configuration', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'app-settings-http-'));
  const settings = new ApplicationSettings({ dir, verify: async () => {}, apply: async () => {} });
  const handle = createApplicationSettingsHandler(settings);
  const server = createServer((req, res) => handle(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`, url = `${origin}/api/application-settings`;
  const body = JSON.stringify({ appId: 'cli_test', appSecret: 'qa-private-value', clientMutationId: 'ffdd6084-cf5a-4ec1-9eaf-44f7db90f1e7' });
  const denied = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://unrelated.example' }, body });
  assert.equal(denied.status, 403);
  const saved = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body });
  assert.equal(saved.status, 200); assert.doesNotMatch(await saved.text(), /qa-private-value|appSecret/);
  const status = await fetch(url); assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await status.text(), /qa-private-value|appSecret/);
});
