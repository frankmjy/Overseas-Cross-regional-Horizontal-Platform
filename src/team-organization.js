import { createDiagramCanvas, containDiagramFocus } from './diagram-canvas.js';

const definitions = [
  ['campus','园区经理',1,'园区','2027-01-01','外派100%',800,170,400],
  ['operations','运维经理',1,'园区','2027-01-01','外派100%',800,355,400],
  ['b1-supervisors','专业主管',8,'第一栋楼','2027-02-01','外派100%',290,715,440],
  ['b1-engineers','白班工程师',10,'第一栋楼','2027-04-01','外派80% · 本地20%',70,940,420],
  ['b1-shift-leads','值班长',4,'第一栋楼','2027-05-01','外派100%',530,940,420],
  ['b1-operators','值班员',32,'第一栋楼','2027-07-01','外派20% · 本地20% · 外包60%',530,1190,420],
  ['b2-supervisors','专业主管',4,'第二栋楼','2027-03-01','外派100%',1270,715,440],
  ['b2-engineers','白班工程师',10,'第二栋楼','2027-05-01','外派80% · 本地20%',1050,940,420],
  ['b2-shift-leads','值班长',4,'第二栋楼','2027-05-01','外派100%',1510,940,420],
  ['b2-operators','值班员',32,'第二栋楼','2027-09-01','外派20% · 本地20% · 外包60%',1510,1190,420],
];
export const staffingPlan = definitions.map(([id,role,planned,building,requiredArrival,employment,x,y,width])=>({id,role,planned,building,requiredArrival,employment,x,y,width}));
const roleGroups={专业主管:['专业主管','电气主管','暖通主管','消防主管','弱电主管'],白班工程师:['白班工程师','电气工程师','暖通工程师','消防工程师','弱电工程师'],值班长:['值班长','运维值班长'],值班员:['值班员','运维值班员']};
function belongs(person,node) { return (roleGroups[node.role]||[node.role]).includes(person.role) && (node.building==='园区'||person.building===node.building); }
export function selectPeople(people,id) {
  const node=staffingPlan.find(n=>n.id===id);
  if (id==='all') return people;
  if (id==='building-managers') return people.filter(p=>p.role==='楼栋经理');
  if (id==='other') return people.filter(p=>p.role!=='楼栋经理' && !staffingPlan.some(n=>belongs(p,n)));
  return node?people.filter(p=>belongs(p,node)):[];
}
export function buildOrganization(people) {
  return {planned:staffingPlan.reduce((n,r)=>n+r.planned,0),confirmed:people.length,nodes:staffingPlan.map(n=>({...n,confirmed:selectPeople(people,n.id).length})),other:people.filter(p=>!staffingPlan.some(n=>belongs(p,n)))};
}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderRoster(rows,planned=false) {
  const cols=planned?[['building','楼栋'],['role','岗位'],['planned','编制人数'],['requiredArrival','需求到岗日期'],['employment','用工占比']]
    :[['number','编号'],['name','姓名'],['role','岗位'],['building','楼栋'],['source','人员来源'],['region','原区域'],['site','原机房'],['requiredArrival','需求到岗日期'],['plannedArrival','计划到岗日期'],['actualArrival','实际到岗日期'],['status','筹备状态']];
  return `<table class="org-roster-table"><thead><tr>${cols.map(([,label])=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${cols.map(([key])=>`<td>${escape(row[key]||'—')}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${cols.length}" class="org-empty">暂无人员</td></tr>`}</tbody>${planned?`<tfoot><tr><th colspan="2">架构总人数</th><td>${rows.reduce((n,r)=>n+r.planned,0)}</td><td colspan="2"></td></tr></tfoot>`:''}</table>`;
}

