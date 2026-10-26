import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mimeFor, attachmentVersion, validUploadName } from './service.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9-]{27}$/i;
const encode = name => encodeURIComponent(name).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const security = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' };
const policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
function json(res, status, payload) { res.writeHead(status, { ...security, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload)); }
async function body(req, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw failure('提交内容超过大小限制。', 413); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function input(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw failure('请使用 JSON 提交。', 415);
  try { return JSON.parse((await body(req, 150000)).toString('utf8')); } catch (e) { if (e.status) throw e; throw failure('提交的 JSON 格式错误。'); }
}
function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw failure('不允许跨站提交。', 403);
  const origin = req.headers.origin;
  if (!origin) return;
  let u; try { u = new URL(origin); } catch { throw failure('来源地址不合法。', 403); }
  if (!['http:', 'https:'].includes(u.protocol) || u.host !== req.headers.host) throw failure('不允许跨站提交。', 403);
}
const notModified = (req, etag) => (req.headers['if-none-match'] || '').split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag);
function streamFile(req, res, file, mime, name, download, media = false, cache = {}) {
  const size = fs.statSync(file).size;
  let start = 0, end = size - 1, status = 200;
  const headers = { ...security, ...cache, 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Content-Security-Policy': media ? "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'" : policy };
  if (name) headers['Content-Disposition'] = `${download || !/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(mime) ? 'attachment' : 'inline'}; filename*=UTF-8''${encode(name)}`;
  if (cache.ETag && notModified(req, cache.ETag)) { res.writeHead(304, headers); res.end(); return; }
  if (req.headers.range && size && (!req.headers['if-range'] || req.headers['if-range'] === cache.ETag)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || !match[1] && !match[2]) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); res.end(); return; }
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); res.end(); return; }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = size ? end - start + 1 : 0;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || !size) { res.end(); return; }
  const stream = fs.createReadStream(file, { start, end }); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
}
export function createResearchHandler({ root, service, projectOptions = () => [] }) {
  const downloads = new Map();
  const recordLinks = new Map();
  const pdfDir = path.join(root, 'vendor/pdfjs');
  const pdfManifest = fs.existsSync(path.join(pdfDir, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(pdfDir, 'manifest.json'), 'utf8')) : { files: {} };
  const web = { '/': ['index.html', 'text/html; charset=utf-8'], '/research/app.mjs': ['app.mjs', 'text/javascript; charset=utf-8'], '/research/project-scope.mjs': ['project-scope.mjs', 'text/javascript; charset=utf-8'], '/research/unified-research.mjs': ['unified-research.mjs', 'text/javascript; charset=utf-8'], '/research/topics.mjs': ['topics.mjs', 'text/javascript; charset=utf-8'], '/research/topic-progress.mjs': ['topic-progress.mjs', 'text/javascript; charset=utf-8'], '/research/sync-policy.mjs': ['sync-policy.mjs', 'text/javascript; charset=utf-8'], '/research/pdf-viewer.mjs': ['pdf-viewer.mjs', 'text/javascript; charset=utf-8'], '/research/styles.css': ['styles.css', 'text/css; charset=utf-8'], '/research/live.css': ['live.css', 'text/css; charset=utf-8'] };
  return async function handle(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { json(res, 400, { error: '地址错误。' }); return true; }
    const route = url.pathname;
    const pdfAsset = route.startsWith('/assets/pdfjs/') ? route.slice('/assets/pdfjs/'.length) : '';
    if (!web[route] && !route.startsWith('/api/research') && !Object.hasOwn(pdfManifest.files, pdfAsset)) return false;
    try {
      if (pdfAsset && Object.hasOwn(pdfManifest.files, pdfAsset)) {
        if (!['GET', 'HEAD'].includes(req.method)) throw failure('不支持此请求方法。', 405);
        streamFile(req, res, path.join(pdfDir, pdfAsset), pdfAsset.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : pdfAsset.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream', undefined, false, false, { ETag: `"${pdfManifest.files[pdfAsset]}"`, 'Cache-Control': 'private, max-age=3600' }); return true;
      }
      if (web[route]) {
        if (!['GET', 'HEAD'].includes(req.method)) throw failure('不支持此请求方法。', 405);
        streamFile(req, res, path.join(root, 'research/web', web[route][0]), web[route][1]); return true;
      }
      if (req.method === 'POST') sameOrigin(req);
      if (route === '/api/research') {
        if (req.method !== 'GET') throw failure('不支持此请求方法。', 405);
        const data = service.snapshot();
        json(res, 200, { ok: true, state: data ? data.syncError ? 'error' : 'ready' : service.storageError || service.syncError ? 'error' : 'loading', data, projects: projectOptions(), error: service.storageError || service.syncError, refreshing: !!service.refreshing }); return true;
      }
      if (route === '/api/research/refresh') {
        if (req.method !== 'POST') throw failure('不支持此请求方法。', 405);
        if (service.storageError) throw failure(service.storageError, 503);
        if (!service.refreshing && !service.busy) service.refresh().catch(() => {});
        json(res, 202, { ok: true, state: service.busy ? 'syncing' : 'loading' }); return true;
      }
      if (route === '/api/research/operations') {
        if (req.method === 'GET') {
          const all = Object.values(service.state.operations).filter(o => o.status !== 'retired');
          const completed = new Set(all.filter(o => o.status === 'success').slice(-50).map(o => o.id));
          const items = all.filter(o => o.status !== 'success' || completed.has(o.id)).reverse().map(o => service.publicOperation(o));
          json(res, 200, { ok: true, operations: items }); return true;
        }
        if (req.method !== 'POST') throw failure('不支持此请求方法。', 405);
        const op = await service.accept(await input(req)); json(res, op.status === 'success' ? 200 : 202, { ok: true, operation: service.publicOperation(op), data: service.snapshot() }); return true;
      }
      const operation = /^\/api\/research\/operations\/([a-f0-9-]{36})(\/retry)?$/.exec(route);
      if (operation) {
        if (operation[2]) {
          if (req.method !== 'POST') throw failure('不支持此请求方法。', 405);
          await service.retry(operation[1]);
        } else if (req.method !== 'GET') throw failure('不支持此请求方法。', 405);
        const op = service.operation(operation[1]); if (!op) throw failure('同步任务不存在。', 404);
        json(res, 200, { ok: true, operation: service.publicOperation(op) }); return true;
      }
      if (route === '/api/research/uploads') {
        if (req.method !== 'POST') throw failure('不支持此请求方法。', 405);
        const name = url.searchParams.get('name') || ''; const id = req.headers['x-upload-id'];
        if (!uuid.test(id || '') || !validUploadName(name)) throw failure('附件名称或类型不支持。支持图片、PDF、Office 文档、文本和压缩包。');
        const bytes = await body(req, 64 * 1024 * 1024);
        if (!bytes.length) throw failure('不能上传空文件。');
        const digest = createHash('sha256').update(bytes).digest('hex');
        const existing = service.state.uploads[id];
        if (existing && (existing.name !== name || existing.size !== bytes.length || existing.ready !== false && existing.sha256 !== digest)) throw failure('同一附件标识不能用于不同文件。', 409);
        if (!existing || existing.ready === false) {
          const file = path.join(service.dir, 'uploads', id, name); fs.mkdirSync(path.dirname(file), { recursive: true });
          const tmp = `${file}.part`; const fd = fs.openSync(tmp, 'w', 0o600);
          try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
          fs.renameSync(tmp, file);
          service.completeUpload(id, { name, size: bytes.length, sha256: digest, mime: mimeFor(name) });
        }
        json(res, 201, { ok: true, upload: { id, name, size: bytes.length } }); return true;
      }
      const uploadFailure = /^\/api\/research\/uploads\/([a-f0-9-]{36})\/failed$/.exec(route);
      if (uploadFailure) {
        if (req.method !== 'POST') throw failure('不支持此请求方法。', 405);
        service.uploadFailed(uploadFailure[1]); json(res, 200, { ok: true }); return true;
      }
      const localFile = /^\/api\/research\/local-files\/([a-f0-9-]{36})$/.exec(route);
      if (localFile) {
        if (!['GET', 'HEAD'].includes(req.method)) throw failure('不支持此请求方法。', 405);
        const file = service.state.uploads[localFile[1]];
        if (!file?.claimed || file.ready === false) throw failure('附件尚未上传完成。', 404);
        const location = path.join(service.dir, 'uploads', file.id, file.name);
        if (!fs.existsSync(location) || fs.statSync(location).size !== file.size) throw failure('本地附件缺失或大小不匹配，请重新上传。', 404);
        streamFile(req, res, location, mimeFor(file.name), file.name, url.searchParams.has('download'), true, { ETag: `"${file.sha256}"`, 'Cache-Control': 'private, no-cache' }); return true;
      }
      const media = /^\/api\/research\/files\/(rec[\w-]+)\/(\d+)(\/feishu)?$/.exec(route);
      if (media) {
        if (!['GET', 'HEAD'].includes(req.method)) throw failure('不支持此请求方法。', 405);
        const row = service.state.cache?.raw.evidence.find(e => e.recordId === media[1]); const f = row?.附件?.[Number(media[2])];
        if (!f?.file_token) throw failure('附件不存在，请刷新多维表。', 404);
        if (media[3]) {
          let entry = recordLinks.get(row.recordId);
          if (!entry || entry.expires < Date.now()) {
            if (recordLinks.size >= 256) recordLinks.delete(recordLinks.keys().next().value);
            entry = { expires: Date.now() + 300000, promise: service.base.recordUrl(row.recordId) }; recordLinks.set(row.recordId, entry);
          }
          let target;
          try {
            target = new URL(await entry.promise);
            if (target.protocol !== 'https:' || target.hostname !== new URL(service.baseUrl).hostname || target.username || target.password || !/^\/record\/[a-z0-9]+$/i.test(target.pathname)) throw new Error('invalid target');
          } catch { recordLinks.delete(row.recordId); throw failure('无法取得飞书阅览链接，请稍后重试或在飞书资料表中查看。', 502); }
          res.writeHead(302, { ...security, Location: target.href }); res.end(); return true;
        }
        const version = attachmentVersion(f);
        if (url.searchParams.has('v') && url.searchParams.get('v') !== version) throw failure('附件已更新，请同步飞书后重新打开。', 409);
        const cache = { ETag: `"${version}"`, 'Cache-Control': url.searchParams.has('v') ? 'private, max-age=86400, immutable' : 'private, no-cache' };
        if (notModified(req, cache.ETag)) { res.writeHead(304, { ...security, ...cache }); res.end(); return true; }
        if (req.method === 'HEAD') {
          res.writeHead(200, { ...security, ...cache, 'Content-Type': mimeFor(f.name), 'Content-Length': Number(f.size) || 0, 'Accept-Ranges': 'bytes' }); res.end(); return true;
        }
        const key = createHash('sha256').update(f.file_token).digest('hex');
        const file = path.join(service.dir, 'files', `${key}.bin`);
        if (!fs.existsSync(file)) {
          if (!downloads.has(key)) downloads.set(key, (async () => {
            fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.part`;
            try { await service.base.download(row.recordId, f.file_token, temp); if (f.size && fs.statSync(temp).size !== f.size) throw new Error('附件大小校验失败。'); fs.renameSync(temp, file); }
            finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); downloads.delete(key); }
          })());
          await downloads.get(key);
        }
        if (f.size && fs.statSync(file).size !== f.size) throw new Error('附件缓存校验失败，请联系服务器管理员。');
        streamFile(req, res, file, mimeFor(f.name), f.name, url.searchParams.has('download'), true, cache); return true;
      }
      throw failure('接口不存在。', 404);
    } catch (e) {
      if (!res.headersSent) json(res, e.status || 502, { ok: false, error: e.status ? e.message : e.message.startsWith('飞书') || e.message.startsWith('附件') ? e.message : '服务器处理失败，请检查服务端配置后重试。' });
      else res.destroy();
      return true;
    }
  };
}
