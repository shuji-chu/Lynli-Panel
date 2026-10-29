#!/usr/bin/env python3
import json
from urllib.parse import parse_qsl
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

import db
import api_config, api_auth, api_user, api_plans, api_orders, api_misc, api_admin, api_bots, api_pay, api_extra, api_oauth, api_captcha, api_upload

PORT = 7001
MODULES = [api_extra, api_oauth, api_captcha, api_config, api_auth, api_user, api_plans, api_orders, api_misc, api_admin, api_bots, api_pay, api_upload]

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _send(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Requested-With")
        self.end_headers()
        self.wfile.write(body)

    def _raw_send(self, data, content_type="text/plain; charset=utf-8"):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def _ctx(self, method):
        p = self.path.split("?")[0]
        q = {}
        if "?" in self.path:
            for kv in self.path.split("?", 1)[1].split("&"):
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    q[k] = v
        ln = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(ln) if ln else b""
        ctype = (self.headers.get("Content-Type", "") or "").lower()
        if "application/x-www-form-urlencoded" in ctype:
            body = dict(parse_qsl(raw.decode("utf-8", "ignore")))
        else:
            try:
                body = json.loads(raw) if raw else {}
            except Exception:
                body = {}
        return {
            "path": p, "method": method, "query": q, "body": body,
            "host": self.headers.get("Host", ""),
            "token": (self.headers.get("Authorization", "") or "").replace("Bearer ", "").strip() or None,
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "send": self._send,
            "raw_send": self._raw_send,
        }

    def do_GET(self):
        # 静态文件 /uploads/xxx
        if self.path.startswith("/uploads/"):
            import os, mimetypes
            fp = "/opt/lynli-api" + self.path.split("?")[0]
            if os.path.isfile(fp):
                try:
                    with open(fp, "rb") as f:
                        data = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", mimetypes.guess_type(fp)[0] or "application/octet-stream")
                    self.send_header("Content-Length", str(len(data)))
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(data)
                    return
                except Exception:
                    pass
            self.send_response(404); self.end_headers(); return

        ctx = self._ctx("GET")
        for m in MODULES:
            if m.handle(ctx): return
        self._send({"data": None, "message": "ok", "status": "success", "code": 1})

    def do_POST(self):
        ctx = self._ctx("POST")
        for m in MODULES:
            if m.handle(ctx): return
        self._send({"data": None, "message": "ok", "status": "success"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

if __name__ == "__main__":
    db.init()
    print("Lynli API on :%d" % PORT)
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
