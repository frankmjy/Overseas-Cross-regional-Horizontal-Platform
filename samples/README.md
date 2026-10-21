# 海外运维页面样板

本轮范围：项目总览、海外运维指南、接维开服、协同中枢。现有3333服务与业务页面未修改。EHS、日常运维、项目报告、人员培训、历史档案不开发；马来项目管理暂缓。

## 打开

在项目根目录运行 `node samples/preview.mjs`，访问 http://127.0.0.1:4178/ 。默认只监听本机，关闭该进程即停止预览。当前交付进程已启动。

- 总览：http://127.0.0.1:4178/?page=overview
- 指南：http://127.0.0.1:4178/?page=guide
- 接维：http://127.0.0.1:4178/?page=readiness
- 协同：http://127.0.0.1:4178/?page=hub

## 数据与边界

数据源为CID8b8V7CaCtKesWGFKcHTdqnlc的18张表，当前快照1183条；记录数量包含模板与既有参考资料，不代表现场完成量。页面排除模板中的示例和未命名项。原始执行信息空值保留，接维工作量图表示岗位工作项占比，不表示完成率。源优先级字母PO兼容显示为数字P0，不修改源表。

页面只读，支持检索、分类、两项目切换、清单/岗位矩阵、详情及源表入口，不提供写入功能。快照排除人员ID、联系方式、附件令牌和隐藏迁移字段。链接仅接受https的vnet.feishu.cn。

需要更新快照时，在现有飞书应用配置就绪的根目录运行 `node scripts/export-workspace-samples.mjs`；可传实际目录编码进行定向更新，如 `node scripts/export-workspace-samples.mjs 02.03.01 03.03.01`。不导出未授权的新模块。

## 验证

`node --test tests/workspace-samples.test.mjs`：5项通过。`npm run check`：95个项目JS文件通过；samples/app.mjs单独语法检查通过，model和preview已由测试加载。

浏览器证据：reports/workspace-samples-20261018/browser-verification.json及四页PNG。桌面1423px和窄屏390px下四页无页面横向溢出；接维表格在窄屏可局部横向滚动。检索、无结果、详情、项目目录、岗位钻取、项目切换、验收空态、协同空看板和移动导航已实际检查。

会议/报告边界核对为只读：两项目会议共7条，正式报告0条，字段含义不同；建议独立入口、链接互引。未合表、未迁移或修改会议/报告记录。
