import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeLibrary, renderLibraryOverview } from '../knowledge/web/overview.mjs';
const categories = [{id:'standards',name:'Standards（标准与界面）'},{id:'experience',name:'Experience（经验共享）'}];
const records = [
  {category:'standards',specialty:'电气',date:'2026-10-01',links:[{url:'https://example.com'}]},
  {category:'experience',specialty:'电气',date:'',links:[]},
  {category:'experience',specialty:'',date:'2026-09-01',links:[]}
];
test('overview counts source rows, specialties, links and dated months without inventing missing dates', () => {
  const m = summarizeLibrary(records,categories,new Date('2026-10-25T00:00:00Z'));
  assert.equal(m.total,3);assert.deepEqual(m.groups.map(g=>g.count),[1,2]);
  assert.deepEqual(m.ranked,[{name:'电气',count:2}]);assert.equal(m.unclassified,1);
  assert.equal(m.linked,1);assert.equal(m.dated,2);assert.deepEqual(m.months.slice(-2).map(m=>m.count),[1,1]);
});
test('charts expose accessible labels, linked filters, real zero states and escaped values', () => {
  const html=renderLibraryOverview(records,categories,[],{category:'standards',specialty:'电气'});
  assert.match(html,/data-category="standards" aria-pressed="true"/);
  assert.match(html,/data-specialty="电气" aria-pressed="true"/);
  assert.match(html,/aria-label="标准与界面1条，经验共享2条"/);
  assert.match(renderLibraryOverview([],categories,[]),/暂无专业记录/);
  assert.doesNotMatch(renderLibraryOverview([{...records[0],specialty:'<img src=x>'}],categories,[]),/<img src=x>/);
  const loading=renderLibraryOverview([],categories,[],{loading:true});
  assert.match(loading,/aria-busy="true"/);assert.doesNotMatch(loading,/0条|>0</);
});
