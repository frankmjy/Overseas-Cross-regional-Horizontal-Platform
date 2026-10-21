// Source field names are explicit so changes remain reviewable and keep existing IDs.
export const businessTables = [
  { key: 'lessons', id: 'tblKOomzlF7hh8Pp', source: '服务经验', title: 'Service Lessons（服务经验）', fields: [
    ['关键词','Keyword（关键词）','Title（标题）'], ['服务分类','Service Category（服务分类）','Category（分类）'],
    ['服务经验内容','Service Experience（服务经验内容）','Reference Lesson（参考经验）'], ['时间','Date（时间）'],
    ['执行部门','Executing Department（执行部门）'], ['优化部门','Improvement Department（优化部门）'],
    ['经验反哺','Feedback To（经验反馈对象）'], ['经验提供','Contributing Project（经验提供项目）'],
  ], group: [] },
  { key: 'launch', id: 'tbl2Wm0t8Iw6BhYx', source: '【巴音】开服初始化D6', title: 'Initialization Work（初始化工作）', fields: [
    ['工作内容','Work Content（工作内容）','Title（标题）'], ['分类','Category（分类）','Category（分类）'],
    ['实施方法','Implementation Method（实施方法）','Verification Focus（核查重点）'], ['工作目标','Work Objective（工作目标）','Acceptance Basis（验收依据）'],
    ['频次','Frequency（频次）'], ['检查岗位','Checking Role（检查岗位）'], ['执行岗位','Executing Role（执行岗位）','Suggested Role（建议责任岗位）'],
    ['优先级','Priority（优先级）'], ['指导文件','Guidance Documents（指导文件）'], ['完成时间','Completion Date（完成时间）','Due Date（截止日期）'],
    ['现场工作进度','Site Progress（现场工作进度）'], ['记录','Records（记录）','Attachments（附件）'], ['工作结果审核','Result Review（工作结果审核）'],
    ['通知群组','Notification Group（通知群组）'], ['楼栋编号','Building（楼栋编号）'], ['负责人','Owner（负责人）','Owner（负责人）'],
  ], group: ['频次','分类'] },
  { key: 'training', id: 'tblNOVjxZAEy2w6C', source: '【巴音】接维帮扶D6', title: 'Handover Training（接维培训）', fields: [
    ['培训内容','Training Content（培训内容）','Title（标题）'], ['培训分类','Training Category（培训分类）','Training Stage（培训阶段）'],
    ['培训导师','Training Mentor（培训导师）'], ['培训对象','Trainees（培训对象）'], ['工作目标','Work Objective（工作目标）','Learning Objective（培训目标）'],
    ['相关材料','Training Materials（相关材料）'], ['相关材料（链接）','Material Link（材料链接）'], ['时间节点','Milestone（时间节点）'], ['分类','Category（分类）','Category（分类）'],
    ['完成时间','Completion Date（完成时间）','Due Date（截止日期）'], ['现场工作进度','Site Progress（现场工作进度）'], ['记录','Records（记录）','Attachments（附件）'],
    ['工作结果审核','Result Review（工作结果审核）'], ['通知群组','Notification Group（通知群组）'], ['楼栋编号','Building（楼栋编号）'], ['负责人','Owner（负责人）','Owner（负责人）'],
  ], group: ['时间节点','分类'] },
  { key: 'handover', id: 'tblPxSqKlU0PlkwN', source: '交付界面', title: 'Handover Interfaces（交付界面）', fields: [
    ['内容','Content（内容）','Title（标题）'], ['专业','Discipline（专业）','Category（分类）'], ['涉及部门','Departments（涉及部门）','Suggested Function（建议协作职能）'],
  ], group: ['专业'] },
  { key: 'routine', id: 'tbleAJrkVPo1Mjdg', source: '例行工作', title: 'Routine Work（例行工作）', fields: [
    ['工作','Work（工作）','Title（标题）'], ['分类','Category（分类）','Category（分类）'], ['路径','Submission Channel（提交渠道）'], ['工作分类','Work Category（工作分类）'],
    ['要求','Requirements（要求）','Work Instructions（工作要求）'], ['周期','Cycle（周期）','Suggested Cadence（建议周期）'], ['次数','Occurrences（次数）'], ['周期单位','Cycle Unit（周期单位）'],
    ['链接','Link（链接）'], ['当前任务创建日期','Current Task Date（当前任务创建日期）'], ['下一次任务创建时间','Next Task Date（下一次任务创建时间）'], ['通知群组','Notification Group（通知群组）'],
  ], group: ['工作分类'] },
  { key: 'inspection', id: 'tblOJPKc5P6SuMwr', source: '飞检问题', title: 'Inspection Issues（飞检问题）', fields: [
    ['问题内容','Issue Content（问题内容）','Title（标题）'], ['照片','Photos（照片）','Attachments（附件）'], ['位置','Location（位置）'],
    ['专业','Discipline（专业）','Category（分类）'], ['日期','Inspection Date（日期）','Due Date（截止日期）'], ['年份','Year（年份）'],
    ['问题影响','Issue Impact（问题影响）'], ['问题级别','Severity（问题级别）'], ['关键词','Keyword（关键词）'], ['是否完成','Completed（是否完成）'], ['负责人','Owner（负责人）','Owner（负责人）'],
  ], group: ['专业'] },
  { key: 'sla', id: 'tbleoa2MHs3dCfZt', source: 'SLA标准', title: 'Service Standards（服务标准）', fields: [
    ['子分类','Subcategory（子分类）','Title（标题）'], ['分类','Category（分类）','Category（分类）'], ['内容','Content（内容）','Metric Definition（指标口径）'],
    ['@th','Thailand Requirements（泰国项目要求）'], ['@my','Malaysia Requirements（马来项目要求）'],
  ], group: ['分类','子分类'] },
  { key: 'monthly', id: 'tblCBVMwnwhA66Bi', source: '月报交流', title: 'Monthly Service Review（月报交流）', fields: [
    ['@title','Report（月报名称）','Title（标题）'], ['年份','Year（年份）'], ['季度','Quarter（季度）'], ['月份','Month（月份）'],
    ['机房负责人','Site Lead（现场负责人）','Owner（负责人）'], ['客户季度得分','Customer Quarterly Score（客户季度得分）'], ['扣分原因','Deduction Reasons（扣分原因）'],
    ['2-5-10达标率','2-5-10 Compliance（2-5-10达标率）'], ['北向数据准确率','Northbound Data Accuracy（北向数据准确率）'],
    ['维护达标率','Maintenance Compliance（维护达标率）'], ['演练达标率','Drill Compliance（演练达标率）'],
    ['当月服务问题','Monthly Service Issues（当月服务问题）'], ['会议商定方案','Agreed Actions（会议商定方案）'],
  ], group: ['月份'] },
  ...[
    ['oh','tblEqP4FWqNv2u2H','职业卫生目录','Occupational Health（职业卫生）','太仓基地职业卫生管理篇','Occupational Health Content（职业卫生管理内容）'],
    ['safety','tblBMWx7lpxckA9X','安全生产目录','Workplace Safety（安全生产）','安全生产管理内容','Safety Management Content（安全生产管理内容）'],
    ['environment','tblOzkQ3byBXWITY','环境保护目录','Environmental Protection（环境保护）','太仓基地环境保护管理篇','Environmental Content（环境保护管理内容）'],
    ['fire','tbl4i6iwme48brcV','消防安全目录','Fire Safety（消防安全）','太仓基地消防安全管理篇','Fire Safety Content（消防安全管理内容）'],
  ].map(([key,id,source,title,content,english])=>({ key,id,source,title,fields:[
    [content,english,'Title（标题）'], ['编号','Code（编号）'], ['分类','Category（分类）','Category（分类）'], ['执行模板','Templates（执行模板）','Attachments（附件）'],
    ...(key==='safety'?[['执行频次','Execution Frequency（执行频次）']]:[]), ['年度完成进度','Annual Progress（年度完成进度）'], ['年份','Year（年份）'],
    ...(key==='oh'?[['备注','Notes（备注）']]:[]),
  ],group:['分类']})),
];

