# -*- coding: utf-8 -*-
"""GitHub OAuth 登录（授权码换 token → 拉用户 → 建/查账号 → 深链回 APP）"""
import time, secrets, json, urllib.request, urllib.parse
import db

_states = {}

GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL  = "https://api.github.com/user"
GITHUB_EMAIL_URL = "https://api.github.com/user/emails"
import config
CALLBACK = config.get("oauth_github_callback")


def _cfg(c, key):
    r = c.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return (r["value"] if r else "") or ""


def _clean_states():
    now = int(time.time())
    for s in list(_states.keys()):
        if now - _states[s].get("created_at", 0) > 600:
            _states.pop(s, None)


def _html_ok(nick, deep):
    return """<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录成功</title>
<style>body{margin:0;font-family:-apple-system,sans-serif;background:#EEF4FF;display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{background:#fff;border-radius:16px;padding:32px 24px;text-align:center;max-width:320px}
.ico{width:64px;height:64px;background:#2E5BFF;border-radius:32px;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:32px;font-weight:700}
h2{color:#0F1A3C;font-size:18px;margin:16px 0 8px}p{color:#64748B;font-size:13px;margin:0 0 20px}
a{display:inline-block;background:#2E5BFF;color:#fff;text-decoration:none;padding:12px 28px;border-radius:24px;font-size:15px;font-weight:600}</style>
</head><body><div class="c"><div class="ico">✓</div><h2>登录成功</h2><p>欢迎，%s</p><a href="%s">返回 Lynli</a></div>
<script>setTimeout(function(){location.href="%s";},300);</script></body></html>""" % (nick, deep, deep)


def _html_err(msg):
    return """<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录失败</title>
<style>body{margin:0;font-family:-apple-system,sans-serif;background:#EEF4FF;display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{background:#fff;border-radius:16px;padding:32px 24px;text-align:center;max-width:320px}
h2{color:#E53935;font-size:18px;margin:0 0 8px}p{color:#64748B;font-size:13px;margin:0}</style>
</head><body><div class="c"><h2>登录失败</h2><p>%s</p></div></body></html>""" % msg


