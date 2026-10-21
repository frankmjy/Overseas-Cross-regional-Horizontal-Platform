# DC 运维可视化项目管理部署说明

20261019.1从已安装的20261017.1升级，覆盖调研工作台`/`、项目管理`/project-management`（兼容`/index.html`）、知识共享`/knowledge-sharing`及配套服务。调研按泰国、马来正式表分别读写；新增通用问题默认写入马来正式表。使用正式包外层`InstallProject.bat`安装，保留服务器配置与数据，只重启3333，失败恢复旧服务。已有统一证书中心无需重复首次部署步骤。调研配置见[RESEARCH_DEPLOY.md](RESEARCH_DEPLOY.md)。

## 包内内容

- `server.mjs`：HTTPS 静态服务和飞书多维表同步接口。
- `base-sync.mjs`：飞书多维表读取与项目计划数据归一化逻辑。
- `index.html`、`src/`、`assets/`：前端页面文件。
- `start-3333.bat`：Windows 一键启动脚本。
- `stop-3333.bat`：Windows 一键停止脚本。
- `configure-env.bat`：在服务器本地生成 `.env`。
- `authorize-feishu.bat`：飞书应用身份配置和多维表访问验证脚本。
- `setup-domain-https.bat`：域名可信 HTTPS 一键配置脚本。
- `configure-domain-cert.bat`：已有证书路径写入脚本。
- `DOMAIN_CERT_README.md`：域名证书配置说明。
- `.env.example`：环境变量模板，不包含真实密钥。
- `scripts/`：Node、飞书 CLI、证书配置和启动辅助脚本。
- `vendor/lark-cli/`：内置飞书 CLI，避免服务器无法访问 npm 时启动失败。

## 首次部署顺序

在服务器 CMD 中进入项目目录：

```bat
cd /d D:\your\deploy\folder
```

生成服务器本地 `.env`：

```bat
configure-env.bat
```

验证飞书应用身份能访问多维表：

```bat
authorize-feishu.bat
```

配置域名可信 HTTPS：

```bat
setup-domain-https.bat
```

如果已有证书包，把 `sm.sjhl.online_root.zip` 放到项目目录或当前用户 Downloads 后再运行该脚本。脚本会自动导入证书包并写入 `.env`。

启动服务：

```bat
start-3333.bat
```

访问地址：

```text
https://www.sm.sjhl.online:3333/
```

## 域名证书要求

`setup-domain-https.bat` 默认配置域名：

```text
www.sm.sjhl.online
```

执行前必须确认：

- 域名 A 记录已经指向当前服务器公网 IP。
- 云厂商安全组已开放 TCP `3333`。
- 如果已有证书包，不需要 TCP `80` 参与证书签发。
- 如果没有证书包并需要在线申请证书，证书申请期间 TCP `80` 可被公网访问。
- 在线申请证书时，服务器可以访问 GitHub 和 Let’s Encrypt。

如果域名解析没有指向当前服务器，脚本会停止，避免申请失败后继续写入错误配置。

如需覆盖邮箱、端口或跳过 DNS 自检：

```bat
set ACME_EMAIL=admin@sjhl.online
set PORT=3333
set SKIP_DNS_CHECK=1
setup-domain-https.bat
```

如需指定证书包路径：

```bat
set CERT_ZIP_PATH=D:\certs\sm.sjhl.online_root.zip
setup-domain-https.bat
```

## 飞书权限要求

应用身份访问多维表需要同时满足：

1. 飞书开放平台中，该应用已开通 Base / 多维表相关读取权限。
2. 该应用已发布或在当前企业内可用。
3. 目标多维表允许该应用访问。

如果 `authorize-feishu.bat` 验证失败，优先检查应用权限、应用发布状态和多维表授权对象。

## 日常启动和停止

启动：

```bat
start-3333.bat
```

停止：

```bat
stop-3333.bat
```

默认监听：

```text
PORT=3333
SERVER_HOST=0.0.0.0
```

## 依赖检查逻辑

启动脚本会按顺序寻找 Node：

1. `NODE_EXE` 指定的 `node.exe`。
2. 系统 PATH 中的 `node.exe`。
3. 本项目 `.runtime\node\node.exe`。
4. `C:\ai\*\.runtime\node\node.exe`。
5. 找不到时，在线下载 Node 到本项目 `.runtime\node`。

飞书 CLI 检查顺序：

1. 包内 `vendor\lark-cli\bin\lark-cli.exe`。
2. 本项目 `.runtime\lark-cli`。
3. 都没有时，用当前 Node 的 npm 在线安装 `@larksuite/cli` 到 `.runtime\lark-cli`。

在线下载需要服务器能访问：

```text
https://nodejs.org
https://registry.npmjs.org
https://github.com
https://letsencrypt.org
```

## 飞书多维表同步

页面打开和点击刷新会调用：

```text
/api/base-sync
```

服务端通过飞书 CLI 使用应用身份读取目标多维表：

```text
base-token: CID8b8V7CaCtKesWGFKcHTdqnlc
table-id: tblSpSvqS2FMpHks
view-id: vewkRPw0CG
identity: bot
```

## 安全说明

- 部署包不包含真实 `.env`。
- 不要把 App Secret、访问 token、授权缓存或证书私钥打进二次分发包。
- 真实 `.env` 只应存在于服务器本地。
- 如果迁移到新服务器，需要在新服务器本地重新生成 `.env` 并重新配置证书。
