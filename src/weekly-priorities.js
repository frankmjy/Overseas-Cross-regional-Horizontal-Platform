const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const validDate = value => /^\d{4}-\d\d-\d\d$/.test(value || '') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const add = (start, days) => new Date(Date.parse(`${start}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const short = date => date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8))}` : '待定';
import { validatePriorityResources } from './priority-resources.js';
export const priorityStatuses = ['待协调', '推进中', '已解决'];

export function priorityExamples(start) {
  if (!validDate(start)) throw Error('Invalid priority week');
  const samples = [
    ['卡点', '关键', '确认首批验收边界与交付口径', '客户接口人', '待协调', 2, '接维窗口', '客户与现场团队对验收材料的范围尚未完全一致。', '已整理三项口径差异，等待双方确认。', '组织一次专项确认，形成签字版清单。'],
    ['卡点', '关键', '锁定关键设备到货与替代方案', '采购负责人', '待协调', 3, '设备验证', '交付窗口较紧，需同步准备可行的替代方案。', '两家供应商已反馈，最终交期仍待确认。', '确认可承诺日期，并评估分批到货。'],
    ['重点', '重要', '协调跨专业验证的现场窗口', '现场统筹', '推进中', 4, '现场协同', '电气与暖通验证需共用作业面，窗口安排影响现场节奏。', '已完成初步排期，正在核对现场条件。', '确认人员、工具及作业许可清单。'],
    ['重点', '重要', '明确外包驻场与应急支援边界', '运维负责人', '推进中', 4, '服务保障', '日常驻场与紧急支援需要明确响应边界。', '服务范围已完成首轮讨论，待补充夜间响应。', '补齐响应时限与升级联系人。'],
    ['重点', '一般', '统一周报与会议行动项口径', '项目统筹', '推进中', 6, '团队协作', '多个团队使用不同模板，进展汇总容易遗漏。', '周报模板已收集，正在合并重复字段。', '确认统一模板并试运行一周。'],
    ['卡点', '重要', '落实测试期间的临时供电接口', '工程接口人', '已解决', 1, '现场条件', '测试准备需要明确临时供电接口及操作责任。', '接口位置与操作责任已完成双方确认。', '归档确认记录，纳入现场交底。'],
  ];
  return samples.map(([kind, urgency, title, owner, status, day, impact, description, progress, next], index) => ({ id: `priority-example-${index + 1}`, kind, urgency, title, owner, status, due: add(start, day), impact, description, progress, next, history: [] }));
}

export function validatePriority(values) {
  const item = Object.fromEntries(['title', 'owner', 'impact', 'description', 'progress', 'next', 'due', 'kind', 'urgency', 'status'].map(key => [key, String(values[key] || '').trim()]));
  item.planIds = [...new Set(Array.isArray(values.planIds) ? values.planIds : [])];
  if (item.planIds.length > 100 || item.planIds.some(id => !/^rec[a-zA-Z0-9]+$/.test(id))) throw Error('关联计划无效，请重新选择。');
  if (!item.title || item.title.length > 100) throw Error('请填写事项名称，最多 100 字。');
  if (!item.owner || item.owner.length > 60) throw Error('请填写责任人，最多 60 字。');
  if (!['重点', '卡点'].includes(item.kind) || !['关键', '重要', '一般'].includes(item.urgency) || !priorityStatuses.includes(item.status)) throw Error('请检查类别、重要程度和状态。');
  if (item.due && !validDate(item.due)) throw Error('请填写有效的目标日期。');
  if (['impact', 'description', 'progress', 'next'].some(key => item[key].length > 2000)) throw Error('单项内容不能超过 2000 字。');
  Object.assign(item, validatePriorityResources(values));
  return item;
}

export function savePriorityPreview(items, values, { id, time, allowedPlanIds } = {}) {
  const item = validatePriority(values), previous = items.find(row => row.id === id);
  if (allowedPlanIds && item.planIds.some(id => !allowedPlanIds.includes(id))) throw Error('请关联当前项目的有效计划。');
  if (!/^priority-(example|manual)-[a-zA-Z0-9-]+$/.test(id || '')) throw Error('Invalid priority identity');
  const history = [...(previous?.history || [])];
  if (item.progress && item.progress !== previous?.progress) history.push({ content: item.progress, time });
  const saved = { ...item, id, history };
  return previous ? items.map(row => row.id === id ? saved : row) : [saved, ...items];
}

export function priorityPage(items, { filter = 'all', query = '', page = 1 } = {}) {
  const text = query.trim().toLocaleLowerCase();
  const matches = items.filter(row => (filter === 'all' || row.status === filter || row.kind === filter) && (!text || [row.title, row.owner, row.progress, row.next, row.impact].some(value => String(value || '').toLocaleLowerCase().includes(text))));
  const pages = Math.max(1, Math.ceil(matches.length / 8)), current = Math.min(pages, Math.max(1, Number(page) || 1));
  return { total: matches.length, pages, current, rows: matches.slice((current - 1) * 8, current * 8) };
}

export function renderWeeklyPriorities(items, { filter = 'all', query = '', page = 1, plans = [], error = '', message = '', formal = false, snapshot = {} } = {}) {
  const counts = Object.fromEntries(priorityStatuses.map(status => [status, items.filter(row => row.status === status).length]));
  const listing = priorityPage(items, { filter, query, page });
  const linkedPlans = row => (row.planIds || []).map(id => plans.find(plan => plan.recordId === id)).filter(Boolean);
  return `<section class="weekly-priorities" id="weekly-focus"><header class="priority-heading"><div><h3>重点与卡点 ${formal ? '' : '<span class="priority-example">示例</span>'}</h3><span>${formal ? esc(snapshot.projectName || '') + ' · ' : ''}${items.length} 项独立事项</span></div><div class="priority-heading-actions">${formal ? `<button type="button" data-priority-refresh aria-label="刷新重点卡点">刷新</button>` : ''}<button type="button" class="priority-add" data-priority-new${formal && !snapshot.ready ? ' disabled' : ''}>＋ 新增事项</button></div></header>
    ${error ? `<p class="priority-error" role="alert">${esc(error)}</p>` : ''}${message ? `<p class="priority-message" role="status">${esc(message)}</p>` : ''}
    <div class="priority-summary">${priorityStatuses.map((status, index) => `<button type="button" data-priority-filter="${status}" class="priority-summary-item tone-${index}"><i></i><span>${status}</span><strong>${counts[status]}</strong><small>项</small></button>`).join('')}<div class="priority-mini-chart"><span>推进分布</span><div class="priority-status-bar" role="img" aria-label="${priorityStatuses.map(status => `${status}${counts[status]}项`).join('，')}">${priorityStatuses.map((status, index) => `<i class="tone-${index}" style="width:${items.length ? counts[status] / items.length * 100 : 0}%"></i>`).join('')}</div></div></div>
    <div class="priority-list-panel"><div class="priority-toolbar"><nav class="priority-filters" aria-label="事项筛选">${['all', '卡点', '重点', '已解决'].map(key => `<button type="button" data-priority-filter="${key}" aria-pressed="${filter === key}">${key === 'all' ? '全部事项' : key}</button>`).join('')}</nav><input class="priority-search" type="search" aria-label="搜索事项" placeholder="搜索事项、责任人或进展" value="${esc(query)}" data-priority-search></div>
    <div class="priority-table-scroll"><table class="priority-table"><thead><tr><th>事项</th><th>状态</th><th>责任人</th><th>目标日期</th><th>关联计划</th><th>最新进展</th><th></th></tr></thead><tbody>${listing.rows.map(row => `<tr class="priority-row"><td><button type="button" class="priority-title" data-priority-edit="${esc(row.id)}">${esc(row.title)}</button><small>${row.kind} · ${row.urgency}${row.impact ? ' · '+esc(row.impact) : ''}</small></td><td><span class="priority-state state-${priorityStatuses.indexOf(row.status)}">${row.status}</span></td><td>${esc(row.ownerName || row.owner)}</td><td><time>${short(row.due)}</time></td><td class="priority-linked">${linkedPlans(row).slice(0,2).map(plan => `<button type="button" data-priority-plan="${esc(plan.recordId)}" title="${esc(plan.title)}">${esc(plan.code)} · ${esc(plan.title)}</button>`).join('') || '—'}${linkedPlans(row).length > 2 ? `<button type="button" data-priority-edit="${esc(row.id)}">另 ${linkedPlans(row).length-2} 项</button>` : ''}</td><td><p class="priority-brief" title="${esc(row.progress)}">${esc(row.progress || '—')}</p>${formal && row.sync ? `<small class="priority-sync sync-${esc(row.sync.status)}">${esc(row.sync.status === 'success' ? '已同步' : row.sync.error || '后台同步中')}</small>${['error','waiting_upload'].includes(row.sync.status) ? `<button type="button" data-priority-retry="${esc(row.sync.id)}">重试</button>` : row.sync.status === 'blocked' ? `<button type="button" data-priority-retry="${esc(row.sync.id)}">重试核对</button> <button type="button" data-priority-discard="${esc(row.sync.id)}">放弃待同步修改</button>` : ''}` : ''}${row.attachments?.length || row.links?.length ? `<button type="button" class="priority-resource-count" data-priority-resources="${esc(row.id)}">附件 ${row.attachments?.length || 0} · 链接 ${row.links?.length || 0}</button>` : ''}</td><td><button type="button" class="priority-edit" data-priority-edit="${esc(row.id)}">编辑</button></td></tr>`).join('') || `<tr><td colspan="7" class="priority-empty">${formal && !snapshot.ready ? '正在读取事项…' : '当前筛选下暂无事项'}</td></tr>`}</tbody></table></div>
    <nav class="priority-pagination" aria-label="事项分页"><span>共 ${listing.total} 项</span><button type="button" data-priority-page="${listing.current-1}"${listing.current===1?' disabled':''}>上一页</button><span>${listing.current} / ${listing.pages}</span><button type="button" data-priority-page="${listing.current+1}"${listing.current===listing.pages?' disabled':''}>下一页</button></nav></div>
    <dialog class="priority-dialog" aria-labelledby="priorityDialogTitle"><form class="priority-form"><header><div>${formal ? '' : '<span class="priority-example">示例</span>'}<h3 id="priorityDialogTitle">新增事项</h3></div><button type="button" data-priority-close aria-label="关闭事项编辑">×</button></header><div class="priority-form-body"><label class="full">事项名称<input name="title" required maxlength="100"></label><div class="priority-form-grid"><label>类别<select name="kind"><option>重点</option><option>卡点</option></select></label><label>重要程度<select name="urgency"><option>重要</option><option>关键</option><option>一般</option></select></label><label>状态<select name="status">${priorityStatuses.map(status => `<option>${status}</option>`).join('')}</select></label><label>责任人${formal ? `<select name="owner" required><option value="">请选择</option>${(snapshot.people || []).map(person => `<option value="${esc(person.id)}">${esc(person.name)}</option>`).join('')}</select>` : '<input name="owner" required maxlength="60">'}</label><label>目标日期<input name="due" type="date"></label><label>影响范围${formal ? `<select name="impact" multiple>${(snapshot.impacts || []).map(value => `<option>${esc(value)}</option>`).join('')}</select>` : '<input name="impact" maxlength="2000">'}</label></div><fieldset class="priority-plan-picker"><legend>关联计划 <small data-priority-plan-count>已选 0 项</small></legend><input type="search" aria-label="搜索关联计划" placeholder="搜索计划编号或名称" data-priority-plan-search><div class="priority-plan-options">${plans.map(plan => `<label class="priority-plan-option"><input type="checkbox" name="planIds" value="${esc(plan.recordId)}"><span>${esc(plan.code)} · ${esc(plan.title)}</span></label>`).join('') || '<p>暂无可关联计划</p>'}</div></fieldset><label>事项描述<textarea name="description" rows="2" maxlength="2000"></textarea></label><label>最新进展<textarea name="progress" rows="3" maxlength="2000"></textarea></label><label>下一步<textarea name="next" rows="2" maxlength="2000"></textarea></label><section class="priority-resources"><header><h4>附件与链接</h4><label class="priority-file-add">＋ 添加附件<input type="file" multiple data-priority-files aria-label="添加附件"></label></header><p class="priority-resource-note">${formal ? '单个 20 MB，每项合计 50 MB。' : '示例文件保存在当前浏览器；单个 20 MB，每项合计 50 MB。'}</p><ul data-priority-resource-list></ul><div class="priority-link-entry"><label>链接名称<input data-priority-link-title maxlength="80" placeholder="选填"></label><label>网址<input data-priority-link-url type="url" maxlength="2000" placeholder="https://"></label><button type="button" data-priority-link-add>添加链接</button></div><p data-priority-resource-status role="status"></p></section><details><summary>跟进记录</summary><div data-priority-history></div></details></div><footer><span data-priority-form-status role="status"></span><button type="submit">${formal ? '保存' : '保存示例'}</button></footer></form></dialog></section>`;
}

export function priorityHistoryHtml(history) {
  return [...history].reverse().map(row => `<p><time>${row.sequence ? `${esc(row.sequence)} · ` : ''}${esc(row.time)}${row.editor ? ` · ${esc(row.editor)}` : ''}</time>${esc(row.content)}</p>`).join('') || '<p>暂无追加记录</p>';
}
