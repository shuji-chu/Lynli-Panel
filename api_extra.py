# Lynli 扩展接口：兑换码 + 客服聊天 + 配置版本
import time, db, json, hashlib


def _row_to_dict(row):
    if row is None: return None
    return {k: row[k] for k in row.keys()}


def _banners_hash(c):
    rows = c.execute(
        "SELECT id,type,media,image_url,title,subtitle,link,sort,show FROM banners ORDER BY id"
    ).fetchall()
    data = [dict(r) for r in rows]
    return hashlib.md5(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]


def _get_or_create_room(c, uid):
    row = c.execute(
        "SELECT id FROM tickets WHERE user_id=? AND status=1 ORDER BY id DESC LIMIT 1",
        (uid,)
    ).fetchone()
    if row:
        return row["id"]
    now = int(time.time())
    c.execute(
        "INSERT INTO tickets(user_id,status,handoff,created_at,updated_at,subject) VALUES(?,?,?,?,?,?)",
        (uid, 1, 0, now, now, "在线客服")
    )
    c.commit()
    return c.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]


import config
ZHIPU_KEY = config.get("zhipu_key")
AI_SYSTEM = """你是 Lynli（易搜加速）APP 的客服助手。回答简洁、礼貌、专业，用中文。
Lynli 是一款月付 VPN APP。常见问题：
- 连不上：让用户检查网络或切换节点
- 付款：支付宝 / USDT 均可，到账自动开通
- 退款：人工处理
- 邀请奖励：邀请一个好友永久绑定 15% 佣金，满 100 可提现
不要瞎编功能。不确定的问题让用户等人工。"""


def _ai_reply(content):
    import urllib.request as _ur
    try:
        req = _ur.Request(
            "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            data=json.dumps({
                "model": "glm-4-flash",
                "messages": [
                    {"role": "system", "content": AI_SYSTEM},
                    {"role": "user", "content": content}
                ],
                "temperature": 0.6,
                "max_tokens": 500
            }).encode(),
            headers={
                "Authorization": "Bearer " + ZHIPU_KEY,
                "Content-Type": "application/json"
            },
            method="POST"
        )
        with _ur.urlopen(req, timeout=15) as r:
            j = json.loads(r.read())
        return j["choices"][0]["message"]["content"].strip()
    except Exception:
        return ""



