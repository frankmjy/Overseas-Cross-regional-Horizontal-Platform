let settingsDialog;
async function openSettings() {
  if (settingsDialog?.open) return;
  const dialog = settingsDialog ||= document.body.appendChild(document.createElement('dialog'));
  dialog.className = 'application-settings-dialog'; dialog.setAttribute('aria-labelledby', 'applicationSettingsTitle');
  dialog.innerHTML = `<form autocomplete="off"><header><h2 id="applicationSettingsTitle">飞书应用配置</h2><button type="button" data-settings-close aria-label="关闭应用配置">×</button></header><div class="application-settings-fields"><label>App ID<input name="appId" required pattern="cli_[a-zA-Z0-9]+" maxlength="100" autocomplete="off" spellcheck="false"></label><label>App Secret<input name="appSecret" type="password" required maxlength="512" autocomplete="new-password" spellcheck="false" placeholder="填写有效密钥，已保存的密钥不回显"></label><p>仅供服务器本机配置。保存前校验飞书凭据；保存后两页共用该应用。</p><div class="application-settings-status" role="status" aria-live="polite"></div></div><footer><button type="button" data-settings-close>取消</button><button type="submit">校验并保存</button></footer></form>`;
  const form = dialog.querySelector('form'), submit = form.querySelector('[type=submit]'), status = form.querySelector('[role=status]');
  let phase = 'loading', mutationId = crypto.randomUUID();
  const state = (next, text) => { phase = next; dialog.dataset.state = next; status.textContent = text; submit.disabled = !['ready', 'error'].includes(next); form.querySelectorAll('input').forEach(input => { input.disabled = ['loading', 'submitting', 'success'].includes(next); }); };
  const close = () => { if (phase === 'submitting') return; dialog.close(); dialog.replaceChildren(); };
  dialog.oncancel = event => { event.preventDefault(); close(); };
  dialog.querySelectorAll('[data-settings-close]').forEach(button => { button.onclick = close; });
  form.oninput = () => { mutationId = crypto.randomUUID(); };
  form.onsubmit = async event => {
    event.preventDefault(); if (phase === 'submitting' || phase === 'success') return;
    const payload = { appId: form.elements.appId.value.trim(), appSecret: form.elements.appSecret.value, clientMutationId: mutationId };
    state('submitting', '正在校验并保存…');
    try {
      const response = await fetch('/api/application-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(35000) });
      const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || '配置未保存，请重试。');
      form.elements.appSecret.value = ''; state('success', '凭据校验通过，已保存并应用。请返回页面手动同步。');
      dialog.querySelector('footer [data-settings-close]').textContent = '完成';
    } catch (error) { state('error', error.name === 'TimeoutError' ? '保存请求超时，请使用相同内容重试，或重新打开查看配置状态。' : error.message || '配置保存失败，请重试。'); }
  };
  dialog.showModal(); state('loading', '正在读取配置状态…');
  try {
    const response = await fetch('/api/application-settings', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || '无法读取配置状态。');
    if (!dialog.open) return;
    form.elements.appId.value = result.appId || ''; state('ready', result.configured ? '已保存配置；更新密钥时重新填写 App Secret。' : '填写应用凭据后校验并保存。'); form.elements.appSecret.focus();
  } catch (error) { if (dialog.open) { state('error', error.message || '无法读取配置状态。'); submit.disabled = true; } }
}
if (typeof document !== 'undefined') document.addEventListener('click', event => { if (event.target.closest('[data-application-settings]')) openSettings(); });