export const originalLayouts = {
  'Migration Notes（迁移说明）': ['Item（事项）','Description（说明）'],
  'Research Questions（调研问题）': ['Question（问题列表）','Question ID（问题编号）','Primary Category（一级分类）','Priority Flag（重点标记）','Category Pending Confirmation（分类待确认）'],
  'Research Details（调研明细）': ['Detail Title（明细名称）','Research Subject（调研对象）','Primary Category（一级分类）','Related Question（关联问题）','Research Findings（调研内容）','Evidence Status（材料状态）','Evidence Excerpt（举证原文）','Detail ID（明细编号）'],
  'Evidence Library（证据资料）': ['Evidence Title（资料名称）','Research Subject（调研对象）','Evidence Type（资料类型）','Related Detail（所属明细）','Attachments（附件）','Original URL（原始链接）','Migration Status（迁移状态）','Evidence ID（资料编号）','Question ID（问题编号）'],
  'Topic Directory（专题目录）': ['Topic Name（专题名称）','Topic Description（专题说明）'],
  'Project Register（项目台账）': ['Project Name（项目名称）','Project Code（项目代码）','Country（国家）','Project Lead（项目负责人）','Notes（说明）'],
  '01 Knowledge Index（知识索引）': ['Code（编码）','Document Title（文档名称）','Project（项目归属）','Topic（主题分类）','Document Type（文档类型）','Priority（重要程度）','Summary（文档摘要）','Document Link（文档链接）','Attachments（附件）','Shared By（分享人）','Shared At（分享时间）','Notes（备注）'],
};
export const meetingLayout = ['Meeting Title（会议名称）','Meeting Date（会议日期）','Meeting Time（会议时间）','Project（项目归属）','Participants（参与人）','Summary（会议概要）','Action Items（待办事项）','Status（状态）','Priority（优先级）','Minutes Link（纪要链接）','Recording Link（妙记链接）','Attachments（资料文件）'];

