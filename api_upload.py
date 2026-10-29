import base64, time, secrets, oss2, db

import config
OSS_AK_ID = config.get("oss_ak_id")
OSS_AK_SECRET = config.get("oss_ak_secret")
OSS_BUCKET = config.get("oss_bucket")
OSS_ENDPOINT_INTERNAL = config.get("oss_endpoint_internal", "oss-cn-hongkong-internal.aliyuncs.com")
OSS_ENDPOINT_PUBLIC = config.get("oss_endpoint_public", "oss-cn-hongkong.aliyuncs.com")

_bucket = None

def _get_bucket():
    global _bucket
    if _bucket is None:
        auth = oss2.Auth(OSS_AK_ID, OSS_AK_SECRET)
        _bucket = oss2.Bucket(auth, OSS_ENDPOINT_INTERNAL, OSS_BUCKET)
    return _bucket

def _check_admin(ctx):
    try:
        import api_admin
        return api_admin._check_admin(ctx)
    except Exception:
        return False

def handle(ctx):
    if ctx["path"] == "/api/v1/user/upload" and ctx["method"] == "POST":
        u = db.user_by_token(ctx.get("token"))
        if not u:
            ctx["send"]({"data": None, "message": "unauth", "status": "fail"}, 401); return True
        b = ctx.get("body") or {}; filename = (b.get("filename") or "avatar.jpg").strip().replace("\\\\", "/").split("/")[-1]
        content_b64 = b.get("content") or b.get("file") or ""
        if "," in content_b64 and content_b64.startswith("data:"): content_b64 = content_b64.split(",", 1)[1]
        if not content_b64:
            ctx["send"]({"data": None, "message": "请上传 content（Base64）", "status": "fail"}, 400); return True
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ".jpg"
        if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
            ctx["send"]({"data": None, "message": "仅支持 jpg/jpeg/png/webp/gif 图片", "status": "fail"}, 400); return True
        try: raw = base64.b64decode(content_b64, validate=True)
        except Exception:
            ctx["send"]({"data": None, "message": "Base64 图片数据无效", "status": "fail"}, 400); return True
        if not raw or len(raw) > 2 * 1024 * 1024:
            ctx["send"]({"data": None, "message": "头像文件必须小于等于 2MB", "status": "fail"}, 400); return True
        if not OSS_AK_ID or not OSS_AK_SECRET or not OSS_BUCKET or not config.get("oss_public_url"):
            ctx["send"]({"data": None, "message": "OSS 未配置，请先配置 oss_ak_id/oss_ak_secret/oss_bucket/oss_public_url", "status": "fail"}, 503); return True
        key = "avatars/" + time.strftime("%Y%m") + "/" + str(u["id"]) + "-" + secrets.token_hex(8) + ext
        try:
            mime = {"jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","webp":"image/webp","gif":"image/gif"}[ext[1:]]
            _get_bucket().put_object(key, raw, headers={"Content-Type": mime, "Content-Disposition": "inline"})
        except Exception as e:
            ctx["send"]({"data": None, "message": "OSS 上传失败：" + str(e)[:120], "status": "fail"}, 500); return True
        url = config.get("oss_public_url", "").rstrip("/") + "/" + key
        c = db.connect(); cols = {r[1] for r in c.execute("PRAGMA table_info(users)").fetchall()}
        if "avatar_url" in cols: c.execute("UPDATE users SET avatar_url=? WHERE id=?", (url, u["id"]))
        if "avatar" in cols: c.execute("UPDATE users SET avatar=? WHERE id=?", (url, u["id"]))
        c.commit(); c.close()
        ctx["send"]({"data": {"url": url, "avatar_url": url, "key": key, "size": len(raw)}, "message": "", "status": "success"}); return True

    if ctx["path"] != "/api/v1/admin/upload": return False
    if ctx["method"] != "POST": return False
    if not _check_admin(ctx):
        ctx["send"]({"code": 0, "msg": "unauthorized"}, 401); return True

    b = ctx["body"]
    filename = (b.get("filename") or "file.bin").strip()
    content_b64 = b.get("content") or ""
    if not content_b64:
        ctx["send"]({"code": 0, "msg": "content empty"}, 400); return True

    try:
        raw = base64.b64decode(content_b64)
    except Exception as e:
        ctx["send"]({"code": 0, "msg": "bad base64"}, 400); return True

    ext = ""
    if "." in filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower()[:8]
    key = "uploads/" + time.strftime("%Y%m") + "/" + secrets.token_hex(8) + ext

    try:
        _get_bucket().put_object(key, raw, headers={"Content-Disposition": "inline"})
    except Exception as e:
        ctx["send"]({"code": 0, "msg": "oss error: " + str(e)[:120]}, 500); return True

    url = config.get("oss_public_url", "").rstrip("/") + "/" + key
    ctx["send"]({"code": 1, "url": url, "key": key, "size": len(raw)})
    return True
