import fs from 'node:fs/promises';
import path from 'node:path';
import {BaseAdapter} from '../research/adapter.mjs';
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const dir='reports/migration-closeout-20261019',read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const ledger=await read('reports/source-references-20261018/migration-ledger.json'),api=new BaseAdapter({baseToken:ledger.target});
const repair=await read(dir+'/view-repair-results.json'),problems=[],tables=[];
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const eq=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
for(const [project,entries]of Object.entries(ledger.projects))for(const [sid,m]of Object.entries(entries)){
 const info=await api.cli('+table-get',['--table-id',m.id]);await fs.writeFile(`${dir}/final-${m.id}.json`,JSON.stringify(info,null,2));
 const before=await read(`${dir}/${project}-${m.id}.json`),expected=new Set(Object.values(m.views).map(v=>v.id));
 for(const v of Object.values(m.views))if(!info.views.some(x=>x.id===v.id))problems.push({table:m.id,kind:'missing_canonical_view',view:v.id});
 for(const f of before.fields){const now=info.fields.find(g=>g.id===f.id);if(!now)problems.push({table:m.id,kind:'missing_field',field:f.id});else for(const k of ['type','expression','from','select','aggregate','where','link_table'])if(!eq(now[k],f[k]))problems.push({table:m.id,field:f.id,kind:'field_semantics_changed',property:k});}
 tables.push({project,table:m.id,fields:info.fields.length,sourceViews:expected.size,actualViews:info.views.length});
 for(const v of info.views.filter(v=>['gantt','calendar'].includes(v.type))){const sourceView=Object.entries(m.views).find(([,x])=>x.id===v.id)?.[0];if(!sourceView)continue;const src=await read(`${dir}/view-source-${sid}-${sourceView}.json`),want=Object.fromEntries(Object.entries(src.properties.timebar.timebar).map(([k,id])=>[k,m.fields[id]]));const got=(await api.cli('+view-get-timebar',['--table-id',m.id,'--view-id',v.id])).timebar;if(!eq(got,want))problems.push({table:m.id,view:v.id,kind:'timebar_difference',expected:want,actual:got});await fs.writeFile(`${dir}/final-timebar-${v.id}.json`,JSON.stringify({expected:want,actual:got,matches:eq(got,want)},null,2));}
 const corrections=repair.filter(x=>x.table===m.id);for(const c of corrections){const got=await api.cli('+view-get-'+c.key,['--table-id',m.id,'--view-id',c.view]);if(!eq(got,c.after))problems.push({table:m.id,view:c.view,kind:'visible_fields_repair_drift'});}
 console.log(JSON.stringify({table:m.id,verified:tables.length}));
}
await fs.writeFile(`${dir}/final-readback.json`,JSON.stringify({at:new Date().toISOString(),tables,problems},null,2));console.log(JSON.stringify({tables:tables.length,problems:problems.length}));
