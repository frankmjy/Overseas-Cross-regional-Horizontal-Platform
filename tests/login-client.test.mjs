import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

async function fixture(responses,search='?returnTo=%2Fproject-management'){
 const element=()=>({textContent:'',hidden:true,disabled:true,dataset:{},attrs:{},listeners:{},children:[],setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.listeners[k]=fn;},replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);},querySelector(){return this.children[0]?.children[0];},focus(){this.focused=true;}});
 const projects=element();
 const elements={'#loginStatus':element(),'#feishuLogin':element(),'#loginProject':projects,'#loginRetry':element(),'#loginPanel':element(),'[data-application-settings]':element()};
 const listeners={},timers=[];let requests=0;
 const source=fs.readFileSync('auth/web/login.js','utf8').replace(/^import[^\n]+\n/,'');
 await vm.runInNewContext(`(async()=>{${source}\n})()`,{document:{querySelector:s=>elements[s],createElement:element},location:{search,origin:'https://localhost:3333'},history:{replaceState(){}},URL,URLSearchParams,AbortSignal,fetch:async()=>{requests++;const next=responses.shift();if(next instanceof Error)throw next;return {ok:true,json:async()=>next};},addEventListener:(name,fn)=>listeners[name]=fn,setTimeout:fn=>(timers.push(fn),timers.length),clearTimeout(){}});
 function choose(id){
  const inputs=projects.children.map(label=>label.children[0]);
  for(const input of inputs)input.checked=input.value===id;
  projects.listeners.change({target:inputs.find(input=>input.checked)});
 }
 return {elements,projects,choose,listeners,timers,requests:()=>requests};
}
const ready={projects:[{id:'th-001',name:'泰国 Araya 项目'},{id:'my-001',name:'马来项目'}],loginEnabled:true,canConfigure:false};

test('an outdated session API leaves a clear error and retry',async()=>{
 const f=await fixture([{ok:true,loginEnabled:true}]);
 assert.equal(f.elements['#loginStatus'].textContent,'项目读取失败。');assert.equal(f.projects.disabled,true);
 assert.equal(f.projects.attrs['aria-busy'],'false');
 assert.equal(f.projects.children.length,0);
 assert.equal(f.elements['#loginRetry'].hidden,false);assert.equal(f.elements['#feishuLogin'].attrs['aria-disabled'],'true');
});
test('retry recovers the project list without reloading or inventing projects',async()=>{
 const f=await fixture([Error('network'),ready]);assert.equal(typeof f.elements['#loginRetry'].listeners.click,'function');
 await f.elements['#loginRetry'].listeners.click();assert.equal(f.requests(),2);
 assert.deepEqual(Array.from(f.projects.children,label=>label.children[0].value),['th-001','my-001']);
 assert.deepEqual(Array.from(f.projects.children,label=>label.children[1].textContent),['THA-ARAYA','MSA-KULAI']);
 assert(f.projects.children.every(label=>label.children[1].attrs.translate==='no'));
 assert.equal(f.projects.disabled,false);assert.equal(f.elements['#loginRetry'].hidden,true);
});
test('returning to the page cannot enable login before a project is chosen',async()=>{
 const f=await fixture([ready]);f.listeners.pageshow();assert.equal(f.elements['#feishuLogin'].attrs['aria-disabled'],'true');
 f.choose('my-001');
 assert.equal(f.elements['#feishuLogin'].attrs['aria-disabled'],'false');
 const destination=new URL(f.elements['#feishuLogin'].href,'https://localhost:3333');
 assert.equal(destination.searchParams.get('project'),'my-001');assert.equal(destination.searchParams.get('returnTo'),'/project-management');
});


test('direct login defaults to project management and keeps explicit research destinations',async()=>{
 for(const [search,target] of [['','/project-management'],['?returnTo=%2Fresearch%3Fproject%3Doverseas','/research?project=overseas']]){
  const f=await fixture([ready],search);f.choose('th-001');
  assert.equal(new URL(f.elements['#feishuLogin'].href,'https://localhost:3333').searchParams.get('returnTo'),target);
 }
});

test('explicit project wins over the session default and unlisted IDs never enable login', async()=>{
 const data={...ready,project:{id:'th-001'}};
 const requested=await fixture([data],'?project=my-001');
 assert.equal(requested.projects.children[1].children[0].checked,true);
 assert.equal(requested.elements['#feishuLogin'].attrs['aria-disabled'],'false');
 const invalid=await fixture([data],'?project=invalid');
 assert(invalid.projects.children.every(label=>!label.children[0].checked));
 assert.equal(invalid.elements['#feishuLogin'].attrs['aria-disabled'],'true');
});
