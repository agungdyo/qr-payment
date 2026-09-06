"""Fake MAJA H2H server for local testing.

Captures every request (method, path, headers, body) to /tmp/maja_capture.log,
then:
  - POST /oauth/token      -> {"access_token": "captured-token-abc", ...}
  - POST /api/v2/register  -> MAJA-style success {code:"00", data:{...}}
  - anything else          -> 404
"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

LOG = "/tmp/maja_capture.log"


class Handler(BaseHTTPRequestHandler):
    def _log_request(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length).decode("utf-8", "replace") if length else ""
        with open(LOG, "a") as f:
            f.write(f"=== {self.command} {self.path}\n")
            for k, v in self.headers.items():
                f.write(f"  {k}: {v}\n")
            f.write(f"  BODY: {body}\n")

    def _send(self, payload: dict, status: int = 200):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        self._log_request()
        if self.path == "/oauth/token":
            self._send({
                "access_token": "captured-token-abc",
                "token_type": "Bearer",
                "expires_in": 300,
            })
        elif self.path == "/api/v2/register":
            self._send({
                "code": "00",
                "message": "ok",
                "success": True,
                "data": {
                    "id": 1001,
                    "number": "QR-TEST-0001",
                    "va": "880812345678",
                    "inactiveDate": "2026-09-07 00:00:00",
                    "amount": 15000,
                },
            })
        else:
            self._send({"code": "99", "message": "not found"}, 404)

    def do_GET(self):
        self._log_request()
        self._send({"code": "99", "message": "not found"}, 404)

    def log_message(self, *args):
        pass  # keep stdout clean


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 9999), Handler).serve_forever()