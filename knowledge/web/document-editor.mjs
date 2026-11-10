import {handoverStages} from '/knowledge/lifecycle.mjs';
import {rootDirectory} from '/knowledge/directory.mjs';
import {documentSpecialties,regionalOfficeSections} from '/knowledge/library-model.mjs';
import {toast} from './meeting-editor.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let editor,cache,cachePromise,polling=false,version=0;
const scopes=[['project','本项目'],['shared','海外共用'],['domestic','国内参考'],['general','通用参考']];
async function api(route,value){const response=await fetch('/api/knowledge/documents/'+route,{...(value?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}:{}),signal:AbortSignal.timeout(15000)});let result;try{result=await response.json();}catch{throw Error('提交结果待确认，请重试。');}if(!response.ok||!result.ok)throw Object.assign(Error(result.error||'请求未完成。'),{status:response.status});return result;}
export async function primeDocumentOptions(refresh=false){if(cachePromise)return cachePromise;cachePromise=api('options'+(refresh?'?refresh=1':'')).then(value=>{cache=value;return value;}).finally(()=>{cachePromise=null;});return cachePromise;}
function choices(values,selected,placeholder='请选择'){return `<option value="">${placeholder}</option>${values.map(([id,label])=>`<option value="${esc(id)}"${id===selected?' selected':''}>${esc(label)}</option>`).join('')}`;}
function specialtyField(selected=''){
 const options=documentSpecialties.map(name=>[name,name]);
 if(selected&&!documentSpecialties.includes(selected))options.push([selected,`${selected}（历史值）`]);
 return `<label>专业<select name="specialty">${choices(options,selected,'未选择')}</select></label>`;
}
function state(phase,message=''){editor.dataset.state=phase;editor.setAttribute('closedby',phase==='submitting'?'none':'any');const feedback=editor.querySelector('[data-document-state]');feedback.textContent=message;feedback.setAttribute('role',phase==='error'?'alert':'status');editor.querySelector('[type=submit]').disabled=['loading','submitting'].includes(phase);editor.querySelector('[type=submit]').textContent=phase==='submitting'?'保存中…':'保存';}
function storage(key,value){try{if(value===null)sessionStorage.removeItem(key);else if(value)sessionStorage.setItem(key,JSON.stringify(value));else return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}}
async function uploadFiles(op,files){for(const plan of op.uploads||[]){if(plan.ready)continue;const file=files.find(file=>file.name===plan.name&&file.size===plan.size);if(!file)throw Error('资料已保存，请补传附件。');const response=await fetch('/api/knowledge/documents/uploads/'+plan.id,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file,signal:AbortSignal.timeout(120000)});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'附件上传失败，请重试。');}}
function openEditor(trigger,content){
 if(!editor){editor=document.createElement('dialog');editor.className='meeting-editor document-editor';editor.setAttribute('aria-labelledby','document-editor-title');document.body.append(editor);}
 if(editor.open)return false;
 editor.innerHTML=content;
 editor.dataset.state='loading';editor.setAttribute('closedby','any');editor.oncancel=e=>{if(editor.getAttribute('closedby')==='none')e.preventDefault();};editor.onclose=()=>{if(trigger?.isConnected)trigger.focus();};editor.onclick=e=>{if(e.target.closest('[data-document-close]')&&editor.getAttribute('closedby')!=='none')editor.close();};
 editor.showModal();return true;
}
export function openDocumentUpdate(project,record,trigger,saved){
 const key=`vnet-document-update:${project}:${record.id}`,base=record.edit;
 let frozen=storage(key),files=[];
 const field=(name,label,max)=>Object.hasOwn(base,name)?`<label${name==='url'?' class="document-wide"':''}>${label}<input name="${name}" maxlength="${max}" ${name==='title'?'required autofocus':name==='url'?'type="url"':''} value="${esc(frozen?.changes[name]??base[name])}"></label>`:'';
 if(!openEditor(trigger,`<header><h2 id="document-editor-title">编辑资料</h2><button class="close-button" type="button" data-document-close aria-label="关闭">×</button></header><form><div class="meeting-editor-content"><div class="document-form-grid document-update-grid">${field('title','资料名称',200)}${specialtyField(frozen?.changes.specialty??base.specialty)}${field('url','资料链接',2048)}<label class="document-wide">备注<textarea name="note" maxlength="1000" rows="2">${esc(frozen?.changes.note??base.note)}</textarea></label><label class="document-wide">追加附件<input name="files" type="file" multiple><span class="document-file-list" aria-live="polite"></span></label></div></div><footer><span data-document-state role="status"></span><div><button class="button" type="button" data-document-close>取消</button><button class="button primary" type="submit">保存</button></div></footer></form>`))return;
 const form=editor.querySelector('form'),fields=form.querySelectorAll('input:not([type=file]),select,textarea');
 const unresolved=()=>{state('error','结果待确认，请重试保存。');editor.setAttribute('closedby','none');};
 if(frozen){for(const input of fields)input.disabled=true;unresolved();}else state('ready');
 form.elements.files.onchange=()=>{files=[...form.elements.files.files];form.querySelector('.document-file-list').textContent=files.map(f=>f.name).join(' · ');};
 form.onsubmit=async event=>{
  event.preventDefault();if(editor.dataset.state==='submitting')return;
  if(!frozen){
   const changes=Object.fromEntries([...fields].filter(input=>input.value.trim()!==(base[input.name]||'').trim()).map(input=>[input.name,input.value.trim()]));
   if(!Object.keys(changes).length&&!files.length){state('ready','没有改动');return;}
   const before=Object.fromEntries(Object.keys(changes).map(name=>[name,base[name]]));
   frozen={clientMutationId:crypto.randomUUID(),project,recordKey:record.id,before,changes,uploads:files.map(f=>({id:crypto.randomUUID(),name:f.name,size:f.size}))};
   storage(key,frozen);
  }
  for(const input of fields)input.disabled=true;
  form.elements.files.disabled=true;
  state('submitting');
  let result;
  try{result=await api('update',frozen);}
  catch(error){
   form.elements.files.disabled=false;
   if(!error.status||error.status>=500){unresolved();return;}
   storage(key,null);frozen=null;for(const input of fields)input.disabled=false;state('error',error.message);return;
  }
  storage(key,null);state('accepted');editor.close();toast(result.operation.status==='success'?'已同步':'已保存，正在同步');
  const refresh=()=>saved().catch(()=>toast('清单暂未更新，请刷新查看。',true));
  await Promise.all([refresh(),uploadFiles(result.operation,files).catch(error=>toast(error.message,true))]);
  watchDocumentSync(()=>saved(true));
 };
}
export async function openDocumentEditor(context,trigger,saved,kind='document'){
 const group=context.groupDefaults||{},regional=(group.scope||context.scope)==='regional',key='vnet-document-submission:'+context.project+(regional?':regional':'');
 const ready=value=>value?.targets?.some(target=>target.ready&&!!target.regionalOffice===regional);
 let frozen=storage(key),selectedFiles=[];
 if(!openEditor(trigger,`<header><h2 id="document-editor-title">${kind==='category'?'新增类别':'新增资料'}</h2><button class="close-button" type="button" data-document-close aria-label="关闭">×</button></header><div class="meeting-editor-content" role="status">正在读取字段…</div>`))return;
 const serial=++version;
 try{
  if(!ready(cache))for(let i=0;i<8;i++){await primeDocumentOptions();if(ready(cache))break;if(cache.state==='error'||i===7)throw Error(cache.error||'字段未就绪，请重试。');await new Promise(r=>setTimeout(r,800));if(!editor.open||serial!==version)return;}
  else primeDocumentOptions().catch(()=>{});
  if(!editor.open||serial!==version)return;
  if(frozen)kind=frozen.kind;
  if(kind==='category'||kind==='directory'){await directoryForm(context,trigger,saved,serial,key);return;}
  const scope=frozen?.scope||group.scope||(['project','shared','domestic','general'].includes(context.scope)?context.scope:context.ownership||'project'),chapter=frozen?.chapter||group.chapter||(['handover','operations'].includes(context.scope)?context.scope:''),stage=frozen?.stage??group.stage??context.stage??'';
  const scopeField=regional?'<input type="hidden" name="scope" value="regional">':`<label>资料范围<select name="scope" required>${choices(scopes,scope)}</select></label>`;
  const regionalNatures=(regionalOfficeSections.find(section=>section.id===context.directory)?.natures||regionalOfficeSections.flatMap(section=>section.natures));
  const natures=regional?regionalNatures.filter(nature=>cache.targets.some(target=>target.regionalOffice&&target.natures.includes(nature))):cache.natures;
  const natureChoices=(values,selected)=>choices([...new Set([...values,...(group.nature?[group.nature]:[])])].map(n=>[n,n]),selected);
  editor.innerHTML=`<header><div><h2 id="document-editor-title">${kind==='category'?'新增类别':'新增资料'}</h2><span class="document-project">${esc(regional?'区域协作站':context.name)}</span></div><button class="close-button" type="button" data-document-close aria-label="关闭">×</button></header><form class="document-create-form"><div class="meeting-editor-content"><div class="document-form-grid">${kind==='category'?scopeField+'<label>类别名称<input name="nature" maxlength="40" required autocomplete="off"></label>':`<label class="document-wide">资料名称<input name="title" maxlength="200" required autocomplete="off"></label>${scopeField}<label>资料性质<select name="nature" required>${natureChoices(natures,frozen?.nature||group.nature||(natures.length===1?natures[0]:context.natures?.length===1?context.natures[0]:''))}</select></label>${regional?'':`<label data-chapter-field>篇章<select name="chapter">${choices([['handover','接维篇'],['operations','运维篇']],chapter)}</select></label><label data-stage-field>阶段<select name="stage">${choices(handoverStages.map(s=>[s.step,s.name]),stage)}</select></label><label class="document-wide" data-directory-field>目录类别<select name="directoryId"></select></label>`}<label class="document-wide">资料链接<input name="url" type="url" maxlength="2048" placeholder="https://"></label><label class="document-wide">附件<input name="files" type="file" multiple><span class="document-file-list" aria-live="polite"></span></label>${regional?'':specialtyField(frozen?.specialty??group.specialty)}<label class="${regional?'document-wide':''}">备注<textarea name="note" maxlength="1000" rows="2"></textarea></label>`}</div></div><footer><span data-document-state role="status"></span><div><button class="button" type="button" data-document-close>取消</button><button class="button primary" type="submit">保存</button></div></footer></form>`;
  const form=editor.querySelector('form');if(frozen)for(const [name,value]of Object.entries(frozen)){const el=form.elements.namedItem(name);if(el&&typeof value==='string')el.value=value;}
  if(group.nature&&!frozen)form.elements.title?.focus();
  primeDocumentOptions().then(value=>{if(!editor.open||serial!==version||frozen||kind==='category'||regional)return;const select=form.elements.nature;select.innerHTML=natureChoices(value.natures,select.value);}).catch(()=>{});
  function lifecycle(){if(kind==='category'||regional)return;const shared=['project','shared'].includes(form.elements.scope.value),chapter=form.elements.chapter;chapter.required=shared;editor.querySelector('[data-chapter-field]').hidden=!shared;editor.querySelector('[data-stage-field]').hidden=!shared||chapter.value!=='handover';form.elements.stage.required=shared&&chapter.value==='handover';
   const select=form.elements.directoryId,selected=select.value||frozen?.directoryId||group.directoryId||context.directory|| (chapter.value==='handover'&&form.elements.stage.value?'handover:'+form.elements.stage.value:'');
   const nodes=(cache.directoryNodes||[]).filter(n=>n.chapter===chapter.value&&(form.elements.scope.value!=='shared'||n.project==='shared'));
   select.innerHTML=choices(nodes.map(n=>[n.id,n.parentId?(nodes.find(p=>p.id===n.parentId)?.name||'')+' / '+n.name:n.name]),selected);select.required=shared;editor.querySelector('[data-directory-field]').hidden=!shared;
   const root=rootDirectory(nodes.find(n=>n.id===select.value),nodes);if(root){form.elements.stage.value=root.stage||'';editor.querySelector('[data-stage-field]').hidden=true;form.elements.stage.required=false;}
  }
  form.onchange=e=>{lifecycle();if(e.target.name==='files'){selectedFiles=[...e.target.files];editor.querySelector('.document-file-list').textContent=selectedFiles.map(f=>f.name).join(' · ');}};lifecycle();
  state('ready',frozen?'上次提交结果待确认，请重试保存。':'');
  if(frozen)for(const el of form.querySelectorAll('input:not([type=file]),select,textarea'))el.disabled=true;
  form.onsubmit=async e=>{
   e.preventDefault();if(editor.dataset.state==='submitting')return;
   if(!frozen){const values=Object.fromEntries(new FormData(form));delete values.files;const scope=values.scope;
    frozen={clientMutationId:crypto.randomUUID(),kind,project:context.project,scope,title:values.title||'',nature:values.nature,chapter:['project','shared'].includes(scope)?values.chapter||'':'',stage:['project','shared'].includes(scope)&&values.chapter==='handover'?values.stage||'':'',directoryId:['project','shared'].includes(scope)?values.directoryId||'':'',specialty:values.specialty||'',note:values.note||'',url:values.url||'',uploads:selectedFiles.map(f=>({id:crypto.randomUUID(),name:f.name,size:f.size}))};storage(key,frozen);
   }
   for(const el of form.querySelectorAll('input:not([type=file]),select,textarea'))el.disabled=true;
   state('submitting');
   try{const result=await api('create',frozen);frozen=null;storage(key,null);let message=result.operation.status==='success'?'已同步':'已保存，正在同步';
    try{await uploadFiles(result.operation,selectedFiles);}catch(e){message=e.message;}
    state('accepted');editor.close();toast(message);await saved().catch(()=>toast('已保存，请刷新资料。',true));primeDocumentOptions().catch(()=>{});watchDocumentSync(saved);
   }catch(error){if(error.status&&error.status<500){frozen=null;storage(key,null);for(const el of form.querySelectorAll('input,select,textarea'))el.disabled=false;}state('error',error.name==='TimeoutError'?'结果待确认，请重试保存。':error.message);}
  };
 }catch(error){if(!editor.open)return;editor.dataset.state='error';editor.innerHTML=`<header><h2 id="document-editor-title">新增资料</h2><button class="close-button" type="button" data-document-close aria-label="关闭">×</button></header><div class="meeting-editor-content"><p role="alert">${esc(error.message)}</p><button class="button" data-options-retry>重试</button></div>`;editor.querySelector('[data-options-retry]').onclick=()=>{cache=null;editor.close();openDocumentEditor(context,trigger,saved,kind);};}
}
export async function retryDocument(id,saved){try{await api('retry',{id});await saved();watchDocumentSync(saved);}catch(e){toast(e.message,true);}}
export async function resumeDocumentUpload(id,saved){try{const data=await api('operations'),op=data.operations.find(o=>o.id===id);if(!op)throw Error('未找到附件任务。');const input=document.createElement('input');input.type='file';input.multiple=true;input.onchange=async()=>{try{await uploadFiles(op,[...input.files]);await api('retry',{id});toast('附件已保存，正在同步');await saved();watchDocumentSync(saved);}catch(e){toast(e.message,true);}};input.click();}catch(e){toast(e.message,true);}}
export async function watchDocumentSync(saved){if(polling)return;polling=true;try{for(let i=0;i<30;i++){const result=await api('operations');if(!result.operations.some(o=>['accepted','syncing'].includes(o.status))){await primeDocumentOptions();await saved();return;}await new Promise(r=>setTimeout(r,2000));}await saved();}catch{toast('同步状态未更新，请稍后刷新。',true);}finally{polling=false;}}
export async function showDocumentOperations(saved){
 const box=document.createElement('dialog');box.className='meeting-editor document-editor';box.setAttribute('aria-label','同步任务');box.setAttribute('closedby','any');box.innerHTML='<header><h2>同步任务</h2><button class="close-button" data-task-close aria-label="关闭">×</button></header><div class="meeting-editor-content" data-tasks role="status">正在读取…</div>';document.body.append(box);box.showModal();box.addEventListener('close',()=>box.remove());
 async function render(){try{const result=await api('operations');const items=result.operations.filter(o=>o.status!=='success');box.querySelector('[data-tasks]').innerHTML=items.length?items.map(o=>`<div class="document-operation"><div><strong>${esc(o.title)}</strong><p>${esc(o.error||'正在同步')}</p></div>${o.status==='conflict'?'':`<button class="button" data-task-retry="${esc(o.id)}">${o.uploads.some(u=>!u.ready)?'补传附件':'重试'}</button>`}</div>`).join(''):'<p>全部已同步</p>';box.onclick=async e=>{if(e.target.closest('[data-task-close]'))box.close();const b=e.target.closest('[data-task-retry]');if(!b)return;const op=items.find(o=>o.id===b.dataset.taskRetry);if(op.uploads.some(u=>!u.ready))await resumeDocumentUpload(op.id,saved);else{await retryDocument(op.id,saved);await render();}};}catch(e){box.querySelector('[data-tasks]').textContent=e.message;}}
 box.onclick=e=>{if(e.target.closest('[data-task-close]'))box.close();};await render();
}

