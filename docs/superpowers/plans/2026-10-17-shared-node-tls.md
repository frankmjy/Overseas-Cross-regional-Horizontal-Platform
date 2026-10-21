# Windows Node.js 统一 TLS 实施计划

目标：为 sm.sjhl.online 和 www.sm.sjhl.online 的 Node.js Web 服务保留原端口，使用统一证书，支持不重启应用更新证书。

范围：新增 `tls-center/`，不修改其他项目代码、部署事务、数据库或现有启动脚本。服务器首次安装后重启一次，使全局 NODE_OPTIONS 被服务管理器及新进程继承。此后新 Node.js Web 监听自动纳管。非 Web TCP 服务不转换。主动清除 NODE_OPTIONS 的程序不在覆盖保证内。

文件：`certificate.cjs` 负责可信链/域名/时间/密钥校验和版本存储；`preload.cjs` 负责原生 TLS 热更新及公网 HTTP 的 TLS 传输；`manage.cjs` 提供导入、状态和自动监听；`Install.ps1`、`Install.bat` 负责 Windows 配置、权限与恢复记录；独立测试验证传输行为与失败保留。

验收顺序：

- [ ] 使用隔离证书夹具建立失败用例：多端口、HTTP/HTTPS/HTTP2、安全连接属性、WebSocket、已建立连接。
- [ ] 实现证书验证与不可变版本目录，原子提交 current.json；错误候选不得改变活动版本。
- [ ] 实现统一 TLS 上下文和重载；新握手采用新证书，旧连接继续。
- [ ] 实现安装/卸载的环境变量保留、私钥 ACL、导入及更新入口；不得输出密钥。
- [ ] 验证入口语法、源文件完整性、正常/异常证书、失效输入、重启后读取、已存在 NODE_OPTIONS 保留。
- [ ] 完成隔离运行验证并记录未进行的服务器系统安装项目。只有实际证据支持时才声明部署状态；不声称已配置远程服务器。

实现期间只在子进程设置 NODE_OPTIONS，禁止修改本机全局 Node.js 环境。证书和测试私钥不放入源码交付目录。
