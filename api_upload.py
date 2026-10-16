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
