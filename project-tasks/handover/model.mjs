import { createHash } from 'node:crypto';
import { executionStatus, chinaDay } from './status.mjs';
export { executionStatus, chinaDay } from './status.mjs';
export const binding = Object.freeze({ base:'CID8b8V7CaCtKesWGFKcHTdqnlc', table:'tblgQsrBMFd9eeuX', view:'vewkRPw0CG', appId:'cli_aa547c8de6785ce2', project:'th-001', knowledgeProject:'thailand' });
export const field = (name,type) => ({ name,type });
export const fields = Object.freeze({
  code:field('Task Code（任务编号）','formula'), migrationCode:field('Migration Key（迁移标识）','text'), title:field('Task Description（任务详情）','text'), level:field('Task Level（任务层级）','select'),
  stage:field('Handover Stage（接维阶段）','select'), category:field('Work Category（工作分类）','select'), group:field('Work Package（任务组）','select'),
  parentId:field('Parent Link（父记录）','link'), start:field('Start Time（开始时间）','datetime'), due:field('Due Time（截止时间）','datetime'),
  actualCompletion:field('Actual Completion（实际完成时间）','datetime'), status:field('Project Status（项目进度）','select'),
  owner:field('Owner（责任人）','user'), participants:field('Participants（参与人）','user'), priority:field('Priority（优先级）','select'),
  milestone:field('Milestone（里程碑）','select'), notes:field('Task Notes（任务备注）','text'), goal:field('Task Goal（任务目标）','text'),
  timing:field('Timing Requirements（时间要求）','text'), teams:field('Related Teams（涉及团队）','text'), overseas:field('Overseas Notes（海外差异）','text'),
  requirements:field('Deliverable Requirements（交付物&备注）','text'), feedback:field('Latest Feedback（最新进展反馈）','text'),
  links:field('交付物-链接','text'), attachments:field('Task Attachments（任务交付附件）','attachment'),
  mutation:field('Client Mutation ID（提交标识）','text'), deleted:field('Deleted（已删除）','checkbox'),
  order:field('Row Order（条目排序）','number'), displayCode:field('Display Code（显示编号）','text'),
});
export const failure = (message,status=400) => Object.assign(Error(message),{status});
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const text = value => value == null ? '' : Array.isArray(value) ? value.map(text).join('、') : typeof value==='object' ? String(value.name||value.text||'') : String(value);
export function civilDate(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return chinaDay(value > 1e11 ? value : Date.UTC(1899,11,30)+(value*86400000)-8*3600000);
  const match=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(text(value));
  if (!match) return '';
  const date=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`,parsed=Date.parse(date+'T00:00:00Z');
  return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===date ? date : '';
}
export const stageNumber = value => Number(/Step\s*(\d)/i.exec(text(value))?.[1] || value || 0);
export const ids = value => (Array.isArray(value)?value:[]).map(u=>u.id||u.open_id).filter(Boolean).sort();
export function semantic(type,value) {
  if(type==='number')return value==null||value===''?null:Number.isFinite(Number(value))?Number(value):null;
  if (type==='datetime') return civilDate(value);
  if (type==='user') return ids(value);
  if (type==='checkbox') return value===true||value===1||value==='true';
  if (type==='attachment') return (Array.isArray(value)?value:[]).map(f=>({name:text(f.name),file_token:f.file_token||f.token||'',size:Number(f.size)||0})).sort((a,b)=>a.file_token.localeCompare(b.file_token));
  return text(value);
}
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const valueKeys = Object.keys(fields).filter(k=>!['code','migrationCode','status','mutation','attachments','order','displayCode'].includes(k));
export function normalizeTask(raw,now=Date.now()) {
  const values=Object.fromEntries(valueKeys.map(key=>[key,semantic(fields[key].type,raw[fields[key].name])]));
  values.stage=stageNumber(raw[fields.stage.name]);values.parentId=ids(raw[fields.parentId.name])[0]||'';
  values.milestone=text(raw[fields.milestone.name])==='🚩';
  const row={id:raw.recordId||raw.id,code:text(raw[fields.code.name])||text(raw[fields.migrationCode.name]),...values,order:semantic('number',raw[fields.order.name]),storedDisplayCode:text(raw[fields.displayCode.name]),attachments:semantic('attachment',raw[fields.attachments.name]),values};
  row.status=executionStatus({...row,due:values.due},now);row.version=taskVersion(row);return row;
}
export const taskVersion = task => digest([Object.fromEntries(valueKeys.map(key=>[key,task[key]??task.values?.[key]??null])),task.attachments||[],task.order??null]);
export function schemaOf(input) {
  const schema={};for(const [key,definition] of Object.entries(fields)) {
    const found=input.filter(f=>f.name===definition.name);
    if(!found.length&&['order','displayCode'].includes(key))continue;
    if (found.length!==1||found[0].type!==definition.type) throw failure(`任务字段“${definition.name}”未就绪。`,503);
    schema[key]={...definition,id:found[0].id,multiple:!!found[0].multiple,options:(found[0].options||[]).map(o=>typeof o==='string'?o:o.name)};
  }return schema;
}
export function knownUsers(records,actor,extra=[]) {
  const result=new Map();for(const row of records) for(const key of ['owner','participants']) for(const u of row[fields[key].name]||[]) {
    const id=u.id||u.open_id;if(/^ou_[\w-]+$/.test(id)&&u.name) result.set(id,{id,name:text(u.name)});
  }
  for(const u of extra)if(/^ou_[\w-]+$/.test(u.id)&&u.name)result.set(u.id,{id:u.id,name:u.name});
  if(actor?.openId&&actor.name)result.set(actor.openId,{id:actor.openId,name:actor.name});return [...result.values()];
}
export function validateTaskValues(input,{schema,users=[],records=[],current,now=Date.now()}={}) {
  if(!input||Array.isArray(input)||typeof input!=='object'||!Object.keys(input).length)throw failure('请填写任务内容。');
  const allowed=valueKeys.filter(k=>!['deleted','group'].includes(k)),result={};
  for(const [key,value] of Object.entries(input)) {
    if(!allowed.includes(key))throw failure(key==='status'?'执行状态由计划和实际完成时间计算。':'包含不可编辑的字段。');
    if(['owner','participants'].includes(key)) {
      const known=new Set(users.map(u=>u.id));if(!Array.isArray(value)||value.some(id=>typeof id!=='string'||!known.has(id))||new Set(value).size!==value.length||value.length>(key==='owner'?1:100))throw failure('请从已验证人员账号中选择。');
      result[key]=[...value].sort();
    }else if(key==='milestone') {if(typeof value!=='boolean')throw failure('里程碑标记无效。');result[key]=value;}
    else if(key==='stage') {if(!Number.isInteger(value)||value<1||value>6)throw failure('请选择接维阶段。');result[key]=value;}
    else {
      if(typeof value!=='string'||value.length>(key==='title'?200:10000)||/[\u0000]/.test(value))throw failure('任务字段内容无效或过长。');
      if(fields[key].type==='datetime'&&value&&(!/^\d{4}-\d\d-\d\d$/.test(value)||civilDate(value)!==value))throw failure('日期格式不正确。');
      if(fields[key].type==='select'&&key!=='level'&&value&&!schema[key].options.includes(value))throw failure('字段选项已变化，请刷新。');
      result[key]=value.trim();
    }
  }
  const next={...(current?.values||{}),...result};
  if(!next.title)throw failure('请填写简短任务名称。');
  if(!['任务组','执行项','里程碑'].includes(next.level))throw failure('请选择任务层级。');
  if(!Number.isInteger(next.stage)||next.stage<1||next.stage>6)throw failure('请选择接维阶段。');
  if(next.level==='任务组'&&(Object.hasOwn(input,'start')||Object.hasOwn(input,'due')))throw failure('汇总起止日期由子项自动计算，不能单独修改。');
  if(next.level!=='任务组'&&next.start&&next.due&&next.due<next.start)throw failure('截止日期不能早于开始日期。');
  if(next.actualCompletion&&next.actualCompletion>chinaDay(now))throw failure('实际完成日期不能晚于今天。');
  if(next.level==='执行项') {
    const parent=records.find(r=>r.id===next.parentId&&!r.deleted&&r.level==='任务组');
    if(!parent||parent.stage!==next.stage)throw failure('请选择同一阶段的有效任务组。');
  }else if(next.parentId)throw failure('任务组和独立里程碑不能设置父任务组。');
  if(next.links)for(const line of next.links.split(/[\r\n]+/).filter(Boolean)) {
    const urls=line.match(/https?:\/\/[^\s<>()]+/g);if(!urls?.length)throw failure('交付物链接须包含有效网址。');
    for(const link of urls){let url;try{url=new URL(link);}catch{}if(!url||url.username||url.password)throw failure('交付物链接无效。');}
  }
  return result;
}
export function encodeValues(values,schema,{code,mutation,records=[],order}={}) {
  const encoded={};for(const [key,value] of Object.entries(values)) {
    const f=schema[key];if(!f)throw failure('写入字段未就绪。',503);
    encoded[f.id||f.name]=key==='stage'?f.options.find(name=>stageNumber(name)===value):key==='parentId'?value?[{id:value}]:[]:key==='milestone'?value?'🚩':null:f.type==='user'?value.map(id=>({id})):f.type==='datetime'?value?`${value} 00:00:00`:null:f.type==='select'?value||null:value;
    if(key==='stage'&&!encoded[f.id||f.name])throw failure('阶段选项未就绪。',503);
  }
  if(Object.hasOwn(values,'parentId')){const p=records.find(r=>r.id===values.parentId);encoded[schema.group.id||schema.group.name]=p?`${p.code} ${p.title}`:null;}
  if(order!==undefined){if(!schema.order)throw failure('排序字段尚未就绪。',503);encoded[schema.order.id||schema.order.name]=order;}
  if(code)encoded[schema.migrationCode.id||schema.migrationCode.name]=code;if(mutation)encoded[schema.mutation.id||schema.mutation.name]=mutation;return encoded;
}
