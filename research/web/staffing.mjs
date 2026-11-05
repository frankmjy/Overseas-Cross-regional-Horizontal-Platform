const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roleNames=['运维值班长','运维值班员','园区经理','设施经理','EHS经理','值班主管','技术主管','项目经理','电气工程师','暖通工程师','弱电工程师','消防工程师','电气主管','暖通主管','弱电主管','消防主管','值班长','值班员','技术员','楼长','电气','暖通','弱电','消防'];
const rolePattern=roleNames.join('|');
const splitLabel=p=>p.unknown&&!p.local&&!p.dispatch?`未区分 ${p.unknown}`:`本地 ${p.local} · 外派 ${p.dispatch}${p.unknown?` · 未区分 ${p.unknown}`:''}`;
const normalizeRole=value=>value==='楼长'?'设施经理':value.replace(/^运维/,'').replace(/工程师$/,'');
function rolesIn(text){
 const result=[];
 const re=new RegExp(`((?:${rolePattern})(?:[、及和](?:${rolePattern}))*)(?:各)?(\\d+)人?`,'g');
 for(const match of text.matchAll(re))for(const name of match[1].split(/[、及和]/))result.push({role:normalizeRole(name),count:Number(match[2])});
 return result;
}

export function parseStaffing(company,content=''){
 const source=content.replace(/\s/g,''),reported=/(?:总配置|人员合计[：:]|园区及1号楼合计)(\d+)人/.exec(source);
 const end=source.search(/(?:园区及1号楼合计|(?:\d+\.)?人员合计[：:])/),body=end<0?source:source.slice(0,end);
 const headings=[...body.matchAll(/园区管理团队|园区(?=[：:]|本地|外派)|COCC(?:[（(][^）)]*[）)])?|B\d+号楼|[1-9]\d*号楼/g)];
 const buckets=new Map(),issues=[];
 for(let i=0;i<headings.length;i++){
  const match=headings[i],building=match[0].startsWith('园区')?'园区':match[0].startsWith('COCC')?'COCC':match[0].replace('号楼','');
  const segment=body.slice(match.index+match[0].length,headings[i+1]?.index??body.length);
  if(!buckets.has(building))buckets.set(building,{company,building,roles:new Map(),declared:{}});
  const bucket=buckets.get(building),total=/共(?:配置)?(\d+)人/.exec(segment),direction=/^(本地|外派)/.exec(segment)?.[1];
  if(total)bucket.total=Number(total[1]);
  const add=(text,type)=>{for(const {role,count}of rolesIn(text)){if(!bucket.roles.has(role))bucket.roles.set(role,{company,building,role,local:0,dispatch:0,unknown:0});bucket.roles.get(role)[type]+=count;}};
  for(const [label,type]of [['本地','local'],['外派','dispatch']]){
   const amount=new RegExp(`${label}(?:员工)?(\\d+)人`).exec(segment);if(amount)bucket.declared[type]=Number(amount[1]);
  }
  if(direction)add(segment,direction==='本地'?'local':'dispatch');
  else if(/均为本地/.test(segment)){bucket.declared.local=bucket.total;add(segment,'local');}
  else{
   const parts=[...segment.matchAll(/(本地|外派)(?:员工)?\d+人[（(]([^）)]+)[）)]/g)];
   for(const part of parts)add(part[2],part[1]==='本地'?'local':'dispatch');
   if(!parts.length&&!/(?:本地|外派)(?:员工)?\d+人/.test(segment))add(segment,'unknown');
  }
 }
 const rows=[],buildings=[];
 for(const bucket of buckets.values()){
  const list=[...bucket.roles.values()],sum=type=>list.reduce((n,r)=>n+r[type],0);
  const local=bucket.declared.local??sum('local'),dispatch=bucket.declared.dispatch??sum('dispatch');
  const total=bucket.total??local+dispatch+sum('unknown'),unknown=Math.max(0,total-local-dispatch);
  if(local+dispatch>total)issues.push(`${bucket.building}人数分项大于合计`);
  for(const type of ['local','dispatch','unknown'])if(({local,dispatch,unknown}[type])!==sum(type))issues.push(`${bucket.building}部分岗位未提取`);
  rows.push(...list);buildings.push({company,building:bucket.building,total,local,dispatch,unknown});
 }
 const calculated=buildings.reduce((n,b)=>n+b.total,0),reportedTotal=reported?Number(reported[1]):null;
 if(!buildings.length)issues.push('正文暂未提供可识别的人员配置');
 if(reportedTotal!==null&&reportedTotal!==calculated)issues.push('正文合计与已提取单元不一致');
 return {company,rows,buildings,total:buildings.length?calculated:null,reportedTotal,local:buildings.reduce((n,b)=>n+b.local,0),dispatch:buildings.reduce((n,b)=>n+b.dispatch,0),unknown:buildings.reduce((n,b)=>n+b.unknown,0),issues:[...new Set(issues)]};
}

