import path from 'node:path';
import {readJson,saveJson} from './storage.mjs';

const chinaClock=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});

export function startNightlySync({dir,jobs,isPaused=()=>false,now=Date.now,log=console,interval=60000}){
 const file=path.join(dir,'nightly-sync.json'),retryAfter=15*60000;
 let running,closed=false;
 function tick(){
  if(closed||isPaused()||running)return running;
  const time=now(),[day,hour]=chinaClock.format(time).split(' ');
  if(Number(hour)<2||Number(hour)>=6)return;
  running=(async()=>{
   const previous=readJson(file,null),state=previous?.day===day?previous:{day,jobs:{}};
   for(const [name,refresh] of Object.entries(jobs)){
    if(closed||isPaused())break;
    const prior=state.jobs[name],startedAt=now();
    if(prior?.status==='success'||prior&&startedAt-prior.finishedAt<retryAfter)continue;
    let status='success';
    try{await refresh();}catch{status='error';log.error(`[nightly-sync] ${day} ${name} failed; retry scheduled within the nightly window.`);}
    state.jobs[name]={status,finishedAt:now()};
    saveJson(file,state);
   }
  })().catch(()=>log.error('[nightly-sync] Could not read or persist the sync ledger.')).finally(()=>{running=null;});
  return running;
 }
 const timer=setInterval(tick,interval);timer.unref();
 return {tick,get running(){return !!running;},async close(){closed=true;clearInterval(timer);await running;}};
}
