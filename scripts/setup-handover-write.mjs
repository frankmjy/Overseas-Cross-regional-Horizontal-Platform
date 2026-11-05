import fs from 'node:fs/promises';
import path from 'node:path';
import {HandoverAdapter} from '../project-tasks/handover/adapter.mjs';
import {fields,binding,schemaOf} from '../project-tasks/handover/model.mjs';
import {executionStatuses} from '../project-tasks/handover/status.mjs';
const apply=process.argv.includes('--apply'),adapter=new HandoverAdapter(),before=await adapter.rawSchema();
const additions=['mutation','deleted','attachments'].filter(k=>!before.some(f=>f.name===fields[k].name));
const status=before.find(f=>f.name===fields.status.name);
if(!status||status.type!=='select'||status.multiple)throw Error('执行状态字段不兼容，未执行变更。');
const extra=executionStatuses.filter(name=>!status.options.some(o=>o.name===name));
for(const [key,definition]of Object.entries(fields)){
  const found=before.filter(f=>f.name===definition.name);
  if(found.length>1||found.length===1&&found[0].type!==definition.type||!found.length&&!additions.includes(key)&&!['order','displayCode'].includes(key))throw Error(`任务字段不兼容：${definition.name}`);
}
const reportDir=path.resolve('reports/handover-workspace-write-20261101');await fs.mkdir(reportDir,{recursive:true});
await fs.writeFile(path.join(reportDir,apply?'schema-before-apply.json':'schema-preflight.json'),JSON.stringify(before,null,2));
if(apply){
 for(const key of additions)await adapter.call('+field-create',['--json',JSON.stringify(fields[key])]);
 if(extra.length){const definition=Object.fromEntries(['name','type','multiple','options','description','default_value','style'].filter(k=>status[k]!==undefined).map(k=>[k,structuredClone(status[k])]));for(const name of extra)definition.options.push({name,hue:name==='已完成'?'Green':'Red',lightness:'Light'});await adapter.call('+field-update',['--field-id',status.id,'--json',JSON.stringify(definition),'--yes']);}
 const after=await adapter.rawSchema();schemaOf(after);
 if(before.some(old=>{const next=after.find(f=>f.id===old.id);return !next||next.name!==old.name||next.type!==old.type||(old.options||[]).some(option=>!(next.options||[]).some(o=>o.name===option.name));}))throw Error('字段回读不一致，已保留变更前快照。');
 await fs.writeFile(path.join(reportDir,'schema-after.json'),JSON.stringify(after,null,2));
}
console.log(JSON.stringify({applied:apply,app:binding.appId,table:binding.table,addFields:additions.map(k=>fields[k].name),addStatuses:extra,recordWrites:0}));
