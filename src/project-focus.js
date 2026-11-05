const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const civil = value => {
  if (!/^\d{4}-\d\d-\d\d$/.test(value || '')) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
};
const dayNumber = day => Date.parse(`${day}T00:00:00Z`) / 86400000;
const offsetDay = (day, offset) => new Date((dayNumber(day) + offset) * 86400000).toISOString().slice(0, 10);
const shortDate = date => date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8))}` : '未排期';
const latest = value => String(value || '').split(/^【跟进 \d+ · \d{4}-\d\d-\d\d \d\d:\d\d · [^\r\n【】]+】\r?\n/gm).at(-1).trim();

export function buildProjectFocus(plan, today, demo = false) {
  if (!civil(today)) throw Error('Invalid focus date');
  const items = (plan?.keyRows || []).filter(row => ['task', 'milestone'].includes(row.type)
    && !['已完成', '正常完成', '逾期完成'].includes(row.status) && Number(row.progress || 0) < 100)
    .map(row => {
      const due = civil(row.end), days = due ? dayNumber(due) - dayNumber(today) : null;
      const stuck = days !== null && days < 0, key = ['P0', 'P1'].includes(row.priority);
      return { ...row, recordId: demo ? '' : row.recordId || '', due, days, stuck, key,
        high: stuck && row.priority === 'P0', soon: days !== null && days >= 0 && days <= 7,
        phaseName: plan.phases?.find(phase => phase.tone === row.phase)?.short || row.phaseName || '未分组',
        feedback: latest(row.feedback), requirements: row.requirements || '', owner: row.owner || '',
      };
    }).filter(item => item.stuck || item.key)
    .sort((a, b) => Number(b.high) - Number(a.high) || Number(b.stuck) - Number(a.stuck)
      || (a.days ?? Infinity) - (b.days ?? Infinity) || a.code.localeCompare(b.code, 'zh-CN', { numeric: true }));
  const counts = { all: items.length, stuck: items.filter(item => item.stuck).length, key: items.filter(item => item.key).length,
    soon: items.filter(item => item.soon).length, high: items.filter(item => item.high).length };
  const stages = [...new Set(items.map(item => item.phase))].map(phase => {
    const rows = items.filter(item => item.phase === phase);
    return { name: rows[0].phaseName, total: rows.length, stuck: rows.filter(item => item.stuck).length, key: rows.filter(item => !item.stuck).length };
  });
  const buckets = [{ name: '已逾期', count: counts.stuck, tone: 'rose' }, { name: '7日内', count: counts.soon, tone: 'amber' },
    { name: '后续', count: items.filter(item => item.days !== null && item.days > 7).length, tone: 'blue' },
    { name: '未排期', count: items.filter(item => item.days === null).length, tone: 'slate' }];
  return { items, counts, stages, buckets, today, demo };
}

export function focusDemoRows(today) {
  const rows = [
    ['签证材料与入境批次对齐', 'P0', -3, 'blue', '合规筹备', '人力 / 法务', '首批外派人员补充材料仍待收齐，入境批次尚未锁定。', '首批人员到岗窗口存在压缩风险。', '核齐材料差异，确认补件人与递交时间。'],
    ['核心岗位到岗排期', 'P0', -1, 'amber', '核心骨干', '招聘负责人', '关键专业岗位仍有空缺，面试与到岗计划需并行推进。', '影响后续培训与交接安排。', '完成候选人复核，锁定备选和到岗日期。'],
    ['消防联动验收问题销项', 'P0', 2, 'indigo', '体系演练', '工程 / 运维', '联动测试发现的问题已整理，整改复验时间待确认。', '交接前需完成整改闭环。', '逐项确认整改责任，预约复验。'],
    ['首批值班班组培训', 'P1', 4, 'green', '基层招聘', '培训负责人', '培训排课已形成，实操考核与班组名单需对齐。', '需要保证班组能力覆盖。', '确认讲师、考核场景及补训安排。'],
    ['运行规程与应急预案评审', 'P1', 7, 'indigo', '体系演练', '技术负责人', '规程初稿完成，待各专业集中评审。', '确保接管前形成统一版本。', '收齐评审意见，发布修订版并组织宣贯。'],
    ['备品备件首批清单确认', 'P1', 12, 'blue', '合规筹备', '采购 / 技术', '首批备件需求已汇总，关键长周期件需优先确认。', '关注长周期备件采购窗口。', '核定库存与交期，确认采购批次。'],
  ];
  return rows.map(([title, priority, offset, phase, phaseName, owner, feedback, impact, action], index) => ({ type: 'task', code: `示例-${index + 1}`, title,
    priority, end: offsetDay(today, offset), phase, phaseName, owner, feedback, impact, action, status: '进行中' }));
}

function renderItem(item, demo, index, offset = 0) {
  const badge = item.high ? '高优逾期' : item.stuck ? '已逾期' : item.soon ? '近期到期' : '重点推进';
  const date = item.stuck ? `逾期 ${Math.abs(item.days)} 天` : item.days === 0 ? '今天到期' : item.due ? `${shortDate(item.due)} 截止` : '未排期';
  return `<details class="focus-item ${item.stuck ? 'is-stuck' : ''}"${index === 0 ? ' open' : ''}>
    <summary><span class="focus-item-mark">${String(index + offset + 1).padStart(2, '0')}</span><span class="focus-item-heading"><strong>${esc(item.title)}</strong><span>${esc(item.phaseName)}<i>·</i>${esc(item.code)}</span></span><span class="focus-badge ${item.stuck ? 'rose' : 'amber'}">${badge}</span><span class="focus-chevron" aria-hidden="true">⌄</span></summary>
    <div class="focus-item-detail">
      ${item.feedback ? `<p class="focus-followup">${esc(item.feedback)}</p>` : ''}
      ${item.impact ? `<p><b>影响</b>${esc(item.impact)}</p>` : ''}${item.action ? `<p><b>下一步</b>${esc(item.action)}</p>` : ''}
      ${item.requirements ? `<p><b>交付要求</b>${esc(item.requirements)}</p>` : ''}
      <footer><span>${esc(item.owner || '责任人待定')}</span><time class="${item.stuck ? 'is-late' : ''}">${date}</time>
        ${!demo && item.recordId ? `<button type="button" data-focus-task="${esc(item.recordId)}">查看任务 <span aria-hidden="true">↗</span></button>` : ''}</footer>
    </div></details>`;
}

export function renderProjectFocus(model, { mode = 'live', filter = 'all', projectName = '', page = 1 } = {}) {
  const { counts, stages, buckets, today, demo } = model;
  const items = model.items.filter(item => filter === 'all' || item[filter]);
  const pageCount = Math.max(1, Math.ceil(items.length / 8));
  const currentPage = Math.max(1, Math.min(pageCount, Number(page) || 1));
  const visibleItems = items.slice((currentPage - 1) * 8, currentPage * 8);
  const maxStage = Math.max(1, ...stages.map(stage => stage.total));
  const upcoming = model.items.filter(item => item.days !== null && item.days >= 0).slice(0, 4);
  const filters = [['all', '全部'], ['stuck', '关键卡点'], ['key', '重点推进'], ['soon', '7日到期']];
  return `<div class="project-focus">
    <header class="focus-header"><div><span class="focus-project">${esc(projectName)}${demo ? ' · 演示数据' : ''}</span><h3 id="detailModalTitle">项目攻坚</h3></div>
      <div class="focus-mode" aria-label="数据视图"><button type="button" data-focus-mode="live" aria-pressed="${mode === 'live'}">项目数据</button><button type="button" data-focus-mode="demo" aria-pressed="${mode === 'demo'}">示例演示</button></div></header>
    ${demo ? '<div class="focus-demo-note" role="status">演示数据 · 仅用于展示，不计入项目统计</div>' : ''}
    <div class="focus-overview">
      <div class="focus-total"><span>待攻坚</span><strong>${counts.all}<small>项</small></strong></div>
      <div class="focus-stat rose"><span>关键卡点</span><strong>${counts.stuck}<small>项</small></strong><span>其中高优逾期 ${counts.high} 项</span></div>
      <div class="focus-stat amber"><span>重点推进</span><strong>${counts.key}<small>项</small></strong><span>未完成 P0 / P1</span></div>
      <div class="focus-window"><div><span>时间分布</span><time>${shortDate(today)} 更新</time></div><div class="focus-stack" role="img" aria-label="${buckets.map(bucket => `${bucket.name}${bucket.count}项`).join('，')}">${buckets.map(bucket => `<i class="${bucket.tone}" style="width:${counts.all ? bucket.count / counts.all * 100 : 0}%"></i>`).join('')}</div><div class="focus-legend">${buckets.map(bucket => `<span><i class="${bucket.tone}"></i>${bucket.name}<b>${bucket.count}</b></span>`).join('')}</div></div>
    </div>
    <div class="focus-layout"><section class="focus-main"><div class="focus-tabs" aria-label="攻坚事项筛选">${filters.map(([key, label]) => `<button type="button" data-focus-filter="${key}" aria-pressed="${filter === key}">${label}<span>${counts[key]}</span></button>`).join('')}</div>
      <div class="focus-results" aria-live="polite"><div class="focus-list-heading"><h4>${filters.find(([key]) => key === filter)?.[1] || '全部'}<span>${items.length} 项</span></h4><span>逾期优先 · 按截止日期</span></div>
      ${items.length ? visibleItems.map((item, index) => renderItem(item, demo, index, (currentPage - 1) * 8)).join('') : `<div class="focus-empty"><span aria-hidden="true">✓</span><h4>${counts.all ? '当前筛选下暂无事项' : '暂无待攻坚事项'}</h4></div>`}
      ${pageCount > 1 ? `<nav class="focus-pagination" aria-label="攻坚清单分页"><button type="button" data-focus-page="${currentPage - 1}"${currentPage === 1 ? ' disabled' : ''}>上一页</button><span>${currentPage} / ${pageCount}</span><button type="button" data-focus-page="${currentPage + 1}"${currentPage === pageCount ? ' disabled' : ''}>下一页</button></nav>` : ''}</div></section>
    <aside class="focus-aside"><section class="focus-chart"><h4>阶段分布<span>${stages.length} 个阶段</span></h4><div class="focus-chart-legend"><span><i class="rose"></i>关键卡点</span><span><i class="blue"></i>其他重点</span></div>
      ${stages.map(stage => `<div class="focus-stage"><div><span>${esc(stage.name)}</span><b>${stage.total}</b></div><div class="focus-stage-track" role="img" aria-label="${esc(stage.name)}：关键卡点${stage.stuck}项，其他重点${stage.key}项"><i class="rose" style="width:${stage.stuck / maxStage * 100}%"></i><i class="blue" style="width:${stage.key / maxStage * 100}%"></i></div></div>`).join('') || '<p class="focus-muted">暂无阶段数据</p>'}</section>
      <section class="focus-deadlines"><h4>近期节点<span>${upcoming.length} 项</span></h4>${upcoming.map(item => `<div class="focus-deadline"><time>${shortDate(item.due)}<small>${item.days === 0 ? '今天' : `${item.days}天后`}</small></time><div><strong>${esc(item.title)}</strong><span>${esc(item.phaseName)}</span></div></div>`).join('') || '<p class="focus-muted">暂无已排期节点</p>'}</section>
    </aside></div></div>`;
}
