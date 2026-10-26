const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
async function input(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw Object.assign(Error('请使用 JSON 提交。'), { status: 415 });
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 160000) throw Object.assign(Error('提交内容过大。'), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks)); } catch { throw Object.assign(Error('提交格式不正确。'), { status: 400 }); }
}
export function createProjectTaskHandler(service) {
  return async (req, res) => {
    const url = new URL(req.url, 'https://local.invalid');
    if (!url.pathname.startsWith('/api/project-tasks')) return false;
    try {
      if (url.pathname === '/api/project-tasks' && req.method === 'GET') { service.warm(); json(res, 200, { ok: true, ...service.snapshot() }); }
      else if (url.pathname === '/api/project-tasks' && req.method === 'POST') {
        const result = service.accept(await input(req), req.auth); json(res, 202, { ok: true, ...result });
      } else if (url.pathname === '/api/project-tasks/status' && req.method === 'GET') json(res, 200, { ok: true, ...service.snapshot(), plan: service.state.schema ? service.plan() : null });
      else if (url.pathname === '/api/project-tasks/retry' && req.method === 'POST') { const body = await input(req); json(res, 202, { ok: true, ...service.retry(body.id) }); }
      else if (url.pathname === '/api/project-tasks/discard' && req.method === 'POST') { const body = await input(req); json(res, 200, { ok: true, ...service.discard(body.id), plan: service.plan() }); }
      else json(res, 405, { ok: false, error: '不支持此操作。' });
    } catch (error) { json(res, error.status || 500, { ok: false, error: error.status ? error.message : '任务处理未完成，当前修改请保留后重试。' }); }
    return true;
  };
}
