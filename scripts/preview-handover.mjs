import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSource } from '../samples/handover-preview/source.mjs';
import {buildModel} from '../samples/handover-preview/model.mjs';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const dir = path.join(root, 'reports/handover-page-preview-20261101');
await fs.mkdir(dir, { recursive: true });
let current, currentRaw, refreshing;
async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const result = await fetchSource();
    await fs.writeFile(path.join(dir, 'source-raw.json'), JSON.stringify(result.raw));
    await fs.writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(result.model));
    currentRaw=result.raw;current = result.model; return current;
  })();
  try { return await refreshing; } finally { refreshing = null; }
}
await refresh();
const files = new Map([
  ['/', ['samples/handover-preview/index.html', 'text/html; charset=utf-8']],
  ['/project-management-preview', ['samples/handover-preview/index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['samples/handover-preview/app.mjs', 'text/javascript; charset=utf-8']],
  ['/pages.mjs', ['samples/handover-preview/pages.mjs', 'text/javascript; charset=utf-8']],
  ['/editor.mjs', ['samples/handover-preview/editor.mjs', 'text/javascript; charset=utf-8']],
  ['/inline.mjs', ['samples/handover-preview/inline.mjs', 'text/javascript; charset=utf-8']],
  ['/model.mjs', ['samples/handover-preview/model.mjs', 'text/javascript; charset=utf-8']],
  ['/project-tasks/handover/status.mjs', ['project-tasks/handover/status.mjs', 'text/javascript; charset=utf-8']],
  ['/project-tasks/handover/priority.mjs', ['project-tasks/handover/priority.mjs', 'text/javascript; charset=utf-8']],
  ['/project-tasks/handover/resources.mjs', ['project-tasks/handover/resources.mjs', 'text/javascript; charset=utf-8']],
  ['/project-tasks/handover/summary.mjs', ['project-tasks/handover/summary.mjs', 'text/javascript; charset=utf-8']],
  ['/project-tasks/handover/ordering.mjs', ['project-tasks/handover/ordering.mjs', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['samples/handover-preview/styles.css', 'text/css; charset=utf-8']],
  ['/logo.png', ['assets/vnet-official-logo.png', 'image/png']],
  ['/favicon.svg', ['assets/vnet-favicon.svg', 'image/svg+xml']],
]);
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" };
const server = createServer(async (req, res) => {
  const json = (status, value) => { const data = JSON.stringify(value); res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(data); };
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return json(403, { error: '仅本机可访问。' });
    if (url.pathname === '/api/plan' && req.method === 'GET') return json(200, {...buildModel(currentRaw,current.source.fetchedAt),capabilities:{editable:false,loginUrl:'https://localhost:3333/project-management?view=handover&tab=gantt'}});
    if (url.pathname === '/api/refresh' && req.method === 'POST') {
      if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, { error: '请求来源不匹配。' });
      return json(200, await refresh());
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(405, { error: '测试页只提供读取。' });
    const entry = files.get(url.pathname);
    if (!entry) return json(404, { error: '页面不存在。' });
    const data = await fs.readFile(path.join(root, entry[0]));
    res.writeHead(200, { ...headers, 'Content-Type': entry[1], 'Content-Length': data.length }); res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) { json(503, { error: /^飞书|^源表|^当前CLI|^未取得/.test(error.message) ? error.message : '测试页面暂时不可用，请重试。' }); }
});
const port = Number(process.env.HANDOVER_PREVIEW_PORT || 3346);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('预览端口无效。');
server.on('error', error => { console.error(`预览启动失败：${error.code || 'unknown'}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', async () => {
  const state = { url: `http://127.0.0.1:${port}/project-management-preview`, pid: process.pid, table: current.source.table, records: current.records.length, startedAt: new Date().toISOString(), feishuWriteRoutes: 0 };
  await fs.writeFile(path.join(dir, 'server.json'), JSON.stringify(state, null, 2)); console.log(JSON.stringify(state));
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