async function directoryForm(context,trigger,saved,serial,key){
 const pending=storage(key),frozenDirectory=pending?.kind==='directory'?pending:null;
 const scope=frozenDirectory?.scope||context.ownership||'project',chapter=frozenDirectory?.chapter||(['handover','operations'].includes(context.scope)?context.scope:'handover');
 editor.innerHTML=`<header><div><h2 id="document-editor-title">新增类别</h2><span class="document-project">${esc(context.name)}</span></div><button class="close-button" type="button" data-document-close aria-label="关闭">×</button></header><form><div class="meeting-editor-content"><div class="document-form-grid"><label>篇章<select name="chapter" required>${choices([['handover','接维篇'],['operations','运维篇']],chapter)}</select></label><label>类别层级<select name="level" required>${choices([['major','大类'],['minor','小类']],frozenDirectory?.level||'major')}</select></label><label>适用范围<select name="scope" required>${choices(scopes.slice(0,2),scope)}</select></label><label data-parent-field>所属大类<select name="parentId"></select></label><label class="document-wide">类别名称<input name="nature" required maxlength="40" autocomplete="off" list="existing-nature-names"><datalist id="existing-nature-names">${cache.natures.map(n=>`<option value="${esc(n)}">`).join('')}</datalist></label></div></div><footer><span data-document-state role="status"></span><div><button class="button" type="button" data-document-close>取消</button><button class="button primary" type="submit">保存</button></div></footer></form>`;
 const form=editor.querySelector('form');let frozen=frozenDirectory;
 if(frozen)for(const name of ['scope','chapter','level','nature'])form.elements[name].value=frozen[name];
 function parents(){const f=form.elements,selected=f.parentId.value||frozen?.parentId||context.directory||(context.stage?'handover:'+context.stage:'');f.parentId.innerHTML=choices((cache.directoryNodes||[]).filter(n=>!n.parentId&&n.chapter===f.chapter.value&&(f.scope.value!=='shared'||n.project==='shared')).map(n=>[n.id,n.name]),selected);f.parentId.required=f.level.value==='minor';editor.querySelector('[data-parent-field]').hidden=f.level.value!=='minor';}
 form.onchange=parents;parents();state('ready',frozen?'上次提交结果待确认，请重试保存。':'');
 if(frozen)for(const el of form.querySelectorAll('input,select'))el.disabled=true;
 form.onsubmit=async event=>{event.preventDefault();if(editor.dataset.state==='submitting')return;if(!frozen){const v=Object.fromEntries(new FormData(form));frozen={...v,kind:'directory',project:context.project,clientMutationId:crypto.randomUUID(),parentId:v.level==='minor'?v.parentId:'',uploads:[]};storage(key,frozen);}state('submitting');for(const el of form.querySelectorAll('input,select'))el.disabled=true;
  try{const result=await api('create',frozen);storage(key,null);const created=frozen;frozen=null;editor.close();toast(result.operation.status==='success'?'类别已同步':'类别已保存，正在同步');await primeDocumentOptions();await saved({directory:created.clientMutationId,chapter:created.chapter});watchDocumentSync(()=>saved());}
  catch(error){if(error.status&&error.status<500){storage(key,null);frozen=null;for(const el of form.querySelectorAll('input,select'))el.disabled=false;}state('error',error.message);}
 };
}
