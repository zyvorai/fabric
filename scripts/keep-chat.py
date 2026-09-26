#!/usr/bin/env python3
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
"""keep-chat: a small web chat for a Keep agent, over the AG-UI endpoint (POST /v1/agui).

    KEEP_API=http://127.0.0.1:9096 KEEP_TOKEN=... ./scripts/keep-chat.py --agent echo-agent      # then open http://127.0.0.1:8787

It serves one static page, forwards the chat run (POST /agui) and lets the page list, reopen and forget this agent's conversations
(GET /threads, GET /threads/<id>/messages, DELETE /threads/<id>). Your token stays in this process: the browser never sees it. The agent is
fixed by --agent (the page cannot choose another), and a conversation is reachable only if the Keep host itself lists it for this agent (and,
with the operator token, for --user): the page cannot name any other thread. Nothing else on the Keep host is reachable through it, it listens
on 127.0.0.1 only, and it refuses requests whose Host or Origin is not itself (DNS rebinding and cross-site posts). A chat cannot approve
anything: an approval the agent asks for is shown as a notice, and it is decided on your own device.
"""
import argparse
import http.client
import json
import os
import re
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "keep-chat")
STATIC = {"/": ("index.html", "text/html; charset=utf-8"), "/app.js": ("app.js", "text/javascript; charset=utf-8"), "/app.css": ("app.css", "text/css; charset=utf-8")}
MAX_BODY = 64 * 1024
CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"


def force_agent(body: bytes, agent: str) -> bytes:
    """The browser's request with `forwardedProps.agent` set to the configured agent, whatever the page sent."""
    data = json.loads(body)
    if not isinstance(data, dict):
        raise ValueError("the request must be a JSON object")
    data["forwardedProps"] = {"agent": agent}
    return json.dumps(data).encode()


UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def project_threads(listing, agent: str):
    """What the page needs of the host's thread list: only this agent's threads that a chat can continue (they have a client thread id)."""
    out = []
    for t in (listing or {}).get("items", []):
        if isinstance(t, dict) and t.get("agent") == agent and t.get("client_thread_id") and UUID.fullmatch(str(t.get("id", ""))):
            out.append({k: t.get(k) for k in ("id", "client_thread_id", "title", "updated_at", "message_count")})
    return out


def allowed_host(host_header: str, port: int) -> bool:
    return host_header in (f"127.0.0.1:{port}", f"localhost:{port}")


