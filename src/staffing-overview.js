import {positionTotals} from './staffing-model.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=text=>`<p class="staffing-empty">${text}</p>`;

export function demandMonths(positions){
 const counts=new Map();for(const p of positions){const month=p.date?.slice(0,7);if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))counts.set(month,(counts.get(month)||0)+(p.need||0));}
 const dates=[...counts.keys()].sort();if(!dates.length)return [];
 const index=value=>Number(value.slice(0,4))*12+Number(value.slice(5))-1,start=index(dates[0]),end=index(dates.at(-1));
 return Array.from({length:end-start+1},(_,i)=>{const n=start+i,month=`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;return {month,count:counts.get(month)||0};});
}

export function renderStaffingMetrics(positions,people){
 const t=positionTotals(positions),has=positions.length>0;
 const metrics=[['编制需求',t.need,'org','查看组织架构','primary'],['自有外派',t.own,'mode','查看用工配置',''],['Local Hire',t.lh,'mode','查看用工配置',''],['外包',t.os,'mode','查看用工配置',''],['岗位面试',t.interviewTotal,'positions','查看岗位面试数',''],['已到岗',t.arrived,'positions','查看岗位到岗数',''],['当前缺口',t.gap,'gap','查看岗位缺口','gap'],['储备人员',people.length,'people','查看人员清单','']];
 return metrics.map(([label,count,action,title,tone])=>`<button type="button" class="staffing-kpi ${tone?'staffing-kpi-'+tone:''}" title="${title}" data-explore-action="${action}"><span>${label}</span><strong>${has||action==='people'?count:'—'}</strong></button>`).join('');
}

export function renderStaffingCharts(positions){
 const t=positionTotals(positions),months=demandMonths(positions),max=Math.max(1,...months.map(m=>m.count)),ceiling=Math.max(2,Math.ceil(max/2)*2),sameYear=months.length&&months[0].month.slice(0,4)===months.at(-1).month.slice(0,4),year=sameYear?months[0].month.slice(0,4):'';
 const timeline=months.length?`<div class="staffing-month-chart"><div class="staffing-chart-scale" aria-hidden="true"><span>${ceiling}</span><span>${ceiling/2}</span><span>0</span></div><div class="staffing-month-columns" style="--month-count:${months.length}">${months.map(({month,count})=>`<button type="button" class="staffing-month-column" data-explore-batch="${month}" aria-label="${month}，需求 ${count} 人" title="${month} · ${count} 人" ${count?'':'disabled'}><span class="staffing-column-space"><span class="staffing-column-bar" style="--bar-height:${count/ceiling*100}%"><b>${count}</b></span></span><span class="staffing-month-label">${sameYear?month.slice(5)+'月':month}</span></button>`).join('')}</div></div>`:empty('暂无配置');
 const channels=[['自有外派','own',t.own],['Local Hire','lh',t.lh],['外包','os',t.os]],share=n=>t.need?(n/t.need*100).toFixed(1):'0.0';
 const employment=positions.length?`<div class="staffing-composition-bar" aria-hidden="true">${channels.map(([,key,n])=>`<span class="staffing-channel-${key}" style="width:${share(n)}%"></span>`).join('')}</div><div class="staffing-composition-legend">${channels.map(([label,key,n])=>`<button type="button" data-explore-action="mode" aria-label="${label} ${n} 人，占比 ${share(n)}%"><i class="staffing-channel-${key}" aria-hidden="true"></i><span>${label}</span><b>${n}</b><span class="staffing-share">${share(n)}%</span></button>`).join('')}</div>`:empty('暂无配置');
 const roles=new Map();for(const p of positions)roles.set(p.role,(roles.get(p.role)||0)+(p.gap||0));const ranked=[...roles].filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-CN'));
 const gaps=ranked.map(([role,count],index)=>`<button type="button" class="staffing-gap-row" data-explore-gap-role="${esc(role)}" title="${esc(role)} · 缺口 ${count} 人"><span>${esc(role)}</span><span class="staffing-gap-track"><i class="${index===0?'staffing-gap-leading':''}" style="width:${count/ranked[0][1]*100}%"></i></span><b>${count}</b></button>`).join('')||empty('暂无缺口');
 return {timeline,employment,gaps,year};
}
