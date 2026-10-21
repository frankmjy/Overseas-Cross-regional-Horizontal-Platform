import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
import {normalizeRows} from '../research/service.mjs';
import {projectSnapshotTable} from '../samples/model.mjs';
const plan=JSON.parse(await fs.readFile('reports/overseas-directory-20261018/directory-plan.json','utf8'));
const api=new BaseAdapter({baseToken:plan.base}),raw=api.cli.bind(api);
api.cli=async(c,...a)=>{try{return await raw(c,...a);}catch(e){if(c.includes('list')||c.includes('get'))return raw(c,...a);throw e;}};
const specs=[['00.02','register'],['01.01','knowledge'],['01.02.01','standard'],['01.02.02','standard'],['01.04.03','lesson'],['01.07.01','template'],['01.07.02','template'],['01.07.03','template'],...['02','03'].flatMap(p=>[['01','initialization'],['02','interface'],['03','acceptance']].map(([i,k])=>[p+'.03.'+i,k,p==='02'?'thailand':'malaysia'])),...['01','02','03','04'].map(i=>['04.'+i+'.01',i==='01'?'meeting':i==='02'?'action':i==='03'?'resource':'risk'])];
const audit=JSON.parse(await fs.readFile('reports/source-references-20261018/malaysia-label-audit.json','utf8'));
const output={generatedAt:new Date().toISOString(),baseUrl:`https://vnet.feishu.cn/base/${plan.base}`,architectureUrl:'https://vnet.feishu.cn/docx/VDQgdT3wyoWKElxmvFcclf6bnnK',mode:'snapshot',tables:[],portfolio:[]};
for(const project of ['02','03']){const tables=plan.tables.filter(t=>t.code.startsWith(project+'.'));output.portfolio.push({id:project==='02'?'thailand':'malaysia',name:project==='02'?'Thailand Project':'Malaysia Project',label:project==='02'?'泰国项目':'马来项目',tableCount:tables.length,recordCount:tables.reduce((n,t)=>n+(audit.tables.find(a=>a.id===t.id)?.records||0),0),modules:plan.folders.filter(f=>f.code.startsWith(project+'.')).map(f=>({code:f.code,label:/（(.+)）/.exec(f.name)?.[1],tables:plan.tables.filter(t=>t.parent===f.key).map(t=>({id:t.id,name:t.name,url:`${output.baseUrl}?table=${t.id}`}))}))});}
const requested=process.argv.slice(2),selected=requested.length?specs.filter(s=>requested.includes(s[0])):specs;
if(requested.length){const previous=JSON.parse(await fs.readFile('samples/data.json','utf8'));output.tables=previous.tables.filter(t=>!requested.includes(t.code));}
for(let i=0;i<selected.length;i+=3){const results=await Promise.allSettled(selected.slice(i,i+3).map(async([code,kind,project])=>{
 const source=plan.tables.find(t=>t.code===code);assert(source,'No source '+code);const info=await api.cli('+table-get',['--table-id',source.id]);const rows=[];
 for(let offset=0;;){const page=await api.cli('+record-list',['--table-id',source.id,'--limit','200','--offset',String(offset)]);rows.push(...normalizeRows(page));if(!page.has_more)break;assert(page.data.length);offset+=page.data.length;}
 return projectSnapshotTable({...info,rows},{base:plan.base,code,kind,project});
 }));for(const r of results){if(r.status==='rejected')throw r.reason;output.tables.push(r.value);}console.log(JSON.stringify({exported:output.tables.length,total:specs.length}));}
await fs.writeFile('samples/data.json',JSON.stringify(output));console.log(JSON.stringify({tables:output.tables.length,records:output.tables.reduce((n,t)=>n+t.rows.length,0),generatedAt:output.generatedAt}));
