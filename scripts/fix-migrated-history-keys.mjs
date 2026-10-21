import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
import {fieldName} from './project-migration-names.mjs';
const dir='reports/source-references-20261018';
const ledger=JSON.parse(await fs.readFile(dir+'/migration-ledger.json','utf8'));
const api=new BaseAdapter({baseToken:ledger.target});
const receivableId='tblCeib8GCQNGvyZ',historyId='tblUeqpk6NBt9cdz';
const sourceReceivables=JSON.parse(await fs.readFile(dir+'/'+receivableId+'-full.json','utf8'));
const sourceHistory=JSON.parse(await fs.readFile(dir+'/'+historyId+'-full.json','utf8'));
const field=fieldName('自动编号'),primary=fieldName('结算编码');
const report=[];
for(const project of ['th','my']){
 const m=ledger.projects[project][historyId],peer=ledger.projects[project][receivableId];
 let fields=(await api.cli('+field-list',['--table-id',m.id])).fields;
 let original=fields.find(f=>f.name==='Source Auto Number（源自动编号）');
 if(!original){await api.cli('+field-create',['--table-id',m.id,'--json',JSON.stringify({name:'Source Auto Number（源自动编号）',type:'number',style:{type:'plain',precision:0}})]);fields=(await api.cli('+field-list',['--table-id',m.id])).fields;original=fields.find(f=>f.name==='Source Auto Number（源自动编号）');}
 assert(original);
 if(project==='my')continue;
 const read=await api.cli('+record-list',['--table-id',peer.id,'--limit','200']);
 const autoIndex=read.fields.indexOf(field);assert(autoIndex>=0);
 const map=new Map(sourceReceivables.rows.map(r=>{const i=read.record_id_list.indexOf(peer.records[r.id]);assert(i>=0);return[Number(r.cells['自动编号']),Number(read.data[i][autoIndex])];}));
 for(const row of sourceHistory.rows){const old=row.cells['自动编号'];if(old==null)continue;const key=map.get(Number(old));assert(key!==undefined);await api.cli('+record-upsert',['--table-id',m.id,'--record-id',m.records[row.id],'--json',JSON.stringify({[m.fields[sourceHistory.fields.find(f=>f.name==='自动编号').id]]:key,[original.id]:Number(old)})]);}
 let after;
 for(let attempt=0;attempt<3;attempt++){
  after=await api.cli('+record-list',['--table-id',m.id,'--limit','200']);
  const index=after.fields.indexOf(primary);
  if(sourceHistory.rows.every(r=>after.data[after.record_id_list.indexOf(m.records[r.id])]?.[index]===r.cells['结算编码']))break;
 }
 const pi=after.fields.indexOf(primary),oi=after.fields.indexOf(original.name);assert(pi>=0&&oi>=0);
 for(const row of sourceHistory.rows){const i=after.record_id_list.indexOf(m.records[row.id]);assert(i>=0);assert.deepEqual(after.data[i][pi],row.cells['结算编码']);assert.equal(after.data[i][oi],row.cells['自动编号']);}
 report.push({project,table:m.id,records:sourceHistory.rows.length,primaryKeysRestored:true,originalNumericKeysPreserved:true});
}
await fs.writeFile(dir+'/history-key-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
