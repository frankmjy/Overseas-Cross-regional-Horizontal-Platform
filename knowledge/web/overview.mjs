const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = value => /[（(]([^）)]+)[）)]/.exec(value)?.[1] || value;
const colors = ['#4566d9', '#22a28d', '#d9a456', '#849bc7', '#94a3b8'];
export function summarizeLibrary(records, categories, now = new Date()) {
  const total = records.length;
  const groups = categories.map((c, i) => ({ id: c.id, name: label(c.name), count: records.filter(r => r.category === c.id).length, color: colors[i % colors.length] }));
  const specialty = new Map();
  for (const row of records) if (row.specialty) specialty.set(row.specialty, (specialty.get(row.specialty) || 0) + 1);
  const ranked = [...specialty].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
  const current = new Date(Number(now) + 8 * 3600000), months = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - i, 1)), key = date.toISOString().slice(0, 7);
    months.push({ key, label: `${date.getUTCMonth() + 1}月`, count: records.filter(row => row.date?.startsWith(key)).length });
  }
  return { total, groups, ranked, unclassified: total - ranked.reduce((n, r) => n + r.count, 0), linked: records.filter(r => r.links?.length).length, dated: records.filter(r => r.date).length, months };
}
export function renderLibraryOverview(records, categories, sources, state = {}) {
  if (state.loading) return `<section class="knowledge-overview" aria-label="知识资料总览" aria-busy="true">${['资料全景','分类构成','专业分布','分享记录'].map(title=>`<article class="overview-placeholder"><h2>${title}</h2><b>—</b><i></i><i></i></article>`).join('')}</section>`;
  const m = summarizeLibrary(records, categories), maxSpecialty = Math.max(1, ...m.ranked.map(r => r.count)), maxMonth = Math.max(1, ...m.months.map(r => r.count));
  let accumulated = 0;
  const slices = m.groups.map(g => { const start = accumulated; accumulated += m.total ? g.count / m.total * 100 : 0; return `${g.color} ${start}% ${accumulated}%`; });
  if (accumulated < 100) slices.push(`#e9eef6 ${accumulated}% 100%`);
  const datedInRange = m.months.reduce((n, r) => n + r.count, 0);
  return `<section class="knowledge-overview" aria-label="知识资料总览"><article class="overview-total"><header>资料全景<span>海外运维指南</span></header><div class="overview-number">${m.total.toLocaleString('zh-CN')}<span>条资料</span></div><footer><div><b>${sources.filter(s => s.kind !== 'meeting').length}</b><span>来源表</span></div><div><b>${m.linked}</b><span>含资料链接</span></div></footer></article><article class="overview-chart overview-composition"><header><h2>分类构成</h2><span>${m.groups.length} 类</span></header><div class="composition-body"><div class="category-donut" role="img" aria-label="${esc(m.groups.map(g => `${g.name}${g.count}条`).join('，'))}" style="--segments:${slices.join(',')}"><div><b>${m.total}</b><span>资料条目</span></div></div><div class="chart-legend">${m.groups.map(g => `<button type="button" data-category="${esc(g.id)}" aria-pressed="${state.category === g.id}"><i style="--series:${g.color}"></i><span>${esc(g.name)}</span><b>${g.count}</b></button>`).join('')}</div></div></article><article class="overview-chart overview-specialties"><header><h2>专业分布</h2><span>${m.ranked.length} 个专业</span></header><div class="specialty-bars">${m.ranked.slice(0, 5).map((r, i) => `<button type="button" data-specialty="${esc(r.name)}" aria-pressed="${state.specialty === r.name}"><span>${esc(r.name)}</span><i><b style="width:${r.count / maxSpecialty * 100}%;--series:${colors[i % colors.length]}"></b></i><strong>${r.count}</strong></button>`).join('') || '<span class="chart-empty">暂无专业记录</span>'}</div><footer>未标专业 <b>${m.unclassified}</b></footer></article><article class="overview-chart overview-sharing"><header><h2>分享记录</h2><span>近 6 个月</span></header><div class="sharing-total"><b>${datedInRange}</b><span>条</span><small>已标日期 ${m.dated}</small></div><div class="sharing-bars" role="img" aria-label="${esc(m.months.map(r => `${r.key}，${r.count}条`).join('；'))}">${m.months.map(r => `<div><b>${r.count}</b><i style="--bar-height:${r.count / maxMonth * 100}%"></i><span>${r.label}</span></div>`).join('')}</div></article></section>`;
}
