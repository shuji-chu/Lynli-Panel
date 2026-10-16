# Lynli Panel

> 轻量的 VPN/代理管理面板。Python + SQLite 后端，纯 HTML/JS 前端，支持 Clash / V2Ray / sing-box 多格式订阅。

## 功能

- 用户 / 订单 / 套餐 / 邀请 / 提现 管理
- 节点 / 服务器 / Hysteria2 管理，多服务器切换
- 支付宝 + USDT (TRC20) 支付，自动开通
- 数据看板（转化率 / ARPU / 复购 / 留存）
- 邮件群发 + 模板库
- 优惠码 / 兑换码
- 工单 + AI 客服自动回复
- 公告（置顶 / 定向套餐 / 弹窗-横幅-红点）
- 订阅三格式：/sub/{token} · ?target=v2ray · ?target=singbox
- 多设备登录 / 登录记录 / 邀请树 / 三级分销
- SQLite 自动备份到 OSS

## 快速开始

### 环境要求

- Ubuntu 20.04+ / Debian 11+
- root 权限

### 一键部署

    git clone https://github.com/shuji-chu/Lynli-Panel.git
    cd Lynli-Panel
    sudo bash install.sh

### 改配置

    sudo vim /opt/lynli-panel/config.json

关键字段：

- base_url — 你的域名，如 https://panel.example.com
- smtp_* — 邮箱服务（发验证码用）
- zhipu_key — 智谱 AI key（客服 AI 用，可留空）
- oss_* — 阿里云 OSS（存图片用，可留空）
- hy2_* — Hysteria2 节点密码
- oauth_github_callback — GitHub 登录回调（可留空）

改完重启：

    systemctl restart lynli-api

### 部署管理面板

admin/ 目录是纯静态页面，扔到 Nginx / Vercel / Cloudflare Pages 都行。

打开 admin/app.js，找到顶部 API 地址配置，改成你的域名。

### Nginx 反代示例

    server {
        listen 443 ssl;
        server_name panel.example.com;

        ssl_certificate     /path/to/cert.pem;
        ssl_certificate_key /path/to/key.pem;

        location /api/ {
            proxy_pass http://127.0.0.1:7001/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
        location /uploads/ {
            alias /opt/lynli-panel/uploads/;
        }
    }

## API 文档

认证：所有需要登录的接口用 header

    Authorization: Bearer <token>

### 用户侧接口（节选）

| 路径 | 方法 | 说明 |
|---|---|---|
| /api/v1/config | GET | 首页配置 |
| /api/v1/passport/auth/register | POST | 注册 |
| /api/v1/passport/auth/login | POST | 登录 |
| /api/v1/passport/auth/send-code | POST | 发邮箱验证码 |
| /api/v1/auth/captcha | GET | 获取图形验证码 |
| /api/v1/auth/captcha/check | POST | 校验图形验证码 |
| /api/v1/user/info | GET | 用户信息 |
| /api/v1/user/plan/fetch | GET | 套餐列表 |
| /api/v1/user/order/save | POST | 创建订单 |
| /api/v1/user/order/pay | POST | 调起支付 |
| /api/v1/user/order/query | GET | 查询支付状态 |
| /api/v1/sub/{token} | GET | 订阅 (Clash YAML) |
| /api/v1/sub/{token}?target=v2ray | GET | 订阅 (V2Ray base64) |
| /api/v1/sub/{token}?target=singbox | GET | 订阅 (sing-box JSON) |
| /api/v1/user/invite/fetch | GET | 我的邀请 |
| /api/v1/user/ticket/fetch | GET | 工单列表 |
| /api/v1/user/chat/send | POST | 客服消息（AI 自动回复） |
| /api/v1/user/notices | GET | 公告 |

### 管理侧接口（节选）

| 路径 | 方法 | 说明 |
|---|---|---|
| /api/v1/admin/login | POST | 管理员登录 |
| /api/v1/admin/dashboard | GET | 数据看板 |
| /api/v1/admin/stats/overview | GET | 深度指标 |
| /api/v1/admin/users | GET | 用户列表 |
| /api/v1/admin/users/detail?id=1 | GET | 用户详情（含订单/工单/日志） |
| /api/v1/admin/orders | GET | 订单 |
| /api/v1/admin/plans | GET/POST | 套餐 |
| /api/v1/admin/servers | GET/POST | 服务器 |
| /api/v1/admin/nodes | GET | 节点 |
| /api/v1/admin/notices | GET/POST | 公告 |
| /api/v1/admin/coupons | GET/POST | 优惠码 |
| /api/v1/admin/redeem_codes | GET/POST | 兑换码 |
| /api/v1/admin/ticket/list | GET | 工单 |
| /api/v1/admin/withdrawals | GET | 提现审核 |
| /api/v1/admin/mail/send | POST | 邮件群发 |
| /api/v1/admin/mail/templates | GET/POST | 邮件模板 |
| /api/v1/admin/settings | GET/POST | 系统设置 |
| /api/v1/admin/invites/tree | GET | 邀请树 |

## 技术栈

- 后端：Python 3.8+，stdlib http.server（多线程），SQLite（WAL 模式）
- 前端：原生 HTML / CSS / JS，零依赖
- 部署：systemd + Nginx

## 目录结构

    Lynli-Panel/
    ├── server.py            # HTTP 服务入口
    ├── db.py                # SQLite 初始化 + 工具函数
    ├── config.py            # 配置读取（从 config.json）
    ├── config.example.json  # 配置模板
    ├── api_admin.py         # 管理后台接口
    ├── api_auth.py          # 登录注册
    ├── api_user.py          # 用户侧接口
    ├── api_orders.py        # 订单
    ├── api_pay.py           # 支付（支付宝 + USDT）
    ├── api_extra.py         # 兑换码 / 客服 AI
    ├── api_oauth.py         # GitHub 登录
    ├── api_captcha.py       # 图形验证码
    ├── api_upload.py        # 文件上传
    ├── email_sender.py      # 邮件
    ├── bots_bridge.py       # 机器人桥接
    ├── admin/               # 管理面板（纯静态）
    └── install.sh           # 一键部署

## 许可

AGPL-3.0（详见 LICENSE）

任何人可以自由使用、修改、分发，但修改后必须在相同许可下开源。

## 免责声明

本项目仅用于技术学习与交流，使用者需自行承担所有法律责任。禁止用于任何违法用途。
