import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { projects, filterDocuments, filterMeetings, meetingMetrics } from '../knowledge/web/data.mjs';
import { createKnowledgeHandler } from '../knowledge/http.mjs';
const documents=[{id:'kb1',title:'UPS操作手册',category:'standards',subcategory:'操作手册',sourceName:'Reference Standards',specialty:'电气',date:'2026-10-16',summary:'检查UPS',tags:['UPS'],sections:[['要求','记录']]},{id:'kb2',title:'巡检',category:'experience',subcategory:'例行',sourceName:'Operations Lessons',specialty:'综合',date:'',summary:'检查记录',tags:[],sections:[]}];
const meetings=projects.map((p,i)=>({id:'meeting'+i,project:p.id,title:p.name+' meeting',summary:'项目沟通',date:'2026-10-16',time:'16:00',type:'Held（已开）',participants:[],decisions:[],actions:[{title:'确认事项',status:'未标注'}]}));

test('knowledge search combines category, specialty and case-insensitive full text', () => {
  assert.ok(filterDocuments(documents,{ query: '  ups  ' }).length > 0);
  const result = filterDocuments(documents,{ category: 'standards', specialty: '电气', query: 'UPS' });
  assert.ok(result.length > 0);
  assert.ok(result.every(d => d.category === 'standards' && d.specialty === '电气'));
  assert.deepEqual(filterDocuments(documents,{ query: '不存在的资料xyz' }), []);
  const latest = filterDocuments(documents,{ sort: 'latest' });
  assert.ok(latest.every((d, i) => !i || latest[i - 1].date >= d.date));
  assert.equal(filterDocuments(documents).length, documents.length);
});

test('meeting project filters and metrics use only the selected project', () => {
  assert.deepEqual(projects.map(p => p.name), ['Thailand Project', 'Malaysia Project']);
  for (const project of projects) {
    const shown = filterMeetings(meetings,{ project: project.id });
    assert.ok(shown.length > 0);
    assert.ok(shown.every(m => m.project === project.id));
    assert.equal(meetingMetrics(shown).total, shown.length);
    assert.equal(meetingMetrics(shown).pending, shown.flatMap(m => m.actions).filter(a => a.status !== '已完成').length);
  }
  assert.ok(filterMeetings(meetings,{ query: 'malaysia' }).every(m => m.project === 'malaysia'));
  assert.deepEqual(filterMeetings(meetings,{ project: 'unknown' }), []);
  assert.deepEqual(filterMeetings(meetings,{ query: '不存在的会议xyz' }), []);
  assert.deepEqual(meetingMetrics([]), { total: 0, decisions: 0, pending: 0, completed: 0 });
  assert.equal(new Set([...documents, ...meetings].map(r => r.id)).size, documents.length + meetings.length);
});

test('knowledge routes serve only explicit public assets and support direct reloads', async t => {
  const handler = createKnowledgeHandler({ root: process.cwd() });
  const server = createServer(async (req, res) => { if (!await handler(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const route of ['/knowledge-sharing', '/knowledge-sharing?view=meetings&project=thailand', '/knowledge/app.mjs', '/knowledge/data.mjs', '/knowledge/styles.css']) {
    assert.equal((await fetch(origin + route)).status, 200, route);
  }
  const head = await fetch(origin + '/knowledge-sharing', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal((await fetch(origin + '/knowledge-sharing', { method: 'POST' })).status, 405);
  for (const route of ['/knowledge/http.mjs', '/knowledge/../.env', '/knowledge/unknown.mjs']) assert.equal((await fetch(origin + route)).status, 404);
});
