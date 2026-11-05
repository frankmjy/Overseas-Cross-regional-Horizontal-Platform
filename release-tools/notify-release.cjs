'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function buildCard(info){
 assert.match(info.release,/^\d{8}\.\d+$/);assert(['start','success','error'].includes(info.phase));
 assert(info.startedAt&&Number.isFinite(Date.parse(info.startedAt)));assert(info.changes?.length&&info.changes.length<=5);
 assert.match(info.baseline,/^\d{8}\.\d+$/);const url=new URL(info.accessUrl);assert.equal(url.protocol,'https:');assert(!url.username&&!url.password&&!url.search&&!url.hash);
 if(info.phase==='success')assert(info.remoteVerified===true&&info.endedAt&&Number.isFinite(Date.parse(info.endedAt)),'Verified remote result required');
 const time=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
 const title={start:'更新开始',success:'更新结束',error:'更新未完成'}[info.phase];
 const state={start:'开始',success:'结束',error:'更新未完成'}[info.phase];
 const markdown=content=>({tag:'markdown',content});
 return {schema:'2.0',config:{update_multi:true,width_mode:'default',summary:{content:`海外协作平台 · ${title} · ${info.release}`}},header:{title:{tag:'plain_text',content:`海外协作平台 · ${title}${info.preview?'（预览）':''}`},template:{start:'blue',success:'green',error:'orange'}[info.phase]},body:{padding:'16px',vertical_spacing:'12px',elements:[
  {tag:'column_set',flex_mode:'none',columns:[{tag:'column',width:'weighted',weight:1,elements:[markdown(`**状态：** ${info.preview?'预览 · ':''}${state}\n**版本号：** ${info.release}\n**版本类型：** 功能迭代与优化\n**迭代周期：** ${time(info.startedAt)} ～ ${info.endedAt?time(info.endedAt):'更新中'}`)]}]},
  {tag:'column_set',flex_mode:'none',columns:[{tag:'column',width:'weighted',weight:1,elements:[markdown(`**更新内容**\n${info.changes.map(change=>'- '+change).join('\n')}\n\n**回退版本：** ${info.baseline}`),...(info.note?[markdown(info.note)]:[])]}]},
  ...(info.phase==='start'?[]:[{tag:'button',type:'primary_filled',width:'fill',text:{tag:'plain_text',content:'访问平台'},behaviors:[{type:'open_url',default_url:info.accessUrl}]}])
 ]}};
}
function send(root,input,preview=false,run){
 const binding=read(path.join(root,'auth/application.json')),settings=read(path.join(root,'release-tools/release-notifications.json'));
 assert.equal(binding.appId,'cli_aa547c8de6785ce2');assert.match(settings.chatId,/^oc_[a-f0-9]{32}$/);
 const info={...input,accessUrl:settings.accessUrl,preview};const card=buildCard(info),content=JSON.stringify(card),recipient=preview?binding.recipient:settings.chatId;
 const key=sha([binding.appId,recipient,info.release,info.phase,preview?'preview':'production',info.eventId||''].join(':')).slice(0,40);
 const file=path.join(root,'.runtime/release-notifications',key+'.json');fs.mkdirSync(path.dirname(file),{recursive:true});
 if(fs.existsSync(file)){const old=read(file);assert.equal(old.contentSha256,sha(content),'Notification changed after submission');if(old.status==='sent')return {status:'already-sent',messageId:old.messageId};throw Error('Notification outcome unresolved; inspect receipt before retrying');}
 const cli=run||((args)=>{const entry=process.env.LARK_CLI_ENTRY||path.join(path.dirname(process.execPath),'node_modules/@larksuite/cli/scripts/run.js');assert(fs.existsSync(entry),'Lark CLI entry missing');const result=spawnSync(process.execPath,[entry,...args],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000,env:{...process.env,LARKSUITE_CLI_NO_UPDATE_NOTIFIER:'1',LARKSUITE_CLI_NO_SKILLS_NOTIFIER:'1'}});assert.equal(result.status,0,'Feishu send failed; inspect notification ledger');return JSON.parse(result.stdout);});
 const identity=cli(['whoami']);assert.equal(identity.appId,binding.appId);assert.equal(identity.available,true);
 const record={schema:1,appId:binding.appId,recipient,release:info.release,phase:info.phase,preview,contentSha256:sha(content),card,status:'sending',startedAt:new Date().toISOString(),idempotencyKey:key};
 const save=()=>{fs.writeFileSync(file+'.new',JSON.stringify(record,null,2));fs.renameSync(file+'.new',file);};save();
 const reply=cli(['im','+messages-send','--as','bot',preview?'--user-id':'--chat-id',recipient,'--msg-type','interactive','--content',content,'--idempotency-key',key,'--json']);assert.equal(reply.ok,true);assert.match(reply.data?.message_id||'',/^om_/);
 Object.assign(record,{status:'sent',messageId:reply.data.message_id,chatId:reply.data.chat_id,sentAt:new Date().toISOString()});save();return {status:'sent',messageId:record.messageId,recipient};
}
module.exports={buildCard,send};
if(require.main===module){try{console.log(JSON.stringify(send(path.resolve(__dirname,'..'),read(process.argv[2]),process.argv.includes('--preview'))));}catch(error){console.error(error.message);process.exitCode=1;}}
