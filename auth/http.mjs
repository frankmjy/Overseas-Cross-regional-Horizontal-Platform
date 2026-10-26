import fs from 'node:fs';
import path from 'node:path';
import { authError, requestOrigin, safeReturnTo } from './service.mjs';
import { isLocalConfigurationRequest } from '../application-settings.mjs';

const security = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' };
const json = (res, status, data) => { res.writeHead(status, { ...security, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
const redirect = (res, location) => { res.writeHead(303, { ...security, Location: location }); res.end(); };
const cookie = (name, value, seconds) => `${name}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`;
function cookies(req) {
  const parsed = {};
  for (const item of (req.headers.cookie || '').split(';')) {
    const i = item.indexOf('='); if (i < 0) continue;
    const name = item.slice(0, i).trim(); if (name in parsed) parsed[name] = ''; else parsed[name] = item.slice(i + 1).trim();
  }
  return parsed;
}
function sameOrigin(req, origin) {
  if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') throw authError('不允许跨站提交，请返回平台页面操作。', 403);
}

export function createAuthHandler({ service, root }) {
  const publicFiles = {
    '/auth/login.js': ['auth/web/login.js', 'text/javascript'],
    '/auth/login.css': ['auth/web/login.css', 'text/css'],
    '/assets/vnet-official-logo.png': ['assets/vnet-official-logo.png', 'image/png'],
    '/src/application-settings.js': ['src/application-settings.js', 'text/javascript'],
    '/src/platform-navigation.css': ['src/platform-navigation.css', 'text/css'],
  };
  return async (req, res) => {
    let url;
    try { url = new URL(req.url, 'https://request.invalid'); decodeURIComponent(url.pathname); } catch { json(res, 400, { ok: false, error: '访问地址格式错误。' }); return true; }
    try {
      const origin = requestOrigin(req, service.config().origins);
      const values = cookies(req), token = values['__Host-vnet_session'], session = service.session(token);
      if (req.headers.cookie?.length > 16000) throw authError('请求内容过长。', 431);
      if (url.pathname === '/api/auth/session') {
        if (req.method !== 'GET') throw authError('不支持此请求方法。', 405);
        const loginEnabled = (service.config().oauthOrigins || service.config().origins).includes(origin);
        json(res, 200, { ok: true, authenticated: !!session, user: session ? { name: session.user.name } : null, csrf: session?.csrf, auditStatus: service.auditStatus(token), canConfigure: isLocalConfigurationRequest(req), loginEnabled }); return true;
      }
      if (url.pathname === '/api/auth/feishu/authorize') {
        if (req.method !== 'GET') throw authError('不支持此请求方法。', 405);
        const started = service.begin(origin, url.searchParams.get('returnTo'));
        res.setHeader('Set-Cookie', [cookie('__Host-vnet_oauth', started.browser, 600)]); redirect(res, started.url); return true;
      }
      if (url.pathname === '/api/auth/feishu/callback') {
        if (req.method !== 'GET') throw authError('不支持此请求方法。', 405);
        try {
          if (url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length > 1) throw authError('回调参数无效。');
          const result = await service.finish(origin, url.searchParams.get('state'), values['__Host-vnet_oauth'], url.searchParams.get('code'));
          // Reauthorization replaces the old local session instead of leaving it reusable.
          if (session) service.logout(token, session.csrf);
          res.setHeader('Set-Cookie', [cookie('__Host-vnet_session', result.token, 43200), cookie('__Host-vnet_oauth', '', 0)]); redirect(res, result.returnTo);
        } catch (error) {
          res.setHeader('Set-Cookie', [cookie('__Host-vnet_oauth', '', 0)]);
          redirect(res, `/login?error=${error.status === 503 ? 'storage' : error.status === 502 ? 'unavailable' : 'expired'}`);
        }
        return true;
      }
      if (url.pathname === '/api/auth/logout') {
        if (req.method !== 'POST') throw authError('请使用页面上的退出按钮。', 405);
        sameOrigin(req, origin); service.logout(token, req.headers['x-csrf-token']);
        res.setHeader('Set-Cookie', [cookie('__Host-vnet_session', '', 0)]); json(res, 200, { ok: true }); return true;
      }
      if (url.pathname === '/login' || Object.hasOwn(publicFiles, url.pathname)) {
        if (!['GET', 'HEAD'].includes(req.method)) throw authError('不支持此请求方法。', 405);
        if (url.pathname === '/login' && session && !url.searchParams.has('error')) { redirect(res, safeReturnTo(url.searchParams.get('returnTo'))); return true; }
        const [file, type] = publicFiles[url.pathname] || ['auth/web/login.html', 'text/html'];
        res.writeHead(200, { ...security, 'Content-Type': `${type}; charset=utf-8`, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
        res.end(req.method === 'HEAD' ? '' : fs.readFileSync(path.join(root, file))); return true;
      }
      // Local-only credential bootstrap remains recoverable even before OAuth is configured.
      if (url.pathname === '/api/application-settings' && isLocalConfigurationRequest(req)) return false;
      if (!session) {
        if (['GET', 'HEAD'].includes(req.method) && ['/', '/index.html', '/project-management', '/knowledge-sharing', '/meeting-trail'].includes(url.pathname)) redirect(res, `/login?returnTo=${encodeURIComponent(safeReturnTo(url.pathname === '/index.html' ? '/project-management' : url.pathname + url.search + url.hash))}`);
        else json(res, 401, { ok: false, error: '请先使用飞书登录。', loginUrl: `/login?returnTo=${encodeURIComponent(safeReturnTo(req.headers.referer ? new URL(req.headers.referer).pathname : '/'))}` });
        return true;
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) sameOrigin(req, origin);
      res.setHeader('Vary', 'Cookie');
      req.auth = { name: session.user.name, openId: session.user.openId };
      return false;
    } catch (error) {
      json(res, error.status || 500, { ok: false, error: error.publicMessage || '登录服务暂不可用，请稍后重试。' }); return true;
    }
  };
}
