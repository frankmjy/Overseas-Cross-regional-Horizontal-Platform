import fs from 'node:fs';
import {PageAccess} from './page-access.mjs';
import path from 'node:path';
import { authError, requestOrigin, safeReturnTo } from './service.mjs';
import { isLocalConfigurationRequest } from '../application-settings.mjs';
import { isAdministrator } from './admin-role.mjs';
import { readProjectWeather } from './project-weather.mjs';
import { timingSafeEqual } from 'node:crypto';
import { platformProjects, projectById, projectParameter, projectDestination } from '../src/project-context-model.mjs';

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

function loginTarget(value){
  const target=safeReturnTo(value||'/project-management'),url=new URL(target,'https://return.invalid');
  return url.pathname==='/'?(url.search?'/research'+url.search+url.hash:'/project-management'):target;
}

export function createAuthHandler({ service, root, canBootstrap = () => true, access = new PageAccess({auth:service}), readWeather = readProjectWeather }) {
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
      const project = session?.projectId ? projectById(session.projectId) : null;
      const isAdmin = !!session && isAdministrator(session.user, service.config().appId);
      const localBootstrap = !session && canBootstrap() && isLocalConfigurationRequest(req);
      if (req.headers.cookie?.length > 16000) throw authError('请求内容过长。', 431);
      if(url.pathname==='/'){
        if(!['GET','HEAD'].includes(req.method))throw authError('不支持此请求方法。',405);
        const legacy=['project','category','q','view'].some(key=>url.searchParams.has(key));
        redirect(res,legacy?safeReturnTo('/research'+url.search+url.hash):'/login');return true;
      }
      if (url.pathname === '/api/auth/session') {
        if (req.method !== 'GET') throw authError('不支持此请求方法。', 405);
        const loginEnabled = (service.config().oauthOrigins || service.config().origins).includes(origin);
        json(res, 200, { ok: true, authenticated: !!session, user: session ? { name: session.user.name } : null, project, projects: platformProjects.map(({id,name})=>({id,name})), csrf: session?.csrf, expiresInMs: session?.expiresInMs, auditStatus: service.auditStatus(token), ...(session ? access.summary(session.user) : {}), isAdmin, canConfigure: isAdmin || localBootstrap, loginEnabled }); return true;
      }
      if (url.pathname === '/api/auth/feishu/authorize') {
        if (req.method !== 'GET') throw authError('不支持此请求方法。', 405);
        if (url.searchParams.getAll('project').length > 1) throw authError('请选择一个项目。');
        const selected = url.searchParams.get('project') || project?.id;
        if (!selected) { redirect(res, '/login?returnTo=' + encodeURIComponent(safeReturnTo(url.searchParams.get('returnTo')))); return true; }
        const started = service.begin(origin, loginTarget(url.searchParams.get('returnTo')), selected);
        res.setHeader('Set-Cookie', [cookie('__Host-vnet_oauth', started.browser, 600)]); redirect(res, started.url); return true;
      }
      if (url.pathname === '/api/auth/feishu/callback') {
        if (req.method !== 'GET') throw authError('不支持此请求方法。', 405);
        try {
          if (url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length > 1) throw authError('回调参数无效。');
          const result = await service.finish(origin, url.searchParams.get('state'), values['__Host-vnet_oauth'], url.searchParams.get('code'));
          // Reauthorization replaces the old local session instead of leaving it reusable.
          if (session) service.logout(token, session.csrf);
          res.setHeader('Set-Cookie', [cookie('__Host-vnet_session', result.token, 43200), cookie('__Host-vnet_oauth', '', 0)]); redirect(res, access.destination(loginTarget(result.returnTo),result.user)||'/login?error=forbidden');
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
        if (url.pathname === '/login' && session && project && url.searchParams.has('returnTo') && !url.searchParams.has('error') && url.searchParams.get('selectProject') !== '1') { const target=access.destination(projectDestination(loginTarget(url.searchParams.get('returnTo')), project),session.user); if(!target)throw authError('尚未分配页面访问权限，请联系管理员。',403);redirect(res,target); return true; }
        const [file, type] = publicFiles[url.pathname] || ['auth/web/login.html', 'text/html'];
        res.writeHead(200, { ...security, 'Content-Type': `${type}; charset=utf-8`, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
        res.end(req.method === 'HEAD' ? '' : fs.readFileSync(path.join(root, file))); return true;
      }
      // Local-only credential bootstrap remains recoverable even before OAuth is configured.
      if (url.pathname === '/api/application-settings' && localBootstrap) return false;
      if (!session) {
        if (['GET', 'HEAD'].includes(req.method) && ['/', '/research', '/index.html', '/project-management', '/knowledge-sharing', '/meeting-trail', '/staffing-reserve', '/cross-coordination', '/admin'].includes(url.pathname)) redirect(res, `/login?returnTo=${encodeURIComponent(safeReturnTo(url.pathname === '/index.html' ? '/project-management' : url.pathname + url.search + url.hash))}`);
        else {
          res.setHeader('X-Vnet-Login-Required', '1');
          json(res, 401, { ok: false, error: '请先使用飞书登录。', loginUrl: `/login?returnTo=${encodeURIComponent(safeReturnTo(req.headers.referer ? new URL(req.headers.referer, origin).pathname : '/'))}` });
        }
        return true;
      }
      if (url.pathname === '/api/auth/activity') {
        if (req.method !== 'POST') throw authError('不支持此请求方法。', 405);
        sameOrigin(req, origin);
        const expiresInMs = service.recordActivity(token, req.headers['x-csrf-token']);
        json(res, 200, { ok: true, expiresInMs });
        return true;
      }
      if (url.pathname === '/api/auth/project') {
        if (req.method !== 'POST') throw authError('不支持此请求方法。', 405);
        sameOrigin(req, origin);
        if (url.searchParams.getAll('project').length !== 1) throw authError('请选择一个项目。');
        const destination = access.destination(loginTarget(url.searchParams.get('returnTo')), session.user);
        if (!destination) throw authError('尚未分配页面访问权限，请联系管理员。', 403);
        const selected = service.switchProject(token, req.headers['x-csrf-token'], url.searchParams.get('project'));
        json(res, 200, { ok: true, destination: projectDestination(destination, selected) });
        return true;
      }
      if (url.pathname === '/api/project-weather') {
        if (req.method !== 'GET') throw authError('不支持此请求方法。', 405);
        const location = project?.location;
        const weather = Number.isFinite(location?.latitude) ? await readWeather(location) : null;
        json(res, 200, { ok: true, weather });
        return true;
      }
      if ((url.pathname === '/admin' || url.pathname.startsWith('/api/admin/') || url.pathname === '/api/application-settings' || url.pathname === '/auth/web/admin.html') && !isAdmin) throw authError('仅管理员可访问。', 403);
      if(!access.allows(url,req.method,session.user))throw authError('无权访问或修改此页面，请联系管理员。',403);
      if (project) {
        const expected = projectParameter(url.pathname, project);
        if (expected) {
          if (url.searchParams.getAll('project').length > 1) throw authError('项目参数无效。');
          if (!url.pathname.startsWith('/api/') && url.searchParams.get('project') !== expected) { redirect(res, projectDestination(safeReturnTo(req.url), project)); return true; }
          if (url.pathname.startsWith('/api/') && url.searchParams.has('project') && url.searchParams.get('project') !== expected) throw authError('当前请求与登录项目不一致，请重新打开页面。', 409);
          if (url.pathname.startsWith('/api/') && !url.searchParams.has('project')) { url.searchParams.set('project', expected); req.url = url.pathname + url.search; }
        }
        if (!project.planConnected && (url.pathname === '/api/base-sync' || /^\/api\/project-tasks(?:\/|$)/.test(url.pathname))) throw authError('该项目任务表尚未接入。', 409);
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) sameOrigin(req, origin);
      if ((url.pathname === '/api/application-settings' || url.pathname === '/api/admin/permissions') && req.method === 'POST') {
        const csrf = req.headers['x-csrf-token'];
        if (typeof csrf !== 'string' || Buffer.byteLength(csrf) !== Buffer.byteLength(session.csrf) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf))) throw authError('配置请求已失效，请刷新后重试。', 403);
      }
      res.setHeader('Vary', 'Cookie');
      req.adminCsrf = isAdmin ? session.csrf : undefined;
      req.auth = { permissions:access.summary(session.user).permissions, name: session.user.name, openId: session.user.openId, isAdmin, ...(project ? { project } : {}) };
      return false;
    } catch (error) {
      json(res, error.status || 500, { ok: false, error: error.publicMessage || '登录服务暂不可用，请稍后重试。' }); return true;
    }
  };
}
