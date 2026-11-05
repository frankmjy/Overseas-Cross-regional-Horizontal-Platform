import { projectById } from './project-context-model.mjs';
let cached, readAt = 0, selected = null, sessionValue = null;
export function invalidatePlatformSession() { cached = null; selected = null; sessionValue = null; readAt = 0; }
export function readPlatformSession(force = false) {
  if (!cached || force || Date.now() - readAt > 30000) {
    readAt = Date.now();
    cached = fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) }).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.ok) throw Error(result.error || '登录状态读取失败。');
      sessionValue = result;
      selected = result.project?.id ? projectById(result.project.id) : null;
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
    const target = '/login?' + new URLSearchParams({ ...(session.authenticated ? { selectProject: '1' } : {}), returnTo: location.pathname + location.search + location.hash });
    location.replace(target);
    throw Error('请先选择项目。');
  } catch (error) {
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
