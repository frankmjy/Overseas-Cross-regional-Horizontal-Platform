import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeamRows, TeamOrganizationService } from '../team-organization.mjs';
import { staffingPlan, buildOrganization, selectPeople, renderRoster } from '../src/team-organization.js';

const fields = ['Full Name（姓名文本）','Feishu Account（飞书账号）','Position（岗位）','Building（楼栋）','Mobilization Status（筹备状态）'];
const page = (rows, ids, more = false, rev = 1) => ({fields, data:rows,record_id_list:ids,has_more:more,rev});
const user = id => [{id,name:'账号姓名',email:'private@example.test'}];
test('named tentative staff count, blank rows do not, repeated accounts never inflate totals', () => {
  const result = normalizeTeamRows(page([
    ['甲',user('ou_a'),['电气工程师'],['第一栋楼','暂定'],['暂定']],
    ['',null,null,null,null],
    ['甲',user('ou_a'),['电气工程师'],['第一栋楼','暂定'],['暂定']],
    ['乙',null,['楼栋经理'],['第一栋楼','暂定'],['待到岗']],
  ],['r1','blank','duplicate','r2']), 'thailand');
  assert.equal(result.length,2);
  assert.equal(result[0].name,'甲');
  assert.equal(result[0].status,'暂定');
  assert.doesNotMatch(JSON.stringify(result),/ou_a|private@example/);
});
test('conflicting duplicate accounts fail instead of selecting an arbitrary role', () => {
  assert.throws(() => normalizeTeamRows(page([['甲',user('ou_a'),'电气工程师','第一栋楼','暂定'],['甲',user('ou_a'),'消防主管','第一栋楼','暂定']],['a','b']),'thailand'), /重复/);
});
test('106 planned positions, honest overstaffing, no double counting across buildings', () => {
  const people=[{id:'a',name:'甲',role:'运维经理',building:'第一栋楼'}, {id:'b',name:'乙',role:'运维经理',building:'第一栋楼'},
    {id:'c',name:'丙',role:'消防主管',building:'第一栋楼'},{id:'d',name:'丁',role:'楼栋经理',building:'第一栋楼'},
    {id:'e',name:'戊',role:'电气工程师',building:''}];
  const model=buildOrganization(people);
  assert.equal(staffingPlan.reduce((n,r)=>n+r.planned,0),106);
  assert.equal(model.confirmed,5);
  assert.equal(model.nodes.find(n=>n.id==='operations').confirmed,2);
  assert.equal(model.nodes.find(n=>n.id==='b1-supervisors').confirmed,1);
  assert.equal(model.nodes.find(n=>n.id==='b2-supervisors').confirmed,0);
  assert.equal(model.other.length,2);
  assert.deepEqual(selectPeople(people,'b1-supervisors').map(p=>p.name),['丙']);
  assert.equal(selectPeople(people,'all').length,5);
});
test('roster safely escapes content and never invents people for the staffing plan', () => {
  const actual=renderRoster([{name:'<script>bad</script>',role:'消防主管',building:'第一栋楼'}]);
  assert.match(actual,/&lt;script&gt;/);
  assert.doesNotMatch(actual,/<script>/);
  const planned=renderRoster(staffingPlan,true);
  assert.match(planned,/106/);
  assert.match(planned,/2027-09-01/);
});
test('read all pages, coalesce reads and keep a bounded cache', async () => {
  const offsets=[];let now=100;
  const adapter={cli:async(cmd,args)=>{offsets.push(args[args.indexOf('--offset')+1]);return offsets.at(-1)==='0'?page([['甲',user('ou_a'),'电气工程师','第一栋楼','暂定']],['r1'],true):page([['乙',null,'楼栋经理','第一栋楼','暂定']],['r2']);}};
  const service=new TeamOrganizationService({adapter,now:()=>now});
  const [a,b]=await Promise.all([service.read('thailand'),service.read('thailand')]);
  assert.deepEqual(offsets,['0','1']);assert.equal(a,b);assert.equal(a.people.length,2);
  await service.read('thailand');assert.equal(offsets.length,2);
  now+=61000;await service.read('thailand');assert.equal(offsets.length,4);
});
test('reject incomplete pages, revision changes and unknown project; errors are sanitized', async () => {
  const service=new TeamOrganizationService({adapter:{cli:async()=>{throw Error('secret-cli-output');}}});
  await assert.rejects(service.read('malaysia'),e=>!e.message.includes('secret-cli-output'));
  await assert.rejects(service.read('evil'),/项目/);
  const changing=new TeamOrganizationService({adapter:{cli:async(cmd,args)=>args.includes('0')?page([['甲',null,'电气工程师','第一栋楼','暂定']],['r1'],true,1):page([],[],false,2)}});
  await assert.rejects(changing.read('thailand'),/变化/);
  assert.throws(()=>normalizeTeamRows({fields:['unknown'],data:[['x']],record_id_list:['a']},'thailand'),/字段/);
});
