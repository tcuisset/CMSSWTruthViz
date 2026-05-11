#!/usr/bin/env python3
"""
Simple HTTP server for the truth graph viewer.
Serves static files with proper CORS headers for local development.
Handles DOT file uploads and bundle regeneration.
"""

import http.server
import socketserver
import os
import sys
import json
import subprocess
from pathlib import Path
from urllib.parse import parse_qs
import cgi


class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler with CORS support and file upload"""

    def end_headers(self):
        """Add CORS headers before ending headers"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        """Handle OPTIONS requests for CORS preflight"""
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        """Handle POST requests for file uploads"""
        if self.path == '/upload':
            self.handle_upload()
        else:
            self.send_error(404, "Not Found")

    def handle_upload(self):
        """Handle file upload and bundle regeneration"""
        try:
            # Parse multipart form data
            content_type = self.headers.get('Content-Type')
            if not content_type or not content_type.startswith('multipart/form-data'):
                self.send_json_response({'success': False, 'error': 'Invalid content type'}, 400)
                return

            # Parse form data
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST'}
            )

            # Get uploaded files
            dot_file = form['dotFile'].file if 'dotFile' in form else None

            if not dot_file:
                self.send_json_response({'success': False, 'error': 'DOT graph file is required'}, 400)
                return

            # Get project root
            project_root = Path(__file__).parent

            # Save files
            dot_path = project_root / "truthgraph.dot"

            print("\nSaving uploaded file...")
            with open(dot_path, 'wb') as f:
                f.write(dot_file.read())
            print(f"  Saved: {dot_path}")

            # Run bundle generation
            print("\nRegenerating bundle...")
            build_script = project_root / "preprocess" / "build_bundle.py"
            build_args = [
                sys.executable,
                str(build_script),
                str(dot_path),
                str(project_root / "data" / "bundle.json")
            ]

            result = subprocess.run(
                build_args,
                cwd=project_root,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout
                print(f"  ERROR: {error_msg}")
                self.send_json_response({
                    'success': False,
                    'error': f'Bundle generation failed: {error_msg}'
                }, 500)
                return

            print(f"  Bundle generated successfully!")
            print(result.stdout)

            self.send_json_response({
                'success': True,
                'message': 'Files uploaded and bundle regenerated successfully'
            })

        except subprocess.TimeoutExpired:
            self.send_json_response({
                'success': False,
                'error': 'Bundle generation timed out (>5 minutes)'
            }, 500)
        except Exception as e:
            print(f"  ERROR: {str(e)}")
            self.send_json_response({
                'success': False,
                'error': f'Upload failed: {str(e)}'
            }, 500)

    def send_json_response(self, data, status=200):
        """Send JSON response"""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def log_message(self, format, *args):
        """Custom log format"""
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))


class ReusableTCPServer(socketserver.TCPServer):
    """TCP server that can restart quickly after a local development run."""

    allow_reuse_address = True


def create_server(host, start_port, handler, max_attempts=100):
    """Bind to the first available port at or above start_port."""
    for port in range(start_port, start_port + max_attempts):
        try:
            return port, ReusableTCPServer((host, port), handler)
        except OSError as exc:
            if exc.errno not in {48, 98}:  # EADDRINUSE on macOS/BSD and Linux
                raise

    end_port = start_port + max_attempts - 1
    raise RuntimeError(f"No available port found from {start_port} to {end_port}")


def main():
    START_PORT = 8009
    HOST = 'localhost'

    # Change to project root directory
    project_root = Path(__file__).parent
    os.chdir(project_root)

    port, httpd = create_server(HOST, START_PORT, CORSRequestHandler)

    print("=" * 60)
    print("Truth Graph Viewer Server")
    print("=" * 60)
    print(f"\nServing from: {project_root}")
    print(f"Server address: http://{HOST}:{port}")
    print(f"Application URL: http://{HOST}:{port}/app/")
    print("\nPress Ctrl+C to stop the server")
    print("=" * 60)
    print()

    with httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nShutting down server...")
            httpd.shutdown()
            print("Server stopped.")


if __name__ == "__main__":
    main()
