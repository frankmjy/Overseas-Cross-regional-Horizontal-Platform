import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { projectLocalRecords } from './local-records.mjs';
import { researchDirectory } from './directory.mjs';
import { renameKinds, validateRename, processRename } from './rename.mjs';

export const companies = [
  { name: '万国数据', short: '万国数据', code: 'GDS', color: 'blue' },
  { name: '秦淮数据', short: '秦淮数据', code: 'BDC', color: 'teal' },
  { name: '中联云港', short: '中联云港', code: 'ZD', color: 'violet' },
  { name: '德衡数据', short: '德衡数据', code: 'DCS', color: 'amber' },
  { name: '其他部门输入', short: '其他部门', code: 'IN', color: 'gray' },
];
const sha = value => createHash('sha256').update(value).digest('hex');
const text = value => Array.isArray(value) ? text(value[0]) : value == null ? '' : typeof value === 'object' ? value.text || value.name || '' : String(value);
const urlText = value => { const s = text(value); return /^\[.*\]\((https?:\/\/.*)\)$/.exec(s)?.[1] || s; };
const safeUrl = value => { try { const u = new URL(urlText(value)); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
export const validUploadName = name => typeof name === 'string' && name.length > 0 && name.length <= 180 && name === path.basename(name) && !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name) && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name) && /\.(png|jpg|jpeg|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|7z|txt|csv|md)$/i.test(name);
export function normalizeRows(data) {
  if (!Array.isArray(data.fields) || !Array.isArray(data.data) || !Array.isArray(data.record_id_list) || data.data.length !== data.record_id_list.length || data.data.some(row => !Array.isArray(row) || row.length !== data.fields.length)) throw new Error('飞书记录结构不匹配');
  return data.data.map((row, i) => ({ recordId: data.record_id_list[i], ...Object.fromEntries(data.fields.map((key, j) => [key, row[j]])) }));
}
export const versionOf = row => sha(JSON.stringify([text(row.调研内容), text(row.举证原文)]));
const legacyQuestionVersion = row => sha(JSON.stringify([row.recordId, text(row.问题编号), text(row.问题列表), text(row.一级分类), row.重点标记 === true, row.已删除 === true]));
export const questionVersion = row => sha(JSON.stringify([text(row.问题编号), text(row.问题列表), text(row.一级分类), row.重点标记 === true, row.已删除 === true, text(row.适用范围) || '本项目']));
export const attachmentVersion = file => sha(JSON.stringify([file.file_token, file.name, file.size]));
export function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
const readJSON = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
function error(message, status = 400) { const e = new Error(message); e.status = status; return e; }
function limited(value, max, label, required = false) {
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) throw error(`${label}不能为空且不能超过 ${max} 个字符。`);
  return value.trim();
}
export class ResearchService {
  constructor({ dir, base, baseUrl = 'https://vnet.feishu.cn/base/CID8b8V7CaCtKesWGFKcHTdqnlc', autoRun = true, isMaintenance = () => false, project = null, binding = '' }) {
    this.dir = path.resolve(dir); this.base = base; this.baseUrl = baseUrl; this.autoRun = autoRun;
    this.isMaintenance = isMaintenance;
    this.project = project; this.binding = binding;
    this.busy = false; this.refreshing = null; this.closed = false; this.syncError = ''; this.storageError = '';
  }
  async init() {
    fs.mkdirSync(this.dir, { recursive: true });
    this.lockPath = path.join(this.dir, 'writer.lock');
    if (fs.existsSync(this.lockPath)) {
      const lock = readJSON(this.lockPath, {}); let active = false;
      try { process.kill(lock.pid, 0); active = true; } catch (e) { if (e.code !== 'ESRCH') active = true; }
      if (active) throw new Error('已有调研服务使用此数据目录，禁止并发写入。');
      fs.unlinkSync(this.lockPath);
    }
    this.lockFd = fs.openSync(this.lockPath, 'wx', 0o600);
    fs.writeFileSync(this.lockFd, JSON.stringify({ pid: process.pid })); fs.fsyncSync(this.lockFd);
    this.statePath = path.join(this.dir, 'state.json');
    this.state = readJSON(this.statePath, { operations: {}, cache: null, uploads: {} });
    if (this.binding && this.state.binding !== this.binding && (this.state.cache || Object.keys(this.state.operations).length)) {
      fs.closeSync(this.lockFd); fs.unlinkSync(this.lockPath); this.lockFd = undefined;
      throw new Error('调研缓存与正式表绑定不一致，已停止启动，禁止复用其他项目的数据和同步队列。');
    }
    if (this.binding) this.state.binding = this.binding;
    for (const op of Object.values(this.state.operations)) if (op.status === 'syncing') op.status = 'accepted';
    this.persist();
    if (this.autoRun) {
      this.timer = setInterval(() => { this.run().catch(() => {}); }, 2000); this.timer.unref();
      if (!this.state.cache) this.refresh().catch(() => {});
      this.kick();
    }
  }
  persist() {
    try { writeAtomic(this.statePath, this.state); }
    catch { this.storageError = '服务器磁盘持久化失败，已停止同步；请检查磁盘空间和目录权限，修复后重启服务。'; throw error(this.storageError, 503); }
  }
  kick() { if (this.autoRun) { this.kickTimer = setTimeout(() => this.run().catch(() => {}), 50); this.kickTimer.unref(); } }
  async close() {
    if (this.closed) return; this.closed = true;
    clearInterval(this.timer); clearInterval(this.refreshTimer); clearTimeout(this.kickTimer);
    if (this.busy) await this.running;
    if (this.refreshing) await this.refreshing.catch(() => {});
    if (this.lockFd !== undefined) { fs.closeSync(this.lockFd); fs.unlinkSync(this.lockPath); this.lockFd = undefined; }
  }
  async refresh() {
    if (this.storageError) throw error(this.storageError, 503);
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const raw = {};
        if(this.base.resetSubjectLabels)this.base.resetSubjectLabels(this.state.cache?.subjectLabels||{});else this.base.setSubjectLabels?.(this.state.cache?.subjectLabels||{});
        for(const op of Object.values(this.state.operations))if(op.payload?.kind==='company-rename'&&!['success','retired'].includes(op.status)){
          this.base.setSubjectLabels?.({[op.payload.company]:op.payload.oldName});
          this.base.subjectAliases?.set(op.payload.name,op.payload.company);
        }
        const load = async tables => { for (const table of tables) raw[table] = await this.base.list(table); };
        // Evidence uses the subject aliases discovered by findings; the other reads are independent.
        const reads = await Promise.allSettled([load(['questions', 'topics']), load(['findings', 'evidence'])]);
        const failed = reads.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
        const questionIds = new Set();
        for (const row of raw.questions) {
          const id = text(row.问题编号), title = text(row.问题列表);
          if (!id && !title) continue;
          if (!/^Q-[a-z0-9-]{1,90}$/i.test(id) || !title || questionIds.has(id)) throw new Error('飞书问题编号缺失、格式不合法或重复，请在多维表核对后重新同步。');
          questionIds.add(id);
        }
        this.state.cache = { raw, subjectLabels:{...this.base.subjectLabels}, syncedAt: new Date().toISOString() }; this.syncError = ''; this.persist();
        return this.snapshot();
      } catch (e) { this.syncError = e.message; throw e; }
      finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }
  snapshot() {
    const cache = this.state.cache;
    if (!cache) return null;
    const { raw, localFiles, topicSync } = projectLocalRecords(this.state, companies);
    const subjectLabels={...cache.subjectLabels};
    for(const op of Object.values(this.state.operations))if(op.payload?.kind==='company-rename'&&!['success','retired'].includes(op.status))subjectLabels[op.payload.company]=op.payload.name;
    const apiUrl = url => this.project ? `${url}${url.includes('?') ? '&' : '?'}project=${this.project.key}` : url;
    const directory = researchDirectory(raw.questions, raw.topics);
    raw.questions = directory.questions;
    const allQuestions = raw.questions.filter(q => text(q.问题编号) && text(q.问题列表)).map(q => ({ id: text(q.问题编号), title: text(q.问题列表), category: text(q.一级分类) || '待确认分类', applicability: text(q.适用范围) || '本项目', priority: q.重点标记 === true, sourceUrl: safeUrl(q.源表链接) || this.baseUrl, recordId: q.recordId, deleted: q.已删除 === true, version: questionVersion(q), sync: q.__sync }));
    const questions = allQuestions.filter(q => !q.deleted), deletedQuestions = allQuestions.filter(q => q.deleted);
    const qByRecord = new Map(questions.map(q => [q.recordId, q.id]));
    const ids = new Set(questions.map(q => q.id));
    const findings = raw.findings.map(f => ({ id: text(f.明细编号), questionId: qByRecord.get(f.关联问题?.[0]?.id) || text(f.明细编号).split(':')[0], company: text(f.调研对象), content: text(f.调研内容), proof: text(f.举证原文), hasMaterial: text(f.材料状态) === '有原始材料' || !!text(f.调研内容) || !!text(f.举证原文), version: versionOf(f), sync: f.__sync, sourceUrl: safeUrl(f.源表链接) || this.baseUrl })).filter(f => ids.has(f.questionId) && companies.some(c => c.name === f.company));
    for (const q of questions) for (const c of companies) if (!findings.some(f => f.questionId === q.id && f.company === c.name)) findings.push({ id: `${q.id}:${c.name}`, questionId: q.id, company: c.name, content: '', proof: '', hasMaterial: false, version: versionOf({}), sourceUrl: this.baseUrl });
    const evidence = raw.evidence.flatMap(e => {
      const common = { questionId: text(e.问题编号), company: text(e.调研对象), type: text(e.资料类型), sourceUrl: safeUrl(e.源表链接) || this.baseUrl };
      if (!ids.has(common.questionId)) return [];
      const files = Array.isArray(e.附件) ? e.附件 : [];
      if (files.length) return files.map((f, i) => ({ ...common, id: `${e.recordId}-${i}`, name: f.name || text(e.资料名称), size: f.size || Number(e.原文件大小) || 0, mime: text(e.MIME类型) || mimeFor(f.name), downloadable: true, url: apiUrl(`/api/research/files/${e.recordId}/${i}?v=${attachmentVersion(f)}`), feishuUrl: apiUrl(`/api/research/files/${e.recordId}/${i}/feishu`) }));
      const url = safeUrl(e.原始链接);
      return url ? [{ ...common, id: e.recordId, name: text(e.资料名称), size: 0, mime: '', downloadable: false, url }] : [];
    });
    for (const file of localFiles) if (ids.has(file.questionId)) evidence.push({ id: `local-${file.id}`, questionId: file.questionId, company: file.company, name: file.name, size: file.size, mime: file.mime || mimeFor(file.name), downloadable: file.ready !== false, pendingUpload: file.ready === false, url: apiUrl(`/api/research/local-files/${file.id}`), sync: file.sync, uploadError: file.uploadError || '' });
    for (const f of findings) if (evidence.some(e => e.questionId === f.questionId && e.company === f.company)) f.hasMaterial = true;
    return { date: cache.syncedAt.slice(0, 10), syncedAt: cache.syncedAt, baseUrl: this.baseUrl, project: this.project, companies:companies.map(c=>({...c,displayName:subjectLabels[c.name]||c.name,short:subjectLabels[c.name]||c.short})), categories: directory.categories, questions, deletedQuestions, findings, evidence, topicSync, revision: sha(JSON.stringify([cache.syncedAt, Object.values(this.state.operations).map(o => [o.id, o.status, o.error, o.result]), Object.values(this.state.uploads).map(u => [u.id, u.ready, u.sha256, u.uploadError])])), syncError: this.storageError || this.syncError, refreshing: !!this.refreshing };
  }
  validate(input, replay = false) {
    if (this.project && input?.project !== this.project.key) throw error('提交项目与当前正式表不一致，请重新打开对应项目后提交。');
    if (!input || !/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(input.clientMutationId || '')) throw error('提交标识不合法。');
    const data = { kind: input.kind, clientMutationId: input.clientMutationId };
    if (this.project) data.project = this.project.key;
    if(renameKinds.includes(input.kind))return validateRename(this,input,replay,data,limited);
    if (input.kind === 'topic') {
      data.name = limited(input.name, 60, '专题名称', true); data.description = limited(input.description || '', 2000, '专题说明');
      if (data.name === '全部专题') throw error('该名称为系统筛选项，请换一个专题名称。');
      if (!replay && this.snapshot()?.categories.includes(data.name)) throw error('专题名称已存在，请选择现有专题。', 409);
    } else if (input.kind === 'question') {
      data.title = limited(input.title, 1000, '问题', true); data.category = limited(input.category, 60, '专题', true); data.priority = input.priority === true;
      if (this.project) {
        if (!['本项目', '通用'].includes(input.applicability)) throw error('请选择问题适用范围。');
        if (input.applicability === '通用' && this.project.key !== 'malaysia') throw error('新增通用问题应保存到马来项目正式表。');
        data.applicability = input.applicability;
      }
      if (!replay && !this.snapshot()?.categories.includes(data.category)) throw error('请先新增或选择已有专题。');
    } else if (input.kind === 'question-visibility') {
      data.questionId = limited(input.questionId, 100, '问题编号', true);
      const snapshot = this.snapshot();
      if (!replay && ![...(snapshot?.questions || []), ...(snapshot?.deletedQuestions || [])].some(q => q.id === data.questionId)) throw error('调研问题不存在，请刷新后重试。');
      if (typeof input.deleted !== 'boolean' || !/^[a-f0-9]{64}$/.test(input.version || '')) throw error('删除状态或问题版本不合法，请刷新后重试。');
      data.deleted = input.deleted; data.version = input.version;
    } else if (input.kind === 'finding') {
      const snapshot = this.snapshot();
      data.questionId = limited(input.questionId, 100, '问题编号', true);
      data.company = limited(input.company, 50, '调研对象', true);
      if (!replay && !snapshot?.questions.some(q => q.id === data.questionId) || !companies.some(c => c.name === data.company)) throw error('问题或调研对象不存在。');
      data.content = limited(input.content ?? '', 50000, '调研内容'); data.proof = limited(input.proof ?? '', 20000, '补充说明');
      if (!/^[a-f0-9]{64}$/.test(input.version || '')) throw error('内容版本不合法，请刷新后重试。');
      data.version = input.version;
      data.uploadIds = Array.isArray(input.uploadIds) ? input.uploadIds : [];
      if (input.uploadPlans !== undefined) {
        if (!Array.isArray(input.uploadPlans) || input.uploadPlans.length > 10) throw error('附件计划不合法。');
        data.uploadPlans = input.uploadPlans.map(plan => {
          if (!plan || !/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(plan.id || '') || !validUploadName(plan.name) || !Number.isInteger(plan.size) || plan.size <= 0 || plan.size > 64 * 1024 * 1024 || !data.uploadIds.includes(plan.id)) throw error('附件名称、大小或提交标识不合法。');
          return { id: plan.id, name: plan.name, size: plan.size };
        });
        if (new Set(data.uploadPlans.map(plan => plan.id)).size !== data.uploadPlans.length) throw error('附件计划存在重复标识。');
      }
      const planned = new Map((data.uploadPlans || []).map(plan => [plan.id, plan]));
      if (data.uploadIds.length > 10 || new Set(data.uploadIds).size !== data.uploadIds.length || !replay && data.uploadIds.some(id => !this.state.uploads[id] && !planned.has(id) || this.state.uploads[id]?.claimed && this.state.uploads[id].claimed !== data.clientMutationId || planned.has(id) && this.state.uploads[id] && (this.state.uploads[id].name !== planned.get(id).name || this.state.uploads[id].size !== planned.get(id).size))) throw error('附件不存在或已被其他提交使用。');
    } else throw error('不支持的提交类型。');
    return data;
  }
  async accept(input) {
    if (this.storageError) throw error(this.storageError, 503);
    if (input && /^[a-f0-9-]{36}$/i.test(input.clientMutationId || '') && this.state.operations[input.clientMutationId]?.status === 'retired') throw error('该验收提交已清理，禁止重新执行。', 409);
    const existing = this.state.operations[input?.clientMutationId];
    const payload = this.validate(input, !!existing); const id = payload.clientMutationId;
    const hash = sha(JSON.stringify(payload));
    if (existing) { if (existing.hash !== hash) throw error('重复提交标识对应的内容不一致。', 409); return existing; }
    if (Object.values(this.state.operations).filter(o => !['success', 'retired'].includes(o.status)).length >= 100) throw error('待同步任务已达上限，请先处理失败任务。', 429);
    const op = { id, payload, hash, status: 'accepted', createdAt: new Date().toISOString(), steps: {}, error: '', result: {} };
    op.dependencies = Object.values(this.state.operations).filter(prior => {
      if (['success', 'retired'].includes(prior.status)) return false;
      const p = prior.payload, qid = p.kind === 'question' ? `Q-${prior.id.toUpperCase()}` : p.questionId;
      if(['topic-rename','company-rename'].includes(p.kind)||['topic-rename','company-rename'].includes(payload.kind))return true;
      if (payload.kind === 'question') return p.kind === 'topic' && p.name === payload.category && !this.state.cache.raw.topics.some(topic => text(topic.专题名称) === payload.category);
      if (!payload.questionId || payload.questionId !== qid) return false;
      return p.kind === 'question' || p.kind === 'question-title' || payload.kind==='question-title' || p.kind === 'question-visibility' || payload.kind === 'question-visibility' || p.kind === 'finding' && p.company === payload.company;
    }).map(prior => prior.id);
    if (payload.kind === 'question') op.result.questionId = `Q-${id.toUpperCase()}`;
    if (payload.kind === 'topic') op.result.category = payload.name;
    if (payload.questionId) op.result.questionId = payload.questionId;
    const previousUploads = new Map();
    for (const file of payload.uploadIds || []) {
      const previous = this.state.uploads[file]; previousUploads.set(file, previous);
      this.state.uploads[file] = previous ? { ...previous, claimed: id } : { ...payload.uploadPlans.find(plan => plan.id === file), ready: false, claimed: id, createdAt: op.createdAt };
    }
    this.state.operations[id] = op;
    try { this.persist(); } catch (e) { delete this.state.operations[id]; for (const [file, previous] of previousUploads) { if (previous) this.state.uploads[file] = previous; else delete this.state.uploads[file]; } throw e; }
    this.kick(); return op;
  }
  operation(id) { return this.state.operations[id]; }
  completeUpload(id, metadata) {
    const previous = this.state.uploads[id];
    this.state.uploads[id] = { ...previous, ...metadata, id, ready: true, uploadError: '', createdAt: previous?.createdAt || new Date().toISOString() };
    const op = this.operation(previous?.claimed);
    if (op?.status === 'waiting_upload') op.status = 'accepted';
    this.persist(); this.kick();
  }
  uploadFailed(id) {
    const file = this.state.uploads[id];
    if (!file) throw error('附件任务不存在。', 404);
    if (file.ready === false) { file.uploadError = '附件尚未传到服务器，请重新选择文件补传。'; this.persist(); }
  }
  dependenciesReady(op) {
    return (op.dependencies || []).every(id => {
      const parent = this.operation(id);
      return parent?.status === 'success' || parent?.payload?.kind === 'finding' && parent.steps.content?.status === 'success' && ['waiting_upload', 'error'].includes(parent.status);
    });
  }
  publicOperation(op) {
    if (op?.status === 'retired') return { id: op.id, status: 'success', label: '验收任务已清理', result: { cleaned: true } };
    return op && { id: op.id, kind: op.payload.kind, label: op.payload.title || op.payload.name || (op.payload.kind === 'question-visibility' ? `${op.payload.deleted ? '删除' : '恢复'} ${op.payload.questionId}` : `${op.payload.questionId} · ${op.payload.company}`), status: op.status, error: op.error, createdAt: op.createdAt, result: op.result, uploads: (op.payload.uploadIds || []).map(id => { const file = this.state.uploads[id]; return { id, name: file.name, size: file.size, ready: file.ready !== false, error: file.uploadError || '' }; }) };
  }
  async retry(id) {
    if (this.storageError) throw error(this.storageError, 503);
    const op = this.operation(id); if (!op) throw error('同步任务不存在。', 404);
    const reset = (item, seen = new Set()) => {
      if (!item || seen.has(item.id)) return; seen.add(item.id);
      for (const id of item.dependencies || []) reset(this.operation(id), seen);
      if (['error', 'blocked'].includes(item.status)) { item.status = 'accepted'; item.error = ''; }
    };
    reset(op); this.persist(); this.kick();
    return op;
  }
  async ensure(op, step, table, fields, match = r => text(r.迁移键) === fields.迁移键) {
    const rows = await this.base.list(table); const found = rows.filter(match);
    if (found.length > 1) throw error('飞书存在重复业务键，已停止同步，请核对重复记录。', 409);
    const prior = op.steps[step];
    if (found[0]) {
      this.verify(found[0], fields); op.steps[step] = { status: 'success', recordId: found[0].recordId }; this.persist(); return found[0].recordId;
    }
    if (prior?.status === 'started' || prior?.status === 'success') throw new Error('上次写入结果尚未确认，已阻止重复建记录；请稍后重试核对。');
    op.steps[step] = { status: 'started' }; this.persist();
    const id = await this.base.create(table, fields);
    const row = (await this.base.list(table)).find(r => r.recordId === id);
    if (!row) throw new Error('飞书写入后暂时未能回读，请稍后重试核对。');
    this.verify(row, fields); op.steps[step] = { status: 'success', recordId: id }; this.persist(); return id;
  }
  verify(row, fields) {
    for (const [key, expected] of Object.entries(fields)) {
      const actual = row[key];
      const equal = Array.isArray(expected) ? JSON.stringify((actual || []).map(x => x.id).sort()) === JSON.stringify(expected.map(x => x.id).sort()) : typeof expected === 'boolean' ? !!actual === expected : text(actual) === String(expected);
      if (!equal) throw new Error(`飞书字段“${key}”回读不一致，请核对后重试。`);
    }
  }
  async process(op) {
    const p = op.payload;
    this.base.setSubjectLabels?.(this.state.cache?.subjectLabels||{});
    if(renameKinds.includes(p.kind))return processRename(this,op,questionVersion);
    if (p.kind === 'question-visibility') {
      await this.base.ensureDeletionField();
      const matches = (await this.base.list('questions')).filter(q => text(q.问题编号) === p.questionId);
      if (matches.length !== 1) throw new Error('飞书问题不存在或编号重复，请核对后重试。');
      const q = matches[0];
      if ((q.已删除 === true) !== p.deleted) {
        if (op.steps.visibility?.status === 'started') throw new Error('上次删除或恢复结果尚未确认，请刷新问题状态后重新确认，已阻止覆盖后续修改。');
        if (questionVersion(q) !== p.version && legacyQuestionVersion(q) !== p.version) throw new Error('该问题已被修改，请刷新后重新确认删除或恢复。');
        op.steps.visibility = { status: 'started', recordId: q.recordId }; this.persist();
        await this.base.update('questions', q.recordId, { 已删除: p.deleted });
      }
      const row = (await this.base.list('questions')).find(item => item.recordId === q.recordId);
      if (!row || (row.已删除 === true) !== p.deleted) throw new Error('飞书删除状态回读不一致，请稍后重试核对。');
      op.steps.visibility = { status: 'success', recordId: q.recordId }; op.result = { questionId: p.questionId, deleted: p.deleted }; this.persist();
    }
    if (p.kind === 'topic') {
      const existing = (await this.base.list('topics')).find(r => text(r.专题名称) === p.name);
      if (existing && text(existing.迁移键) !== `web:${op.id}`) throw new Error('专题名称已存在，请选择现有专题。');
      await this.ensure(op, 'topic', 'topics', { 专题名称: p.name, 专题说明: p.description, 迁移键: `web:${op.id}` });
      op.result.category = p.name;
    }
    if (p.kind === 'question') {
      const qid = `Q-${op.id.toUpperCase()}`; op.result.questionId = qid;
      const qrec = await this.ensure(op, 'question', 'questions', { 问题列表: p.title, 问题编号: qid, 一级分类: p.category, 重点标记: p.priority, 分类待确认: p.category === '待确认分类', ...(this.project ? {适用范围:p.applicability} : {}), 迁移键: `web:${op.id}` });
      for (const c of companies) await this.ensure(op, `finding:${c.name}`, 'findings', { 明细名称: `${c.name}｜${p.title}`, 明细编号: `${qid}:${c.name}`, 关联问题: [{ id: qrec }], 一级分类: p.category, 调研对象: c.name, 调研内容: '', 举证原文: '', 材料状态: '待调研', 迁移键: `web:${op.id}:${c.code}` });
    }
    if (p.kind === 'finding') {
      const q = (await this.base.list('questions')).find(row => text(row.问题编号) === p.questionId);
      if (!q || q.已删除 === true && op.steps.content?.status !== 'success') throw new Error('该问题已删除或不存在，请先恢复后再编辑。');
      const f = (await this.base.list('findings')).find(r => text(r.明细编号) === `${p.questionId}:${p.company}`);
      if (!f) throw new Error('飞书中缺少此问题的调研明细，请先修复问题同步。');
      const fields = { 调研内容: p.content, 举证原文: p.proof, 材料状态: p.content || p.proof || p.uploadIds.some(id => this.state.uploads[id]?.ready !== false) || (await this.base.list('evidence')).some(e => text(e.问题编号) === p.questionId && text(e.调研对象) === p.company && (e.附件?.length || safeUrl(e.原始链接))) ? '有原始材料' : '待调研' };
      if (!op.steps.content) {
        if (versionOf(f) !== p.version && versionOf(f) !== versionOf(fields)) throw new Error('该内容已被修改，请刷新详情并合并最新内容后重新提交。');
        op.steps.content = { status: 'started', recordId: f.recordId }; this.persist();
      }
      if (op.steps.content.status !== 'success') {
        if (versionOf(f) !== p.version && versionOf(f) !== versionOf(fields)) throw new Error('该内容已被修改，请刷新详情并合并最新内容后重新提交。');
        if (versionOf(f) !== versionOf(fields) || text(f.材料状态) !== fields.材料状态) await this.base.update('findings', f.recordId, fields);
        const row = (await this.base.list('findings')).find(r => r.recordId === f.recordId); this.verify(row, fields);
        op.steps.content.status = 'success'; this.persist();
      }
      for (const uploadId of p.uploadIds) {
        const file = this.state.uploads[uploadId];
        if (file?.ready === false) return 'waiting_upload';
        const rec = await this.ensure(op, `evidence:${uploadId}`, 'evidence', { 资料名称: file.name, 资料编号: `E-${uploadId}`, 所属明细: [{ id: f.recordId }], 问题编号: p.questionId, 调研对象: p.company, 资料类型: '文件附件', 迁移状态: '已迁移', 原文件大小: file.size, MIME类型: file.mime, SHA256: file.sha256, 迁移键: `web:${op.id}:${uploadId}` });
        const step = `upload:${uploadId}`;
        if (op.steps[step]?.status === 'success') continue;
        let remote = (await this.base.list('evidence')).find(e => e.recordId === rec);
        const matches = () => (remote?.附件 || []).filter(a => a.name === file.name && a.size === file.size);
        if (!matches().length) {
          if (op.steps[step]?.status === 'started') throw new Error('附件上传结果尚未确认，已阻止重复上传；请稍后重试核对。');
          op.steps[step] = { status: 'started' }; this.persist();
          await this.base.upload(rec, path.join(this.dir, 'uploads', uploadId, file.name));
          remote = (await this.base.list('evidence')).find(e => e.recordId === rec);
        }
        if (matches().length !== 1) throw new Error('附件回读名称或大小不一致，已停止同步。');
        op.steps[step] = { status: 'success' }; this.persist();
      }
      if (p.uploadIds.length && op.steps.material?.status !== 'success') {
        const current = (await this.base.list('findings')).find(row => row.recordId === f.recordId);
        if (text(current?.材料状态) !== '有原始材料') await this.base.update('findings', f.recordId, { 材料状态: '有原始材料' });
        const checked = (await this.base.list('findings')).find(row => row.recordId === f.recordId); this.verify(checked, { 材料状态: '有原始材料' });
        op.steps.material = { status: 'success' }; this.persist();
      }
      op.result.questionId = p.questionId; op.result.company = p.company;
    }
  }
  async run() {
    if (this.busy || this.closed || this.storageError || this.isMaintenance()) return this.running;
    this.busy = true;
    this.running = (async () => {
      try {
        if (this.refreshing) await this.refreshing;
        for (const op of Object.values(this.state.operations)) {
      if (op.status === 'blocked' && this.dependenciesReady(op)) { op.status = 'accepted'; op.error = ''; }
          if (op.status !== 'accepted') continue;
          if (!this.dependenciesReady(op)) { op.status = 'blocked'; op.error = '前置记录尚未同步，请先处理相关失败任务；本地内容已保存。'; this.persist(); continue; }
          op.status = 'syncing'; op.error = ''; this.persist();
          try { const result = await this.process(op); if (result === 'waiting_upload') op.status = 'waiting_upload'; else { await this.refresh(); op.status = 'success'; } }
          catch (e) { op.status = 'error'; op.error = e.message; }
          this.persist();
        }
      } finally { this.busy = false; }
    })();
    return this.running;
  }
}
export function mimeFor(name = '') {
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8' })[path.extname(name).toLowerCase()] || 'application/octet-stream';
}
