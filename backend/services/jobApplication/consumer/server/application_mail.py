"""Local-only employer email delivery. Credentials and attachments stay in memory."""

import argparse
import base64
import hashlib
import hmac
import json
import re
import secrets
import smtplib
import sqlite3
import ssl
import threading
import uuid
from contextlib import contextmanager
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import formatdate, make_msgid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

CONFIG = json.loads((Path(__file__).resolve().parents[5] / "zhitu/src/api/jobApplication/applicationChannels.json").read_text(encoding="utf-8"))
PROVIDERS = {item["id"]: item for item in CONFIG["providers"]}
ORIGINS = {f"http://{host}:{port}" for host in ("127.0.0.1", "localhost") for port in (5174, 5186, 5197, 4173)}
MAX_ATTACHMENT = 10 * 1024 * 1024
MAX_REQUEST = 14 * 1024 * 1024
EMAIL = re.compile(r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}\Z")
MESSAGES = {
    "sent": "邮件服务器已接受发送，请在发件邮箱查看后续回执。",
    "failed": "邮件发送失败，请检查邮箱授权、附件及收件状态后准备重新发送。",
    "pending": "邮件正在发送，请稍后查询发送结果。",
    "unknown": "发送结果待确认，请先核对发件邮箱及回执，避免重复发送。",
}


def checked_text(value, maximum, multiline=False):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError("邮件字段为空或超过长度限制。")
    invalid = r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]" if multiline else r"[\x00-\x1f\x7f]"
    if re.search(invalid, value):
        raise ValueError("邮件字段包含无效控制字符。")
    return value.strip()


def prepare_message(payload):
    operation_id = str(uuid.UUID(payload.get("operationId", "")))
    job = payload.get("job", {})
    address = checked_text(job.get("jobUrl"), 6000)
    url = urlsplit(address)
    if url.scheme != "https" or url.username or url.password or url.port not in (None, 443):
        raise ValueError("官网邮箱来源无效。")
    channel = next((item for item in CONFIG["channels"]
                    if item["origin"] == f"https://{url.hostname}" and item["pathname"] == url.path), None)
    if not channel:
        raise ValueError("该岗位的招聘邮箱尚待核对。")
    uuid.UUID(job.get("jobId", ""))
    checked_text(job.get("title"), 200)
    provider = PROVIDERS.get(payload.get("provider"))
    account = checked_text(payload.get("account"), 254)
    if not provider or not EMAIL.fullmatch(account) or account.rsplit("@", 1)[1].lower() not in provider["domains"]:
        raise ValueError("发件邮箱与所选发件服务不匹配。")
    authorization = checked_text(payload.get("authorizationCode"), 256)
    subject = checked_text(payload.get("subject"), 250)
    body = checked_text(payload.get("body"), 16000, multiline=True)
    attachment = payload.get("attachment", {})
    filename = checked_text(attachment.get("filename"), 200)
    if "/" in filename or "\\" in filename:
        raise ValueError("附件名称无效。")
    encoded = attachment.get("base64")
    if not isinstance(encoded, str) or len(encoded) > (MAX_ATTACHMENT + 2) // 3 * 4:
        raise ValueError("请选择10MB以内的简历附件。")
    content = base64.b64decode(encoded, validate=True)
    extension = Path(filename).suffix.lower()
    valid_file = {".pdf": (b"%PDF-", "application/pdf"), ".docx": (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                  ".doc": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "application/msword")}.get(extension)
    if not valid_file or not content.startswith(valid_file[0]) or not 0 < len(content) <= MAX_ATTACHMENT:
        raise ValueError("附件需为有效的 PDF 或 Word 文件，大小不超过10MB。")
    message = EmailMessage(policy=SMTP)
    message["From"] = account
    message["To"] = channel["recipient"]
    message["Subject"] = subject
    message["Date"] = formatdate(localtime=False)
    message["Message-ID"] = make_msgid(idstring=operation_id, domain=account.rsplit("@", 1)[1])
    message.set_content(body, cte="quoted-printable")
    main_type, subtype = valid_file[1].split("/", 1)
    message.add_attachment(content, maintype=main_type, subtype=subtype, filename=filename)
    fingerprint = hashlib.sha256(json.dumps([job["jobId"], channel["id"], account, subject, body, filename,
                                             hashlib.sha256(content).hexdigest()], ensure_ascii=False).encode()).hexdigest()
    return operation_id, fingerprint, message, provider, authorization


