import '/src/application-settings.js';
const params = new URLSearchParams(location.search);
const errors = { expired: '请重新登录。', unavailable: '登录失败，请重试。', storage: '登录失败，请稍后重试。' };
const status = document.querySelector('#loginStatus'), button = document.querySelector('#feishuLogin');
status.textContent = errors[params.get('error')] || '';
const returnTo = params.get('returnTo') || '/';
button.href = `/api/auth/feishu/authorize?returnTo=${encodeURIComponent(returnTo)}`;
// Remove transient feedback parameters without retaining any OAuth credentials.
history.replaceState(null, '', '/login' + (returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''));
let navigating = false, timer;
let loginEnabled = false;
button.addEventListener('click', event => {
  if (!loginEnabled) { event.preventDefault(); status.textContent = '暂时无法登录，请稍后重试。'; return; }
  if (navigating) { event.preventDefault(); return; }
  navigating = true; button.setAttribute('aria-disabled', 'true'); status.textContent = '';
  timer = setTimeout(() => { navigating = false; button.removeAttribute('aria-disabled'); status.textContent = '请重试登录。'; }, 12000);
});
addEventListener('pageshow', () => { clearTimeout(timer); navigating = false; if (loginEnabled) button.removeAttribute('aria-disabled'); });
try {
  const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '无法连接登录服务。');
  document.querySelector('[data-application-settings]').hidden = !data.canConfigure;
  loginEnabled = data.loginEnabled !== false;
} catch { loginEnabled = false; status.textContent = '暂时无法登录，请刷新重试。'; }
