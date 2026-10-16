import time, secrets, db

RATE = 15  # 佣金比例 %


def handle(ctx):
    p, m = ctx["path"], ctx["method"]

    if p == "/api/v1/user/invite/fetch" and m == "GET":
        u = db.user_by_token(ctx["token"])
        if not u:
            ctx["send"]({"data": None, "error": None, "message": "unauth", "status": "fail"}); return True
        c = db.connect()
        rows = c.execute("SELECT * FROM invites WHERE user_id=?", (u["id"],)).fetchall()

        invite_count = c.execute("SELECT COUNT(*) AS n FROM users WHERE inviter_id=?", (u["id"],)).fetchone()["n"] or 0

        k = u.keys()
        bal = (u["commission_balance"] if "commission_balance" in k else 0) or 0
        tot = (u["commission_total"] if "commission_total" in k else 0) or 0
        c.close()
        ctx["send"]({"data": {
            "codes": [{"code": r["code"], "user_id": r["user_id"], "pv": r["pv"],
                       "status": r["status"], "created_at": r["created_at"],
                       "updated_at": r["created_at"]} for r in rows],
            "stat": [invite_count, 0, tot // 100, RATE],
            "balance": bal // 100
        }, "error": None, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/invite/save" and m == "GET":
        u = db.user_by_token(ctx["token"])
        if not u:
            ctx["send"]({"data": None, "message": "unauth", "status": "fail"}); return True
        code = secrets.token_hex(4).upper()
        c = db.connect()
        c.execute("INSERT INTO invites(code,user_id,created_at) VALUES(?,?,?)", (code, u["id"], int(time.time())))
        c.commit(); c.close()
        ctx["send"]({"data": code, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/invite/customers" and m == "GET":
        u = db.user_by_token(ctx["token"])
        if not u:
            ctx["send"]({"data": None, "message": "unauth", "status": "fail"}); return True
        c = db.connect()
        rows = c.execute("""SELECT id,email,nickname,short_id,created_at
                            FROM users WHERE inviter_id=? ORDER BY created_at DESC""", (u["id"],)).fetchall()
        out = []
        for r in rows:
            o = c.execute("""SELECT COALESCE(SUM(total_amount),0) AS s FROM orders
                             WHERE user_id=? AND status=1""", (r["id"],)).fetchone()
            charge = o["s"] or 0
            out.append({
                "nickname": r["nickname"] or ("用户" + str(r["short_id"] or r["id"])),
                "short_id": r["short_id"] or r["id"],
                "created_at": r["created_at"],
                "charge": charge,              # 分
                "commission": int(charge * RATE // 100),  # 分
            })
        c.close()
        ctx["send"]({"data": {"list": out, "rate": RATE}, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/ticket/fetch" and m == "GET":
        tid = ctx["query"].get("id")
        if tid:
            ctx["send"]({"data": None, "message": "", "status": "success"}); return True
        ctx["send"]({"data": [], "message": "", "status": "success"}); return True

    if p.startswith("/api/v1/user/ticket/") and m == "POST":
        ctx["send"]({"data": None, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/ip" and m == "GET":
        import urllib.request, json as _json
        h = ctx.get("headers") or {}
        ip = (h.get("x-real-ip") or "").split(",")[0].strip()
        if not ip:
            ip = (h.get("x-forwarded-for") or "").split(",")[0].strip()
        if not ip:
            ctx["send"]({"data": {"ip": ""}, "message": "无法获取 IP", "status": "fail"}); return True
        try:
            url = "http://ip-api.com/json/" + ip + "?lang=zh-CN&fields=status,message,country,regionName,city,isp,org,as,query,mobile,proxy,hosting"
            with urllib.request.urlopen(url, timeout=6) as resp:
                info = _json.loads(resp.read().decode("utf-8", "ignore"))
        except Exception as e:
            ctx["send"]({"data": {"ip": ip}, "message": "查询失败：" + str(e), "status": "fail"}); return True
        if info.get("status") != "success":
            ctx["send"]({"data": {"ip": ip}, "message": info.get("message") or "查询失败", "status": "fail"}); return True
        ctx["send"]({"data": {
            "ip": info.get("query") or ip,
            "country": info.get("country") or "",
            "region": info.get("regionName") or "",
            "city": info.get("city") or "",
            "isp": info.get("isp") or "",
            "org": info.get("org") or "",
            "as": info.get("as") or "",
            "mobile": bool(info.get("mobile")),
            "proxy": bool(info.get("proxy")),
            "hosting": bool(info.get("hosting")),
        }, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/byshortid" and m == "GET":
        sid = ctx["query"].get("sid", "").strip()
        if not sid.isdigit():
            ctx["send"]({"data": None, "message": "参数错误", "status": "fail"}); return True
        c = db.connect()
        r = c.execute("SELECT id,email,nickname,short_id FROM users WHERE short_id=?", (int(sid),)).fetchone()
        c.close()
        if not r:
            ctx["send"]({"data": None, "message": "用户不存在", "status": "fail"}); return True
        ctx["send"]({"data": {"id": r["id"], "email": r["email"],
                              "nickname": r["nickname"] or "", "short_id": r["short_id"]},
                     "message": "", "status": "success"}); return True

    if p == "/api/v1/user/add_traffic" and m == "POST":
        sid = str(ctx["body"].get("sid", "")).strip()
        mb = int(ctx["body"].get("mb", 0))
        secret = ctx["body"].get("secret", "")
        if secret != "lynli_bot_2026":
            ctx["send"]({"data": None, "message": "unauth", "status": "fail"}); return True
        if not sid.isdigit() or mb <= 0:
            ctx["send"]({"data": None, "message": "参数错误", "status": "fail"}); return True
        c = db.connect()
        r = c.execute("SELECT id,transfer_enable FROM users WHERE short_id=?", (int(sid),)).fetchone()
        if not r:
            c.close(); ctx["send"]({"data": None, "message": "用户不存在", "status": "fail"}); return True
        add_bytes = mb * 1024 * 1024
        new_total = (r["transfer_enable"] or 0) + add_bytes
        c.execute("UPDATE users SET transfer_enable=? WHERE id=?", (new_total, r["id"]))
        c.commit(); c.close()
        ctx["send"]({"data": {"new_total": new_total}, "message": "", "status": "success"}); return True

    return False
