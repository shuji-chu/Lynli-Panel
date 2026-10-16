import time, secrets, db

PRICE_FIELD = {"month_price": "month_price", "quarter_price": "quarter_price",
               "half_year_price": "half_year_price", "year_price": "year_price"}
PERIOD_DAYS = {"month_price": 30, "quarter_price": 90, "half_year_price": 180, "year_price": 365}

def handle(ctx):
    p, m = ctx["path"], ctx["method"]

    if p == "/api/v1/user/order/fetch" and m == "GET":
        u = db.user_by_token(ctx["token"])
        if not u: ctx["send"]({"data": [], "message": "unauth", "status": "fail"}); return True
        c = db.connect()
        rows = c.execute("SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC", (u["id"],)).fetchall()
        c.close()
        out = []
        for r in rows:
            out.append({"id": r["user_id"], "trade_no": r["trade_no"], "plan_id": r["plan_id"],
                        "period": r["period"], "total_amount": r["total_amount"],
                        "status": r["status"], "created_at": r["created_at"],
                        "plan": db.plan_to_dict(db.plan_by_id(r["plan_id"]))})
        ctx["send"]({"data": out, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/order/detail" and m == "GET":
        tn = ctx["query"].get("trade_no", "")
        c = db.connect()
        r = c.execute("SELECT * FROM orders WHERE trade_no=?", (tn,)).fetchone()
        c.close()
        if not r: ctx["send"]({"data": None, "message": "not found", "status": "fail"}); return True
        ctx["send"]({"data": {"trade_no": r["trade_no"], "plan_id": r["plan_id"],
                              "period": r["period"], "total_amount": r["total_amount"],
                              "status": r["status"], "created_at": r["created_at"],
                              "paid_at": None, "plan": db.plan_to_dict(db.plan_by_id(r["plan_id"]))}}); return True

    if p == "/api/v1/user/order/getPaymentMethod" and m == "GET":
        ctx["send"]({"data": [
            {"id": 1, "name": "\u652f\u4ed8\u5b9d", "payment": "alipay", "icon": None,
             "handling_fee_fixed": None, "handling_fee_percent": "0"},
            {"id": 2, "name": "USDT", "payment": "usdt", "icon": None,
             "handling_fee_fixed": None, "handling_fee_percent": "0"},
        ], "message": "", "status": "success"}); return True

    if p == "/api/v1/user/order/save" and m == "POST":
        u = db.user_by_token(ctx["token"])
        if not u: ctx["send"]({"data": None, "message": "unauth", "status": "fail"}, 401); return True
        b = ctx["body"]
        pid = int(b.get("plan_id") or 0)
        period = b.get("period") or "month_price"
        pl = db.plan_by_id(pid)
        if not pl: ctx["send"]({"data": None, "message": "plan not found", "status": "fail"}, 400); return True
        method = (b.get("payment") or "alipay").strip().lower()
        if method not in ("alipay", "usdt"):
            method = "alipay"
        amt = pl[PRICE_FIELD.get(period, "month_price")] or 0
        c = db.connect()
        # 优惠码
        coupon_code = (b.get("coupon_code") or "").strip().upper()
        coupon_id = None
        if coupon_code:
            cp = c.execute("SELECT * FROM coupons WHERE code=? AND enabled=1", (coupon_code,)).fetchone()
            if cp:
                ok = True
                now_ts = int(time.time())
                if cp["expire_at"] and cp["expire_at"] < now_ts: ok = False
                if cp["max_uses"] and cp["used"] >= cp["max_uses"]: ok = False
                if cp["min_amount"] and amt < cp["min_amount"]: ok = False
                if ok:
                    if cp["type"] == "percent":
                        amt = amt * (100 - cp["value"]) // 100
                    elif cp["type"] == "fixed":
                        amt = max(0, amt - cp["value"])
                    coupon_id = cp["id"]
        tn = "LN" + str(int(time.time())) + secrets.token_hex(2).upper()
        c.execute("INSERT INTO orders(trade_no,user_id,plan_id,period,total_amount,created_at,method) VALUES(?,?,?,?,?,?,?)",
                  (tn, u["id"], pid, period, amt, int(time.time()), method))
        if coupon_id:
            c.execute("UPDATE coupons SET used = used + 1 WHERE id=?", (coupon_id,))
        c.commit(); c.close()
        ctx["send"]({"data": tn, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/order/checkout" and m == "POST":
        # 只返回支付页 URL，开通走 /user/order/pay + /user/order/query 或 /pay/notify
        u = db.user_by_token(ctx["token"])
        tn = ctx["body"].get("trade_no") or ""
        c = db.connect()
        r = c.execute("SELECT * FROM orders WHERE trade_no=?", (tn,)).fetchone()
        if not r or (u and r["user_id"] != u["id"]):
            c.close(); ctx["send"]({"data": None, "message": "order not found", "status": "fail"}, 400); return True
        c.close()
        ctx["send"]({"data": config.get("base_url", "") + "/pay/" + tn, "message": "", "status": "success"}); return True

    if p == "/api/v1/user/coupon/check" and m == "POST":
        u = db.user_by_token(ctx["token"])
        if not u: ctx["send"]({"data": None, "message": "unauth", "status": "fail"}, 401); return True
        b = ctx["body"]
        code = (b.get("code") or "").strip().upper()
        pid = int(b.get("plan_id") or 0)
        period = b.get("period") or "month_price"
        pl = db.plan_by_id(pid)
        if not pl: ctx["send"]({"data": None, "message": "plan not found", "status": "fail"}, 400); return True
        amt = pl[PRICE_FIELD.get(period, "month_price")] or 0
        c = db.connect()
        cp = c.execute("SELECT * FROM coupons WHERE code=? AND enabled=1", (code,)).fetchone()
        c.close()
        def fail(reason, msg):
            ctx["send"]({"data": {"valid": False, "reason": reason}, "message": msg, "status": "fail"}); return True
        if not cp: return fail("not_found", "优惠码不存在")
        now_ts = int(time.time())
        if cp["expire_at"] and cp["expire_at"] < now_ts: return fail("expired", "优惠码已过期")
        if cp["max_uses"] and cp["used"] >= cp["max_uses"]: return fail("used_up", "优惠码已用尽")
        if cp["min_amount"] and amt < cp["min_amount"]: return fail("min_amount", "未达最低消费")
        if cp["type"] == "percent":
            new_amt = amt * (100 - cp["value"]) // 100
        elif cp["type"] == "fixed":
            new_amt = max(0, amt - cp["value"])
        else:
            new_amt = amt
        ctx["send"]({"data": {"valid": True, "type": cp["type"], "value": cp["value"],
                              "original_amount": amt, "discounted_amount": new_amt},
                     "message": "", "status": "success"}); return True

    return False
