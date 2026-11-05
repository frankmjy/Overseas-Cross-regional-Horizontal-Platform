import fs from 'node:fs/promises';
import path from 'node:path';
import {BaseAdapter} from '../research/adapter.mjs';
import {saveJson} from '../knowledge/storage.mjs';
import {projectMaterial,materialFields} from './model.mjs';
import {CoordinationMutations,materialVersion,calculatedFields} from './mutations.mjs';

export class CoordinationAdapter extends BaseAdapter{
 identity(){if(process.env.FEISHU_APP_ID&&process.env.FEISHU_APP_ID!==this.config.appId)throw Error('开办物资仅允许使用定盘星应用。');}
 async schema(){this.identity();const data=await this.cli('+field-list',['--table-id',this.config.table,'--profile',this.config.appId]);if(!Array.isArray(data.fields))throw Error('物资字段结构无效。');return materialFields.map(f=>{const remote=data.fields.find(s=>s.id===this.config.fields[f.key].id),expected=calculatedFields.has(f.key)?'formula':['select','multi'].includes(f.type)?'select':f.type;if(!remote||remote.type!==expected||(expected==='select'&&!!remote.multiple!==(f.type==='multi')))throw Error('物资字段类型已变化，请核对。');return {...f,editable:!calculatedFields.has(f.key),options:(remote.options||[]).map(o=>o.name)};});}
 async list({withKeys=false}={}){this.identity();const records=[],ids=new Set(),entries=[...Object.entries(this.config.fields),...(withKeys?[['importKey',this.config.importKey]]:[])];let offset=0;
  for(let page=0;page<100;page++){
   const p=await this.cli('+record-list',['--table-id',this.config.table,'--limit','200','--offset',String(offset),'--format','json',...entries.flatMap(([,f])=>['--field-id',f.id]),'--profile',this.config.appId]);
   if(!Array.isArray(p.fields)||!Array.isArray(p.data)||!Array.isArray(p.record_id_list)||p.data.length!==p.record_id_list.length)throw Error('物资分页数据无效。');
   if(p.has_more&&!p.data.length)throw Error('物资分页没有前进。');
   const columns=entries.map(([key,f])=>{const i=p.fields.indexOf(f.name);if(i<0)throw Error('物资字段已变化，请核对配置。');return [key,i];});
   for(const [i,cells]of p.data.entries()){
    if(!Array.isArray(cells)||cells.length!==p.fields.length)throw Error('物资行数据不完整。');const id=p.record_id_list[i];if(ids.has(id))throw Error('物资分页出现重复记录。');ids.add(id);const projected=Object.fromEntries(columns.map(([k,j])=>[k,cells[j]]));records.push({...projectMaterial({id,cells:projected}),...(withKeys?{importKey:projected.importKey||''}:{})});
   }
   if(!p.has_more)return records;offset+=p.data.length;
  }throw Error('物资记录超过读取上限，未返回不完整结果。');
 }
 async write(id,values,importKey){this.identity();const schema=await this.schema(),fields={};for(const [key,value]of Object.entries(values)){const f=schema.find(f=>f.key===key);if(!f?.editable)throw Error('物资字段不允许写入。');fields[this.config.fields[key].id]=f.type==='select'?value?[value]:null:f.type==='multi'?value.length?value:null:value===''?null:value;}if(importKey)fields[this.config.importKey.id]=importKey;const data=await this.cli('+record-upsert',['--table-id',this.config.table,...(id?['--record-id',id]:[]),'--json',JSON.stringify(fields),'--profile',this.config.appId]);if(data.ignored_fields?.length||data.record?.ignored_fields?.length)throw Error('飞书忽略了写入字段，请核对。');const recordId=id||data.record?.record_id_list?.[0];if(!recordId)throw Error('创建回执缺少记录标识。');return recordId;}
 create(values,importKey){return this.write('',values,importKey);}
 update(id,values){return this.write(id,values);}
}
export class CoordinationService{
 constructor({config,adapter=new CoordinationAdapter(config),cacheFile,now=Date.now,isMaintenance=()=>false}){this.config=config;this.adapter=adapter;this.cacheFile=cacheFile;this.now=now;this.isMaintenance=isMaintenance;this.records=null;this.updatedAt=null;this.attemptedAt=null;this.error='';this.refreshing=null;this.closed=false;this.binding=`${config.appId}:${config.baseToken}:${config.table}:1`;this.schema=[];this.queue=Promise.resolve();this.writer=new CoordinationMutations({file:cacheFile?path.join(path.dirname(cacheFile),'mutations.json'):null,binding:this.binding,adapter,getSchema:()=>this.schema,getRows:()=>this.records||[],publish:rows=>this.publish(rows),isMaintenance,serial:fn=>this.serial(fn)});}
 async init(){await this.writer.init();if(!this.cacheFile)return;try{
  const cache=JSON.parse(await fs.readFile(this.cacheFile,'utf8'));if(cache.binding!==this.binding)return;
  if(!Array.isArray(cache.records)||!Number.isFinite(Date.parse(cache.updatedAt)))throw Error('invalid cache');
  if(cache.records.some(r=>!Object.hasOwn(r,'specialty'))){this.error='分类字段已更新，请刷新物资数据。';return;}
  this.records=cache.records.map(r=>projectMaterial({id:r.id,cells:r}));if(new Set(this.records.map(r=>r.id)).size!==this.records.length)throw Error('invalid cache');this.updatedAt=cache.updatedAt;this.schema=cache.schema||[];
 }catch(e){if(e.code!=='ENOENT')this.error='本地缓存读取失败，请刷新。';}}
 refresh(){if(this.refreshing)return this.refreshing;if(this.closed)return Promise.resolve();if(this.isMaintenance()){this.error='正在应用配置，请稍后刷新。';return Promise.resolve();}
  this.attemptedAt=this.now();this.refreshing=this.serial(async()=>{try{
   const incoming=await this.adapter.list({withKeys:true}),schema=this.adapter.schema?await this.adapter.schema():[],updatedAt=new Date(this.now()).toISOString();
   if(!Array.isArray(incoming))throw Error('invalid records');this.writer.reconcile(incoming);const records=incoming.map(r=>projectMaterial({id:r.id,cells:r}));
   this.schema=schema;this.records=records;this.updatedAt=updatedAt;this.error='';
   if(this.cacheFile)try{saveJson(this.cacheFile,{binding:this.binding,updatedAt,records,schema});}catch{this.error='数据已更新，服务器缓存保存失败。';}
  }catch{this.error='物资读取失败，请重试；如持续失败，请检查飞书连接和表权限。';}}).finally(()=>{this.refreshing=null;});return this.refreshing;
 }
 read({refresh=false,actor}={}){if(!this.refreshing&&!this.closed&&(refresh||this.attemptedAt===null||this.now()-this.attemptedAt>60000))this.refresh();return this.snapshot(actor);}
 serial(fn){const task=this.queue.then(fn);this.queue=task.catch(()=>{});return task;}
 publish(records){const updatedAt=new Date(this.now()).toISOString();if(this.cacheFile)saveJson(this.cacheFile,{binding:this.binding,updatedAt,records,schema:this.schema});this.records=records;this.updatedAt=updatedAt;}
 snapshot(actor){return {state:this.error?(this.records===null?'error':'partial'):this.records!==null?'ready':this.refreshing?'loading':'idle',records:this.writer.visibleRecords(this.records||[]).map(r=>({...r,version:materialVersion(r)})),fields:this.schema,operations:this.writer.snapshot(actor),updatedAt:this.updatedAt,refreshing:!!this.refreshing,error:this.error||this.writer.error||''};}
 start(){this.writer.start();}
 async close(){this.closed=true;await this.writer.close();await this.refreshing;}
}
