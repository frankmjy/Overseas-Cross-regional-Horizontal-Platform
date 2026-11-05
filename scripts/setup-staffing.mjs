import fs from 'node:fs';
import { BaseAdapter } from '../research/adapter.mjs';
import { saveJson } from '../knowledge/storage.mjs';
import { fields,baseToken,statuses,appId } from '../project-tasks/staffing/model.mjs';
const name='04.02 Staffing Reserve（人员储备跟踪）',file='project-tasks/staffing/config.json';
const cli=new BaseAdapter({baseToken});
const run=(cmd,args)=>cli.cli(cmd,[...args,...(process.env.STAFFING_CLI_PROFILE?['--profile',process.env.STAFFING_CLI_PROFILE]:[])]);
const defs=Object.entries(fields).map(([key,name])=>({name,...(key==='assignments'?{type:'select',multiple:true,options:['园区 · 运维经理','第二栋 · 楼栋经理（兼任）'].map(name=>({name}))}:key==='owner'?{type:'user',multiple:false}:key==='status'?{type:'select',multiple:false,options:statuses.map(name=>({name}))}:key.endsWith('Arrival')?{type:'datetime',style:{format:'yyyy/MM/dd'}}:key==='active'?{type:'checkbox'}:{type:'text'})}));
const listed=await run('+table-list',[]);const tables=listed.tables||[];const matches=tables.filter(t=>t.name===name);if(matches.length>1)throw Error('存在同名表，先核对，未继续创建。');
let table=matches[0];if(!table){if(fs.existsSync(file))throw Error('已有绑定但远端未找到同名表，禁止重复创建。');const result=await run('+table-create',['--name',name,'--fields',JSON.stringify(defs)]);table=result.table;if(!table?.id)throw Error('创建回执缺少ID，先回读核对，禁止重试创建。');}
const schema=await run('+field-list',['--table-id',table.id]);for(const d of defs){const f=schema.fields.find(f=>f.name===d.name);if(!f||f.type!==d.type)throw Error('人员储备字段缺失或类型不符：'+d.name);}
const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
saveJson(file,{appId,baseToken,table:table.id,url:`https://vnet.feishu.cn/base/${baseToken}?table=${table.id}`,directoryStatus:previous?.table===table.id?previous.directoryStatus:'pending',folder:'bfl7ZSvzzCoqYwCA'});
console.log(JSON.stringify({table:table.id,fields:schema.fields.length,url:`https://vnet.feishu.cn/base/${baseToken}?table=${table.id}`,directoryStatus:'pending'}));
