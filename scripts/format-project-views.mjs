import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
const dir='reports/project-tables-20261018',ledger=JSON.parse(await fs.readFile(dir+'/progress.json','utf8')),sources=JSON.parse(await fs.readFile(dir+'/sources.json','utf8')),base=new BaseAdapter({baseToken:'CID8b8V7CaCtKesWGFKcHTdqnlc'});
assert.equal(Object.keys(ledger.verified).length,26);
const cli=async(c,a)=>{try{return await base.cli(c,a);}catch{return base.cli(c,a);}},layouts=JSON.parse(await fs.readFile(dir+'/source-layouts.json','utf8'));
await fs.writeFile(dir+'/source-layouts.json',JSON.stringify(layouts,null,2));
const proofs=[];
for(const t of Object.values(ledger.verified)){const saved=JSON.parse(await fs.readFile(dir+'/'+t.id+'-after.json','utf8')),fieldMap=new Map(saved.fields.map(f=>[f.name,f.id])),layout=layouts[t.source];let visible=layout.visible.map(n=>n.startsWith('Project（')?'Project（项目）':n).filter(n=>fieldMap.has(n));if(fieldMap.has('Project（项目）')&&!visible.includes('Project（项目）'))visible.splice(1,0,'Project（项目）');
 let groups=layout.groups.filter(n=>fieldMap.has(n));if(['tbl13gnsCDgElBXE','tblnm6WUIyKggmA2'].includes(t.source))groups=['Frequency（频次）','Category（分类）'].filter(n=>fieldMap.has(n));
 for(const v of saved.views){const args=['--table-id',t.id,'--view-id',v.id];let current=await Promise.allSettled(['+view-get-visible-fields','+view-get-group'].map(c=>cli(c,args)));for(const r of current)if(r.status==='rejected')throw r.reason;
 if(JSON.stringify(current[0].value.visible_fields)!==JSON.stringify(visible)){await cli('+view-set-visible-fields',[...args,'--json',JSON.stringify({visible_fields:visible.map(n=>fieldMap.get(n))})]);current[0].value=await cli('+view-get-visible-fields',args);}
 if(JSON.stringify(current[1].value.group.map(g=>g.field))!==JSON.stringify(groups)){await cli('+view-set-group',[...args,'--json',JSON.stringify({group_config:groups.map(n=>({field:fieldMap.get(n),desc:false}))})]);current[1].value=await cli('+view-get-group',args);}
 assert.deepEqual(current[0].value.visible_fields,visible);assert.deepEqual(current[1].value.group.map(g=>g.field),groups);}
 proofs.push({table:t.id,visible,groups,views:saved.views.length});await fs.writeFile(dir+'/view-proof.json',JSON.stringify(proofs,null,2));}
await fs.writeFile(dir+'/view-proof.json',JSON.stringify(proofs,null,2));console.log(JSON.stringify({tables:proofs.length,views:proofs.reduce((n,t)=>n+t.views,0),columnOrderAndGroupingVerified:true}));
