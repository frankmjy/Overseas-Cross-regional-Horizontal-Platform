const text=v=>Array.isArray(v)?text(v[0]):v==null?'':typeof v==='object'?v.text||v.name||'':String(v);
const fail=message=>{throw Object.assign(new Error(message),{status:409});};
export const renameKinds=['question-title','topic-rename','company-rename'];
export function validateRename(service,input,replay,data,limited){
 const snapshot=service.snapshot();
 data.name=limited(input.name,input.kind==='question-title'?1000:60,'新名称',true);
 if(input.kind==='question-title'){
  data.questionId=limited(input.questionId,100,'问题编号',true);data.version=input.version;
  if(!/^[a-f0-9]{64}$/.test(data.version||'')||!replay&&!snapshot?.questions.some(q=>q.id===data.questionId))fail('问题或版本不合法，请刷新后重试。');
 }else{
  data.oldName=limited(input.oldName,60,'原名称',true);
  if(data.name===data.oldName)fail('新名称与原名称相同。');
  if(input.kind==='topic-rename'){
   if(data.name==='全部专题'||!replay&&(!snapshot?.categories.includes(data.oldName)||snapshot.categories.includes(data.name)))fail('专题不存在或新名称已被使用。');
  }else{
   data.company=limited(input.company,50,'调研对象标识',true);
   const company=snapshot?.companies.find(c=>c.name===data.company);
   if(!company||!replay&&(company.displayName||company.name)!==data.oldName)fail('调研对象已修改，请刷新后重试。');
   if(snapshot.companies.some(c=>c.name!==data.company&&[c.name,c.displayName].includes(data.name)))fail('新名称与其他调研对象重复。');
  }
 }
 return data;
}
export async function processRename(service,op,questionVersion){
 const p=op.payload;
 const read=async table=>service.base.list(table);
 if(!op.steps.renamePlan){
  const items=[],add=(table,row,field,before,after)=>items.push({table,id:row.recordId,field,before,after});
  if(p.kind==='question-title'){
   const question=(await read('questions')).find(q=>text(q.问题编号)===p.questionId);
   if(!question||questionVersion(question)!==p.version)fail('问题已被修改，请刷新后重新编辑。');
   const old=text(question.问题列表);add('questions',question,'问题列表',old,p.name);
   for(const row of await read('findings'))if(text(row.明细编号).startsWith(p.questionId+':')&&text(row.明细名称).endsWith('｜'+old))add('findings',row,'明细名称',text(row.明细名称),text(row.明细名称).slice(0,-old.length)+p.name);
  }else if(p.kind==='topic-rename'){
   for(const [table,field]of [['questions','一级分类'],['findings','一级分类'],['topics','专题名称']])for(const row of await read(table))if(text(row[field])===p.oldName)add(table,row,field,p.oldName,p.name);
   if(!items.length)fail('原专题已变化，请刷新后重试。');
  }else{
   for(const table of ['findings','evidence'])for(const row of await read(table))if(text(row.调研对象)===p.company){
    const actual=row.__subjectLabel||text(row.调研对象);if(actual!==p.oldName)fail('调研对象已被修改，请刷新后重试。');
    add(table,row,'调研对象',actual,p.name);
    if(table==='findings'&&text(row.明细名称).startsWith(p.oldName+'｜'))add(table,row,'明细名称',text(row.明细名称),p.name+text(row.明细名称).slice(p.oldName.length));
   }
   if(!items.length)fail('正式表中没有该调研对象的明细，无法保存名称。');
  }
  op.steps.renamePlan={items};service.persist();
 }
 const byTable=new Map();
 for(const [i,item]of op.steps.renamePlan.items.entries()){
  if(!byTable.has(item.table))byTable.set(item.table,await read(item.table));
  let row=byTable.get(item.table).find(r=>r.recordId===item.id);if(!row)fail('关联记录已被移除，名称修改已暂停。');
  const actual=item.field==='调研对象'?row.__subjectLabel||text(row[item.field]):text(row[item.field]);
  if(actual!==item.before&&actual!==item.after)fail('名称已被其他人修改，已停止覆盖。');
  if(actual!==item.after){
   await service.base.update(item.table,item.id,{[item.field]:item.after},{literalSubject:true});
   row=(await read(item.table)).find(r=>r.recordId===item.id);
   const value=item.field==='调研对象'?row?.__subjectLabel||text(row?.[item.field]):text(row?.[item.field]);
   if(value!==item.after)fail('名称修改回读不一致，请在同步任务中重试。');
   byTable.delete(item.table);
  }
  op.steps['rename:'+i]={status:'success',recordId:item.id};service.persist();
 }
 op.result={name:p.name,questionId:p.questionId,updated:op.steps.renamePlan.items.length};
}
