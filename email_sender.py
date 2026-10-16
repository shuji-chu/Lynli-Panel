# -*- coding: utf-8 -*-
import smtplib
from email.mime.text import MIMEText
from email.utils import formataddr
from email.header import Header

import config
SMTP_HOST = config.get("smtp_host")
SMTP_PORT = int(config.get("smtp_port", 465))
SMTP_USER = config.get("smtp_user")
SMTP_PASS = config.get("smtp_pass")
SENDER_EMAIL = config.get("sender_email")
SENDER_NAME = config.get("sender_name", "Lynli")


def send_verify_code(to_email, code):
    html = """
    <div style="font-family:-apple-system,'PingFang SC',Arial,sans-serif;max-width:560px;margin:0 auto;background:#f5f7fa;">
      <div style="background:#0d1b3d;padding:28px 24px;text-align:center;">
        <img src="{{BASE_URL}}/uploads/logo.png" alt="易搜加速" style="width:72px;height:72px;border-radius:16px;display:inline-block;" />
        <div style="color:#fff;font-size:22px;font-weight:600;letter-spacing:1px;margin-top:12px;">易搜加速</div>
        <div style="color:#8b9bc7;font-size:12px;margin-top:4px;">官方邮件</div>
      </div>
      <div style="background:#fff;padding:40px 32px;">
        <div style="font-size:18px;color:#000;font-weight:600;margin-bottom:16px;">邮箱验证</div>
        <div style="font-size:14px;color:#555;line-height:1.7;margin-bottom:28px;">
          您好，感谢注册 Lynli。请在注册页面输入以下验证码完成邮箱验证：
        </div>
        <div style="background:#f5f8ff;border:1px solid #d9e4ff;border-radius:12px;padding:32px 20px;text-align:center;margin-bottom:28px;">
          <div style="font-size:12px;color:#8b9bc7;margin-bottom:12px;letter-spacing:2px;">验 证 码</div>
          <div style="font-size:38px;font-weight:700;letter-spacing:10px;color:#0d1b3d;font-family:ui-monospace,Menlo,monospace;">""" + code + """</div>
        </div>
        <div style="background:#fff8e8;border-left:3px solid #ffb74d;padding:12px 16px;font-size:13px;color:#8a6d00;line-height:1.6;margin-bottom:24px;">
          <b>验证码 5 分钟内有效。</b>请勿泄露给任何人，Lynli 工作人员不会主动向您索要验证码。
        </div>
        <div style="font-size:13px;color:#999;line-height:1.7;">如非本人操作，请忽略此邮件。</div>
      </div>
      <div style="background:#f5f7fa;padding:24px;text-align:center;font-size:12px;color:#999;line-height:1.6;">
        © 2026 Lynli 易搜加速 · 高性价比全球网络加速服务<br>
        <span style="color:#bbb;">此邮件由系统自动发送，请勿直接回复</span>
      </div>
    </div>
    """
    msg = MIMEText(html, "html", "utf-8")
    msg["Subject"] = Header("易搜加速 邮箱验证码", "utf-8")
    msg["From"] = formataddr((str(Header(SENDER_NAME, "utf-8")), SENDER_EMAIL))
    msg["To"] = to_email
    try:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.login(SMTP_USER, SMTP_PASS)
            s.sendmail(SENDER_EMAIL, [to_email], msg.as_string())
        return True
    except Exception as e:
        print("[email] 发送失败:", e)
        return False


if __name__ == "__main__":
    import sys, random
    target = sys.argv[1] if len(sys.argv) > 1 else "2952974772@qq.com"
    c = "".join([str(random.randint(0, 9)) for _ in range(6)])
    print("发给:", target, "验证码:", c)
    ok = send_verify_code(target, c)
    print("结果:", "成功" if ok else "失败")


def send_custom_mail(to_email, subject, html_body):
    """通用发送：群发/通知用"""
    from email.mime.text import MIMEText
    from email.header import Header
    from email.utils import formataddr
    import smtplib
    msg = MIMEText(html_body, "html", "utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = formataddr((str(Header(SENDER_NAME, "utf-8")), SENDER_EMAIL))
    msg["To"] = to_email
    with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15) as s:
        s.login(SMTP_USER, SMTP_PASS)
        s.sendmail(SENDER_EMAIL, [to_email], msg.as_string())
