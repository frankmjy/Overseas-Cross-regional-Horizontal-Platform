import fs from 'node:fs/promises';
import {fieldName} from './project-migration-names.mjs';
const dir='reports/migration-closeout-20261019';
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const ledger=await read('reports/source-references-20261018/migration-ledger.json');
const norm=v=>v==null||v===''||Array.isArray(v)&&!v.length?null:v;
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const emptyMy=new Set(['tblO0wDllVX6icZN','tbl6TZlBVydwWgQ7','tblUeqpk6NBt9cdz','tbl5ocKDxpRn1T4d','tblGQd3xjS1MKLCs']);
const blankMy=new Set(['项目风险情况','周报总结','AI 利润风险提示','项目进度','最新进展反馈','现场资料确认（商务、产品）','退回原因','本周进展','应收金额','收款描述','客户验收','回款所需资料准备','处罚情况','手机号码','姓名','单位','需配置人数','成本单价','数量']);
const snapshots={};for(const id of Object.keys(ledger.projects.th))snapshots[id]=await read(`${dir}/source-${id}.json`);
const people=[...new Set(Object.values(snapshots).flatMap(t=>t.fields.filter(f=>f.type==='user').flatMap(f=>t.rows.flatMap(r=>(r.cells[f.id]||[]).map(v=>v.name).filter(Boolean)))))];
const shorten=s=>typeof s==='string'?s.replaceAll('马来西亚','马来'):s;
const adapt=s=>{if(typeof s!=='string')return s;let v=s.replaceAll('中泰','中马').replaceAll('泰语','马来语/英语').replace(/Thailand/gi,'Malaysia').replaceAll('泰国','马来').replace(/\bBOI\b/g,'当地投资审批机构（待属地确认）').replace(/ARAYA|ROJANA/gi,'项目现场').replace(/\b20\d{2}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?/g,'待确定');for(const n of people)v=v.replaceAll(n,'待指定人员');return v;};
const result={at:new Date().toISOString(),tables:[],issues:[],viewDifferences:[],viewReadErrors:[],cellsChecked:0,computedChecked:0};
const viewPlans=[];
for(const [project,tables]of Object.entries(ledger.projects))for(const [sid,m]of Object.entries(tables)){
 const source=snapshots[sid],target=await read(`${dir}/${project}-${m.id}.json`),targetRows=new Map(target.rows.map(r=>[r.id,r]));
 const old=await read(`reports/source-references-20261018/${sid}-full.json`);
 const expectedRows=project==='my'&&emptyMy.has(sid)?[]:source.rows;
 const item={project,source:sid,target:m.id,sourceRows:source.rows.length,targetRows:target.rows.length,expectedRows:expectedRows.length,sourceFields:source.fields.length,sourceViews:source.views.length,sourceChangedSinceMigration:!equal(source.rows.map(r=>r.id).sort(),old.rows.map(r=>r.id).sort())};result.tables.push(item);
 if(target.rows.length!==expectedRows.length)result.issues.push({project,table:m.id,kind:'record_count'});
 for(const f of source.fields){const g=target.fields.find(g=>g.id===m.fields[f.id]);if(!g){result.issues.push({project,table:m.id,field:f.id,kind:'missing_field'});continue;}
  if(f.type==='link'&&g.link_table!==tables[f.link_table]?.id)result.issues.push({project,table:m.id,field:g.id,kind:'link_target'});
  if(m.computed?.[f.id]){const d=m.computed[f.id];result.computedChecked++;for(const k of ['type','expression','from','select','where','aggregate'])if(d[k]!==undefined&&!equal(d[k],g[k]))result.issues.push({project,table:m.id,field:g.id,kind:'computed_definition',property:k});}
 }
 for(const row of expectedRows){const actual=targetRows.get(m.records[row.id]);if(!actual){result.issues.push({project,table:m.id,sourceRecord:row.id,kind:'missing_record'});continue;}
  for(const f of source.fields){if(['auto_number','formula','lookup','attachment','button','created_by','updated_by','updated_at'].includes(f.type))continue;
   let want=norm(row.cells[f.id]),got=norm(actual.cells[m.fields[f.id]]);
   if(f.type==='link')want=norm((want||[]).map(x=>tables[f.link_table]?.records[x.id]).filter(Boolean).sort());
   else if(project==='my'){
    if(['user','datetime','created_at','checkbox'].includes(f.type)||blankMy.has(f.name))want=null;
    else if(f.name==='项目名称')want='马来项目';
    else if(typeof want==='string')want=adapt(want);else if(f.type==='select'&&Array.isArray(want))want=want.map(adapt);
   }
   if(f.type==='link')got=norm((got||[]).map(x=>x.id).sort());
   if(f.type==='user'){want=norm(want?.map(x=>x.id).sort());got=norm(got?.map(x=>x.id).sort());}
   if(f.type==='number'){want=want==null?null:Number(want);got=got==null?null:Number(got);}
   if(['datetime','created_at'].includes(f.type)){const dt=v=>v==null?null:new Date(String(v).replace(' ','T')+(String(v).endsWith('Z')?'':'+08:00')).getTime();want=dt(want);got=dt(got);}
   if(f.type==='text'&&want!=null&&typeof want!=='string')want=JSON.stringify(want);
   if(f.type==='select'&&!f.multiple){if(Array.isArray(want))want=want[0]??null;if(Array.isArray(got))got=got[0]??null;}
   want=shorten(want);got=shorten(got);
   // Settlement history uses target-local auto numbers; preserve originals in the dedicated source field.
   if(sid==='tblUeqpk6NBt9cdz'&&f.name==='自动编号')continue;
   result.cellsChecked++;if(!equal(norm(want),norm(got)))result.issues.push({project,table:m.id,sourceRecord:row.id,record:actual.id,sourceField:f.id,field:m.fields[f.id],fieldName:f.name,kind:'cell_value',expected:want,actual:got});
  }
 }
 for(const v of source.views){const mapped=m.views[v.id];if(!mapped||!target.views.some(w=>w.id===mapped.id)){result.issues.push({project,table:m.id,sourceView:v.id,kind:'missing_view'});continue;}if(v.type==='form')continue;
  const a=await read(`${dir}/view-source-${sid}-${v.id}.json`),b=await read(`${dir}/view-${project}-${m.id}-${mapped.id}.json`);
  const nameMap=n=>{const f=source.fields.find(f=>f.name===n);if(!f)throw Error('Unknown source field '+n);return target.fields.find(g=>g.id===m.fields[f.id])?.name;};
  const idMap=id=>m.fields[id];
  const plan={project,sourceTable:sid,sourceView:v.id,table:m.id,view:mapped.id,type:v.type,changes:[]};
  for(const [key,p]of Object.entries(a.properties)){const current=b.properties[key];if(p.error||current?.error){result.viewReadErrors.push({project,table:m.id,view:mapped.id,key,source:p.error,target:current?.error});continue;}
   let want,got,payload;
   if(key==='visible-fields'){want=p.visible_fields.map(nameMap);got=current.visible_fields;payload={visible_fields:p.visible_fields.map(n=>idMap(source.fields.find(f=>f.name===n).id))};}
   if(key==='group'||key==='sort'){want=p[key].map(c=>({...c,field:nameMap(c.field)}));got=current[key];payload={[key+'_config']:p[key].map(c=>({...c,field:idMap(source.fields.find(f=>f.name===c.field).id)}))};}
   if(key==='filter'){want={...p.filter,conditions:p.filter.conditions.map(([n,op,val])=>[nameMap(n),val==null&&op==='=='?'empty':op,...(val===undefined?[]:[project==='my'&&Array.isArray(val)?val.map(adapt):val])])};got=current.filter;payload={...want,conditions:want.conditions.map(([n,...rest])=>[target.fields.find(f=>f.name===n).id,...rest])};}
   if(key==='timebar'){want=Object.fromEntries(Object.entries(p.timebar).map(([k,id])=>[k,idMap(id)]));got=current.timebar;payload=want;}
   if(key==='card'){want={...p.card,...(p.card?.cover_field?{cover_field:idMap(p.card.cover_field)}:{})};got=current.card;payload=want;}
   if(!equal(want,got)){result.viewDifferences.push({project,table:m.id,view:mapped.id,key,expected:want,actual:got});plan.changes.push({key,payload});}
  }viewPlans.push(plan);
 }
}
await fs.writeFile(`${dir}/audit.json`,JSON.stringify(result,null,2));await fs.writeFile(`${dir}/view-repair-plan.json`,JSON.stringify(viewPlans,null,2));
console.log(JSON.stringify({tables:result.tables.length,cells:result.cellsChecked,computed:result.computedChecked,issues:result.issues.length,views:viewPlans.length,viewDifferences:result.viewDifferences.length,viewReadErrors:result.viewReadErrors.length,issueKinds:Object.fromEntries([...new Set(result.issues.map(i=>i.kind))].map(k=>[k,result.issues.filter(i=>i.kind===k).length]))}));
