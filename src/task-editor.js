const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
export function createTaskEditor({ onPlan, onOperations = () => {} } = {}) {
  const dialog = document.createElement('dialog'); dialog.className = 'task-editor'; dialog.setAttribute('aria-labelledby', 'taskEditorTitle'); document.body.append(dialog);
  const notice = document.createElement('div'); notice.className = 'task-save-notice'; notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite'); notice.hidden = true; document.body.append(notice);
  let cache = null, current = null, trigger = null, submission = null, submitting = false, draft = false, generation = 0, timer = null, refreshing = null, noticeTimer = null;
  function notify(message, recordId = '') {
    clearTimeout(noticeTimer); notice.hidden = false; notice.dataset.state = recordId ? 'error' : 'success';
    notice.innerHTML = `<span aria-hidden="true">${recordId ? '!' : '✓'}</span><span>${esc(message)}</span>${recordId ? `<button type="button" data-notice-task="${esc(recordId)}">查看</button>` : ''}<button type="button" data-notice-close aria-label="关闭提示">×</button>`;
    if (!recordId) noticeTimer = setTimeout(() => { notice.hidden = true; }, 3200);
  }
  notice.addEventListener('click', event => {
    if (event.target.closest('[data-notice-close]')) notice.hidden = true;
    const button = event.target.closest('[data-notice-task]'); if (button) { notice.hidden = true; open(button.dataset.noticeTask, null); }
  });
  const request = async (url, body) => {
    const response = await fetch(url, { ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' }), signal: AbortSignal.timeout(12000) });
    let result; try { result = await response.json(); } catch { throw Error('请求未完成，请重试。'); }
    if (!response.ok || !result.ok) throw Object.assign(Error(result.error || '请求未完成，请重试。'), { definitive: response.status < 500 });
    return result;
  };
  function status(message, kind = '') { const node = dialog.querySelector('[data-task-status]'); if (node) { node.textContent = message; node.dataset.state = kind; } }
  function controls() {
    const pending = current && operation(current.id);
    dialog.querySelectorAll('input,textarea,select').forEach(node => { node.disabled = submitting || !!pending || !!submission?.uncertain; });
    const save = dialog.querySelector('[data-task-save]'); if (save) { save.disabled = submitting || !!pending; save.textContent = submitting ? '保存中…' : submission?.uncertain ? '重试保存' : '保存'; }
    const close = dialog.querySelector('[data-task-close]'); if (close) close.disabled = submitting;
  }
  async function preload() {
    if (refreshing) return refreshing;
    refreshing = request('/api/project-tasks').then(result => { if ((result.revision || 0) >= (cache?.revision || 0)) cache = result; onOperations(cache.operations || []); return cache; }).finally(() => { refreshing = null; });
    return refreshing;
  }
  function operation(id) { return cache?.operations?.find(op => op.recordId === id && op.status !== 'success'); }
  function select(key, title) {
    const selected = current.values[key], field = cache.schema[key];
    return `<label>${title}<select name="${key}"><option value="">未填写</option>${field.options.map(value => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`;
  }
  const date = (key, label) => `<label>${label}<input type="date" name="${key}" value="${esc(current.values[key])}"></label>`;
  const area = (key, label, rows = 3, value = current.values[key]) => `<label>${label}<textarea name="${key}" rows="${rows}" maxlength="30000">${esc(value)}</textarea></label>`;
  function history() {
    const entries = current.feedbackHistory || [];
    return entries.length ? `<section class="task-followups"><h3>跟进记录 <span>${entries.length}</span></h3><ol>${[...entries].reverse().map(entry => `<li><header><b>${String(entry.sequence).padStart(3, '0')}</b>${entry.editor ? `<strong>${esc(entry.editor)}</strong>` : ''}${entry.time ? `<time>${esc(entry.time)}</time>` : ''}</header><p>${esc(entry.content)}</p></li>`).join('')}</ol></section>` : '';
  }
  function render() {
    const op = operation(current.id);
    const owner = current.values.owner[0] || '';
    dialog.innerHTML = `<form class="task-editor-form"><header class="task-editor-header"><div><span class="task-editor-code">${esc(current.code)}</span><h2 id="taskEditorTitle">编辑任务</h2></div><button type="button" class="task-editor-close" data-task-close aria-label="关闭任务编辑">${closeIcon}</button></header><div class="task-editor-body"><label class="task-title-field">任务详情<textarea name="title" rows="2" maxlength="2000" required>${esc(current.values.title)}</textarea></label><div class="task-editor-grid">${select('status', '项目进度')}${select('priority', '优先级')}<label class="task-owner-field">责任人<select name="owner"><option value="">未指定</option>${cache.users.map(user => `<option value="${esc(user.id)}"${user.id === owner ? ' selected' : ''}>${esc(user.name)}</option>`).join('')}</select></label>${date('start', '开始日期')}${date('due', '截止日期')}${date('actualCompletion', '实际完成日期')}</div>${area('feedback', '最新进展反馈', 3, current.latestFeedback ?? current.values.feedback)}<details class="task-editor-more"><summary>更多信息</summary>${history()}<div class="task-editor-grid">${select('stage', '团队组建阶段')}${select('construction', '现场建设阶段')}${select('milestone', '里程碑')}</div><fieldset class="task-participants"><legend>参与人</legend><input type="search" data-person-search placeholder="搜索已接入人员" aria-label="搜索参与人"><div class="task-person-options">${cache.users.map(user => `<label data-person-name="${esc(user.name)}"><input type="checkbox" name="participants" value="${esc(user.id)}"${current.values.participants.includes(user.id) ? ' checked' : ''}><span>${esc(user.name)}</span></label>`).join('')}</div></fieldset>${area('requirements', '交付要求')}${area('links', '交付物链接', 2)}</details>${op ? `<div class="task-sync-state" data-operation="${esc(op.id)}"><span>${esc(op.error || '修改已保存，后台同步中')}</span>${op.status === 'error' ? '<button type="button" data-task-retry>重试同步</button>' : op.status === 'blocked' ? '<button type="button" data-task-discard>放弃待同步修改</button>' : ''}</div>` : ''}</div><footer class="task-editor-footer"><span role="status" data-task-status></span><button class="task-editor-submit" type="submit" data-task-save${op ? ' disabled' : ''}>保存</button></footer></form>`;
    if (op) status(op.error || '已保存，后台同步中', op.status);
    draft = false; controls();
  }
  function shell(code = '') {
    dialog.innerHTML = `<header class="task-editor-header"><div><span class="task-editor-code">${esc(code)}</span><h2 id="taskEditorTitle">编辑任务</h2></div><button type="button" class="task-editor-close" data-task-close aria-label="关闭任务编辑">${closeIcon}</button></header><div class="task-editor-body task-editor-loading" role="status">正在读取任务…</div>`;
  }
  async function open(id, origin, code = '') {
    const token = ++generation; trigger = origin; current = null; submission = null; submitting = false; draft = false;
    shell(code); if (!dialog.open) dialog.showModal();
    try {
      if (!cache?.ready || !cache.records.some(r => r.id === id)) await preload();
      for (let n = 0; token === generation && !cache?.ready && n < 15; n++) { await new Promise(resolve => setTimeout(resolve, 1000)); await preload(); }
      if (token !== generation || !dialog.open) return;
      current = cache?.records?.find(r => r.id === id);
      if (!cache?.ready || !current) throw Error(cache?.error || '任务尚未就绪，请重试。');
      render(); dialog.querySelector('[name=title]').focus({ preventScroll: true });
    } catch (error) { if (token === generation && dialog.open) dialog.querySelector('.task-editor-body').innerHTML = `<p role="alert">${esc(error.message)}</p><button type="button" data-task-reopen data-record="${esc(id)}">重新读取</button>`; }
  }
  function close() {
    if (submitting) return;
    if (draft && !confirm('关闭并放弃尚未保存的修改？')) return;
    ++generation; dialog.close();
    const target = trigger?.isConnected ? trigger : current && document.querySelector(`.gantt-edit-name[data-edit-task="${CSS.escape(current.id)}"]`);
    target?.focus({ preventScroll: true });
  }
  function formValues() {
    const values = new FormData(dialog.querySelector('form'));
    return Object.fromEntries(Object.keys(current.values).map(key => [key, key === 'participants' ? values.getAll(key).sort() : key === 'owner' ? values.get(key) ? [values.get(key)] : [] : String(values.get(key) ?? '')]));
  }
  function startPolling() {
    if (timer) return;
    timer = setTimeout(async () => {
      timer = null;
      try {
        const result = await request('/api/project-tasks/status');
        if ((result.revision || 0) < (cache?.revision || 0)) { startPolling(); return; }
        const previous = cache, changed = result.revision !== previous?.revision;
        cache = result; onOperations(result.operations || []);
        if (result.plan && changed) onPlan(result.plan);
        for (const op of result.operations) {
          const prior = previous?.operations?.find(item => item.id === op.id);
          if (['error', 'blocked'].includes(op.status) && prior?.status !== op.status) notify('修改已保存，飞书同步待处理', op.recordId);
        }
        if (dialog.open && current) {
          const op = result.operations.filter(op => op.recordId === current.id).at(-1);
          if (op) {
            if (submission?.clientMutationId === op.id) {
              draft = false; current = result.records.find(r => r.id === current.id) || current;
              if (submission.uncertain && !submitting) { submission = null; close(); notify('修改已保存'); }
            }
            status(op.status === 'success' ? '已同步到多维表' : op.error || '已保存，后台同步中', op.status);
            if (op.status === 'success' && !draft && !submitting) { current = result.records.find(r => r.id === current.id) || current; submission = null; dialog.querySelector('.task-sync-state')?.remove(); }
            if (op.status !== 'success' && !dialog.querySelector('.task-sync-state')) dialog.querySelector('.task-editor-body').insertAdjacentHTML('beforeend', `<div class="task-sync-state" data-operation="${esc(op.id)}"><span>后台同步中</span></div>`);
            const state = dialog.querySelector('.task-sync-state');
            if (state && ['error', 'blocked'].includes(op.status) && !state.querySelector('button')) state.insertAdjacentHTML('beforeend', op.status === 'error' ? '<button type="button" data-task-retry>重试同步</button>' : '<button type="button" data-task-discard>放弃待同步修改</button>');
            controls();
          }
        }
        if (result.operations.some(op => ['accepted', 'syncing', 'error'].includes(op.status))) startPolling();
      } catch { if (dialog.open) status('状态暂未更新，后台任务已保留。', 'error'); startPolling(); }
    }, cache?.operations?.some(op => op.status === 'error') ? 5000 : 750);
  }
  dialog.addEventListener('submit', async event => {
    event.preventDefault(); if (submitting || !current) return;
    if (!submission) {
      const values = formValues(), patch = Object.fromEntries(Object.entries(values).filter(([key, value]) => !equal(value, key === 'feedback' ? current.latestFeedback ?? current.values.feedback : current.values[key])));
      if (!Object.keys(patch).length) { status('没有新的修改。'); return; }
      submission = { clientMutationId: crypto.randomUUID(), recordId: current.id, version: current.version, patch };
    }
    submitting = true; controls(); status('正在保存…', 'submitting');
    try {
      const { uncertain, ...payload } = submission;
      const result = await request('/api/project-tasks', payload);
      current = result.record; cache.revision = result.revision; cache.records = cache.records.map(r => r.id === current.id ? current : r);
      cache.operations = [...cache.operations.filter(op => op.id !== result.operation.id), result.operation];
      draft = false; onPlan(result.plan); onOperations(cache.operations);
      submitting = false; submission = null; close(); notify('修改已保存');
      startPolling();
    } catch (error) {
      if (error.definitive) submission = null;
      else { submission.uncertain = true; startPolling(); }
      status(error.message, 'error');
    }
    finally { submitting = false; controls(); if (operation(current.id)) dialog.querySelector('[data-task-save]').disabled = true; }
  });
  dialog.addEventListener('input', event => {
    if (event.target.hasAttribute('data-person-search')) {
      const query = event.target.value.trim().toLowerCase(); dialog.querySelectorAll('[data-person-name]').forEach(node => { node.hidden = !node.dataset.personName.toLowerCase().includes(query); }); return;
    }
    if (submitting || operation(current?.id)) return;
    draft = true; if (submission) { submission = null; } status('尚未保存');
  });
  dialog.addEventListener('click', async event => {
    if (event.target.closest('[data-task-close]')) close();
    const reopen = event.target.closest('[data-task-reopen]'); if (reopen) { cache = null; open(reopen.dataset.record, trigger); }
    const retry = event.target.closest('[data-task-retry]'), discard = event.target.closest('[data-task-discard]');
    if (!retry && !discard || submitting) return;
    const id = event.target.closest('[data-operation]').dataset.operation;
    if (discard && !confirm('放弃尚未同步的修改并重新读取？源表已生效的内容会保留。')) return;
    submitting = true; controls();
    try {
      const result = await request(`/api/project-tasks/${retry ? 'retry' : 'discard'}`, { id });
      if (result.plan) onPlan(result.plan);
      cache = await preload(); current = cache.records.find(r => r.id === current.id); submission = null; render(); if (retry) startPolling();
    } catch (error) { status(error.message, 'error'); } finally { submitting = false; controls(); if (operation(current.id)) dialog.querySelector('[data-task-save]').disabled = true; }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  preload().then(result => { if (result.operations.some(op => op.status !== 'success')) startPolling(); }).catch(() => {});
  return { open, close, preload, destroy() { clearTimeout(timer); clearTimeout(noticeTimer); ++generation; dialog.remove(); notice.remove(); } };
}
