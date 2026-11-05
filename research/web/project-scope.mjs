export const researchProjects=[{key:'overseas',name:'海外项目'}];
export function questionDestination(scope,projects=researchProjects){
 const common=projects.find(p=>p.key==='overseas')||projects.find(p=>p.key==='malaysia');
 if(scope==='common'&&common)return{project:common.key,applicability:'通用'};
 if(projects.some(p=>p.key===scope))return{project:scope,applicability:'本项目'};
 throw Error('请选择有效的问题归属。');
}
export function researchApiUrl(value,project,projects=researchProjects){
 if(!projects.some(p=>p.key===project))throw Error('调研项目不合法。');
 const url=new URL(value,'http://localhost');
 if(!/^\/api\/research(?:\/|$)/.test(url.pathname))return value;
 url.searchParams.set('project',project);return url.pathname+url.search+url.hash;
}
export const pendingPrefix=project=>`research:${project}:pending:`;
