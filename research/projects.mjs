import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const legacyKeys=['thailand','malaysia'],tableKeys=['questions','findings','evidence','topics'];
const names={thailand:'泰国项目',malaysia:'马来项目'};
const failure=message=>Object.assign(new Error(message),{status:400});
export function assertResearchSourceSwitch(dir,activeKeys){
 for(const key of legacyKeys.filter(key=>!activeKeys.includes(key))){
  const file=path.join(dir,'projects',key,'state.json');if(!fs.existsSync(file))continue;
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  if(Object.values(state.operations||{}).some(op=>!['success','retired'].includes(op.status)))throw Error(`${names[key]}仍有未完成的调研同步任务，已阻止切换数据源；请先在原工作台处理。`);
 }
}
export function researchProjectConfigs(config){
 const keys=Object.keys(config.projects||{});
 if(!keys.length||keys.some(key=>!/^[a-z][a-z0-9-]{0,39}$/.test(key)))throw Error('缺少有效的正式调研表配置，禁止回退到资料表。');
 if(!keys.includes(config.defaultProject))throw Error('默认调研项目不合法。');
 const seen=new Set();
 return Object.fromEntries(keys.map(key=>{
  const p=config.projects[key];
  const baseToken=p.baseToken||config.baseToken,baseUrl=p.baseUrl||config.baseUrl;
  for(const table of tableKeys){const id=p.tables?.[table],identity=baseToken+':'+id;if(!id||seen.has(identity))throw Error('正式调研表缺失或跨项目重复绑定。');seen.add(identity);}
  const binding=createHash('sha256').update(JSON.stringify([key,baseToken,...tableKeys.map(t=>p.tables[t])])).digest('hex');
  return[key,{...p,baseToken,baseUrl:`${baseUrl}?table=${p.tables.questions}`,project:{key,name:p.name||names[key]||key},binding}];
 }));
}
export function resolveResearchProject(url,defaultProject,write=false,keys=legacyKeys){
 const p=new URL(url,'http://localhost').searchParams,values=p.getAll('project');
 if(values.length>1||write&&values.length!==1)throw failure('请明确选择一个调研项目后再提交。');
 const key=values[0]??defaultProject;
 if(!keys.includes(key))throw failure('调研项目不合法，请选择有效的调研项目。');
 return key;
}
export function createProjectResearchHandler({handlers,defaultProject}){
 return async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname!=='/'&&pathname!=='/research'&&!pathname.startsWith('/research/')&&!pathname.startsWith('/assets/pdfjs/')&&!/^\/api\/research(?:\/|$)/.test(pathname))return false;
  try{return await handlers[resolveResearchProject(req.url,defaultProject,req.method==='POST',Object.keys(handlers))](req,res);}
  catch(e){if(!e.status)throw e;res.writeHead(e.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({ok:false,error:e.message}));return true;}
 };
}
