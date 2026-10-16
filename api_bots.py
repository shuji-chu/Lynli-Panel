# -*- coding: utf-8 -*-
import os, time, json, base64, secrets
import bots_bridge

UPLOAD_DIR = "/opt/lynli-api/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 本地保存机器人停用状态（JSON 文件，因为机器人数据是它自己的）
BOT_STATE_FILE = "/opt/lynli-api/bot_state.json"


def _load_bot_state():
    if os.path.exists(BOT_STATE_FILE):
        try:
            with open(BOT_STATE_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_bot_state(s):
    with open(BOT_STATE_FILE, "w") as f:
        json.dump(s, f, ensure_ascii=False)


def handle(ctx):
    p, m = ctx["path"], ctx["method"]
    b = ctx["body"] or {}

    if not p.startswith("/api/v1/admin/"):
        return False

    # ============ 上传 ============
    if p == "/api/v1/admin/upload" and m == "POST":
        data = b.get("data") or ""
        name = b.get("name") or "file"
        if not data:
            ctx["send"]({"code": 0, "msg": "无文件数据"}); return True
        if "," in data:
            data = data.split(",", 1)[1]
        try:
            raw = base64.b64decode(data)
        except Exception:
            ctx["send"]({"code": 0, "msg": "base64 解析失败"}); return True
        ext = os.path.splitext(name)[1] or ".bin"
        fn = secrets.token_hex(12) + ext
        with open(os.path.join(UPLOAD_DIR, fn), "wb") as f:
            f.write(raw)
        import config
        url = config.get("base_url", "").rstrip("/") + "/uploads/" + fn
        ctx["send"]({"code": 1, "data": {"url": url}}); return True

    # ============ 机器人渠道 ============
    if p == "/api/v1/admin/bots" and m == "GET":
        state = _load_bot_state()
        bots = [
            {"id": 1, "key": "safew",    "name": "SafeW",    "handle": "@qishe77",       "link": "https://t.me/qishe77"},
            {"id": 2, "key": "mivra",    "name": "Mivra",    "handle": "@vpn88",         "link": "https://t.me/vpn88"},
            {"id": 3, "key": "qingtian", "name": "Telegram", "handle": "@qingtian_boss", "link": "https://t.me/qingtian_boss"},
        ]
        proc = os.popen("ps aux | grep -v grep | grep -E 'signbot|mivrabot|qingtian_bot'").read()
        for b2 in bots:
            key = b2["key"]
            alive = False
            if key == "safew" and "signbot" in proc: alive = True
            if key == "mivra" and "mivrabot" in proc: alive = True
            if key == "qingtian" and "qingtian_bot" in proc: alive = True
            b2["online"] = alive
            b2["status"] = state.get(key, 1)
            b2["msgs_today"] = 0
            b2["msgs_total"] = 0
            b2["staff"] = 0
        ctx["send"]({"code": 1, "data": bots}); return True

    if p == "/api/v1/admin/bots/toggle" and m == "POST":
        state = _load_bot_state()
        key_map = {1: "safew", 2: "mivra", 3: "qingtian"}
        key = key_map.get(b.get("id"), "")
        if key:
            state[key] = 1 if b.get("status") else 0
            _save_bot_state(state)
        ctx["send"]({"code": 1}); return True

    # ============ 机器人用户 ============
    if p == "/api/v1/admin/bot_users" and m == "GET":
        bot = ctx["query"].get("bot", "")
        users = bots_bridge.get_users(bot)
        ctx["send"]({"code": 1, "data": users}); return True

    if p == "/api/v1/admin/bot_stats" and m == "GET":
        bot = ctx["query"].get("bot", "")
        if bot:
            ctx["send"]({"code": 1, "data": bots_bridge.get_stats(bot)}); return True
        out = {}
        for k in ("safew", "mivra", "qingtian"):
            out[k] = bots_bridge.get_stats(k)
        ctx["send"]({"code": 1, "data": out}); return True

    return False
