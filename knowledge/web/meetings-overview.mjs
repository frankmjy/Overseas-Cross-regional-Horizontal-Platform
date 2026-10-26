import {projects} from './data.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const projectMeta=projects.map(p=>({...p,name:/（([^）]+)）/.exec(p.label)?.[1]||p.name}));
export const meetingMonthNow=(now=new Date())=>new Date(Number(now)+8*3600000).toISOString().slice(0,7);
export function summarizeMeetings(records,now=new Date()){
 const month=meetingMonthNow(now),today=new Date(Number(now)+8*3600000).toISOString().slice(0,10),end=Date.parse(today+'T00:00:00Z');
 const days=Array.from({length:14},(_,i)=>{
  const date=new Date(end-(13-i)*86400000).toISOString().slice(0,10),rows=records.filter(m=>m.date===date);
  return {date,total:rows.length,thailand:rows.filter(m=>m.project==='thailand').length,malaysia:rows.filter(m=>m.project==='malaysia').length,overseas:rows.filter(m=>m.project==='overseas').length};
 });
 const has=(m,label)=>m.links?.some(l=>l.label===label);
 const minutes=records.filter(m=>has(m,'会议纪要')).length,recordings=records.filter(m=>has(m,'会议妙记')).length;
 return {total:records.length,thisMonth:records.filter(m=>m.date?.startsWith(month)).length,lastDate:records.map(m=>m.date).filter(Boolean).sort().at(-1)||'',
  projects:projectMeta.map(p=>({...p,count:records.filter(m=>m.project===p.id).length})),days,minutes,recordings,both:records.filter(m=>has(m,'会议纪要')&&has(m,'会议妙记')).length,
  pending:records.flatMap(m=>m.actions||[]).filter(a=>a.status!=='已完成').length,missingMinutes:records.filter(m=>!has(m,'会议纪要')),undated:records.filter(m=>!m.date).length};
}
function meetingRing(groups,total){let offset=0;return total?'conic-gradient('+groups.map(p=>{const start=offset;offset+=p.count/total*100;return `${p.color} ${start}% ${offset}%`;}).concat([`#e9eef7 ${offset}% 100%`]).join(',')+')':'#e9eef7';}
export function renderMeetingOverview(records,state={},loading=false){
 if(loading)return ['会议总览','议事节奏','会议版图','留痕覆盖'].map(t=>`<article class="overview-placeholder"><h2>${t}</h2><b>—</b><i></i><i></i></article>`).join('');
 const m=summarizeMeetings(records),max=Math.max(1,...m.days.map(d=>d.total)),ring=meetingRing(m.projects,m.total);
 return `<article class="overview-total meeting-total"><header>会议总览<span>海外协作</span></header><div class="overview-number">${m.total}<span>场会议</span></div><footer><div><b>${m.thisMonth}</b><span>本月</span></div><div><b>${m.pending}</b><span>待跟进</span></div></footer><div class="meeting-last-date">最近议事 <time>${m.lastDate?m.lastDate.replaceAll('-','.'):'—'}</time></div></article>
 <article class="overview-chart meeting-cadence"><header><h2>议事节奏</h2><span>近 14 天</span></header><div class="cadence-legend">${projectMeta.map(p=>`<span><i style="background:${p.color}"></i>${p.id==='overseas'?'团队':p.name.replace('项目','')}</span>`).join('')}<b>${m.days.reduce((n,d)=>n+d.total,0)} 场</b></div><div class="cadence-bars" aria-label="近十四天会议分布">${m.days.map((d,i)=>`<button type="button" data-meeting-day="${d.date}" style="--day-height:${d.total/max*78}px" aria-label="${d.date}，${d.total}场会议" title="${d.date} · 泰国${d.thailand} · 马来${d.malaysia} · 团队${d.overseas}" ${d.total?'':'disabled'} aria-pressed="${state.date===d.date}"><b>${d.total||''}</b><i style="height:${d.total/max*78}px">${projectMeta.map(p=>`<em style="height:${d.total?d[p.id]/d.total*100:0}%;background:${p.color}"></em>`).join('')}</i>${[0,4,8,13].includes(i)?`<span>${d.date.slice(5).replace('-','/')}</span>`:''}</button>`).join('')}</div></article>
 <article class="overview-chart meeting-projects"><header><h2>会议版图</h2><span>${m.projects.filter(p=>p.count).length} 个板块</span></header><div class="meeting-project-body"><div class="meeting-project-ring" role="img" aria-label="${m.projects.map(p=>p.name+p.count+'场').join('，')}" style="background:${ring}"><div><b>${m.total}</b><span>会议记录</span></div></div><div class="meeting-project-legend">${m.projects.map(p=>`<button type="button" data-project="${p.id}" aria-pressed="${state.project===p.id}"><i style="background:${p.color}"></i><span>${p.name}</span><b>${p.count}</b></button>`).join('')}</div></div></article>
 <article class="overview-chart meeting-coverage"><header><h2>留痕覆盖</h2><span>${m.total} 场会议</span></header><div>${[['会议纪要',m.minutes],['会议妙记',m.recordings],['纪要＋妙记',m.both]].map(([label,count],i)=>`<section><span>${label}<b>${count}<small> / ${m.total}</small></b></span><i><b style="width:${m.total?count/m.total*100:0}%;--coverage-color:${['#4568d7','#28a18f','#91a9d4'][i]}"></b></i></section>`).join('')}</div></article>`;
}
export function renderMeetingCalendar(records,month,selected=''){
 const first=new Date(month+'-01T00:00:00Z'),count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate(),offset=(first.getUTCDay()+6)%7,today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 const cells=Array.from({length:offset},()=>'<span class="meeting-day-blank"></span>');
 for(let day=1;day<=count;day++){
  const date=`${month}-${String(day).padStart(2,'0')}`,rows=records.filter(m=>m.date===date),classes=['meeting-day',...(rows.length?['has-meetings']:[]),...(today===date?['is-today']:[])].join(' ');
  cells.push(`<button type="button" class="${classes}" data-meeting-day="${date}" aria-label="${date}，${rows.length}场会议" aria-pressed="${selected===date}" ${rows.length?'':'disabled'}><span>${day}</span>${rows.length?`<i style="--day-strength:${Math.min(rows.length,4)/4}"></i><small>${rows.length}</small>`:''}</button>`);
 }
 return `<header><h2>议事日历</h2><div><button type="button" data-meeting-month="-1" aria-label="上个月">‹</button><strong>${month.replace('-','年')}月</strong><button type="button" data-meeting-month="1" aria-label="下个月">›</button></div></header><div class="meeting-weekdays">${['一','二','三','四','五','六','日'].map(d=>`<span>${d}</span>`).join('')}</div><div class="meeting-month-grid">${cells.join('')}</div>`;
}
export function renderMeetingFollowups(records){
 const m=summarizeMeetings(records),pending=records.flatMap(meeting=>(meeting.actions||[]).filter(a=>a.status!=='已完成').map(action=>({meeting,action})));
 return `<header><h2>跟进事项</h2><b>${m.pending}</b></header><div class="meeting-action-list">${pending.length?pending.map(({meeting,action})=>`<button type="button" data-meeting="${esc(meeting.id)}"><strong>${esc(action.title)}</strong><span>${esc(action.owner||meeting.title)}</span>${action.due?`<time>${esc(action.due)}</time>`:''}</button>`).join(''):'<p class="meeting-no-actions">暂无跟进事项</p>'}</div><div class="meeting-missing-minutes"><h3>待补纪要<span>${m.missingMinutes.length}</span></h3>${m.missingMinutes.map(meeting=>`<button type="button" data-meeting="${esc(meeting.id)}"><span>${esc(meeting.title)}</span><time>${esc(meeting.date.slice(5).replace('-','/'))}</time></button>`).join('')||'<p class="meeting-no-actions">纪要已齐备</p>'}</div>`;
}
