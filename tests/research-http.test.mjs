import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { ResearchService } from '../research/service.mjs';
import { createResearchHandler } from '../research/http.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'research-http-'));
  const base = { list: async table => table === 'topics' ? [{ recordId: 'recT', 专题名称: '组织与人才' }] : [] };
  const service = new ResearchService({ dir, base, autoRun: false }); await service.init(); await service.refresh();
  const handler = createResearchHandler({ root: path.resolve('.'), service });
  const server = createServer(async (req, res) => { if (!await handler(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await service.close(); await rm(dir, { recursive: true, force: true }); });
  return { origin, service };
}
test('public read comes from Base snapshot and contains no raw credentials', async t => {
  const { origin } = await fixture(t);
  const response = await fetch(`${origin}/api/research`); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.data.categories[0], '组织与人才');
  assert.doesNotMatch(JSON.stringify(body), /file_token|app_secret|迁移键/);
});

test('accept responds with the durable local question before external synchronization', async t => {
  const { origin, service } = await fixture(t);
  service.base.list = async () => { assert.fail('accept must not access Feishu'); };
  const response = await fetch(`${origin}/api/research/operations`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ kind: 'question', title: '即时显示问题', category: '组织与人才', clientMutationId: '91a4a033-5274-4cdf-a4e4-d41061cce415' }) });
  const result = await response.json(); assert.equal(response.status, 202);
  assert.equal(result.data.questions[0].title, '即时显示问题'); assert.equal(result.data.findings.length, 5);
  assert.equal(result.data.questions[0].sync.status, 'accepted'); assert.ok(result.data.revision);
});

test('attachment manifests save with text first and allow later upload and local preview', async t => {
  const { origin, service } = await fixture(t);
  service.state.cache.raw.questions.push({ recordId: 'recQ', 问题编号: 'Q-001', 问题列表: '附件验收', 一级分类: '组织与人才' });
  service.state.cache.raw.findings.push({ recordId: 'recF', 明细编号: 'Q-001:万国数据', 调研对象: '万国数据', 调研内容: '', 举证原文: '' });
  const finding = service.snapshot().findings[0], id = '92a4a033-5274-4cdf-a4e4-d41061cce415';
  const response = await fetch(`${origin}/api/research/operations`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ kind: 'finding', questionId: 'Q-001', company: '万国数据', content: '先保存文字', proof: '', version: finding.version, uploadIds: [id], uploadPlans: [{ id, name: 'qa.pdf', size: 8 }], clientMutationId: '93a4a033-5274-4cdf-a4e4-d41061cce415' }) });
  const result = await response.json(); assert.equal(response.status, 202); assert.equal(result.data.evidence[0].pendingUpload, true);
  assert.equal((await fetch(`${origin}/api/research/local-files/${id}`)).status, 404);
  await fetch(`${origin}/api/research/uploads/${id}/failed`, { method: 'POST', headers: { origin } });
  assert.ok(service.publicOperation(service.operation(result.operation.id)).uploads[0].error);
  const uploaded = await fetch(`${origin}/api/research/uploads?name=qa.pdf`, { method: 'POST', headers: { origin, 'content-type': 'application/octet-stream', 'x-upload-id': id }, body: 'pdfbytes' });
  assert.equal(uploaded.status, 201); assert.equal(service.snapshot().evidence[0].pendingUpload, false);
  const preview = await fetch(`${origin}/api/research/local-files/${id}`, { headers: { range: 'bytes=0-2' } });
  assert.equal(preview.status, 206); assert.equal(await preview.text(), 'pdf');
  assert.equal(service.snapshot().findings[0].content, '先保存文字');
});
test('accepts same-origin mutation durably and rejects foreign origins and unsupported methods', async t => {
  const { origin, service } = await fixture(t);
  const payload = { kind: 'topic', name: '新能源', description: '', clientMutationId: '58a4a033-5274-4cdf-a4e4-d41061cce415' };
  const response = await fetch(`${origin}/api/research/operations`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(payload) });
  assert.equal(response.status, 202); const body = await response.json();
  assert.equal(service.operation(body.operation.id).status, 'accepted');
  const hostile = await fetch(`${origin}/api/research/operations`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://unrelated.example' }, body: JSON.stringify(payload) });
  assert.equal(hostile.status, 403);
  assert.equal((await fetch(`${origin}/api/research`, { method: 'DELETE' })).status, 405);
});
test('rejects active-content uploads, malformed JSON, unknown routes and paths', async t => {
  const { origin } = await fixture(t);
  assert.equal((await fetch(`${origin}/api/research/uploads?name=unsafe.html`, { method: 'POST', headers: { origin, 'content-type': 'application/octet-stream', 'x-upload-id': '68a4a033-5274-4cdf-a4e4-d41061cce415' }, body: '<script>' })).status, 400);
  const bad = await fetch(`${origin}/api/research/operations`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{' });
  assert.equal(bad.status, 400);
  assert.equal((await fetch(`${origin}/.env`)).status, 404);
  assert.equal((await fetch(`${origin}/api/research/unknown`)).status, 404);
});

test('upload IDs are idempotent and reject different bytes under the same ID', async t => {
  const { origin, service } = await fixture(t);
  const url = `${origin}/api/research/uploads?name=QA.txt`;
  const headers = { origin, 'content-type': 'application/octet-stream', 'x-upload-id': '78a4a033-5274-4cdf-a4e4-d41061cce415' };
  assert.equal((await fetch(url, { method: 'POST', headers, body: 'QA content' })).status, 201);
  assert.equal((await fetch(url, { method: 'POST', headers, body: 'QA content' })).status, 201);
  assert.equal(Object.keys(service.state.uploads).length, 1);
  assert.equal((await fetch(url, { method: 'POST', headers, body: 'other content' })).status, 409);
});

test('attachment HEAD uses metadata; cached PDF supports byte ranges', async t => {
  const { origin, service } = await fixture(t);
  const bytes = Buffer.from('%PDF-test-content');
  service.state.cache.raw.evidence.push({ recordId: 'recQA', 附件: [{ name: 'QA.pdf', size: bytes.length, file_token: 'test-token' }] });
  const response = await fetch(`${origin}/api/research/files/recQA/0`, { method: 'HEAD' });
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-length'), String(bytes.length));
  const dir = path.join(service.dir, 'files'); await mkdir(dir);
  await writeFile(path.join(dir, `${createHash('sha256').update('test-token').digest('hex')}.bin`), bytes);
  const part = await fetch(`${origin}/api/research/files/recQA/0`, { headers: { Range: 'bytes=0-4' } });
  assert.equal(part.status, 206); assert.equal(await part.text(), '%PDF-');
  assert.equal(part.headers.get('content-type'), 'application/pdf');
});

test('versioned attachments revalidate without downloads and reject stale versions', async t => {
  const { origin, service } = await fixture(t);
  const bytes = Buffer.from('%PDF-cache-test'); let downloads = 0;
  service.base.download = async (_record, _token, file) => { downloads++; await writeFile(file, bytes); };
  service.state.cache.raw.questions.push({ recordId: 'recQ', 问题编号: 'Q-001', 问题列表: '缓存验证' });
  const file = { name: 'cache.pdf', size: bytes.length, file_token: 'private-test-token' };
  service.state.cache.raw.evidence.push({ recordId: 'recCache', 问题编号: 'Q-001', 调研对象: '万国数据', 附件: [file] });
  const url = origin + service.snapshot().evidence[0].url;
  assert.match(url, /\?v=[a-f0-9]{64}$/);
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(downloads, 0);
  assert.match(head.headers.get('cache-control'), /private.*max-age/);
  const [first, concurrent] = await Promise.all([fetch(url), fetch(url)]);
  assert.equal(await first.text(), bytes.toString()); await concurrent.arrayBuffer();
  assert.equal(downloads, 1, 'concurrent reads share one upstream download');
  const etag = first.headers.get('etag'); assert.ok(etag);
  const unchanged = await fetch(url, { headers: { 'If-None-Match': `W/${etag}` } });
  assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), '');
  assert.equal(downloads, 1);
  const full = await fetch(url, { headers: { Range: 'bytes=0-3', 'If-Range': '"obsolete"' } });
  assert.equal(full.status, 200); assert.equal(await full.text(), bytes.toString());
  file.file_token = 'replacement-token';
  assert.notEqual(origin + service.snapshot().evidence[0].url, url);
  assert.equal((await fetch(url)).status, 409);
  assert.equal(downloads, 1, 'stale URL must not download the replacement');
});

