#!/usr/bin/env python3
"""scripts/keep-chat.py: the chat proxy forwards the chat run and the conversation list with the token added server-side, fixes the agent, streams,
reaches a thread only if the host lists it for this agent and user, and refuses foreign hosts and origins. Runs against a fake Keep host; needs no runtime."""
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
CALLS = []  # (method, path) of every thread call the proxy made to the host
MINE = "11111111-1111-4111-8111-111111111111"
OTHER_AGENT = "22222222-2222-4222-8222-222222222222"
NO_CLIENT_ID = "33333333-3333-4333-8333-333333333333"
NEVER_LISTED = "44444444-4444-4444-8444-444444444444"
THREADS = {"items": [
    {"id": MINE, "agent": "echo-agent", "user_id": "operator", "client_thread_id": "c-1", "title": "hello", "updated_at": "2026-09-27T10:00:00Z", "message_count": 2, "session_id": "s"},
    {"id": OTHER_AGENT, "agent": "someone-else", "user_id": "operator", "client_thread_id": "c-2", "title": "no", "updated_at": "x", "message_count": 1},
    {"id": NO_CLIENT_ID, "agent": "echo-agent", "user_id": "operator", "client_thread_id": None, "title": "api-made", "updated_at": "x", "message_count": 0},
]}
LIST_STATUS = [200]
FIRST_SENT = threading.Event()
RELEASE = threading.Event()


class Upstream(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, value):
        raw = json.dumps(value).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        CALLS.append(("GET", self.path, self.headers.get("Authorization")))
        if self.path.startswith("/v1/threads?"):
            return self._json(LIST_STATUS[0], THREADS)
        if self.path == f"/v1/threads/{MINE}/messages":
            return self._json(200, {"items": [
                {"id": "msg-1", "role": "user", "text": "<b>hi</b>", "created_at": "2026-09-27T10:00:00Z", "session_id": "s", "event_seq": 3},
                {"id": "msg-2", "role": "assistant", "text": "hello", "created_at": "2026-09-27T10:00:05Z", "session_id": "s", "event_seq": 9},
            ]})
        self._json(404, {"error": "not found"})

    def do_DELETE(self):
        CALLS.append(("DELETE", self.path, self.headers.get("Authorization")))
        self.send_response(204)
        self.end_headers()

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

    def test_the_page_lists_only_this_agents_continuable_conversations(self):
        CALLS.clear()
        r, body, _ = self.req("GET", "/threads")
        self.assertEqual(r.status, 200)
        items = json.loads(body)["items"]
        self.assertEqual([t["id"] for t in items], [MINE], "another agent's thread and one with no client id are not shown")
        self.assertEqual(set(items[0]), {"id", "client_thread_id", "title", "updated_at", "message_count"}, "nothing else of the host's record reaches the page")
        method, path, auth = CALLS[0]
        self.assertEqual(method, "GET")
        self.assertIn("agent=echo-agent", path)
        self.assertIn("user_id=operator", path)
        self.assertEqual(auth, "Bearer SECRET-TOKEN")
        self.assertNotIn(b"SECRET-TOKEN", body)

    def test_messages_are_read_only_for_a_listed_thread_and_carry_only_role_text_and_time(self):
        CALLS.clear()
        r, body, _ = self.req("GET", f"/threads/{MINE}/messages")
        self.assertEqual(r.status, 200)
        self.assertEqual(json.loads(body)["items"], [{"role": "user", "text": "<b>hi</b>", "at": "2026-09-27T10:00:00Z"}, {"role": "assistant", "text": "hello", "at": "2026-09-27T10:00:05Z"}])
        for other in (OTHER_AGENT, NO_CLIENT_ID, NEVER_LISTED):
            CALLS.clear()
            r, _, _ = self.req("GET", f"/threads/{other}/messages")
            self.assertEqual(r.status, 404, other)
            self.assertFalse([c for c in CALLS if other in c[1]], "an unlisted thread is never requested from the host")

    def test_forgetting_a_thread_needs_the_host_to_list_it_and_a_same_origin_request(self):
        CALLS.clear()
        r, _, _ = self.req("DELETE", f"/threads/{MINE}")
        self.assertEqual(r.status, 204)
        self.assertIn(("DELETE", f"/v1/threads/{MINE}", "Bearer SECRET-TOKEN"), CALLS)
        CALLS.clear()
        for other in (OTHER_AGENT, NEVER_LISTED):
            r, _, _ = self.req("DELETE", f"/threads/{other}")
            self.assertEqual(r.status, 404, other)
        self.assertFalse([c for c in CALLS if c[0] == "DELETE"], "nothing was deleted on the host")
        r, _, _ = self.req("DELETE", f"/threads/{MINE}", headers={"Origin": "http://evil.example"})
        self.assertEqual(r.status, 403, "a cross-site delete")
        r, _, _ = self.req("DELETE", f"/threads/{MINE}", headers={"Host": "evil.example"})
        self.assertEqual(r.status, 421)

    def test_thread_paths_cannot_reach_anything_else(self):
        for path in ["/threads/../v1/sessions", "/threads/not-a-uuid", f"/threads/{MINE}/other", f"/threads/{MINE}/messages/x", "/threads//messages", "/threadsx"]:
            r, _, _ = self.req("GET", path)
            self.assertEqual(r.status, 404, path)
        r, _, _ = self.req("DELETE", f"/threads/{MINE}/messages")
        self.assertEqual(r.status, 404, "messages cannot be deleted one by one, or the thread through that path")
        r, _, _ = self.req("DELETE", "/v1/sessions/x")
        self.assertEqual(r.status, 404)
        r, _, _ = self.req("POST", "/threads", b"{}", {"Content-Length": "2"})
        self.assertEqual(r.status, 404, "the page cannot create threads except by chatting")

    def test_a_host_that_cannot_list_threads_is_a_502_not_an_open_door(self):
        LIST_STATUS[0] = 500
        try:
            self.assertEqual(self.req("GET", "/threads")[0].status, 502)
            CALLS.clear()
            self.assertEqual(self.req("GET", f"/threads/{MINE}/messages")[0].status, 502)
            self.assertEqual(self.req("DELETE", f"/threads/{MINE}")[0].status, 502)
            self.assertFalse([c for c in CALLS if c[0] == "DELETE" or "messages" in c[1]])
        finally:
            LIST_STATUS[0] = 200

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
