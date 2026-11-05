import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandoverEditor,renderTaskDeliverables} from '../samples/handover-preview/editor.mjs';

test('交付物入口在条目内，链接去重并过滤危险地址，文件名转义',()=>{
 const html=renderTaskDeliverables({deliverableLinks:'https://example.com/a\nhttps://example.com/a\nhttps://name:password@example.com/b',url:'javascript:alert(1)',attachments:[{name:'<img onerror=x>'}]});
 assert.match(html,/data-editor-delivery/);assert.match(html,/type="button"/);
 assert.equal((html.match(/href="https:\/\/example.com\/a"/g)||[]).length,1);
 assert.doesNotMatch(html,/href="(?:javascript:|https:\/\/name:password)/);
 assert.match(html,/&lt;img onerror=x&gt;/);
 assert.match(renderTaskDeliverables({}),/添加交付物/);
});

function dialogStub(){
 const events={},retry={},status={classList:{toggle(){}}};
 return{events,retry,open:false,dataset:{},innerHTML:'',showModal(){this.open=true;},close(){this.open=false;},querySelectorAll(){return[];},querySelector(selector){return selector==='[data-retry-quick]'?{addEventListener(type,fn){retry[type]=fn;}}:status;},addEventListener(type,fn){events[type]=fn;}};
}
test('行内完成回执不明时锁定核对，503重试沿用同一提交标识',async t=>{
 const dialog=dialogStub(),requests=[],accepted=[];let calls=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{requests.push(JSON.parse(options.body));return{ok:++calls>1,status:calls===1?503:202,json:async()=>calls===1?{ok:false,error:'暂时不可用'}:{ok:true,revision:2}};});
 const editor=createHandoverEditor({dialog,api:'/api/handover-plan',getModel:()=>({}),onAccepted:v=>accepted.push(v),onMessage(){}});
 await editor.quick({id:'recTask',version:'v1'},'update',{actualCompletion:'2026-11-02'});
 assert.ok(dialog.open);let prevented=false;dialog.events.cancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);
 await dialog.retry.click();assert.deepEqual(requests[0],requests[1]);assert.equal(accepted.length,1);assert.equal(dialog.open,false);
 prevented=false;dialog.events.cancel({preventDefault(){prevented=true;}});assert.equal(prevented,false);
});
