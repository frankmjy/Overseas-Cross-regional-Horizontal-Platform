import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

async function fixture(responses,search='?returnTo=%2Fproject-management'){
 const element=(value='')=>({value,textContent:'',hidden:true,disabled:true,dataset:{},attrs:{},listeners:{},children:[],setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},addEventListener(k,fn){this.listeners[k]=fn;},replaceChildren(...children){this.children=children;this.value=children[0]?.value||'';},focus(){this.focused=true;}});
 const elements={'#loginStatus':element(),'#feishuLogin':element(),'#loginProject':element(),'#loginRetry':element(),'#loginPanel':element(),'[data-application-settings]':element()};
 elements['#loginProject'].children=[{text:'正在读取项目…',value:''}];
 const listeners={},timers=[];let requests=0;
 const source=fs.readFileSync('auth/web/login.js','utf8').replace(/^import[^\n]+\n/,'');
 await vm.runInNewContext(`(async()=>{${source}\n})()`,{document:{querySelector:s=>elements[s]},location:{search,origin:'https://localhost:3333'},history:{replaceState(){}},URL,URLSearchParams,AbortSignal,Option:class{constructor(text,value){this.text=text;this.value=value;}},fetch:async()=>{requests++;const next=responses.shift();if(next instanceof Error)throw next;return {ok:true,json:async()=>next};},addEventListener:(name,fn)=>listeners[name]=fn,setTimeout:fn=>(timers.push(fn),timers.length),clearTimeout(){}});
 return {elements,listeners,timers,requests:()=>requests};
}
const ready={projects:[{id:'th-001',name:'泰国 Araya 项目'},{id:'my-001',name:'马来项目'}],loginEnabled:true,canConfigure:false};

test('an outdated session API leaves a clear error and retry instead of a permanent loading option',async()=>{
 const f=await fixture([{ok:true,loginEnabled:true}]),select=f.elements['#loginProject'];
 assert.equal(select.children[0].text,'项目加载失败');assert.equal(select.disabled,true);
 assert.equal(f.elements['#loginRetry'].hidden,false);assert.equal(f.elements['#feishuLogin'].attrs['aria-disabled'],'true');
});
test('retry recovers the project list without reloading or inventing projects',async()=>{
 const f=await fixture([Error('network'),ready]);assert.equal(typeof f.elements['#loginRetry'].listeners.click,'function');
 await f.elements['#loginRetry'].listeners.click();assert.equal(f.requests(),2);
 assert.deepEqual(Array.from(f.elements['#loginProject'].children,x=>x.value),['','th-001','my-001']);
 assert.equal(f.elements['#loginProject'].disabled,false);assert.equal(f.elements['#loginRetry'].hidden,true);
});
test('returning to the page cannot enable login before a project is chosen',async()=>{
 const f=await fixture([ready]);f.listeners.pageshow();assert.equal(f.elements['#feishuLogin'].attrs['aria-disabled'],'true');
 const select=f.elements['#loginProject'];select.value='my-001';select.listeners.change();
 assert.equal(f.elements['#feishuLogin'].attrs['aria-disabled'],'false');
 const destination=new URL(f.elements['#feishuLogin'].href,'https://localhost:3333');
 assert.equal(destination.searchParams.get('project'),'my-001');assert.equal(destination.searchParams.get('returnTo'),'/project-management');
});


test('direct login defaults to project management and keeps explicit research destinations',async()=>{
 for(const [search,target] of [['','/project-management'],['?returnTo=%2Fresearch%3Fproject%3Doverseas','/research?project=overseas']]){
  const f=await fixture([ready],search);f.elements['#loginProject'].value='th-001';f.elements['#loginProject'].listeners.change();
  assert.equal(new URL(f.elements['#feishuLogin'].href,'https://localhost:3333').searchParams.get('returnTo'),target);
 }
});
