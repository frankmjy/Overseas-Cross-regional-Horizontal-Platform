import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeAtomic } from './research/service.mjs';

const failure = (message, status = 400) => Object.assign(new Error(message), { publicMessage: message, status });
export function isLocalConfigurationRequest(req) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  if (['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip'].some(key => req.headers[key])) return false;
  try {
    const host = new URL(`http://${req.headers.host}`);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host.hostname) || req.headers['sec-fetch-site'] === 'cross-site') return false;
    const origin = req.headers.origin && new URL(req.headers.origin);
    return !origin || ['http:', 'https:'].includes(origin.protocol) && origin.host === host.host;
  } catch { return false; }
}
async function verifyCredentials({ appId, appSecret }) {
  try {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app_id: appId, app_secret: appSecret }), signal: AbortSignal.timeout(12000) });
    const result = await response.json();
    if (!response.ok || result.code !== 0 || !result.tenant_access_token) {
      const code = /^\d{1,10}$/.test(String(result.code)) ? `（${result.code}）` : '';
      throw failure(`飞书应用凭据校验失败${code}，请核对 App ID 和 App Secret。`);
    }
  } catch (error) { throw error.publicMessage ? error : failure('无法连接飞书校验凭据，请检查服务器网络后重试。', 502); }
}
async function applyCredentials({ appId, appSecret }) {
  const script = process.env.LARK_CLI_SCRIPT || path.resolve('vendor/lark-cli/run.cjs');
  if (!fs.existsSync(script)) throw failure('飞书 CLI 未就绪，无法应用配置。', 503);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, 'config', 'init', '--app-id', appId, '--app-secret-stdin', '--brand', 'feishu', '--lang', 'zh_cn'], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => { child.kill(); reject(failure('凭据已保存，应用配置超时；请重试保存或重启服务。', 503)); }, 15000);
    child.on('error', () => { clearTimeout(timer); reject(failure('无法启动飞书配置程序，请检查服务器环境。', 503)); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(failure('凭据已保存，但应用失败；请重试保存或重启服务。', 503)); });
    child.stdin.on('error', () => {}); child.stdin.end(`${appSecret}\n`);
  });
  process.env.FEISHU_APP_ID = appId; process.env.FEISHU_APP_SECRET = appSecret;
}
export class ApplicationSettings {
  constructor({ dir, verify = verifyCredentials, apply = applyCredentials, canSwitchApp = () => true }) {
    this.file = path.join(dir, 'app-settings.json'); this.verify = verify; this.apply = apply; this.canSwitchApp = canSwitchApp; this.saving = false;
    this.saved = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : null;
  }
  publicStatus() { return { appId: this.saved?.appId || process.env.FEISHU_APP_ID || '', configured: !!this.saved?.applied, editable: true }; }
  async restore() { if (this.saved) { this.saved.applied = false; await this.apply(this.saved); this.saved.applied = true; writeAtomic(this.file, this.saved); } }
  async save(input) {
    const { appId, appSecret, clientMutationId } = input || {};
    if (typeof appId !== 'string' || !/^cli_[a-zA-Z0-9]+$/.test(appId) || typeof appSecret !== 'string' || !appSecret.trim() || appSecret.length > 512 || /[\r\n\0]/.test(appSecret) || !/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(clientMutationId || '')) throw failure('请填写有效的 App ID 和 App Secret。');
    const digest = createHash('sha256').update(JSON.stringify([appId, appSecret])).digest('hex');
    if (this.saved?.clientMutationId === clientMutationId) {
      if (this.saved.digest !== digest) throw failure('重复请求的内容不同，请重新提交。', 409);
      if (this.saved.applied) return this.publicStatus();
    }
    if (this.saving) throw failure('正在保存配置，请稍后重试。', 409);
    this.saving = true;
    try {
      try { await this.verify({ appId, appSecret }); } catch (error) { throw error.publicMessage ? error : failure('飞书凭据校验未通过，请核对配置或稍后重试。'); }
      const previous = this.saved?.appId || process.env.FEISHU_APP_ID;
      if (previous && previous !== appId && !await this.canSwitchApp(previous, appId)) throw failure('仍有未同步任务，暂不能切换飞书应用。请先核对原应用任务。', 409);
      const next = { appId, appSecret, clientMutationId, digest, applied: false };
      try { writeAtomic(this.file, next); } catch { throw failure('服务器无法保存配置，请检查目录权限和磁盘空间。', 503); }
      this.saved = next;
      try { await this.apply(next); } catch (error) { throw error.publicMessage ? error : failure('凭据已保存，但应用失败；请重试保存或重启服务。', 503); }
      next.applied = true;
      try { writeAtomic(this.file, next); } catch { next.applied = false; throw failure('配置应用结果无法持久化，请检查服务器磁盘后重试。', 503); }
      return this.publicStatus();
    } finally { this.saving = false; }
  }
}
export function createApplicationSettingsHandler(settings, canConfigure = () => true) {
  return async (req, res) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/api/application-settings') return false;
    const send = (status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(payload)); };
    try {
      if (!isLocalConfigurationRequest(req)) throw failure('请在服务器本机浏览器中使用 localhost 打开应用配置。', 403);
      if (req.method === 'GET') send(200, { ok: true, ...settings.publicStatus() });
      else if (req.method === 'POST') {
        if (!canConfigure()) throw failure('数据正在同步，请等待完成后再修改应用配置。', 409);
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw failure('请使用 JSON 提交。', 415);
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 4096) throw failure('配置内容过长。', 413); chunks.push(chunk); }
        let input; try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw failure('配置格式错误。'); }
        if (!canConfigure()) throw failure('数据正在同步，请等待完成后再修改应用配置。', 409);
        send(200, { ok: true, ...await settings.save(input) });
      } else throw failure('不支持此请求方法。', 405);
    } catch (error) { send(error.status || 500, { ok: false, error: error.publicMessage || '应用配置处理失败，请检查服务器环境。' }); }
    return true;
  };
}
