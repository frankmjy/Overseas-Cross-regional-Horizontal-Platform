import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const authError = (message, status = 400) => Object.assign(new Error(message), { status, publicMessage: message });
export const defaultOrigins = ['https://www.sm.sjhl.online:3333', 'https://localhost:3333'];
export function authConfig() { return { appId: process.env.FEISHU_APP_ID || '', appSecret: process.env.FEISHU_APP_SECRET || '', origins: defaultOrigins, oauthOrigins: [...defaultOrigins] }; }

export function safeReturnTo(value) {
  if (typeof value !== 'string' || value.length > 2048) return '/';
  let decoded = value;
  try { for (let n = 0; n < 3; n++) decoded = decodeURIComponent(decoded); } catch { return '/'; }
  if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\\x00-\x20\x7f]/.test(decoded)) return '/';
  const url = new URL(value, 'https://return.invalid');
  if (!['/', '/project-management', '/knowledge-sharing', '/meeting-trail'].includes(decodeURIComponent(url.pathname))) return '/';
  // Never put OAuth credentials or tickets in the audit log or next Location.
  for (const key of [...url.searchParams.keys()]) if (!['project', 'category', 'q', 'view', 'tab', 'type', 'date'].includes(key)) url.searchParams.delete(key);
  return url.pathname + url.search + url.hash;
}

export function requestOrigin(req, origins) {
  if (!req.socket.encrypted || ['forwarded', 'x-forwarded-host', 'x-forwarded-proto'].some(key => req.headers[key])) throw authError('请使用已登记的 HTTPS 地址访问。', 403);
  const origin = `https://${req.headers.host}`;
  if (!origins.includes(origin)) throw authError('访问地址未登记。', 403);
  return origin;
}

export async function exchangeIdentity({ appId, appSecret, code, redirectUri }, request = fetch) {
  let token, identity;
  try {
    const response = await request('https://accounts.feishu.cn/oauth/v3/token', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ grant_type: 'authorization_code', client_id: appId, client_secret: appSecret, code, redirect_uri: redirectUri }), signal: AbortSignal.timeout(12000) });
    const result = await response.json();
    if (!response.ok || result.code !== 0 || typeof result.access_token !== 'string' || !result.access_token) throw Error('token rejected');
    token = result.access_token;
    const user = await request('https://open.feishu.cn/open-apis/authen/v1/user_info', { redirect: 'error', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
    const body = await user.json();
    if (!user.ok || body.code !== 0) throw Error('identity rejected');
    identity = body.data;
  } catch { throw authError('飞书授权未完成，请重新登录；如持续失败，请核对应用回调地址与权限。', 502); }
  if (!/^ou_[A-Za-z0-9_-]{3,120}$/.test(identity?.open_id || '') || typeof identity?.name !== 'string' || !identity.name.trim() || identity.name.length > 150) throw authError('飞书未返回有效身份，请重新授权。', 502);
  return { open_id: identity.open_id, name: identity.name.trim(), tenant_key: typeof identity.tenant_key === 'string' ? identity.tenant_key.slice(0, 150) : '' };
}