class MailDelivery:
    def __init__(self, database, smtp_factory=smtplib.SMTP_SSL):
        self.database = str(database)
        Path(database).parent.mkdir(parents=True, exist_ok=True)
        self.smtp_factory = smtp_factory
        self.lock = threading.Lock()
        self.running = set()
        with self.connect() as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS receipts (operation_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, state TEXT NOT NULL, message_id TEXT NOT NULL)")

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.database, timeout=10)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def receipt(self, operation_id):
        operation_id = str(uuid.UUID(operation_id))
        with self.lock, self.connect() as connection:
            row = connection.execute("SELECT state FROM receipts WHERE operation_id = ?", (operation_id,)).fetchone()
            if not row:
                raise LookupError("尚未记录该操作，请核对页面提示。")
            state = row[0]
            if state == "sending":
                state = "pending" if operation_id in self.running else "unknown"
            return {"operationId": operation_id, "state": state, "message": MESSAGES[state]}

    def send(self, payload):
        operation_id, fingerprint, message, provider, authorization = prepare_message(payload)
        with self.lock, self.connect() as connection:
            existing = connection.execute("SELECT fingerprint FROM receipts WHERE operation_id = ?", (operation_id,)).fetchone()
            if existing and existing[0] != fingerprint:
                raise ValueError("该发送操作内容已变更，请重新准备邮件。")
            if not existing:
                connection.execute("INSERT INTO receipts VALUES (?, ?, 'sending', ?)", (operation_id, fingerprint, str(message["Message-ID"])))
                self.running.add(operation_id)
        if existing:
            return self.receipt(operation_id)
        client = None
        sending_data = False
        state = "failed"
        try:
            client = self.smtp_factory(provider["host"], provider["port"], timeout=15, context=ssl.create_default_context())
            client.login(str(message["From"]), authorization)
            sending_data = True
            refused = client.send_message(message)
            state = "failed" if refused else "sent"
        except (smtplib.SMTPAuthenticationError, smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused, smtplib.SMTPDataError):
            state = "failed"
        except (OSError, smtplib.SMTPException):
            state = "unknown" if sending_data else "failed"
        except Exception:
            state = "unknown" if sending_data else "failed"
        finally:
            if client:
                try:
                    client.close()
                except (OSError, smtplib.SMTPException):
                    pass
        with self.lock, self.connect() as connection:
            connection.execute("UPDATE receipts SET state = ? WHERE operation_id = ?", (state, operation_id))
            self.running.discard(operation_id)
        return self.receipt(operation_id)


def create_server(port, delivery):
    token = secrets.token_urlsafe(32)
    slots = threading.BoundedSemaphore(4)

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(20)

        def log_message(self, *args):
            pass

        def reply(self, status, value):
            content = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def allowed(self, require_token):
            host = self.headers.get("Host")
            origin = self.headers.get("Origin")
            if host not in {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}:
                return False
            if origin and origin not in ORIGINS:
                return False
            if require_token and not hmac.compare_digest(self.headers.get("X-Knowvia-Mail-Token", ""), token):
                return False
            return True

        def do_GET(self):
            if not self.allowed(self.path != "/api/applications/v1/status"):
                self.reply(403, {"error": "邮件服务来源验证失败。"})
                return
            if self.path == "/api/applications/v1/status":
                self.reply(200, {"ready": True, "token": token})
                return
            if self.path.startswith("/api/applications/v1/email/status/"):
                try:
                    self.reply(200, delivery.receipt(self.path.rsplit("/", 1)[1]))
                except (ValueError, LookupError):
                    self.reply(404, {"error": "尚未记录该操作，请核对页面提示。"})
                return
            self.reply(404, {"error": "邮件接口不存在。"})

        def do_POST(self):
            if not self.allowed(True) or self.headers.get("Origin") not in ORIGINS:
                self.reply(403, {"error": "邮件服务来源验证失败。"})
                return
            if self.path != "/api/applications/v1/email/send":
                self.reply(404, {"error": "邮件接口不存在。"})
                return
            if self.headers.get("Content-Type", "").split(";", 1)[0] != "application/json" or self.headers.get("Transfer-Encoding"):
                self.reply(400, {"error": "邮件请求格式无效。"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if not 0 < length <= MAX_REQUEST:
                self.reply(413, {"error": "邮件请求大小超出限制。"})
                return
            if not slots.acquire(blocking=False):
                self.reply(429, {"error": "邮件服务正在处理请求，请稍后重试。"})
                return
            try:
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError("邮件请求格式无效。")
                self.reply(200, delivery.send(payload))
            except (ValueError, TypeError, AttributeError, KeyError):
                self.reply(400, {"error": "邮件参数、邮箱来源或附件无效，请核对后重试。"})
            except Exception:
                self.reply(500, {"error": "发送结果待确认，请查询发送状态。"})
            finally:
                slots.release()

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5199)
    parser.add_argument("--database", type=Path, default=Path(__file__).resolve().parents[3] / ".local-preview/application-mail/receipts.sqlite")
    arguments = parser.parse_args()
    server = create_server(arguments.port, MailDelivery(arguments.database))
    print(f"Application mail API listening on 127.0.0.1:{server.server_port}", flush=True)
    server.serve_forever()
