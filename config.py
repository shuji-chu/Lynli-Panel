# -*- coding: utf-8 -*-
"""全局配置：从 config.json 读，环境变量优先。部署时改 config.json 即可。"""
import os, json

_CFG = {}

def _load():
    global _CFG
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
    if os.path.exists(p):
        try:
            with open(p) as f:
                _CFG = json.load(f)
        except Exception:
            _CFG = {}
    # 环境变量覆盖
    for k in list(_CFG.keys()):
        env_key = "LYNLI_" + k.upper()
        if os.environ.get(env_key):
            _CFG[k] = os.environ[env_key]

_load()

def get(key, default=""):
    if key not in _CFG:
        env_key = "LYNLI_" + key.upper()
        if os.environ.get(env_key):
            return os.environ[env_key]
        return default
    return _CFG[key]

def reload():
    _load()
