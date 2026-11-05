import { createHash } from 'node:crypto';
export const appId='cli_aa547c8de6785ce2';
export const baseToken='CID8b8V7CaCtKesWGFKcHTdqnlc';
export const source={base:'SG59bUqS0aPtcqsdemCcYbKnnse',table:'tblkKtUpnuKzV6uC',view:'vewgJ6qTcW',workbook:'QaqrsmCz0hQ5rBtcSi8cUEKKn5d',sheet:'nJKnxm'};
export const statuses=['待沟通','沟通中','已确认','待入场','已到岗','暂缓','已退出'];
export const fields={assignments:'Project Assignments（项目任职）',name:'Full Name（姓名）',sourceId:'Source Record ID（来源记录ID）',project:'Target Project（目标项目）',role:'Proposed Position（面试建议定岗）',currentRole:'Current Position（当前岗位）',region:'Original Region（原区域）',site:'Original Site（原机房）',intention:'Preferred Locations（意向派驻地）',english:'English Level（英语水平）',tenure:'Overseas Tenure（海外供职年限）',interview:'Interview Note（面试备注）',plannedArrival:'Planned Arrival（来源计划到岗日期）',issues:'Review Issues（待核对事项）',sourceUrl:'Source Link（报名来源链接）',sheetUrl:'Plan Link（计划来源链接）',status:'Follow-up Status（跟进状态）',owner:'Owner（跟进负责人）',actualArrival:'Confirmed Arrival（确认到岗日期）',notes:'Follow-up Notes（跟进说明）',mutation:'Last Mutation ID（最近提交标识）',active:'Source Active（来源有效）'};
export const manual=['status','owner','actualArrival','notes'];
export const text=value=>Array.isArray(value)?value.map(text).filter(Boolean).join('、'):value&&typeof value==='object'?text(value.text??value.name??''):String(value??'').trim();
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const failure=(message,status=400)=>Object.assign(new Error(message),{status});
export function date(value){if(value==null||value==='')return '';if(typeof value==='number'){if(value>1e11)return new Date(value+8*3600000).toISOString().slice(0,10);if(value>0&&value<200000)return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);}const v=text(value).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:'';}
const project=v=>text(v).includes('马来')?'马来西亚项目':text(v).includes('泰国')?'泰国A项目':'';
export function buildCandidates(records,values){
 const header=values.findIndex(r=>text(r[0])==='序号'&&text(r[1])==='姓名');if(header<0)throw failure('人员明细表头已变化，请核对来源。',503);
 const plans=values.slice(header+1).filter(r=>/^\d+$/.test(text(r[0]))&&text(r[1])).map(r=>({name:text(r[1]),role:text(r[2]),currentRole:text(r[3]),region:text(r[4]),site:text(r[5]),project:project(r[6]),plannedArrival:date(r[7])}));
 const counts=new Map();for(const row of records){const name=text(row.fields?.输入填写者姓名);counts.set(name,(counts.get(name)||0)+1);}
 const matched=new Set(),ids=new Set();const people=records.map(r=>{
  if(!r.record_id||ids.has(r.record_id))throw failure('报名记录ID缺失或重复。',503);ids.add(r.record_id);
  const f=r.fields||{},name=text(f.输入填写者姓名),found=plans.filter(p=>p.name===name),issues=[];let p;
  if(!name)issues.push('报名姓名缺失');if(found.length===1&&counts.get(name)===1){p=found[0];matched.add(p);}else issues.push(found.length>1||counts.get(name)>1?'同名多条，未自动匹配计划':'电子表格未匹配，需核对姓名');
  const target=project(f.面试定岗区域);if(target&&p?.project&&target!==p.project)issues.push('项目去向冲突，未补计划日期');
  if(p&&text(f.面试建议定岗)&&text(f.面试建议定岗)!==p.role)issues.push('拟定岗位冲突');
  const chosen=target||p?.project||'';if(!chosen)issues.push('目标项目待确认');
  return {sourceId:r.record_id,name,project:chosen,role:text(f.面试建议定岗),currentRole:text(f.目前所在岗位),region:text(f.所在区域),site:text(f.所在机房),intention:text(f['请选择意向海外派驻地（可多选）']),english:text(f.请评估您的英语水平),tenure:text(f.请选择可在海外供职的年限),interview:text(f.备注),plannedArrival:target&&p?.project&&target!==p.project?'':p?.plannedArrival||'',issues:issues.join('；'),sourceUrl:`https://vnet.feishu.cn/base/${source.base}?table=${source.table}&record=${r.record_id}`,sheetUrl:`https://vnet.feishu.cn/sheets/${source.workbook}?sheet=${source.sheet}`,active:true};
 });return {people,unmatched:plans.filter(p=>!matched.has(p))};
}
export function normalizeTracking(r){const f=r.fields||{},row={id:r.record_id};for(const [key,name]of Object.entries(fields)){const v=f[name];row[key]=key==='assignments'?(Array.isArray(v)?v.map(text):v?[text(v)]:[]):key==='owner'?(Array.isArray(v)?v[0]?.id||'':''):key.endsWith('Arrival')?date(v):key==='active'?v!==false:text(v);}row.status=row.status||'待沟通';row.ownerName=Array.isArray(f[fields.owner])?f[fields.owner][0]?.name||'':'';row.version=hash(manual.map(k=>row[k]));return row;}
export function validatePatch(value){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!manual.includes(k)))throw failure('提交包含不允许修改的字段。');const out={};for(const [k,v]of Object.entries(value)){if(typeof v!=='string')throw failure('字段类型无效。');if(k==='status'&&!statuses.includes(v))throw failure('跟进状态无效。');if(k==='owner'&&v&&!/^ou_[a-zA-Z0-9]+$/.test(v))throw failure('负责人必须使用有效飞书ID。');if(k==='actualArrival'&&v&&!date(v))throw failure('到岗日期无效。');if(k==='notes'&&v.length>5000)throw failure('跟进说明不能超过5000字。');out[k]=v.trim();}return out;}
export function encode(value){return Object.fromEntries(Object.entries(value).map(([k,v])=>{if(!fields[k])throw failure('字段未定义。');return [fields[k],k==='owner'?(v?[{id:v}]:[]):k.endsWith('Arrival')?(v?Date.parse(v+'T00:00:00+08:00'):null):v];}));}
