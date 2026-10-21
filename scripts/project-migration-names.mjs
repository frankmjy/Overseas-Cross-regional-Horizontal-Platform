const pairs=`Project Risk|项目风险情况
In Progress|进行中
Task Count|项目任务总数
Auto Number|自动编号
Initial Margin|初始毛利率
Project Name|项目名称
Cost Plan|项目成本交底
Target Profit|目标毛利
Weekly Summary|周报总结
Weekly Work|本周工作细项
Key Issues|重点问题
Adjusted Target Margin|目标毛利率（调整后）
Project Stage|项目阶段
Weekly Tasks|本周执行关联任务
Total Receipts|回款总计
Margin Adjustment|毛利调整
Overdue In Progress|逾期进行中
Latest Historical Margin|历史最新毛利
Not Started|未开始
Cost Utilization|成本支出占比
Project Status|项目进度
Project Manager|项目经理
Due Date|截止日期
Nonlabor Cost Plan|项目成本交底（除人工）
Sequence|序号
AI Profit Risk|AI 利润风险提示
Start Date|开始日期
Cover|封面
Contract Revenue|合同收入金额
Actual Profit|实际毛利
Completed|已完成
Milestone Progress|里程碑进度
Actual Spend|实际支出
Status Code|进展选项编号
Progress|进展
Submitted Date|提交的日期
Issue Category|问题归类
Attachments|附件
Resolution Status|解决状态
Record Number|自增编码
Resolved Time|解决问题的时间
Discovered Time|发现问题的时间
Issue Description|问题简述
Issue Code|问题编码
Issue Summary|问题概述
Submitted By|提交人
Severity|等级
Combined Value|合并
Weekly Flag|本周打标
Updated By|更新人
Task Code|任务编号
Deliverable and Feedback|交付物/最新反馈
Updated Time|更新时间
Progress Details|进展说明
Calendar Title|日历标题
Task Description|任务详情
This Week Tasks|本周任务
Construction Stage|现场建设项目阶段
Yesterday Review|昨日回顾
Today Tasks|今日任务
Start Time|开始时间
Gantt End|甘特结束时间
Deliverable Requirements|交付物&备注
Priority|优先级
Actual Workdays|实际天数
Progress History|进展历史记录
Milestone|里程碑
Due Time|截止时间
Owner|责任人
Participants|参与人
Actual Completion|实际完成时间
Parent Link 1|父记录 (1)
Tomorrow Tasks|明日任务
Progress Statistics|进展统计
Last Week Review|上周回顾
Gantt Title|甘特标题
Next Week Tasks|下周任务
Process Group Link|所属项目
Workdays|天数
Update Progress|更新进展
Latest Feedback|最新进展反馈
Team Setup Phase|团队组建小阶段
Parent Link|父记录
Site Document Confirmation|现场资料确认（商务、产品）
Increment Number|自增编号
Settlement Code|结算编号
Return Reason|退回原因
Weekly Progress|本周进展
Collection Readiness|回款准备进度
Customer Acceptance Date|客户验收完成日期
Acceptance Documents|验收资料
Owner Progress Update|进展更新（负责人）
Receivable Amount|应收金额
Receivable Item|应收款项
Documents Ready Date|资料准备完成日期
Responsible Person|负责人
Related Documents|关联资料
Receipt Description|收款描述
Customer Acceptance|客户验收
Update History|更新进展记录
Collection Document Readiness|回款所需资料准备
Commercial Owner|商务
Required Document Contents|所需资料内容（商务/产品） 副本
Organization Code|架构编码
Project Role|项目角色
Project Position|项目岗位
Reporting Line|项目汇报对象
Personnel|人员
Payment Category|支付类目
Payment Description|付款简述
Cost Tracking Code|成本跟踪编码
Resource User|使用人员
Expense Date|费用产生日期
Payment Amount|支付金额
Total Tasks|任务总数
Executor|执行人
Completion Rate|完成率
Staffing Compliance|人员配置履约情况
Required Position|需求岗位
Required Headcount|需配置人数
Onboard Headcount|到岗人数
Headcount Gap|人员缺口
Matched Personnel|项目人员匹配
Staffing Code|配置编码
Position Requirements|岗位要求
Holiday Date|节假日期
Holiday Name|节假日名称
Holiday Type|节假日类型
Country or Region|国家/地区
Year|年份
Expense Type|支出类型
Spent Amount|已支出
Payment Link|M3-08 项目支付跟踪
Expense Item|费用项目
Spend Ratio|支出占比
Cost|成本
Unit|单位
Unit Cost|成本单价
Quantity|数量
Category|类目
Description|描述
Penalty Result|处罚情况
Clause Code|条款编号
Process Group Owner|过程组负责人
Task Details|任务明细
Process Completion|过程组完成度
Overdue Tasks|逾期进行中任务
Project Code|项目编号
Not Started Tasks|未开始任务
Phase Target|阶段目标
Completed Tasks|已完成任务
Project Progress|项目进展
In Progress Tasks|进行中任务
Process Group Name|过程组名称
Process Group Key|过程组标识
Settlement Key|结算编码
Contract Feedback|合同履约最新反馈
Phone Number|手机号码
Project Party|项目方
Name|姓名
Flag|打标
Document Code|项目资料编号
Related Task|关联任务
Document Summary|资料简述
Date|日期
Document Category|资料类别
Document Link|资料文档
Project Process Group|项目过程组`;
export const fieldEnglish=Object.fromEntries(pairs.split('\n').map(s=>{const [en,cn]=s.split('|');return[cn,en];}));
const metricWords={'运维稳定运营':'Steady Operations','转维前置阶段':'Pre Operations','核心管理与技术骨干招聘':'Core Team Recruitment','团队筹建准备':'Team Preparation','测试验证阶段':'Testing','/':'Other','已完成':'Completed','完成率':'Completion Rate','总数':'Total','今日完成':'Completed Today','下周开始':'Starting Next Week','今日开始':'Starting Today','昨日完成':'Completed Yesterday','本周完成':'Completed This Week','下周截止':'Due Next Week','本周开始':'Starting This Week','明日截止':'Due Tomorrow','明日开始':'Starting Tomorrow','本周截止':'Due This Week','上周完成':'Completed Last Week','今日截止':'Due Today','预计工时（天）':'Planned Workdays'};
export function fieldName(cn){let en=fieldEnglish[cn];if(!en&&cn.startsWith('展示'))en='Summary '+(cn.match(/\d+/)?.[0]||'')+' '+(cn.includes('分割线')?'Divider':cn.includes('回款')?'Receipts':cn.includes('进度')?'Progress':'Display')+(cn.includes('副本')?' Copy':'');if(!en){en=cn.split('-').map(p=>metricWords[p]||p).join(' - ');if(/[\u4e00-\u9fff]/.test(en))throw Error('Unmapped field: '+cn);}return `${en.trim()}（${cn}）`;}
export const tableDefs=[
 ['tbl0SzzX4mNuDIQV','Project Overview','项目概览','root'],
 ['tblTsFNO4D88lcc4','Process Groups','过程组管理','readiness'],
 ['tbl6ZRGOwUGLIIWY','Task Execution','任务执行底表','readiness'],
 ['tblM94LoT0x4rJBV','Task Statistics','任务执行统计','readiness'],
 ['tblY1bLqk8E7xzZP','Stakeholders','项目干系人','people'],
 ['tbl5ocKDxpRn1T4d','Project Issues','项目问题管理','operations'],
 ['tblYPOOSNaNd16dh','Project Documents','项目资料追踪','readiness'],
 ['tblme8fLy3FrmZ0s','Staffing Plan','人员配置履约','people'],
 ['tblT8FomJ6U6b3gU','Contract Terms','合同履约条款','commercial'],
 ['tblCeib8GCQNGvyZ','Receivables','结算回款','commercial'],
 ['tblt7Nmo3HxkHwGz','Cost Plan','成本交底','commercial'],
 ['tblGQd3xjS1MKLCs','Payment Tracking','支付跟踪','commercial'],
 ['tblczZBgYW8I2ony','Organization','人员组织架构','people'],
 ['tbl4DHmwongd7pAP','Progress Options','进展选项配置','settings'],
 ['tblO0wDllVX6icZN','Holiday Calendar','法定节假日配置','settings'],
 ['tbl6TZlBVydwWgQ7','Task Feedback History','任务进展留痕','settings'],
 ['tblUeqpk6NBt9cdz','Collection Feedback History','回款反馈留痕','settings']
].map(([id,en,cn,module])=>({id,en,cn,module}));
