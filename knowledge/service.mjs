import {isLibraryDocument,withLibraryMetadata} from './library-model.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {BaseAdapter} from '../research/adapter.mjs';import {projectRecord} from './model.mjs';
const driveFolderPath=/^\/drive\/folder\/([a-z\d]+)$/i;
const driveFolderRefreshMs=5*60*1000;
export class KnowledgeAdapter extends BaseAdapter{
 async list(source){const rows=[];let offset=0;const fields=Object.entries(source.fields);for(let page=0;page<100;page++){
  const d=await this.cli('+record-list',['--table-id',source.id,'--limit','200','--offset',String(offset),...fields.flatMap(([,f])=>['--field-id',f.id])]);
  if(!Array.isArray(d.data)||!Array.isArray(d.fields)||!Array.isArray(d.record_id_list)||d.data.length!==d.record_id_list.length)throw Error('飞书资料数据格式不兼容。');
  for(const [i,r] of d.data.entries()){const cells={};for(const [key,f] of fields){const column=d.fields.indexOf(f.name);if(column<0)throw Error('飞书资料字段已变更，请核对接表配置。');cells[key]=r[column];}rows.push({id:d.record_id_list[i],cells});}
  if(!d.has_more)return rows;if(!d.data.length)throw Error('飞书资料分页没有前进，停止读取以避免缺口。');offset+=d.data.length;
 }throw Error('飞书资料超过读取上限，未返回不完整数据。');}
 async listDriveFolders(parent){
  const url=new URL(parent),token=driveFolderPath.exec(url.pathname)?.[1];
  if(!token||url.protocol!=='https:'||!/^[a-z\d-]+\.feishu\.cn$/i.test(url.hostname)||url.username||url.password)throw Error('云盘目录配置无效。');
  const children=new Map(),usedPages=new Set();
  let cursor;
  do{
   const page=await this.cli('GET',['/open-apis/drive/v1/files','--params',JSON.stringify({folder_token:token,page_size:200,page_token:cursor})],process.cwd(),'api');
   if(!Array.isArray(page.files))throw Error('云盘目录清单格式不兼容。');
   for(const child of page.files){
    if(child.type!=='folder'||typeof child.name!=='string'||!child.name.trim()||!/^[a-z\d]+$/i.test(child.token||'')||child.token===token)continue;
    children.set(child.token,{name:child.name,url:new URL('/drive/folder/'+child.token,url).href});
   }
   cursor=page.has_more?page.next_page_token:undefined;
   if(page.has_more&&(!cursor||usedPages.has(cursor)))throw Error('云盘目录分页停滞。');
   if(cursor)usedPages.add(cursor);
  }while(cursor);
  return [...children.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
 }
}
export class KnowledgeService{
 constructor({config,adapter=new KnowledgeAdapter(config),cacheFile,now=()=>Date.now()}){this.config=config;this.adapter=adapter;this.cacheFile=cacheFile;this.now=now;this.sections={};this.errors=[];this.attemptedAt=0;this.refreshing=null;this.driveFolders={};this.nextDriveRefresh=0;}
 async init(){if(!this.cacheFile)return;try{const cache=JSON.parse(await fs.readFile(this.cacheFile,'utf8'));if(cache.baseUrl===this.config.baseUrl&&cache.sections&&typeof cache.sections==='object'){for(const s of this.config.sources){const v=cache.sections[s.id];if(!Array.isArray(v?.records))continue;
  if(s.fields?.['Review Status']&&v.reviewStatusField!==s.fields['Review Status'].id)continue;
  if(s.driveCollections&&v.driveCollectionsKey!==JSON.stringify(s.driveCollections)){
   const needsSource=new Set(s.driveCollections.map(entry=>entry.nature));
   this.sections[s.id]={...v,records:v.records.filter(record=>!needsSource.has(record.nature))};
  }else this.sections[s.id]=v;
 }}}catch(e){if(e.code!=='ENOENT')this.errors=[{name:'本地缓存',message:'缓存无法读取，正在重新连接飞书。'}];}}
 async refreshDriveFolders(force){
  if(!this.adapter.listDriveFolders||!force&&this.now()<this.nextDriveRefresh)return;
  const roots=new Set(this.config.sources.flatMap(source=>(source.driveCollections||[]).map(folder=>folder.url)));
  if(!roots.size)return;
  const results=await Promise.allSettled([...roots].map(async root=>{
   const children=await this.adapter.listDriveFolders(root);
   return [root,children.filter(child=>!roots.has(child.url))];
  }));
  this.driveFolders=Object.fromEntries(results.filter(result=>result.status==='fulfilled').map(result=>result.value));
  this.nextDriveRefresh=this.now()+(results.some(result=>result.status==='rejected')?60000:driveFolderRefreshMs);
 }
 refresh({refreshDrive=false}={}){if(this.refreshing)return this.refreshing;this.attemptedAt=this.now();this.refreshing=(async()=>{
  const folders=this.refreshDriveFolders(refreshDrive);
  const errors=[];let i=0;await Promise.all(Array.from({length:3},async()=>{while(i<this.config.sources.length){const s=this.config.sources[i++];try{const rows=await this.adapter.list(s);this.sections[s.id]={updatedAt:new Date(this.now()).toISOString(),records:rows.map(r=>projectRecord(s,r,this.config.baseUrl)).filter(Boolean),reviewStatusField:s.fields?.['Review Status']?.id,...(s.driveCollections?{driveCollectionsKey:JSON.stringify(s.driveCollections)}:{})};}catch{errors.push({name:s.name,message:'读取失败，请重试；如持续失败，请检查飞书连接、表授权或字段配置。'});}}}));
  this.errors=errors;if(this.cacheFile){try{await fs.mkdir(path.dirname(this.cacheFile),{recursive:true});const tmp=this.cacheFile+'.tmp';await fs.writeFile(tmp,JSON.stringify({baseUrl:this.config.baseUrl,sections:this.sections}));await fs.rename(tmp,this.cacheFile);}catch{this.errors.push({name:'本地缓存',message:'本次结果未能保存到服务器缓存；当前仍可查看，重启后需重新读取。'});}}
  await folders;
 })().finally(()=>{this.refreshing=null;});return this.refreshing;}
 read({refresh=false}={}){if(!this.refreshing&&(refresh||!this.attemptedAt||this.now()-this.attemptedAt>60000))this.refresh({refreshDrive:refresh});return this.snapshot();}
 snapshot(){const records=Object.values(this.sections).flatMap(s=>s.records);
 const actions=new Map();
 for(const record of records.filter(r=>r.meetingAction)){
  const key=record.project+':'+record.meetingRecordId;
  if(!actions.has(key))actions.set(key,[]);
  actions.get(key).push(record);
 }
 const meetings=records.filter(r=>r.project&&!r.meetingAction).map(m=>{
  const linked=actions.get(m.project+':'+m.id.split(':').at(-1))||[];
  const migrated=new Set(linked.map(a=>a.title));
  return {...m,actions:[...linked,...m.actions.filter(a=>!migrated.has(a.title))]};
 });
 const hasData=Object.keys(this.sections).length>0;return {state:this.errors.length?(hasData?'partial':'error'):hasData?'ready':this.refreshing?'loading':'idle',refreshing:!!this.refreshing,updatedAt:Object.values(this.sections).map(s=>s.updatedAt).sort()[0]||null,errors:this.errors,categories:this.config.categories,sources:this.config.sources.map(({id,name,category,kind,project,regionalOffice,libraryView})=>({id,name,category,kind,...regionalOffice?{regionalOffice}: {},...project?{project}:{},url:`${this.config.baseUrl}?table=${id}${libraryView?'&view='+libraryView:''}`,count:this.sections[id]?.records.filter(isLibraryDocument).length??null,updatedAt:this.sections[id]?.updatedAt||null})),templates:this.config.templates||[],projectLibraries:this.config.projectLibraries||[],documents:records.filter(r=>r&&!r.project).map(r=>withLibraryMetadata({...r,sourceName:this.config.sources.find(s=>s.id===r.sourceId)?.name||r.sourceName},this.config.sources.find(s=>s.id===r.sourceId))),meetings,baseUrl:this.config.baseUrl,architectureUrl:this.config.architectureUrl||`${this.config.baseUrl}?table=ldxpV5M0qhI0IgVy`};}
}
