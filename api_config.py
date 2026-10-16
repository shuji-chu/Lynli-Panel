import db
import config


def _load_settings(c):
    rows = c.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: (r["value"] or "") for r in rows}


def handle(ctx):
    if ctx["path"] != "/api/v1/config":
        return False
    c = db.connect()
    rows = c.execute(
        "SELECT id, type, media, image_url, title, subtitle, link, sort "
        "FROM banners WHERE show=1 ORDER BY sort"
    ).fetchall()
    s = _load_settings(c)
    c.close()

    banners = []
    for r in rows:
        d = dict(r)
        src = d.get("media") or d.get("image_url") or ""
        if not src:
            continue
        if not src.startswith("http") and not src.startswith("/"):
            src = "/" + src
        banners.append({
            "id": d["id"],
            "type": d.get("type") or "image",
            "media": src,
            "image_url": src,
            "title": d.get("title") or "",
            "subtitle": d.get("subtitle") or "",
            "link": d.get("link") or "",
            "sort": d.get("sort") or 0
        })

    # 动态 baseURL：用户从哪个域名来就返回哪个域名
    _host = (ctx.get("host") or "").split(":")[0].strip()
    if _host and _host not in ("127.0.0.1", "localhost"):
        base = "https://" + _host
    else:
        base = config.get("base_url", "https://localhost")
    kefu = s.get("kefu_url", "https://t.me/")
    tg = s.get("telegram_url", "https://t.me/")
    site = s.get("website_url", "")
    dl = s.get("app_download_url", "")

    # 字段名双写，兼容所有 APP 版本
    ctx["send"]({
        "baseURL": base,
        "baseDURL": "",
        "baseDYURL": "",
        "mainregisterURL": "",
        "paymentURL": "",
        "telegramUrl": tg,
        "telegramurl": tg,
        "kefuUrl": kefu,
        "kefuurl": kefu,
        "websiteURL": site,
        "appDownloadUrl": dl,
        "mivraUrl": s.get("mivra_url", ""),
        "mivraurl": s.get("mivra_url", ""),
        "mivraGuide": s.get("mivra_guide", ""),
        "siteName": s.get("site_name", "Lynli"),
        "registerOpen": 1 if s.get("register_open", "1") == "1" else 0,
        "maintenance": 1 if s.get("maintenance", "0") == "1" else 0,
        "maintenanceNotice": s.get("maintenance_notice", ""),
        "globalNotice": s.get("global_notice", ""),
        "forceUpdate": 1 if s.get("force_update", "0") == "1" else 0,
        "latestVersion": s.get("latest_version", ""),
        "crisptoken": "",
        "banners": banners,
        "message": "ok",
        "code": 1
    })
    return True
