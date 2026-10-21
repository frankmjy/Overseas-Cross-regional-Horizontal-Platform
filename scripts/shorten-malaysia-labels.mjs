import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
const dir='reports/source-references-20261018',file=dir+'/malaysia-label-audit.json';
const plan=JSON.parse(await fs.readFile('reports/overseas-directory-20261018/directory-plan.json','utf8'));
const api=new BaseAdapter({baseToken:plan.base}),mode=process.argv[2]||'scan';
const raw=api.cli.bind(api);api.cli=async(command,...args)=>{try{return await raw(command,...args);}catch(e){if(command.includes('get')||command.includes('list'))return raw(command,...args);throw e;}};
const save=v=>fs.writeFile(file,JSON.stringify(v,null,2));
const short=s=>s.replaceAll('马来西亚','马来');
const writable=new Set(['text','url','phone','select']);
if(mode==='scan'){
 let audit;try{audit=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;audit={at:new Date().toISOString(),tables:[],fields:[],records:[],views:[],readOnly:[]};}
 const pending=plan.tables.filter(t=>!audit.tables.some(e=>e.id===t.id));
 for(let i=0;i<pending.length;i+=3){
  const rs=await Promise.allSettled(pending.slice(i,i+3).map(async t=>{
   const info=await api.cli('+table-get',['--table-id',t.id]);
   for(const f of info.fields){
    const patch={};if(f.name?.includes('马来西亚'))patch.name=short(f.name);if(f.description?.includes('马来西亚'))patch.description=short(f.description);
    if(f.options?.some(o=>o.name.includes('马来西亚')))patch.options=f.options.map(o=>({...o,name:short(o.name)}));
    if(Object.keys(patch).length)audit.fields.push({table:t.id,field:f.id,type:f.type,before:f,patch});
    if(f.expression?.includes('马来西亚')||JSON.stringify(f.where||{}).includes('马来西亚'))audit.readOnly.push({table:t.id,field:f.id,type:f.type,definition:true});
   }
   for(const v of info.views)if(v.name?.includes('马来西亚'))audit.views.push({table:t.id,id:v.id,name:short(v.name)});
   let total=0;for(let offset=0;;){
    const p=await api.cli('+record-list',['--table-id',t.id,'--limit','200','--offset',String(offset)]);
    assert(Array.isArray(p.data)&&Array.isArray(p.field_id_list),t.id+' record shape');
    for(let row=0;row<p.data.length;row++){
     const patch={},before={};for(let col=0;col<p.field_id_list.length;col++){
      const val=p.data[row][col],fid=p.field_id_list[col],f=info.fields.find(f=>f.id===fid);
      if(!JSON.stringify(val)?.includes('马来西亚'))continue;
      if(writable.has(f.type)&&(typeof val==='string'||f.type==='select'&&Array.isArray(val)&&val.every(e=>typeof e==='string'))){before[fid]=val;patch[fid]=typeof val==='string'?short(val):val.map(short);}
      else audit.readOnly.push({table:t.id,record:p.record_id_list[row],field:fid,type:f.type});
     }
     if(Object.keys(patch).length)audit.records.push({table:t.id,id:p.record_id_list[row],before,patch});
    }
    total+=p.data.length;if(!p.has_more)break;assert(p.data.length);offset+=p.data.length;
   }
   audit.tables.push({id:t.id,records:total});
  }));for(const r of rs)if(r.status==='rejected')throw r.reason;
  await save(audit);console.log(JSON.stringify({scanned:audit.tables.length,total:plan.tables.length,fields:audit.fields.length,records:audit.records.length,readOnly:audit.readOnly.length}));
 }
}else if(mode==='fields'){
 const audit=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(audit.tables.length,113);
 for(const f of audit.fields){if(f.verified)continue;assert.equal(f.type,'select');
  const schema=Object.fromEntries(Object.entries(f.before).filter(([k])=>['name','type','multiple','description','options','style'].includes(k)));
  Object.assign(schema,f.patch);await api.cli('+field-update',['--table-id',f.table,'--field-id',f.field,'--json',JSON.stringify(schema),'--yes']);
  const got=(await api.cli('+field-get',['--table-id',f.table,'--field-id',f.field])).field;
  assert.equal(got.type,f.type);assert.equal(got.multiple,f.before.multiple);assert.deepEqual(got.options,schema.options);
  f.verified=true;await save(audit);console.log(JSON.stringify({fieldUpdated:f.field}));
 }
}else if(mode==='records'){
 const audit=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(audit.tables.length,113);
 assert(audit.fields.every(f=>f.verified),'Update option names first');assert.equal(audit.views.length,0,'View name changes need separate review');
 for(const r of audit.records){if(r.verified)continue;await api.cli('+record-upsert',['--table-id',r.table,'--record-id',r.id,'--json',JSON.stringify(r.patch)]);
  const got=await api.cli('+record-get',['--table-id',r.table,'--record-id',r.id]);
  // Record get returns the same field/value matrix as record list.
  const data=got.record||got;for(const[fid,value]of Object.entries(r.patch)){
   const actual=data.fields?.[fid]??data.cells?.[fid]??(Array.isArray(data.field_id_list)?data.data?.[0]?.[data.field_id_list.indexOf(fid)]:undefined);
   assert.deepEqual(actual,value,'Readback mismatch '+r.table+' '+fid);
  }
  r.verified=true;await save(audit);console.log(JSON.stringify({updated:audit.records.filter(e=>e.verified).length,total:audit.records.length}));
 }
}else if(mode==='verify'){
 const audit=JSON.parse(await fs.readFile(file,'utf8'));assert(audit.records.every(r=>r.verified));assert(audit.fields.every(f=>f.verified));
 const leftovers=[];for(const t of [...new Set([...audit.records,...audit.fields,...audit.readOnly].map(e=>e.table))]){
  const info=await api.cli('+table-get',['--table-id',t]);assert(!JSON.stringify(info.fields).includes('马来西亚'),t+' schema residue');
  let count=0;for(let offset=0;;){const p=await api.cli('+record-list',['--table-id',t,'--limit','200','--offset',String(offset)]);if(JSON.stringify(p.data).includes('马来西亚'))leftovers.push(t);count+=p.data.length;if(!p.has_more)break;assert(p.data.length);offset+=p.data.length;}
  assert.equal(count,audit.tables.find(e=>e.id===t).records,t+' record count');
 }
 assert.deepEqual(leftovers,[]);audit.completedAt=new Date().toISOString();audit.remainingOldLabels=0;await save(audit);console.log(JSON.stringify({tablesScanned:113,fieldsUpdated:audit.fields.length,recordsUpdated:audit.records.length,remainingOldLabels:0}));
}else throw Error('Choose scan, fields, records or verify');
