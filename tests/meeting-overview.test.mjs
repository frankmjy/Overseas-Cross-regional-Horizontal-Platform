import test from 'node:test';
import assert from 'node:assert/strict';
import {meetingMonthNow,summarizeMeetings,renderMeetingOverview,renderMeetingCalendar,renderMeetingFollowups} from '../knowledge/web/meetings-overview.mjs';
const rows=[
 {id:'a',project:'thailand',title:'澄清会议',date:'2026-10-15',links:[{label:'会议纪要'},{label:'会议妙记'}],actions:[]},
 {id:'b',project:'malaysia',title:'项目会<script>',date:'2026-10-16',links:[{label:'会议妙记'}],actions:[{title:'确认接口',owner:'专业组',due:'2026-10-28',status:'未完成'},{title:'已处理',status:'已完成'}]},
 {id:'c',project:'thailand',title:'未填日期',date:'',links:[],actions:[]}
];
test('meeting overview counts actual links and actions without inventing closure',()=>{
 const m=summarizeMeetings(rows,new Date('2026-10-25T01:00:00Z'));
 assert.equal(m.total,3);assert.equal(m.thisMonth,2);assert.equal(m.minutes,1);assert.equal(m.recordings,2);assert.equal(m.both,1);assert.equal(m.pending,1);assert.equal(m.undated,1);
 assert.equal(m.days.length,14);assert.equal(m.days[0].date,'2026-10-12');assert.equal(m.days.at(-1).date,'2026-10-25');
 assert.deepEqual(m.projects.map(p=>p.count),[2,1,0]);assert.equal(m.missingMinutes.length,2);
 assert.equal(m.days.reduce((n,d)=>n+d.total,0),2);
 const html=renderMeetingFollowups(rows);assert.match(html,/确认接口/);assert.doesNotMatch(html,/已处理|<script>/);assert.match(html,/项目会&lt;script&gt;/);
});
test('overseas team has its own source, stacked segment and share of the ring',()=>{
 const all=[...rows,{id:'team',project:'overseas',title:'海外同频',date:'2026-10-23',links:[],actions:[]}];
 const m=summarizeMeetings(all,new Date('2026-10-25T01:00:00Z'));
 assert.equal(m.total,4);assert.deepEqual(m.projects.map(p=>p.count),[2,1,1]);
 assert.equal(m.days.find(d=>d.date==='2026-10-23').overseas,1);
 const html=renderMeetingOverview(all,{project:'overseas'});
 assert.match(html,/海外同频/);assert.match(html,/data-project="overseas" aria-pressed="true"/);
 assert.match(html,/conic-gradient/);assert.match(html,/#c89941/);
});
test('Shanghai month boundary and empty overview are explicit',()=>{
 assert.equal(meetingMonthNow(new Date('2026-10-31T16:01:00Z')),'2026-11');
 const html=renderMeetingOverview([]);assert.match(html,/0<span>场会议/);assert.doesNotMatch(html,/NaN|Infinity/);
 assert.match(renderMeetingOverview([],{},true),/overview-placeholder/);
 assert.match(renderMeetingFollowups([]),/暂无跟进事项/);
});
test('calendar handles leap day, weekday alignment and date drilldown',()=>{
 const html=renderMeetingCalendar([{date:'2028-02-29'}],'2028-02','2028-02-29');
 assert.equal((html.match(/class="meeting-day-blank"/g)||[]).length,1);
 assert.equal((html.match(/data-meeting-day=/g)||[]).length,29);
 assert.match(html,/data-meeting-day="2028-02-29"[^>]*aria-pressed="true"/);
 assert.doesNotMatch(html,/2028-02-30/);assert.match(html,/aria-label="上个月"/);
});
