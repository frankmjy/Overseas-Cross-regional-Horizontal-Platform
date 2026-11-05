import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DocumentAdapter} from '../knowledge/document-fields.mjs';
import {DirectoryAdapter,directoryFields} from '../knowledge/directory-adapter.mjs';
import {builtinDirectory} from '../knowledge/directory.mjs';

const file=path.resolve('knowledge/config.json'),config=JSON.parse(fs.readFileSync(file)),adapter=new DocumentAdapter(config);
const dir=path.resolve('reports/knowledge-directory-20261101');fs.mkdirSync(dir,{recursive:true});
const save=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const tables=[];for(let offset=0;offset<10000;offset+=200){const r=await adapter.cli('+table-list',['--limit','200','--offset',String(offset)]);tables.push(...r.tables);if(tables.length>=r.total||r.tables.length<200)break;}
const name='01.06 Knowledge Categories（资料目录）',matching=tables.filter(t=>config.directoryTable?t.id===config.directoryTable:t.name===name);assert(matching.length<=1,'同名目录表需人工核对');
if(!matching.length){save('create-intent.json',{name,at:new Date().toISOString()});const r=await adapter.cli('+table-create',['--name',name,'--fields',JSON.stringify(Object.values(directoryFields).map(name=>({name,type:'text'})))]);assert(r.table?.id,'目录表回执不明确，先回读表清单，勿重复创建');matching.push(r.table);save('create-receipt.json',r);}
config.directoryTable=matching[0].id;fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');
const directory=new DirectoryAdapter(config);await directory.schema();
for(const builtin of builtinDirectory){const node={...builtin,mutation:'builtin:'+builtin.id};delete node.builtin;const existing=await directory.find(node.id);if(!existing)await directory.create(node);const actual=await directory.find(node.id);for(const k of Object.keys(directoryFields))assert.equal(actual[k]||'',node[k]||'','内置目录回读不一致');}
async function rows(source,names){const all=[];let offset=0;for(let page=0;page<100;page++){const r=await adapter.cli('+record-list',['--table-id',source.id,'--limit','200','--offset',String(offset),'--format','json']);assert(names.every(n=>r.fields.includes(n)));all.push(...r.data.map((row,i)=>[r.record_id_list[i],names.map(n=>row[r.fields.indexOf(n)]??null)]));if(!r.has_more)return all.sort(([a],[b])=>a.localeCompare(b));assert(r.data.length);offset+=r.data.length;}throw Error('分页超限');}
const audit=[];for(const source of config.sources.filter(s=>s.writable)){
 const before=(await adapter.cli('+field-list',['--table-id',source.id])).fields,names=before.map(f=>f.name),original=await rows(source,names);save(source.id+'.before.json',{fields:before,records:original});
 const name='Directory Category ID（目录类别编号）';if(!before.some(f=>f.name===name))await adapter.cli('+field-create',['--table-id',source.id,'--json',JSON.stringify({name,type:'text'})]);
 const after=(await adapter.cli('+field-list',['--table-id',source.id])).fields,field=after.find(f=>f.name===name);assert.equal(field?.type,'text');
 for(const old of before)assert.equal(hash(after.find(f=>f.id===old.id)),hash(old),'旧字段变化');const current=await rows(source,names);assert.equal(hash(current),hash(original),'原资料内容变化');
 source.fields['Directory Category ID']={id:field.id,name:field.name};audit.push({table:source.id,records:original.length,beforeSha256:hash(original),afterSha256:hash(current)});
}
fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');save('schema-audit.json',{ok:true,table:config.directoryTable,builtins:builtinDirectory.length,originalTables:audit});console.log(JSON.stringify({ok:true,table:config.directoryTable,builtins:builtinDirectory.length,preservedRecords:audit.reduce((n,t)=>n+t.records,0)}));
