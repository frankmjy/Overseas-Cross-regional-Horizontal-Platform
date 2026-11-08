import { projectById } from './project-context-model.mjs';
let cached, readAt = 0, selected = null, sessionValue = null;
let watching = false, redirecting = false, deadline = 0, expiryTimer;
export function invalidatePlatformSession() { cached = null; selected = null; sessionValue = null; readAt = 0; }

function returnToLogin() {
  if (redirecting) return;
  redirecting = true;
  clearTimeout(expiryTimer);
  const params = new URLSearchParams({
    returnTo: location.pathname + location.search + location.hash,
    error: 'expired',
  });
  if (sessionValue?.project?.id) params.set('project', sessionValue.project.id);
  invalidatePlatformSession();
  location.replace('/login?' + params);
}

function scheduleExpiry(expiresInMs, receivedAt = Date.now()) {
  if (!watching || redirecting || !Number.isFinite(expiresInMs)) return;
  deadline = receivedAt + expiresInMs;
  clearTimeout(expiryTimer);
  expiryTimer = setTimeout(checkSession, Math.max(0, deadline - Date.now()));
}

function checkSession() {
  if (redirecting) return;
  readPlatformSession(true).catch(() => {
    if (deadline && Date.now() >= deadline) returnToLogin();
  });
}

export function readPlatformSession(force = false) {
  if (!cached || force || Date.now() - readAt > 30000) {
    readAt = Date.now();
    cached = fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) }).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.ok) throw Error(result.error || '登录状态读取失败。');
      if (watching && !result.authenticated) { returnToLogin(); return result; }
      if (watching && selected && result.project?.id && selected.id !== result.project.id) {
        location.reload();
        return sessionValue;
      }
      sessionValue = result;
      selected = result.project?.id ? projectById(result.project.id) : null;
      scheduleExpiry(result.expiresInMs);
      return result;
    }).catch(error => { cached = null; throw error; });
  }
  return cached;
}
export const currentPlatformProject = () => selected;
export async function requirePlatformProject() {
  try {
    const session = await readPlatformSession();
    if (session.authenticated && selected) return selected;
    if (!redirecting) {
      const target = '/login?' + new URLSearchParams({ ...(session.authenticated ? { selectProject: '1' } : {}), returnTo: location.pathname + location.search + location.hash });
      location.replace(target);
    }
    throw Error('请先选择项目。');
  } catch (error) {
    if (redirecting) throw error;
    const host = document.querySelector('#app') || document.querySelector('main');
    if (host) {
      const message = document.createElement('p'), link = document.createElement('a');
      message.setAttribute('role', 'alert'); message.className = 'platform-context-error'; message.textContent = error.message || '项目读取失败。';
      link.href = '/login?selectProject=1'; link.textContent = '返回登录'; message.append(' ', link); host.replaceChildren(message);
    }
    throw error;
  }
}

export const currentPageEditable = page => sessionValue?.permissions?.[page]?.edit === true;

function watchPlatformSession() {
  watching = true;
  const fetchRequest = window.fetch.bind(window);
  // Keep the existing feature clients and intercept only the platform's authentication response.
  window.fetch = async (...args) => {
    const response = await fetchRequest(...args);
    if (response.status === 401 && response.url && new URL(response.url).origin === location.origin &&
        response.headers.get('X-Vnet-Login-Required') === '1') returnToLogin();
    return response;
  };

  let activityTimer, sendingActivity = false;
  function sendActivity() {
    clearTimeout(activityTimer);
    activityTimer = undefined;
    const csrf = sessionValue?.csrf;
    if (!csrf || redirecting || sendingActivity) return;
    sendingActivity = true;
    fetch('/api/auth/activity', {
      method: 'POST', headers: { 'X-CSRF-Token': csrf },
      keepalive: true, signal: AbortSignal.timeout(10000),
    }).then(async response => {
      if (response.ok) scheduleExpiry((await response.json()).expiresInMs);
      else if (response.status === 403) checkSession();
    }).catch(() => {
      // The server's last confirmed deadline still applies after a failed renewal.
    }).finally(() => { sendingActivity = false; });
  }
  for (const type of ['click', 'keydown', 'pointerdown', 'touchstart', 'wheel']) {
    document.addEventListener(type, event => {
      if (!event.isTrusted || redirecting || !sessionValue?.csrf) return;
      if (deadline - Date.now() <= 5000) sendActivity();
      else activityTimer ??= setTimeout(sendActivity, 5000);
    }, { capture: true, passive: true });
  }
  addEventListener('pagehide', () => { if (activityTimer) sendActivity(); });
  addEventListener('pageshow', event => { if (event.persisted) checkSession(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkSession();
  });
  checkSession();
}

if (typeof window !== 'undefined' && [
  '/project-management', '/index.html', '/research', '/cross-coordination',
  '/knowledge-sharing', '/meeting-trail', '/staffing-reserve', '/admin',
].includes(location.pathname)) watchPlatformSession();
