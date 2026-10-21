import fs from 'node:fs/promises';
import {buildFullSourcePlan} from './overseas-source-data.mjs';
import {mappedView} from './overseas-source-views.mjs';
const dir='reports/migration-closeout-20261019',read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const source=await read('reports/base-reorganize-20261018/full-source.json'),groups=buildFullSourcePlan(source);
const ledger=await read('reports/base-reorganize-20261018/source-view-reconciliation.json');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const normalizeFilter=v=>({...v,conditions:v.conditions.map(([f,op,val])=>val==null?[f,op]:[f,op,val])});
const report={at:new Date().toISOString(),views:[],differences:[],errors:[],forms:[]};
for(const g of groups)for(const [si,s]of g.sources.entries()){
 const fresh=await read(`${dir}/reference-${s.id}.json`);
 for(const [vi,v]of fresh.views.entries()){
  if(v.type==='form'){report.forms.push({sourceTable:s.id,sourceView:v.id,mapping:ledger.forms[s.id+':'+v.id]});continue;}
  const link=ledger.views[s.id+':'+v.id];if(!link){report.differences.push({sourceTable:s.id,sourceView:v.id,kind:'missing_view_mapping'});continue;}
  const a=await read(`${dir}/view-reference-${s.id}-${v.id}.json`),b=await read(`${dir}/view-other-${link.targetTable}-${link.targetView}.json`);
  const src={...v,visible:a.properties['visible-fields']?.visible_fields,filter:a.properties.filter?.filter,group:a.properties.group?.group,sort:a.properties.sort?.sort,timebar:a.properties.timebar?.timebar};
  const wanted=mappedView(g,s,src,g.sources.length>1?si:vi),target=await read(`${dir}/other-${link.targetTable}.json`);
  const item={sourceTable:s.id,sourceView:v.id,table:link.targetTable,view:link.targetView,type:v.type,properties:[]};
  for(const [key,p]of Object.entries(b.properties)){
   if(p.error){report.errors.push({table:link.targetTable,view:link.targetView,key,error:p.error});continue;}
   let want,got;
   if(key==='visible-fields'){want=wanted.visible;got=p.visible_fields;}
   if(key==='filter'){want=normalizeFilter(wanted.filter);got=normalizeFilter(p.filter);}
   if(key==='group'||key==='sort'){want=wanted[key]||[];got=p[key];}
   if(key==='timebar'){want=wanted.timebar;got=Object.fromEntries(Object.entries(p.timebar).map(([k,id])=>[k,target.fields.find(f=>f.id===id)?.name||id]));}
   if(key==='card')continue;
   const matches=same(want,got);item.properties.push({key,matches});if(!matches)report.differences.push({table:link.targetTable,view:link.targetView,key,expected:want,actual:got});
  }
  report.views.push(item);
 }
}
await fs.writeFile(`${dir}/reference-view-audit.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({views:report.views.length,forms:report.forms.length,differences:report.differences,errors:report.errors},null,2));
