import base64
import http.client
import json
import shutil
import smtplib
import tempfile
import threading
import unittest
import uuid
from pathlib import Path

from application_mail import MailDelivery, create_server, prepare_message


def payload():
    return {"operationId": str(uuid.uuid4()), "provider": "qq", "account": "synthetic@qq.com",
            "authorizationCode": "synthetic-authorization", "subject": "应聘实习生-合成人员", "body": "合成邮件正文",
            "to": "untrusted@example.test",
            "job": {"jobId": "c40dc81a-a9e0-4066-ac6c-29d489587294", "title": "Discovery Biology Intern",
                    "jobUrl": "https://www.antengene.com/school.html"},
            "attachment": {"filename": "合成简历.pdf", "base64": base64.b64encode(b"%PDF-1.4 synthetic attachment").decode()}}


class FakeSMTP:
    calls = []
    error = None
    entered = None
    release = None

    def __init__(self, host, port, timeout, context):
        assert host == "smtp.qq.com" and port == 465 and timeout == 15
        assert context.check_hostname and context.verify_mode != 0

    def login(self, account, password):
        assert account == "synthetic@qq.com" and password == "synthetic-authorization"
        if self.error == "auth":
            raise smtplib.SMTPAuthenticationError(535, b"synthetic rejection")

    def send_message(self, message):
        self.calls.append(message)
        if self.entered:
            self.entered.set()
            self.release.wait(5)
        if self.error == "network":
            raise OSError("synthetic response lost after DATA")
        if self.error == "reject":
            raise smtplib.SMTPDataError(554, b"synthetic rejected DATA")
        return {}

    def close(self):
        pass


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.directory = Path(tempfile.mkdtemp(prefix="knowvia-mail-test-")).resolve()
        self.assertEqual(self.directory.parent, Path(tempfile.gettempdir()).resolve())
        self.database = self.directory / "receipts.sqlite"
        FakeSMTP.calls = []
        FakeSMTP.error = None
        FakeSMTP.entered = None
        FakeSMTP.release = None
        self.delivery = MailDelivery(self.database, FakeSMTP)

    def tearDown(self):
        self.assertEqual(self.directory.parent, Path(tempfile.gettempdir()).resolve())
        self.assertTrue(self.directory.name.startswith("knowvia-mail-test-"))
        shutil.rmtree(self.directory)

    def test_send_fixed_official_recipient_and_attachment(self):
        request = payload()
        receipt = self.delivery.send(request)
        self.assertEqual(receipt["state"], "sent")
        message = FakeSMTP.calls[0]
        self.assertEqual(message["To"], "recruitment@antengene.com")
        self.assertEqual(str(message["Subject"]), request["subject"])
        attachment = next(message.iter_attachments())
        self.assertEqual(attachment.get_filename(), "合成简历.pdf")
        self.assertEqual(attachment.get_payload(decode=True), base64.b64decode(request["attachment"]["base64"]))
        self.assertNotIn(request["authorizationCode"], message.as_string())
        self.assertTrue(message.as_bytes().isascii())

    def test_second_official_channel(self):
        request = payload()
        request["job"]["jobUrl"] = "https://zhy-ep.com/html/renli/zhaopin/"
        self.assertEqual(prepare_message(request)[2]["To"], "zhyhbkj@163.com")

    def test_same_operation_survives_restart_without_sending_twice(self):
        request = payload()
        self.delivery.send(request)
        again = MailDelivery(self.database, FakeSMTP).send(request)
        self.assertEqual(again["state"], "sent")
        self.assertEqual(len(FakeSMTP.calls), 1)
        stored = self.database.read_bytes()
        for text in (request["authorizationCode"], request["body"], request["account"], request["subject"]):
            self.assertNotIn(text.encode(), stored)

    def test_same_operation_rejects_changed_content(self):
        request = payload()
        self.delivery.send(request)
        request["body"] = "另一份正文"
        with self.assertRaises(ValueError):
            self.delivery.send(request)
        self.assertEqual(len(FakeSMTP.calls), 1)

    def test_inflight_duplicate_returns_pending(self):
        FakeSMTP.entered = threading.Event()
        FakeSMTP.release = threading.Event()
        request = payload()
        thread = threading.Thread(target=lambda: self.delivery.send(request))
        thread.start()
        try:
            self.assertTrue(FakeSMTP.entered.wait(3))
            self.assertEqual(self.delivery.send(request)["state"], "pending")
            self.assertEqual(len(FakeSMTP.calls), 1)
        finally:
            FakeSMTP.release.set()
            thread.join(5)
        self.assertEqual(self.delivery.receipt(request["operationId"])["state"], "sent")

    def test_authentication_failure_has_no_data_send(self):
        FakeSMTP.error = "auth"
        request = payload()
        self.assertEqual(self.delivery.send(request)["state"], "failed")
        self.assertEqual(FakeSMTP.calls, [])
        FakeSMTP.error = None
        self.assertEqual(self.delivery.send(request)["state"], "failed")
        self.assertEqual(FakeSMTP.calls, [])

    def test_network_after_data_stays_unknown_on_retry_and_restart(self):
        FakeSMTP.error = "network"
        request = payload()
        self.assertEqual(self.delivery.send(request)["state"], "unknown")
        self.assertEqual(MailDelivery(self.database, FakeSMTP).send(request)["state"], "unknown")
        self.assertEqual(len(FakeSMTP.calls), 1)

    def test_explicit_data_rejection_is_failed(self):
        FakeSMTP.error = "reject"
        self.assertEqual(self.delivery.send(payload())["state"], "failed")

    def test_crashed_sending_record_is_unknown_and_not_replayed(self):
        request = payload()
        operation, fingerprint, *_ = prepare_message(request)
        with self.delivery.connect() as connection:
            connection.execute("INSERT INTO receipts VALUES (?, ?, 'sending', 'synthetic-id')", (operation, fingerprint))
        self.assertEqual(self.delivery.send(request)["state"], "unknown")
        self.assertEqual(FakeSMTP.calls, [])

    def test_untrusted_sources_and_provider_mismatch_are_rejected(self):
        for address in ("http://www.antengene.com/school.html", "https://www.antengene.com.evil.test/school.html",
                        "https://u:p@www.antengene.com/school.html", "https://www.antengene.com:8443/school.html",
                        "https://127.0.0.1/school.html", "https://www.antengene.com/other.html"):
            with self.subTest(address=address), self.assertRaises(ValueError):
                request = payload()
                request["job"]["jobUrl"] = address
                prepare_message(request)
        request = payload()
        request["account"] = "synthetic@163.com"
        with self.assertRaises(ValueError):
            prepare_message(request)

    def test_injection_bad_attachment_and_oversize_are_rejected(self):
        for field in ("subject", "account", "authorizationCode"):
            request = payload()
            request[field] += "\r\nBcc: untrusted@example.test"
            with self.subTest(field=field), self.assertRaises(ValueError):
                prepare_message(request)
        for change in ({"filename": "../resume.pdf"}, {"filename": "resume.exe"}, {"base64": "***"},
                       {"base64": base64.b64encode(b"executable").decode()}, {"base64": "A" * 14000000}):
            request = payload()
            request["attachment"].update(change)
            with self.subTest(change=list(change)), self.assertRaises(ValueError):
                prepare_message(request)

    def test_http_requires_origin_token_host_and_returns_value_free_receipt(self):
        server = create_server(0, self.delivery)
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        port = server.server_port

        def call(method, path, data=None, headers=None):
            client = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            client.request(method, path, body=json.dumps(data) if data is not None else None, headers=headers or {})
            response = client.getresponse()
            status, content = response.status, json.loads(response.read())
            client.close()
            return status, content

        try:
            token = call("GET", "/api/applications/v1/status")[1]["token"]
            for origin in ("http://localhost:5174", "http://127.0.0.1:5174"):
                self.assertEqual(call("GET", "/api/applications/v1/status", headers={"Origin": origin})[0], 200)
            valid = {"Origin": "http://127.0.0.1:5197", "Content-Type": "application/json", "X-Knowvia-Mail-Token": token}
            request = payload()
            for change in ({"Origin": "https://evil.test"}, {"Origin": "null"}, {"X-Knowvia-Mail-Token": "bad"}, {"Host": "evil.test"}):
                self.assertEqual(call("POST", "/api/applications/v1/email/send", request, {**valid, **change})[0], 403)
            self.assertEqual(FakeSMTP.calls, [])
            self.assertEqual(call("POST", "/api/applications/v1/email/send", request, valid)[1]["state"], "sent")
            status, receipt = call("GET", f"/api/applications/v1/email/status/{request['operationId']}", headers=valid)
            self.assertEqual(status, 200)
            self.assertEqual(set(receipt), {"operationId", "state", "message"})
            self.assertEqual(call("POST", "/api/applications/v1/email/send", request, valid)[1]["state"], "sent")
            self.assertEqual(len(FakeSMTP.calls), 1)
            self.assertEqual(call("GET", "/api/applications/v1/status", headers={"Origin": "https://evil.test"})[0], 403)
            self.assertEqual(call("GET", "/api/applications/v1/email/status/invalid", headers=valid)[0], 404)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(3)


if __name__ == "__main__":
    unittest.main()
