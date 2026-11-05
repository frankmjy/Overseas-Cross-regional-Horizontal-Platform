import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createStaffingHandler } from '../project-tasks/staffing/http.mjs';
import { projectById } from '../src/project-context-model.mjs';
const res = () => ({ writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); } });
function service() { return { adapter: { config: {} }, accepted: 0, snapshot: () => ({ people: [{id:'th',project:'泰国A项目'},{id:'my',project:'马来西亚项目'}],operations:[{id:'a',recordId:'th'},{id:'b',recordId:'my'}],demand:[{need:106}],positions:[{role:'园区经理'}],unmatched:[] }), accept() { this.accepted++; return {id:'mutation',status:'accepted'}; } }; }
test('Malaysia staffing snapshot excludes Thailand people, pending work and worksheet staffing totals', async () => {
  const handler=createStaffingHandler(service()),out=res();await handler({url:'/api/staffing',method:'GET',auth:{openId:'ou_test',project:projectById('my-001')}},out);
  assert.deepEqual(out.body.people.map(p=>p.id),['my']);assert.deepEqual(out.body.operations.map(o=>o.id),['b']);assert.deepEqual(out.body.positions,[]);assert.deepEqual(out.body.demand,[]);
});
test('staffing writes cannot target a person from another login project', async () => {
  const state=service(),handler=createStaffingHandler(state),out=res(),req=Readable.from([Buffer.from(JSON.stringify({id:'th'}))]);
  Object.assign(req,{url:'/api/staffing',method:'POST',headers:{host:'localhost:3333',origin:'https://localhost:3333','content-type':'application/json'},auth:{openId:'ou_test',project:projectById('my-001')}});
  await handler(req,out);assert.equal(out.status,404);assert.equal(state.accepted,0);
});
