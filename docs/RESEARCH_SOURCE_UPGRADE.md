# 调研工作台统一数据源

2026-10-30 老马指定 [海外项目调研](https://vnet.feishu.cn/base/Xy0LbBykIaSLuys527RcVXEinMh) 作为工作台正式读写源；应用保持“定盘星” `cli_aa547c8de6785ce2`。

## 配置与边界

- 正式项目键为 `overseas`，四表与稳定字段 ID 在 `research/config.json`。前端项目定义为 `research/web/project-scope.mjs`，测试校验两者一致。
- 初始源包含 62 个通用问题、78 条明细、31 条证据、38 条专题目录记录，其中 8 条一级专题进入导航。所有问题只呈现一次；没有国家字段时不推断泰国/马来归属。
- 旧 `projects/thailand`、`projects/malaysia` 账本保留原目录和原字节。启动前如发现旧来源尚有未完成任务，拒绝切换，必须在原工作台处理；禁止清空或改写旧绑定。
- 当前源直接读取证据的附件字段，优先按关联问题/所属明细归属；不进行文件名镜像匹配。
- 新 Base 已补齐四表“迁移键”和问题表“已删除”技术字段。业务列、原始记录 ID、现有内容不重建；技术字段缺失或类型不兼容必须明确报错。

## 页面与口径

- 总览是默认视图，`?view=list` 打开清单；旧 `?view=overview` 入口仍打开总览。原侧栏、搜索、对象选择、专题进度、任务状态、团队原始对比图保留。
- 清单与总览使用同一 `filteredQuestions()` 结果，透视下钻保留其余筛选条件。
- 问题覆盖：至少一个选中对象已有材料的问题数；对象覆盖：已有材料的“问题×选中对象”单元数。无分母的比例显示 `—`。
- 人员图按稳定问题 ID `overseas:2.1.1` 读取当前正文，显示园区、楼栋和 COCC，岗位支持多选。未区分的人员不推测为本地或外派；未完整解析或合计不一致时显示具体状态。
- 人员正文仍是事实来源；原始对比图仅保留为已有参考图。正文发生变更后重新打开人员图即可按最新已同步正文生成。

## 验证与预览

```powershell
node --test tests/research*.test.mjs tests/topic-progress.test.mjs tests/diagram-canvas.test.mjs
node scripts/check.mjs
```

隔离预览脚本 `scripts/preview-research-upgrade.mjs` 需要 `RESEARCH_PREVIEW_SOURCE` 指向只保存在本机的四表快照 JSON（每表含 `rows`）。默认监听 `127.0.0.1:59102`；记录创建/修改/上传只发生在预览内存，已有附件下载通过原源只读执行。预览使用独立临时账本；退出会清理本次临时目录，不与运行服务共享账本。

本次迭代不自动发布、不登记生产基线、不推送源码。后续发布仍执行 `docs/RELEASE_WORKFLOW.md`；发布前必须核验服务器旧来源队列已收口。
