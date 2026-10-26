import { BaseAdapter } from './research/adapter.mjs';

const baseToken = 'CID8b8V7CaCtKesWGFKcHTdqnlc';
const tables = { thailand: 'tblkoqsI8DCwbUet', malaysia: 'tblwYKJwXmrdqqLb' };
const columns = {
  number:'Record No.（编号）',name:'Full Name（姓名文本）',account:'Feishu Account（飞书账号）',
  role:'Position（岗位）',building:'Building（楼栋）',source:'Staffing Source（人员来源）',
  region:'Original Region（原区域）',site:'Original Site（原机房）',employment:'Employment Type（用工方式）',
  requiredArrival:'Required Arrival（需求到岗日期）',plannedArrival:'Planned Arrival（计划到岗日期）',
  actualArrival:'Actual Arrival（实际到岗日期）',status:'Mobilization Status（筹备状态）',
};
function text(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join('、');
  if (value && typeof value === 'object') return text(value.name ?? value.text ?? value.value ?? '');
  return value == null ? '' : String(value).trim();
}
function date(value) {
  const raw=text(value), match=raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const serial=Number(raw);
  return raw && Number.isFinite(serial) && serial>0 && serial<300000
    ? new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString().slice(0,10) : '';
}
export function normalizeTeamRows(data, project) {
  if (!Array.isArray(data?.fields) || !Array.isArray(data.data) || !Array.isArray(data.record_id_list)
    || data.data.length!==data.record_id_list.length || data.data.some(r=>!Array.isArray(r)||r.length!==data.fields.length)) throw Error('团队表数据结构不完整。');
  for (const key of ['name','account','role','building']) if (!data.fields.includes(columns[key])) throw Error('团队表字段已变更，请核对正式表。');
  const identities=new Map(), records=new Set(), result=[];
  for (const [index,row] of data.data.entries()) {
    const get=key=>row[data.fields.indexOf(columns[key])];
    const account=get('account'), name=text(get('name')) || text(account);
    if (!name) continue;
    const person=Object.fromEntries(Object.keys(columns).filter(k=>k!=='account').map(key=>[key,key.endsWith('Arrival')?date(get(key)):text(get(key))]));
    person.name=name; person.accountName=text(account); person.id=data.record_id_list[index];
    person.url=`https://vnet.feishu.cn/base/${baseToken}?table=${tables[project]}&record=${encodeURIComponent(person.id)}`;
    const ids=(Array.isArray(account)?account:[]).map(u=>u.id).filter(Boolean);
    if (ids.length>1) throw Error('团队表单个人员行包含多个账号，请核对。');
    if (records.has(person.id)) throw Error('团队表分页记录重复，请重试。');
    records.add(person.id);
    const identity=ids[0] || `name:${name}`, previous=identities.get(identity);
    if (previous) {
      if (previous.name!==name || previous.role!==person.role || previous.building!==person.building) throw Error('团队表存在重复账号且岗位或楼栋不一致，请核对。');
      continue;
    }
    identities.set(identity,person); result.push(person);
  }
  return result;
}

export class TeamOrganizationService {
  constructor({adapter=new BaseAdapter({baseToken}),now=()=>Date.now()}={}) { this.adapter=adapter;this.now=now;this.cache=new Map();this.pending=new Map(); }
  async read(project='thailand', {refresh=false}={}) {
    if (!Object.hasOwn(tables,project)) throw Error('项目不受支持。');
    if (this.pending.has(project)) return this.pending.get(project);
    const cached=this.cache.get(project);
    if (!refresh && cached && this.now()-cached.at<60000) return cached.data;
    const task=this.fetch(project).then(people=>{
      const data={people,updatedAt:new Date(this.now()).toISOString(),sourceUrl:`https://vnet.feishu.cn/base/${baseToken}?table=${tables[project]}`};
      this.cache.set(project,{at:this.now(),data});return data;
    }).finally(()=>this.pending.delete(project));
    this.pending.set(project,task);return task;
  }
  async fetch(project) {
    let offset=0, revision, fields;const rows=[],ids=[];
    for (let page=0;page<100;page++) {
      let data;
      try { data=await this.adapter.cli('+record-list',['--table-id',tables[project],'--limit','200','--offset',String(offset),'--format','json',...Object.values(columns).flatMap(name=>['--field-id',name])]); }
      catch { throw Error('团队表读取失败，请检查应用配置、表授权和网络后重试。'); }
      if (!Array.isArray(data?.data)||!Array.isArray(data.fields)||!Array.isArray(data.record_id_list)||data.data.length!==data.record_id_list.length) throw Error('团队表返回数据不完整。');
      if (page && (revision!==data.rev || JSON.stringify(fields)!==JSON.stringify(data.fields))) throw Error('读取期间团队表发生变化，请重试。');
      revision=data.rev;fields=data.fields;rows.push(...data.data);ids.push(...data.record_id_list);
      if (!data.has_more) return normalizeTeamRows({fields,data:rows,record_id_list:ids},project);
      if (!data.data.length) throw Error('团队表分页没有前进，已停止读取。');
      offset+=data.data.length;
    }
    throw Error('团队表超过读取上限，未返回不完整数据。');
  }
}
