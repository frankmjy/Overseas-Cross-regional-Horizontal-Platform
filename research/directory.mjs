const text = value => Array.isArray(value) ? text(value[0]) : value == null ? '' : typeof value === 'object' ? value.text || value.name || '' : String(value);

export function researchDirectory(rows, topics) {
  const sourceRow = q => /[?&]sheet=wwLsaC(?:&|\)|$)/.test(text(q.源表链接)) && Number(q.源行号) > 0 ? Number(q.源行号) : Infinity;
  const rank = q => q.__sync && q.__sync.status !== 'success' ? 0 : Number.isFinite(sourceRow(q)) ? 1 : 2;
  const questions = [...rows].sort((a, b) => rank(a) - rank(b) || (Number.isFinite(sourceRow(a)) && Number.isFinite(sourceRow(b)) ? sourceRow(a) - sourceRow(b) : 0));
  const active = questions.filter(q => q.已删除 !== true && text(q.问题列表));
  const categories = [...new Set([
    ...active.map(q => text(q.一级分类) || '待确认分类'),
    ...topics.filter(t => !text(t.迁移键).startsWith('init:')).map(t => text(t.专题名称)),
  ].filter(Boolean))];
  return { questions, categories };
}