def make_handler(upstream: str, token: str, agent: str, port: int, user: str = "operator"):
    up = urllib.parse.urlparse(upstream)
    if up.scheme not in ("http", "https") or not up.hostname:
        raise SystemExit("KEEP_API must be an http(s) URL")

    class Handler(BaseHTTPRequestHandler):
        server_version = "keep-chat"

        def log_message(self, fmt, *args):  # quiet: no request bodies, no tokens
            sys.stderr.write("keep-chat: %s\n" % (fmt % args))

        def _send(self, code, body=b"", ctype="text/plain; charset=utf-8", extra=None):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def _upstream(self, method, path):
            """One short call to the Keep host with the token; returns (status, parsed JSON or None)."""
            conn_cls = http.client.HTTPSConnection if up.scheme == "https" else http.client.HTTPConnection
            conn = conn_cls(up.hostname, up.port or (443 if up.scheme == "https" else 80), timeout=30)
            try:
                headers = {"Accept": "application/json"}
                if token:
                    headers["Authorization"] = "Bearer " + token
                conn.request(method, path, headers=headers)
                resp = conn.getresponse()
                raw = resp.read(4 * 1024 * 1024)
                try:
                    return resp.status, json.loads(raw) if raw else None
                except ValueError:
                    return resp.status, None
            finally:
                conn.close()

        def _my_threads(self):
            """This agent's threads for this user, as the Keep host lists them."""
            q = urllib.parse.urlencode({"agent": agent, "user_id": user})
            status, listing = self._upstream("GET", "/v1/threads?" + q)
            if status != 200:
                return None
            return project_threads(listing, agent)

        def _origin_ok(self):
            origin = self.headers.get("Origin")
            if origin is not None and origin not in (f"http://127.0.0.1:{port}", f"http://localhost:{port}"):
                self._send(403, b"cross-origin request refused")
                return False
            return True

        def _json(self, code, value):
            self._send(code, json.dumps(value).encode(), "application/json")

        def _thread_route(self, method, path):
            """/threads, /threads/<id>/messages and DELETE /threads/<id>. The id must be one the host lists for this agent and user."""
            try:
                if path == "/threads" and method == "GET":
                    mine = self._my_threads()
                    return self._json(200, {"items": mine}) if mine is not None else self._send(502, b"the Keep host did not list threads")
                m = re.fullmatch(r"/threads/([0-9a-f-]{36})(/messages)?", path)
                if not m or not UUID.fullmatch(m.group(1)):
                    return self._send(404, b"not found")
                tid, messages = m.group(1), bool(m.group(2))
                if (messages and method != "GET") or (not messages and method != "DELETE"):
                    return self._send(404, b"not found")
                mine = self._my_threads()
                if mine is None:
                    return self._send(502, b"the Keep host did not list threads")
                if tid not in {t["id"] for t in mine}:
                    return self._send(404, b"not found")
                if messages:
                    status, data = self._upstream("GET", f"/v1/threads/{tid}/messages")
                    items = [{"role": x.get("role"), "text": x.get("text"), "at": x.get("created_at")} for x in (data or {}).get("items", []) if isinstance(x, dict)]
                    return self._json(200, {"items": items}) if status == 200 else self._send(502, b"the Keep host did not return messages")
                status, _ = self._upstream("DELETE", f"/v1/threads/{tid}")
                return self._send(204 if status == 204 else 502)
            except (OSError, http.client.HTTPException) as e:
                self._send(502, ("could not reach the Keep host: %s" % e).encode())

        def _host_ok(self):
            if not allowed_host(self.headers.get("Host", ""), port):
                self._send(421, b"misdirected request")
                return False
            return True

        def do_GET(self):
            if not self._host_ok():
                return
            path = self.path.split("?", 1)[0]
            if path == "/threads" or path.startswith("/threads/"):
                return self._thread_route("GET", path)
            item = STATIC.get(path)
            if not item:
                return self._send(404, b"not found")
            name, ctype = item
            with open(os.path.join(HERE, name), "rb") as f:
                body = f.read()
            if name == "index.html":
                body = body.replace(b"{{AGENT}}", agent.encode())
            self._send(200, body, ctype)

        def do_DELETE(self):
            if not self._host_ok() or not self._origin_ok():
                return
            path = self.path.split("?", 1)[0]
            if path.startswith("/threads/"):
                return self._thread_route("DELETE", path)
            self._send(404, b"not found")

        def do_POST(self):
            if not self._host_ok():
                return
            if self.path != "/agui":
                return self._send(404, b"not found")
            if not self._origin_ok():
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self._send(400, b"bad content-length")
            if length <= 0 or length > MAX_BODY:
                return self._send(413, b"the request is empty or too large")
            try:
                payload = force_agent(self.rfile.read(length), agent)
            except (ValueError, json.JSONDecodeError) as e:
                return self._send(400, ("bad request: %s" % e).encode())
            conn_cls = http.client.HTTPSConnection if up.scheme == "https" else http.client.HTTPConnection
            conn = conn_cls(up.hostname, up.port or (443 if up.scheme == "https" else 80), timeout=180)
            try:
                headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
                if token:
                    headers["Authorization"] = "Bearer " + token
                conn.request("POST", "/v1/agui", body=payload, headers=headers)
                resp = conn.getresponse()
                if resp.status != 200:
                    detail = resp.read(4096)
                    return self._send(resp.status, detail, resp.getheader("Content-Type", "text/plain"))
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Security-Policy", CSP)
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Connection", "close")
                self.end_headers()
                while True:
                    chunk = resp.read1(4096)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
            except (OSError, http.client.HTTPException) as e:
                try:
                    self._send(502, ("could not reach the Keep host: %s" % e).encode())
                except OSError:
                    pass
            finally:
                conn.close()
            self.close_connection = True

    return Handler


def main():
    ap = argparse.ArgumentParser(description="a small web chat for a Keep agent over AG-UI")
    ap.add_argument("--agent", required=True, help="the deployed Keep agent to talk to")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--user", default="operator", help="whose conversations to list: with the operator token AG-UI runs as 'operator' (the default); with a user token the host scopes to that user and this is ignored")
    args = ap.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,39}", args.agent):
        raise SystemExit("--agent must be a pack name: lowercase letters, digits and '-'")
    upstream = os.environ.get("KEEP_API", "http://127.0.0.1:9096")
    token = os.environ.get("KEEP_TOKEN", "")
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(upstream, token, args.agent, args.port, args.user))
    print(f"keep-chat: agent '{args.agent}' on {upstream}. Open http://127.0.0.1:{args.port}   (Ctrl-C to stop)", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
