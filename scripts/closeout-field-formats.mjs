import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const dir='reports/migration-closeout-20261019',read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const ledger=await read('reports/source-references-20261018/migration-ledger.json'),source='FmIwbCqj1ax5MvsTp5OcPO5lnue';
const api=new BaseAdapter({baseToken:ledger.target});
const endpoint=(base,table)=>`/open-apis/bitable/v1/apps/${base}/tables/${table}/fields`;
const list=async(base,table)=>api.cli('GET',[endpoint(base,table),'--params',JSON.stringify({page_size:100})],undefined,'api');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const eq=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const results=await read(dir+'/field-format-results.json').catch(e=>{if(e.code!=='ENOENT')throw e;return[];});
for(const [sid]of Object.entries(ledger.projects.th)){
 const src=await list(source,sid);await fs.writeFile(`${dir}/native-source-fields-${sid}.json`,JSON.stringify(src,null,2));
 for(const [project,tables]of Object.entries(ledger.projects)){
  const m=tables[sid],before=await list(ledger.target,m.id),changed=[];
  await fs.writeFile(`${dir}/native-before-fields-${m.id}.json`,JSON.stringify(before,null,2));
  for(const f of src.items.filter(f=>f.type===20)){
   const g=before.items.find(g=>g.field_id===m.fields[f.field_id]);assert(g,'Missing mapped formula');
   const wanted={...g.property};for(const k of ['type','formatter','currency_code'])if(f.property?.[k]!==undefined)wanted[k]=structuredClone(f.property[k]);
   if(eq(g.property,wanted))continue;
   const {formula_expression:preservedExpression,...formatProperty}=wanted;
   const payload={field_name:g.field_name,type:g.type,property:formatProperty,...(g.description?{description:g.description}:{})};
   const record={project,table:m.id,field:g.field_id,before:g,payload};
   await fs.writeFile(`${dir}/native-format-pending.json`,JSON.stringify(record,null,2));
   if(process.argv[2]==='apply'||process.argv[2]==='one'){
    let updated;
    try{updated=await api.cli('PUT',[endpoint(ledger.target,m.id)+'/'+g.field_id,'--data',JSON.stringify(payload)],undefined,'api');}
    catch(error){record.error=error.message;results.push(record);await fs.writeFile(`${dir}/field-format-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({project,table:m.id,field:g.field_id,error:error.message}));continue;}
    record.updated=updated;const got=updated.field;
    assert.equal(got.property.formula_expression,g.property.formula_expression,'Formula expression changed');
    for(const k of ['type','formatter','currency_code'])if(wanted[k]!==undefined)assert(eq(got.property[k],wanted[k]),`Format mismatch ${k}`);
    record.after=got;record.verified=true;
   }
   changed.push(record);results.push(record);await fs.writeFile(`${dir}/field-format-results.json`,JSON.stringify(results,null,2));
   console.log(JSON.stringify({project,table:m.id,field:g.field_id,format:wanted.type?.ui_type,verified:record.verified||false}));
   if(process.argv[2]==='one')process.exit(0);
  }
  if(changed.length){const after=await list(ledger.target,m.id);for(const r of changed){const got=after.items.find(f=>f.field_id===r.field);assert.equal(got.property.formula_expression,r.before.property.formula_expression);for(const k of ['type','formatter','currency_code'])if(r.payload.property[k]!==undefined)assert(eq(got.property[k],r.payload.property[k]),'Independent readback mismatch');r.independentReadback=true;}await fs.writeFile(`${dir}/native-after-fields-${m.id}.json`,JSON.stringify(after,null,2));await fs.writeFile(`${dir}/field-format-results.json`,JSON.stringify(results,null,2));}
 }
}
console.log(JSON.stringify({changed:results.length,verified:results.filter(r=>r.verified).length}));
