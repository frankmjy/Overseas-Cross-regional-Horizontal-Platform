import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {BaseAdapter} from '../research/adapter.mjs';
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const dir='reports/source-references-20261018',state=JSON.parse(await fs.readFile(dir+'/migration-ledger.json','utf8'));
const api=new BaseAdapter({baseToken:state.target});
const report=[];
for(const project of ['th','my']){
 const m=state.projects[project].tblYPOOSNaNd16dh;
 const args=['--table-id',m.id,'--form-id',m.views.vewtr9UUfa.id,'--format','json'];
 const desired=['fldndYZWRy','fldB1TBpbh','fldSKfIP0H','fldhasajdH','fldJSutef5'].map(id=>m.fields[id]);
 const before=(await api.cli('+form-questions-list',args)).questions;
 const fieldsBefore=(await api.cli('+field-list',['--table-id',m.id,'--format','json'])).fields.map(f=>f.id).sort();
 const unwanted=before.filter(q=>!desired.includes(q.id));
 if(unwanted.length)await api.cli('+form-questions-delete',[...args,'--question-ids',JSON.stringify(unwanted.map(q=>q.id)),'--keep-field','--yes']);
 const after=(await api.cli('+form-questions-list',args)).questions;
 const fieldsAfter=(await api.cli('+field-list',['--table-id',m.id,'--format','json'])).fields.map(f=>f.id).sort();
 assert.deepEqual(fieldsAfter,fieldsBefore,'Underlying data fields must be preserved');
 assert(after.every(q=>desired.includes(q.id)),'Unexpected helper question');
 const result={project,form:m.views.vewtr9UUfa.id,questions:after.length,underlyingFieldsPreserved:true,helpersHidden:true,missingSourceQuestions:desired.filter(id=>!after.some(q=>q.id===id))};
 report.push(result);await fs.writeFile(dir+'/form-helper-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(result));
}
