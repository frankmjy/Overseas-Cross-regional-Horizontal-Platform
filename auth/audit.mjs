import { BaseAdapter } from '../research/adapter.mjs';
import { normalizeRows } from '../research/service.mjs';

export const auditFields = {
  id: 'Login ID（登录编号）', account: 'Feishu Account（飞书账号）', name: 'Full Name（姓名）', openId: 'Open ID（飞书用户标识）',
  login: 'Login Time（登录时间）', logout: 'Logout Time（退出时间）', entry: 'Entry Page（进入页面）', method: 'Login Method（登录方式）',
};
const text = v => Array.isArray(v) ? v.map(text).join('') : v == null ? '' : typeof v === 'object' ? v.text || v.name || '' : String(v);
const date = iso => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
const instant = value => {
  const v = text(value);
  if (/^\d{13}$/.test(v)) return Number(v);
  return Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d/.test(v) ? `${v.replace(' ', 'T')}+08:00` : v);
};
export class LoginAuditSink {
  constructor(config, adapter = new BaseAdapter(config)) { this.config = config; this.adapter = adapter; }
  async sync(event) {
    const tableId = this.config.tableId;
    if (!/^tbl[\w]+$/.test(tableId)) throw Error('登录记录表尚未配置。');
    const cli = (command, args) => this.adapter.cli(command, ['--table-id', tableId, ...args, ...(command === '+record-upsert' ? [] : ['--format', 'json'])]);
    const search = { keyword: event.id, search_fields: [auditFields.id], select_fields: [auditFields.id], limit: 2 };
    const found = await cli('+record-search', ['--json', JSON.stringify(search)]);
    if (found.has_more) throw Error('登录编号查询不完整，请核对后重试。');
    const rows = normalizeRows(found).filter(row => text(row[auditFields.id]) === event.id);
    if (rows.length > 1) throw Error('登录编号存在重复记录，请核对后重试。');
    let recordId = rows[0]?.recordId;
    const fields = {
      [auditFields.id]: event.id, [auditFields.account]: [{ id: event.user.openId }], [auditFields.name]: event.user.name,
      [auditFields.openId]: event.user.openId, [auditFields.login]: date(event.loginTime), [auditFields.entry]: event.entryPage,
      [auditFields.method]: event.method, ...(event.logoutTime ? { [auditFields.logout]: date(event.logoutTime) } : {}),
    };
    const result = await cli('+record-upsert', [...(recordId ? ['--record-id', recordId] : []), '--json', JSON.stringify(fields)]);
    recordId ||= result.record?.record_id_list?.[0];
    if (!recordId) throw Error('登录记录写入结果不明确，将先查询再重试。');
    const readback = normalizeRows(await cli('+record-get', ['--record-id', recordId]));
    const row = readback[0], account = row?.[auditFields.account];
    if (!row || text(row[auditFields.id]) !== event.id || text(row[auditFields.name]) !== event.user.name || text(row[auditFields.openId]) !== event.user.openId || !Array.isArray(account) || !account.some(value => (value.id || value.open_id) === event.user.openId) || instant(row[auditFields.login]) !== Math.floor(Date.parse(event.loginTime) / 1000) * 1000 || event.logoutTime && instant(row[auditFields.logout]) !== Math.floor(Date.parse(event.logoutTime) / 1000) * 1000 || text(row[auditFields.entry]) !== event.entryPage || text(row[auditFields.method]) !== event.method) throw Error('登录记录回读尚未一致，任务已保留。');
    return recordId;
  }
}
