import path from 'node:path';
import {BaseAdapter} from '../research/adapter.mjs';
import {normalizeRows} from '../research/service.mjs';
import {failure} from './storage.mjs';
import {safeLinks} from './model.mjs';
import {handoverStages} from './lifecycle.mjs';
import {documentSpecialties,regionalOfficeSections} from './library-model.mjs';

export const metadataFields={directoryId:['Directory Category ID（目录类别编号）','text'],scope:['Library Scope（资料范围）','text'],chapter:['Lifecycle Chapter（生命周期篇章）','text'],stage:['Lifecycle Stage（生命周期阶段）','text'],specialty:['Discipline（专业）','text'],note:['Notes（备注）','text'],mutation:['Client Mutation ID（提交标识）','text']};
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const text=v=>v==null?'':Array.isArray(v)?v.map(text).join(''):typeof v==='object'?String(v.name||v.text||''):String(v);
export const documentFields=source=>({...source.kind==='project-document'?{title:['Document Summary（资料简述）','text'],nature:['Document Category（资料类别）','select'],url:['Stored Link（存放链接）','text'],date:['Date（日期）','datetime'],attachments:['Document Link（资料文档）','attachment']}:source.kind==='equipment'?{title:['Equipment Name（设备名称）','text'],nature:['Document Category（资料类别）','select'],url:['Linked Document（关联云文档）','text'],date:['Shared At（分享时间）','datetime'],attachments:['Attachments（附件）','attachment']}:{title:['Document Title（文档名称）','text'],nature:['Topic（主题分类）','select'],url:['Document Link（文档链接）','text'],date:['Shared At（分享时间）','datetime'],attachments:['Attachments（附件）','attachment']},...metadataFields});
export function documentSchema(source,fields){
 const out={};for(const [key,[name,type]]of Object.entries(documentFields(source))){const matches=fields.filter(f=>f.name===name);if(matches.length!==1||matches[0].type!==type||type==='select'&&(matches[0].multiple||matches[0].dynamic_options_source))throw Error(`资料字段“${name}”缺失或类型不兼容。`);out[key]=structuredClone(matches[0]);}
 for(const [key,name]of [['project','Project（项目归属）'],['linkType','Link Type（链接类型）'],['status','Document Status（资料状态）']]){const field=fields.find(f=>f.name===name);if(field)out[key]=structuredClone(field);}return out;
}
export function validateDocument(raw,{singleSpecialty=false}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['clientMutationId','kind','project','scope','title','nature','chapter','stage','specialty','note','url','uploads','level','parentId','directoryId'].includes(k)))throw failure('资料字段不正确。');
 const value={};for(const key of ['kind','project','scope','title','nature','chapter','stage','specialty','note','url','level','parentId','directoryId']){if(raw[key]!=null&&typeof raw[key]!=='string')throw failure('资料字段格式不正确。');value[key]=(raw[key]||'').trim();if(value[key].length>({note:1000,url:2048,title:200}[key]||80))throw failure('填写内容过长。');}
 if(!['document','category','directory'].includes(value.kind)||!['project','shared','domestic','general','regional'].includes(value.scope)||!['thailand','malaysia'].includes(value.project))throw failure('资料范围无效。');
 if(!value.nature||/\p{Cc}/u.test(value.nature)||value.nature.length>40)throw failure('请填写有效类别。');
 if(value.scope==='regional'&&(value.kind!=='document'||value.chapter||value.stage||value.directoryId||!regionalOfficeSections.some(section=>section.natures.includes(value.nature))))throw failure('请选择有效的区域资料类别。');
 if(value.kind==='document'){
  if(!value.title)throw failure('请填写资料名称。');
  if(singleSpecialty)validateSpecialty(value.specialty);
  if(!['handover','operations',''].includes(value.chapter)||value.chapter==='handover'&&!value.directoryId&&!handoverStages.some(s=>s.step===value.stage)||value.chapter!=='handover'&&value.stage)throw failure('请选择有效的篇章和阶段。');
  if(['project','shared'].includes(value.scope)&&!value.chapter)throw failure('请选择资料篇章。');
  if(value.url){let u;try{u=new URL(value.url);}catch{throw failure('资料链接无效。');}if(u.protocol!=='https:'||u.username||u.password)throw failure('资料链接须为不含账号密码的 HTTPS 地址。');value.url=u.href;}
 }
 value.uploads=validateUploads(raw.uploads);
 if(value.kind==='document'&&!value.url&&!value.uploads.length)throw failure('请添加资料链接或附件。');
 if(['category','directory'].includes(value.kind)&&value.uploads.length)throw failure('类别不能包含附件。');return value;
}
function validateSpecialty(value){if(value&&!documentSpecialties.includes(value))throw failure('请从专业选项中选择一项。');}
function validateUploads(uploads=[]){
 if(!Array.isArray(uploads)||uploads.length>10||new Set(uploads.map(u=>u?.id)).size!==uploads.length||new Set(uploads.map(u=>typeof u?.name==='string'?u.name.toLowerCase():null)).size!==uploads.length)throw failure('附件数量或名称重复。');
 return uploads.map(u=>{if(!u||!uuid.test(u.id||'')||typeof u.name!=='string'||u.name.length>150||/[\\/:*?"<>|\p{Cc}]/u.test(u.name)||/[. ]$/.test(u.name)||/^\.|^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(u.name)||!Number.isInteger(u.size)||u.size<1||u.size>64*1024*1024)throw failure('附件名称或大小不支持。');return {id:u.id,name:u.name,size:u.size};});
}
export function validateDocumentUpdate(raw){
 const limits={title:200,note:1000,specialty:80,url:2048};
 const {before,changes,recordKey,project}=raw;
 if(Object.keys(raw).some(key=>!['before','changes','recordKey','project','uploads','clientMutationId'].includes(key))||typeof recordKey!=='string'||!/^[\w]+:rec[\w]+$/.test(recordKey)||![before,changes].every(fields=>fields&&typeof fields==='object'&&!Array.isArray(fields))||Object.keys(before).length!==Object.keys(changes).length)throw failure('资料字段不正确。');
 const patch={};
 for(const [key,value] of Object.entries(changes)){
  if(!Object.hasOwn(limits,key)||typeof before[key]!=='string'||typeof value!=='string'||value.length>limits[key])throw failure('资料字段不正确。');
  patch[key]=value.trim();
  if(key==='specialty')validateSpecialty(patch.specialty);
  if(key==='title'&&!patch.title)throw failure('请填写资料名称。');
  if(key==='url'&&patch.url){const [link]=safeLinks(patch.url);if(!link||!/^https:\/\/[^\s<>"\[\]]+$/u.test(patch.url)||new URL(patch.url).href!==link.url)throw failure('请填写有效的 HTTPS 资料链接。');patch.url=link.url;}
 }
 const uploads=validateUploads(raw.uploads);
 if(!Object.keys(patch).length&&!uploads.length)throw failure('没有需要保存的改动。');
 return {kind:'update',project,recordKey,before,changes:patch,uploads};
}
export function encodeDocument(v,schema,id,createdAt){
 const out={};for(const key of ['title','scope','chapter','stage','specialty','note','url','directoryId'])out[schema[key].id]=v[key];
 out[schema.nature.id]=schema.nature.options.find(o=>o.name.trim()===v.nature)?.name||v.nature;
 out[schema.mutation.id]=id;out[schema.date.id]=new Date(createdAt).toISOString();
 if(schema.project)out[schema.project.id]=v.scope==='shared'?'海外':'通用';
 if(schema.linkType)out[schema.linkType.id]=v.url?'其他链接':'待补充';if(schema.status)out[schema.status.id]=v.url?'已有链接':'待补资料';return out;
}
export function matchesDocument(row,v,schema,id,createdAt){
 if(!row||text(row[schema.mutation.name])!==id)return false;
 const actualDate=text(row[schema.date.name]),stamp=/^\d{13}$/.test(actualDate)?Number(actualDate):Date.parse(actualDate),day=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
 return (createdAt===undefined||Number.isFinite(stamp)&&day(stamp)===day(createdAt))&&['title','scope','chapter','stage','specialty','note','directoryId'].every(key=>text(row[schema[key].name])===v[key])&&text(row[schema.nature.name]).trim()===v.nature&&(!v.url||safeLinks(row[schema.url.name]).some(l=>l.url===v.url));
}
export class DocumentAdapter extends BaseAdapter{
 async schema(source){return documentSchema(source,(await this.cli('+field-list',['--table-id',source.id])).fields);}
 async ensureCategory(source,name){
  let schema=await this.schema(source);if(schema.nature.options.some(o=>o.name.trim()===name))return schema;
  const current=schema.nature,definition=Object.fromEntries(['name','type','multiple','options','description','default_value','style'].filter(k=>current[k]!==undefined).map(k=>[k,structuredClone(current[k])]));definition.options.push({name,hue:'Blue',lightness:'Lighter'});
  await this.cli('+field-update',['--table-id',source.id,'--field-id',current.id,'--json',JSON.stringify(definition),'--yes']);
  schema=await this.schema(source);if(!schema.nature.options.some(o=>o.name===name)||current.options.some(old=>!schema.nature.options.some(now=>now.name===old.name&&(!old.hue||now.hue===old.hue)&&(!old.lightness||now.lightness===old.lightness))))throw Error('类别回读不一致，请核对正式表选项。');return schema;
 }
 async find(source,schema,id){const d=await this.cli('+record-search',['--table-id',source.id,'--format','json','--json',JSON.stringify({keyword:id,search_fields:[schema.mutation.name],select_fields:[schema.mutation.name],limit:2})]),rows=normalizeRows(d).filter(r=>text(r[schema.mutation.name])===id);if(d.has_more||rows.length>1)throw Error('提交标识重复，请核对正式表。');return rows[0]||null;}
 async create(source,fields){const r=await this.cli('+record-upsert',['--table-id',source.id,'--json',JSON.stringify(fields)]),id=r.record?.record_id_list?.[0];if(!id)throw Error('创建回执不明确，先核对正式表。');return id;}
 async update(source,id,fields){await this.cli('+record-upsert',['--table-id',source.id,'--record-id',id,'--json',JSON.stringify(fields)]);}
 async get(source,id){return normalizeRows(await this.cli('+record-get',['--table-id',source.id,'--record-id',id,'--format','json']))[0];}
 async upload(source,id,schema,file){await this.cli('+record-upload-attachment',['--table-id',source.id,'--record-id',id,'--field-id',schema.attachments.id,'--file',path.basename(file)],path.dirname(file));}
}