def handle(ctx):
    p = ctx["path"]
    m = ctx["method"]
    send = ctx["send"]

    # ============ 1. 配置版本号（APP 轮询用）============
    if p == "/api/v1/config/version" and m == "GET":
        c = db.connect()
        v = _banners_hash(c)
        c.close()
        send({"code": 1, "message": "ok", "data": {"version": v}})
        return True

    # ============ 2. 兑换码 ============
    if p == "/api/v1/user/redeem" and m == "POST":
        u = db.user_by_token(ctx["token"] or "")
        if not u:
            send({"code": 0, "message": "请先登录"}); return True
        code = (ctx["body"].get("code") or "").strip().upper()
        if not code:
            send({"code": 0, "message": "请输入兑换码"}); return True

        c = db.connect()
        row = c.execute("SELECT * FROM redeem_codes WHERE code=?", (code,)).fetchone()
        if not row:
            c.close(); send({"code": 0, "message": "兑换码不存在"}); return True
        if not row["enabled"]:
            c.close(); send({"code": 0, "message": "兑换码已停用"}); return True
        if row["expire_at"] and row["expire_at"] < int(time.time()):
            c.close(); send({"code": 0, "message": "兑换码已过期"}); return True
        if row["total_limit"] > 0 and row["used_count"] >= row["total_limit"]:
            c.close(); send({"code": 0, "message": "兑换码已被用尽"}); return True

        now = int(time.time())
        c.execute("UPDATE redeem_codes SET used_count=used_count+1 WHERE id=?", (row["id"],))

        added_gb = float(row["reward_gb"] or 0)
        added_days = int(row["reward_days"] or 0)

        if added_gb > 0:
            add_bytes = int(added_gb * 1024 * 1024 * 1024)
            c.execute("UPDATE users SET transfer_enable=transfer_enable+? WHERE id=?", (add_bytes, u["id"]))

        if added_days > 0:
            base = u["expired_at"] or 0
            if base < now: base = now
            new_exp = base + added_days * 86400
            c.execute("UPDATE users SET expired_at=? WHERE id=?", (new_exp, u["id"]))

        c.execute(
            "INSERT INTO redeem_logs(code,user_id,email,reward_gb,reward_days,created_at) VALUES(?,?,?,?,?,?)",
            (code, u["id"], u["email"], added_gb, added_days, now)
        )
        c.commit(); c.close()
        send({"code": 1, "message": "兑换成功", "data": {"reward_gb": added_gb, "reward_days": added_days}})
        return True

    if p == "/api/v1/user/notices" and m == "GET":
        c = db.connect()
        now = int(time.time())
        u = db.user_by_token(ctx["token"] or "")
        rows = c.execute(
            "SELECT id,type,title,content,created_at,pinned,display,target_plan FROM notices "
            "WHERE status=1 AND (start_at=0 OR start_at<=?) AND (end_at=0 OR end_at>=?) "
            "ORDER BY pinned DESC, id DESC LIMIT 50",
            (now, now)
        ).fetchall()
        # 自动标记已读
        if u:
            for r in rows:
                try:
                    c.execute("INSERT OR IGNORE INTO notices_read(notice_id,user_id,read_at) VALUES(?,?,?)",
                              (r["id"], u["id"], now))
                except Exception:
                    pass
            try:
                c.commit()
            except Exception:
                pass
        c.close()
        send({"code": 1, "message": "ok", "data": [dict(r) for r in rows]})
        return True

    if p == "/api/v1/user/bot/status" and m == "GET":
        u = db.user_by_token(ctx["token"] or "")
        if not u:
            send({"code": 0, "message": "请先登录"}); return True
        sid = u["short_id"] or 0
        try:
            import json as _j, os as _o
            mp = "/root/mivrabot/data.json"
            data = _j.load(open(mp)) if _o.path.exists(mp) else {}
        except Exception:
            data = {}
        bound = None
        for tgid, info in data.items():
            if not tgid.isdigit():
                continue
            if str(info.get("bound_short_id") or "") == str(sid) and sid > 0:
                bound = {"tg_id": tgid, "info": info}
                break
        cfg = {}
        try:
            rows = db.connect().execute("SELECT key,value FROM settings WHERE key IN ('mivra_url','mivra_guide')").fetchall()
            cfg = {r["key"]: r["value"] for r in rows}
        except Exception:
            pass
        send({"code": 1, "message": "ok", "data": {
            "short_id": sid,
            "bound": bound is not None,
            "tg_id": bound["tg_id"] if bound else "",
            "last_sign": (bound["info"].get("last_sign") or "") if bound else "",
            "traffic_mb": (bound["info"].get("traffic_mb") or 0) if bound else 0,
            "mivra_url": cfg.get("mivra_url", "https://m.mivra.im/MTProxybot"),
            "guide": cfg.get("mivra_guide", "打开机器人 → 发送「绑定 {short_id}」 → 完成绑定即可签到")
        }}); return True

    if p == "/api/v1/user/redeem_logs" and m == "GET":
        u = db.user_by_token(ctx["token"] or "")
        if not u:
            send({"code": 0, "message": "请先登录"}); return True
        c = db.connect()
        rows = c.execute(
            "SELECT code,reward_gb,reward_days,created_at FROM redeem_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
            (u["id"],)
        ).fetchall()
        c.close()
        send({"code": 1, "message": "ok", "data": [dict(r) for r in rows]})
        return True

    # ============ 3. 客服聊天（复用 tickets + ticket_messages）============
    if p == "/api/v1/user/chat/send" and m == "POST":
        u = db.user_by_token(ctx["token"] or "")
        if not u:
            send({"code": 0, "message": "请先登录"}); return True
        content = (ctx["body"].get("content") or "").strip()
        if not content:
            send({"code": 0, "message": "消息不能为空"}); return True
        c = db.connect()
        rid = _get_or_create_room(c, u["id"])
        now = int(time.time())
        c.execute(
            "INSERT INTO ticket_messages(ticket_id,sender,content,created_at) VALUES(?,?,?,?)",
            (rid, "user", content, now)
        )
        c.execute("UPDATE tickets SET updated_at=? WHERE id=?", (now, rid))
        c.commit()

        tk = c.execute("SELECT handoff FROM tickets WHERE id=?", (rid,)).fetchone()
        need_ai = (not tk) or (tk["handoff"] == 0)
        c.close()

        if need_ai:
            import threading
            def _async_ai(_rid, _content):
                try:
                    reply = _ai_reply(_content)
                    if not reply: return
                    c2 = db.connect()
                    ts = int(time.time())
                    c2.execute(
                        "INSERT INTO ticket_messages(ticket_id,sender,content,created_at) VALUES(?,?,?,?)",
                        (_rid, "ai", reply, ts)
                    )
                    c2.execute("UPDATE tickets SET updated_at=? WHERE id=?", (ts, _rid))
                    c2.commit(); c2.close()
                except Exception:
                    pass
            threading.Thread(target=_async_ai, args=(rid, content), daemon=True).start()

        send({"code": 1, "message": "ok", "data": {"room_id": rid, "created_at": now}})
        return True

    if p == "/api/v1/user/chat/history" and m == "GET":
        u = db.user_by_token(ctx["token"] or "")
        if not u:
            send({"code": 0, "message": "请先登录"}); return True
        since = int(ctx["query"].get("since", 0) or 0)
        c = db.connect()
        rid = _get_or_create_room(c, u["id"])
        if since > 0:
            rows = c.execute(
                "SELECT id,ticket_id,sender,content,created_at FROM ticket_messages WHERE ticket_id=? AND created_at>? ORDER BY created_at ASC",
                (rid, since)
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT id,ticket_id,sender,content,created_at FROM ticket_messages WHERE ticket_id=? ORDER BY created_at ASC LIMIT 200",
                (rid,)
            ).fetchall()
        c.close()
        send({"code": 1, "message": "ok", "data": {"room_id": rid, "messages": [dict(r) for r in rows]}})
        return True

    return False
