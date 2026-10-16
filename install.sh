#!/bin/bash
set -e
echo "=== Lynli Panel 部署 ==="
[ "$EUID" -ne 0 ] && echo "请用 root 运行：sudo bash install.sh" && exit 1
INSTALL_DIR="/opt/lynli-panel"
echo "1/5 装依赖"
apt update -y && apt install -y python3 python3-pip nginx sqlite3 curl
echo "2/5 Python 依赖"
pip3 install --quiet oss2 requests pillow
echo "3/5 拷贝代码"
mkdir -p $INSTALL_DIR && cp -r ./* $INSTALL_DIR/ 2>/dev/null || true
cd $INSTALL_DIR
[ ! -f config.json ] && cp config.example.json config.json && echo "⚠️ 请编辑 $INSTALL_DIR/config.json 后重启服务"
echo "4/5 初始化数据库"
python3 -c "import db; db.init()" || true
echo "5/5 systemd"
cat > /etc/systemd/system/lynli-api.service <<'SVC'
[Unit]
Description=Lynli API Server
After=network.target
[Service]
Type=simple
WorkingDirectory=/opt/lynli-panel
ExecStart=/usr/bin/python3 /opt/lynli-panel/server.py
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
[Install]
WantedBy=multi-user.target
SVC
systemctl daemon-reload && systemctl enable lynli-api && systemctl start lynli-api
echo ""
echo "=== 完成 ==="
echo "后端：http://127.0.0.1:7001"
echo "日志：journalctl -u lynli-api -f"
echo "改配置：vim $INSTALL_DIR/config.json && systemctl restart lynli-api"
