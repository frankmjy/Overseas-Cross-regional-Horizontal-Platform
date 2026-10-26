import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BaseAdapter } from '../research/adapter.mjs';
import { normalizeRows } from '../research/service.mjs';
import { BASE_TOKEN, TABLE_ID, FIELD_NAMES, normalizeRecords, buildPlan } from '../base-sync.mjs';
import { columns, text, same, digest, publicRecord, schemaOf, usersOf, validatePatch, encodePatch, appendFeedback, failure } from './model.mjs';
import { calculatedStatus, chinaDay, nextChinaMidnight } from './status.mjs';
import { scopeIdentityCache } from '../auth/identity-cache.mjs';

const projected = [...new Set([...FIELD_NAMES, ...Object.values(columns).map(([name]) => name)])];
export class ProjectTaskService {
  constructor({ dir, adapter = new BaseAdapter({ baseToken: BASE_TOKEN }), now = Date.now, isMaintenance = () => false, appId = () => process.env.FEISHU_APP_ID || '' } = {}) {
    this.file = path.join(dir, 'ledger.json'); this.adapter = adapter; this.now = now; this.isMaintenance = isMaintenance; this.appId = appId;
    this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { version: 1, records: [], schema: null, updatedAt: null, operations: {} };
    if (this.state.version !== 1 || !Array.isArray(this.state.records) || !this.state.operations) throw Error('任务台账不完整，请保留原文件并恢复备份。');
    this.external = Promise.resolve();
  }
  ensureIdentity() { const next=scopeIdentityCache(this.state,this.appId(),{records:[],schema:null,updatedAt:null,statusRefreshedDay:''});if(next)this.commit(state=>Object.assign(state,next)); }
  commit(change) {
    const next = structuredClone(this.state); change(next); next.revision = (this.state.revision || 0) + 1;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      const fd = fs.openSync(temp, 'wx', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(next)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(temp, this.file); this.state = next;
    } catch { if (fs.existsSync(temp)) fs.unlinkSync(temp); throw failure('任务未保存，请检查服务器存储后重试。', 503); }
  }
  serialize(work) {
    const run = this.external.then(work); this.external = run.catch(() => {}); return run;
  }
  async cli(command, args) { return this.adapter.cli(command, ['--table-id', TABLE_ID, ...args, ...(['+record-list', '+record-get'].includes(command) ? ['--format', 'json'] : [])]); }
  publicOperation(op) { return { id: op.id, recordId: op.recordId, status: op.status, error: op.error || '', updatedAt: op.updatedAt }; }
  currentRecords() {
    return this.state.records.map(row => {
      const pending = Object.values(this.state.operations).filter(op => op.recordId === row.recordId && op.status !== 'success');
      return pending.reduce((record, op) => {
        const updated = { ...record, ...encodePatch(op.patch) };
        if (Object.hasOwn(op.patch, 'due') || Object.hasOwn(op.patch, 'actualCompletion')) updated['Gantt End（甘特结束时间）'] = updated[columns.actualCompletion[0]] || updated[columns.due[0]] || null;
        return updated;
      }, row);
    });
  }
  plan() {
    this.ensureIdentity();
    const rows = this.currentRecords(), envelope = { data: { fields: projected, record_id_list: rows.map(row => row.recordId), data: rows.map(row => projected.map(name => row[name] ?? null)) } };
    const plan = buildPlan(normalizeRecords(envelope));
    plan.statusRefreshedDay = this.state.statusRefreshedDay || '';
    for (const row of plan.ganttPlan.keyRows) {
      const op = Object.values(this.state.operations).filter(op => op.recordId === row.recordId).at(-1);
      if (op) row.sync = this.publicOperation(op);
    }
    return plan;
  }
  snapshot() {
    this.ensureIdentity();
    return { revision: this.state.revision || 0, ready: !!this.state.schema, refreshing: !!this.refreshing, error: this.lastError || this.statusError || '', updatedAt: this.state.updatedAt,
      schema: this.state.schema, users: usersOf(this.state.records), records: this.currentRecords().map(publicRecord),
      operations: Object.values(this.state.operations).filter(op => op.status !== 'success' || this.now() - op.updatedAt < 600000).map(op => this.publicOperation(op)) };
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.serialize(async () => {
      this.ensureIdentity();
      const metadata = await this.cli('+field-list', []), schema = schemaOf(metadata.fields);
      const rows = [], ids = new Set(); let revision;
      for (let page = 0, offset = 0; page < 100; page++) {
        const result = await this.cli('+record-list', ['--limit', '200', '--offset', String(offset), ...projected.flatMap(name => ['--field-id', name])]);
        const batch = normalizeRows(result);
        if (revision !== undefined && revision !== result.rev) throw Error('读取期间任务表发生变化，请重试。');
        revision = result.rev;
        for (const row of batch) { if (ids.has(row.recordId)) throw Error('任务分页重复，请重试。'); ids.add(row.recordId); rows.push(row); }
        if (!result.has_more) {
          this.commit(next => { next.records = rows; next.schema = schema; next.updatedAt = this.now(); });
          this.lastError = ''; return this.snapshot();
        }
        if (!batch.length) throw Error('任务分页没有前进，请重试。');
        offset += batch.length;
      }
      throw Error('任务数量超过读取上限，未使用不完整数据。');
    });
    try { return await this.refreshing; } catch { this.lastError = '任务资料暂未更新，请重试。'; throw failure(this.lastError, 502); } finally { this.refreshing = null; }
  }
  async refreshStatuses() {
    if (this.statusRefreshing) return this.statusRefreshing;
    if (this.isMaintenance()) throw failure('系统正在更新，请稍后刷新状态。', 503);
    this.statusRefreshing = (async () => {
      await this.refresh();
      return this.serialize(async () => {
        const day = chinaDay(this.now()); let changed = 0;
        for (let pass = 0; pass < 2; pass++) {
          const groups = new Map();
          const pending = new Set(Object.values(this.state.operations).filter(op => op.status !== 'success').map(op => op.recordId));
          for (const row of this.state.records) {
            const status = calculatedStatus(row, this.now());
            if (!status || pending.has(row.recordId) || status === text(row[columns.status[0]])) continue;
            if (!this.state.schema.status.options.includes(status)) throw Error('状态选项不完整，未写入未知选项。');
            if (!groups.has(status)) groups.set(status, []); groups.get(status).push(row.recordId);
          }
          if (!groups.size) {
            this.commit(next => { next.statusRefreshedDay = day; next.statusRefreshedAt = this.now(); });
            this.statusError = ''; return { changed, day };
          }
          for (const [status, ids] of groups) {
            if (this.isMaintenance()) throw failure('状态刷新已暂停，请稍后重试。', 503);
            const blocked = new Set(Object.values(this.state.operations).filter(op => op.status !== 'success').map(op => op.recordId));
            const ready = ids.filter(id => !blocked.has(id));
            for (let offset = 0; offset < ready.length; offset += 200) {
              const batch = ready.slice(offset, offset + 200);
              await this.cli('+record-batch-update', ['--json', JSON.stringify({ record_id_list: batch, patch: { [columns.status[0]]: status } })]);
              changed += batch.length;
            }
          }
          const fresh = [], ids = new Set(); let revision;
          for (let offset = 0, page = 0; page < 100; page++) {
            const result = await this.cli('+record-list', ['--limit', '200', '--offset', String(offset), ...projected.flatMap(name => ['--field-id', name])]);
            const rows = normalizeRows(result);
            if (revision !== undefined && revision !== result.rev) throw Error('状态校验期间源表发生变化。'); revision = result.rev;
            for (const row of rows) { if (ids.has(row.recordId)) throw Error('状态校验分页重复。'); ids.add(row.recordId); fresh.push(row); }
            if (!result.has_more) { this.commit(next => { next.records = fresh; next.updatedAt = this.now(); }); break; }
            if (!rows.length || page === 99) throw Error('状态校验未取得完整数据。'); offset += rows.length;
          }
        }
        const pending = new Set(Object.values(this.state.operations).filter(op => op.status !== 'success').map(op => op.recordId));
        if (this.state.records.some(row => !pending.has(row.recordId) && calculatedStatus(row, this.now()) && calculatedStatus(row, this.now()) !== text(row[columns.status[0]]))) throw Error('部分任务状态回读不一致。');
        this.commit(next => { next.statusRefreshedDay = day; next.statusRefreshedAt = this.now(); });
        this.statusError = ''; return { changed, day };
      });
    })();
    try { return await this.statusRefreshing; }
    catch (error) { this.statusRetryAt = this.now() + 60000; this.statusError = '任务状态刷新未完成，请重试同步。'; throw failure(this.statusError, error.status || 502); }
    finally { this.statusRefreshing = null; }
  }
  scheduleDailyStatus() {
    clearTimeout(this.dailyTimer);
    if (!this.timer) return;
    const needsRefresh = this.state.statusRefreshedDay !== chinaDay(this.now());
    this.dailyTimer = setTimeout(async () => {
      if (!this.timer) return;
      try { if (!this.isMaintenance() && this.state.statusRefreshedDay !== chinaDay(this.now())) await this.refreshStatuses(); }
      catch { console.error('Daily task status refresh incomplete; will retry.'); }
      finally { this.scheduleDailyStatus(); }
    }, needsRefresh ? Math.max(1000, (this.statusRetryAt || 0) - this.now()) : Math.max(20, nextChinaMidnight(this.now()) - this.now() + 20));
    this.dailyTimer.unref();
  }
  warm() { this.ensureIdentity(); if (!this.isMaintenance() && !this.refreshing && (!this.state.updatedAt || this.now() - this.state.updatedAt > 300000)) this.refresh().catch(() => {}); }
  accept(input, actor) {
    this.ensureIdentity();
    if (this.isMaintenance()) throw failure('系统正在更新，请稍后保存。', 503);
    if (!input || !/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(input.clientMutationId || '')) throw failure('提交标识无效。');
    const hash = digest([input.recordId, input.version, input.patch]), prior = this.state.operations[input.clientMutationId];
    if (prior) { if (prior.hash !== hash) throw failure('提交标识已用于其他内容。', 409); return this.accepted(prior); }
    if (!this.state.schema) throw failure('任务资料尚未就绪，请稍后重试。', 503);
    const record = this.currentRecords().map(publicRecord).find(r => r.id === input.recordId);
    if (!record) throw failure('任务不存在，请重新读取。', 404);
    if (Object.values(this.state.operations).some(op => op.recordId === record.id && op.status !== 'success')) throw failure('该任务仍有待同步修改，请先处理同步状态。', 409);
    if (record.version !== input.version) throw failure('任务已更新，请重新打开后修改。', 409);
    const patch = validatePatch(input.patch, record, this.state.schema, usersOf(this.state.records));
    if (Object.hasOwn(patch, 'feedback')) patch.feedback = appendFeedback(record.values.feedback, patch.feedback, actor, this.now());
    const op = { id: input.clientMutationId, hash, recordId: record.id, patch, before: Object.fromEntries(Object.keys(patch).map(key => [key, record.values[key]])), status: 'accepted', attempts: 0, nextAttempt: this.now(), updatedAt: this.now() };
    if (Object.hasOwn(patch, 'feedback')) op.editor = { name: actor.name, openId: actor.openId };
    this.commit(next => { next.operations[op.id] = op; });
    this.kick();
    return this.accepted(op);
  }
  accepted(op) { return { revision: this.state.revision || 0, operation: this.publicOperation(op), record: this.currentRecords().map(publicRecord).find(r => r.id === op.recordId), plan: this.plan() }; }
  retry(id) {
    const op = typeof id === 'string' && Object.hasOwn(this.state.operations, id) ? this.state.operations[id] : null;
    if (!op) throw failure('同步任务不存在。', 404);
    if (op.status === 'blocked') throw failure('源表存在冲突，请先核对源表再重新读取。', 409);
    if (op.status === 'error') this.commit(next => { Object.assign(next.operations[id], { status: 'accepted', error: '', nextAttempt: this.now(), updatedAt: this.now() }); });
    this.kick();
    return this.accepted(this.state.operations[id]);
  }
  discard(id) {
    const op = typeof id === 'string' && Object.hasOwn(this.state.operations, id) ? this.state.operations[id] : null;
    if (!op || op.status !== 'blocked') throw failure('只能撤回尚未写入的冲突修改。', 409);
    this.commit(next => { delete next.operations[id]; });
    return this.snapshot();
  }
  async flush() {
    this.ensureIdentity();
    if (this.flushing || this.isMaintenance()) return;
    this.flushing = this.serialize(async () => {
      const operations = Object.values(this.state.operations).filter(op => ['accepted', 'error', 'syncing'].includes(op.status) && op.nextAttempt <= this.now());
      for (const op of operations) {
        if (this.isMaintenance()) break;
        this.commit(next => { Object.assign(next.operations[op.id], { status: 'syncing', updatedAt: this.now() }); });
        let observed;
        try {
          const read = () => this.cli('+record-get', ['--record-id', op.recordId, ...projected.flatMap(name => ['--field-id', name])]);
          const remote = normalizeRows(await read())[0];
          observed = remote;
          if (!remote || remote.recordId !== op.recordId) throw failure('源任务已移除，未覆盖任何记录。', 409);
          const current = publicRecord(remote).values;
          for (const key of Object.keys(op.patch)) if (!same(current[key], op.before[key]) && !same(current[key], op.patch[key])) throw failure('源表同一字段已有修改，请核对后处理。', 409);
          const alreadyApplied = Object.keys(op.patch).every(key => same(current[key], op.patch[key]));
          if (!alreadyApplied) await this.cli('+record-upsert', ['--record-id', op.recordId, '--json', JSON.stringify(encodePatch(op.patch))]);
          const verified = alreadyApplied ? remote : normalizeRows(await read())[0], values = verified && publicRecord(verified).values;
          if (!verified || !Object.keys(op.patch).every(key => same(values[key], op.patch[key]))) throw Error('任务字段回读不一致。');
          this.commit(next => { next.records = next.records.map(row => row.recordId === op.recordId ? verified : row); Object.assign(next.operations[op.id], { status: 'success', error: '', updatedAt: this.now() }); });
        } catch (error) {
          this.commit(next => { if (error.status === 409 && observed) next.records = next.records.map(row => row.recordId === op.recordId ? observed : row); const task = next.operations[op.id]; task.status = error.status === 409 ? 'blocked' : 'error'; task.error = error.status === 409 ? error.message : '暂未同步到飞书，修改已保留，可重试。'; task.attempts++; task.nextAttempt = this.now() + Math.min(3600000, 10000 * 2 ** Math.min(task.attempts, 8)); task.updatedAt = this.now(); });
        }
      }
    });
    let completed = false;
    try { await this.flushing; completed = true; } finally { this.flushing = null; if (completed && Object.values(this.state.operations).some(op => op.status === 'accepted' && op.nextAttempt <= this.now())) this.kick(); }
  }
  kick() {
    if (!this.timer || this.wakeup || this.flushing) return;
    this.wakeup = setImmediate(() => { this.wakeup = null; this.flush().catch(() => { console.error('Task synchronization persistence failed; pending changes retained.'); }); });
  }
  start() { this.warm(); this.timer = setInterval(() => this.flush().catch(() => { console.error('Task synchronization persistence failed; pending changes retained.'); }), 2000); this.timer.unref(); this.kick(); this.scheduleDailyStatus(); }
  close() { clearInterval(this.timer); clearTimeout(this.dailyTimer); clearImmediate(this.wakeup); this.timer = null; this.wakeup = null; }
}
