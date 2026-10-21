import {createHash} from 'node:crypto';
export const projectNames=['Thailand Project（泰国项目）','Malaysia Project（马来项目）'];
const text=name=>({name,type:'text'}),user=(name,multiple=false)=>({name,type:'user',multiple});
const choice=(name,values,multiple=false)=>({name,type:'select',multiple,options:values.map(name=>({name}))});
const date=name=>({name,type:'datetime',style:{format:'yyyy/MM/dd'}});
const num=name=>({name,type:'number',style:{type:'plain',precision:2}});
const url=name=>({...text(name),style:{type:'url'}});
const clean=value=>typeof value==='string'?value.trim():Array.isArray(value)?value.join('、'):value==null?'':String(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const sourceUrl=(t,r)=>`https://vnet.feishu.cn/wiki/MHltw8vqNi2N9IkWpvqcFOfinOf?table=${t.id}${r?'&record='+r.id:''}`;
export const customerText=value=>typeof value==='string'?value.split(/(https?:\/\/[^\s<>]+)/g).map(part=>/^https?:\/\//.test(part)?part:part.replace(/字节跳动|字节|抖音|byte\s*dance/gi,'客户')).join(''):value;
export function buildBusinessPlan(source){
  const table=name=>{const t=source.tables.find(t=>t.name===name);if(!t)throw Error('missing source '+name);return t};
  const copy=(t,cn,en)=>{const sf=t.fields.find(f=>f.name===cn);if(!sf)throw Error(`missing source field ${cn}`);return {...Object.fromEntries(['type','style','options','multiple'].filter(k=>sf[k]!==undefined).map(k=>[k,structuredClone(sf[k])])),name:en}};
  const project=()=>choice('Project（项目）',projectNames);
  const progress=()=>choice('Site Progress（现场工作进度）',['未开始','进行中','已完成-待审核','不涉及-待审核','延期']);
  const review=()=>choice('Work Review（工作结果审核）',['待审核','审核通过-关闭','审核不通过-驳回']);
  const common=()=>[user('Owner（负责人）'),date('Planned Date（计划完成时间）'),date('Completed Date（实际完成时间）'),progress(),review(),{name:'Evidence（记录附件）',type:'attachment'},text('Result（工作结果）')];
  const notes=()=>[url('Reference（参考来源）'),{name:'Example（示例）',type:'checkbox',description:'示例仅说明填写方式，不代表项目实际执行或完成；正式记录请取消勾选。'},text('Notes（备注）'),text('Setup Key（初始化标识）')];
  const init=table('【安次】初始化工作'),training=table('【巴音】接维帮扶D6'),interfaces=table('交付界面'),routine=table('例行工作'),inspection=table('飞检问题'),sla=table('SLA标准'),monthly=table('月报交流'),tests=table('测试项目'),personnel=table('测试人员');
  const sample=(key,title,values,ref)=>({'Title（标题）':'[Example／示例] '+title,'Project（项目）':projectNames[0],'Example（示例）':true,'Reference（参考来源）':ref,'Notes（备注）':'填写示例，非海外项目实际执行记录。人员、实际日期和实际结果尚未产生，留空；具体方法与要求采用前按项目文件确认。','Setup Key（初始化标识）':'overseas-example:'+key,...values});
  const group=(key,name,parent,fields,values,ref)=>({key,name,parent,role:'business',fields:[text('Title（标题）'),project(),...fields,...notes()],rows:[sample(key,name.match(/（(.+)）/)[1],values,ref)]});
  const plans=[
    group('live-initialization','Initialization Work（初始化工作）','readiness',[
      text('Work Item（工作内容）'),copy(init,'分类','Category（分类）'),copy(init,'实施方法','Method（实施方法）'),copy(init,'工作目标','Target（工作目标）'),copy(init,'频次','Frequency（频次）'),copy(init,'执行岗位','Executing Role（执行岗位）'),copy(init,'检查岗位','Checking Role（检查岗位）'),copy(init,'优先级','Priority（优先级）'),...common()],
      {'Work Item（工作内容）':init.rows[0].cells.工作内容,'Method（实施方法）':init.rows[0].cells.实施方法,'Target（工作目标）':init.rows[0].cells.工作目标,'Category（分类）':'检查类','Frequency（频次）':'初次','Site Progress（现场工作进度）':'未开始'},sourceUrl(init,init.rows[0])),
    group('live-interfaces','Handover Interfaces（交付界面）','readiness',[
      copy(interfaces,'内容','Content（内容）'),copy(interfaces,'专业','Discipline（专业）'),copy(interfaces,'涉及部门','Departments（涉及部门）'),text('Agreed Boundary（项目确认界面）'),...common()],
      {'Content（内容）':interfaces.rows[0].cells.内容,'Site Progress（现场工作进度）':'未开始'},sourceUrl(interfaces,interfaces.rows[0])),
    group('live-tests','Acceptance Tests（测试验收）','readiness',[
      text('Building（楼栋）'),text('Customer（客户）'),copy(tests,'项目类型','Project Type（项目类型）'),date('Start Date（开始日期）'),date('End Date（结束日期）'),user('Test PM（测试PM）'),user('Test Lead（测试组长）'),user('Test Team（测试人员）',true),user('Operations PM（运维PM）'),text('Scope（测试范围）'),text('Acceptance Criteria（验收要求）'),...common()],
      {'Scope（测试范围）':'示例：填写本项目需验收的系统、楼栋及测试范围','Site Progress（现场工作进度）':'未开始'},sourceUrl(tests)),
    group('live-routine','Routine Work（例行工作）','operations',[
      text('Work Item（工作内容）'),copy(routine,'分类','Category（分类）'),copy(routine,'工作分类','Work Category（工作分类）'),copy(routine,'周期','Frequency（周期）'),copy(routine,'要求','Requirement（要求）'),text('Method（执行方法）'),...common()],
      {'Work Item（工作内容）':routine.rows[0].cells.工作,'Category（分类）':routine.rows[0].cells.分类,'Requirement（要求）':routine.rows[0].cells.要求,'Site Progress（现场工作进度）':'未开始'},sourceUrl(routine,routine.rows[0])),
    group('live-issues','Issues & Actions（问题整改）','operations',[
      copy(inspection,'问题内容','Issue（问题内容）'),copy(inspection,'专业','Discipline（专业）'),copy(inspection,'位置','Location（位置）'),copy(inspection,'问题影响','Impact（问题影响）'),copy(inspection,'问题级别','Severity（问题级别）'),date('Found Date（发现日期）'),text('Action（整改措施）'),...common()],
      {'Issue（问题内容）':inspection.rows[0].cells.问题内容,'Impact（问题影响）':inspection.rows[0].cells.问题影响,'Site Progress（现场工作进度）':'未开始'},sourceUrl(inspection,inspection.rows[0])),
    group('live-sla','SLA Reviews（服务核查）','operations',[
      copy(sla,'分类','Category（分类）'),copy(sla,'子分类','Subcategory（子分类）'),copy(sla,'内容','Reference Clause（参考条款）'),text('Agreed Target（项目约定指标）'),text('Check Method（核查方法）'),text('Actual Value（实际结果）'),...common()],
      {'Category（分类）':sla.rows[0].cells.分类,'Subcategory（子分类）':sla.rows[0].cells.子分类,'Reference Clause（参考条款）':sla.rows[0].cells.内容,'Site Progress（现场工作进度）':'未开始','Notes（备注）':'示例：参照源表梳理核查项，项目约定指标需按海外项目合同确认；不直接采用原基地阈值。'},sourceUrl(sla,sla.rows[0])),
    group('live-reports','Project Reports（项目报告）','meetings',[
      choice('Report Type（报告类型）',['Weekly（周报）','Monthly（月报）']),text('Period（报告周期）'),text('Service Issues（服务问题）'),text('Agreed Actions（商定方案）'),copy(monthly,'维护达标率','Maintenance Rate（维护达标率）'),copy(monthly,'演练达标率','Drill Rate（演练达标率）'),copy(monthly,'北向数据准确率','Data Accuracy（北向数据准确率）'),copy(monthly,'2-5-10达标率','Response Rate（2-5-10达标率）'),...common()],
      {'Report Type（报告类型）':'Monthly（月报）','Period（报告周期）':'示例：YYYY-MM','Service Issues（服务问题）':'示例：记录当期服务问题及关联整改项；没有实际结果的指标留空。','Site Progress（现场工作进度）':'未开始'},sourceUrl(monthly)),
    group('live-training','Training Records（培训记录）','people',[
      text('Training Category（培训分类）'),copy(training,'培训内容','Training Content（培训内容）'),copy(training,'分类','Category（分类）'),copy(training,'时间节点','Milestone（时间节点）'),copy(training,'培训导师','Trainer Role（培训导师岗位）'),copy(training,'培训对象','Trainee Group（培训对象）'),copy(training,'工作目标','Target（工作目标）'),user('Trainer（培训人）'),user('Trainees（参训人员）',true),...common()],
      {'Training Category（培训分类）':training.rows[0].cells.培训分类,'Training Content（培训内容）':training.rows[0].cells.培训内容,'Target（工作目标）':training.rows[0].cells.工作目标,'Milestone（时间节点）':'开服前','Site Progress（现场工作进度）':'未开始'},sourceUrl(training,training.rows[0])),
    group('live-personnel','Project Personnel（项目人员）','people',[
      copy(personnel,'人员','Person（人员）'),copy(personnel,'可担任岗位','Eligible Roles（可担任岗位）'),copy(personnel,'专业','Discipline（专业）'),text('Personnel Type（人员类型）'),text('Department（部门）'),text('Company（所属公司）'),copy(personnel,'职级','Grade（职级）'),text('Qualifications（资质证书）'),date('Planned Arrival（计划到岗）'),date('Actual Arrival（实际到岗）'),text('Evaluation（评价）')],
      {'Eligible Roles（可担任岗位）':personnel.fields.find(f=>f.name==='可担任岗位').multiple?['暖通工程师']:'暖通工程师','Discipline（专业）':'暖通','Notes（备注）':'岗位填写示例，未指定人员或确认派驻。人员字段需选择真实飞书账号；实际到岗日期留空。'},sourceUrl(personnel)),
  ];
  const primaryNames={
    'live-initialization':['Work Item（工作内容）','初始化检查'],
    'live-interfaces':['Content（内容）','交付界面确认'],
    'live-tests':['Test Project（测试项目）','项目系统测试验收'],
    'live-routine':['Work Item（工作内容）','例行工作'],
    'live-issues':['Issue（问题内容）','问题整改'],
    'live-sla':['Review Item（核查事项）','网络连通性条款核查'],
    'live-reports':['Report Title（报告标题）','项目月度服务回顾'],
    'live-training':['Training Content（培训内容）','开服前培训'],
    'live-personnel':['Assignment（岗位安排）','暖通工程师岗位'],
  };
  for(const p of plans){const [name,fallback]=primaryNames[p.key],primary=p.fields.find(f=>f.name===name)||text(name);p.fields=[primary,...p.fields.filter(f=>f.name!==name&&f.name!=='Title（标题）')];for(const row of p.rows){row[name]='[Example／示例] '+(row[name]||fallback);delete row['Title（标题）'];}}
  return plans;
}

export const lessonTypes=['Service Lessons（服务经验）','Inspection Reminders（飞检提醒）','Initialization Checks（初始化要点）','Handover Training（培训交底）','Handover Interfaces（交付界面）','Monthly Reviews（月报复盘）','Routine Work（例行工作）'];
export function buildWorkTemplates(source){
  const plans=buildBusinessPlan(source),get=key=>plans.find(p=>p.key===key);
  const ehs={key:'live-ehs',name:'EHS Work（EHS工作清单）',parent:'operations',role:'business',fields:[text('Work Item（工作内容）'),choice('Project（项目）',projectNames),choice('Category（分类）',['Occupational Health（职业卫生）','Workplace Safety（安全生产）','Environmental Protection（环境保护）','Fire Safety（消防安全）']),text('Subcategory（子分类）'),text('Frequency（频次）'),text('Requirement（要求）'),user('Owner（负责人）'),date('Planned Date（计划完成时间）'),date('Completed Date（实际完成时间）'),text('Site Progress（现场工作进度）'),text('Work Review（工作结果审核）'),text('Result（工作结果）'),url('Reference（参考来源）'),{name:'Example（示例）',type:'checkbox'},text('Notes（备注）'),text('Setup Key（初始化标识）')],rows:[]};
  const selected=['live-initialization','live-training','live-routine','live-interfaces','live-sla'].map(key=>({...get(key),rows:[]}));selected.push(ehs);
  const maps=new Map(selected.map(p=>[p.key,new Map()]));
  const add=(key,t,r,values)=>{if(!Object.values(values).some(v=>clean(v)))return;const p=selected.find(p=>p.key===key),row=Object.fromEntries(Object.entries(values).filter(([n,v])=>p.fields.some(f=>f.name===n)&&v!=null));if(!row[p.fields[0].name])return;const stable=hash(JSON.stringify(row)),map=maps.get(key),ref=sourceUrl(t,r);if(!map.has(stable))map.set(stable,{...row,'Example（示例）':false,'Reference（参考来源）':ref,'Setup Key（初始化标识）':'work-template:'+key+':'+stable,refs:[],guidance:[]});const item=map.get(stable);item.refs.push(ref);for(const n of ['指导文件','相关材料','相关材料（链接）','执行模板','执行摸板']){const v=r.cells[n];if(Array.isArray(v)){for(const f of v)if(f?.name)item.guidance.push(f.name);}else if(typeof v==='string'&&v.trim())item.guidance.push(v.trim());}};
  const ehsTypes={'职业卫生目录':['Occupational Health（职业卫生）','太仓基地职业卫生管理篇'],'安全生产目录':['Workplace Safety（安全生产）','安全生产管理内容'],'环境保护目录':['Environmental Protection（环境保护）','太仓基地环境保护管理篇'],'消防安全目录':['Fire Safety（消防安全）','太仓基地消防安全管理篇']};
  for(const t of source.tables)for(const r of t.rows){const c=r.cells;
    if(t.name.includes('初始化'))add('live-initialization',t,r,{'Work Item（工作内容）':c.工作内容,'Category（分类）':c.分类,'Method（实施方法）':c.实施方法,'Target（工作目标）':c.工作目标,'Frequency（频次）':c.频次,'Executing Role（执行岗位）':c.执行岗位,'Checking Role（检查岗位）':c.检查岗位,'Priority（优先级）':c.优先级});
    else if(t.name.includes('接维帮扶'))add('live-training',t,r,{'Training Content（培训内容）':c.培训内容,'Training Category（培训分类）':c.培训分类,'Category（分类）':c.分类,'Milestone（时间节点）':c.时间节点,'Trainer Role（培训导师岗位）':c.培训导师,'Trainee Group（培训对象）':c.培训对象||c.帮扶对象,'Target（工作目标）':c.工作目标});
    else if(t.name==='例行工作')add('live-routine',t,r,{'Work Item（工作内容）':c.工作,'Category（分类）':c.分类,'Work Category（工作分类）':c.工作分类,'Frequency（周期）':c.周期,'Requirement（要求）':c.要求});
    else if(t.name==='交付界面')add('live-interfaces',t,r,{'Content（内容）':c.内容,'Discipline（专业）':c.专业,'Departments（涉及部门）':c.涉及部门});
    else if(t.name==='SLA标准')add('live-sla',t,r,{'Review Item（核查事项）':c.子分类||c.分类,'Category（分类）':c.分类,'Subcategory（子分类）':c.子分类,'Reference Clause（参考条款）':c.内容});
    else if(ehsTypes[t.name]){const [category,field]=ehsTypes[t.name];add('live-ehs',t,r,{'Work Item（工作内容）':c[field],'Category（分类）':category,'Subcategory（子分类）':clean(c.分类),'Frequency（频次）':c.执行频次});}
  }
  for(const p of selected)p.rows=[...maps.get(p.key).values()].map(({refs,guidance,...r})=>({...r,'Notes（备注）':'通用准备清单，执行情况留空；项目、负责人、日期、进度、审核和结果由现场确认后填写。原客户条款、设备条件及EHS属地要求采用前确认。\n'+(guidance.length?'指导资料（保留源链接查阅）：'+[...new Set(guidance)].join('；')+'\n':'')+'来源记录：\n'+refs.join('\n')}));
  for(const p of selected)for(const row of p.rows)for(const [n,v] of Object.entries(row))if(typeof v==='string'&&!n.startsWith('Setup Key'))row[n]=customerText(v);
  return selected;
}
export function curateLessons(source){
  const result=new Map();let candidates=0;
  const add=(table,row,type,title,body,checks,scene)=>{
    title=clean(title);body=clean(body);if(!body)return;candidates++;
    const key=hash(JSON.stringify([type,title,body,clean(checks)]));
    let entry=result.get(key);
    if(!entry){entry={'Title（经验主题）':title||body.split(/[\n；。]/)[0].slice(0,80),'Lesson Type（经验类别）':type,'Discipline（专业）':clean(row.cells.专业)||'综合','Scenario（适用场景）':clean(scene),'Key Points（经验要点）':body,'Checkpoints（现场核查要点）':clean(checks)||null,'Source Context（原始场景）':table.name,'Source Records（来源记录）':[],'Setup Key（初始化标识）':'lesson:'+key};result.set(key,entry)}
    entry['Source Records（来源记录）'].push(sourceUrl(table,row));
  };
  for(const t of source.tables)for(const r of t.rows){const c=r.cells;
    if(t.name==='服务经验')add(t,r,lessonTypes[0],c.关键词,c.服务经验内容,null,c.服务分类);
    else if(t.name==='飞检问题')add(t,r,lessonTypes[1],c.问题内容,[c.问题内容,c.问题影响].filter(Boolean).join('\n\n'),'核查是否存在源记录所列问题：'+clean(c.问题内容),c.专业);
    else if(/初始化/.test(t.name))add(t,r,lessonTypes[2],c.工作内容,[c.实施方法,c.工作目标].filter(Boolean).join('\n\n'),c.工作目标,c.分类);
    else if(t.name.includes('接维帮扶'))add(t,r,lessonTypes[3],c.培训内容,[c.培训内容,c.工作目标].filter(Boolean).join('\n\n'),c.工作目标,c.时间节点);
    else if(t.name==='交付界面')add(t,r,lessonTypes[4],clean(c.内容).split(/[\n；。]/)[0].slice(0,80),c.内容,null,c.涉及部门);
    else if(t.name==='月报交流')add(t,r,lessonTypes[5],clean(c.会议商定方案||c.当月服务问题).split(/[\n；。]/)[0].slice(0,80),[c.当月服务问题,c.会议商定方案].filter(Boolean).join('\n\n'),c.会议商定方案,'月度服务回顾');
    else if(t.name==='例行工作')add(t,r,lessonTypes[6],c.工作,c.要求,c.要求,c.分类);
  }
  const rows=Array.from(result.values()).map(r=>({...Object.fromEntries(Object.entries(r).map(([n,v])=>[n,n==='Setup Key（初始化标识）'?v:customerText(v)])),'Source Records（来源记录）':r['Source Records（来源记录）'].join('\n')}));
  const disciplines=[...new Set(rows.map(r=>r['Discipline（专业）']))];
  return {key:'operations-lessons',name:'Operations Lessons（运维经验沉淀）',parent:'experience',role:'shared',fields:[text('Title（经验主题）'),choice('Lesson Type（经验类别）',lessonTypes),choice('Discipline（专业）',disciplines),text('Scenario（适用场景）'),text('Key Points（经验要点）'),text('Checkpoints（现场核查要点）'),text('Source Context（原始场景）'),{...text('Source Records（来源记录）'),description:'源项目资料的归纳与引用，不代表海外项目已发生事件或已执行结果；采用原客户专属约定前需按本项目合同确认。'},text('Setup Key（初始化标识）')],rows,candidates};
}
