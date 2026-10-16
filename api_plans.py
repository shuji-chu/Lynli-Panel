import db

def handle(ctx):
    if ctx["path"] != "/api/v1/user/plan/fetch": return False
    c = db.connect()
    rows = c.execute("SELECT * FROM plans WHERE show=1 ORDER BY sort").fetchall()
    c.close()
    ctx["send"]({"data": [db.plan_to_dict(r) for r in rows], "message": "", "status": "success"})
    return True
