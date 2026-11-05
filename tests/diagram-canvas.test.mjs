import test from 'node:test';
import assert from 'node:assert/strict';
import { fitDiagram, zoomAt, panBy } from '../src/diagram-canvas.js';
import { comparisonForQuestion, renderComparisonEntry } from '../src/diagram-viewer.js';

test('fit keeps the full diagram centered inside the canvas including portrait screens',()=>{
  const fit=fitDiagram(1000,600,2000,1400);
  assert.equal(fit.height,600);assert.equal(fit.width/fit.height,2000/1400);
  assert.equal(fit.x,(1000-fit.width)/2);assert.equal(fit.y,0);
  const phone=fitDiagram(350,550,2400,1840);
  assert.equal(phone.width,350);assert(phone.height<=550);
});
test('wheel zoom preserves the point beneath the cursor and stays bounded',()=>{
  const start={scale:1,x:100,y:20};const point={x:300,y:180};
  const bigger=zoomAt(start,-120,point);
  assert(bigger.scale>1);
  assert(Math.abs((point.x-bigger.x)/bigger.scale-(point.x-start.x))<1e-8);
  assert(Math.abs((point.y-bigger.y)/bigger.scale-(point.y-start.y))<1e-8);
  let upper=start,lower=start;
  for(let i=0;i<100;i++){upper=zoomAt(upper,-500,point);lower=zoomAt(lower,500,point);}
  assert.equal(upper.scale,8);assert.equal(lower.scale,0.4);
  assert(zoomAt(bigger,120,point).scale<bigger.scale);
});
test('drag translates the canvas without changing its scale',()=>{
  assert.deepEqual(panBy({scale:2,x:-20,y:40},30,-50),{scale:2,x:10,y:-10});
});
test('only the original Malaysia team question receives the comparison action, even after rename',()=>{
  const q={projectKey:'malaysia',sourceId:'Q-001',title:'团队人员配置'};
  assert.equal(comparisonForQuestion(q)?.src,'/assets/malaysia-team-comparison.svg');
  assert(comparisonForQuestion({...q,title:'更名后的问题'}));
  assert.equal(comparisonForQuestion({...q,projectKey:'thailand'}),null);
  assert.equal(comparisonForQuestion({...q,sourceId:'Q-002'}),null);
  const html=renderComparisonEntry(q);
  assert.match(html,/data-team-comparison/);assert.match(html,/aria-label="查看团队人员配置横向对比"/);
  assert.equal(renderComparisonEntry({...q,projectKey:'thailand'}),'');
});
