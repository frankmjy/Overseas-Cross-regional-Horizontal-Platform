import '/src/application-settings.js';
const params = new URLSearchParams(location.search);
const errors = { expired: '请重新登录。', unavailable: '登录失败，请重试。', storage: '登录失败，请稍后重试。' };
const status = document.querySelector('#loginStatus'), button = document.querySelector('#feishuLogin');
const projects = document.querySelector('#loginProject');
const retry = document.querySelector('#loginRetry'), panel = document.querySelector('#loginPanel');
const projectCodes = new Map([['th-001', 'THA-ARAYA'], ['my-001', 'MSA-KULAI']]);
status.textContent = errors[params.get('error')] || '';
const returnTo = params.get('returnTo') || '/project-management';
function updateLogin() {
  button.href = '/api/auth/feishu/authorize?' + new URLSearchParams({ project: selectedProject, returnTo });
  button.setAttribute('aria-disabled', String(!loginEnabled || !selectedProject || navigating));
}
// Remove transient feedback parameters without retaining any OAuth credentials.
const clean = new URLSearchParams(); if (params.has('returnTo') && returnTo !== '/') clean.set('returnTo', returnTo); if (params.get('selectProject') === '1') clean.set('selectProject', '1');
history.replaceState(null, '', '/login' + (clean.size ? '?' + clean : ''));
let navigating = false, timer;
let loginEnabled = false, selectedProject = '';
button.addEventListener('click', event => {
  if (!selectedProject) {
    event.preventDefault();
    if (!projects.disabled) {
      status.textContent = '请选择项目。';
      projects.querySelector('input')?.focus();
    }
    return;
  }
  if (!loginEnabled) { event.preventDefault(); status.textContent = '暂时无法登录，请稍后重试。'; return; }
  if (navigating) { event.preventDefault(); return; }
  navigating = true; button.setAttribute('aria-disabled', 'true'); status.textContent = '';
  timer = setTimeout(() => { navigating = false; updateLogin(); status.textContent = '请重试登录。'; }, 12000);
});
projects.addEventListener('change', ({ target }) => {
  if (projects.disabled || target.name !== 'login-project' || !target.checked) return;
  selectedProject = target.value;
  status.textContent = '';
  updateLogin();
});
addEventListener('pageshow', () => { clearTimeout(timer); navigating = false; updateLogin(); });

function projectOption({ id, name }) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  const code = document.createElement('span');
  input.type = 'radio';
  input.name = 'login-project';
  input.value = id;
  input.checked = id === selectedProject;
  code.lang = 'en';
  code.setAttribute('translate', 'no');
  code.textContent = projectCodes.get(id) ?? id.toUpperCase();
  label.title = name;
  label.append(input, code);
  return label;
}

async function loadSession() {
 if (panel.dataset.state === 'loading') return;
 panel.dataset.state = 'loading'; loginEnabled = false; projects.disabled = true; retry.hidden = true; status.textContent = '读取项目…';
 projects.setAttribute('aria-busy', 'true'); updateLogin();
 try {
  const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '无法连接登录服务。');
  document.querySelector('[data-application-settings]').hidden = !data.canConfigure;
  if (!Array.isArray(data.projects) || !data.projects.length) throw Error('项目列表不可用。');
  const requested = selectedProject || params.get('project') || data.project?.id;
  selectedProject = data.projects.some(item => item.id === requested) ? requested : '';
  projects.replaceChildren(...data.projects.map(projectOption));
  projects.disabled = false;
  loginEnabled = data.loginEnabled !== false;
  panel.dataset.state = loginEnabled ? 'ready' : 'unavailable';
  status.textContent = loginEnabled ? errors[params.get('error')] || '' : '飞书登录未启用。';
  retry.hidden = loginEnabled;
  updateLogin();
 } catch { loginEnabled = false; panel.dataset.state = 'error'; projects.replaceChildren(); projects.disabled = true; retry.hidden = false; updateLogin(); status.textContent = '项目读取失败。'; }
 finally { projects.setAttribute('aria-busy', 'false'); }
}
retry.addEventListener('click', loadSession);
await loadSession();