export function staffingModel(parsed,{scope='all',roles=[]}={}){
 const columns=parsed.flatMap(p=>p.buildings.filter(b=>scope!=='cocc'||b.building==='COCC').map(b=>{
  if(!roles.length)return b;
  const rows=p.rows.filter(r=>r.building===b.building&&roles.includes(r.role));
  const sum=type=>rows.reduce((n,r)=>n+r[type],0),local=sum('local'),dispatch=sum('dispatch'),unknown=sum('unknown');
  return {...b,local,dispatch,unknown,total:local+dispatch+unknown};
 }));
 return {columns,total:columns.reduce((n,c)=>n+c.total,0),roles:[...new Set(parsed.flatMap(p=>p.rows.filter(r=>scope!=='cocc'||r.building==='COCC').map(r=>r.role)))],issues:parsed.flatMap(p=>p.issues.map(issue=>`${p.company}：${issue}`))};
}

export function openStaffingChart(dialog,findings,{backQuestion,backCompany}={}){
 const parsed=findings.filter(f=>f.content.trim()).map(f=>parseStaffing(f.company,f.content));
 let scope='all',roles=[];
 const render=()=>{
  const model=staffingModel(parsed,{scope,roles}),max=Math.max(1,...model.columns.map(c=>c.total));
  const cards=parsed.flatMap(p=>{const columns=model.columns.filter(c=>c.company===p.company);return columns.length?[{...p,total:columns.reduce((n,c)=>n+c.total,0),local:columns.reduce((n,c)=>n+c.local,0),dispatch:columns.reduce((n,c)=>n+c.dispatch,0),unknown:columns.reduce((n,c)=>n+c.unknown,0)}]:[];});
  dialog.className='detail-dialog attachment-list-dialog';
  dialog.innerHTML=`<div class="dialog-heading"><h2 id="dialogTitle">团队人员配置</h2><button class="icon-button" data-close title="关闭人员配置图" aria-label="关闭人员配置图">×</button></div><div class="research-staffing"><div class="research-staffing-cards">${cards.map(p=>`<article class="research-staffing-card"><span>${esc(p.company)}</span><strong>${p.total??'—'}<small> 人</small></strong><small>${splitLabel(p)}</small></article>`).join('')}</div><div class="research-staffing-toolbar" role="group" aria-label="人员范围">${[['all','全部单元'],['cocc','COCC 集控']].map(([key,name])=>`<button data-staffing-scope="${key}" aria-pressed="${scope===key}">${name}</button>`).join('')}</div><div class="research-staffing-toolbar" role="group" aria-label="人员岗位"><button data-staffing-role="all" aria-pressed="${!roles.length}">全部岗位</button>${model.roles.map(role=>`<button data-staffing-role="${esc(role)}" aria-pressed="${roles.includes(role)}">${esc(role)}</button>`).join('')}</div><div class="research-staffing-chart" role="region" aria-label="按楼栋和岗位的人员配置">${model.columns.map(c=>`<div class="research-staffing-column"><span>${esc(c.company)} · ${esc(c.building==='园区'||c.building==='COCC'?c.building:c.building+'号楼')}</span><div class="research-staffing-bars" role="img" aria-label="${splitLabel(c)}">${[['local',c.local],['dispatch',c.dispatch],['unknown',c.unknown]].map(([type,n])=>`<i class="${type}" style="width:${n/max*100}%" title="${n} 人"></i>`).join('')}</div><strong>${c.total}</strong></div>`).join('')||'<p>暂无可展示的人员配置</p>'}</div><div class="research-staffing-legend"><span>本地</span><span class="dispatch">外派</span><span class="unknown">未区分</span></div>${model.issues.length?`<p class="research-staffing-issues" role="status">${model.issues.map(esc).join('；')}</p>`:''}</div><div class="dialog-footer"><button class="secondary-button" data-back-question="${esc(backQuestion)}" data-back-company="${esc(backCompany)}">返回问题详情</button></div>`;
  if(!dialog.open)dialog.showModal();
 };
 render();
 return {setScope(value){if(!['all','cocc'].includes(value))return;scope=value;roles=[];render();},setRole(value){if(value==='all')roles=[];else if(staffingModel(parsed,{scope}).roles.includes(value))roles=roles.includes(value)?roles.filter(r=>r!==value):[...roles,value];render();}};
}
