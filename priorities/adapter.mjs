import path from 'node:path';
import { BaseAdapter } from '../research/adapter.mjs';
import { normalizeRows } from '../research/service.mjs';
import { baseToken,projects,fields } from './model.mjs';
import { usersOf,text } from '../project-tasks/model.mjs';
export class PriorityAdapter{
 constructor(){this.base=new BaseAdapter({baseToken});}
 cli(project,command,args=[]){return this.base.cli(command,['--table-id',projects[project].table,...args,...(['+record-list','+record-get'].includes(command)?['--format','json']:[])]);}
 async listTable(table){const rows=[];let revision;for(let offset=0,page=0;page<100;page++){const r=await this.base.cli('+record-list',['--table-id',table,'--format','json','--limit','200','--offset',String(offset)]);if(revision!==undefined&&r.rev!==revision)throw Error('读取期间表格发生变化，请重试。');revision=r.rev;const batch=normalizeRows(r);rows.push(...batch);if(!r.has_more)return rows;if(!batch.length)throw Error('分页未前进。');offset+=batch.length;}throw Error('数据超过读取上限。');}
 list(project){return this.listTable(projects[project].table);}
 async context(project){const result=await this.cli(project,'+field-list'),schema={};for(const [key,[name,type]]of Object.entries(fields)){const f=result.fields.find(f=>f.name===name);if(!f||f.type!==type)throw Error(`字段不匹配：${name}`);if(key==='links'&&f.style?.type&&f.style.type!=='plain')throw Error('参考链接字段须使用普通文本格式，以保留多个资料名称与网址。');if(key==='planIds'&&f.link_table!==projects[project].tasks)throw Error('关联计划目标表不匹配。');schema[key]={id:f.id,name,type,multiple:!!f.multiple,options:(f.options||[]).map(o=>o.name)};}const tasks=await this.listTable(projects[project].tasks);return {schema,people:usersOf(tasks),plans:tasks.filter(r=>text(r['Task Description（任务详情）'])).map(r=>({recordId:r.recordId,code:text(r['Task Code（任务编号）']),title:text(r['Task Description（任务详情）'])}))};}
 async get(project,id){return normalizeRows(await this.cli(project,'+record-get',['--record-id',id]))[0];}
 async create(project,patch){const result=await this.cli(project,'+record-upsert',['--json',JSON.stringify(patch)]);const id=result.record?.record_id_list?.[0];if(!id)throw Error('创建回执未包含记录 ID。');return id;}
 update(project,id,patch){return this.cli(project,'+record-upsert',['--record-id',id,'--json',JSON.stringify(patch)]);}
 async upload(project,id,file,field){return this.base.cli('+record-upload-attachment',['--table-id',projects[project].table,'--record-id',id,'--field-id',field,'--file',path.basename(file)],path.dirname(file));}
 remove(project,id,tokens,field){return this.cli(project,'+record-remove-attachment',['--record-id',id,'--field-id',field,...tokens.flatMap(token=>['--file-token',token]),'--yes']);}
 download(project,id,token,file){return this.base.cli('+record-download-attachment',['--table-id',projects[project].table,'--record-id',id,'--file-token',token,'--output',path.basename(file),'--overwrite'],path.dirname(file));}
}
