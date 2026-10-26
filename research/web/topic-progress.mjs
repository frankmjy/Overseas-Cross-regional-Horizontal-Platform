export function topicProgress({ questions, findings, categories, companies }) {
  const selected = new Set(companies), entries = [...new Map(questions.map(q => [q.id, q])).values()], questionIds = new Set(entries.map(q => q.id));
  const recorded = new Set(findings.filter(f => f.hasMaterial && selected.has(f.company) && questionIds.has(f.questionId)).map(f => f.questionId));
  const topics = categories.map(name => {
    const rows = entries.filter(q => q.category === name), total = rows.length;
    const filled = rows.filter(q => recorded.has(q.id)).length;
    return { name, questions: rows.length, total, filled, percent: total && selected.size ? Math.round(filled / total * 100) : null };
  });
  const total = topics.reduce((sum, topic) => sum + topic.total, 0), filled = topics.reduce((sum, topic) => sum + topic.filled, 0);
  return { topics, total, filled, percent: total && selected.size ? Math.round(filled / total * 100) : null };
}
