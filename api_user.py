import time, db
import config

def handle(ctx):
    p = ctx["path"]

    if p.startswith("/api/v1/sub/"):
        tok = p.replace("/api/v1/sub/", "").strip()
        if not tok:
            ctx["send"]({"code": 0, "msg": "invalid"}); return True
        c = db.connect()
        u = c.execute("SELECT * FROM users WHERE sub_token=?", (tok,)).fetchone()
        c.close()
        if not u:
            ctx["send"]({"code": 0, "msg": "订阅不存在"}); return True
        if u["expired_at"] and u["expired_at"] < int(time.time()):
            ctx["send"]({"code": 0, "msg": "订阅已过期"}); return True

        # target 参数
        _q = ctx.get("query") or {}
        _t = _q.get("target") or ""
        if isinstance(_t, list):
            _t = (_t[0] if _t else "").strip().lower()
        else:
            _t = str(_t).strip().lower()

        # 节点参数：从 servers 表读，域名为空就用 IP
        try:
            _c2 = db.connect()
            _srv = _c2.execute("SELECT name,ip,domain FROM servers WHERE enabled=1 ORDER BY sort LIMIT 1").fetchone()
            _c2.close()
        except Exception:
            _srv = None
        _name = (_srv["name"] if _srv and _srv["name"] else "易搜加速·美西")
        _domain = (_srv["domain"] if _srv and _srv["domain"] else "") or ""
        _ip = (_srv["ip"] if _srv and _srv["ip"] else "us1.yisoujiasu.de5.net")
        NODE_NAME = _name
        NODE_HOST = _domain if _domain else _ip
        NODE_PORT = 443
        NODE_PASS = config.get("hy2_password", "")
        NODE_SNI = config.get("hy2_sni", "www.bing.com")
        NODE_OBFS = "salamander"
        NODE_OBFS_PW = config.get("hy2_obfs_password", "")

        # ============ sing-box ============
        if _t in ("singbox", "sing-box", "sb"):
            import json as _j
            cfg = {
                "log": {"level": "warn"},
                "dns": {"servers": [{"tag": "ali", "address": "223.5.5.5"}]},
                "inbounds": [{"type": "mixed", "tag": "mixed-in", "listen": "127.0.0.1", "listen_port": 2080}],
                "outbounds": [
                    {
                        "type": "hysteria2",
                        "tag": NODE_NAME,
                        "server": NODE_HOST,
                        "server_port": NODE_PORT,
                        "password": NODE_PASS,
                        "obfs": {"type": NODE_OBFS, "password": NODE_OBFS_PW},
                        "tls": {"enabled": True, "server_name": NODE_SNI, "insecure": True}
                    },
                    {"type": "direct", "tag": "DIRECT"}
                ],
                "route": {
                    "rules": [{"geoip": ["cn"], "outbound": "DIRECT"}],
                    "final": NODE_NAME
                }
            }
            ctx["raw_send"](_j.dumps(cfg, ensure_ascii=False, indent=2).encode("utf-8"))
            return True

        # ============ v2ray / base64 ============
        if _t in ("v2ray", "v2rayn", "base64", "b64"):
            import base64 as _b64
            from urllib.parse import quote as _q0
            link = ("hysteria2://" + NODE_PASS + "@" + NODE_HOST + ":" + str(NODE_PORT) +
                    "?obfs=" + NODE_OBFS + "&obfs-password=" + NODE_OBFS_PW +
                    "&sni=" + NODE_SNI + "&insecure=1#" + _q0(NODE_NAME))
            b = _b64.b64encode(link.encode("utf-8")).decode("ascii")
            ctx["raw_send"](b.encode("utf-8"))
            return True

        # ============ 默认 clash ============
        yaml_text = (
            "mixed-port: 7890\n"
            "allow-lan: false\n"
            "mode: rule\n"
            "log-level: warning\n"
            "external-controller: 127.0.0.1:9090\n"
            "\n"
            "proxies:\n"
            "  - name: \"" + NODE_NAME + "\"\n"
            "    type: hysteria2\n"
            "    server: " + NODE_HOST + "\n"
            "    port: " + str(NODE_PORT) + "\n"
            "    password: \"" + NODE_PASS + "\"\n"
            "    sni: \"" + NODE_SNI + "\"\n"
            "    skip-cert-verify: true\n"
            "    obfs: " + NODE_OBFS + "\n"
            "    obfs-password: \"" + NODE_OBFS_PW + "\"\n"
            "    up: \"100 Mbps\"\n"
            "    down: \"200 Mbps\"\n"
            "\n"
            "proxy-groups:\n"
            "  - name: PROXY\n"
            "    type: select\n"
            "    proxies:\n"
            "      - \"" + NODE_NAME + "\"\n"
            "      - DIRECT\n"
            "\n"
            "rules:\n"
            "  - GEOIP,CN,DIRECT\n"
            "  - MATCH,PROXY\n"
        )
        ctx["raw_send"](yaml_text.encode("utf-8"))
        return True

    if p == "/api/v1/user/wallet/submit" and ctx["method"] == "POST":
        u = db.user_by_token(ctx["token"])
        if not u: ctx["send"]({"data": None, "message": "unauth", "status": "fail"}, 401); return True
        b = ctx["body"]
        rn = (b.get("real_name") or "").strip()
        us = (b.get("usdt_addr") or "").strip()
        al = (b.get("alipay") or "").strip()
        if not rn:
            ctx["send"]({"data": None, "message": "请填写真实姓名", "status": "fail"}, 400); return True
        if not us and not al:
            ctx["send"]({"data": None, "message": "至少填写一个收款方式", "status": "fail"}, 400); return True
        c = db.connect()
        c.execute("UPDATE users SET real_name=?, usdt_addr=?, alipay=?, wallet_status=0, wallet_updated_at=? WHERE id=?",
                  (rn, us, al, int(time.time()), u["id"]))
        c.commit(); c.close()
        ctx["send"]({"data": None, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/wallet/info" and ctx["method"] == "GET":
        u = db.user_by_token(ctx["token"])
        if not u: ctx["send"]({"data": None, "message": "unauth", "status": "fail"}, 401); return True
        k = u.keys()
        ctx["send"]({"data": {
            "real_name": u["real_name"] if "real_name" in k else "",
            "usdt_addr": u["usdt_addr"] if "usdt_addr" in k else "",
            "alipay": u["alipay"] if "alipay" in k else "",
            "wallet_status": u["wallet_status"] if "wallet_status" in k else 0
        }, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/withdraw/submit" and ctx["method"] == "POST":
        u = db.user_by_token(ctx["token"])
        if not u: ctx["send"]({"data": None, "message": "unauth", "status": "fail"}, 401); return True
        b = ctx["body"]
        amount_yuan = float(b.get("amount") or 0)
        method = (b.get("method") or "alipay").strip()
        if amount_yuan < 100:
            ctx["send"]({"data": None, "message": "最低 100 元起提", "status": "fail"}, 400); return True
        k = u.keys()
        ws = u["wallet_status"] if "wallet_status" in k else 0
        if ws != 1:
            ctx["send"]({"data": None, "message": "请先绑定收款方式并通过审核", "status": "fail"}, 400); return True
        acc = ""
        if method == "usdt":
            acc = u["usdt_addr"] if "usdt_addr" in k else ""
        else:
            acc = u["alipay"] if "alipay" in k else ""
        if not acc:
            ctx["send"]({"data": None, "message": "收款账号未绑定", "status": "fail"}, 400); return True
        amount_cents = int(amount_yuan * 100)
        bal = u["commission_balance"] if "commission_balance" in k else 0
        if (bal or 0) < amount_cents:
            ctx["send"]({"data": None, "message": "余额不足，可提现 ¥%.2f" % ((bal or 0)/100.0), "status": "fail"}, 400); return True
        fee_cents = int(amount_cents * 0.08)
        real_cents = amount_cents - fee_cents
        c = db.connect()
        c.execute("UPDATE users SET commission_balance = commission_balance - ? WHERE id=?", (amount_cents, u["id"]))
        c.execute("INSERT INTO withdrawals(user_id, amount, method, account, status, created_at) VALUES(?,?,?,?,0,?)",
                  (u["id"], amount_cents, method, acc, int(time.time())))
        c.commit(); c.close()
        ctx["send"]({"data": {"fee": fee_cents, "real": real_cents}, "message": "已提交，等待审核", "status": "success"}); return True

    if p == "/api/v1/user/withdraw/list" and ctx["method"] == "GET":
        u = db.user_by_token(ctx["token"])
        if not u: ctx["send"]({"data": None, "message": "unauth", "status": "fail"}, 401); return True
        c = db.connect()
        rows = c.execute("SELECT id, amount, method, status, created_at, notified FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 50",
                         (u["id"],)).fetchall()
        k = u.keys()
        bal = u["commission_balance"] if "commission_balance" in k else 0
        tot = u["commission_total"] if "commission_total" in k else 0
        c2 = c.execute("SELECT COALESCE(SUM(amount),0) AS s FROM withdrawals WHERE user_id=? AND status=1", (u["id"],)).fetchone()
        c.close()
        notif = None
        for r in rows:
            try:
                if r["status"] in (1,2) and (r["notified"] or 0) == 0:
                    notif = {"id": r["id"], "amount": r["amount"], "status": r["status"]}
                    break
            except Exception:
                pass
        if notif:
            try:
                c3 = db.connect()
                c3.execute("UPDATE withdrawals SET notified=1 WHERE id=?", (notif["id"],))
                c3.commit(); c3.close()
            except Exception:
                pass
        ctx["send"]({"data": {
            "list": [dict(r) for r in rows],
            "balance": bal or 0,
            "total": tot or 0,
            "withdrawn": c2["s"] or 0,
            "notif": notif
        }, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/update-nickname":
        u = db.user_by_token(ctx["token"])
        if not u:
            ctx["send"]({"data": None, "message": "unauth", "status": "fail"}, 401); return True
        nick = (ctx["body"].get("nickname") or "").strip()
        if len(nick) > 20:
            ctx["send"]({"data": None, "message": "昵称不能超过20字", "status": "fail"}, 400); return True
        c = db.connect()
        c.execute("UPDATE users SET nickname=? WHERE id=?", (nick, u["id"]))
        c.commit(); c.close()
        ctx["send"]({"data": None, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/update-avatar":
        u = db.user_by_token(ctx["token"])
        if not u:
            ctx["send"]({"data": None, "message": "unauth", "status": "fail"}, 401); return True
        av = (ctx["body"].get("avatar") or "").strip()
        if len(av) > 500000:
            ctx["send"]({"data": None, "message": "头像过大", "status": "fail"}, 400); return True
        c = db.connect()
        c.execute("UPDATE users SET avatar=? WHERE id=?", (av, u["id"]))
        c.commit(); c.close()
        ctx["send"]({"data": None, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/update-password":
        u = db.user_by_token(ctx["token"])
        if not u:
            ctx["send"]({"data": None, "message": "unauth", "status": "fail"}, 401); return True
        old_pw = ctx["body"].get("old_password") or ""
        new_pw = ctx["body"].get("new_password") or ""
        if not new_pw or len(new_pw) < 6:
            ctx["send"]({"data": None, "message": "新密码至少6位", "status": "fail"}, 400); return True
        if u["password"] != db.hash_pw(old_pw):
            ctx["send"]({"data": None, "message": "原密码错误", "status": "fail"}, 400); return True
        c = db.connect()
        c.execute("UPDATE users SET password=? WHERE id=?", (db.hash_pw(new_pw), u["id"]))
        c.commit(); c.close()
        ctx["send"]({"data": None, "message": "", "status": "success"}); return True

    if p not in ("/api/v1/user/info", "/api/v1/user/getSubscribe"): return False
    u = db.user_by_token(ctx["token"])
    if not u:
        ctx["send"]({"data": None, "message": "unauth", "status": "fail"}, 401); return True

    keys = u.keys()
    nickname = u["nickname"] if "nickname" in keys else ""
    avatar = u["avatar"] if "avatar" in keys else ""

    if p.endswith("/info"):
        ctx["send"]({"data": {
            "email": u["email"], "transferEnable": u["transfer_enable"],
            "lastLoginAt": int(time.time()), "createdAt": u["created_at"],
            "banned": u["banned"], "remindExpire": 0, "remindTraffic": 0,
            "expiredAt": u["expired_at"], "balance": 0, "commissionBalance": 0,
            "uuid": u["uuid"], "avatarURL": avatar, "shortId": u["short_id"] if "short_id" in keys else 0,
            "nickname": nickname}}); return True

    plan = db.plan_to_dict(db.plan_by_id(u["plan_id"])) if u["plan_id"] else None
    ctx["send"]({"data": {
        "short_id": u["short_id"] if "short_id" in keys else 0,
        "plan_id": u["plan_id"], "token": u["token"],
        "expired_at": u["expired_at"], "u": u["u"], "d": u["d"],
        "transfer_enable": u["transfer_enable"], "email": u["email"],
        "uuid": u["uuid"], "plan": plan,
        "subscribe_url": config.get("base_url", "") + "/api/v1/sub/" + (u["sub_token"] or ""),
        "reset_day": "1"}}); return True
