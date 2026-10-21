import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const dir='reports/source-references-20261018';
const state=JSON.parse(await fs.readFile(dir+'/migration-ledger.json','utf8'));
const api=new BaseAdapter({baseToken:state.target});
for(const project of ['th','my']){
 const m=state.projects[project].tblYPOOSNaNd16dh;
 const formId=m.views.vewtr9UUfa.id;
 const args=['--table-id',m.id,'--form-id',formId,'--format','json'];
 const desired=['fldndYZWRy','fldB1TBpbh','fldSKfIP0H','fldhasajdH','fldJSutef5'].map(id=>m.fields[id]);
 assert(desired.every(Boolean));
 let current=await api.cli('+form-questions-list',args);
 await fs.writeFile(dir+`/${project}-form-before.json`,JSON.stringify(current,null,2));
 const missing=desired.filter(id=>!current.questions.some(q=>q.id===id));
 if(missing.length)await api.cli('+form-questions-create',[...args,'--questions',JSON.stringify(missing.map(id=>({use_existing_field:true,field_id:id,required:true})))]);
 current=await api.cli('+form-questions-list',args);
 assert(desired.every(id=>current.questions.some(q=>q.id===id)),'Missing form field after reuse');
 const unwanted=current.questions.filter(q=>!desired.includes(q.id));
 if(unwanted.length)await api.cli('+form-questions-delete',[...args,'--question-ids',JSON.stringify(unwanted.map(q=>q.id)),'--keep-field','--yes']);
 await api.cli('+form-questions-update',[...args,'--questions',JSON.stringify(current.questions.filter(q=>desired.includes(q.id)).map(q=>({id:q.id,title:q.title,description:q.description||'',required:true,...(q.option_display_mode===undefined?{}:{option_display_mode:q.option_display_mode}),visible_rule:null})))]);
 const result=await api.cli('+form-questions-list',args);
 assert.equal(result.questions.length,5);
 assert(result.questions.every(q=>desired.includes(q.id)&&q.required===true));
 await fs.writeFile(dir+`/${project}-form-verified.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({project,formId,questions:result.questions.length,required:result.questions.every(q=>q.required)}));
}
