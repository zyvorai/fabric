#!/usr/bin/env python3
"""scripts/keep-chat.py: the chat proxy forwards exactly one route with the token added server-side, fixes the agent, streams, and refuses
foreign hosts and origins. Runs against a fake Keep host; needs no runtime."""
import http.client
import importlib.util
import json
import os
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
spec = importlib.util.spec_from_file_location("keep_chat", os.path.join(ROOT, "scripts", "keep-chat.py"))
keep_chat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(keep_chat)

SEEN = {}
FIRST_SENT = threading.Event()
RELEASE = threading.Event()


class Upstream(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        data = json.loads(body)
        SEEN["auth"] = self.headers.get("Authorization")
        SEEN["path"] = self.path
        SEEN["body"] = data
        if data.get("threadId") == "ended":
            self.send_response(409)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"this thread\'s session has ended; start a new thread"}')
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        self.wfile.write(b'data: {"type":"RUN_STARTED","threadId":"t","runId":"r"}\n\n')
        self.wfile.flush()
        FIRST_SENT.set()
        RELEASE.wait(5)  # the second event is held back until the test has seen the first one arrive
        self.wfile.write(b'data: {"type":"RUN_FINISHED","threadId":"t","runId":"r","result":"ok"}\n\n')
        self.wfile.flush()


def serve(handler, port=0):
    srv = ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class ChatProxy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.up = serve(Upstream)
        probe = ThreadingHTTPServer(("127.0.0.1", 0), BaseHTTPRequestHandler)
        cls.port = probe.server_address[1]
        probe.server_close()
        handler = keep_chat.make_handler(f"http://127.0.0.1:{cls.up.server_address[1]}", "SECRET-TOKEN", "echo-agent", cls.port)
        cls.proxy = serve(handler, cls.port)

    @classmethod
    def tearDownClass(cls):
        cls.proxy.shutdown()
        cls.up.shutdown()

    def req(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Host": f"127.0.0.1:{self.port}"}
        h.update(headers or {})
        c.request(method, path, body=body, headers=h)
        r = c.getresponse()
        return r, r.read(), c

    def test_the_page_is_served_with_the_agent_and_a_strict_csp(self):
        r, body, _ = self.req("GET", "/")
        self.assertEqual(r.status, 200)
        self.assertIn(b"echo-agent", body)
        self.assertNotIn(b"{{AGENT}}", body)
        self.assertIn("default-src 'none'", r.getheader("Content-Security-Policy"))
        self.assertEqual(self.req("GET", "/app.js")[0].status, 200)
        self.assertEqual(self.req("GET", "/app.css")[0].status, 200)

    def test_only_the_page_and_agui_exist(self):
        for path in ["/v1/sessions", "/v1/agents", "/../etc/passwd", "/agui", "/app.js/../x"]:
            r, _, _ = self.req("GET", path)
            self.assertEqual(r.status, 404, path)
        r, _, _ = self.req("POST", "/v1/sessions", b"{}", {"Content-Length": "2"})
        self.assertEqual(r.status, 404)

    def test_the_token_is_added_on_the_server_and_the_agent_is_fixed(self):
        FIRST_SENT.clear(); RELEASE.set()
        payload = json.dumps({"threadId": "t1", "runId": "r1", "messages": [{"role": "user", "content": "hi"}], "forwardedProps": {"agent": "other-agent", "x": 1}}).encode()
        r, body, _ = self.req("POST", "/agui", payload, {"Content-Type": "application/json", "Content-Length": str(len(payload))})
        self.assertEqual(r.status, 200)
        self.assertEqual(SEEN["auth"], "Bearer SECRET-TOKEN")
        self.assertEqual(SEEN["path"], "/v1/agui")
        self.assertEqual(SEEN["body"]["forwardedProps"], {"agent": "echo-agent"}, "the page cannot choose another agent or pass other props")
        self.assertEqual(SEEN["body"]["threadId"], "t1")
        self.assertEqual(SEEN["body"]["messages"][0]["content"], "hi")
        self.assertNotIn(b"SECRET-TOKEN", body)
        self.assertNotIn("SECRET-TOKEN", json.dumps(dict(r.getheaders())))

    def test_events_are_streamed_as_they_arrive(self):
        FIRST_SENT.clear(); RELEASE.clear()
        payload = json.dumps({"threadId": "t2", "runId": "r2", "messages": [{"role": "user", "content": "hi"}]}).encode()
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        c.request("POST", "/agui", body=payload, headers={"Host": f"127.0.0.1:{self.port}", "Content-Length": str(len(payload))})
        r = c.getresponse()
        first = r.read1(4096)  # must arrive while the upstream is still holding back the second event
        self.assertIn(b"RUN_STARTED", first)
        self.assertFalse(RELEASE.is_set())
        RELEASE.set()
        rest = b""
        deadline = time.time() + 5
        while b"RUN_FINISHED" not in rest and time.time() < deadline:
            rest += r.read1(4096)
        self.assertIn(b"RUN_FINISHED", rest)
        c.close()

    def test_a_foreign_host_or_origin_is_refused(self):
        r, _, _ = self.req("GET", "/", headers={"Host": "evil.example"})
        self.assertEqual(r.status, 421, "DNS rebinding")
        payload = b'{"threadId":"t","runId":"r","messages":[]}'
        r, _, _ = self.req("POST", "/agui", payload, {"Origin": "http://evil.example", "Content-Length": str(len(payload))})
        self.assertEqual(r.status, 403, "a cross-site post")
        r, _, _ = self.req("POST", "/agui", payload, {"Host": "evil.example", "Content-Length": str(len(payload))})
        self.assertEqual(r.status, 421)

    def test_bad_requests_are_refused_before_the_host_is_called(self):
        r, _, _ = self.req("POST", "/agui", b"", {"Content-Length": "0"})
        self.assertEqual(r.status, 413)
        big = b"x" * (keep_chat.MAX_BODY + 1)
        r, _, _ = self.req("POST", "/agui", big, {"Content-Length": str(len(big))})
        self.assertEqual(r.status, 413)
        for bad in (b"not json", b"[1,2]"):
            r, _, _ = self.req("POST", "/agui", bad, {"Content-Length": str(len(bad))})
            self.assertEqual(r.status, 400, bad)

    def test_an_error_from_the_host_is_passed_through(self):
        payload = b'{"threadId":"ended","runId":"r","messages":[{"role":"user","content":"x"}]}'
        r, body, _ = self.req("POST", "/agui", payload, {"Content-Length": str(len(payload))})
        self.assertEqual(r.status, 409)
        self.assertIn(b"has ended", body)

    def test_force_agent_and_host_checks(self):
        self.assertEqual(json.loads(keep_chat.force_agent(b'{"a":1,"forwardedProps":{"agent":"z"}}', "y")), {"a": 1, "forwardedProps": {"agent": "y"}})
        with self.assertRaises(ValueError):
            keep_chat.force_agent(b'[1]', "y")
        self.assertTrue(keep_chat.allowed_host("127.0.0.1:8787", 8787))
        self.assertTrue(keep_chat.allowed_host("localhost:8787", 8787))
        self.assertFalse(keep_chat.allowed_host("127.0.0.1:9999", 8787))
        self.assertFalse(keep_chat.allowed_host("evil.example", 8787))


if __name__ == "__main__":
    unittest.main(verbosity=2)
