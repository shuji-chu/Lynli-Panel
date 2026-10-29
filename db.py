import sqlite3, time, hashlib, secrets

import os
DB_PATH = os.environ.get("LYNLI_DB", "/opt/lynli-api/lynli.db")

def connect():
    c = sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA synchronous=NORMAL")
    c.execute("PRAGMA busy_timeout=10000")
    return c

def hash_pw(p):
    return hashlib.sha256(("lynli$" + p).encode()).hexdigest()

def new_token():
    return secrets.token_hex(24)

def init():
    c = connect()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE, password TEXT, uuid TEXT, token TEXT,
      transfer_enable INTEGER DEFAULT 107374182400,
      u INTEGER DEFAULT 0, d INTEGER DEFAULT 0,
      expired_at INTEGER DEFAULT 0, created_at INTEGER,
      plan_id INTEGER DEFAULT 0, banned INTEGER DEFAULT 0,
      short_id VARCHAR(5) UNIQUE, nickname TEXT DEFAULT '', avatar TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS plans(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, content TEXT, transfer_enable INTEGER,
      month_price INTEGER, quarter_price INTEGER,
      half_year_price INTEGER, year_price INTEGER,
      sort INTEGER DEFAULT 1, show INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS banners(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT, link TEXT,
      sort INTEGER DEFAULT 1, show INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS orders(
      trade_no TEXT PRIMARY KEY, user_id INTEGER, plan_id INTEGER,
      period TEXT, total_amount INTEGER, status INTEGER DEFAULT 0,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS invites(
      code TEXT PRIMARY KEY, user_id INTEGER, pv INTEGER DEFAULT 0,
      status INTEGER DEFAULT 1, created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS email_codes(
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expire_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admins(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE, password TEXT, created_at INTEGER
    );
    """)
    # Safe schema upgrades for databases created by older versions.
    user_cols = {r[1] for r in c.execute("PRAGMA table_info(users)").fetchall()}
    for col, ddl in (("short_id", "VARCHAR(5)"), ("nickname", "TEXT DEFAULT ''"), ("avatar", "TEXT DEFAULT ''"), ("avatar_url", "TEXT DEFAULT ''")):
        if col not in user_cols: c.execute("ALTER TABLE users ADD COLUMN %s %s" % (col, ddl))
    plan_cols = {r[1] for r in c.execute("PRAGMA table_info(plans)").fetchall()}
    if "product_type" not in plan_cols: c.execute("ALTER TABLE plans ADD COLUMN product_type TEXT DEFAULT 'node'")
    if "tagline" not in plan_cols: c.execute("ALTER TABLE plans ADD COLUMN tagline TEXT DEFAULT ''")
    if "speed" not in plan_cols: c.execute("ALTER TABLE plans ADD COLUMN speed TEXT DEFAULT ''")
    if "hot" not in plan_cols: c.execute("ALTER TABLE plans ADD COLUMN hot INTEGER DEFAULT 0")
    if "features" not in plan_cols: c.execute("ALTER TABLE plans ADD COLUMN features TEXT DEFAULT '[]'")
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for row in c.execute("SELECT id, short_id FROM users").fetchall():
        sid = str(row["short_id"] or "").strip().upper()
        valid = len(sid) == 5 and all(ch in alphabet for ch in sid)
        if not valid or c.execute("SELECT 1 FROM users WHERE short_id=? AND id<>?", (sid, row["id"])).fetchone():
            for _ in range(100):
                sid = "".join(secrets.choice(alphabet) for _ in range(5))
                if not c.execute("SELECT 1 FROM users WHERE short_id=?", (sid,)).fetchone(): break
            c.execute("UPDATE users SET short_id=? WHERE id=?", (sid, row["id"]))
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_short_id_unique ON users(short_id)")
    if not c.execute("SELECT 1 FROM plans LIMIT 1").fetchone():
        c.executemany("INSERT INTO plans(name,content,transfer_enable,month_price,quarter_price,half_year_price,year_price,sort) VALUES(?,?,?,?,?,?,?,?)", [
          ("\u6708\u4ed8\u5957\u9910", "30\u5929 / 100GB", 107374182400, 1500, 4000, 7500, 15000, 1),
          ("\u5b63\u4ed8\u5957\u9910", "90\u5929 / 300GB", 322122547200, 3800, 11000, 21000, 42000, 2),
          ("\u5e74\u4ed8\u5957\u9910", "365\u5929 / 1TB", 1099511627776, 12000, 34000, 66000, 120000, 3),
        ])
    c.commit()
    c.close()

def user_by_token(tok):
    if not tok: return None
    c = connect()
    # 优先查 user_tokens（多设备）
    r = c.execute("SELECT user_id FROM user_tokens WHERE token=?", (tok,)).fetchone()
    if r:
        u = c.execute("SELECT * FROM users WHERE id=?", (r["user_id"],)).fetchone()
        # 更新 last_used
        try:
            import time as _t
            c.execute("UPDATE user_tokens SET last_used_at=? WHERE token=?", (int(_t.time()), tok))
            c.commit()
        except Exception:
            pass
        c.close()
        return u
    # 兼容旧 users.token
    r = c.execute("SELECT * FROM users WHERE token=?", (tok,)).fetchone()
    c.close()
    return r

def plan_by_id(pid):
    c = connect()
    r = c.execute("SELECT * FROM plans WHERE id=?", (pid,)).fetchone()
    c.close()
    return r

def plan_to_dict(r):
    if not r: return None
    keys = r.keys()
    plan_type = r["type"] if "type" in keys and r["type"] else "monthly"
    m_price = r["month_price"] or 0
    if plan_type == "onetime":
        onetime = m_price
        month = 0
    else:
        onetime = None
        month = m_price
    def _g(k):
        try:
            return r[k]
        except Exception:
            return None

    import json as _json
    feat_raw = _g("features")
    feats = []
    if feat_raw:
        try:
            feats = _json.loads(feat_raw) if isinstance(feat_raw, str) else feat_raw
        except Exception:
            feats = []

    return {"id": r["id"], "group_id": 1, "transfer_enable": r["transfer_enable"],
            "name": r["name"], "type": (_g("product_type") or "node"), "speed_limit": 0, "show": r["show"], "sort": r["sort"], "renew": 1,
            "content": r["content"], "month_price": month,
            "tagline": _g("tagline") or "",
            "speed": _g("speed") or "",
            "hot": int(_g("hot") or 0),
            "features": feats,
            "quarter_price": r["quarter_price"], "half_year_price": r["half_year_price"],
            "year_price": r["year_price"], "two_year_price": 0, "three_year_price": 0,
            "onetime_price": onetime, "reset_price": 0, "reset_traffic_method": "",
            "capacity_limit": 0, "created_at": int(time.time()), "updated_at": int(time.time())}
