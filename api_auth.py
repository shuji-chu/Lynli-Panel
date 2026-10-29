import time, secrets, db
import email_sender

PATHS = (
    "/api/v1/passport/auth/login",
    "/api/v1/passport/auth/register",
    "/api/v1/passport/auth/send-code",
)

CODE_TTL = 300
SEND_INTERVAL = 60


def _gen_short_id(c):
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(100):
        sid = "".join(secrets.choice(alphabet) for _ in range(5))
        if not c.execute("SELECT 1 FROM users WHERE short_id=?", (sid,)).fetchone(): return sid
    raise RuntimeError("无法生成唯一 short_id，请重试")


def _user_public(u):
    keys = u.keys()
    return {"id": u["id"], "email": u["email"], "short_id": u["short_id"] if "short_id" in keys else "", "nickname": u["nickname"] if "nickname" in keys else "", "avatar_url": (u["avatar_url"] if "avatar_url" in keys and u["avatar_url"] else (u["avatar"] if "avatar" in keys else ""))}


def handle(ctx):
    p = ctx["path"]
    if p not in PATHS:
        return False

    body = ctx["body"]
    email = (body.get("email") or "").strip().lower()

    if p.endswith("/send-code"):
        if not email:
            ctx["send"]({"message": "请输入邮箱", "data": None}, 400); return True

        c = db.connect()
        if c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            c.close(); ctx["send"]({"message": "该邮箱已注册", "data": None}, 400); return True

        now = int(time.time())
        row = c.execute("SELECT created_at FROM email_codes WHERE email=?", (email,)).fetchone()
        if row and now - row["created_at"] < SEND_INTERVAL:
            c.close(); ctx["send"]({"message": "发送太频繁，请稍后再试", "data": None}, 429); return True

        code = "".join([secrets.choice("0123456789") for _ in range(6)])
        c.execute(
            "INSERT OR REPLACE INTO email_codes(email,code,expire_at,created_at) VALUES(?,?,?,?)",
            (email, code, now + CODE_TTL, now)
        )
        c.commit(); c.close()

        try:
            ok = email_sender.send_verify_code(email, code)
        except Exception as e:
            ctx["send"]({"message": "发送失败：" + str(e), "data": None}, 500); return True

        if ok:
            ctx["send"]({"message": "", "data": {"msg": "验证码已发送"}}); return True
        else:
            ctx["send"]({"message": "发送失败，请稍后再试", "data": None}, 500); return True

    pw = body.get("password") or ""
    if not email or not pw:
        ctx["send"]({"message": "邮箱或密码错误", "data": None}, 400); return True

    c = db.connect()

    if p.endswith("/login"):
        u = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if not u or u["password"] != db.hash_pw(pw):
            c.close(); ctx["send"]({"message": "邮箱或密码错误", "data": None}, 401); return True
        tok = db.new_token()
        c.execute("UPDATE users SET token=? WHERE id=?", (tok, u["id"]))
        try:
            hdr0 = ctx.get("headers") or {}
            ua0 = (hdr0.get("user-agent") or "")[:200]
            ip0 = (hdr0.get("x-forwarded-for") or "").split(",")[0].strip() or (hdr0.get("x-real-ip") or "")
            c.execute("INSERT OR REPLACE INTO user_tokens(token,user_id,ua,ip,created_at,last_used_at) VALUES(?,?,?,?,?,?)",
                      (tok, u["id"], ua0, ip0, int(time.time()), int(time.time())))
        except Exception:
            pass
        try:
            hdr = ctx.get("headers") or {}
            real_ip = (hdr.get("x-forwarded-for") or "").split(",")[0].strip() \
                      or (hdr.get("x-real-ip") or "").strip() \
                      or (ctx.get("host") or "").split(":")[0]
            ua = hdr.get("user-agent") or ""
            now = int(time.time())
            c.execute("UPDATE users SET last_login_at=?, last_login_ip=?, login_count=COALESCE(login_count,0)+1 WHERE id=?",
                      (now, real_ip, u["id"]))
            c.execute("INSERT INTO login_logs(user_id,email,ip,ua,created_at) VALUES(?,?,?,?,?)",
                      (u["id"], u["email"], real_ip, ua[:300], now))
        except Exception:
            pass
        c.commit(); c.close()
        ctx["send"]({"message": "", "data": {"token": tok, "isAdmin": 0, "auth_data": tok, "user": _user_public(u)}}); return True

    code = (body.get("code") or "").strip()
    if not code:
        c.close(); ctx["send"]({"message": "请输入验证码", "data": None}, 400); return True

    row = c.execute("SELECT code,expire_at FROM email_codes WHERE email=?", (email,)).fetchone()
    if not row or row["code"] != code:
        c.close(); ctx["send"]({"message": "验证码错误", "data": None}, 400); return True
    if row["expire_at"] < int(time.time()):
        c.close(); ctx["send"]({"message": "验证码已过期，请重新获取", "data": None}, 400); return True

    if c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
        c.close(); ctx["send"]({"message": "该邮箱已注册", "data": None}, 400); return True

    invite_code = (body.get("invite_code") or body.get("inviteCode") or "").strip().upper()
    inviter_id = 0
    if invite_code:
        r2 = c.execute("SELECT user_id FROM invites WHERE code=?", (invite_code,)).fetchone()
        if r2:
            inviter_id = r2["user_id"]
        else:
            # The five-character short_id is also accepted as an invite code.
            r2 = c.execute("SELECT id AS user_id FROM users WHERE short_id=?", (invite_code,)).fetchone()
            if r2:
                inviter_id = r2["user_id"]

    tok = db.new_token()
    sid = _gen_short_id(c)
    c.execute(
        "INSERT INTO users(email,password,uuid,token,created_at,short_id,inviter_id,inviter_code,sub_token) VALUES(?,?,?,?,?,?,?,?,?)",
        (email, db.hash_pw(pw), secrets.token_hex(16), tok, int(time.time()), sid, inviter_id, invite_code, secrets.token_hex(16))
    )
    # 邀请奖励：邀请人 + 新人 各得 GB 流量
    if inviter_id:
        try:
            _r = c.execute("SELECT value FROM settings WHERE key='invite_reward_gb'").fetchone()
            _gb = float(_r["value"]) if _r and _r["value"] else 1.0
        except Exception:
            _gb = 1.0
        if _gb > 0:
            _bytes = int(_gb * 1024 * 1024 * 1024)
            c.execute("UPDATE users SET transfer_enable = COALESCE(transfer_enable,0) + ? WHERE id=?", (_bytes, inviter_id))
            c.execute("UPDATE users SET transfer_enable = COALESCE(transfer_enable,0) + ? WHERE email=?", (_bytes, email))
            print("[invite] user#" + str(inviter_id) + " +" + str(_gb) + "GB  |  new " + email + " +" + str(_gb) + "GB", flush=True)
        c.execute("UPDATE invites SET signups = COALESCE(signups,0) + 1 WHERE code=?", (invite_code,))
    c.execute("DELETE FROM email_codes WHERE email=?", (email,))
    new_user = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    c.commit(); c.close()
    ctx["send"]({"message": "", "data": {"token": tok, "isAdmin": 0, "auth_data": tok, "user": _user_public(new_user)}}); return True
