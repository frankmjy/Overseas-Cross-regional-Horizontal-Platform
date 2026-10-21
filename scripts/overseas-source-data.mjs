import {businessTables} from './overseas-base-layout.mjs';
export const projects=['Thailand Project（泰国项目）','Malaysia Project（马来项目）'];
export const attachmentMode='source-links-only';
const dictionary=Object.fromEntries(businessTables.flatMap(t=>t.fields.filter(f=>!f[0].startsWith('@')).map(f=>[f[0],f[1]])));
Object.assign(dictionary,{
  '分类':'Category（分类）','时间':'Date（时间）','年份':'Year（年份）','SourceID':'Original Source ID（原始来源标识）',
  '专业':'Discipline（专业）','机房':'Site（机房）','机房名称':'Site Name（机房名称）','基地名称':'Source Site（来源基地）','适用范围':'Scope（适用范围）',
  '经验提供':'Contributor（经验提供）','经验反哺':'Feedback To（经验反哺）','楼栋编号':'Building Code（楼栋编号）',
  '客户季度分数（旧）':'Legacy Quarterly Score（原客户季度分数）','扣分原因（旧）':'Legacy Deduction Reasons（原扣分原因）',
  '区域负责人':'Regional Lead（区域负责人）','是否重复':'Duplicate Check（是否重复）',
  '乌兰':'Source Site B（来源基地B）','怀来':'Source Site C（来源基地C）','安次':'Source Site D（来源基地D）',
  '太仓R楼':'Source Building R（来源楼栋R）','关键数据（太仓F、G、H、J、K楼）':'Source Key Data（来源关键数据）','筛选辅助':'Filter Helper（筛选辅助）',
  '分享满意度':'Sharing Satisfaction（分享满意度）','分享完成情况':'Sharing Progress（分享完成情况）','经验分类':'Experience Category（经验分类）',
  '分享计划结束时间':'Sharing Planned End（分享计划结束时间）','经验来源':'Experience Source（经验来源）','经验分享年份':'Sharing Year（经验分享年份）',
  '经验提交人':'Submitted By（经验提交人）','经验分享排期':'Sharing Schedule（经验分享排期）','经验评定等级':'Experience Rating（经验评定等级）',
  '分享计划开始时间':'Sharing Planned Start（分享计划开始时间）','视频资料及分享PPT':'Video and Slides（视频资料及分享PPT）',
  '经验分享主题':'Sharing Topic（经验分享主题）','经验审核人':'Reviewed By（经验审核人）','数据中心':'Data Center（数据中心）',
  '资料附件':'Supporting Files（资料附件）','文件链接':'File Link（文件链接）','设备类别':'Equipment Category（设备类别）',
  '项目类型':'Project Type（项目类型）','区域':'Region（区域）','成本金额':'Cost（成本金额）','状态':'Status（状态）',
  '合同金额（万元）':'Contract Amount（合同金额：万元）','运营':'Operations（运营）','楼栋':'Building（楼栋）',
  '状态 (1)':'Secondary Status（补充状态）','结束日期':'End Date（结束日期）','增项金额':'Variation Amount（增项金额）',
  '假负载':'Load Bank（假负载）','IT产出':'IT Capacity（IT产出）','测试人员':'Test Team（测试人员）',
  '商务/销售':'Sales（商务及销售）','运维PM':'Operations PM（运维PM）','客户':'Customer（客户）','采购':'Procurement（采购）',
  '开始日期':'Start Date（开始日期）','测试PM':'Test PM（测试PM）','测试组长':'Test Team Lead（测试组长）','人数':'Headcount（人数）',
  '可担任岗位':'Eligible Roles（可担任岗位）','人员类型':'Personnel Type（人员类型）','部门':'Department（部门）','职级':'Grade（职级）',
  '公司编码':'Company Code（公司编码）','人员':'Person（人员）','评价':'Evaluation（评价）',
  '培训附件':'Training Attachments（培训附件）','结束时间':'End Time（结束时间）','帮扶对象':'Support Recipients（帮扶对象）',
  '现场工作审核':'Site Review（现场工作审核）','责任人':'Responsible Role（责任人）','正确选项':'Correct Answer（正确选项）',
  '题目':'Question（题目）','选项A':'Option A（选项A）','选项B':'Option B（选项B）','选项C':'Option C（选项C）',
  '选项D':'Option D（选项D）','选项E':'Option E（选项E）','题型':'Question Type（题型）','不同的答案':'Alternative Answer（不同的答案）',
  '字段 1':'Original Field 1（源字段1）','字段 2':'Original Field 2（源字段2）','执行摸板':'Templates（执行模板）',
  '相关材料':'Materials（相关材料）','相关材料（链接）':'Material Link（相关材料链接）','记录':'Records（记录）',
});

