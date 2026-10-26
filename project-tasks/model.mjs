import { createHash } from 'node:crypto';

export const columns = {
  title: ['Task Description（任务详情）', 'text'],
  stage: ['Team Setup Phase（团队组建小阶段）', 'select'],
  construction: ['Construction Stage（现场建设项目阶段）', 'select'],
  owner: ['Owner（责任人）', 'user'], participants: ['Participants（参与人）', 'user'],
  start: ['Start Time（开始时间）', 'datetime'], due: ['Due Time（截止时间）', 'datetime'],
  actualCompletion: ['Actual Completion（实际完成时间）', 'datetime'],
  status: ['Project Status（项目进度）', 'select'], priority: ['Priority（优先级）', 'select'],
  milestone: ['Milestone（里程碑）', 'select'], feedback: ['Latest Feedback（最新进展反馈）', 'text'],
  requirements: ['Deliverable Requirements（交付物&备注）', 'text'], links: ['交付物-链接', 'text'],
};
export const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.text ?? value.name ?? '') : String(value ?? '');
export function civilDate(value) {
  const raw = text(value), match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const serial = Number(raw);
  return raw && Number.isFinite(serial) && serial > 0 && serial < 300000 ? new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10) : '';
}
export function semantic(type, value) {
  if (type === 'datetime') return civilDate(value);
  if (type === 'user') return (Array.isArray(value) ? value : []).map(u => u.id || u.open_id).filter(Boolean).sort();
  return text(value);
}
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function valuesOf(raw) { return Object.fromEntries(Object.entries(columns).map(([key, [name, type]]) => [key, semantic(type, raw[name])])); }
const feedbackHeader = /^【跟进 (\d+) · (\d{4}-\d\d-\d\d \d\d:\d\d) · ([^\r\n【】]+)】\r?$/gm;
export function feedbackHistory(value) {
  const raw = text(value), matches = [...raw.matchAll(feedbackHeader)], entries = [];
  const legacy = (matches.length ? raw.slice(0, matches[0].index) : raw).trim();
  if (legacy) entries.push({ sequence: 1, time: '', editor: '', content: legacy });
  for (const [index, match] of matches.entries()) entries.push({ sequence: Number(match[1]), time: match[2], editor: match[3], content: raw.slice(match.index + match[0].length, matches[index + 1]?.index ?? raw.length).trim() });
  return entries;
}
export function appendFeedback(previous, content, actor, now) {
  if (!actor || !/^ou_[\w-]+$/.test(actor.openId || '') || !actor.name?.trim()) throw failure('请使用飞书登录后填写进展。', 401);
  if (!content.trim()) throw failure('请填写进展内容。');
  if ([...content.matchAll(feedbackHeader)].length) throw failure('进展内容不能包含系统跟进标题。');
  const history = feedbackHistory(previous), sequence = Math.max(0, ...history.map(entry => entry.sequence)) + 1;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  const time = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  const name = actor.name.replace(/[\r\n【】]/g, ' ').trim().slice(0, 100);
  const result = `${previous}${previous ? '\n\n' : ''}【跟进 ${String(sequence).padStart(3, '0')} · ${time} · ${name}】\n${content.trim()}`;
  if (result.length > 30000) throw failure('跟进历史已达到字段容量，请整理后继续。');
  return result;
}
export function publicRecord(raw) {
  const values = valuesOf(raw), history = feedbackHistory(values.feedback);
  return { id: raw.recordId, code: text(raw['Task Code（任务编号）']), values, version: digest(values), latestFeedback: history.at(-1)?.content || '', feedbackHistory: history };
}
export function schemaOf(fields) {
  return Object.fromEntries(Object.entries(columns).map(([key, [name, type]]) => {
    const field = fields.find(f => f.name === name);
    if (!field || field.type !== type) throw Error(`任务字段配置不匹配：${name}`);
    return [key, { name, type, multiple: !!field.multiple, options: (field.options || []).map(o => o.name) }];
  }));
}
export function usersOf(records) {
  const users = new Map();
  for (const row of records) for (const key of ['owner', 'participants']) for (const user of row[columns[key][0]] || []) {
    const id = user.id || user.open_id;
    if (/^ou_[\w-]+$/.test(id)) users.set(id, { id, name: text(user.name) || '未命名账号' });
  }
  return [...users.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}
export const failure = (message, status = 400) => Object.assign(new Error(message), { status });
export function validatePatch(patch, record, schema, users) {
  if (!patch || Array.isArray(patch) || typeof patch !== 'object' || !Object.keys(patch).length) throw failure('没有可保存的修改。');
  const knownUsers = new Set(users.map(u => u.id)), result = {};
  for (const [key, value] of Object.entries(patch)) {
    const field = schema[key];
    if (!Object.hasOwn(columns, key) || !field) throw failure('包含不可编辑的字段。');
    if (field.type === 'user') {
      if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !knownUsers.has(id)) || value.length > (field.multiple ? 100 : 1) || new Set(value).size !== value.length) throw failure('请从飞书账号列表选择人员。');
      result[key] = [...value].sort();
    } else {
      if (typeof value !== 'string' || value.length > (key === 'title' ? 2000 : 30000)) throw failure('字段内容过长或格式不正确。');
      if (field.type === 'select' && value && !field.options.includes(value)) throw failure('选项已变更，请重新读取任务。');
      if (field.type === 'datetime' && value && (!/^\d{4}-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw failure('日期格式不正确。');
      result[key] = value;
    }
  }
  const next = { ...record.values, ...result };
  if (!next.title.trim()) throw failure('任务详情不能为空。');
  if (next.start && next.due && next.due < next.start) throw failure('截止日期不能早于开始日期。');
  return result;
}
export function encodePatch(patch) {
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => {
    const [name, type] = columns[key];
    return [name, type === 'user' ? value.map(id => ({ id })) : type === 'datetime' ? value ? `${value} 00:00:00` : null : type === 'select' ? value || null : value];
  }));
}
