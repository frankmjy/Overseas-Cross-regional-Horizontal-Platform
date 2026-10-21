export const projectNames = ['Thailand Project（泰国项目）', 'Malaysia Project（马来项目）'];
const projectCodes = ['TH', 'MY'];
const text = name => ({ name, type: 'text' });
const select = (name, values, multiple = false) => ({ name, type: 'select', multiple, options: values.map(name => ({ name })) });
const attachment = name => ({ name, type: 'attachment' });
const person = name => ({ name, type: 'user', multiple: false });
const date = name => ({ name, type: 'datetime', style: { format: 'yyyy-MM-dd' } });
const review = 'Pending Review（待复核）';
const basis = 'Adapted Template（适配模板）';
const sourceUrl = (table, record) => `https://vnet.feishu.cn/wiki/MHltw8vqNi2N9IkWpvqcFOfinOf?table=${table}&record=${record}`;
export function sanitize(value) {
  return String(Array.isArray(value) ? value.join('、') : value || '').replace(/(?:乌兰|怀来|太仓|巴音|安次)(?:基地)?/g, '项目现场').replace(/(?:字节|抖音)?(?:Dora|DORA)/g, '客户服务门户').replace(/字节|抖音/g, '客户').replace(/智航平台/g, '运维协作平台').replace(/北京时间/g, '项目当地时间').replace(/D\d+(?:栋|楼)?/g, '对应设施').trim();
}
const unique = (rows, get) => [...new Map(rows.filter(r => get(r)).map(r => [sanitize(get(r)), r])).values()];
const normalFields = [select('Project（项目归属）', projectNames), { name: 'Related Project（关联项目）', type: 'link', link_table: '@projects' }, text('Category（分类）'), select('Review Status（复核状态）', [review, 'Approved（已批准）', 'Not Applicable（不适用）']), select('Content Basis（内容性质）', [basis, 'Project Record（项目记录）']), person('Owner（负责人）'), date('Due Date（截止日期）'), text('Evidence Required（举证要求）'), attachment('Attachments（附件）'), text('Source Reference（参考来源）'), text('Adaptation Notes（适配说明）'), text('Import Key（导入键）')];
const caution = '工作底稿，尚未确认项目现状、执行人或计划日期。依据属地批准文件、现场设备和客户约定复核后使用；不代表工作已开展或完成。';

