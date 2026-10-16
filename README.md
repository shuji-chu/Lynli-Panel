<div align="center">

# Lynli Panel

**轻量级 VPN / 代理订阅管理平台**

Python · SQLite · 原生 HTML/JS · 零框架依赖

[![License](https://img.shields.io/badge/License-AGPL_v3-2E5BFF.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.8%2B-3776AB.svg)](https://www.python.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57.svg)](https://sqlite.org)
[![Clash](https://img.shields.io/badge/Clash-yaml-2E5BFF.svg)](#订阅)
[![V2Ray](https://img.shields.io/badge/V2Ray-base64-7C3AED.svg)](#订阅)
[![sing-box](https://img.shields.io/badge/sing--box-json-16A34A.svg)](#订阅)

</div>

---

Lynli Panel 是一套面向个人及小型服务商的 VPN / 代理订阅管理平台。后端基于 Python 标准库实现，前端为纯原生 HTML/JS，无需构建工具即可部署。

覆盖用户管理、订单支付、订阅下发、节点调度、数据统计、客服工单、开放平台等完整业务闭环。

## 功能

**用户与订阅**
- 注册 / 登录 / 图形验证码 / 邮箱验证
- 多设备登录、登录记录、踢下线
- 三级分销、邀请奖励流量、邀请树
- 订阅三格式：Clash YAML / V2Ray base64 / sing-box JSON
- 节点多地区分组、自动选择、订阅自动更新

**套餐与订单**
- 套餐配置、订单管理、手动补单、退款 / 作废
- 优惠码、兑换码、活动配置

**支付**
- 支付宝（nzzf 通道）
- USDT（TRC20 链上监听，自动到账）

**运营与客服**
- 工单系统 + AI 自动回复
- 邮件群发 + 模板库
- 公告推送（置顶 / 定向 / 弹窗-横幅-红点）
- 提现审核、钱包审核、广告位管理

**系统**
- 数据看板（转化率 / ARPU / ARPPU / 复购 / 留存 / 邀请占比）
- 服务器管理、节点管理、机器人渠道
- 系统监控（CPU / 内存 / 磁盘 / 服务状态）
- 崩溃日志、应用运行日志
- SQLite 自动备份至阿里云 OSS

**开放平台**
- 统一 API 网关（身份识别 / 限流 / 全量日志）
- API Key 自助申请与审批
- scopes 权限分级（read / write / all）
- 对外公开 API 文档

## 快速开始

### 环境要求

- Ubuntu 20.04+ / Debian 11+
- Python 3.8+
- root 权限

### 一键部署

    git clone https://github.com/shuji-chu/Lynli-Panel.git
    cd Lynli-Panel
    sudo bash install.sh

### 修改配置

编辑 `/opt/lynli-panel/config.json`：

| 字段 | 说明 |
|---|---|
| base_url | 站点域名 |
| smtp_* | 邮箱服务 |
| zhipu_key | 智谱 AI Key（可留空） |
| oss_* | 阿里云 OSS（可留空） |
| hy2_* | Hysteria2 节点密码 |

修改后重启：

    systemctl restart lynli-api

### 部署管理面板

admin/ 目录为纯静态页面，可部署至 Nginx / Vercel / Cloudflare Pages。

打开 admin/app.js，修改顶部 API 常量为你的域名。

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
    }

## API 文档

认证：`Authorization: Bearer <token>`

开放平台：`X-API-Key: lyn_xxxxxxxx`

### 用户侧

| 路径 | 方法 | 说明 |
|---|---|---|
| /api/v1/config | GET | 站点配置 |
| /api/v1/passport/auth/login | POST | 登录 |
| /api/v1/passport/auth/register | POST | 注册 |
| /api/v1/auth/captcha | GET | 图形验证码 |
| /api/v1/user/info | GET | 用户信息 |
| /api/v1/user/plan/fetch | GET | 套餐列表 |
| /api/v1/user/order/save | POST | 创建订单 |
| /api/v1/user/order/pay | POST | 调起支付 |

### 订阅

| 路径 | 格式 |
|---|---|
| /api/v1/sub/{token} | Clash YAML |
| /api/v1/sub/{token}?target=v2ray | V2Ray base64 |
| /api/v1/sub/{token}?target=singbox | sing-box JSON |

### 管理侧

| 路径 | 方法 | 说明 |
|---|---|---|
| /api/v1/admin/login | POST | 管理员登录 |
| /api/v1/admin/dashboard | GET | 数据看板 |
| /api/v1/admin/stats/overview | GET | 深度指标 |
| /api/v1/admin/users | GET | 用户列表 |
| /api/v1/admin/orders | GET | 订单列表 |
| /api/v1/admin/plans | GET/POST | 套餐管理 |
| /api/v1/admin/servers | GET/POST | 服务器管理 |
| /api/v1/admin/notices | GET/POST | 公告管理 |
| /api/v1/admin/withdrawals | GET | 提现审核 |
| /api/v1/admin/settings | GET/POST | 系统设置 |
| /api/v1/admin/invites/tree | GET | 邀请树 |

### 开放平台

| 路径 | 方法 | 说明 |
|---|---|---|
| /api/v1/docs | GET | 对外公开 API 文档 |
| /api/v1/apply | POST | 提交 API Key 申请 |
| /api/v1/whoami | GET | 查询当前身份 |
| /api/v1/admin/apply/list | GET | 申请列表 |
| /api/v1/admin/apply/review | POST | 审批 |
| /api/v1/admin/apikeys | GET | Key 列表 |
| /api/v1/admin/apilogs | GET | 调用日志 |

调用示例：

    curl -H "X-API-Key: lyn_xxxxxxxx" \
         https://panel.example.com/api/v1/plans

## 技术栈

- 后端：Python 3.8+ · 标准库 http.server（多线程）· SQLite（WAL）
- 前端：原生 HTML / CSS / JavaScript，零构建、零依赖
- 部署：systemd + Nginx

## 目录结构

    Lynli-Panel/
    ├── server.py            HTTP 服务入口
    ├── db.py                SQLite 初始化与工具
    ├── config.py            配置读取
    ├── config.example.json  配置模板
    ├── gateway.py           API 网关（身份 / 限流 / 日志）
    ├── api_admin.py         管理后台接口
    ├── api_auth.py          登录注册
    ├── api_user.py          用户侧接口
    ├── api_orders.py        订单
    ├── api_pay.py           支付（支付宝 + USDT）
    ├── api_extra.py         兑换码 / 客服 AI
    ├── api_oauth.py         GitHub 登录
    ├── api_captcha.py       图形验证码
    ├── api_crash.py         崩溃 / 日志上报
    ├── api_gateway.py       开放平台（Key / 申请 / 日志）
    ├── api_public.py        对外公开接口（docs / apply）
    ├── api_upload.py        文件上传
    ├── email_sender.py      邮件
    ├── bots_bridge.py       机器人桥接
    ├── admin/               管理面板（纯静态）
    └── install.sh           一键部署

## 配套客户端

Lynli 提供配套 Android 客户端（基于 Clash Meta for Android 修改）：

- 一键连接、分应用代理、每日签到
- 节点分组、订阅自动更新
- 与面板共用同一套 API，填入域名即可对接

| 渠道 | 地址 |
|---|---|
| Release | https://github.com/shuji-chu/Lynli-Release/releases |
| 最新版 | https://github.com/shuji-chu/Lynli-Release/releases/latest/download/Lynli.apk |

## 社群

| 渠道 | 地址 | 说明 |
|---|---|---|
| 签到群 | https://m.mivra.im/SOCKS5 | 每日签到领取流量 |
| 交流群 | https://m.mivra.im/ys888 | 产品交流 · 技术讨论 |
| Telegram | https://t.me/qingtian_vip | 签到 / 交流 |
| Issues | https://github.com/shuji-chu/Lynli-Panel/issues | Bug 反馈 · 建议 |

以上为官方演示实例。自行部署时请替换为你自己的社群链接。

## 交流与反馈

- 遇到问题 → 提交 [Issue](https://github.com/shuji-chu/Lynli-Panel/issues)
- 想改代码 → Fork + PR
- 技术交流 → lynli@qingtian.kz.ci

## 许可

本项目基于 AGPL-3.0 许可发布，详见 [LICENSE](LICENSE)。

任何人可自由使用、修改、分发，修改后须在相同许可下开源。

## 免责声明

本项目仅用于技术学习与交流，使用者须自行承担所有法律责任。禁止用于任何违法用途。
