import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DocumentAdapter,documentFields,documentSchema} from '../knowledge/document-fields.mjs';
const configFile=path.resolve('knowledge/config.json'),config=JSON.parse(fs.readFileSync(configFile,'utf8')),adapter=new DocumentAdapter(config),dir=path.resolve('reports/knowledge-write-20261101');
fs.mkdirSync(dir,{recursive:true});
if(!fs.existsSync(path.join(dir,'config.before.json')))fs.copyFileSync(configFile,path.join(dir,'config.before.json'));
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function records(source,names){const rows=[];let offset=0;for(let page=0;page<100;page++){const r=await adapter.cli('+record-list',['--table-id',source.id,'--limit','200','--offset',String(offset),'--format','json']);if(!Array.isArray(r.data)||!Array.isArray(r.record_id_list)||r.data.length!==r.record_id_list.length||names.some(n=>!r.fields.includes(n)))throw Error('Record projection incompatible');rows.push(...r.data.map((row,i)=>[r.record_id_list[i],names.map(name=>row[r.fields.indexOf(name)]??null)]));if(!r.has_more)return rows.sort(([a],[b])=>a.localeCompare(b));if(!r.data.length)throw Error('Pagination stalled');offset+=r.data.length;}throw Error('Record limit');}
const audit=[];
for(const source of config.sources.filter(s=>['project-document','index','equipment'].includes(s.kind))){
 const before=(await adapter.cli('+field-list',['--table-id',source.id])).fields,names=before.map(f=>f.name),original=await records(source,names);
 if(!fs.existsSync(path.join(dir,source.id+'.before.json')))fs.writeFileSync(path.join(dir,source.id+'.before.json'),JSON.stringify({fields:before,records:original}));
 const missing=Object.values(documentFields(source)).filter(([name])=>!before.some(f=>f.name===name)).map(([name,type])=>({name,type,description:'知识库前端录入字段；保留原有资料与来源。'}));
 for(const field of missing)await adapter.cli('+field-create',['--table-id',source.id,'--json',JSON.stringify(field)]);
 const after=(await adapter.cli('+field-list',['--table-id',source.id])).fields;documentSchema(source,after);
 const current=await records(source,names);if(digest(original)!==digest(current))throw Error('Existing record content changed: '+source.id);
 for(const field of before){const actual=after.find(f=>f.id===field.id);if(!actual||digest(actual)!==digest(field))throw Error('Existing field definition changed: '+field.name);}
 for(const key of ['Library Scope','Lifecycle Chapter','Lifecycle Stage','Discipline','Notes','Shared At','Attachments']){const field=after.find(f=>f.name.startsWith(key+'（'));if(field&&!Object.hasOwn(source.fields,key))source.fields[key]={id:field.id,name:field.name};}
 source.writable=true;audit.push({table:source.id,addedFields:missing.map(f=>f.name),preservedRecords:original.length,beforeSha256:digest(original),afterSha256:digest(current)});
 fs.writeFileSync(path.join(dir,source.id+'.schema.json'),JSON.stringify(after,null,2));
}
fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n');fs.writeFileSync(path.join(dir,'schema-audit.json'),JSON.stringify({ok:true,appId:'cli_aa547c8de6785ce2',tables:audit},null,2));console.log(JSON.stringify({ok:true,tables:audit.map(({table,addedFields,preservedRecords})=>({table,addedFields:addedFields.length,preservedRecords}))}));
