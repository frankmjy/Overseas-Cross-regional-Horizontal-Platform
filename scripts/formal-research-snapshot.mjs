import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
import {normalizeRows} from '../research/service.mjs';
import {normalizeRecord} from '../research/field-names.mjs';
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const dir='reports/research-formal-20261019';await fs.mkdir(dir,{recursive:true});
const config=JSON.parse(await fs.readFile('research/config.json','utf8'));
assert(!config.projects,'Use the saved baseline after the formal switch');
await fs.writeFile(dir+'/reference-config.json',JSON.stringify(config,null,2));
const progress=JSON.parse(await fs.readFile('reports/project-tables-20261018/progress.json','utf8'));
const jobs=Object.entries(config.tables).map(([key,id])=>({project:'reference',key,id}));
for(const project of ['thailand','malaysia'])for(const [key,slug]of [['questions','research-questions'],['findings','research-details'],['evidence','research-evidence']])jobs.push({project,key,id:progress.tables[`${project}:${slug}`]});
const a=new BaseAdapter(config);
for(const job of jobs){
 const table=await a.cli('+table-get',['--table-id',job.id]),rows=[];
 for(let offset=0;;offset+=200){const p=await a.cli('+record-list',['--table-id',job.id,'--limit','200','--offset',String(offset),'--format','json']);const r=normalizeRows(p).map(x=>normalizeRecord(x));rows.push(...r);if(!p.has_more)break;assert(r.length,'Pagination stalled');}
 await fs.writeFile(`${dir}/${job.project}-${job.key}.json`,JSON.stringify({at:new Date().toISOString(),job,table,rows,complete:true},null,2));
 console.log(JSON.stringify({project:job.project,key:job.key,table:job.id,rows:rows.length,fields:table.fields.length}));
}