def handle(ctx):
    p = ctx["path"]; m = ctx["method"]; q = ctx.get("query") or {}

    # ============ 起点：跳 GitHub 授权页 ============
    if p == "/api/v1/passport/oauth/github/start" and m == "GET":
        c = db.connect()
        cid = _cfg(c, "oauth_github_id")
        c.close()
        if not cid:
            ctx["raw_send"]("<h1>未配置 GitHub OAuth</h1>".encode("utf-8"), "text/html; charset=utf-8"); return True
        _clean_states()
        state = secrets.token_urlsafe(24)
        _states[state] = {"created_at": int(time.time())}
        url = GITHUB_AUTHORIZE + "?" + urllib.parse.urlencode({
            "client_id": cid, "redirect_uri": CALLBACK,
            "scope": "read:user user:email", "state": state
        })
        html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=' + url + '"></head><body>正在跳转 GitHub…</body></html>'
        ctx["raw_send"](html.encode("utf-8"), "text/html; charset=utf-8"); return True

    # ============ 回调：GitHub 带 code 回来 ============
    if p == "/api/v1/passport/oauth/github/callback" and m == "GET":
        code = q.get("code") or ""
        state = q.get("state") or ""
        if not code or state not in _states:
            ctx["raw_send"](_html_err("无效的登录请求").encode("utf-8"), "text/html; charset=utf-8"); return True
        _states.pop(state, None)

        c = db.connect()
        cid = _cfg(c, "oauth_github_id")
        csec = _cfg(c, "oauth_github_secret")
        c.close()

        # code → access_token
        try:
            data = urllib.parse.urlencode({"client_id": cid, "client_secret": csec,
                                           "code": code, "redirect_uri": CALLBACK}).encode()
            req = urllib.request.Request(GITHUB_TOKEN_URL, data=data, headers={
                "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=15) as r:
                tb = json.loads(r.read().decode())
        except Exception as e:
            ctx["raw_send"](_html_err("换 token 失败: " + str(e)[:80]).encode("utf-8"), "text/html; charset=utf-8"); return True

        at = tb.get("access_token")
        if not at:
            ctx["raw_send"](_html_err("授权失败：" + str(tb.get("error_description") or tb)[:80]).encode("utf-8"), "text/html; charset=utf-8"); return True

        hdrs = {"Authorization": "token " + at, "User-Agent": "Lynli"}
        try:
            with urllib.request.urlopen(urllib.request.Request(GITHUB_USER_URL, headers=hdrs), timeout=15) as r2:
                info = json.loads(r2.read().decode())
        except Exception:
            ctx["raw_send"](_html_err("拉用户信息失败").encode("utf-8"), "text/html; charset=utf-8"); return True

        gh_id = info.get("id")
        gh_login = info.get("login") or ""
        gh_avatar = info.get("avatar_url") or ""
        gh_email = info.get("email") or ""
        if not gh_email:
            try:
                with urllib.request.urlopen(urllib.request.Request(GITHUB_EMAIL_URL, headers=hdrs), timeout=15) as r3:
                    for e in json.loads(r3.read().decode()):
                        if e.get("primary"): gh_email = e.get("email") or ""; break
            except Exception:
                pass
        if not gh_email:
            gh_email = "github_" + str(gh_id) + "@lynli.oauth"

        c = db.connect()
        u = c.execute("SELECT * FROM users WHERE email=?", (gh_email.lower(),)).fetchone()
        if not u:
            import api_auth
            tok = db.new_token()
            sid = api_auth._gen_short_id(c)
            c.execute(
                "INSERT INTO users(email,password,uuid,token,created_at,short_id,sub_token,nickname,avatar) VALUES(?,?,?,?,?,?,?,?,?)",
                (gh_email.lower(), db.hash_pw(secrets.token_hex(12)), secrets.token_hex(16),
                 tok, int(time.time()), sid, secrets.token_hex(16), gh_login, gh_avatar))
            c.commit()
            u = c.execute("SELECT * FROM users WHERE email=?", (gh_email.lower(),)).fetchone()
        else:
            tok = db.new_token()
            c.execute("UPDATE users SET token=?, nickname=CASE WHEN nickname='' OR nickname IS NULL THEN ? ELSE nickname END, "
                      "avatar=CASE WHEN avatar='' OR avatar IS NULL THEN ? ELSE avatar END WHERE id=?",
                      (tok, gh_login, gh_avatar, u["id"]))
            c.commit()
            u = c.execute("SELECT * FROM users WHERE id=?", (u["id"],)).fetchone()
            tok = u["token"]

        try:
            hdr0 = ctx.get("headers") or {}
            ua0 = (hdr0.get("user-agent") or "github-oauth")[:200]
            ip0 = (hdr0.get("x-forwarded-for") or "").split(",")[0].strip() or (hdr0.get("x-real-ip") or "")
            c.execute("INSERT OR REPLACE INTO user_tokens(token,user_id,ua,ip,created_at,last_used_at) VALUES(?,?,?,?,?,?)",
                      (tok, u["id"], ua0, ip0, int(time.time()), int(time.time())))
            c.commit()
        except Exception:
            pass
        c.close()

        deep = "lynli://oauth/callback?token=" + urllib.parse.quote(tok) + "&short_id=" + str(u["short_id"] or 0)
        ctx["raw_send"](_html_ok(gh_login or gh_email, deep).encode("utf-8"), "text/html; charset=utf-8")
        return True

    # ============ APP 内 WebView 用：POST code → 换 token ============
    if p == "/api/v1/passport/oauth/github/exchange" and m == "POST":
        code = (ctx.get("body") or {}).get("code") or ""
        if not code:
            ctx["send"]({"code": 0, "message": "缺少 code"}); return True
        c = db.connect()
        cid = _cfg(c, "oauth_github_id")
        csec = _cfg(c, "oauth_github_secret")
        c.close()

        try:
            data = urllib.parse.urlencode({"client_id": cid, "client_secret": csec,
                                           "code": code, "redirect_uri": CALLBACK}).encode()
            req = urllib.request.Request(GITHUB_TOKEN_URL, data=data, headers={
                "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=15) as r:
                tb = json.loads(r.read().decode())
        except Exception as e:
            ctx["send"]({"code": 0, "message": "换 token 失败: " + str(e)[:80]}); return True

        at = tb.get("access_token")
        if not at:
            ctx["send"]({"code": 0, "message": "授权失败：" + str(tb.get("error_description") or tb)[:80]}); return True

        hdrs = {"Authorization": "token " + at, "User-Agent": "Lynli"}
        try:
            with urllib.request.urlopen(urllib.request.Request(GITHUB_USER_URL, headers=hdrs), timeout=15) as r2:
                info = json.loads(r2.read().decode())
        except Exception:
            ctx["send"]({"code": 0, "message": "拉用户信息失败"}); return True

        gh_id = info.get("id")
        gh_login = info.get("login") or ""
        gh_avatar = info.get("avatar_url") or ""
        gh_email = info.get("email") or ""
        if not gh_email:
            try:
                with urllib.request.urlopen(urllib.request.Request(GITHUB_EMAIL_URL, headers=hdrs), timeout=15) as r3:
                    for e in json.loads(r3.read().decode()):
                        if e.get("primary"): gh_email = e.get("email") or ""; break
            except Exception:
                pass
        if not gh_email:
            gh_email = "github_" + str(gh_id) + "@lynli.oauth"

        c = db.connect()
        u = c.execute("SELECT * FROM users WHERE email=?", (gh_email.lower(),)).fetchone()
        if not u:
            import api_auth
            tok = db.new_token()
            sid = api_auth._gen_short_id(c)
            c.execute(
                "INSERT INTO users(email,password,uuid,token,created_at,short_id,sub_token,nickname,avatar) VALUES(?,?,?,?,?,?,?,?,?)",
                (gh_email.lower(), db.hash_pw(secrets.token_hex(12)), secrets.token_hex(16),
                 tok, int(time.time()), sid, secrets.token_hex(16), gh_login, gh_avatar))
            c.commit()
            u = c.execute("SELECT * FROM users WHERE email=?", (gh_email.lower(),)).fetchone()
        else:
            tok = db.new_token()
            c.execute("UPDATE users SET token=?, nickname=CASE WHEN nickname='' OR nickname IS NULL THEN ? ELSE nickname END, "
                      "avatar=CASE WHEN avatar='' OR avatar IS NULL THEN ? ELSE avatar END WHERE id=?",
                      (tok, gh_login, gh_avatar, u["id"]))
            c.commit()
            u = c.execute("SELECT * FROM users WHERE id=?", (u["id"],)).fetchone()
            tok = u["token"]

        try:
            hdr0 = ctx.get("headers") or {}
            ua0 = (hdr0.get("user-agent") or "github-app")[:200]
            ip0 = (hdr0.get("x-forwarded-for") or "").split(",")[0].strip() or (hdr0.get("x-real-ip") or "")
            c.execute("INSERT OR REPLACE INTO user_tokens(token,user_id,ua,ip,created_at,last_used_at) VALUES(?,?,?,?,?,?)",
                      (tok, u["id"], ua0, ip0, int(time.time()), int(time.time())))
            c.commit()
        except Exception:
            pass
        c.close()

        ctx["send"]({"code": 1, "message": "ok", "data": {
            "token": tok,
            "short_id": u["short_id"] or 0,
            "email": u["email"],
            "nickname": gh_login
        }})
        return True

    return False
