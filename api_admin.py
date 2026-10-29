import time, secrets, hashlib, random, json
import config
import db

_admin_tokens = {}   # token -> {"id":..,"email":..,"role":..,"expire":..}
TOKEN_TTL = 86400
_captchas = {}

# 权限矩阵：路径前缀 → 允许角色
ROLE_PERMS = [
    # 超管专属
    ("/api/v1/admin/admins",           {"super"}),
    ("/api/v1/admin/payment_configs",  {"super"}),
    # 客服可访问
    ("/api/v1/admin/ticket",           {"super","operator","service"}),
    ("/api/v1/admin/tickets",          {"super","operator","service"}),
    ("/api/v1/admin/chat",             {"super","operator","service"}),
    # 其余默认运营及以上
]

def _captcha_gen():
    cid = secrets.token_hex(8)
    code = "".join(str(random.randint(0,9)) for _ in range(4))
    _captchas[cid] = (code, time.time()+300)
    return cid, code

def _captcha_verify(cid, code):
    if not cid or not code: return False
    v = _captchas.pop(cid, None)
    if not v: return False
    real, exp = v
    return time.time() < exp and real == code.strip()

def _check_admin(ctx):
    t = ctx["token"]
    if not t: return None
    if t.startswith("local_"):
        return {"id": 0, "email": "local", "role": "super"}
    info = _admin_tokens.get(t)
    if not info: return None
    if time.time() > info["expire"]:
        _admin_tokens.pop(t, None)
        return None
    return info


def _can_access(admin, path):
    # 找匹配的规则（最长的优先）
    role = (admin or {}).get("role") or "service"
    best = None
    for prefix, roles in ROLE_PERMS:
        if path.startswith(prefix):
            if best is None or len(prefix) > len(best[0]):
                best = (prefix, roles)
    if best is None:
        # 未列出的路径：super / operator 可访问，service 不行
        return role in ("super", "operator")
    return role in best[1]

def _log(c, admin, action, target, detail, ctx=None):
    try:
        ip = ""
        ua = ""
        if ctx:
            h = ctx.get("headers") or {}
            ip = (h.get("x-real-ip") or h.get("x-forwarded-for") or "").split(",")[0].strip()
            ua = h.get("user-agent") or ""
        c.execute("INSERT INTO admin_logs(admin,action,target,detail,ip,ua,created_at) VALUES(?,?,?,?,?,?,?)",
                  (admin, action, target or "", detail or "", ip, ua, int(time.time())))
    except Exception:
        pass

def _get_server(server_id=None):
    c = db.connect()
    try:
        if server_id:
            r = c.execute("SELECT * FROM servers WHERE id=?", (server_id,)).fetchone()
        else:
            r = c.execute("SELECT * FROM servers WHERE enabled=1 ORDER BY sort, id LIMIT 1").fetchone()
        return dict(r) if r else None
    finally:
        c.close()


