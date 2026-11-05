export function mountAdminSettings(container,session){
  container.innerHTML='<form autocomplete="off" class="application-settings-form"><div class="application-settings-fields"><label>App ID<input name="appId" required pattern="cli_[a-zA-Z0-9]+" maxlength="100" autocomplete="off" spellcheck="false"></label><label>App Secret<input name="appSecret" type="password" required maxlength="512" autocomplete="new-password" spellcheck="false" placeholder="输入新密钥"></label><div class="application-settings-status" role="status" aria-live="polite"></div></div><footer><button type="submit">保存配置</button></footer></form>';
  const form=container.querySelector('form'),submit=form.querySelector('[type=submit]'),status=form.querySelector('[role=status]');let phase='loading',mutationId=crypto.randomUUID(),previousId='';
  const state=(next,message)=>{phase=next;container.dataset.state=next;status.textContent=message;submit.disabled=!['ready','error'].includes(next);for(const input of form.querySelectorAll('input'))input.disabled=['loading','submitting'].includes(next);};
  form.oninput=()=>{mutationId=crypto.randomUUID();};
  form.onsubmit=async event=>{
    event.preventDefault();if(!['ready','error'].includes(phase))return;
    const payload={appId:form.elements.appId.value.trim(),appSecret:form.elements.appSecret.value,clientMutationId:mutationId};state('submitting','保存中…');
    try{const response=await fetch('/api/application-settings',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify(payload),signal:AbortSignal.timeout(35000)}),result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'配置未保存，请重试。');form.elements.appSecret.value='';if(previousId&&previousId!==result.appId){location.assign('/login?returnTo=%2Fadmin');return;}previousId=result.appId;mutationId=crypto.randomUUID();state('ready','已保存');}
    catch(error){state('error',error.name==='TimeoutError'?'保存超时，请使用相同内容重试。':error.message||'配置保存失败，请重试。');}
  };
  state('loading','读取中…');
  return (async()=>{try{const response=await fetch('/api/application-settings',{cache:'no-store',signal:AbortSignal.timeout(10000)}),result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'配置读取失败。');previousId=result.appId||'';form.elements.appId.value=previousId;state('ready',result.configured?'已配置':'未配置');}catch(error){state('error',error.message||'配置读取失败。');submit.disabled=true;}})();
}
