# 域名 HTTPS 证书配置

目标域名：

```text
www.sm.sjhl.online
```

## 一键配置

在服务器项目目录中，以管理员身份运行：

```bat
setup-domain-https.bat
```

脚本会自动完成：

- 优先查找并导入已有证书包。
- 找不到证书包时，才检查当前域名解析并在线申请新证书。
- 开放 Windows 防火墙 TCP `80` 和应用端口，默认 `3333`。
- 必要时下载 win-acme 到 `.runtime\win-acme`。
- 将证书路径写入服务器本地 `.env`。
- 重启 `3333` 服务。

默认值：

```text
PUBLIC_DOMAIN=www.sm.sjhl.online
PORT=3333
证书目录=C:\certs\www.sm.sjhl.online
```

## 使用已有证书包

如果已有证书包，把压缩包放到以下任一位置：

```text
项目目录\sm.sjhl.online_root.zip
项目目录\certs\sm.sjhl.online_root.zip
当前用户 Downloads\sm.sjhl.online_root.zip
```

然后直接运行：

```bat
setup-domain-https.bat
```

脚本会从证书包中自动识别：

```text
www.sm.sjhl.online_bundle.pem
www.sm.sjhl.online.key
```

并复制到：

```text
C:\certs\www.sm.sjhl.online\www.sm.sjhl.online-chain.pem
C:\certs\www.sm.sjhl.online\www.sm.sjhl.online-key.pem
```

如果证书包在其他路径，可以先指定：

```bat
set CERT_ZIP_PATH=D:\certs\sm.sjhl.online_root.zip
setup-domain-https.bat
```

如需覆盖默认值，可以先在 CMD 中设置：

```bat
set PUBLIC_DOMAIN=www.sm.sjhl.online
set ACME_EMAIL=admin@sjhl.online
set PORT=3333
setup-domain-https.bat
```

如果服务器位于代理后面，且确认公网流量会转到当前机器，可以跳过 DNS 自检：

```bat
set SKIP_DNS_CHECK=1
setup-domain-https.bat
```

## 前置条件

- 域名 A 记录必须指向服务器公网 IP。
- 云厂商安全组已开放 TCP `3333`。
- 如果使用已有证书包，不需要公网 TCP `80` 参与证书签发。
- 如果没有证书包并需要在线申请新证书，证书申请期间需要开放 TCP `80`。
- 在线申请新证书时，服务器需要访问 GitHub 和 Let’s Encrypt。

检查 DNS：

```bat
nslookup www.sm.sjhl.online 8.8.8.8
nslookup www.sm.sjhl.online 1.1.1.1
```

如果解析结果不是服务器公网 IP，先修改域名 DNS。否则 Let’s Encrypt 无法给该域名签发可信证书。

## 手动证书路径配置

如果证书已经存在，可以只写入证书路径：

```bat
configure-domain-cert.bat
```

该脚本默认使用：

```text
C:\certs\www.sm.sjhl.online\www.sm.sjhl.online-chain.pem
C:\certs\www.sm.sjhl.online\www.sm.sjhl.online-key.pem
```

也可以直接修改服务器本地 `.env`：

```text
PUBLIC_DOMAIN=www.sm.sjhl.online
SERVER_HOST=0.0.0.0
PORT=3333
HTTPS_CERT_PATH=C:\certs\www.sm.sjhl.online\www.sm.sjhl.online-chain.pem
HTTPS_KEY_PATH=C:\certs\www.sm.sjhl.online\www.sm.sjhl.online-key.pem
```

## 验证

```bat
curl -I https://www.sm.sjhl.online:3333/
```

正常结果应返回 `HTTP/1.1 200 OK`，浏览器不再提示自签名或不受信任根证书。

## 续期

win-acme 会创建证书续期任务。证书续期后，重启服务即可重新读取新证书：

```bat
stop-3333.bat
start-3333.bat
```