test('PDF assets support private browser caching and conditional requests', async t => {
  const { origin } = await fixture(t);
  const url = `${origin}/assets/pdfjs/build/pdf.mjs`;
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.match(head.headers.get('cache-control'), /private.*max-age/);
  const etag = head.headers.get('etag'); assert.ok(etag);
  assert.equal((await fetch(url, { headers: { 'If-None-Match': etag } })).status, 304);
});

test('Feishu viewing resolves the exact attachment record and rejects foreign redirects', async t => {
  const { origin, service } = await fixture(t);
  service.baseUrl = 'https://vnet.feishu.cn/base/test';
  service.state.cache.raw.evidence.push({ recordId: 'recView', 附件: [{ name: 'view.pdf', file_token: 'private-token' }] });
  let calls = 0;
  service.base.recordUrl = async id => { assert.equal(id, 'recView'); calls++; return 'https://vnet.feishu.cn/record/officialLink'; };
  const url = `${origin}/api/research/files/recView/0/feishu`;
  const response = await fetch(url, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://vnet.feishu.cn/record/officialLink');
  assert.equal((await fetch(url, { redirect: 'manual' })).status, 302); assert.equal(calls, 1);
  assert.equal((await fetch(`${origin}/api/research/files/recMissing/0/feishu`, { redirect: 'manual' })).status, 404);
  service.state.cache.raw.evidence.push({ recordId: 'recHostile', 附件: [{ name: 'other.pdf', file_token: 'other-token' }] });
  service.base.recordUrl = async () => 'https://unrelated.example/record/officialLink';
  assert.equal((await fetch(`${origin}/api/research/files/recHostile/0/feishu`, { redirect: 'manual' })).status, 502);
});
