# -*- coding: utf-8 -*-
"""图形验证码：点字母 —— 生成图 + 校验坐标"""
import random, time, secrets, io, base64
from PIL import Image, ImageDraw, ImageFont

# 内存里存验证码（id -> {cx, cy, r, answer, created_at}）
_captchas = {}

FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]


def _get_font(size):
    for fp in FONT_PATHS:
        try:
            return ImageFont.truetype(fp, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _gen(c):
    W, H = 320, 200
    img = Image.new("RGB", (W, H), (235, 243, 255))
    d = ImageDraw.Draw(img)

    # 背景气泡
    for _ in range(18):
        x = random.randint(-20, W)
        y = random.randint(-20, H)
        r = random.randint(20, 60)
        color = (random.randint(220, 245), random.randint(230, 250), random.randint(240, 255))
        d.ellipse([x-r, y-r, x+r, y+r], outline=color, width=2)

    # 6 个字符（字母 + 数字）
    chars = list("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
    random.shuffle(chars)
    chosen = chars[:6]
    target = random.choice(chosen)

    positions = []
    for i, ch in enumerate(chosen):
        # 随机放置，不重叠
        tries = 0
        while True:
            x = random.randint(30, W - 50)
            y = random.randint(30, H - 60)
            ok = True
            for px, py in positions:
                if abs(px - x) < 50 and abs(py - y) < 50:
                    ok = False
                    break
            if ok or tries > 30:
                break
            tries += 1
        positions.append((x, y))

        font = _get_font(random.randint(36, 46))
        color = random.choice([(0, 82, 217), (46, 91, 255), (30, 60, 150), (20, 40, 100)])
        d.text((x, y), ch, font=font, fill=color)

    # 记下目标字符的中心
    ti = chosen.index(target)
    tx, ty = positions[ti]
    cx, cy = tx + 22, ty + 26

    # 存内存
    cid = secrets.token_urlsafe(12)
    _captchas[cid] = {"cx": cx, "cy": cy, "r": 36, "answer": target, "created_at": int(time.time())}

    # 清理 10 分钟前的
    now = int(time.time())
    for k in list(_captchas.keys()):
        if now - _captchas[k].get("created_at", 0) > 600:
            _captchas.pop(k, None)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    return {
        "id": cid,
        "image": "data:image/png;base64," + b64,
        "hint": "请点击字母 " + target,
        "width": W,
        "height": H,
    }


def handle(ctx):
    p = ctx["path"]; m = ctx["method"]

    if p == "/api/v1/auth/captcha" and m == "GET":
        ctx["send"]({"code": 1, "message": "ok", "data": _gen(ctx)}); return True

    if p == "/api/v1/auth/captcha/check" and m == "POST":
        b = ctx.get("body") or {}
        cid = (b.get("id") or "").strip()
        x = float(b.get("x") or 0)
        y = float(b.get("y") or 0)
        info = _captchas.pop(cid, None)
        if not info:
            ctx["send"]({"code": 0, "message": "验证码不存在或已过期"}); return True
        if int(time.time()) - info["created_at"] > 600:
            ctx["send"]({"code": 0, "message": "验证码已过期"}); return True
        dx = x - info["cx"]; dy = y - info["cy"]
        hit = (dx*dx + dy*dy) <= (info["r"] * info["r"])
        if hit:
            ctx["send"]({"code": 1, "message": "ok", "data": {"pass": True}}); return True
        else:
            ctx["send"]({"code": 0, "message": "点错了，请重试", "data": {"pass": False}}); return True

    return False