const standalone=[
  ['lessons','服务经验','Source Service Lessons（服务经验全量）','knowledge'],
  ['national','全国经验','Source Shared Experience（经验分享全量）','knowledge'],
  ['sla','SLA标准','Source Service Standards（服务标准全量）','operations'],
  ['routine','例行工作','Source Routine Work（例行工作全量）','operations'],
  ['handover','交付界面','Source Handover Interfaces（交付界面全量）','handover'],
  ['inspection','飞检问题','Source Inspection Issues（飞检问题全量）','reviews'],
  ['monthly','月报交流','Source Monthly Reviews（月报交流全量）','reviews'],
  ['oh','职业卫生目录','Source Occupational Health（职业卫生全量）','hse'],
  ['safety','安全生产目录','Source Workplace Safety（安全生产全量）','hse'],
  ['environment','环境保护目录','Source Environmental Protection（环境保护全量）','hse'],
  ['fire','消防安全目录','Source Fire Safety（消防安全全量）','hse'],
  ['exams','认证题库','Source Certification Questions（认证题库全量）','testing'],
  ['test-projects','测试项目','Source Test Projects（测试项目全量）','testing'],
  ['test-personnel','测试人员','Source Test Personnel（测试人员全量）','testing'],
];
const selectName=(sf)=>sf.name==='记录'&&sf.type==='text'?'Record Link（记录链接）':sf.name==='相关材料'&&sf.type==='text'?'Material Link（相关材料链接）':dictionary[sf.name];
export const sourceKey=(table,row)=>`${table.id}:${row.id}`;
export const recordUrl=(table,row)=>`https://vnet.feishu.cn/wiki/MHltw8vqNi2N9IkWpvqcFOfinOf?table=${table.id}&record=${row.id}`;

