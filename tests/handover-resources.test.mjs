import test from 'node:test';
import assert from 'node:assert/strict';
import {taskResources,renderResourceLinks,bindOutsideDismiss} from '../project-tasks/handover/resources.mjs';

test('链接保留标题直达内容；附件清理前缀直达任务记录',()=>{
 const task={url:'https://vnet.feishu.cn/base/base?table=tasks&record=recTask',deliverableLinks:'[白皮书](https://example.com/doc)\nhttps://example.com/doc',attachments:[{name:'1234abcd-abcd1234-验收清单.pdf'}]};
 const rows=taskResources(task);
 assert.deepEqual(rows.map(r=>[r.kind,r.title,r.url]),[['link','白皮书','https://example.com/doc'],['attachment','验收清单.pdf',task.url]]);
 assert.match(renderResourceLinks(task),/白皮书/);assert.doesNotMatch(renderResourceLinks(task),/资料 1|1234abcd/);
});
test('旧归档回链恢复原内容入口，附件回链不重复计数；不按名称合并',()=>{
 const archive='https://vnet.feishu.cn/base/base?table=library&record=recDoc';
 const task={url:'https://vnet.feishu.cn/base/base?table=tasks&record=recTask',deliverableLinks:`[交付成果](${archive})\n[同名](https://example.com/other)`,attachments:[{name:'1234abcd-abcd1234-file.pdf'}],resourceArchives:[{title:'交付成果',contentUrl:'https://example.com/doc',archiveUrl:archive,storedNames:['1234abcd-abcd1234-file.pdf']}]};
 const rows=taskResources(task);assert.equal(rows.length,3);assert.equal(rows[0].url,'https://example.com/doc');assert.equal(rows[0].archiveUrl,archive);
 task.resourceArchives[0].contentUrl='';assert.equal(taskResources(task).length,2);
});
test('拒绝危险链接；标题和文件名转义；无记录的附件不伪造链接',()=>{
 const task={deliverableLinks:'[坏](https://user:pass@example.com/doc)\n[<img>](https://example.com/safe)',url:'javascript:alert(1)',attachments:[{name:'<script>.pdf'}]};
 const html=renderResourceLinks(task);assert.doesNotMatch(html,/href="(?:javascript:|https:\/\/user:pass)/);assert.match(html,/&lt;img&gt;/);assert.match(html,/&lt;script&gt;.pdf/);
});
test('外部点击关闭；内部拖出不关闭；提交锁定时不关闭',()=>{
 const events={},dialog={addEventListener:(k,f)=>events[k]=f,getBoundingClientRect:()=>({left:10,right:100,top:10,bottom:100})};let closed=0,allowed=true;
 bindOutsideDismiss(dialog,()=>{if(allowed)closed++;});
 const event=(x,y)=>({target:dialog,clientX:x,clientY:y});
 events.pointerdown(event(20,20));events.click(event(0,0));assert.equal(closed,0);
 events.pointerdown(event(0,0));events.click(event(0,0));assert.equal(closed,1);
 allowed=false;events.pointerdown(event(0,0));events.click(event(0,0));assert.equal(closed,1);
});
