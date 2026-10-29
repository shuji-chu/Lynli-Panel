# 用户接口升级说明（Lynli Panel）

## 用户短 ID
注册后自动生成 5 位大写字母/数字 ID（排除易混淆字符），`users.short_id` 唯一。服务启动初始化数据库时会为旧用户补齐。注册/登录返回 `data.user.short_id`；`GET /api/v1/user/info` 返回 `data.user.short_id` 并保留 `data.shortId` 兼容字段。

## 更新资料
`POST /api/v1/user/update`，请求头 `Authorization: Bearer <token>`，JSON 字段可选：
```json
{
  "nickname": "新昵称",
  "avatar_url": "https://cdn.example.com/avatar.jpg"
}
```
成功返回 `data.id/email/short_id/nickname/avatar_url`。昵称最多 40 字；头像 URL 仅接受 http(s)。

## 上传头像（方案 A）
`POST /api/v1/user/upload`，`Authorization: Bearer <token>`，`Content-Type: application/json`：
```json
{
  "filename": "avatar.png",
  "content": "<图片文件 Base64 字符串>"
}
```
支持 data URL Base64 内容；仅 jpg/jpeg/png/webp/gif，最大 2MB。成功返回 `data.url`、`data.avatar_url`、`data.key`。需配置 `oss_ak_id`、`oss_ak_secret`、`oss_bucket`、`oss_public_url`；OSS 未配置时返回 503。

## 套餐类型
`GET /api/v1/user/plan/fetch` 返回所有套餐行，并附 `type` 字段。分类保存在独立 `product_type` 字段，默认 `node`；引流商品设置为 `traffic`，避免影响原计费字段 `type`。

## CORS / 部署
Python 服务允许跨域来源 `*`，请求头 `Authorization/Content-Type/X-Requested-With` 和 GET/POST/OPTIONS。GitHub 提交不等于线上生效：服务器仍需拉取代码并重启 `lynli-api`，并检查实际 Nginx 与 OSS 配置。
