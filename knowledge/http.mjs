import { readFile } from 'node:fs/promises';
import path from 'node:path';

const routes = {
  '/knowledge-sharing': ['index.html', 'text/html; charset=utf-8'],
  '/knowledge/app.mjs': ['app.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/data.mjs': ['data.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};

export function createKnowledgeHandler({ root, service }) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), route = url.pathname;
    if (route === '/api/knowledge') {
      const send = (status, payload) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff' });res.end(req.method==='HEAD'?undefined:JSON.stringify(payload)); };
      if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD');send(405,{ok:false,error:'知识共享当前为只读。'}); }
      else if (!service) send(503,{ok:false,error:'知识共享数据连接未就绪。'});
      else { try { send(200,{ok:true,...service.read({refresh:url.searchParams.get('refresh')==='1'})}); } catch { send(503,{ok:false,error:'知识共享读取失败，请重试。'}); } }
      return true;
    }
    if (!Object.hasOwn(routes, route)) return false;
    const headers = { 'Content-Type': routes[route][1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return true; }
    try {
      const bytes = await readFile(path.join(root, 'knowledge/web', routes[route][0]));
      res.writeHead(200, { ...headers, 'Content-Length': bytes.length });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('知识共享页面加载失败，请稍后重试。');
    }
    return true;
  };
}