export function buildPlan(source) {
  const tables = [];
  const find = name => source.tables.find(t => t.name === name);
  const rows = name => source.records[find(name)?.id] || [];
  function add(key, name, group, extraFields, records) {
    tables.push({ key, name, group, fields: [text('Title（标题）'), ...extraFields, ...normalFields], rows: records });
  }
  function projectRows(module, sourceName, input, mapper) {
    const table = find(sourceName);
    return input.flatMap((r, index) => projectNames.map((project, p) => ({
      'Project（项目归属）': project, 'Category（分类）': sanitize(r.分类 || r.工作分类 || r.培训分类 || r.专业 || 'General（综合）'),
      'Review Status（复核状态）': review, 'Content Basis（内容性质）': basis,
      'Source Reference（参考来源）': table ? sourceUrl(table.id, r.recordId) : '',
      'Adaptation Notes（适配说明）': caution,
      'Import Key（导入键）': `overseas-reference-v1:${module}:${projectCodes[p]}:${r.recordId || index}`,
      ...mapper(r, project, p),
    })));
  }
  tables.push({ key: 'projects', name: 'Project Register（项目台账）', group: '03 Operations Readiness（运维准备）', fields: [text('Project Name（项目名称）'), text('Project Code（项目代码）'), select('Country（国家）', ['Thailand（泰国）', 'Malaysia（马来西亚）']), text('Coordination Topics（协作重点）'), person('Project Lead（项目负责人）'), select('Confirmation Status（确认状态）', ['To Confirm（待确认）', 'Confirmed（已确认）']), text('Notes（说明）'), text('Import Key（导入键）')], rows: projectNames.map((p, i) => ({ 'Project Name（项目名称）': p, 'Project Code（项目代码）': projectCodes[i], 'Country（国家）': i ? 'Malaysia（马来西亚）' : 'Thailand（泰国）', 'Coordination Topics（协作重点）': '团队筹建、接维准备、开服检查、客户服务、属地合规与知识沉淀。', 'Confirmation Status（确认状态）': 'To Confirm（待确认）', 'Notes（说明）': '项目分类来自用户确认；阶段、人员、场地和合同信息由项目团队补充。', 'Import Key（导入键）': `overseas-reference-v1:project:${projectCodes[i]}` })) });

  const routine = unique(rows('例行工作'), r => r.工作);
  add('routine', 'Routine Work（例行工作）', '04 Service Management（服务管理）', [text('Suggested Cadence（建议周期）'), text('Work Instructions（工作要求）'), text('Deliverable（交付物）')], projectRows('routine', '例行工作', routine, r => ({ 'Title（标题）': sanitize(r.工作), 'Suggested Cadence（建议周期）': /交接班/.test(r.工作) ? 'Per Shift（每班，待批准）' : /巡检|运行通报|告警/.test(r.工作) ? 'Per Local Plan（按属地计划）' : /年度/.test(r.工作) ? 'Annual Review（年度复核，待批准）' : /水质/.test(r.工作) ? 'Per Equipment Plan（按设备维护计划）' : 'Monthly Review（月度复核，待批准）', 'Work Instructions（工作要求）': `围绕“${sanitize(r.工作)}”确认数据来源、统计口径、审批路径和客户提交渠道。原平台名称、提交日期及周期不直接沿用，由项目团队批准后填写。`, 'Deliverable（交付物）': '对应工单、记录或报告，以及复核意见。', 'Evidence Required（举证要求）': '执行记录、来源数据、复核人和提交回执。' })));

  const training = unique(rows('【巴音】接维帮扶D6'), r => r.培训内容);
  add('training', 'Handover Training（接维培训）', '03 Operations Readiness（运维准备）', [text('Learning Objective（培训目标）'), text('Training Stage（培训阶段）'), text('Assessment Method（评估方法）')], projectRows('training', '【巴音】接维帮扶D6', training, r => ({ 'Title（标题）': sanitize(r.培训内容), 'Learning Objective（培训目标）': `掌握“${sanitize(r.培训内容)}”的属地适用流程、职责边界、文件位置与异常升级方式。设备操作须经授权并使用已批准规程。`, 'Training Stage（培训阶段）': 'Before Independent Duty（独立值班前，待确认）', 'Assessment Method（评估方法）': '由项目批准培训材料、讲师和考核方式；记录培训与评估证据，未评估前不填合格。', 'Evidence Required（举证要求）': '批准版教材、签到、考核记录和授权记录。' })));

  const launch = unique(rows('【巴音】开服初始化D6').filter(r => !/冷却塔电加热及电伴热|电池室空调电加热/.test(r.工作内容 || '')), r => `${r.工作内容}|${(r.执行岗位 || []).join(',')}`);
  add('launch', 'Service Readiness（开服准备）', '03 Operations Readiness（运维准备）', [text('Verification Focus（核查重点）'), text('Acceptance Basis（验收依据）'), text('Suggested Role（建议责任岗位）')], projectRows('launch', '【巴音】开服初始化D6', launch, r => ({ 'Title（标题）': sanitize(r.工作内容), 'Verification Focus（核查重点）': `确认“${sanitize(r.工作内容)}”是否适用于本项目；依据批准图纸、厂家要求和现场规程编制检查步骤，记录差异与闭环证据。`, 'Acceptance Basis（验收依据）': '待确认：属地批准的设计、厂家文件、调试方案、运行规程及客户合同。源表的阀位、保护状态、操作步骤、水质限值和抽样比例不直接移植。', 'Suggested Role（建议责任岗位）': sanitize(r.执行岗位), 'Evidence Required（举证要求）': '批准版检查方案、设备清单、核查记录、问题闭环和签认。' })));

  add('handover', 'Handover Interfaces（交付界面）', '03 Operations Readiness（运维准备）', [text('Interface Review（界面核对）'), text('Suggested Function（建议协作职能）')], projectRows('handover', '交付界面', unique(rows('交付界面'), r => r.内容), r => ({ 'Title（标题）': sanitize(r.内容).slice(0, 65), 'Interface Review（界面核对）': `参考事项：${sanitize(r.内容)}\n本项目需另行确认供货、安装、调试、维护与移交责任，数量和设备配置以批准资料为准。`, 'Suggested Function（建议协作职能）': sanitize(r.涉及部门), 'Evidence Required（举证要求）': '经确认的界面矩阵、移交清单、问题单与双方签认。' })));

  add('inspection', 'Inspection Checklist（巡检核查）', '04 Service Management（服务管理）', [text('Inspection Prompt（检查提示）'), text('Observed Condition（现场情况）'), text('Remediation Plan（整改方案）')], projectRows('inspection', '飞检问题', unique(rows('飞检问题'), r => r.问题内容), r => ({ 'Title（标题）': `核查：${sanitize(r.问题内容).slice(0, 90)}`, 'Inspection Prompt（检查提示）': `源表经验对应的检查主题：${sanitize(r.问题内容)}。请检查本项目是否存在相关情况并记录事实；本条不是海外项目已发现的缺陷。`, 'Evidence Required（举证要求）': '现场照片、设备编号、实际观察与复核结论；确认问题后再填写整改计划。' })));

  const sla = unique(rows('SLA标准').filter(r => r.子分类), r => r.子分类);
  add('sla', 'SLA Review（服务标准核对）', '04 Service Management（服务管理）', [text('Metric Definition（指标口径）'), text('Agreed Target（约定指标）'), text('Measurement Method（计量方法）'), text('Contract Reference（合同依据）')], projectRows('sla', 'SLA标准', sla, r => ({ 'Title（标题）': sanitize(r.子分类).replace(/^\s*[\d.]+\s*/, ''), 'Category（分类）': sanitize(r.分类).replace(/^[一二三四五六七八九十、\s]+/, ''), 'Metric Definition（指标口径）': '确认服务范围、测量边界、统计窗口、例外情形、事件定义与争议处理。', 'Measurement Method（计量方法）': '待依据本项目已签合同和客户认可数据源确认。不得沿用参考合同的数值、赔付比例或响应时限。', 'Evidence Required（举证要求）': '合同条款、批准指标、监测数据和客户确认记录。' })));

  const lessons = unique(rows('服务经验'), r => `${r.关键词}|${sanitize(r.服务经验内容)}`);
  const lessonTable = find('服务经验');
  const lessonRows = lessons.map(r => ({ 'Title（标题）': sanitize(r.关键词 || r.服务分类 || '服务经验'), 'Project（项目归属）': projectNames, 'Category（分类）': sanitize(r.服务分类), 'Reference Lesson（参考经验）': sanitize(r.服务经验内容), 'Adaptation Action（适配动作）': '由两个项目分别核对适用性、责任边界和批准依据，再形成属地文件；参考来源的承诺、配置、时限与分工不自动成为本项目要求。', 'Review Status（复核状态）': review, 'Content Basis（内容性质）': basis, 'Evidence Required（举证要求）': '适配评审、批准文件和项目实践反馈。', 'Source Reference（参考来源）': sourceUrl(lessonTable.id, r.recordId), 'Adaptation Notes（适配说明）': '历史参考经验，不代表泰国或马来项目已发生的事件或已实施措施。', 'Import Key（导入键）': `overseas-reference-v1:lesson:shared:${r.recordId}` }));
  add('lessons', 'Service Lessons（服务经验）', '02 Knowledge Library（知识资料库）', [text('Reference Lesson（参考经验）'), text('Adaptation Action（适配动作）')], lessonRows);
  tables.find(t => t.key === 'lessons').fields = tables.find(t => t.key === 'lessons').fields.map(f => f.name === 'Project（项目归属）' ? select(f.name, projectNames, true) : f);

  for (const [key, name, sourceName, titleField] of [
    ['oh', 'Occupational Health（职业健康）', '职业卫生目录', '太仓基地职业卫生管理篇'],
    ['safety', 'Workplace Safety（作业安全）', '安全生产目录', '安全生产管理内容'],
    ['environment', 'Environmental Management（环境管理）', '环境保护目录', '太仓基地环境保护管理篇'],
    ['fire', 'Fire Safety（消防安全）', '消防安全目录', '太仓基地消防安全管理篇'],
  ]) {
    const records = key === 'safety' ? unique(rows(sourceName), r => sanitize(r.分类)) : unique(rows(sourceName).filter(r => !/目录|封面/.test(r[titleField] || '')), r => r[titleField]);
    add(key, name, '05 HSE Management（安全健康环境）', [text('Review Topic（复核事项）'), text('Local Requirement（属地要求）'), text('Applicable Authority（适用主管机构）'), text('Required Evidence（所需记录）')], projectRows(key, sourceName, records, r => ({ 'Title（标题）': sanitize(key === 'safety' ? r.分类 : r[titleField]), 'Review Topic（复核事项）': `建立“${sanitize(key === 'safety' ? r.分类 : r[titleField])}”的项目适用性核对和资料目录。`, 'Required Evidence（所需记录）': '经属地专业人员确认的适用依据、批准文件、检查或培训记录及责任分工。', 'Evidence Required（举证要求）': '由属地合规及专业团队确认是否适用；不得将参考目录当作当地法定义务清单。', 'Adaptation Notes（适配说明）': '仅借鉴管理主题。法规名称、主管机构、申报周期、证照要求和检测限值留空，须按项目所在地核实后填写。' })));
  }
  add('monthly', 'Monthly Service Review（月度服务回顾）', '04 Service Management（服务管理）', [text('Reporting Period（报告周期）'), text('Service Summary（服务概况）'), text('KPI Review（指标回顾）'), text('Risks and Actions（风险与行动）'), text('Next Period Plan（下期计划）')], projectRows('monthly', '月报交流', [{ recordId: 'monthly-template' }], () => ({ 'Title（标题）': 'Monthly Review Template（月度回顾模板）', 'Service Summary（服务概况）': '待填：项目阶段、运维覆盖范围、维护与演练情况、客户反馈及服务事件。', 'KPI Review（指标回顾）': '待填：经批准的指标、实际值、计算口径、数据来源及差异说明；未提供真实数据前不填分数或达标率。', 'Risks and Actions（风险与行动）': '待填：风险、决议、责任人、截止日期及闭环证据。', 'Next Period Plan（下期计划）': '待填：下期重点、依赖与需决策事项。', 'Evidence Required（举证要求）': '源数据、维护及演练记录、会议决议、客户确认材料。', 'Source Reference（参考来源）': 'https://vnet.feishu.cn/wiki/MHltw8vqNi2N9IkWpvqcFOfinOf?table=tblAz1a1wyDuClit' })));
  return { sourceUrl: 'https://vnet.feishu.cn/wiki/MHltw8vqNi2N9IkWpvqcFOfinOf', targetBase: 'CID8b8V7CaCtKesWGFKcHTdqnlc', tables };
}
