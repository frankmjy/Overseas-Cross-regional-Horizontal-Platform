import {BaseAdapter} from '../research/adapter.mjs';
import {normalizeRows} from '../research/service.mjs';
import {failure} from './storage.mjs';
import {safeLinks} from './model.mjs';

export const mutationField='Client Mutation ID（提交标识）';
export const fields={title:['Meeting Title（会议名称）','text'],date:['Meeting Date（会议日期）','datetime'],time:['Meeting Time（会议时间）','text'],participants:['Participants（参与人）','user'],summary:['Summary（会议概要）','text'],actions:['Action Items（待办事项）','text'],status:['Status（状态）','select'],priority:['Priority（优先级）','select'],minutes:['Minutes Link（纪要链接）','text'],recording:['Recording Link（妙记链接）','text']};
export const text=v=>v==null?'':Array.isArray(v)?v.map(text).join(''):typeof v==='object'?String(v.name||v.text||''):String(v);
const instant=v=>{const s=text(v);return /^\d{13}$/.test(s)?Number(s):Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d/.test(s)?s.replace(' ','T')+'+08:00':s);};
export function schemaOf(metadata){
 const schema={};for(const [key,[name,type]]of Object.entries(fields)){const matches=metadata.filter(f=>f.name===name);if(matches.length!==1||matches[0].type!==type||type==='select'&&matches[0].multiple||type==='user'&&!matches[0].multiple)throw Error(`会议字段“${name}”缺失或类型不兼容。`);const f=matches[0];schema[key]={id:f.id,name,type,...type==='select'?{options:f.options.map(o=>o.name)}:{}};}
 const ids=metadata.filter(f=>f.name===mutationField);if(ids.length>1||ids.length&&ids[0].type!=='text')throw Error('会议提交标识字段类型不兼容。');schema.mutation=ids[0]||null;
 const project=metadata.find(f=>f.name==='Project（项目归属）');if(project){if(project.type!=='select'||!project.options.some(o=>o.name==='海外运维'))throw Error('海外团队项目归属字段不兼容。');schema.project={id:project.id,name:project.name};}return schema;
}
export function validateMeeting(raw,schema,people){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw failure('会议信息格式不正确。');
 const allowed=new Set(['clientMutationId','project',...Object.keys(fields)]);if(Object.keys(raw).some(k=>!allowed.has(k)))throw failure('包含不支持的会议字段。');
 const value={};for(const key of Object.keys(fields).filter(k=>k!=='participants')){if(raw[key]!=null&&typeof raw[key]!=='string')throw failure('会议字段格式不正确。');value[key]=(raw[key]||'').trim();if(value[key].length>(['summary','actions'].includes(key)?20000: key==='title'?200:2048))throw failure('填写内容过长。');}
 if(!value.title)throw failure('请填写会议名称。');
 if(!/^\d{4}-\d\d-\d\d$/.test(value.date)||!/^\d\d:\d\d$/.test(value.time))throw failure('请填写会议日期和时间。');
 const stamp=value.date+'T'+value.time+':00+08:00',ms=Date.parse(stamp);if(!Number.isFinite(ms)||new Date(ms+8*3600000).toISOString().slice(0,16)!==value.date+'T'+value.time)throw failure('会议日期或时间无效。');
 for(const key of ['status','priority'])if(!schema[key].options.includes(value[key]))throw failure(`请选择有效的${key==='status'?'状态':'优先级'}。`);
 for(const key of ['minutes','recording'])if(value[key]){let url;try{url=new URL(value[key]);}catch{throw failure('资料链接格式不正确。');}if(url.protocol!=='https:'||url.username||url.password)throw failure('资料链接须为不含账号密码的 HTTPS 地址。');value[key]=url.href;}
 if(!Array.isArray(raw.participants)||raw.participants.length>100||raw.participants.some(id=>typeof id!=='string'||!people.some(p=>p.id===id)))throw failure('请选择已有飞书账号，不能以姓名代替人员关联。');value.participants=[...new Set(raw.participants)].sort();return value;
}
export function encodeMeeting(value,schema,id){const out={};for(const [key,f]of Object.entries(schema)){if(!fields[key])continue;out[f.id]=key==='date'?value.date+' '+value.time+':00':key==='participants'?value.participants.map(id=>({id})):value[key];}out[schema.mutation.id]=id;if(schema.project)out[schema.project.id]='海外运维';return out;}
export function matchesMeeting(row,value,schema,id){
 if(!row||text(row[schema.mutation.name])!==id)return false;
 return Object.entries(fields).every(([key])=>{const actual=row[schema[key].name];if(key==='date')return instant(actual)===Date.parse(value.date+'T'+value.time+':00+08:00');if(key==='participants')return JSON.stringify((Array.isArray(actual)?actual:[]).map(p=>p.id||p.open_id).sort())===JSON.stringify(value.participants);if(['minutes','recording'].includes(key)&&value[key]){const links=safeLinks(actual);return links.length===1&&links[0].url===value[key];}return text(actual)===value[key];})&&(!schema.project||text(row[schema.project.name])==='海外运维');
}
export class MeetingAdapter extends BaseAdapter{
 async schema(source){return schemaOf((await this.cli('+field-list',['--table-id',source.id])).fields);}
 async ensureKey(source,schema){if(schema.mutation)return schema;await this.cli('+field-create',['--table-id',source.id,'--json',JSON.stringify({name:mutationField,type:'text',description:'网页会议提交幂等标识，请勿手动修改。'})]);const next=await this.schema(source);if(!next.mutation)throw Error('会议提交标识字段未就绪。');return next;}
 async people(source,schema){let offset=0,rev;const people=new Map();for(let page=0;page<100;page++){const d=await this.cli('+record-list',['--table-id',source.id,'--limit','200','--offset',String(offset),'--field-id',schema.participants.id]);if(rev!==undefined&&rev!==d.rev)throw Error('会议人员读取期间表已变更，请重试。');rev=d.rev;const rows=normalizeRows(d);for(const r of rows)for(const p of Array.isArray(r[schema.participants.name])?r[schema.participants.name]:[])if(/^ou_\w+$/.test(p.id||p.open_id||'')&&p.name)people.set(p.id||p.open_id,{id:p.id||p.open_id,name:p.name});if(!d.has_more)return [...people.values()];if(!rows.length)throw Error('会议人员分页没有前进。');offset+=rows.length;}throw Error('会议人员超过读取上限。');}
 async find(source,schema,id){const d=await this.cli('+record-search',['--table-id',source.id,'--format','json','--json',JSON.stringify({keyword:id,search_fields:[schema.mutation.name],select_fields:[schema.mutation.name],limit:2})]);const rows=normalizeRows(d).filter(r=>text(r[schema.mutation.name])===id);if(d.has_more||rows.length>1)throw Error('会议提交标识存在重复，请核对后重试。');return rows[0]||null;}
 async create(source,fields){const result=await this.cli('+record-upsert',['--table-id',source.id,'--json',JSON.stringify(fields)]);const id=result.record?.record_id_list?.[0];if(!id)throw Error('创建回执不明确，请先核对会议记录。');return id;}
 async get(source,id){return normalizeRows(await this.cli('+record-get',['--table-id',source.id,'--record-id',id,'--format','json']))[0];}
}
