const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let cached, readAt = 0;
async function readSession(force = false) {
  if (!cached || force || Date.now() - readAt > 30000) {
    readAt = Date.now();
    cached = fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) }).then(async response => {
      const result = await response.json(); if (!response.ok || !result.ok) throw Error(result.error || '身份读取失败。'); return result;
    }).catch(error => { cached = null; throw error; });
  }
  return cached;
}
const loginUrl = () => `/login?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
class PlatformAccount extends HTMLElement {
  async connectedCallback() {
    this.innerHTML = '<button type="button" class="account-trigger" aria-label="正在读取登录身份" disabled>···</button>';
    try { this.draw(await readSession()); } catch { this.innerHTML = '<button type="button" class="account-retry">身份读取失败 · 重试</button>'; this.querySelector('button').onclick = () => this.connectedCallback(); }
  }
  draw(session) {
    if (!this.isConnected) return;
    if (!session.authenticated) { this.innerHTML = `<a class="account-login" href="${escape(loginUrl())}">飞书登录</a>`; return; }
    const name = escape(session.user.name), initials = escape([...session.user.name].slice(-2).join(''));
    this.innerHTML = `<details class="account-menu"><summary class="account-trigger" aria-label="打开用户菜单" title="${name}">${initials}</summary><div class="account-dropdown"><div class="account-identity"><span class="account-avatar">${initials}</span><div><strong>${name}</strong><span>已登录</span></div></div>${session.canConfigure ? '<button type="button" data-application-settings><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/></svg>应用配置</button>' : ''}<a href="/api/auth/feishu/authorize?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 8 5 10-4-5 11-5 2 0-9M3 6h9l9 1"/></svg>切换飞书账号</a><button type="button" data-account-logout><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3H4v18h6m4-15 6 6-6 6M8 12h12"/></svg>退出登录</button><p class="account-status" role="status" aria-live="polite">${session.auditStatus === 'pending' ? '登录记录待同步' : ''}</p></div></details>`;
    this.querySelector('[data-account-logout]').onclick = async () => {
      const button = this.querySelector('[data-account-logout]'), status = this.querySelector('[role=status]');
      if (button.disabled) return; button.disabled = true; status.textContent = '正在退出…'; this.dataset.state = 'submitting';
      try {
        const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': session.csrf }, signal: AbortSignal.timeout(10000) });
        const result = await response.json(); if (!response.ok || !result.ok) throw Error(result.error || '退出未完成。');
        this.dataset.state = 'success'; cached = null; location.assign('/login');
      } catch {
        try { const current = await readSession(true); if (!current.authenticated) { location.assign('/login'); return; } } catch { /* The retry button remains available when status cannot be checked. */ }
        this.dataset.state = 'error'; status.textContent = '退出未确认，请重试。'; button.disabled = false;
      }
    };
    this.querySelector('[data-application-settings]')?.addEventListener('click', () => { this.querySelector('details').open = false; });
    this.querySelector('details').addEventListener('keydown', event => { if (event.key === 'Escape') { event.currentTarget.open = false; this.querySelector('summary').focus(); } });
  }
}
if (!customElements.get('platform-account')) customElements.define('platform-account', PlatformAccount);
document.addEventListener('click', event => { document.querySelectorAll('platform-account details[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; }); });
addEventListener('pageshow', event => { if (event.persisted) { cached = null; location.reload(); } });
