export const researchProjects=[{key:'thailand',name:'泰国项目'},{key:'malaysia',name:'马来项目'}];
export function questionDestination(scope){
 if(scope==='common')return{project:'malaysia',applicability:'通用'};
 if(researchProjects.some(p=>p.key===scope))return{project:scope,applicability:'本项目'};
 throw Error('请选择问题归属：泰国、马来或通用。');
}
export function researchApiUrl(value,project){
 if(!researchProjects.some(p=>p.key===project))throw Error('调研项目不合法。');
 const url=new URL(value,'http://localhost');
 if(!/^\/api\/research(?:\/|$)/.test(url.pathname))return value;
 url.searchParams.set('project',project);return url.pathname+url.search+url.hash;
}
export const pendingPrefix=project=>`research:${project}:pending:`;
