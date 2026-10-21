# 海外业务协作平台

项目管理、调研工作台、知识共享。Node.js 原生服务，页面数据由飞书多维表同步；凭据使用环境变量或本机应用配置，不进入仓库。

当前用户确认已部署版本见 [生产基线](docs/releases/current.json)。发布与飞书交付约定见 [发布流程](docs/RELEASE_WORKFLOW.md)。

## 本地启动

使用兼容现有项目的 Node.js 运行环境，将 `.env.example` 复制为 `.env` 并在本机填写配置，执行 `npm start`。Windows 环境部署和 HTTPS 配置见 [部署说明](DEPLOY_README.md)、[调研部署说明](RESEARCH_DEPLOY.md) 与 [证书说明](DOMAIN_CERT_README.md)。

`npm run check` 检查 JS 语法；相关测试位于 `tests/`、`release-tools/` 与 `tls-center/test/`。运行时测试需要对应本机夹具和端口，按发布预检要求顺序运行。

仓库保存代码与工具。生产密钥、TLS 证书、运行数据、业务导出、发布 ZIP 和本机验收材料均不包含在内。原部署附带的 BOI 参考工作簿与工作区样本数据需由有权限的部署方另行提供。