export function buildFullSourcePlan(source){
  const groups=standalone.map(([key,cn,name,group])=>({key,name,group,sources:source.tables.filter(t=>t.name===cn)}));
  groups.splice(4,0,{key:'training',name:'Source Handover Training（接维帮扶全量）',group:'handover',sources:source.tables.filter(t=>t.name.includes('接维帮扶'))},{key:'initialization',name:'Source Initialization Work（初始化工作全量）',group:'handover',sources:source.tables.filter(t=>/初始化/.test(t.name))});
  for(const g of groups){
    if(!g.sources.length)throw Error(`missing source ${g.name}`);
    const fields=[],byName=new Map(),mappings=[];
    for(const t of g.sources){for(const sf of t.fields){
      const name=selectName(sf);if(!name)throw Error(`missing translation ${sf.name}`);
      let definition=Object.fromEntries(['type','style','multiple','options'].filter(k=>sf[k]!==undefined).map(k=>[k,structuredClone(sf[k])]));
      if(['lookup','formula'].includes(sf.type))definition={type:'text',description:`原字段：${sf.name}；原类型：${sf.type}。完整保留源表显示结果，依赖外部表的计算和引用不冒充新表实时结果。${sf.expression?'源公式：'+sf.expression:''}`};
      if(sf.type==='group_chat')definition={type:'text',description:'原群组历史快照。当前应用无法关联原群，显示源群名；稳定群组ID完整保存在隐藏的源身份标识字段中，不建立虚假群关联。'};
      if(definition.type==='attachment')delete definition.style;
      if(name!==dictionary[sf.name]||/来源基地|来源关键数据|来源楼栋/.test(name))definition.description=`源字段名：${sf.name}。源项目历史资料，非海外项目执行结果。`;
      let existing=byName.get(name);
      if(existing){
        if(existing.type!==definition.type)throw Error(`incompatible union ${g.name} ${name}`);
        if(existing.type==='select'){existing.multiple ||= definition.multiple;for(const option of definition.options)if(!existing.options.some(o=>o.name===option.name))existing.options.push(option)}
      }else{existing={...definition,name};fields.push(existing);byName.set(name,existing)}
      mappings.push({table:t.id,sourceName:sf.name,sourceType:sf.type,targetName:name});
    }}
    const first=g.sources[0],primary=first.fields.find(f=>f.id===first.table.primary_field),primaryName=selectName(primary);
    fields.sort((a,b)=>a.name===primaryName?-1:b.name===primaryName?1:0);
    fields.push({name:'Applicable Project（适用项目）',type:'select',multiple:true,options:projects.map(name=>({name})),description:'筛选适用项目，不改变本条源项目历史记录的来源和完成状态。'},
      {name:'Source Table（来源表）',type:'text'},{name:'Source Record（原记录链接）',type:'text',style:{type:'url'}},
      {name:'Source Files（源附件清单）',type:'text',description:'按用户确认，全部附件暂时保留源链接。列出附件名称、大小和原记录入口，附件文件未复制。'},
      {name:'Source Record Key（源记录标识）',type:'text'});
    if(mappings.some(m=>m.sourceType==='group_chat'))fields.push({name:'Source Identities（源身份标识）',type:'text',description:'完整保留源群组对象中的稳定ID和名称，作为历史迁移凭证。'});
    g.fields=fields;g.mappings=mappings;
    const visible=first.presentation?.visible?.visible_fields||first.fields.map(f=>f.name);
    g.visible=[primaryName,...visible.map(cn=>mappings.find(m=>m.table===first.id&&m.sourceName===cn)?.targetName).filter(Boolean),...fields.map(f=>f.name)].filter((n,i,all)=>all.indexOf(n)===i&&!['Source Record Key（源记录标识）','Original Source ID（原始来源标识）'].includes(n));
  }
  if(new Set(groups.flatMap(g=>g.sources.map(t=>t.id))).size!==source.tables.length)throw Error('not every source table is covered');
  return groups;
}

export function cellValue(value,def){
  if(value===null||value===undefined)return null;
  if(def.type==='attachment')return null;
  if(['user','group_chat'].includes(def.type))return value.map(v=>({id:v.id}));
  if(def.type==='select')return def.multiple?(Array.isArray(value)?value:[value]):Array.isArray(value)?value[0]??null:value;
  if(def.type==='datetime'){
    const d=new Date(value);if(Number.isNaN(d.valueOf()))throw Error('unparseable source date');
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d);
  }
  if(def.type==='text'&&typeof value!=='string')return typeof value==='number'?String(value):Array.isArray(value)&&value.every(v=>v?.id&&v?.name)?value.map(v=>v.name).join('、'):JSON.stringify(value);
  return value;
}

export function fullSourceRows(group){
  return group.sources.flatMap(t=>t.rows.map(r=>{
    const row={};for(const m of group.mappings.filter(m=>m.table===t.id))row[m.targetName]=cellValue(r.cells[m.sourceName],group.fields.find(f=>f.name===m.targetName));
    row['Source Table（来源表）']=t.name;row['Source Record（原记录链接）']=recordUrl(t,r);row['Source Record Key（源记录标识）']=sourceKey(t,r);
    if(group.mappings.some(m=>m.sourceType==='group_chat'))row['Source Identities（源身份标识）']=JSON.stringify(Object.fromEntries(t.fields.filter(f=>f.type==='group_chat').map(f=>[f.name,r.cells[f.name]??null])));
    row['Source Files（源附件清单）']=t.fields.filter(f=>f.type==='attachment'&&r.cells[f.name]?.length).flatMap(f=>r.cells[f.name].map(a=>`${f.name}：${a.name}（${(a.size/1024/1024).toFixed(2)}MB）${a.size>200*1024*1024?'；超过200MB，保留原链接':''}\n${recordUrl(t,r)}`)).join('\n\n')||null;
    return row;
  }));
}
