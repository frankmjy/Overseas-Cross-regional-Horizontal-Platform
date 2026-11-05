const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const resourceUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};
const filename=value=>String(value||'附件').replace(/^[\da-f]{8}-[\da-f]{8}-/i,'');
function urlTitle(url){const u=new URL(url);try{return decodeURIComponent(u.pathname.split('/').filter(Boolean).at(-1)||u.hostname);}catch{return u.hostname;}}
export function taskResources(task){
 const result=[],seen=new Set(),archives=task.resourceArchives||[],files=task.attachments||[];
 const add=resource=>{const key=resource.kind+':'+(resource.key||resource.url||resource.title);if(seen.has(key))return;seen.add(key);result.push(resource);};
 const raw=String(task.deliverableLinks||'');
 const pattern=/\[([^\]\r\n]*)\]\((https:\/\/[^\s<>]+)\)|https:\/\/[^\s)<>]+/g;
 for(const match of raw.matchAll(pattern)){
  const original=resourceUrl(match[2]||match[0]);if(!original)continue;
  const archive=archives.find(a=>resourceUrl(a.archiveUrl)===original||resourceUrl(a.contentUrl)===original);
  if(archive&&!archive.contentUrl&&archive.storedNames?.some(name=>files.some(f=>f.name===name)))continue;
  const url=resourceUrl(archive?.contentUrl)||original;
  add({kind:'link',title:archive?.title||match[1]||urlTitle(url),url,archiveUrl:resourceUrl(archive?.archiveUrl)});
 }
 for(const file of files){const archive=archives.find(a=>a.storedNames?.includes(file.name));add({kind:'attachment',key:file.file_token||file.token||file.name,title:filename(file.name),url:resourceUrl(task.url),archiveUrl:resourceUrl(archive?.archiveUrl)});}
 return result;
}
export function renderResourceLinks(task,{compact=false,limit=Infinity}={}){
 return taskResources(task).slice(0,limit).map(r=>{
  const label=r.kind==='attachment'?'附件':'链接',title=esc(r.title),text=`<span class="resource-kind">${label}</span><span class="resource-title">${title}</span><span aria-hidden="true">↗</span>`;
  const link=r.url?`<a class="${compact?'task-resource-tag':'resource-link'}" href="${esc(r.url)}" target="_blank" rel="noreferrer" title="${label}：${title}" aria-label="打开${label}：${title}">${text}</a>`:`<span class="resource-link">${text.replace('<span aria-hidden="true">↗</span>','')}</span>`;
  return compact?link:`<div class="resource-entry">${link}${r.archiveUrl?`<a class="resource-archive" href="${esc(r.archiveUrl)}" target="_blank" rel="noreferrer" title="查看归档记录：${title}" aria-label="查看归档记录：${title}">归档记录 ↗</a>`:''}</div>`;
 }).join('');
}
export function bindOutsideDismiss(dialog,close){
 let pressedOutside=false;
 const outside=e=>{if(e.target!==dialog||!dialog.getBoundingClientRect)return false;const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
 dialog.addEventListener('pointerdown',e=>{pressedOutside=outside(e);});
 dialog.addEventListener('click',e=>{if(pressedOutside&&outside(e))close();pressedOutside=false;});
}
