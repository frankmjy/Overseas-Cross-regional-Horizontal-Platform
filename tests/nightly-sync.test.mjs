import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startNightlySync} from '../knowledge/nightly-sync.mjs';

test('nightly sync follows China time, resumes failures after restart and preserves successful jobs',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'overseas-nightly-'));
 t.after(async()=>{await fs.unlink(path.join(dir,'nightly-sync.json'));await fs.rmdir(dir);});
 let now=Date.parse('2026-11-14T17:59:00Z'),paused=false,fail=true;
 const calls=[],errors=[];
 const options={dir,now:()=>now,isPaused:()=>paused,log:{error:message=>errors.push(message)},jobs:{
  knowledge:async()=>{calls.push('knowledge');if(fail)throw Error('upstream');},
  project:async()=>calls.push('project'),
 }};
 let job=startNightlySync(options);
 t.after(()=>job.close());
 await job.tick();
 assert.deepEqual(calls,[]);
 now+=60000;
 paused=true;
 await job.tick();
 assert.deepEqual(calls,[]);
 paused=false;
 const run=job.tick();
 assert.equal(job.tick(),run);
 await run;
 assert.deepEqual(calls,['knowledge','project']);
 assert.equal(errors.length,1);
 await job.close();
 job=startNightlySync(options);
 fail=false;
 now+=14*60000;
 await job.tick();
 assert.deepEqual(calls,['knowledge','project']);
 now+=60000;
 await job.tick();
 await job.tick();
 assert.deepEqual(calls,['knowledge','project','knowledge']);
 const ledger=JSON.parse(await fs.readFile(path.join(dir,'nightly-sync.json'),'utf8'));
 assert.equal(ledger.day,'2026-11-15');
 assert.equal(ledger.jobs.knowledge.status,'success');
 now=Date.parse('2026-11-15T18:00:00Z');
 await job.tick();
 assert.deepEqual(calls,['knowledge','project','knowledge','knowledge','project']);
 await job.close();
});
