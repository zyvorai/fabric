#!/usr/bin/env python3
# Copyright 2026 Zyvor AI Labs · https://zyvor.dev
# SPDX-License-Identifier: Apache-2.0
"""keep-chat: a small web chat for a Keep agent, over the AG-UI endpoint (POST /v1/agui).

    KEEP_API=http://127.0.0.1:9096 KEEP_TOKEN=... ./scripts/keep-chat.py --agent echo-agent      # then open http://127.0.0.1:8787

It serves one static page and forwards exactly one route. Your token stays in this process: the browser never sees it. The agent is fixed
by --agent (the page cannot choose another). Nothing else on the Keep host is reachable through it, it listens on 127.0.0.1 only, and it
refuses requests whose Host or Origin is not itself (DNS rebinding and cross-site posts). A chat cannot approve anything: an approval the
agent asks for is shown as a notice, and it is decided on your own device.
"""
import argparse
import http.client
import json
import os
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


def allowed_host(host_header: str, port: int) -> bool:
    return host_header in (f"127.0.0.1:{port}", f"localhost:{port}")


def make_handler(upstream: str, token: str, agent: str, port: int):
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

        def _host_ok(self):
            if not allowed_host(self.headers.get("Host", ""), port):
                self._send(421, b"misdirected request")
                return False
            return True

        def do_GET(self):
            if not self._host_ok():
                return
            item = STATIC.get(self.path.split("?", 1)[0])
            if not item:
                return self._send(404, b"not found")
            name, ctype = item
            with open(os.path.join(HERE, name), "rb") as f:
                body = f.read()
            if name == "index.html":
                body = body.replace(b"{{AGENT}}", agent.encode())
            self._send(200, body, ctype)

        def do_POST(self):
            if not self._host_ok():
                return
            if self.path != "/agui":
                return self._send(404, b"not found")
            origin = self.headers.get("Origin")
            if origin is not None and origin not in (f"http://127.0.0.1:{port}", f"http://localhost:{port}"):
                return self._send(403, b"cross-origin request refused")
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
    args = ap.parse_args()
    import re
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,39}", args.agent):
        raise SystemExit("--agent must be a pack name: lowercase letters, digits and '-'")
    upstream = os.environ.get("KEEP_API", "http://127.0.0.1:9096")
    token = os.environ.get("KEEP_TOKEN", "")
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(upstream, token, args.agent, args.port))
    print(f"keep-chat: agent '{args.agent}' on {upstream}. Open http://127.0.0.1:{args.port}   (Ctrl-C to stop)", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
