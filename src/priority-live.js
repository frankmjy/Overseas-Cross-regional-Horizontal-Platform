export function createPriorityClient(project,onChange){
 let snapshot={ready:false,items:[],people:[],plans:[],impacts:[]},reading,started=false,timer,closed=false;
 const files=new Map();
 const pendingKey=`overseas-priority-request:v1:${project}`;
 async function api(path='',body){const response=await fetch(`/api/priorities${path}${path.includes('?')?'&':'?'}project=${encodeURIComponent(project)}`,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'}),signal:AbortSignal.timeout(12000)});let data;try{data=await response.json();}catch{throw Error('服务暂未响应，请保留输入后重试。');}if(!response.ok||!data.ok)throw Object.assign(Error(data.error||'请求未完成。'),{status:response.status});return data;}
 const update=data=>{snapshot={...snapshot,...data};if(!closed)onChange();};
 async function refresh(force=false){if(closed)return;if(reading)return reading;reading=(async()=>{try{update(await api(force?'/refresh':'',force?{}:undefined));}catch(e){snapshot={...snapshot,error:e.message};if(!closed)onChange();}})().finally(()=>reading=null);return reading;}
 async function upload(id,file){
  try{const response=await fetch(`/api/priorities/uploads?project=${encodeURIComponent(project)}&name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Upload-ID':id},body:file,signal:AbortSignal.timeout(120000)});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'附件上传失败。');files.delete(id);}
  catch{try{await api('/upload-failed',{id});}catch{} }
 }
 async function sendFiles(pending){for(const [id,file]of pending){files.set(id,file);await upload(id,file);}await refresh();}
 return {
  get snapshot(){return snapshot;},start(){if(started)return;started=true;refresh();const recover=async()=>{try{const saved=window.sessionStorage.getItem(pendingKey);if(saved){const data=await api('',JSON.parse(saved));window.sessionStorage.removeItem(pendingKey);update(data);}}catch(e){snapshot={...snapshot,error:`上次提交结果待确认：${e.message}`};onChange();}};void recover();timer=setInterval(()=>{if(!document.hidden)refresh();},5000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});},refresh,
  async save(raw,pending){
   const saved=window.sessionStorage.getItem(pendingKey);if(saved&&JSON.parse(saved).clientMutationId!==raw.clientMutationId)throw Error('上次提交结果尚未确认，请刷新页面核对后再提交。');
   window.sessionStorage.setItem(pendingKey,JSON.stringify(raw));
   let data;try{data=await api('',raw);}catch(error){if(error.status&&error.status<500)window.sessionStorage.removeItem(pendingKey);throw error;}
   window.sessionStorage.removeItem(pendingKey);update(data);if(pending.size)void sendFiles(new Map(pending));return data;
  },
  async retry(id,pending=new Map()){update(await api('/retry',{id}));const uploads=new Map([...files,...pending]);if(uploads.size)void sendFiles(uploads);},
  async discard(id){update(await api('/discard',{id}));await refresh(true);},
  close(){closed=true;clearInterval(timer);},
 };
}
