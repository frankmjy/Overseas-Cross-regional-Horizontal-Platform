import {createHash} from 'node:crypto';

const keys=['thailand','malaysia'],tableKeys=['questions','findings','evidence','topics'];
const names={thailand:'泰国项目',malaysia:'马来项目'};
const failure=message=>Object.assign(new Error(message),{status:400});
export function researchProjectConfigs(config){
 if(!config.projects||keys.some(key=>!config.projects[key]))throw Error('缺少两国正式调研表配置，禁止回退到资料表。');
 if(!keys.includes(config.defaultProject))throw Error('默认调研项目不合法。');
 const seen=new Set();
 return Object.fromEntries(keys.map(key=>{
  const p=config.projects[key];
  for(const table of tableKeys){const id=p.tables?.[table];if(!id||seen.has(id))throw Error('正式调研表缺失或跨项目重复绑定。');seen.add(id);}
  const binding=createHash('sha256').update(JSON.stringify([key,config.baseToken,...tableKeys.map(t=>p.tables[t])])).digest('hex');
  return[key,{...p,baseToken:config.baseToken,baseUrl:`${config.baseUrl}?table=${p.tables.questions}`,project:{key,name:names[key]},binding}];
 }));
}
export function resolveResearchProject(url,defaultProject,write=false){
 const p=new URL(url,'http://localhost').searchParams,values=p.getAll('project');
 if(values.length>1||write&&values.length!==1)throw failure('请明确选择一个调研项目后再提交。');
 const key=values[0]??defaultProject;
 if(!keys.includes(key))throw failure('调研项目不合法，请选择泰国或马来项目。');
 return key;
}
export function createProjectResearchHandler({handlers,defaultProject}){
 return async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname!=='/'&&!pathname.startsWith('/research/')&&!pathname.startsWith('/assets/pdfjs/')&&!/^\/api\/research(?:\/|$)/.test(pathname))return false;
  try{return await handlers[resolveResearchProject(req.url,defaultProject,req.method==='POST')](req,res);}
  catch(e){if(!e.status)throw e;res.writeHead(e.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({ok:false,error:e.message}));return true;}
 };
}
