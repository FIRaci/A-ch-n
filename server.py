#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Arknights Spine Web Server & Asset Proxy
Runs local web server at http://localhost:8080 with built-in CORS proxy and Crawler API.
"""

import os
import sys
import json
import mimetypes
import urllib.parse
import webbrowser
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Ensure UTF-8 output
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOADS_DIR = os.path.join(ROOT_DIR, "downloads")
PORT = 8080

# Import crawler logic if available
sys.path.insert(0, ROOT_DIR)
import ak_crawler

session = ak_crawler.create_session()


class ArknightsHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS for all responses
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. Route root to /web/index.html
        if path in ("/", "/index.html"):
            self.send_response(302)
            self.send_header("Location", "/web/index.html")
            self.end_headers()
            return

        # 2. API: List downloaded operators
        if path == "/api/downloaded":
            downloaded = []
            if os.path.exists(DOWNLOADS_DIR):
                for name in os.listdir(DOWNLOADS_DIR):
                    p = os.path.join(DOWNLOADS_DIR, name)
                    if os.path.isdir(p):
                        files = os.listdir(p)
                        if any(f.endswith(".skel") for f in files):
                            downloaded.append(name)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(downloaded, ensure_ascii=False).encode("utf-8"))
            return

        # 3. API: Proxy CDN requests (solves CORS and Referer restrictions)
        if path == "/api/proxy":
            target_url = query.get("url", [""])[0]
            if not target_url:
                self.send_error(400, "Missing url parameter")
                return

            try:
                resp = session.get(target_url, timeout=15)
                self.send_response(resp.status_code)
                content_type = resp.headers.get("Content-Type", "application/octet-stream")
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(resp.content)))
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()
                self.wfile.write(resp.content)
            except Exception as e:
                self.send_error(500, f"Proxy error: {e}")
            return

        # 4. API: Trigger single operator download
        if path == "/api/download":
            name = query.get("name", [""])[0]
            if not name:
                self.send_error(400, "Missing name parameter")
                return

            index = ak_crawler.load_operators_index()
            found = ak_crawler.find_operator_id(name, index)
            if not found:
                self.send_response(404)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "Operator not found"}, ensure_ascii=False).encode("utf-8"))
                return

            cid, dname = found
            ok, msg, files = ak_crawler.download_operator(
                cid, dname, DOWNLOADS_DIR, model_types=["基建"], download_all_skins=False, session=session
            )

            self.send_response(200 if ok else 500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": ok, "message": msg, "files": files, "name": dname}, ensure_ascii=False).encode("utf-8"))
            return

        # 5. API: Serve local downloaded operator meta.json
        # GET /api/local-meta?name=阿米娅  → returns meta.json from downloads/阿米娅/meta.json
        if path == "/api/local-meta":
            name = query.get("name", [""])[0]
            if not name:
                self.send_error(400, "Missing name")
                return
            meta_path = os.path.join(DOWNLOADS_DIR, name, "meta.json")
            if not os.path.exists(meta_path):
                self.send_error(404, "meta.json not found")
                return
            with open(meta_path, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        # 6. API: Serve local downloaded Spine asset files
        # GET /api/local-file?name=阿米娅&file=阿米娅_默认_基建.skel
        if path == "/api/local-file":
            name = query.get("name", [""])[0]
            file = query.get("file", [""])[0]
            if not name or not file:
                self.send_error(400, "Missing name or file")
                return
            # Security: prevent path traversal
            file = os.path.basename(file)
            file_path = os.path.join(DOWNLOADS_DIR, name, file)
            if not os.path.exists(file_path):
                self.send_error(404, f"File not found: {file}")
                return
            ext = os.path.splitext(file)[1].lower()
            ctype_map = {
                ".skel": "application/octet-stream",
                ".atlas": "text/plain; charset=utf-8",
                ".png": "image/png",
                ".json": "application/json; charset=utf-8"
            }
            content_type = ctype_map.get(ext, "application/octet-stream")
            with open(file_path, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "public, max-age=3600")
            self.end_headers()
            self.wfile.write(data)
            return

        # 7. API: List all locally downloaded operators with their available files
        if path == "/api/local-list":
            result = {}
            if os.path.exists(DOWNLOADS_DIR):
                for char_name in os.listdir(DOWNLOADS_DIR):
                    char_path = os.path.join(DOWNLOADS_DIR, char_name)
                    if not os.path.isdir(char_path):
                        continue
                    files = os.listdir(char_path)
                    skel_files = [f for f in files if f.endswith(".skel")]
                    meta_path = os.path.join(char_path, "meta.json")
                    has_meta = os.path.exists(meta_path)
                    if skel_files or has_meta:
                        result[char_name] = {
                            "skel_files": skel_files,
                            "has_meta": has_meta
                        }
            data = json.dumps(result, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        # Default static file serving
        super().do_GET()


def run_server():
    server = HTTPServer(("0.0.0.0", PORT), ArknightsHandler)
    url = f"http://localhost:{PORT}/web/index.html"
    print("=" * 60)
    print("🚀 ARKNIGHTS CHIBI HUB - LOCAL SERVER RUNNING")
    print(f"🔗 Mở trình duyệt tại: {url}")
    print(f"📂 Thư mục gốc: {ROOT_DIR}")
    print("=" * 60)

    # Open browser automatically after 1 second
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Đang dừng server...")
        server.server_close()


if __name__ == "__main__":
    run_server()
