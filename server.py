#!/usr/bin/env python3
"""
APIC ProtoHub Local Web Server
Runs a lightweight local web server to serve the Innovator App and Manager Console.
Usage:
    python server.py
"""
import http.server
import socketserver
import webbrowser
import os

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS and disable caching during local development
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def main():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"==================================================")
        print(f"  APIC ProtoHub Live Server Running on Port {PORT}")
        print(f"  Innovator App:   http://localhost:{PORT}/app.html")
        print(f"  Manager Console: http://localhost:{PORT}/manager.html")
        print(f"==================================================")
        try:
            webbrowser.open(f"http://localhost:{PORT}/app.html")
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == '__main__':
    main()
