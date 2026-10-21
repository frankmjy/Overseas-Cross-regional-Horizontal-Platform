const text = value => Array.isArray(value) ? text(value[0]) : value == null ? '' : typeof value === 'object' ? value.text || value.name || '' : String(value);

// Durable outbox payloads remain the local record until Feishu acknowledges them.
export function projectLocalRecords(state, companies) {
  const raw = structuredClone(state.cache.raw), localFiles = [], topicSync = Object.create(null);
  const latest = new Map();
  const keyOf = p => p.kind === 'finding' ? `finding:${p.questionId}:${p.company}` : p.kind === 'question-visibility' ? `visibility:${p.questionId}` : p.kind === 'topic' ? `topic:${p.name}` : '';
  for (const op of Object.values(state.operations)) if (op.status !== 'retired' && keyOf(op.payload)) latest.set(keyOf(op.payload), op.id);
  for (const op of Object.values(state.operations)) {
    if (op.status === 'retired') continue;
    const p = op.payload, pending = op.status !== 'success';
    const sync = { operationId: op.id, status: op.status, error: op.error || '' };
    if(p.kind==='question-title'&&pending){const row=raw.questions.find(q=>text(q.问题编号)===p.questionId);if(row){row.问题列表=p.name;row.__sync=sync;}}
    if(p.kind==='topic-rename'&&pending){
      for(const row of raw.questions)if(text(row.一级分类)===p.oldName){row.一级分类=p.name;row.__sync=sync;}
      for(const row of raw.findings)if(text(row.一级分类)===p.oldName)row.一级分类=p.name;
      for(const row of raw.topics)if(text(row.专题名称)===p.oldName)row.专题名称=p.name;
      topicSync[p.name]=sync;
    }
    let qid = p.questionId;
    if (p.kind === 'topic' && pending && latest.get(keyOf(p)) === op.id) {
      if (!raw.topics.some(row => text(row.专题名称) === p.name)) raw.topics.push({ recordId: `local:${op.id}`, 专题名称: p.name });
      topicSync[p.name] = sync;
    }
    if (p.kind === 'question') {
      qid = `Q-${op.id.toUpperCase()}`;
      let q = raw.questions.find(row => text(row.问题编号) === qid);
      if (!q && pending) { q = { recordId: op.steps.question?.recordId || `local:${op.id}`, 问题编号: qid, 问题列表: p.title, 一级分类: p.category, 重点标记: p.priority, 适用范围: p.applicability || '本项目' }; raw.questions.unshift(q); }
      else if (q) { raw.questions.splice(raw.questions.indexOf(q), 1); raw.questions.unshift(q); }
      if (q && pending) {
        q.__sync = sync;
        for (const c of companies) if (!raw.findings.some(f => text(f.明细编号) === `${qid}:${c.name}`)) raw.findings.push({ recordId: `local:${op.id}:${c.code}`, 明细编号: `${qid}:${c.name}`, 关联问题: [{ id: q.recordId }], 调研对象: c.name, 调研内容: '', 举证原文: '' });
      }
    }
    const q = raw.questions.find(row => text(row.问题编号) === qid);
    if (!pending || !q) continue;
    if (p.kind === 'question-visibility' && latest.get(keyOf(p)) === op.id) { q.已删除 = p.deleted; q.__sync = sync; }
    if (p.kind === 'finding') {
      let f = raw.findings.find(row => text(row.明细编号) === `${qid}:${p.company}`);
      if (!f) { f = { recordId: `local:${op.id}`, 明细编号: `${qid}:${p.company}`, 关联问题: [{ id: q.recordId }], 调研对象: p.company }; raw.findings.push(f); }
      if (latest.get(keyOf(p)) === op.id) Object.assign(f, { 调研内容: p.content, 举证原文: p.proof, __sync: sync });
      q.__sync = sync;
      for (const id of p.uploadIds || []) {
        const file = state.uploads[id]; if (!file) continue;
        const remoteId = op.steps[`evidence:${id}`]?.recordId;
        if (raw.evidence.some(e => e.recordId === remoteId && e.附件?.some(a => a.name === file.name && a.size === file.size))) continue;
        localFiles.push({ ...file, questionId: qid, company: p.company, sync });
      }
    }
  }
  return { raw, localFiles, topicSync };
}
