# -*- coding: utf-8 -*-
import time, base64, requests
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
import db

import json
UA = {"User-Agent": "Mozilla/5.0"}


def get_cfg(channel):
    c = db.connect()
    r = c.execute("SELECT enabled,cfg FROM payment_configs WHERE channel=?", (channel,)).fetchone()
    c.close()
    if not r:
        return None
    return {"enabled": r["enabled"], "cfg": json.loads(r["cfg"] or "{}")}


def get_alipay():
    x = get_cfg("alipay")
    return x["cfg"] if x else {}


def get_usdt():
    x = get_cfg("usdt")
    return x["cfg"] if x else {}


def _load_key():
    path = get_alipay().get("private_key_file") or "/opt/lynli-api/pay_private_key.pem"
    raw = open(path).read().strip()
    data = b"".join(l.encode() for l in raw.split("\n") if not l.startswith("-----"))
    return serialization.load_der_private_key(base64.b64decode(data), password=None)


def _sign(params):
    s = "&".join(f"{k}={v}" for k, v in sorted(params.items()) if k != "sign" and v)
    pk = _load_key()
    sig = pk.sign(s.encode(), padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(sig).decode()


def create_order(trade_no, amount_yuan, method, name="Lynli 套餐"):
    if method == "usdt":
        return create_usdt_order(trade_no, amount_yuan, name)
    cf = get_alipay()
    params = {
        "pid": cf.get("pid", ""), "type": method, "out_trade_no": trade_no,
        "notify_url": cf.get("notify_url", ""),
        "return_url": cf.get("return_url", ""),
        "name": name, "money": f"{amount_yuan:.2f}",
        "timestamp": str(int(time.time())),
    }
    params["sign"] = _sign(params)
    params["sign_type"] = "RSA"
    r = requests.post(cf.get("create_url", ""), data=params, timeout=15, headers=UA)
    return r.json()


def create_usdt_order(trade_no, amount_yuan, name="Lynli 套餐"):
    cf = get_usdt()
    rate = float(cf.get("rate") or 8.0)
    amount_usdt = round(amount_yuan / rate, 2)
    if amount_usdt < float(cf.get("min_amount") or 0):
        return {"code": 1, "msg": "低于最低金额"}
    addr = cf.get("address") or ""
    if not addr:
        return {"code": 1, "msg": "未配置收款地址"}
    return {
        "code": 0,
        "msg": "success",
        "trade_no": trade_no,
        "money": f"{amount_yuan:.2f}",
        "usdt_amount": amount_usdt,
        "address": addr,
        "network": cf.get("network") or "TRC20",
        "payurl": "tron:" + addr + "?amount=" + str(amount_usdt),
        "qrcode": "tron:" + addr + "?amount=" + str(amount_usdt),
        "pay_info": addr,
    }


def query_order(trade_no):
    cf = get_alipay()
    params = {"pid": cf.get("pid", ""), "out_trade_no": trade_no, "timestamp": str(int(time.time()))}
    params["sign"] = _sign(params)
    params["sign_type"] = "RSA"
    r = requests.post(cf.get("query_url", ""), data=params, timeout=15, headers=UA)
    return r.json()


def _grant(c, trade_no):
    o = c.execute("SELECT * FROM orders WHERE trade_no=?", (trade_no,)).fetchone()
    if not o or o["status"] == 1:
        return False
    days = {"month_price": 30, "quarter_price": 90, "half_year_price": 180, "year_price": 365}.get(o["period"] or "month_price", 30)
    u = c.execute("SELECT expired_at FROM users WHERE id=?", (o["user_id"],)).fetchone()
    base = max((u["expired_at"] or 0), int(time.time())) if u else int(time.time())
    c.execute("UPDATE users SET plan_id=?, expired_at=? WHERE id=?",
              (o["plan_id"], base + days * 86400, o["user_id"]))
    c.execute("UPDATE orders SET status=1 WHERE trade_no=?", (trade_no,))

    # 三级分销：比例从 settings 读（默认 15/5/2）
    try:
        amt = int(o["total_amount"] or 0)
        _cr = c.execute("SELECT key,value FROM settings WHERE key IN ('commission_lv1','commission_lv2','commission_lv3')").fetchall()
        _cm = {r["key"]: r["value"] for r in _cr}
        lv1 = int(_cm.get("commission_lv1", "15") or 15)
        lv2 = int(_cm.get("commission_lv2", "5") or 5)
        lv3 = int(_cm.get("commission_lv3", "2") or 2)
        levels = [(1, lv1), (2, lv2), (3, lv3)]
        cur_id = o["user_id"]
        for lv, pct in levels:
            row = c.execute("SELECT inviter_id FROM users WHERE id=?", (cur_id,)).fetchone()
            if not row or not row["inviter_id"] or row["inviter_id"] <= 0:
                break
            inviter = row["inviter_id"]
            commission = int(amt * pct // 100)
            if commission > 0:
                c.execute("UPDATE users SET commission_balance = COALESCE(commission_balance,0) + ?, commission_total = COALESCE(commission_total,0) + ? WHERE id=?",
                          (commission, commission, inviter))
                print("[commission] Lv" + str(lv) + " user#" + str(inviter) + " +" + str(commission) + " 分 (" + str(pct) + "%)", flush=True)
            cur_id = inviter
        # 记录买家消费
        c.execute("UPDATE users SET invited_charge = COALESCE(invited_charge,0) + ? WHERE id=?",
                  (amt, o["user_id"]))
    except Exception as e:
        print("[commission] err: " + str(e), flush=True)

    return True


def handle(ctx):
    p, m = ctx["path"], ctx["method"]
    b = ctx["body"] or {}
    q = ctx["query"]

    if p == "/api/v1/user/order/pay" and m == "POST":
        trade_no = b.get("trade_no") or ""
        method = b.get("method") or "alipay"
        if not trade_no:
            ctx["send"]({"code": 0, "msg": "缺少订单号"}); return True
        ch = get_cfg(method)
        if not ch or not ch["enabled"]:
            ctx["send"]({"code": 0, "msg": "该支付方式未开启"}); return True
        c = db.connect()
        o = c.execute("SELECT * FROM orders WHERE trade_no=?", (trade_no,)).fetchone()
        if not o:
            c.close(); ctx["send"]({"code": 0, "msg": "订单不存在"}); return True
        if o["status"] == 1:
            c.close(); ctx["send"]({"code": 0, "msg": "订单已支付"}); return True
        c.execute("UPDATE orders SET method=? WHERE trade_no=?", (method, trade_no))
        c.commit(); c.close()
        try:
            r = create_order(trade_no, o["total_amount"] / 100, method)
        except Exception as e:
            ctx["send"]({"code": 0, "msg": "调支付失败: " + str(e)}); return True
        if r.get("code") == 0:
            ctx["send"]({"code": 1, "data": {
                "pay_info": r.get("pay_info") or "",
                "qrcode":   r.get("qrcode")   or "",
                "payurl":   r.get("payurl")   or r.get("qrcode") or r.get("pay_info") or "",
                "trade_no": r.get("trade_no") or "",
                "amount":   r.get("money") or "",
            }}); return True
        ctx["send"]({"code": 0, "msg": r.get("msg") or "支付失败"}); return True

    if p == "/api/v1/user/order/query" and m == "GET":
        trade_no = q.get("trade_no") or ""
        if not trade_no:
            ctx["send"]({"code": 0, "msg": "缺少订单号"}); return True
        try:
            r = query_order(trade_no)
        except Exception as e:
            ctx["send"]({"code": 0, "msg": str(e)}); return True
        d = r.get("data") or {}
        paid = (d.get("status") == 1)
        if paid:
            c = db.connect()
            _grant(c, trade_no); c.commit(); c.close()
        ctx["send"]({"code": 1, "data": {"paid": paid}}); return True

    if p == "/api/v1/pay/notify":
        data = q if q else b
        trade_no = data.get("out_trade_no") or ""
        if trade_no:
            try:
                r = query_order(trade_no)
                d = r.get("data") or {}
                if d.get("status") == 1:
                    c = db.connect()
                    ok = _grant(c, trade_no); c.commit(); c.close()
                    print("[pay/notify] 查单确认已支付，开通 " + trade_no + " ok=" + str(ok), flush=True)
                else:
                    print("[pay/notify] 回调但平台未确认: " + trade_no + " d=" + str(d), flush=True)
            except Exception as e:
                print("[pay/notify] 查单异常: " + trade_no + " " + str(e), flush=True)
        ctx["send"]("success"); return True

    return False

# ============ 后台自动轮询 ============
import threading

_poll_started = False


def _poll_loop():
    print("[pay] 轮询线程启动，每 15 秒检查一次未支付订单", flush=True)
    while True:
        try:
            c = db.connect()
            rows = c.execute(
                "SELECT trade_no FROM orders WHERE status=0 AND method IS NOT NULL AND method != '' "
                "AND created_at > ?",
                (int(time.time()) - 3600,)
            ).fetchall()
            c.close()
            for r in rows:
                try:
                    qr = query_order(r["trade_no"])
                    d = qr.get("data") or {}
                    if d.get("status") == 1:
                        c2 = db.connect()
                        ok = _grant(c2, r["trade_no"])
                        c2.commit()
                        c2.close()
                        if ok:
                            print("[pay] 订单 " + r["trade_no"] + " 已自动开通", flush=True)
                except Exception as e:
                    print("[pay] 查询 " + r["trade_no"] + " 失败: " + str(e), flush=True)
        except Exception as e:
            print("[pay] 轮询出错: " + str(e), flush=True)
        time.sleep(15)


def start_poller():
    global _poll_started
    if _poll_started:
        return
    _poll_started = True
    t = threading.Thread(target=_poll_loop, daemon=True)
    t.start()


start_poller()

# ============ USDT 链上监听 ============
import os

_processed_tx = set()
_PROCESSED_FILE = "/opt/lynli-api/usdt_processed.txt"


def _load_processed():
    if not os.path.exists(_PROCESSED_FILE):
        return
    with open(_PROCESSED_FILE) as f:
        for line in f:
            _processed_tx.add(line.strip())


def _save_processed(txid):
    with open(_PROCESSED_FILE, "a") as f:
        f.write(txid + "\n")
    _processed_tx.add(txid)


def _match_usdt_order(amount_usdt, txid):
    """找到金额匹配、未支付的订单，开通"""
    c = db.connect()
    rate = get_usdt().get("rate") or 8.0
    amount_cny = amount_usdt * rate
    # 金额浮动 ±3% 容差
    lo, hi = amount_cny * 0.97, amount_cny * 1.03
    o = c.execute(
        "SELECT trade_no FROM orders WHERE status=0 AND method='usdt' "
        "AND total_amount/100.0 BETWEEN ? AND ? "
        "ORDER BY created_at DESC LIMIT 1",
        (lo, hi)
    ).fetchone()
    if not o:
        c.close()
        return False
    trade_no = o["trade_no"]
    _grant(c, trade_no)
    c.commit()
    c.close()
    print("[usdt] 到账 " + txid[:16] + "... USDT " + str(amount_usdt) + " → 开通 " + trade_no, flush=True)
    return True


def usdt_listen_loop():
    _load_processed()
    print("[usdt] 链上监听线程启动，每 30 秒扫一次", flush=True)
    while True:
        try:
            cf = get_usdt()
            addr = cf.get("address") or ""
            api = cf.get("trongrid_api") or "https://api.trongrid.io"
            key = cf.get("trongrid_key") or ""
            if not addr:
                time.sleep(60)
                continue
            url = api.rstrip("/") + "/v1/accounts/" + addr + "/transactions/trc20?limit=20&only_to=true&contract_address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
            headers = {}
            if key:
                headers["TRON-PRO-API-KEY"] = key
            r = requests.get(url, headers=headers, timeout=15)
            data = r.json()
            for tx in (data.get("data") or []):
                txid = tx.get("transaction_id")
                if not txid or txid in _processed_tx:
                    continue
                token = tx.get("token_info") or {}
                if token.get("address") != "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t":
                    continue
                decimals = int(token.get("decimals") or 6)
                amount = float(tx.get("value") or 0) / (10 ** decimals)
                # 先记录已处理，避免重复
                _save_processed(txid)
                # 时间太老的不处理（比如 1 天前的）
                ts = tx.get("block_timestamp") or 0
                if ts and ts < (time.time() - 86400) * 1000:
                    continue
                _match_usdt_order(amount, txid)
        except Exception as e:
            print("[usdt] 监听出错: " + str(e), flush=True)
        time.sleep(30)


_usdt_started = False


def start_usdt_listener():
    global _usdt_started
    if _usdt_started:
        return
    _usdt_started = True
    t = threading.Thread(target=usdt_listen_loop, daemon=True)
    t.start()


start_usdt_listener()
