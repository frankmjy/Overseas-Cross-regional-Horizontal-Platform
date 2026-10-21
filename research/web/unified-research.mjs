import { researchProjects } from './project-scope.mjs';
export const rangeOptions=[{key:'thailand',name:'泰国项目'},{key:'malaysia',name:'马来项目'},{key:'common',name:'通用'}];
export function questionTarget(value){
 const at=String(value).indexOf(':'),project=String(value).slice(0,at),questionId=String(value).slice(at+1);
 if(at<0||!researchProjects.some(p=>p.key===project)||!/^Q-[a-z0-9-]{1,90}$/i.test(questionId))throw Error('调研问题归属不合法，请刷新后重试。');
 return {project,questionId};
}
export const questionRange=q=>q.applicability==='通用'?'common':q.projectKey;
export function rangeProjectKeys(ranges){const selected=researchProjects.filter(p=>ranges.includes(p.key)).map(p=>p.key);return selected.length?selected:ranges.includes('common')?researchProjects.map(p=>p.key):[];}
export function matchesResearchRange(q,ranges){
 const countries=researchProjects.filter(p=>ranges.includes(p.key)).map(p=>p.key);
 if(countries.length)return countries.includes(q.projectKey)&&(q.applicability!=='通用'||ranges.includes('common'));
 return ranges.includes('common')&&q.applicability==='通用';
}
export function mergeProjectSnapshots(snapshots){
 const sources=researchProjects.map(p=>{const data=snapshots[p.key];if(!data||data.project?.key!==p.key)throw Error(`${p.name}数据尚未就绪。`);return {data,project:p};});
 const result={...sources[0].data,baseUrl:sources[0].data.baseUrl.split('?')[0],project:null,questions:[],deletedQuestions:[],findings:[],evidence:[],categories:[],topicSync:{},projects:sources.map(s=>s.project)};
 for(const {data,project}of sources){
  const id=value=>`${project.key}:${value}`;
  for(const key of ['questions','deletedQuestions'])result[key].push(...(data[key]||[]).map(q=>({...q,id:id(q.id),sourceId:q.id,projectKey:project.key,projectName:project.name,baseUrl:data.baseUrl})));
  result.findings.push(...data.findings.map(f=>({...f,id:id(f.id),questionId:id(f.questionId),projectKey:project.key})));
  result.evidence.push(...data.evidence.map(e=>({...e,id:id(e.id),questionId:id(e.questionId),projectKey:project.key})));
  result.categories.push(...data.categories);Object.assign(result.topicSync,data.topicSync);
 }
 const ordered=sources.map(({project})=>result.questions.filter(q=>q.projectKey===project.key));
 result.questions=Array.from({length:Math.max(...ordered.map(rows=>rows.length))},(_,i)=>ordered.flatMap(rows=>rows[i]?[rows[i]]:[])).flat();
 result.categories=[...new Set(result.categories)];
 result.companies=sources[1].data.companies.map(c=>({...c,labels:Object.fromEntries(sources.map(s=>[s.project.key,s.data.companies.find(v=>v.code===c.code)?.displayName||c.name]))}));
 result.syncedAt=sources.map(s=>s.data.syncedAt).sort()[0];result.date=result.syncedAt?.slice(0,10);
 result.revision=JSON.stringify(sources.map(s=>s.data.revision||s.data.syncedAt));
 result.syncError=sources.filter(s=>s.data.syncError).map(s=>`${s.project.name}：${s.data.syncError}`).join('；');
 return result;
}
