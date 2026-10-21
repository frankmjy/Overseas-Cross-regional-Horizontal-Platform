import fs from 'node:fs/promises';
import path from 'node:path';
import {BaseAdapter} from '../research/adapter.mjs';
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const base='CID8b8V7CaCtKesWGFKcHTdqnlc',table='tbl8tthnylGhfvCe',name='QA Closeout Format Probe';
const api=new BaseAdapter({baseToken:base}),endpoint=`/open-apis/bitable/v1/apps/${base}/tables/${table}/fields`,report={at:new Date().toISOString()};
let id;
try{
 const before=await api.cli('+table-get',['--table-id',table]);if(before.fields.some(f=>f.name===name))throw Error('Probe already exists; inspect before proceeding');
 const created=await api.cli('+field-create',['--table-id',table,'--json',JSON.stringify({name,type:'formula',expression:'IF(1=1,TODAY(),).TODATE()'}),'--i-have-read-guide']);
 id=created.field?.id||created.fields?.[0]?.id;if(!id)throw Error('Missing created field ID');report.field=id;
 const old=(await api.cli('GET',[endpoint],undefined,'api')).items.find(f=>f.field_id===id);report.before=old;
 const property={...old.property,formatter:'yyyy/MM/dd',type:{data_type:5,ui_type:'DateTime',ui_property:{date_formatter:'yyyy/MM/dd'}}};delete property.formula_expression;
 try{report.response=await api.cli('PUT',[endpoint+'/'+id,'--data',JSON.stringify({field_name:name,type:20,property})],undefined,'api');}catch(e){report.error=e.message;}
 report.after=(await api.cli('GET',[endpoint],undefined,'api')).items.find(f=>f.field_id===id);
 report.expressionPreserved=report.before.property.formula_expression===report.after.property.formula_expression;
}finally{
 if(id){await api.cli('+field-delete',['--table-id',table,'--field-id',id,'--yes']);report.cleaned=!(await api.cli('+field-list',['--table-id',table])).fields.some(f=>f.id===id);}
 await fs.writeFile('reports/migration-closeout-20261019/format-probe.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify({expressionPreserved:report.expressionPreserved,cleaned:report.cleaned,error:report.error}));