def handle(ctx):
    p, m = ctx["path"], ctx["method"]
    if not (p.startswith("/api/v1/admin/") or p.startswith("/api/v1/activity/")):
        return False

    # 验证码 / 登录（不需要 token）
    if p == "/api/v1/admin/captcha" and m == "GET":
        cid, code = _captcha_gen()
        ctx["send"]({"code":1, "data":{"captcha_id": cid, "captcha": code}}); return True
    if p == "/api/v1/admin/login" and m == "POST":
        b = ctx["body"]
        c = db.connect()
        u = c.execute("SELECT * FROM admins WHERE email=?", ((b.get("email") or "").lower(),)).fetchone()
        c.close()
        if not u or u["password"] != db.hash_pw(b.get("password") or ""):
            ctx["send"]({"code":0, "msg":"账号或密码错误"}, 401); return True
        tok = db.new_token()
        _admin_tokens[tok] = {
            "id": u["id"],
            "email": u["email"],
            "role": u["role"] if "role" in u.keys() else "super",
            "expire": time.time() + TOKEN_TTL
        }
        ctx["send"]({"code":1, "data":{
            "token": tok,
            "email": u["email"],
            "role": u["role"] if "role" in u.keys() else "super"
        }}); return True

    if p == "/api/v1/activity/current":
        c = db.connect()
        bot = ctx["query"].get("bot", "")
        row = c.execute("SELECT * FROM activities WHERE bot=? AND enabled=1 LIMIT 1", (bot,)).fetchone()
        c.close()
        ctx["send"]({"code": 1, "data": dict(row) if row else None}); return True

    _admin = _check_admin(ctx)
    if not _admin:
        ctx["send"]({"code":0, "msg":"unauthorized"}, 401); return True
    if not _can_access(_admin, p):
        ctx["send"]({"code":0, "msg":"无权限（当前角色：" + str(_admin.get("role")) + "）"}, 403); return True
    ctx["admin"] = _admin

    c = db.connect()
    b = ctx["body"] or {}
    admin_email = "local"

    # ============ Upload ============
    if p == "/api/v1/admin/upload" and m == "POST":
        import base64 as _b64, uuid as _uuid, os as _os, time as _tm
        import api_upload as _up
        name = b.get("name") or b.get("filename") or "file"
        data = b.get("data") or b.get("content") or ""
        ext = _os.path.splitext(name)[1].lower() or ".bin"
        if ext not in (".jpg",".jpeg",".png",".gif",".webp",".mp4",".mov",".webm",".mkv"):
            ctx["send"]({"code":0,"msg":"不支持的格式"}); return True
        raw = data.split(",",1)[1] if "," in data and "base64" in data.split(",",1)[0] else data
        try:
            blob = _b64.b64decode(raw)
        except Exception:
            ctx["send"]({"code":0,"msg":"base64 解码失败"}); return True
        if len(blob) > 50*1024*1024:
            ctx["send"]({"code":0,"msg":"文件超过 50MB"}); return True
        key = "uploads/" + _tm.strftime("%Y%m") + "/" + _uuid.uuid4().hex + ext
        try:
            _up._get_bucket().put_object(key, blob, headers={"Content-Disposition": "inline"})
        except Exception as e:
            c.close()
            ctx["send"]({"code":0,"msg":"oss error: " + str(e)[:120]}, 500); return True
        url = "http://img.yisoujiasu.de5.net/%s" % key
        c.close()
        ctx["send"]({"code":1, "data":{"url": url}, "url": url}); return True

    # ============ Dashboard ============
    if p == "/api/v1/admin/dashboard":
        now = int(time.time()); t0 = now - now % 86400
        total_users = c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        today_users = c.execute("SELECT COUNT(*) FROM users WHERE created_at>=?", (t0,)).fetchone()[0]
        total_orders = c.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        today_orders = c.execute("SELECT COUNT(*) FROM orders WHERE created_at>=?", (t0,)).fetchone()[0]
        sum_all = c.execute("SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status=1").fetchone()[0]
        sum_today = c.execute("SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status=1 AND created_at>=?", (t0,)).fetchone()[0]
        usdt_all = c.execute("SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status=1 AND method='usdt'").fetchone()[0]
        alipay_all = c.execute("SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status=1 AND method='alipay'").fetchone()[0]
        usdt_today = c.execute("SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status=1 AND method='usdt' AND created_at>=?", (t0,)).fetchone()[0]
        alipay_today = c.execute("SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status=1 AND method='alipay' AND created_at>=?", (t0,)).fetchone()[0]
        pending_withdraw = c.execute("SELECT COUNT(*) FROM withdrawals WHERE status=0").fetchone()[0]
        c.close()
        ctx["send"]({"code":1, "data":{
            "total_users": total_users, "today_users": today_users,
            "total_downloads": 0, "today_downloads": 0,
            "total_orders": total_orders, "today_orders": today_orders,
            "today_usdt": usdt_today, "today_alipay": alipay_today,
            "all_usdt": usdt_all, "all_alipay": alipay_all,
            "today_income": sum_today, "total_income": sum_all,
            "pending_withdraw": pending_withdraw
        }}); return True

    # ============ Todo ============
    if p == "/api/v1/admin/todo":
        pending_w = c.execute("SELECT COUNT(*) FROM withdrawals WHERE status=0").fetchone()[0]
        expiring  = c.execute("SELECT COUNT(*) FROM users WHERE expired_at>0 AND expired_at<?", (int(time.time())+3*86400,)).fetchone()[0]
        pending_o = c.execute("SELECT COUNT(*) FROM orders WHERE status=0 AND created_at<?", (int(time.time())-600,)).fetchone()[0]
        pending_t = c.execute("SELECT COUNT(*) FROM tickets WHERE status=1").fetchone()[0]
        c.close()
        ctx["send"]({"code": 1, "data": {
            "pending_withdraw": pending_w,
            "pending_ticket": pending_t,
            "pending_orders": pending_o,
            "expiring_users": expiring
        }}); return True

    # ============ Stats Trend ============
    if p == "/api/v1/admin/stats/trend" and m == "GET":
        days = int(ctx["query"].get("days") or 30)
        now = int(time.time())
        out = []
        for i in range(days - 1, -1, -1):
            day_start = now - (now % 86400) - i * 86400
            day_end = day_start + 86400
            u = c.execute("SELECT COUNT(*) FROM users WHERE created_at>=? AND created_at<?", (day_start, day_end)).fetchone()[0]
            o = c.execute("SELECT COUNT(*) FROM orders WHERE created_at>=? AND created_at<?", (day_start, day_end)).fetchone()[0]
            paid = c.execute("SELECT COUNT(*), COALESCE(SUM(total_amount),0) FROM orders WHERE status=1 AND created_at>=? AND created_at<?", (day_start, day_end)).fetchone()
            out.append({
                "date": time.strftime("%m-%d", time.localtime(day_start)),
                "users": u,
                "orders": o,
                "paid_orders": paid[0],
                "income": paid[1] / 100.0
            })
        c.close(); ctx["send"]({"code": 1, "data": out}); return True

    if p == "/api/v1/admin/stats/overview" and m == "GET":
        now = int(time.time())
        t0 = now - now % 86400
        week_ago = t0 - 7 * 86400
        month_ago = t0 - 30 * 86400
        r = {}
        r["users_total"] = c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        r["users_week"] = c.execute("SELECT COUNT(*) FROM users WHERE created_at>=?", (week_ago,)).fetchone()[0]
        r["users_month"] = c.execute("SELECT COUNT(*) FROM users WHERE created_at>=?", (month_ago,)).fetchone()[0]
        r["paid_users"] = c.execute("SELECT COUNT(DISTINCT user_id) FROM orders WHERE status=1").fetchone()[0]
        r["orders_total"] = c.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        r["orders_today"] = c.execute("SELECT COUNT(*) FROM orders WHERE created_at>=?", (t0,)).fetchone()[0]
        r["income_total"] = c.execute("SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status=1").fetchone()[0] / 100.0
        r["income_month"] = c.execute("SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status=1 AND created_at>=?", (month_ago,)).fetchone()[0] / 100.0
        r["income_today"] = c.execute("SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status=1 AND created_at>=?", (t0,)).fetchone()[0] / 100.0

        # ===== 深度指标 =====
        total_u = r["users_total"] or 0
        paid_u = r["paid_users"] or 0
        income_t = r["income_total"] or 0.0

        # 付费转化率
        r["conversion_rate"] = round((paid_u / total_u * 100) if total_u else 0, 2)
        # ARPU（人均收入）/ ARPPU（付费用户人均）
        r["arpu"]  = round((income_t / total_u) if total_u else 0, 2)
        r["arppu"] = round((income_t / paid_u) if paid_u else 0, 2)

        # 复购率：付费>=2 单的用户 / 付费用户
        repeat_u = c.execute(
            "SELECT COUNT(*) FROM (SELECT user_id FROM orders WHERE status=1 GROUP BY user_id HAVING COUNT(*)>=2)"
        ).fetchone()[0]
        r["repeat_users"] = repeat_u
        r["repeat_rate"]  = round((repeat_u / paid_u * 100) if paid_u else 0, 2)

        # 7 日留存：7 天前注册的用户中，7 天内下过单/开过会员的比例
        day7_ago_start = t0 - 7 * 86400
        day14_ago_start = t0 - 14 * 86400
        cohort_total = c.execute(
            "SELECT COUNT(*) FROM users WHERE created_at>=? AND created_at<?", (day14_ago_start, day7_ago_start)
        ).fetchone()[0]
        cohort_active = c.execute(
            "SELECT COUNT(DISTINCT o.user_id) FROM orders o JOIN users u ON u.id=o.user_id "
            "WHERE u.created_at>=? AND u.created_at<? AND o.created_at>=? AND o.status=1",
            (day14_ago_start, day7_ago_start, day7_ago_start)
        ).fetchone()[0]
        r["cohort_7d"]  = cohort_total
        r["retention_7d"] = round((cohort_active / cohort_total * 100) if cohort_total else 0, 2)

        # 渠道来源：邀请 vs 自然
        invited_u = c.execute("SELECT COUNT(*) FROM users WHERE inviter_id>0").fetchone()[0]
        r["invited_users"] = invited_u
        r["organic_users"] = max(0, total_u - invited_u)
        r["invite_ratio"]  = round((invited_u / total_u * 100) if total_u else 0, 2)

        c.close(); ctx["send"]({"code": 1, "data": r}); return True

    # ============ 邀请树 ============
    if p == "/api/v1/admin/invites/tree" and m == "GET":
        root_id = ctx["query"].get("id")
        def _node(uid, depth=0):
            if depth > 3: return None
            u = c.execute("SELECT id,email,nickname,avatar,short_id,created_at,expired_at,commission_total FROM users WHERE id=?", (uid,)).fetchone()
            if not u: return None
            kids = c.execute("SELECT id FROM users WHERE inviter_id=?", (uid,)).fetchall()
            return {
                "id": u["id"], "email": u["email"], "nickname": u["nickname"],
                "avatar": u["avatar"] or "",
                "short_id": u["short_id"], "created_at": u["created_at"],
                "expired_at": u["expired_at"], "commission_total": u["commission_total"] or 0,
                "children": [k for k in (_node(x["id"], depth+1) for x in kids) if k]
            }
        if root_id:
            n = _node(int(root_id))
            c.close(); ctx["send"]({"code": 1, "data": n}); return True
        # 没传 id：找所有顶层邀请人（有 inviter_id 的反面 —— 没被邀请但邀请过人的）
        tops = c.execute(
            "SELECT DISTINCT u.id FROM users u WHERE u.id IN (SELECT inviter_id FROM users WHERE inviter_id>0) AND (u.inviter_id=0 OR u.inviter_id IS NULL) ORDER BY u.id DESC LIMIT 100"
        ).fetchall()
        trees = [n for n in (_node(t["id"]) for t in tops) if n]
        c.close(); ctx["send"]({"code": 1, "data": trees}); return True

    # ============ 用户设备 ============
    if p == "/api/v1/admin/users/devices" and m == "GET":
        uid = ctx["query"].get("id")
        if not uid:
            c.close(); ctx["send"]({"code": 0, "msg": "缺少 id"}); return True
        rows = c.execute("SELECT token,ua,ip,created_at,last_used_at FROM user_tokens WHERE user_id=? ORDER BY last_used_at DESC", (uid,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["token_short"] = (d["token"] or "")[:12] + "..."
            d.pop("token", None)
            out.append(d)
        c.close(); ctx["send"]({"code": 1, "data": out}); return True

    if p == "/api/v1/admin/users/kick" and m == "POST":
        uid = b.get("id")
        tok_short = (b.get("token_short") or "").replace("...", "")
        if not uid or not tok_short:
            c.close(); ctx["send"]({"code": 0, "msg": "参数缺失"}); return True
        rows = c.execute("SELECT token FROM user_tokens WHERE user_id=?", (uid,)).fetchall()
        kicked = 0
        for r in rows:
            if (r["token"] or "").startswith(tok_short):
                c.execute("DELETE FROM user_tokens WHERE token=?", (r["token"],))
                kicked += 1
        _log(c, admin_email, "kick_device", f"user#{uid}", tok_short, ctx)
        c.commit(); c.close()
        ctx["send"]({"code": 1, "data": {"kicked": kicked}}); return True

    if p == "/api/v1/admin/users/kick_all" and m == "POST":
        uid = b.get("id")
        if not uid:
            c.close(); ctx["send"]({"code": 0, "msg": "缺少 id"}); return True
        c.execute("DELETE FROM user_tokens WHERE user_id=?", (uid,))
        c.execute("UPDATE users SET token='' WHERE id=?", (uid,))
        _log(c, admin_email, "kick_all", f"user#{uid}", "", ctx)
        c.commit(); c.close(); ctx["send"]({"code": 1}); return True

    # ============ 邮件模板 ============
    if p == "/api/v1/admin/mail/templates" and m == "GET":
        rows = c.execute("SELECT key,name,subject,body,updated_at FROM mail_templates ORDER BY updated_at DESC, key").fetchall()
        c.close(); ctx["send"]({"code": 1, "data": [dict(r) for r in rows]}); return True

    if p == "/api/v1/admin/mail/templates/save" and m == "POST":
        key = (b.get("key") or "").strip()
        name = (b.get("name") or "").strip()
        subject = (b.get("subject") or "").strip()
        body = (b.get("body") or "").strip()
        if not key or not subject:
            c.close(); ctx["send"]({"code": 0, "msg": "key 和主题必填"}); return True
        c.execute("INSERT INTO mail_templates(key,name,subject,body,updated_at) VALUES(?,?,?,?,?) "
                  "ON CONFLICT(key) DO UPDATE SET name=excluded.name, subject=excluded.subject, body=excluded.body, updated_at=excluded.updated_at",
                  (key, name, subject, body, int(time.time())))
        _log(c, admin_email, "template_save", key, subject[:40], ctx)
        c.commit(); c.close(); ctx["send"]({"code": 1}); return True

    if p == "/api/v1/admin/mail/templates/delete" and m == "POST":
        key = (b.get("key") or "").strip()
        if not key:
            c.close(); ctx["send"]({"code": 0, "msg": "缺少 key"}); return True
        c.execute("DELETE FROM mail_templates WHERE key=?", (key,))
        _log(c, admin_email, "template_del", key, "", ctx)
        c.commit(); c.close(); ctx["send"]({"code": 1}); return True

    # ============ 邮件群发 ============
    if p == "/api/v1/admin/mail/send" and m == "POST":
        import email_sender, threading
        subject = (b.get("subject") or "").strip()
        html_body = (b.get("body") or "").strip()
        target = (b.get("target") or "all").strip()
        user_ids = b.get("user_ids") or []
        if not subject or not html_body:
            c.close(); ctx["send"]({"code": 0, "msg": "标题和内容不能为空"}); return True
        if target == "ids" and user_ids:
            placeholders = ",".join("?" * len(user_ids))
            rows = c.execute("SELECT id,email FROM users WHERE id IN (" + placeholders + ")", user_ids).fetchall()
        elif target == "paid":
            rows = c.execute("SELECT DISTINCT u.id,u.email FROM users u JOIN orders o ON o.user_id=u.id WHERE o.status=1").fetchall()
        elif target == "expiring":
            now_ts = int(time.time())
            rows = c.execute("SELECT id,email FROM users WHERE expired_at>0 AND expired_at<? AND expired_at>?", (now_ts+7*86400, now_ts)).fetchall()
        else:
            rows = c.execute("SELECT id,email FROM users").fetchall()
        c.close()
        emails = [r["email"] for r in rows if r["email"]]
        ctx["send"]({"code": 1, "data": {"queued": len(emails)}})
        def _worker():
            ok = 0; fail = 0
            for e in emails:
                try:
                    email_sender.send_custom_mail(e, subject, html_body); ok += 1
                except Exception:
                    fail += 1
                time.sleep(0.3)
            print("[mail] 群发完成 ok=" + str(ok) + " fail=" + str(fail), flush=True)
        threading.Thread(target=_worker, daemon=True).start()
        return True

    if p == "/api/v1/admin/login_logs" and m == "GET":
        uid = ctx["query"].get("id")
        if uid:
            rows = c.execute("SELECT * FROM login_logs WHERE user_id=? ORDER BY id DESC LIMIT 100", (uid,)).fetchall()
        else:
            rows = c.execute("SELECT * FROM login_logs ORDER BY id DESC LIMIT 200").fetchall()
        c.close(); ctx["send"]({"code": 1, "data": [dict(r) for r in rows]}); return True

    # ============ Settings ============
    if p == "/api/v1/admin/settings" and m == "GET":
        rows = c.execute("SELECT key, value FROM settings").fetchall()
        c.close()
        d = {r["key"]: (r["value"] or "") for r in rows}
        ctx["send"]({"code": 1, "data": d}); return True

    if p == "/api/v1/admin/settings" and m == "POST":
        items = b.get("items") or {}
        if not isinstance(items, dict) or not items:
            c.close(); ctx["send"]({"code": 0, "msg": "无数据"}); return True
        now = int(time.time())
        for k, v in items.items():
            if not isinstance(k, str) or len(k) > 64:
                continue
            c.execute(
                "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                (k, str(v)[:2000], now)
            )
        _log(c, admin_email, "settings_update", str(len(items)) + "项", "", ctx)
        c.commit(); c.close()
        ctx["send"]({"code": 1}); return True

    # ============ Users ============
    if p == "/api/v1/admin/users":
        rows = c.execute("SELECT id,email,uuid,plan_id,expired_at,transfer_enable,u,d,created_at,banned,sub_token,short_id,nickname,avatar,real_name,usdt_addr,alipay,wallet_status,tag FROM users ORDER BY id DESC").fetchall()
        c.close(); ctx["send"]({"code":1, "data":[dict(r) for r in rows]}); return True
    if p == "/api/v1/admin/users/batch" and m == "POST":
        ids = b.get("ids") or []
        action = b.get("action") or ""
        days = int(b.get("days") or 0)
        plan_id = int(b.get("plan_id") or 0)
        if not isinstance(ids, list) or not ids:
            c.close(); ctx["send"]({"code":0, "msg":"未选择用户"}); return True
        if action not in ("add_days", "reset_traffic", "ban", "unban", "delete", "grant"):
            c.close(); ctx["send"]({"code":0, "msg":"未知操作"}); return True
        now = int(time.time())
        done = 0
        for uid in ids:
            try:
                uid = int(uid)
                if action == "add_days":
                    u = c.execute("SELECT expired_at FROM users WHERE id=?", (uid,)).fetchone()
                    if u:
                        base = max(u["expired_at"] or 0, now)
                        c.execute("UPDATE users SET expired_at=? WHERE id=?", (base + days*86400, uid))
                        done += 1
                elif action == "reset_traffic":
                    c.execute("UPDATE users SET u=0, d=0 WHERE id=?", (uid,))
                    done += 1
                elif action == "ban":
                    c.execute("UPDATE users SET banned=1 WHERE id=?", (uid,))
                    done += 1
                elif action == "unban":
                    c.execute("UPDATE users SET banned=0 WHERE id=?", (uid,))
                    done += 1
                elif action == "delete":
                    c.execute("DELETE FROM users WHERE id=?", (uid,))
                    done += 1
                elif action == "grant":
                    if plan_id and days > 0:
                        u = c.execute("SELECT expired_at FROM users WHERE id=?", (uid,)).fetchone()
                        if u:
                            base = max(u["expired_at"] or 0, now)
                            c.execute("UPDATE users SET plan_id=?, expired_at=? WHERE id=?", (plan_id, base + days*86400, uid))
                            done += 1
            except Exception:
                pass
        _log(c, "admin", "batch_" + action, str(len(ids)) + "人", str(done) + "成功")
        c.commit(); c.close()
        ctx["send"]({"code":1, "data":{"done": done, "total": len(ids)}}); return True

    if p == "/api/v1/admin/users/detail" and m == "GET":
        uid = ctx["query"].get("id")
        if not uid:
            c.close(); ctx["send"]({"code":0, "msg":"缺少 id"}); return True
        r = c.execute("SELECT id,email,uuid,plan_id,expired_at,transfer_enable,u,d,created_at,banned,sub_token,short_id,nickname,avatar,real_name,usdt_addr,alipay,wallet_status,tag FROM users WHERE id=?", (uid,)).fetchone()
        if not r:
            c.close(); ctx["send"]({"code":0, "msg":"用户不存在"}); return True
        ud = dict(r)
        try:
            orders = c.execute("SELECT trade_no,plan_id,period,total_amount,status,created_at,method FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 30", (uid,)).fetchall()
            ud["orders"] = [dict(x) for x in orders]
        except Exception:
            ud["orders"] = []
        try:
            tks = c.execute("SELECT id,status,handoff,created_at,updated_at,category,priority,subject FROM tickets WHERE user_id=? ORDER BY id DESC LIMIT 20", (uid,)).fetchall()
            ud["tickets"] = [dict(x) for x in tks]
        except Exception:
            ud["tickets"] = []
        try:
            logs = c.execute("SELECT id,admin,action,target,detail,created_at,ip FROM admin_logs WHERE target LIKE ? ORDER BY id DESC LIMIT 30", ("user#"+str(uid)+"%",)).fetchall()
            ud["logs"] = [dict(x) for x in logs]
        except Exception:
            ud["logs"] = []
        c.close()
        ctx["send"]({"code":1, "data": ud}); return True

    if p == "/api/v1/admin/users/grant" and m == "POST":
        uid, pid, days = b.get("id"), b.get("plan_id"), int(b.get("days") or 0)
        u = c.execute("SELECT expired_at FROM users WHERE id=?", (uid,)).fetchone()
        base = max(u["expired_at"] or 0, int(time.time()))
        new_exp = base + days*86400
        c.execute("UPDATE users SET plan_id=?, expired_at=? WHERE id=?", (pid, new_exp, uid))
        _log(c, admin_email, "grant", f"user#{uid}", f"plan#{pid} +{days}天", ctx)
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/users/add-days" and m == "POST":
        uid, days = b.get("id"), int(b.get("days") or 0)
        u = c.execute("SELECT expired_at FROM users WHERE id=?", (uid,)).fetchone()
        base = max(u["expired_at"] or 0, int(time.time()))
        c.execute("UPDATE users SET expired_at=? WHERE id=?", (base+days*86400, uid))
        _log(c, admin_email, "add_days", f"user#{uid}", f"+{days}天", ctx)
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/users/reset-traffic" and m == "POST":
        c.execute("UPDATE users SET u=0, d=0 WHERE id=?", (b.get("id"),))
        _log(c, admin_email, "reset", f"user#{b.get('id', ctx)}", "重置流量")
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/users/ban" and m == "POST":
        c.execute("UPDATE users SET banned=? WHERE id=?", (1 if b.get("banned") else 0, b.get("id")))
        _log(c, admin_email, "ban" if b.get("banned", ctx) else "unban", f"user#{b.get('id')}", "")
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/users/delete" and m == "POST":
        c.execute("DELETE FROM users WHERE id=?", (b.get("id"),))
        _log(c, admin_email, "delete_user", f"user#{b.get('id', ctx)}", "")
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/users/update" and m == "POST":
        uid = b.get("id")
        email_v = (b.get("email") or "").lower()
        if email_v:
            c.execute("UPDATE users SET email=? WHERE id=?", (email_v, uid))
        if b.get("nickname") is not None:
            c.execute("UPDATE users SET nickname=? WHERE id=?", (b.get("nickname") or "", uid))
        sid_v = b.get("short_id")
        if sid_v is not None and str(sid_v).strip():
            try:
                sid_int = int(sid_v)
                exist = c.execute("SELECT id FROM users WHERE short_id=? AND id!=?", (sid_int, uid)).fetchone()
                if exist:
                    c.close(); ctx["send"]({"code":0, "msg":"该数字ID已被占用"}); return True
                c.execute("UPDATE users SET short_id=? WHERE id=?", (sid_int, uid))
            except Exception:
                pass
        if b.get("password"):
            c.execute("UPDATE users SET password=? WHERE id=?", (db.hash_pw(b["password"]), uid))
        _log(c, admin_email, "update_user", f"user#{uid}", "", ctx)
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    if p == "/api/v1/admin/users/tag" and m == "POST":
        uid = b.get("id")
        tag = (b.get("tag") or "").strip()[:32]
        if not uid:
            c.close(); ctx["send"]({"code":0, "msg":"缺少 id"}); return True
        c.execute("UPDATE users SET tag=? WHERE id=?", (tag, uid))
        _log(c, admin_email, "set_tag", f"user#{uid}", tag or "(清空)", ctx)
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    if p == "/api/v1/admin/users/batch_tag" and m == "POST":
        ids = b.get("ids") or []
        tag = (b.get("tag") or "").strip()[:32]
        if not isinstance(ids, list) or not ids:
            c.close(); ctx["send"]({"code":0, "msg":"未选择用户"}); return True
        done = 0
        for uid in ids:
            try:
                c.execute("UPDATE users SET tag=? WHERE id=?", (tag, int(uid)))
                done += 1
            except Exception:
                pass
        _log(c, admin_email, "batch_tag", f"{len(ids)}人", f"{tag} ({done}成功)", ctx)
        c.commit(); c.close(); ctx["send"]({"code":1, "data":{"done": done}}); return True

    if p == "/api/v1/admin/users/sub_token" and m == "POST":
        uid = b.get("id")
        import secrets as _s
        tok = _s.token_urlsafe(16)
        c.execute("UPDATE users SET sub_token=? WHERE id=?", (tok, uid))
        c.commit(); c.close()
        ctx["send"]({"code": 1, "data": {"sub_token": tok}}); return True

    # ============ Plans ============
    if p == "/api/v1/admin/plans" and m == "GET":
        rows = c.execute("SELECT * FROM plans ORDER BY sort").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try: d["features"] = json.loads(d.get("features") or "[]")
            except: d["features"] = []
            out.append(d)
        c.close(); ctx["send"]({"code":1, "data": out}); return True
    if p == "/api/v1/admin/plans" and m == "POST":
        pid = b.get("id")
        fields = ("name","content","transfer_enable","month_price","quarter_price",
                  "half_year_price","year_price","sort","show","type","product_type","tagline","speed","hot","features")
        vals = []
        for f in fields:
            v = b.get(f)
            if f == "features" and isinstance(v, list):
                v = json.dumps(v, ensure_ascii=False)
            vals.append(v)
        if pid:
            c.execute("UPDATE plans SET name=?,content=?,transfer_enable=?,month_price=?,quarter_price=?,"
                      "half_year_price=?,year_price=?,sort=?,show=?,type=?,product_type=?,tagline=?,speed=?,hot=?,features=? WHERE id=?",
                      vals + [pid])
        else:
            c.execute("INSERT INTO plans(name,content,transfer_enable,month_price,quarter_price,"
                      "half_year_price,year_price,sort,show,type,product_type,tagline,speed,hot,features) "
                      "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", vals)
        _log(c, admin_email, "plan", f"plan#{pid or 'new'}", b.get("name","", ctx))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/plans/delete" and m == "POST":
        c.execute("DELETE FROM plans WHERE id=?", (b.get("id"),))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    # ============ Orders ============
    if p == "/api/v1/admin/orders":
        rows = c.execute("SELECT o.*, u.email AS user_email FROM orders o LEFT JOIN users u ON o.user_id=u.id ORDER BY o.created_at DESC LIMIT 500").fetchall()
        c.close(); ctx["send"]({"code":1, "data":[dict(r) for r in rows]}); return True
    if p == "/api/v1/admin/orders/mark-paid" and m == "POST":
        c.execute("UPDATE orders SET status=1 WHERE trade_no=?", (b.get("trade_no"),))
        _log(c, admin_email, "order_paid", b.get("trade_no","", ctx), "手动标记已付")
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/orders/refund" and m == "POST":
        c.execute("UPDATE orders SET refunded=1,status=0 WHERE trade_no=?", (b.get("trade_no"),))
        _log(c, admin_email, "order_refund", b.get("trade_no","", ctx), "退款")
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/orders/void" and m == "POST":
        c.execute("DELETE FROM orders WHERE trade_no=?", (b.get("trade_no"),))
        _log(c, admin_email, "order_void", b.get("trade_no","", ctx), "作废")
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    # ============ Banners ============
    if p == "/api/v1/admin/banners" and m == "GET":
        rows = c.execute("SELECT * FROM banners ORDER BY sort").fetchall()
        c.close(); ctx["send"]({"code":1, "data":[dict(r) for r in rows]}); return True
    if p == "/api/v1/admin/banners" and m == "POST":
        bid = b.get("id")
        if bid:
            c.execute("UPDATE banners SET type=?,media=?,image_url=?,title=?,subtitle=?,link=?,sort=?,show=? WHERE id=?",
                (b.get("type","image"), b.get("media") or b.get("image_url",""), b.get("media") or b.get("image_url",""),
                 b.get("title",""), b.get("subtitle",""), b.get("link",""), b.get("sort") or 1, b.get("show") or 0, bid))
        else:
            c.execute("INSERT INTO banners(type,media,image_url,title,subtitle,link,sort,show) VALUES(?,?,?,?,?,?,?,?)",
                (b.get("type","image"), b.get("media") or b.get("image_url",""), b.get("media") or b.get("image_url",""),
                 b.get("title",""), b.get("subtitle",""), b.get("link",""), b.get("sort") or 1, b.get("show") or 0))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/banners/delete" and m == "POST":
        c.execute("DELETE FROM banners WHERE id=?", (b.get("id"),))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    # ============ Admins ============
    if p == "/api/v1/admin/admins" and m == "GET":
        rows = c.execute("SELECT id,email,role,created_at FROM admins ORDER BY id").fetchall()
        c.close(); ctx["send"]({"code":1, "data":[dict(r) for r in rows]}); return True
    if p == "/api/v1/admin/admins/save" and m == "POST":
        em = (b.get("email") or "").lower()
        pw = b.get("password") or ""
        if not em: ctx["send"]({"code":0,"msg":"邮箱必填"}); return True
        if b.get("id"):
            role = b.get("role") or "service"
            if role not in ("super","operator","service"): role = "service"
            if pw: c.execute("UPDATE admins SET email=?,password=?,role=? WHERE id=?", (em, db.hash_pw(pw), role, b["id"]))
            else: c.execute("UPDATE admins SET email=?,role=? WHERE id=?", (em, role, b["id"]))
        else:
            if not pw: ctx["send"]({"code":0,"msg":"密码必填"}); return True
            role = b.get("role") or "service"
            if role not in ("super","operator","service"): role = "service"
            c.execute("INSERT INTO admins(email,password,role,created_at) VALUES(?,?,?,?)", (em, db.hash_pw(pw), role, int(time.time())))
        _log(c, admin_email, "admin", em, "管理员变更", ctx)
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/admins/delete" and m == "POST":
        c.execute("DELETE FROM admins WHERE id=?", (b.get("id"),))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/admins/password" and m == "POST":
        c.execute("UPDATE admins SET password=? WHERE id=?", (db.hash_pw(b.get("password") or ""), b.get("id")))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    # ============ Invites ============
    if p == "/api/v1/admin/invites" and m == "GET":
        rows = c.execute("SELECT * FROM invites ORDER BY created_at DESC").fetchall()
        c.close(); ctx["send"]({"code":1, "data":[dict(r) for r in rows]}); return True
    if p == "/api/v1/admin/invites/set-rate" and m == "POST":
        c.execute("UPDATE invites SET rate=? WHERE id=?", (b.get("rate") or 15, b.get("id")))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    # ============ Withdrawals ============
    if p == "/api/v1/admin/wallet/review" and m == "POST":
        uid = b.get("id")
        st = int(b.get("status") or 0)
        c.execute("UPDATE users SET wallet_status=? WHERE id=?", (st, uid))
        _log(c, admin_email, "wallet_review", f"user#{uid}", "通过" if st==1 else "拒绝", ctx)
        c.commit(); c.close()
        ctx["send"]({"code": 1}); return True

    if p == "/api/v1/admin/withdrawals" and m == "GET":
        rows = c.execute("SELECT w.*, u.email FROM withdrawals w LEFT JOIN users u ON w.user_id=u.id ORDER BY w.created_at DESC").fetchall()
        c.close(); ctx["send"]({"code":1, "data":[dict(r) for r in rows]}); return True
    if p == "/api/v1/admin/withdrawals/review" and m == "POST":
        wid = b.get("id")
        new_st = int(b.get("status") or 0)
        wd = c.execute("SELECT * FROM withdrawals WHERE id=?", (wid,)).fetchone()
        if not wd:
            c.close(); ctx["send"]({"code": 0, "msg": "记录不存在"}); return True
        old_st = wd["status"] or 0
        # 如果从"待处理"变"已拒绝"→退回余额
        if old_st == 0 and new_st == 2:
            c.execute("UPDATE users SET commission_balance = COALESCE(commission_balance,0) + ? WHERE id=?",
                      (wd["amount"], wd["user_id"]))
            print("[withdraw] 拒绝 " + str(wid) + " 退回 " + str(wd["amount"]) + " 分给用户#" + str(wd["user_id"]), flush=True)
        c.execute("UPDATE withdrawals SET status=?, reviewed_at=?, notified=0 WHERE id=?", (new_st, int(time.time()), wid))
        _log(c, admin_email, "withdraw", f"wd#{wid}", "通过" if new_st==1 else "拒绝", ctx)
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    # ============ Notices ============
    if p == "/api/v1/admin/notices" and m == "GET":
        rows = c.execute("SELECT * FROM notices ORDER BY id DESC").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try:
                cnt = c.execute("SELECT COUNT(*) FROM notices_read WHERE notice_id=?", (r["id"],)).fetchone()[0]
                d["read_count"] = cnt
            except Exception:
                d["read_count"] = 0
            out.append(d)
        c.close(); ctx["send"]({"code":1, "data": out}); return True
    if p == "/api/v1/admin/notices" and m == "POST":
        nid = b.get("id")
        if nid:
            # 只传 id+status = toggle，不动其他字段
            if set(b.keys()) <= {"id", "status"}:
                c.execute("UPDATE notices SET status=? WHERE id=?", (b.get("status", 1), nid))
            else:
                c.execute("UPDATE notices SET type=?,title=?,content=?,start_at=?,end_at=?,status=?,pinned=?,display=?,target_plan=? WHERE id=?",
                    (b.get("type","normal"), b.get("title",""), b.get("content",""),
                     b.get("start_at") or 0, b.get("end_at") or 0, b.get("status",1),
                     b.get("pinned",0), b.get("display","banner"), b.get("target_plan",0), nid))
        else:
            c.execute("INSERT INTO notices(type,title,content,start_at,end_at,status,created_at,pinned,display,target_plan) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (b.get("type","normal"), b.get("title",""), b.get("content",""),
                 b.get("start_at") or 0, b.get("end_at") or 0, b.get("status",1), int(time.time()),
                 b.get("pinned",0), b.get("display","banner"), b.get("target_plan",0)))
        _log(c, admin_email, "notice", b.get("title","", ctx), "")
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/notices/delete" and m == "POST":
        c.execute("DELETE FROM notices WHERE id=?", (b.get("id"),))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    # ============ Activities ============
    if p == "/api/v1/admin/activities" and m == "GET":
        bot = ctx["query"].get("bot", "")
        if bot:
            rows = c.execute("SELECT * FROM activities WHERE bot=? ORDER BY id", (bot,)).fetchall()
        else:
            rows = c.execute("SELECT * FROM activities ORDER BY bot,id").fetchall()
        c.close(); ctx["send"]({"code": 1, "data": [dict(r) for r in rows]}); return True
    if p == "/api/v1/admin/activities" and m == "POST":
        aid = b.get("id")
        if aid:
            c.execute("UPDATE activities SET name=?,enabled=?,reward_gb=?,reward_days=?,"
                      "require_channel=?,channel_url=?,channel_id=?,once_per_user=?,updated_at=? WHERE id=?",
                (b.get("name",""), 1 if b.get("enabled") else 0, b.get("reward_gb") or 0, b.get("reward_days") or 0,
                 1 if b.get("require_channel") else 0, b.get("channel_url",""), b.get("channel_id",""),
                 1 if b.get("once_per_user") else 0, int(time.time()), aid))
        else:
            c.execute("INSERT INTO activities(bot,key,name,enabled,reward_gb,reward_days,require_channel,channel_url,channel_id,once_per_user,updated_at) "
                      "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (b.get("bot","safew"), b.get("key","new_user_trial"), b.get("name",""),
                 1 if b.get("enabled") else 0, b.get("reward_gb") or 0, b.get("reward_days") or 0,
                 1 if b.get("require_channel") else 0, b.get("channel_url",""), b.get("channel_id",""),
                 1 if b.get("once_per_user") else 0, int(time.time())))
        c.commit(); c.close(); ctx["send"]({"code": 1}); return True
    if p == "/api/v1/admin/activities/delete" and m == "POST":
        c.execute("DELETE FROM activities WHERE id=?", (b.get("id"),))
        c.commit(); c.close(); ctx["send"]({"code": 1}); return True

    # ============ Redeem Codes ============
    if p == "/api/v1/admin/redeem_codes" and m == "GET":
        rows = c.execute("SELECT * FROM redeem_codes ORDER BY id DESC LIMIT 500").fetchall()
        c.close(); ctx["send"]({"code": 1, "data": [dict(r) for r in rows]}); return True
    if p == "/api/v1/admin/redeem_codes" and m == "POST":
        import secrets as _sec
        count = int(b.get("count") or 1)
        prefix = (b.get("prefix") or "LYN").upper()
        gb = float(b.get("reward_gb") or 0)
        days = int(b.get("reward_days") or 0)
        limit = int(b.get("total_limit") or 0)
        expire_days = int(b.get("expire_days") or 0)
        expire_at = int(time.time() + expire_days * 86400) if expire_days else 0
        now = int(time.time())
        created = []
        for _ in range(count):
            code_str = prefix + "-" + _sec.token_hex(4).upper()
            c.execute(
                "INSERT INTO redeem_codes(code,reward_gb,reward_days,total_limit,used_count,enabled,expire_at,created_at) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (code_str, gb, days, limit, 0, 1, expire_at, now)
            )
            created.append(code_str)
        c.commit(); c.close()
        ctx["send"]({"code": 1, "data": {"codes": created}}); return True
    if p == "/api/v1/admin/redeem_codes/toggle" and m == "POST":
        c.execute("UPDATE redeem_codes SET enabled=? WHERE id=?", (1 if b.get("enabled") else 0, b.get("id")))
        c.commit(); c.close(); ctx["send"]({"code": 1}); return True
    if p == "/api/v1/admin/redeem_codes/delete" and m == "POST":
        c.execute("DELETE FROM redeem_codes WHERE id=?", (b.get("id"),))
        c.commit(); c.close(); ctx["send"]({"code": 1}); return True

    # ============ Payment Configs ============
    if p == "/api/v1/admin/payment_configs" and m == "GET":
        rows = c.execute("SELECT channel,enabled,cfg,updated_at FROM payment_configs").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try: d["cfg"] = json.loads(d.get("cfg") or "{}")
            except: d["cfg"] = {}
            out.append(d)
        c.close(); ctx["send"]({"code": 1, "data": out}); return True
    if p == "/api/v1/admin/payment_configs" and m == "POST":
        ch = b.get("channel")
        if not ch:
            c.close(); ctx["send"]({"code": 0, "msg": "缺 channel"}); return True
        new_cfg = b.get("cfg") or {}
        row = c.execute("SELECT cfg FROM payment_configs WHERE channel=?", (ch,)).fetchone()
        old = json.loads(row["cfg"] or "{}") if row else {}
        old.update(new_cfg)
        c.execute(
            "INSERT OR REPLACE INTO payment_configs(channel,enabled,cfg,updated_at) VALUES(?,?,?,?)",
            (ch, 1 if b.get("enabled") else 0, json.dumps(old, ensure_ascii=False), int(time.time()))
        )
        c.commit(); c.close(); ctx["send"]({"code": 1}); return True

    # ============ Coupons ============
    if p == "/api/v1/admin/coupons" and m == "GET":
        rows = c.execute("SELECT * FROM coupons ORDER BY id DESC").fetchall()
        c.close(); ctx["send"]({"code":1, "data":[dict(r) for r in rows]}); return True

    if p == "/api/v1/admin/coupons/save" and m == "POST":
        cid = b.get("id")
        code = (b.get("code") or "").strip().upper()
        tp = b.get("type") or "percent"
        if tp not in ("percent","fixed"): tp = "percent"
        val = int(b.get("value") or 0)
        min_amt = int(b.get("min_amount") or 0)
        max_u = int(b.get("max_uses") or 0)
        exp = int(b.get("expire_at") or 0)
        en = 1 if b.get("enabled", 1) else 0
        if not code:
            c.close(); ctx["send"]({"code":0,"msg":"优惠码不能为空"}); return True
        if val <= 0:
            c.close(); ctx["send"]({"code":0,"msg":"优惠值必须大于 0"}); return True
        try:
            if cid:
                c.execute("UPDATE coupons SET code=?,type=?,value=?,min_amount=?,max_uses=?,expire_at=?,enabled=? WHERE id=?",
                          (code, tp, val, min_amt, max_u, exp, en, cid))
            else:
                c.execute("INSERT INTO coupons(code,type,value,min_amount,max_uses,used,expire_at,enabled,created_at) VALUES(?,?,?,?,?,0,?,?,?)",
                          (code, tp, val, min_amt, max_u, exp, en, int(time.time())))
            c.commit(); c.close(); ctx["send"]({"code":1}); return True
        except Exception as e:
            c.close(); ctx["send"]({"code":0,"msg":"保存失败：" + str(e)}); return True

    if p == "/api/v1/admin/coupons/delete" and m == "POST":
        c.execute("DELETE FROM coupons WHERE id=?", (b.get("id"),))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    # ============ Logs ============
    if p == "/api/v1/admin/logs":
        rows = c.execute("SELECT * FROM admin_logs ORDER BY id DESC LIMIT 200").fetchall()
        c.close(); ctx["send"]({"code":1, "data":[dict(r) for r in rows]}); return True

    # ============ Nodes ============
    # ============ Servers ============
    if p == "/api/v1/admin/servers" and m == "GET":
        rows = c.execute("SELECT * FROM servers ORDER BY sort, id").fetchall()
        c.close(); ctx["send"]({"code":1, "data":[dict(r) for r in rows]}); return True

    if p == "/api/v1/admin/servers/save" and m == "POST":
        sid = b.get("id")
        name = (b.get("name") or "").strip()
        ip = (b.get("ip") or "").strip()
        domain = (b.get("domain") or "").strip()
        api_port = int(b.get("api_port") or 54323)
        admin_port = int(b.get("admin_port") or 54324)
        token = (b.get("token") or "lynli_xui_2026").strip()
        enabled = 1 if b.get("enabled", 1) else 0
        if not name or not ip:
            c.close(); ctx["send"]({"code":0, "msg":"名字和 IP 必填"}); return True
        if sid:
            c.execute("UPDATE servers SET name=?, ip=?, domain=?, api_port=?, admin_port=?, token=?, enabled=? WHERE id=?",
                      (name, ip, domain, api_port, admin_port, token, enabled, sid))
        else:
            c.execute("INSERT INTO servers(name,ip,domain,api_port,admin_port,token,enabled,sort,created_at) VALUES(?,?,?,?,?,?,?,999,?)",
                      (name, ip, domain, api_port, admin_port, token, enabled, int(time.time())))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    if p == "/api/v1/admin/servers/delete" and m == "POST":
        c.execute("DELETE FROM servers WHERE id=?", (b.get("id"),))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    if p == "/api/v1/admin/nodes" and m == "GET":
        srv = _get_server(ctx["query"].get("server_id"))
        import urllib.request as _ur
        c.close()
        try:
            req = _ur.Request(
                "http://" + (srv["ip"] if srv else config.get("server_ip", "127.0.0.1")) + ":" + str(srv["api_port"] if srv else 54323) + "/nodes",
                headers={"X-Token": "lynli_xui_2026"}
            )
            with _ur.urlopen(req, timeout=6) as r:
                data = json.loads(r.read())
            ctx["send"]({"code": 1, "data": data.get("data", [])}); return True
        except Exception as e:
            ctx["send"]({"code": 0, "msg": "读取节点失败: " + str(e)}, 500); return True

    if p == "/api/v1/admin/nodes/hysteria" and m == "GET":
        srv = _get_server(ctx["query"].get("server_id"))
        import urllib.request as _ur2
        c.close()
        try:
            req = _ur2.Request(
                "http://" + (srv["ip"] if srv else config.get("server_ip", "127.0.0.1")) + ":" + str(srv["api_port"] if srv else 54323) + "/hysteria",
                headers={"X-Token": "lynli_xui_2026"}
            )
            with _ur2.urlopen(req, timeout=6) as r:
                data = json.loads(r.read())
            ctx["send"]({"code": 1, "data": data.get("data", {})}); return True
        except Exception as e:
            ctx["send"]({"code": 0, "msg": "读取 Hysteria 失败: " + str(e)}, 500); return True

    if p.startswith("/api/v1/admin/nodes/hysteria/") and m == "POST":
        srv = _get_server(b.get("server_id"))
        import urllib.request as _ur3
        sub = p.replace("/api/v1/admin/nodes/hysteria/", "")
        c.close()
        try:
            req = _ur3.Request(
                "http://" + (srv["ip"] if srv else config.get("server_ip", "127.0.0.1")) + ":" + str(srv["admin_port"] if srv else 54324) + "/hysteria/" + sub,
                data=json.dumps(b or {}).encode(),
                headers={"X-Token": "lynli_xui_2026", "Content-Type": "application/json"},
                method="POST"
            )
            with _ur3.urlopen(req, timeout=20) as r:
                data = json.loads(r.read())
            ctx["send"]({"code": 1 if data.get("ok") else 0, "data": data, "msg": data.get("msg") or ""}); return True
        except Exception as e:
            ctx["send"]({"code": 0, "msg": "操作失败: " + str(e)}, 500); return True

    if p == "/api/v1/admin/nodes/add-client" and m == "POST":
        srv = _get_server(b.get("server_id"))
        import urllib.request as _ur
        c.close()
        try:
            req = _ur.Request(
                "http://" + (srv["ip"] if srv else config.get("server_ip", "127.0.0.1")) + ":" + str(srv["admin_port"] if srv else 54324) + "/add_client",
                data=json.dumps({
                    "inbound_id": b.get("inbound_id"),
                    "email": b.get("email"),
                    "days": b.get("days") or 30
                }).encode(),
                headers={"X-Token": "lynli_xui_2026", "Content-Type": "application/json"},
                method="POST"
            )
            with _ur.urlopen(req, timeout=10) as r:
                data = json.loads(r.read())
            ctx["send"]({"code": 1 if data.get("ok") else 0, "data": data}); return True
        except Exception as e:
            ctx["send"]({"code": 0, "msg": "添加失败: " + str(e)}, 500); return True

    if p == "/api/v1/admin/nodes/del-client" and m == "POST":
        srv = _get_server(b.get("server_id"))
        import urllib.request as _ur
        c.close()
        try:
            req = _ur.Request(
                "http://" + (srv["ip"] if srv else config.get("server_ip", "127.0.0.1")) + ":" + str(srv["admin_port"] if srv else 54324) + "/del_client",
                data=json.dumps({
                    "inbound_id": b.get("inbound_id"),
                    "email": b.get("email")
                }).encode(),
                headers={"X-Token": "lynli_xui_2026", "Content-Type": "application/json"},
                method="POST"
            )
            with _ur.urlopen(req, timeout=10) as r:
                data = json.loads(r.read())
            ctx["send"]({"code": 1 if data.get("ok") else 0, "data": data}); return True
        except Exception as e:
            ctx["send"]({"code": 0, "msg": "删除失败: " + str(e)}, 500); return True

    if p == "/api/v1/admin/nodes/clients" and m == "GET":
        srv = _get_server(ctx["query"].get("server_id"))
        import urllib.request as _ur
        iid = ctx["query"].get("inbound_id", "0")
        c.close()
        try:
            req = _ur.Request(
                "http://" + (srv["ip"] if srv else config.get("server_ip", "127.0.0.1")) + ":" + str(srv["api_port"] if srv else 54323) + "/clients?inbound_id=" + str(iid),
                headers={"X-Token": "lynli_xui_2026"}
            )
            with _ur.urlopen(req, timeout=6) as r:
                data = json.loads(r.read())
            ctx["send"]({"code": 1, "data": data.get("data", [])}); return True
        except Exception as e:
            ctx["send"]({"code": 0, "msg": "读取客户端失败: " + str(e)}, 500); return True

    if p == "/api/v1/admin/nodes/stats" and m == "GET":
        srv = _get_server(ctx["query"].get("server_id"))
        import urllib.request as _ur
        c.close()
        try:
            req = _ur.Request(
                "http://" + (srv["ip"] if srv else config.get("server_ip", "127.0.0.1")) + ":" + str(srv["api_port"] if srv else 54323) + "/stats",
                headers={"X-Token": "lynli_xui_2026"}
            )
            with _ur.urlopen(req, timeout=6) as r:
                data = json.loads(r.read())
            ctx["send"]({"code": 1, "data": data.get("data", {})}); return True
        except Exception as e:
            ctx["send"]({"code": 0, "msg": "读取统计失败: " + str(e)}, 500); return True

    # ============ Ticket (Enhanced) ============
    if p == "/api/v1/admin/tickets" and m == "GET":
        st = ctx["query"].get("status", "")
        cat = ctx["query"].get("category", "")
        q = "SELECT t.*, u.email FROM tickets t LEFT JOIN users u ON t.user_id=u.id WHERE 1=1"
        args = []
        if st: q += " AND t.status=?"; args.append(int(st))
        if cat: q += " AND t.category=?"; args.append(cat)
        q += " ORDER BY t.updated_at DESC LIMIT 500"
        rows = c.execute(q, args).fetchall()
        c.close(); ctx["send"]({"code": 1, "data": [dict(r) for r in rows]}); return True
    if p == "/api/v1/admin/tickets/update" and m == "POST":
        tid = b.get("id")
        fields, vals = [], []
        for k in ("category", "priority", "status", "subject"):
            if k in b:
                fields.append(k + "=?")
                vals.append(b[k])
        if fields:
            vals.append(tid)
            c.execute("UPDATE tickets SET " + ",".join(fields) + " WHERE id=?", vals)
            c.commit()
        c.close(); ctx["send"]({"code": 1}); return True

    # ============ Ticket ============
    if p == "/api/v1/admin/ticket/list":
        rows = c.execute("SELECT t.*, u.email FROM tickets t LEFT JOIN users u ON t.user_id=u.id ORDER BY t.updated_at DESC").fetchall()
        c.close(); ctx["send"]({"code":1, "data":[dict(r) for r in rows]}); return True
    if p == "/api/v1/admin/ticket/messages":
        tid = ctx["query"].get("id", "")
        rows = c.execute("SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY id", (tid,)).fetchall()
        c.close(); ctx["send"]({"code":1, "data":[dict(r) for r in rows]}); return True
    if p == "/api/v1/admin/ticket/handoff" and m == "POST":
        c.execute("UPDATE tickets SET handoff=? WHERE id=?", (1 if b.get("handoff") else 0, b.get("id")))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True
    if p == "/api/v1/admin/ticket/reply" and m == "POST":
        tid = b.get("ticket_id")
        c.execute("INSERT INTO ticket_messages(ticket_id,sender,content,created_at) VALUES(?,?,?,?)",
                  (tid, "admin", b.get("content",""), int(time.time())))
        c.execute("UPDATE tickets SET updated_at=? WHERE id=?", (int(time.time()), tid))
        c.commit(); c.close(); ctx["send"]({"code":1}); return True

    c.close()
    return False
