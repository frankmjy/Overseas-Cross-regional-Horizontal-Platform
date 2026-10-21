import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { BaseAdapter } from '../research/adapter.mjs';
import { researchProjectConfigs } from '../research/projects.mjs';
const root = path.resolve('.');
const deployment = process.argv.includes('--deployment');
const config = JSON.parse(fs.readFileSync('research/config.json', 'utf8'));
const targets = config.projects ? researchProjectConfigs(config) : { legacy: config };
const checks = [], failed = [];
function record(name, ok, detail) { checks.push({ name, ok, detail }); if (!ok) failed.push(name); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); }
if (deployment) {
  record('服务器飞书应用环境变量', !!process.env.FEISHU_APP_ID && !!process.env.FEISHU_APP_SECRET, '仅验证是否配置，不输出值');
  const target = process.env.RESEARCH_DEPLOY_ROOT;
  record('服务器实际部署目录', !!target && fs.existsSync(target));
  if (target && fs.existsSync(target)) {
    const unsettled = fs.readdirSync(target, { withFileTypes: true }).filter(e => ['.hotfix-transaction.json', '.maintenance.lock'].includes(e.name) || e.isDirectory() && /rollback|failed.candidate|recovery.archive/i.test(e.name)).map(e => e.name);
    record('旧事务与恢复状态', unsettled.length === 0, unsettled.join(', ') || '未发现待接管状态');
  }
}
for (const [project, target] of Object.entries(targets)) for (const table of Object.keys(target.tables)) {
  try { const rows = await new BaseAdapter(target).list(table); record(`飞书应用读取 ${project}/${table}`, true, `${rows.length} 条`); }
  catch (e) { record(`飞书应用读取 ${project}/${table}`, false, e.message); }
}
const pdfDir = path.join(root, 'vendor/pdfjs');
const pdf = JSON.parse(fs.readFileSync(path.join(pdfDir, 'manifest.json'), 'utf8'));
const bad = Object.entries(pdf.files).filter(([file, hash]) => !fs.existsSync(path.join(pdfDir, file)) || createHash('sha256').update(fs.readFileSync(path.join(pdfDir, file))).digest('hex') !== hash);
record('PDF.js 固定版本与资源哈希', bad.length === 0, `${pdf.version} / ${Object.keys(pdf.files).length} 个文件`);
const dataDir = path.resolve(process.env.RESEARCH_DATA_DIR || '.runtime/research');
const probe = path.join(dataDir, `preflight-${randomUUID()}.tmp`);
try { fs.mkdirSync(dataDir, { recursive: true }); const fd = fs.openSync(probe, 'wx'); try { fs.writeFileSync(fd, 'preflight'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } record('持久化目录可写', true); }
catch { record('持久化目录可写', false); }
finally { if (fs.existsSync(probe)) fs.unlinkSync(probe); }
const origin = process.env.RESEARCH_CHECK_URL || 'https://localhost:3333';
try {
  for (const project of Object.keys(targets)) {
    const result = await (await fetch(`${origin}/api/research${project === 'legacy' ? '' : `?project=${project}`}`, { signal: AbortSignal.timeout(15000) })).json();
    record(`工作台实时数据接口 ${project}`, !!result.data && !result.error && (project === 'legacy' || result.data.project?.key === project), result.error || '已读取成功数据');
  }
  for (const route of ['/.env', '/research/config.json', '/.runtime/research/state.json', '/certs/localhost.pfx', '/vendor/lark-cli/run.cjs']) {
    const response = await fetch(`${origin}${route}`, { method: 'HEAD', signal: AbortSignal.timeout(10000) }); record(`私有路径拒绝访问 ${route}`, response.status === 404);
  }
} catch (e) { record('工作台 HTTP 验证', false, e.message); }
const ownFiles = ['server.mjs', 'package.json', '.env.example', ...['research', 'research/web', 'tests', 'scripts'].flatMap(dir => fs.readdirSync(dir).filter(f => /\.(mjs|json|html|css)$/.test(f)).map(f => `${dir}/${f}`)), 'vendor/pdfjs/manifest.json', 'vendor/lark-cli/run.cjs', 'vendor/lark-cli/bin/lark-cli.exe'];
const fingerprints = Object.fromEntries(ownFiles.map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const report = { at: new Date().toISOString(), scope: deployment ? 'deployment-preflight-only' : 'local-integration', releaseCandidate: false, checks, fingerprints, note: '不生成正式候选包；不代替服务器基线、安装、健康和回滚证据。' };
fs.mkdirSync('reports/research-integration-20261016', { recursive: true });
fs.writeFileSync('reports/research-integration-20261016/preflight.json', JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
