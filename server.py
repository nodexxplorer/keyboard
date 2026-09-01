#!/usr/bin/env python3
# Local server for AUX/KEYS — serves the static app (same as `python3 -m http.server`)
# plus two small endpoints for live chord-chart broadcast to a bandmate's phone on
# the same WiFi network: POST /update (from the app) and GET /state (from chart.html).
# Standard library only, no dependencies to install.
import http.server
import json
import socketserver
import sys
import threading

STATE = {"chord": "--", "style": "", "bpm": 0, "mode": "", "key": "--", "updatedAt": 0}
STATE_LOCK = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/state":
            with STATE_LOCK:
                body = json.dumps(STATE).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/update":
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            try:
                data = json.loads(raw)
            except Exception:
                data = {}
            with STATE_LOCK:
                STATE.update(data)
            self.send_response(204)
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # keep the console quiet — same rough noise level as the default server


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    # binds all interfaces (not just localhost) so phones on the same WiFi can reach it
    # via this machine's LAN IP — same default behavior as `python3 -m http.server`
    with socketserver.ThreadingTCPServer(("0.0.0.0", port), Handler) as httpd:
        print(f"Serving on 0.0.0.0:{port} (chord-chart endpoints: POST /update, GET /state)")
        httpd.serve_forever()
