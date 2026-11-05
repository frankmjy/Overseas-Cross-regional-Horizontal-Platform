import '/src/application-settings.js';
const params = new URLSearchParams(location.search);
const errors = { expired: '请重新登录。', unavailable: '登录失败，请重试。', storage: '登录失败，请稍后重试。' };
const status = document.querySelector('#loginStatus'), button = document.querySelector('#feishuLogin');
const project = document.querySelector('#loginProject');
const retry = document.querySelector('#loginRetry'), panel = document.querySelector('#loginPanel');
status.textContent = errors[params.get('error')] || '';
const returnTo = params.get('returnTo') || '/project-management';
function updateLogin() {
  button.href = '/api/auth/feishu/authorize?' + new URLSearchParams({ project: project.value, returnTo });
  button.setAttribute('aria-disabled', String(!loginEnabled || !project.value || navigating));
}
// Remove transient feedback parameters without retaining any OAuth credentials.
const clean = new URLSearchParams(); if (params.has('returnTo') && returnTo !== '/') clean.set('returnTo', returnTo); if (params.get('selectProject') === '1') clean.set('selectProject', '1');
history.replaceState(null, '', '/login' + (clean.size ? '?' + clean : ''));
let navigating = false, timer;
let loginEnabled = false;
button.addEventListener('click', event => {
  if (!project.value) { event.preventDefault(); status.textContent = '请选择项目。'; project.focus(); return; }
  if (!loginEnabled) { event.preventDefault(); status.textContent = '暂时无法登录，请稍后重试。'; return; }
  if (navigating) { event.preventDefault(); return; }
  navigating = true; button.setAttribute('aria-disabled', 'true'); status.textContent = '';
  timer = setTimeout(() => { navigating = false; updateLogin(); status.textContent = '请重试登录。'; }, 12000);
});
project.addEventListener('change', () => { status.textContent = ''; updateLogin(); });
addEventListener('pageshow', () => { clearTimeout(timer); navigating = false; updateLogin(); });
async function loadSession() {
 if (panel.dataset.state === 'loading') return;
 const selected = project.value;
 panel.dataset.state = 'loading'; loginEnabled = false; project.disabled = true; retry.hidden = true; status.textContent = '';
 project.replaceChildren(new Option('读取项目…', '')); project.setAttribute('aria-busy', 'true'); updateLogin();
 try {
  const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '无法连接登录服务。');
  document.querySelector('[data-application-settings]').hidden = !data.canConfigure;
  if (!Array.isArray(data.projects) || !data.projects.length) throw Error('项目列表不可用。');
  project.replaceChildren(new Option('选择项目', ''), ...data.projects.map(item => new Option(item.name, item.id)));
  const requested = selected || params.get('project') || data.project?.id;
  project.value = data.projects.some(item => item.id === requested) ? requested : '';
  project.disabled = false;
  loginEnabled = data.loginEnabled !== false;
  panel.dataset.state = loginEnabled ? 'ready' : 'unavailable';
  status.textContent = loginEnabled ? errors[params.get('error')] || '' : '飞书登录未启用。';
  retry.hidden = loginEnabled;
  updateLogin();
 } catch { loginEnabled = false; panel.dataset.state = 'error'; project.replaceChildren(new Option('项目加载失败', '')); project.disabled = true; retry.hidden = false; updateLogin(); status.textContent = '项目读取失败。'; }
 finally { project.setAttribute('aria-busy', 'false'); }
}
retry.addEventListener('click', loadSession);
await loadSession();
