#!/usr/bin/env python3
# Local server for AUX/KEYS — serves the static app plus small endpoints for
# broadcasting the live chord chart to a bandmate's phone on the same WiFi.
# Standard library only; no dependencies to install.
import http.server
import json
import socketserver
import sys
import threading
from urllib.parse import urlsplit

STATE = {"chord": "--", "style": "", "bpm": 0, "mode": "", "key": "--", "updatedAt": 0}
STATE_LOCK = threading.Lock()
MAX_UPDATE_BYTES = 4096
STRING_FIELDS = {"chord": 80, "style": 80, "mode": 40, "key": 80}
STATIC_FILES = {
    "/", "/index.html", "/chart.html", "/pitch-processor.js", "/manifest.json", "/sw.js",
    "/icon-192.png", "/icon-512.png", "/icon-512-maskable.png",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def _send_json(self, status, value):
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/state":
            with STATE_LOCK:
                snapshot = dict(STATE)
            self._send_json(200, snapshot)
        elif path in STATIC_FILES:
            super().do_GET()
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != "/update":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400, "invalid Content-Length")
            return
        if length < 0:
            self.send_error(400, "invalid Content-Length")
            return
        if length > MAX_UPDATE_BYTES:
            self.send_error(413, "update is too large")
            return

        try:
            data = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_error(400, "invalid JSON")
            return
        if not isinstance(data, dict):
            self.send_error(400, "update must be a JSON object")
            return

        allowed = set(STRING_FIELDS) | {"bpm", "updatedAt"}
        if set(data) - allowed:
            self.send_error(400, "unknown update field")
            return
        for field, max_length in STRING_FIELDS.items():
            if field in data and (not isinstance(data[field], str) or len(data[field]) > max_length):
                self.send_error(400, "invalid " + field)
                return
        if "bpm" in data and (type(data["bpm"]) is not int or not 0 <= data["bpm"] <= 400):
            self.send_error(400, "invalid bpm")
            return
        if "updatedAt" in data and (type(data["updatedAt"]) not in (int, float) or not 0 <= data["updatedAt"] <= 1e16):
            self.send_error(400, "invalid updatedAt")
            return

        with STATE_LOCK:
            STATE.update(data)
        self.send_response(204)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def log_message(self, format, *args):
        pass  # keep the server console quiet


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    # Bind all interfaces so other devices on the same WiFi can open chart.html.
    with socketserver.ThreadingTCPServer(("0.0.0.0", port), Handler) as httpd:
        print(f"Serving on 0.0.0.0:{port} (chord-chart endpoints: POST /update, GET /state)")
        httpd.serve_forever()
