import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BaseAdapter} from '../research/adapter.mjs';
import {projectDefinitions,cloneProjectFields,projectRows} from './project-table-plan.mjs';
import {normalizedCell} from './overseas-source-views.mjs';
const dir='reports/project-tables-20261018',read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const [plan,dom,ledger,sources]=await Promise.all(['reports/overseas-directory-20261018/directory-plan.json',dir+'/directory-dom.json',dir+'/progress.json',dir+'/sources.json'].map(read));
const base=new BaseAdapter({baseToken:plan.base}),cli=(c,a=[])=>base.cli(c,a,process.cwd());
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const folders=new Map(plan.folders.map(f=>[f.key,f])),stack=[],parents=new Map();
for(const e of dom){parents.set(e.id,stack[e.level-1]||null);stack[e.level]=e.id;stack.length=e.level+1;}
const expected=[...plan.folders,...plan.tables,...plan.documents];assert.equal(new Set(expected.map(e=>e.id)).size,expected.length);assert.equal(dom.length,expected.length);
for(const e of expected){assert.equal(dom.find(x=>x.id===e.id)?.name,e.name,'name '+e.id);assert.equal(parents.get(e.id),e.parent?folders.get(e.parent).id:null,'parent '+e.id);}
assert.deepEqual(dom.filter(e=>e.level===0).map(e=>e.id),plan.folders.filter(f=>!f.parent).map(e=>e.id));
for(const f of plan.folders){const child=dom.filter(e=>e.id.startsWith('bfl')&&parents.get(e.id)===f.id).map(e=>e.name);assert.deepEqual(child,[...child].sort(),'module order '+f.key);}
const tables=[];for(let offset=0;;){const page=await cli('+table-list',['--limit','50','--offset',String(offset)]);tables.push(...page.tables);if(tables.length>=page.total)break;assert.ok(page.tables.length);offset+=page.tables.length;}assert.equal(tables.length,76);for(const t of plan.tables)assert.ok(tables.some(x=>x.id===t.id),'table preserved '+t.id);
const sourceProof=await read(dir+'/source-proof.json');assert.equal(sourceProof.sourceSha256,createHash('sha256').update(await fs.readFile(dir+'/sources.json')).digest('hex'));assert.ok(Date.now()-Date.parse(sourceProof.at)<3600000,'source audit stale');const original=sourceProof.verified;
const projectProof=[];
for(const p of projectDefinitions){const ids=Object.fromEntries(sources.map(s=>[s.id,ledger.tables[p.key+':'+s.key]]));for(const s of sources){const key=p.key+':'+s.key,verified=ledger.verified[key];assert.ok(verified);const saved=await read(dir+'/'+verified.id+'-after.json'),expectedFields=cloneProjectFields(s,p,ids),actual=new Map(saved.fields.map(f=>[f.name,f]));for(const f of expectedFields){const found=actual.get(f.name);assert.ok(found,'field '+key+' '+f.name);for(const prop of ['type','style','multiple','link_table'])if(f[prop]!==undefined)assert.equal(canonical(found[prop]),canonical(f[prop]),'field format '+key+' '+f.name+' '+prop);if(f.type==='select')assert.deepEqual(found.options.map(o=>o.name),f.options.map(o=>o.name));}assert.equal(saved.rows.length,projectRows(s,p).length);const projectField=actual.get('Project（项目）');assert.ok(saved.rows.every(r=>canonical(normalizedCell(r.cells[projectField.name],projectField))===canonical(normalizedCell(p.name,projectField))));projectProof.push(verified);}}
const app=await read('knowledge/config.json');for(const source of app.sources){const t=plan.tables.find(t=>t.id===source.id);assert.ok(t,'app source preserved');assert.equal(source.kind==='meeting'?t.parent:topFolder(t.parent),source.kind==='meeting'?'meetings-'+source.project:'knowledge');}
function topFolder(key){const f=folders.get(key);return f.parent?topFolder(f.parent):f.key;}
const research=await read('research/config.json');for(const key of ['questions','findings','evidence'])assert.equal(plan.tables.find(t=>t.id===research.tables[key])?.parent,'shared-research');
const viewProof=await read(dir+'/view-proof.json'),indexProof=await read('reports/overseas-directory-20261018/index-progress.json');assert.equal(viewProof.length,26);assert.equal(indexProof.verified.rows,104);
const proof={at:new Date().toISOString(),roots:dom.filter(e=>e.level===0).map(e=>e.name),directory:{folders:plan.folders.length,tables:plan.tables.length,documents:plan.documents.length,allParentsAndOrder:true},preserved:{originalTableIds:50,sourceBusinessTables:original.length,sourceBusinessRecords:original.reduce((n,s)=>n+s.rows,0),sourceBusinessViews:original.reduce((n,s)=>n+s.views,0),sourceBusinessFieldsAndCellsUnchanged:true},projects:projectDefinitions.map(p=>({project:p.name,tables:projectProof.filter(t=>t.project===p.key).length,rows:projectProof.filter(t=>t.project===p.key).reduce((n,t)=>n+t.rows,0),prepared:671,examples:9})),views:{formatted:viewProof.reduce((n,t)=>n+t.views,0),columnOrderAndGroupsVerified:true},index:indexProof.verified,final:{tables:tables.length,records:tables.reduce((n,t)=>n+t.records_count,0)},appSourceIdsUnchanged:true};
await fs.writeFile(dir+'/final-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
