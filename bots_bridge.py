# -*- coding: utf-8 -*-
import json, sqlite3, os

SAFEW_JSON   = "/root/signbot/data.json"
MIVRA_JSON   = "/root/mivrabot/data.json"
QINGTIAN_DB  = "/root/qingtian_bot.db"


def _read_json(path):
    if not os.path.exists(path):
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}


def _safew_users():
    d = _read_json(SAFEW_JSON)
    out = []
    for k, v in d.items():
        if not k.isdigit():
            continue
        out.append({
            "tg_id": k,
            "nickname": v.get("first_name") or "",
            "traffic_mb": v.get("traffic_mb") or 0,
            "expire": int(v.get("expire") or 0),
            "suser": v.get("suser") or "",
            "spass": v.get("spass") or "",
            "last_sign": v.get("last_sign") or "",
            "activated": 1 if v.get("activated") else 0,
            "inviter": 0,
            "invite_count": 0,
            "balance": 0
        })
    return out


def _mivra_users():
    d = _read_json(MIVRA_JSON)
    out = []
    for k, v in d.items():
        if not k.isdigit():
            continue
        out.append({
            "tg_id": k,
            "nickname": v.get("first_name") or v.get("username") or "",
            "traffic_mb": v.get("traffic_mb") or 0,
            "expire": int(v.get("expire") or 0),
            "suser": v.get("suser") or "",
            "spass": v.get("spass") or "",
            "last_sign": v.get("last_sign") or "",
            "activated": 1 if v.get("activated") else 0,
            "inviter": v.get("inviter") or 0,
            "invite_count": v.get("invite_count") or 0,
            "balance": float(v.get("balance") or 0)
        })
    return out


def _qingtian_users():
    if not os.path.exists(QINGTIAN_DB):
        return []
    try:
        c = sqlite3.connect(QINGTIAN_DB)
        c.row_factory = sqlite3.Row
        rows = c.execute("SELECT * FROM users").fetchall()
        c.close()
    except Exception:
        return []
    out = []
    for r in rows:
        d = dict(r)
        out.append({
            "tg_id": str(d.get("uid", "")),
            "nickname": d.get("username") or "",
            "traffic_mb": int((d.get("balance_gb") or 0) * 1024),
            "expire": int(d.get("node_expire") or 0),
            "suser": d.get("node_user") or "",
            "spass": d.get("node_pass") or "",
            "last_sign": d.get("last_sign") or "",
            "activated": int(d.get("activated") or 0),
            "inviter": d.get("inviter") or 0,
            "invite_count": d.get("invite_count") or 0,
            "balance": float(d.get("usdt_balance") or 0)
        })
    return out


def get_users(bot):
    if bot == "safew":
        return _safew_users()
    if bot == "mivra":
        return _mivra_users()
    if bot == "qingtian":
        return _qingtian_users()
    return []


def get_stats(bot):
    users = get_users(bot)
    today = __import__("time").strftime("%Y-%m-%d")
    total = len(users)
    today_sign = sum(1 for u in users if u.get("last_sign") == today)
    paid = sum(1 for u in users if u.get("expire", 0) > 0)
    active_agents = sum(1 for u in users if u.get("invite_count", 0) > 0)
    return {
        "total": total,
        "today_sign": today_sign,
        "paid_users": paid,
        "active_agents": active_agents,
        "total_orders": 0,
        "today_orders": 0,
        "today_income": 0,
        "total_income": 0
    }
