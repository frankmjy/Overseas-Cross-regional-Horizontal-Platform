const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function inlineTaskValues(model,parentId,title){
 if(!model.ready||!model.capabilities?.editable)throw Error('当前没有编辑权限。');
 const parent=model.parents.find(r=>r.id===parentId&&!r.deleted&&r.level==='任务组'&&!r.id.startsWith('local:'));
 if(!parent||model.pendingRecordIds?.includes(parentId))throw Error('任务组正在同步或已变化，请刷新。');
 const name=String(title||'').trim();if(!name||name.length>200)throw Error('请填写200字以内的任务名称。');
 return {title:name,level:'执行项',stage:parent.stage,category:parent.category,parentId:parent.id};
}
export function inlineInsertValues(model,afterId,title){
 if(!model.ready||!model.capabilities?.editable)throw Error('当前没有编辑权限。');
 if(!model.capabilities.ordering)throw Error('排序字段尚未就绪。');
 const row=model.records.find(r=>r.id===afterId&&!r.deleted&&!r.id.startsWith('local:'));if(!row||model.pendingRecordIds?.includes(afterId))throw Error('插入位置正在同步或已变化，请刷新。');
 const name=String(title||'').trim();if(!name||name.length>200)throw Error('请填写200字以内的任务名称。');
 return {title:name,level:row.level,stage:row.stage,category:row.category,parentId:row.level==='执行项'?row.parentId:''};
}
export function createInlineTaskEntry({root,getModel,submit,onAccepted,onRender,onMessage}){
 let draft=null;
 const notify=text=>onMessage(text,true);
 function begin(parentId){
  try{inlineTaskValues(getModel(),parentId,'新增任务');}catch(e){notify(e.message);return;}
  if(draft&&draft.key!=='group:'+parentId){notify('请先保存或取消当前新增项。');return;}
  draft||={key:'group:'+parentId,parentId,title:'',phase:'ready',submission:null,error:''};onRender();root.querySelector('[data-inline-task] input')?.focus();
 }
 function beginAfter(afterId){
  try{inlineInsertValues(getModel(),afterId,'新增条目');}catch(e){notify(e.message);return;}
  if(draft&&draft.key!=='after:'+afterId){notify('请先保存或取消当前新增项。');return;}
  const row=getModel().records.find(r=>r.id===afterId);draft||={key:'after:'+afterId,afterId,parentId:row.parentId||'',title:'',phase:'ready',submission:null,error:''};onRender();root.querySelector('[data-inline-task] input')?.focus();
 }
 function render(parent,{editable,pending}={}){
  if(!editable||parent.id.startsWith('local:'))return '';
  if(draft?.key!=='group:'+parent.id)return `<button class="inline-add-trigger" data-inline-add="${esc(parent.id)}" title="在${esc(parent.title)}下新增任务"${pending?' disabled':''}>＋ 新增项</button>`;
  return form();
 }
 function form(){
  const locked=['submitting','uncertain'].includes(draft.phase);
  return `<form data-inline-task="${esc(draft.parentId||draft.afterId)}" data-state="${draft.phase}"><input name="title" aria-label="新增任务名称" placeholder="条目名称" value="${esc(draft.title)}" required maxlength="200" autocomplete="off"${locked?' readonly':''}><button type="submit"${draft.phase==='submitting'?' disabled':''}>${draft.phase==='uncertain'?'重试核对':draft.phase==='submitting'?'保存中':'保存'}</button><button type="button" data-inline-cancel${locked?' disabled':''}>取消</button>${draft.error?`<span class="inline-task-error" role="status">${esc(draft.error)}</span>`:''}</form>`;
 }
 function cancel(){if(!draft)return;if(['submitting','uncertain'].includes(draft.phase)){notify('提交结果待核对，请先重试。');return;}draft=null;onRender();}
 async function save(){
  if(!draft||draft.phase==='submitting')return;
  const current=draft;
  try{
   if(!current.submission){const model=getModel(),at=current.afterId&&model.records.find(r=>r.id===current.afterId);current.submission={clientMutationId:crypto.randomUUID(),kind:'create',values:current.afterId?inlineInsertValues(model,current.afterId,current.title):inlineTaskValues(model,current.parentId,current.title),...(at?{insertAfter:{id:at.id,version:at.version}}:{})};}
   current.phase='submitting';current.error='';onRender();
   const data=await submit(current.submission);draft=null;onAccepted(data,current.parentId,current.afterId);onMessage('已保存，后台同步中。');
  }catch(e){current.phase=!current.submission||e.status&&e.status<500?'error':'uncertain';current.error=e.message||'保存结果待核对，请重试。';if(current.phase==='error')current.submission=null;onRender();}
 }
 root.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;if(button.dataset.inlineAdd)begin(button.dataset.inlineAdd);else if(button.hasAttribute('data-inline-cancel'))cancel();});
 root.addEventListener('input',e=>{if(draft&&e.target.closest('[data-inline-task]')&&e.target.name==='title'&&!['submitting','uncertain'].includes(draft.phase)){draft.title=e.target.value;draft.submission=null;}});
 root.addEventListener('submit',e=>{if(e.target.matches('[data-inline-task]')){e.preventDefault();save();}});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&e.target.closest('[data-inline-task]')){e.preventDefault();cancel();}});
 return {render,renderAfter:row=>draft?.afterId===row.id?form():'',begin,beginAfter,get active(){return !!draft;}};
}
