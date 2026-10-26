import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProjectTaskService } from './project-tasks/service.mjs';
import { createProjectTaskHandler } from './project-tasks/http.mjs';
import { ResearchService } from './research/service.mjs';
import { BaseAdapter } from './research/adapter.mjs';
import { createResearchHandler } from './research/http.mjs';
import { researchProjectConfigs, createProjectResearchHandler } from './research/projects.mjs';
import { ApplicationSettings, createApplicationSettingsHandler } from './application-settings.mjs';
import { createKnowledgeHandler } from './knowledge/http.mjs';
import { KnowledgeService } from './knowledge/service.mjs';
import { MeetingService } from './knowledge/meeting-service.mjs';
import { MinutesService } from './knowledge/minutes.mjs';
import { createMeetingHandler } from './knowledge/meeting-http.mjs';
import { TeamOrganizationService } from './team-organization.mjs';
import { AuthService } from './auth/service.mjs';
import { LoginAuditSink } from './auth/audit.mjs';
import { createAuthHandler } from './auth/http.mjs';

const PORT = Number(process.env.PORT || 3333);
const HOST = process.env.SERVER_HOST || process.env.HOST || '0.0.0.0';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const isMaintenance = () => existsSync(path.join(ROOT, '.maintenance.lock'));
const applicationSettings = new ApplicationSettings({ dir: process.env.RESEARCH_DATA_DIR || path.join(ROOT, '.runtime/research') });
try { await applicationSettings.restore(); } catch { console.error('Saved application settings could not be applied; open application settings to retry.'); }
const authConfig = JSON.parse(readFileSync(path.join(ROOT, 'auth/config.json'), 'utf8'));
const authService = new AuthService({ dir: process.env.AUTH_DATA_DIR || path.join(ROOT, '.runtime/auth'), sink: new LoginAuditSink(authConfig) });
const handleAuth = createAuthHandler({ service: authService, root: ROOT });
authService.start();
const researchConfig = JSON.parse(readFileSync(path.join(ROOT, 'research/config.json'), 'utf8'));
const researchServices = {};
try {
  for (const [key, config] of Object.entries(researchProjectConfigs(researchConfig))) {
    const service = new ResearchService({ dir: path.join(process.env.RESEARCH_DATA_DIR || path.join(ROOT, '.runtime/research'), 'projects', key), base: new BaseAdapter(config), baseUrl: config.baseUrl, project: config.project, binding: config.binding, isMaintenance });
    researchServices[key] = service; await service.init();
  }
} catch (error) { await Promise.allSettled(Object.values(researchServices).map(service => service.close())); throw error; }
const projectOptions = () => Object.values(researchServices).map(service => ({ ...service.project, categories: service.snapshot()?.categories || [] }));
const handleResearch = createProjectResearchHandler({ defaultProject: researchConfig.defaultProject, handlers: Object.fromEntries(Object.entries(researchServices).map(([key, service]) => [key, createResearchHandler({ root: ROOT, service, projectOptions })])) });
const knowledgeConfig = JSON.parse(readFileSync(path.join(ROOT, 'knowledge/config.json'), 'utf8'));
const knowledgeService = new KnowledgeService({ config: knowledgeConfig, cacheFile: path.join(process.env.KNOWLEDGE_DATA_DIR || path.join(ROOT,'.runtime/knowledge'),'cache.json') });
await knowledgeService.init();
const knowledgeDir=process.env.KNOWLEDGE_DATA_DIR || path.join(ROOT,'.runtime/knowledge');
const meetingService=new MeetingService({dir:knowledgeDir,config:knowledgeConfig,isMaintenance:()=>isMaintenance()||applicationSettings.saving});
meetingService.init();meetingService.start();
const minutesService=new MinutesService({dir:knowledgeDir,config:knowledgeConfig,records:()=>meetingService.merge(knowledgeService.snapshot()).meetings});
const handleMeeting=createMeetingHandler({service:meetingService,minutes:minutesService});
const handleKnowledge = createKnowledgeHandler({ root: ROOT, service: knowledgeService,meetings:meetingService });
let planRequests = 0;
const projectTaskService = new ProjectTaskService({ dir: process.env.PROJECT_TASK_DATA_DIR || path.join(ROOT, '.runtime/project-tasks'), isMaintenance: () => isMaintenance() || applicationSettings.saving });
const handleProjectTasks = createProjectTaskHandler(projectTaskService);
projectTaskService.start();
const teamOrganization = new TeamOrganizationService();
applicationSettings.canSwitchApp = () => !authService.flushing && !Object.values(authService.state.events).some(e => e.syncStatus !== 'synced') && !Object.values(projectTaskService.state.operations).some(op => op.status !== 'success') && !Object.values(meetingService.state.operations).some(op => op.status !== 'success');
const handleApplicationSettings = createApplicationSettingsHandler(applicationSettings, () => planRequests === 0 && !meetingService.running && !meetingService.refreshing && !meetingService.pending && !minutesService.running.size && !projectTaskService.refreshing && !projectTaskService.flushing && !projectTaskService.statusRefreshing && Object.values(researchServices).every(service => !service.busy && !service.refreshing && !Object.values(service.state.operations).some(op => ['accepted', 'syncing'].includes(op.status))));
const DEFAULT_PFX_PATH = path.join(ROOT, 'certs', 'localhost.pfx');
const DEFAULT_PFX_PASSPHRASE_PATH = path.join(ROOT, 'certs', 'localhost.passphrase');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://${HOST}:${PORT}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const routePath = decodedPath === '/project-management' ? '/index.html' : decodedPath;
  const legacyAsset = /^\/(src|assets)\/[\w./-]+\.(js|css|png|jpg|jpeg|svg|woff2?)$/i.test(routePath);
  const legacyDocument = ['/index.html', '/THAI_NEXUSLINK_BOI_bilingual.xlsx', '/THAI_NEXUSLINK_BOI_original.xlsx'].includes(routePath);
  if (!legacyAsset && !legacyDocument) return null;
  const absolutePath = path.resolve(ROOT, `.${routePath}`);

  if (!absolutePath.startsWith(ROOT + path.sep)) {
    return null;
  }

  return absolutePath;
}