export class AuthService {
  constructor({ dir, config = authConfig, oauth = exchangeIdentity, sink, now = Date.now }) {
    this.file = path.join(dir, 'ledger.json'); this.config = config; this.oauth = oauth; this.sink = sink; this.now = now;
    this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { version: 1, states: {}, sessions: {}, events: {} };
    if (this.state.version !== 1 || !this.state.states || !this.state.sessions || !this.state.events) throw Error('Authentication ledger is invalid; retain it and restore from a verified backup.');
  }
  commit(change) {
    const next = structuredClone(this.state); change(next);
    const dir = path.dirname(this.file); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      const fd = fs.openSync(temp, 'wx', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(next)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(temp, this.file); this.state = next;
    } catch { if (fs.existsSync(temp)) fs.unlinkSync(temp); throw authError('登录状态无法保存，请检查服务器存储后重试。', 503); }
  }
  begin(origin, returnTo) {
    const config = this.config();
    if (!(config.oauthOrigins || config.origins).includes(origin)) throw authError('当前访问地址未启用飞书登录。', 503);
    if (!config.origins.includes(origin) || !config.appId || !config.appSecret) throw authError('飞书登录尚未配置，请联系平台维护人员。', 503);
    const state = random(), browser = random(), now = this.now();
    if (Object.keys(this.state.states).filter(k => this.state.states[k].expires > now).length >= 2000) throw authError('登录请求繁忙，请稍后重试。', 429);
    this.commit(next => {
      for (const [key, value] of Object.entries(next.states)) if (value.expires <= now) delete next.states[key];
      for (const [key, value] of Object.entries(next.sessions)) if (value.expires <= now) delete next.sessions[key];
      for (const [key, value] of Object.entries(next.events)) if (value.syncStatus === 'synced' && Date.parse(value.loginTime) < now - 90 * 86400_000) delete next.events[key];
      next.states[hash(state)] = { browser: hash(browser), returnTo: safeReturnTo(returnTo), origin, appId: config.appId, expires: now + 10 * 60_000 };
    });
    const url = new URL('https://accounts.feishu.cn/open-apis/authen/v1/authorize');
    for (const [key, value] of Object.entries({ client_id: config.appId, redirect_uri: `${origin}/api/auth/feishu/callback`, response_type: 'code', state })) url.searchParams.set(key, value);
    return { state, browser, url: url.href };
  }
  async finish(origin, state, browser, code) {
    if (!/^[\w-]{43}$/.test(state || '') || !/^[\w-]{43}$/.test(browser || '')) throw authError('登录请求已失效，请重新登录。');
    const saved = this.state.states[hash(state)], config = this.config();
    if (!saved || saved.expires <= this.now() || saved.origin !== origin || saved.appId !== config.appId || !equal(saved.browser, hash(browser))) throw authError('登录请求已失效，请重新登录。');
    this.commit(next => { delete next.states[hash(state)]; });
    if (typeof code !== 'string' || !code || code.length > 2048 || /[\s\x00-\x1f]/.test(code)) throw authError('未取得飞书授权，请重新登录。');
    const identity = await this.oauth({ appId: config.appId, appSecret: config.appSecret, code, redirectUri: `${origin}/api/auth/feishu/callback` });
    if (!/^ou_[A-Za-z0-9_-]{3,120}$/.test(identity?.open_id || '') || typeof identity?.name !== 'string' || !identity.name.trim() || identity.name.length > 150) throw authError('飞书身份无效。', 502);
    const token = random(), csrf = random(), now = this.now(), id = randomUUID(), user = { name: identity.name.trim(), openId: identity.open_id };
    this.commit(next => {
      next.events[id] = { id, user, loginTime: new Date(now).toISOString(), logoutTime: null, entryPage: saved.returnTo.split(/[?#]/)[0], method: '飞书授权', revision: 1, syncStatus: 'pending', attempts: 0, nextAttempt: now };
      next.sessions[hash(token)] = { user, csrf, eventId: id, appId: config.appId, created: now, expires: now + 12 * 3600_000 };
    });
    return { token, csrf, user, returnTo: saved.returnTo };
  }
  session(token) {
    if (!/^[\w-]{43}$/.test(token || '')) return null;
    const session = this.state.sessions[hash(token)];
    return session && session.expires > this.now() && session.appId === this.config().appId ? structuredClone(session) : null;
  }
  logout(token, csrf) {
    const session = this.session(token);
    if (!session || !equal(session.csrf, csrf)) throw authError('退出请求无效，请刷新后重试。', 403);
    this.commit(next => {
      delete next.sessions[hash(token)];
      const event = next.events[session.eventId];
      event.logoutTime = new Date(this.now()).toISOString(); event.revision++; event.syncStatus = 'pending'; event.attempts = 0; event.nextAttempt = this.now();
    });
  }
  auditStatus(token) { const session = this.session(token); return session ? this.state.events[session.eventId]?.syncStatus : undefined; }
  async flush() {
    if (this.flushing || !this.sink) return;
    this.flushing = true;
    try {
      const pending = Object.values(this.state.events).filter(e => e.syncStatus !== 'synced' && e.nextAttempt <= this.now()).slice(0, 10);
      for (const event of pending) {
        try {
          const recordId = await this.sink.sync(structuredClone(event));
          this.commit(next => {
            const current = next.events[event.id]; current.recordId = recordId;
            if (current.revision === event.revision) { current.syncStatus = 'synced'; current.lastError = null; }
          });
        } catch {
          this.commit(next => {
            const current = next.events[event.id]; current.syncStatus = 'pending'; current.attempts++; current.lastError = '登录记录尚未同步，请检查记录表和应用权限。'; current.nextAttempt = this.now() + Math.min(3600_000, 30_000 * 2 ** Math.min(current.attempts - 1, 7));
          });
        }
      }
    } finally { this.flushing = false; }
  }
  start() { this.timer = setInterval(() => this.flush().catch(() => console.error('Authentication audit persistence failed; pending records were retained.')), 30_000); this.timer.unref(); }
  close() { clearInterval(this.timer); }
}
