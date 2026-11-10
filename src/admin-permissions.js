const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountPermissions(root,session){
 let data,selected='',draft,subAdmin=false,mutation=null,phase='loading',query='',poll,deadline=0,permissionsDirty=false;
 root.innerHTML='<div class="access-toolbar"><h2>鉴权配置 <small class="access-count" data-access-count></small></h2><button type="button" class="admin-icon" data-access-refresh title="刷新授权人员" aria-label="刷新授权人员">↻</button></div><div class="access-layout"><aside class="access-people"><label><span class="sr-only">搜索已授权人员</span><input type="search" placeholder="搜索人员" maxlength="120" data-access-search></label><div data-access-people></div></aside><div class="access-content"><p data-roster-status class="access-roster-status" role="status" hidden></p><div data-access-matrix></div><footer class="access-footer"><p data-access-status role="status" aria-live="polite"></p><button type="button" class="access-save" data-access-save disabled>保存</button></footer></div></div>';
 const $=q=>root.querySelector(q),status=message=>{root.dataset.state=phase;$('[data-access-status]').textContent=message;},person=()=>data?.people.find(p=>p.openId===selected);
 const roleLabel=p=>p.adminRole==='sub'?'子管理员':p.isAdmin?'主管理员':'';
 const canChangeRole=p=>!!p&&session.canManageSubAdmins===true&&p.adminRole!=='owner';
 const roleDirty=()=>canChangeRole(person())&&subAdmin!==(person().adminRole==='sub');
 const dirty=()=>permissionsDirty||roleDirty();
 function matrix(){
  const p=person(),busy=phase==='loading'||phase==='submitting'||!!mutation||data?.writable===false;
  const roleControl=canChangeRole(p)?`<label class="access-role-control"><input type="checkbox" data-sub-admin${subAdmin?' checked':''}${busy?' disabled':''}>子管理员权限</label>`:'';
  const rows=p?data.pages.map(page=>{
   const cells=['view','edit'].map(right=>`<td><input type="checkbox" data-page="${page.id}" data-right="${right}" aria-label="${esc(page.name)}${right==='view'?'访问':'编辑'}"${subAdmin||draft[page.id][right]?' checked':''}${p.isAdmin||subAdmin||busy?' disabled':''}></td>`).join('');
   return `<tr><th scope="row">${esc(page.name)}</th>${cells}</tr>`;
  }).join(''):'';
  $('[data-access-matrix]').innerHTML=p?`<header class="access-person-heading"><h3>${esc(p.name)}</h3>${roleLabel(p)?`<span>${roleLabel(p)}</span>`:''}${roleControl}</header><table class="admin-table access-matrix"><thead><tr><th>页面</th><th>访问</th><th>编辑</th></tr></thead><tbody>${rows}</tbody></table>`:data?.writable!==false?'<p class="admin-empty">暂无已授权人员</p>':'';
  $('[data-access-save]').disabled=!p||phase==='loading'||phase==='submitting'||data?.writable===false||(!dirty()&&!mutation);
 }
 function people(){const list=data?.people.filter(p=>p.name.toLocaleLowerCase().includes(query)||p.openId.toLocaleLowerCase().includes(query))||[];$('[data-access-people]').innerHTML=list.map(p=>`<button type="button" data-person="${esc(p.openId)}"${selected===p.openId?' aria-current="true"':''}${mutation||phase==='submitting'?' disabled':''}><span>${esc(p.name)}</span>${roleLabel(p)?`<small>${roleLabel(p)}</small>`:''}</button>`).join('')||(query?'<p class="admin-empty">无匹配人员</p>':'');}
 function resetDraft(){const p=person();draft=structuredClone(p?.permissions);subAdmin=p?.adminRole==='sub';permissionsDirty=false;}
 function choose(id){selected=id;resetDraft();people();matrix();}
 async function request(body,refresh=false){const response=await fetch('/api/admin/permissions'+(refresh?'?refresh=1':''),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-CSRF-Token':session.csrf}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(10000)}),result=await response.json();if(!response.ok||!result.ok)throw Object.assign(Error(result.error||'权限读取失败，请重试。'),{status:response.status});return result;}
 async function load(refresh=false){
  if(mutation||dirty())return;
  clearTimeout(poll);$('[data-access-refresh]').disabled=true;
  const roster=$('[data-roster-status]'),show=message=>{roster.textContent=message;roster.hidden=!message;};
  try{
   phase='loading';if(data)matrix();show('读取授权名单…');data=await request(null,refresh);
   phase='ready';choose(data.people.some(p=>p.openId===selected)?selected:data.people.find(p=>!p.isAdmin)?.openId||data.people[0]?.openId||'');
   $('[data-access-count]').textContent=data.people.length||data.writable!==false?`${data.people.length} 人`:'';
   show(data.error||(data.refreshing?'读取授权名单…':''));
   if(data.refreshing){deadline||=Date.now()+60000;if(Date.now()<deadline)poll=setTimeout(()=>load(),1500);else show('名单仍在同步，可稍后刷新。');}
   else deadline=0;
  }catch(e){phase='error';if(data){data.writable=false;matrix();}show(e.name==='TimeoutError'?'读取超时，请刷新重试。':e.message);}
  finally{$('[data-access-refresh]').disabled=false;}
 }
 root.addEventListener('click',e=>{const b=e.target.closest('[data-person]');if(b&&!mutation&&phase!=='submitting'){if(dirty()&&!confirm('放弃未保存的权限修改？'))return;choose(b.dataset.person);status('');}});
 root.addEventListener('change',event=>{
  const input=event.target;
  if(mutation||phase==='loading'||phase==='submitting'||data?.writable===false)return;
  if(input.matches('[data-sub-admin]')&&canChangeRole(person()))subAdmin=input.checked;
  else if(input.matches('[data-right]')&&!person()?.isAdmin&&!subAdmin){
   const rights=draft[input.dataset.page];
   rights[input.dataset.right]=input.checked;
   if(input.dataset.right==='edit'&&input.checked)rights.view=true;
   if(input.dataset.right==='view'&&!input.checked)rights.edit=false;
   permissionsDirty=true;
  }else return;
  phase='ready';status('');matrix();
  if(input.matches('[data-sub-admin]'))$('[data-sub-admin]').focus();
 });
 $('[data-access-search]').oninput=e=>{query=e.target.value.trim().toLocaleLowerCase();people();};
 $('[data-access-refresh]').onclick=()=>{if(mutation||dirty()&&!confirm('放弃未保存的权限修改？'))return;resetDraft();matrix();deadline=0;load(true);};
 $('[data-access-save]').onclick=async()=>{
  const p=person();
  if(!p||phase==='submitting'||data?.writable===false||(!dirty()&&!mutation))return;
  if(!mutation){
   mutation={clientMutationId:crypto.randomUUID(),openId:selected,revision:p.revision};
   if(roleDirty())mutation.subAdmin=subAdmin;
   if(permissionsDirty)mutation.permissions=structuredClone(draft);
  }
  phase='submitting';status('保存中…');people();matrix();
  try{
   const saved=await request(mutation);
   p.permissions=saved.permissions;
   p.revision=saved.revision;
   if(Object.hasOwn(saved,'adminRole')){p.adminRole=saved.adminRole;p.isAdmin=saved.isAdmin;}
   mutation=null;resetDraft();phase='success';status('已保存');
  }catch(e){
   phase='error';
   if(e.status&&e.status<500){mutation=null;resetDraft();status(e.message);if(e.status===409){await load();status('权限已变更，请重新配置。');}}
   else status('保存结果待确认，请重试保存。');
  }finally{people();matrix();}
 };
 addEventListener('pagehide',()=>clearTimeout(poll),{once:true});load();
}
