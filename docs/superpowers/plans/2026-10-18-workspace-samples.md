# 横向平台四页样板实施计划

**Goal:** 项目总览、海外运维指南、接维开服、协同中枢四页只读交互样板。

**Architecture:** 独立samples目录，按数据映射、导出、展示、静态预览拆分。共用视觉外壳，各业务独立视图。不改现有服务与正式业务数据。当前目录不是Git仓库，不创建提交；按用户限制由当前代理串行实施。

**Tech Stack:** Node原生HTTP、HTML、CSS、原生ES Modules，复用现有BaseAdapter，无新依赖。

## 任务

- [x] 新增samples/model.mjs与tests/workspace-samples.test.mjs，先测允许字段裁剪、空值保留、安全链接、分组统计。
- [x] 新增scripts/export-workspace-samples.mjs，按directory-plan真实ID读取知识、标准、经验、接维、协同与项目台账，导出samples/data.json；记录源表和采集时间。
- [x] 只读比较会议与报告：输出reports/source-references-20261018/meeting-report-boundary.json，列明字段、数量及标题交集，不写业务表。
- [x] 新增samples/index.html、styles.css、app.mjs；共用壳层，四种独立内容布局；检索、页签、项目切换与dialog详情可操作。
- [x] 新增samples/preview.mjs，仅127.0.0.1、明确资源白名单、GET/HEAD；测试拒绝路径穿越及写方法。
- [x] 运行node --test tests/workspace-samples.test.mjs及npm run check；启动独立预览并用真实浏览器验证四页、窄屏、筛选、空态、详情和来源链接，保存截图。

## 完成证据

交付预览地址和样板截图，写明快照时间、只读边界和未接入正式写入；保持当前已运行3333服务及排除模块不变。
