import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {BaseAdapter} from '../../research/adapter.mjs';
import {normalizeRows} from '../../research/service.mjs';
import {binding,fields,schemaOf,text,failure} from './model.mjs';
const exec=promisify(execFile);
const installedCli=path.join(path.dirname(process.execPath),'node_modules/@larksuite/cli/scripts/run.js');
const projection=[...new Set([...Object.values(fields).map(f=>f.name),'Delivery Batch（交付批次）','Action Type（动作类型）','Schedule Basis（排期依据）','Source Record（源记录）','Source Owner（计划责任信息）','交付物-附件'])];
export class HandoverAdapter extends BaseAdapter {
  constructor(){super({baseToken:binding.base,cliScript:existsSync(installedCli)?installedCli:undefined});}
  async assertIdentity(){
    if(process.env.FEISHU_APP_ID&&process.env.FEISHU_APP_ID!==binding.appId)throw failure('当前应用不是定盘星，已停止接维读写。',409);
    if(this.checkedAt&&Date.now()-this.checkedAt<300000)return;
    const vendor=path.resolve('vendor/lark-cli/run.cjs'),script=process.env.LARK_CLI_SCRIPT||this.config.cliScript||vendor;
    let result;try{const {stdout}=await exec(process.execPath,[script,'auth','status'],{windowsHide:true,timeout:15000,maxBuffer:100000});result=JSON.parse(stdout);}catch{throw failure('无法核对定盘星应用连接，请检查服务配置。',503);}
    if(result.appId!==binding.appId)throw failure('飞书CLI与定盘星应用不一致，已停止接维读写。',409);this.checkedAt=Date.now();
  }
  async call(command,args=[],cwd=process.cwd()){await this.assertIdentity();return this.cli(command,['--table-id',binding.table,...args],cwd);}
  async rawSchema(){return(await this.call('+field-list')).fields;}
  async schema(){this.cachedSchema=schemaOf(await this.rawSchema());return this.cachedSchema;}
  projection(){return projection.filter(name=>name!==fields.order.name&&name!==fields.displayCode.name||!!this.cachedSchema?.order&&!!this.cachedSchema?.displayCode);}
  async list(){
    const all=[],seen=new Set();let revision;
    for(let page=0,offset=0;page<100;page++){
      const response=await this.call('+record-list',['--format','json','--limit','200','--offset',String(offset),...this.projection().flatMap(f=>['--field-id',f])]),rows=normalizeRows(response);
      if(revision!==undefined&&response.rev!==revision)throw failure('读取期间源表发生变化，请重试。',503);revision=response.rev;
      for(const r of rows){if(seen.has(r.recordId))throw failure('源表分页重复，未采用不完整数据。',503);seen.add(r.recordId);all.push(r);}
      if(!response.has_more)return all;if(!rows.length)throw failure('源表分页未前进，请重试。',503);offset+=rows.length;
    }throw failure('任务数量超过单次读取上限。',503);
  }
  async get(id){return normalizeRows(await this.call('+record-get',['--record-id',id,'--format','json',...this.projection().flatMap(f=>['--field-id',f])]))[0];}
  async findMutation(id){
    const response=await this.call('+record-search',['--format','json','--json',JSON.stringify({keyword:id,search_fields:[fields.mutation.name],select_fields:this.projection(),limit:2})]);
    const rows=normalizeRows(response).filter(r=>text(r[fields.mutation.name])===id);
    if(response.has_more||rows.length>1)throw failure('提交标识出现重复记录，请核对源表。',409);return rows[0]||null;
  }
  async prepareGroup(value){
    const cached=this.cachedSchema||await this.schema(),name=value[cached.group.id];if(!name||cached.group.options.includes(name))return;
    const raw=(await this.rawSchema()).find(f=>f.id===cached.group.id);if(!raw||raw.type!=='select'||raw.multiple)throw failure('任务组分类字段不兼容。',503);
    if(!raw.options.some(o=>o.name===name)){const definition=Object.fromEntries(['name','type','multiple','options','description','default_value','style'].filter(k=>raw[k]!==undefined).map(k=>[k,structuredClone(raw[k])]));definition.options.push({name,hue:'Blue',lightness:'Lighter'});await this.call('+field-update',['--field-id',raw.id,'--json',JSON.stringify(definition),'--yes']);}
    const verified=await this.schema();if(!verified.group.options.includes(name)||raw.options.some(o=>!verified.group.options.includes(o.name)))throw failure('任务组分类回读不一致。',503);
  }
  async create(value){await this.prepareGroup(value);const result=await this.call('+record-upsert',['--json',JSON.stringify(value)]),id=result.record?.record_id_list?.[0];if(!id)throw failure('新增回执尚未确认，请重试核对。',425);return id;}
  async update(id,value){await this.prepareGroup(value);await this.call('+record-upsert',['--record-id',id,'--json',JSON.stringify(value)]);}
  async batchStatus(ids,status,schema){await this.call('+record-batch-update',['--json',JSON.stringify({record_id_list:ids,patch:{[schema.id||schema.name]:status}})]);}
  async upload(recordId,schema,file){await this.call('+record-upload-attachment',['--record-id',recordId,'--field-id',schema.attachments.id,'--file',path.basename(file)],path.dirname(file));}
}
