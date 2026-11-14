import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectRecord} from '../knowledge/model.mjs';
import {directoryDocuments,visibleDirectory} from '../knowledge/directory.mjs';

test('assistant guide uses configured source tables and preparation directory IDs',()=>{
 const config=JSON.parse(readFileSync(new URL('../knowledge/config.json',import.meta.url),'utf8'));
 const guide=readFileSync(new URL('../docs/MEETING_ASSISTANT_SYNC.md',import.meta.url),'utf8');
 const targets=config.sources.filter(s=>s.writable||s.kind==='meeting'||s.kind==='meeting-action');
 const prep=visibleDirectory([], 'thailand').filter(n=>n.parentId==='handover:1');
 assert.equal(targets.length,9);
 for(const table of targets)assert(guide.includes(config.baseUrl+'?table='+table.id),table.name);
 for(const node of prep)assert(guide.includes('| '+node.name+' | `'+node.id+'` |'),node.name);

 const thai=targets.find(s=>s.kind==='meeting'&&s.project==='thailand');
 const followups=targets.find(s=>s.kind==='meeting-action');
 const project=targets.find(s=>s.kind==='project-document'&&s.projectScope==='泰国');
 const regional=targets.find(s=>s.regionalOffice);
 const record=(source,id,cells)=>projectRecord(source,{id,cells},config.baseUrl);
 const meeting=record(thai,'recMeeting',{ 'Meeting Title':'施工图评审','Meeting Type':'专题评审','Meeting Date':'2026-11-13 14:00','Meeting Time':'14:00',Status:'已开' });
 const action=record(followups,'recAction',{ 'Action Title':'提交修订图纸','Araya Meeting':[meeting.id.split(':')[1]],'Action Priority':'P1','Action Status':'待办' });
 assert.equal(action.meetingRecordId,'recMeeting');
 assert.equal(action.project,'thailand');
 const material=record(project,'recDrawing',{Summary:'配电施工图',Category:'项目交付物','Stored Link':'https://example.test/drawing','Library Scope':'project','Lifecycle Chapter':'handover','Lifecycle Stage':'1','Directory Category ID':'prep:drawing-review'});
 assert.equal(directoryDocuments([material],'prep:drawing-review')[0]?.title,'配电施工图');
 assert.equal(record(regional,'recReport',{'Document Title':'区域月报',Topic:'区域月报','Document Link':'https://example.test/report'}).libraryScope,'regional');
});
