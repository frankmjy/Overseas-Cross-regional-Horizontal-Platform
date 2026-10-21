import fs from 'node:fs/promises';
import path from 'node:path';
import {BaseAdapter} from '../research/adapter.mjs';
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const dir='reports/migration-closeout-20261019',api=new BaseAdapter({baseToken:'CID8b8V7CaCtKesWGFKcHTdqnlc'});
const plans=JSON.parse(await fs.readFile(dir+'/view-repair-plan.json','utf8'));
const selected=process.argv[2];
const report=[];
for(const p of plans)for(const c of p.changes){if(c.key==='timebar')continue;if(selected&&c.key!==selected)continue;
 const args=['--table-id',p.table,'--view-id',p.view],before=await api.cli('+view-get-'+c.key,args);
 await api.cli('+view-set-'+c.key,[...args,'--json',JSON.stringify(c.payload)]);
 const after=await api.cli('+view-get-'+c.key,args);
 report.push({project:p.project,table:p.table,view:p.view,key:c.key,before,payload:c.payload,after});
 await fs.writeFile(dir+'/view-repair-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify({table:p.table,view:p.view,key:c.key}));
}
if(selected==='rename-forms'){
 for(const [table,oldId,newId]of [['tblCTyrV3BYSZkTv','vewoWIPzBR','vewkLrPGyt'],['tblblTWYgpjMsaUh','vew5PokA2j','vewDGwGzzG']]){
  await api.cli('+view-rename',['--table-id',table,'--view-id',oldId,'--name','Form Draft（问卷草稿）']);
  await api.cli('+view-rename',['--table-id',table,'--view-id',newId,'--name','Document Collection（项目资料收集表）']);
 }
}
if(selected==='finalize-forms'){
 await api.cli('+view-delete',['--table-id','tblCTyrV3BYSZkTv','--view-id','vewkLrPGyt','--yes']);
 await api.cli('+view-rename',['--table-id','tblCTyrV3BYSZkTv','--view-id','veweaJa6N8','--name','Document Collection（项目资料收集表）']);
 const file='reports/source-references-20261018/migration-ledger.json',ledger=JSON.parse(await fs.readFile(file,'utf8'));
 for(const [p,id]of [['th','veweaJa6N8'],['my','vewDGwGzzG']]){const m=ledger.projects[p].tblYPOOSNaNd16dh,previous=m.views.vewtr9UUfa;m.views.vewtr9UUfa={...previous,id,pendingForm:false,nativeLegacyForm:true,questionCount:5,requiredCount:5,sourceOrderVerified:true,previousDraftView:previous.id,verifiedAt:new Date().toISOString()};}
 await fs.writeFile(file,JSON.stringify(ledger,null,2));
}
if(selected==='inspection-layout'){
 const table='tblAo3kzlUsZyzYt',info=await api.cli('+table-get',['--table-id',table]);
 const fields=['Issue Content（问题内容）','Duplicate Check（是否重复）','Site（机房）','Inspection Date（日期）'].map(name=>{const f=info.fields.find(f=>f.name===name);if(!f)throw Error('Missing form field');return f.id;});
 const out=await api.cli('+view-create',['--table-id',table,'--json',JSON.stringify({name:'Closeout Layout（收尾布局）',type:'grid'})]);
 const view=out.views?.[0]||out.view;if(!view?.id)throw Error('Missing view ID');
 await api.cli('+view-set-visible-fields',['--table-id',table,'--view-id',view.id,'--json',JSON.stringify({visible_fields:fields})]);
 await fs.writeFile(dir+'/inspection-layout.json',JSON.stringify({table,view:view.id,fields,beforeViews:info.views},null,2));
 console.log(JSON.stringify({table,view:view.id}));
}
if(selected==='finalize-inspection'){
 const table='tblAo3kzlUsZyzYt',original='vewOZIN2r1',view='vewjkhRy6k';
 await api.cli('+view-rename',['--table-id',table,'--view-id',original,'--name','Prior Form（原表单）']);
 await api.cli('+view-rename',['--table-id',table,'--view-id',view,'--name','Inspection Form（检查表单）']);
 const layout=JSON.parse(await fs.readFile(dir+'/inspection-layout.json','utf8'));
 await api.cli('+view-delete',['--table-id',table,'--view-id',layout.view,'--yes']);
 const file='reports/base-reorganize-20261018/source-view-reconciliation.json',ledger=JSON.parse(await fs.readFile(file,'utf8'));
 const m=ledger.forms['tbldgsbx0QzeqWOG:vewBAKQ39I'];m.previousView=original;m.targetView=view;m.ordering='Source question order';m.targetFields=[m.targetFields[0],m.targetFields[3],m.targetFields[2],m.targetFields[1]];m.verifiedAt=new Date().toISOString();
 await fs.writeFile(file,JSON.stringify(ledger,null,2));
}