export function sourceText(v) {
  return String(Array.isArray(v)?v.join('、'):v??'').replace(/(?:乌兰|怀来|太仓|巴音|安次)(?:基地)?/g,'项目现场').replace(/字节|抖音/g,'客户').replace(/北京时间/g,'项目当地时间');
}

const noCopy = new Set(['完成时间','日期','年份','时间','现场工作进度','工作结果审核','负责人','通知群组','培训导师','经验提供','楼栋编号','是否完成','年度完成进度','机房负责人','扣分原因','客户季度得分','当月服务问题','会议商定方案']);
export function makeDefinition(source, mapping, targetTable) {
  const [cn,name,old] = mapping;
  let sf=source.fields.find(f=>f.name===cn || cn==='执行模板'&&f.name==='执行摸板');
  let def;
  if(cn.startsWith('@')) def={type:'text'};
  else if(!sf) throw Error(`源字段不存在：${source.name} ${cn}`);
  else {
    def=Object.fromEntries(['type','multiple','style','options','expression'].filter(k=>sf[k]!==undefined).map(k=>[k,structuredClone(sf[k])]));
    if(['负责人','机房负责人'].includes(cn)) def={type:'user',multiple:false};
    if(cn==='通知群组') def={type:'group_chat',multiple:true};
    if(cn==='楼栋编号') def={type:'text'};
    if(cn==='经验提供') def={type:'select',multiple:false,options:['Thailand Project（泰国项目）','Malaysia Project（马来项目）'].map(name=>({name}))};
    if(cn==='经验反哺') def.options=sf.options.map(o=>({...o,name:o.name==='To字节'?'Customer（客户）':o.name==='To互联'?'VNET（世纪互联）':o.name}));
    if(cn==='现场工作进度'&&!def.options.some(o=>o.name==='未开始'))def.options.unshift({name:'未开始',hue:'Gray',lightness:'Lighter'});
    if(cn==='优先级')def.options=def.options.map(o=>({...o,name:o.name.replace(/^PO-/,'P0-')}));
    if(cn==='客户季度得分')def={type:'number',style:{type:'plain',precision:2,percentage:false,thousands_separator:false}};
    if(cn==='扣分原因')def={type:'text'};
    if(cn==='下一次任务创建时间') {
      def.expression='IF(ISBLANK([Current Task Date（当前任务创建日期）]),"",'+sf.expression.replaceAll('[周期单位]','[Cycle Unit（周期单位）]').replaceAll('[当前任务创建日期]','[Current Task Date（当前任务创建日期）]')+')';
    }
    if(def.type==='attachment')delete def.style;
    // Text-to-select conversion preserves every existing value, including site additions.
    if(def.type==='select'&&old) {
      const values=targetTable.rows.flatMap(r=>{const v=r.cells[old];return Array.isArray(v)?v:v?[v]:[]});
      for(const v of values)if(!def.options.some(o=>o.name===v))def.options.push({name:v});
    }
  }
  if(['实施方法','工作目标','要求','内容','服务经验内容'].includes(cn))def.description='参考源表工作模板。按本项目批准文件及现场配置确认后执行；本字段不表示工作已完成。';
  if(cn==='客户季度得分')def.description='按本项目客户确认结果填写。源表公式依赖已失效的外部评分表，不移植虚假分数。';
  if(cn==='@th'||cn==='@my')def.description='填写本项目经确认的服务要求和合同条款。';
  return {...def,name};
}

export function sourceValue(sourceRow,cn,definition) {
  if(!sourceRow||noCopy.has(cn)||cn.startsWith('@')||['attachment','user','group_chat','formula'].includes(definition.type))return undefined;
  let value=sourceRow.cells[cn==='执行模板'?'执行摸板':cn];
  if(value===null||value===undefined)return undefined;
  if(definition.type==='select') {
    const list=(Array.isArray(value)?value:[value]).map(v=>cn==='优先级'?v.replace(/^PO-/,'P0-'):cn==='经验反哺'?v==='To字节'?'Customer（客户）':v==='To互联'?'VNET（世纪互联）':v:v);
    return definition.multiple?list:list[0];
  }
  return definition.type==='text'?sourceText(value):value;
}
