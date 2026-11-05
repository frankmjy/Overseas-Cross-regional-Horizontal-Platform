import {BaseAdapter} from '../research/adapter.mjs';
import {normalizeRows} from '../research/service.mjs';
import {text} from './document-fields.mjs';
export const directoryFields={name:'Category Name（类别名称）',id:'Category ID（类别编号）',chapter:'Chapter（篇章）',parentId:'Parent ID（上级类别编号）',project:'Project Scope（项目范围）',stage:'Stage（阶段编号）',mutation:'Client Mutation ID（提交标识）'};
export function decodeDirectory(row){return Object.fromEntries(Object.entries(directoryFields).map(([k,n])=>[k,text(row[n])]));}
export class DirectoryAdapter extends BaseAdapter{
 async schema(){const fields=(await this.cli('+field-list',['--table-id',this.config.directoryTable])).fields,out={};for(const [key,name]of Object.entries(directoryFields)){const f=fields.find(f=>f.name===name&&f.type==='text');if(!f)throw Error('目录字段未就绪：'+name);out[key]=f;}return out;}
 async list(){const rows=[];let offset=0;for(let page=0;page<100;page++){const r=await this.cli('+record-list',['--table-id',this.config.directoryTable,'--limit','200','--offset',String(offset),'--format','json']),next=normalizeRows(r);rows.push(...next.map(decodeDirectory));if(!r.has_more)return rows;if(!next.length)throw Error('目录分页未前进。');offset+=next.length;}throw Error('目录数量超过读取上限。');}
 async find(id){const r=await this.cli('+record-search',['--table-id',this.config.directoryTable,'--format','json','--json',JSON.stringify({keyword:id,search_fields:[directoryFields.id],limit:2})]),rows=normalizeRows(r).map(decodeDirectory).filter(n=>n.id===id);if(r.has_more||rows.length>1)throw Error('目录编号重复，请管理员核对。');return rows[0]||null;}
 async create(node){const schema=await this.schema(),fields=Object.fromEntries(Object.keys(directoryFields).map(k=>[schema[k].id,node[k]||''])),r=await this.cli('+record-upsert',['--table-id',this.config.directoryTable,'--json',JSON.stringify(fields)]);if(!r.record?.record_id_list?.[0])throw Error('目录创建回执不明确，请核对。');}
}
