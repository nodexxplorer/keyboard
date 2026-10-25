import functools
import http.client
import json
import pathlib
import threading
import unittest

import server


class ServerEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(server.Handler, directory=str(pathlib.Path(__file__).resolve().parents[1]))
        cls.httpd = server.socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
        cls.httpd.daemon_threads = True
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.httpd.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)

    def request(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        headers = {}
        if body is not None:
            headers["Content-Type"] = "application/json"
        conn.request(method, path, body=body, headers=headers)
        response = conn.getresponse()
        payload = response.read()
        status, response_headers = response.status, response.headers
        conn.close()
        return status, response_headers, payload

    def test_static_app_and_chart_are_served(self):
        for page in ("/", "/chart.html"):
            with self.subTest(page=page):
                status, headers, body = self.request("GET", page)
                self.assertEqual(status, 200)
                self.assertIn(b"<html", body.lower())
                self.assertIn("text/html", headers.get("Content-Type", ""))

    def test_state_round_trip_and_no_store_headers(self):
        data = {"chord": "F#m", "style": "Ballad", "bpm": 72, "mode": "band", "key": "A major", "updatedAt": 12345}
        status, _, _ = self.request("POST", "/update", json.dumps(data))
        self.assertEqual(status, 204)
        status, headers, payload = self.request("GET", "/state")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(payload), data | {})
        self.assertEqual(headers.get("Cache-Control"), "no-store")

    def test_rejects_malformed_oversized_and_unexpected_updates(self):
        for body in (b"{", json.dumps({"unexpected": "field"}).encode(), json.dumps({"bpm": 999}).encode()):
            with self.subTest(body=body):
                status, _, _ = self.request("POST", "/update", body)
                self.assertEqual(status, 400)
        status, _, _ = self.request("POST", "/update", b"x" * (server.MAX_UPDATE_BYTES + 1))
        self.assertEqual(status, 413)

    def test_unknown_endpoint_and_private_repository_files_are_not_served(self):
        status, _, _ = self.request("POST", "/unknown", b"{}")
        self.assertEqual(status, 404)
        for path in ("/claude-code-brief.md", "/project_aux_keys_status.md", "/.git/HEAD", "/tests/test_server.py"):
            with self.subTest(path=path):
                status, _, _ = self.request("GET", path)
                self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