async function findFile(filePath) {
  if (!filePath) return null;
  try {
    const info = await stat(filePath);
    if (info.isFile()) return filePath;
    if (info.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      await access(indexPath);
      return indexPath;
    }
  } catch {
    return null;
  }
  return null;
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function readHttpsOptions() {
  const pfxPathFromEnv = process.env.HTTPS_PFX_PATH?.trim();
  const keyPath = process.env.HTTPS_KEY_PATH?.trim();
  const certPath = process.env.HTTPS_CERT_PATH?.trim();
  const caPath = process.env.HTTPS_CA_PATH?.trim();
  const pfxPath =
    pfxPathFromEnv || (!keyPath && !certPath && existsSync(DEFAULT_PFX_PATH) ? DEFAULT_PFX_PATH : '');

  if (pfxPathFromEnv && (keyPath || certPath)) {
    throw new Error('Use HTTPS_PFX_PATH or HTTPS_KEY_PATH/HTTPS_CERT_PATH, not both');
  }

  if (pfxPath) {
    const resolvedPfxPath = resolveFromRoot(pfxPath);
    if (!existsSync(resolvedPfxPath)) throw new Error(`HTTPS PFX file not found: ${resolvedPfxPath}`);
    const passphraseFile = process.env.HTTPS_PFX_PASSPHRASE_FILE?.trim();
    const resolvedPassphraseFile = passphraseFile
      ? resolveFromRoot(passphraseFile)
      : DEFAULT_PFX_PASSPHRASE_PATH;
    const passphrase =
      process.env.HTTPS_PFX_PASSPHRASE ||
      (existsSync(resolvedPassphraseFile)
        ? readFileSync(resolvedPassphraseFile, 'utf8').trim()
        : undefined);
    return {
      pfx: readFileSync(resolvedPfxPath),
      passphrase,
    };
  }

  if (!keyPath && !certPath) return null;
  if (!keyPath || !certPath) {
    throw new Error('HTTPS_KEY_PATH and HTTPS_CERT_PATH must be configured together');
  }

  const resolvedKeyPath = resolveFromRoot(keyPath);
  const resolvedCertPath = resolveFromRoot(certPath);
  if (!existsSync(resolvedKeyPath)) throw new Error(`HTTPS key file not found: ${resolvedKeyPath}`);
  if (!existsSync(resolvedCertPath)) throw new Error(`HTTPS cert file not found: ${resolvedCertPath}`);

  const options = {
    key: readFileSync(resolvedKeyPath),
    cert: readFileSync(resolvedCertPath),
  };

  if (caPath) {
    const resolvedCaPath = resolveFromRoot(caPath);
    if (!existsSync(resolvedCaPath)) throw new Error(`HTTPS CA file not found: ${resolvedCaPath}`);
    options.ca = readFileSync(resolvedCaPath);
  }

  return options;
}

async function handleRequest(req, res) {
  if (isMaintenance() && !['GET', 'HEAD'].includes(req.method)) { sendJson(res, 503, { ok: false, error: '系统正在更新，请稍后重试；当前输入请保留。' }); return; }
  if (await handleAuth(req, res)) return;
  if (await handleApplicationSettings(req, res)) return;
  if (applicationSettings.saving && req.url.startsWith('/api/project-tasks')) { sendJson(res,409,{ok:false,error:'正在应用配置，请稍后保存。'}); return; }
  if (await handleProjectTasks(req, res)) return;
  if (applicationSettings.saving && req.method === 'POST' && req.url.startsWith('/api/research')) { sendJson(res, 409, { ok: false, error: '正在应用配置，请稍后提交或同步。' }); return; }
    if (await handleMeeting(req, res)) return;
    if (await handleKnowledge(req, res)) return;
  if (await handleResearch(req, res)) return;
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (url.pathname === '/api/team-organization') {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); sendJson(res,405,{ok:false,error:'人员架构当前为只读。'}); return; }
    const project = url.searchParams.get('project') || 'thailand';
    if (!['thailand','malaysia'].includes(project)) { sendJson(res,400,{ok:false,error:'项目不受支持。'}); return; }
    if (applicationSettings.saving) { sendJson(res,409,{ok:false,error:'正在应用配置，请稍后重试。'}); return; }
    planRequests++;
    try { sendJson(res,200,{ok:true,data:await teamOrganization.read(project,{refresh:url.searchParams.get('refresh')==='1'})}); }
    catch (error) { sendJson(res,502,{ok:false,error:error.message}); }
    finally { planRequests--; }
    return;
  }

  if (url.pathname === '/api/base-sync') {
    if (!['GET', 'POST'].includes(req.method)) {
      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (applicationSettings.saving) { sendJson(res, 409, { ok: false, error: '正在应用配置，请稍后同步。' }); return; }
    planRequests++;
    try {
      if (req.method === 'POST') await projectTaskService.refreshStatuses();
      else await projectTaskService.refresh();
      const data = projectTaskService.plan();
      sendJson(res, 200, { ok: true, data });
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: error.publicMessage || '项目数据同步失败，请检查服务器应用配置后重试。',
      });
    } finally {
      planRequests--;
    }
    return;
  }

  const filePath = await findFile(resolveRequestPath(req.url || '/'));

  if (!filePath) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME_TYPES[ext] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(res);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

const httpsOptions = readHttpsOptions();
const protocol = httpsOptions ? 'https' : 'http';
const server = httpsOptions
  ? createHttpsServer(httpsOptions, handleRequest)
  : createHttpServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`Overseas project platform: ${protocol}://${HOST}:${PORT}/`);
});
async function shutdown() {
  server.close();
  authService.close();
  projectTaskService.close();
  await Promise.all([meetingService.close(),minutesService.close()]);
  await Promise.all(Object.values(researchServices).map(service => service.close()));
  process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