export function createTeamOrganization({dialog,canvas,onClose,fetchData=globalThis.fetch.bind(globalThis)}) {
  const image=dialog.querySelector('#organizationChartImage'), retry=dialog.querySelector('#organizationChartRetry');
  const status=dialog.querySelector('.organization-chart-status'), statusText=dialog.querySelector('#organizationChartStatus');
  const sync=dialog.querySelector('#organizationChartSync');
  const stage=document.createElement('div');stage.className='org-stage';stage.hidden=true;
  const overlay=document.createElement('div');overlay.className='org-overlay';stage.append(image,overlay);canvas.append(stage);
  const roster=document.createElement('section');roster.className='org-roster';roster.hidden=true;canvas.append(roster);
  canvas.setAttribute('aria-label','组织架构画布，可滚轮缩放和拖动');
  const panZoom=createDiagramCanvas({viewport:canvas,stage,width:2000,height:1400});
  let data=null,loadedAt=0,pending=null,generation=0,returnButton=null,scroll={left:0,top:0};
  const setState=(state,message='')=>{canvas.dataset.state=state;status.hidden=state==='ready';stage.hidden=state!=='ready'||!roster.hidden;panZoom.setEnabled(state==='ready'&&roster.hidden);sync.disabled=state==='loading';sync.setAttribute('aria-busy',String(state==='loading'));statusText.textContent=message;retry.hidden=state!=='error';};
  const render=()=>{
    const model=buildOrganization(data.people);
    overlay.innerHTML=`<div class="org-live-totals"><span>2 × 75MW</span><div><button data-org-list="planned"><small>架构总人数</small><strong>${model.planned}<em>人</em></strong></button><button data-org-list="all"><small>已确认</small><strong>${model.confirmed}<em>人</em></strong></button></div></div>`
      +model.nodes.map(n=>`<button class="org-node-hit ${n.building==='园区'?'org-node-dark':''} ${n.confirmed>n.planned?'org-overfilled':''}" style="left:${n.x/20}%;top:${n.y/14}%;width:${n.width/20}%;height:${160/14}%" data-org-list="${n.id}" aria-label="${escape(n.building)}${escape(n.role)}，编制${n.planned}人，已确认${n.confirmed}人"><span class="org-confirmed">已确认 <b>${n.confirmed}</b></span></button>`).join('')
      +`<button class="org-extra-managers" data-org-list="building-managers"><span>楼栋经理</span><span>已确认 <b>${selectPeople(data.people,'building-managers').length}</b> 人</span></button>`
      +(selectPeople(data.people,'other').length?`<button class="org-unassigned" data-org-list="other">其他岗位 / 待分楼栋 ${selectPeople(data.people,'other').length}人</button>`:'');
  };
  const loadImage=()=>new Promise((resolve,reject)=>{
    if(image.complete&&image.naturalWidth){resolve();return;}
    const timer=setTimeout(()=>{clean();reject(Error('架构图加载超时，请重试。'));},15000);
    const clean=()=>{clearTimeout(timer);image.removeEventListener('load',done);image.removeEventListener('error',fail);};
    const done=()=>{clean();resolve();}, fail=()=>{clean();reject(Error('架构图加载失败，请重试。'));};
    image.addEventListener('load',done,{once:true});image.addEventListener('error',fail,{once:true});
    image.src='/assets/vnet-thailand-organization.svg?v=20261024';
  });
  const read=async(refresh=false)=>{
    if(!refresh&&data&&Date.now()-loadedAt<60000)return data;
    if(pending)return pending;
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),100000);
    pending=(async()=>{
      const response=await fetchData(`/api/team-organization?project=thailand${refresh?'&refresh=1':''}`,{cache:'no-store',signal:controller.signal});
      const result=await response.json();
      if(!response.ok||!result.ok||!Array.isArray(result.data?.people))throw Error(result.error||'人员清单读取失败，请重试。');
      data=result.data;loadedAt=Date.now();return data;
    })().finally(()=>{clearTimeout(timer);pending=null;});return pending;
  };
  const load=async(refresh=false)=>{
    const token=++generation;roster.hidden=true;setState('loading','正在读取正式团队表…');
    try{await Promise.all([read(refresh),loadImage()]);if(token!==generation)return;image.hidden=false;render();setState('ready');panZoom.reset();}
    catch(error){if(token!==generation)return;setState('error',error.name==='AbortError'?'读取超时，请重试。':error.message||'人员清单读取失败，请重试。');}
  };
  const showChart=()=>{roster.hidden=true;setState('ready');canvas.scrollTo(scroll.left,scroll.top);returnButton?.focus({preventScroll:true});};
  const showRoster=(id,button)=>{
    if(!data)return;returnButton=button;scroll={left:canvas.scrollLeft,top:canvas.scrollTop};
    const planned=id==='planned',node=staffingPlan.find(n=>n.id===id),rows=planned?staffingPlan:selectPeople(data.people,id);
    const title=planned?'架构编制清单':id==='all'?'已确认人员':id==='building-managers'?'楼栋经理':id==='other'?'其他岗位 / 待分楼栋':`${node.building} · ${node.role}`;
    roster.innerHTML=`<header><button type="button" data-org-back>← 返回架构</button><h4>${escape(title)} <span>${planned?106:rows.length}人</span></h4></header><div class="org-roster-scroll">${renderRoster(rows,planned)}</div>`;
    stage.hidden=true;roster.hidden=false;panZoom.setEnabled(false);canvas.scrollTo(0,0);roster.querySelector('[data-org-back]').focus();
  };
  retry.addEventListener('click',()=>load(true));
  sync.addEventListener('click',()=>load(true));
  canvas.addEventListener('click',event=>{const action=event.target.closest('[data-org-list]');if(action)showRoster(action.dataset.orgList,action);if(event.target.closest('[data-org-back]'))showChart();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();onClose();});
  dialog.addEventListener('keydown',event=>containDiagramFocus(dialog,event));
  dialog.addEventListener('click',event=>{
    if(event.target.closest('[data-organization-chart-close]')){onClose();return;}
    if(event.target!==dialog)return;const b=dialog.getBoundingClientRect();
    if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)onClose();
  });
  dialog.addEventListener('close',()=>panZoom.setEnabled(false));
  return {open(){canvas.scrollTo(0,0);load();},refresh(){return load(true);}};
}
