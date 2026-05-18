#!/usr/bin/env python3
"""
Simple HTTP server for the truth graph viewer.
Serves static files with proper CORS headers for local development.
Handles DOT file uploads and bundle regeneration.
"""

import http.server
import socketserver
import argparse
import os
import sys
import json
import subprocess
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import cgi


EMPTY_BUNDLE = {
    "nodes": [],
    "edges": [],
    "labelToId": {},
    "metadata": {
        "graph_name": "empty",
        "is_directed": True,
        "node_count": 0,
        "edge_count": 0,
    },
}

BUILD_STATUS_LOCK = threading.Lock()
BUILD_STATUS = {
    "state": "idle",
    "message": "No bundle build is running.",
    "startedAt": None,
    "finishedAt": None,
}


def get_build_status():
    """Return a copy of the current background bundle build state."""
    with BUILD_STATUS_LOCK:
        return dict(BUILD_STATUS)


def set_build_status(**updates):
    """Update the current background bundle build state."""
    with BUILD_STATUS_LOCK:
        BUILD_STATUS.update(updates)


def run_uploaded_build(project_root, dot_path, root_path=None, rechits_event_index=0):
    """Regenerate uploaded graph and optional rechits data in the background."""
    try:
        set_build_status(
            state="running",
            message="Regenerating graph bundle...",
            startedAt=time.time(),
            finishedAt=None,
        )

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
            timeout=1800,
        )

        if result.returncode != 0:
            error_msg = result.stderr or result.stdout or "unknown error"
            print(f"  ERROR: {error_msg}")
            set_build_status(
                state="error",
                message=f"Bundle generation failed: {error_msg}",
                finishedAt=time.time(),
            )
            return

        print("  Bundle generated successfully!")
        print(result.stdout)

        if root_path is not None:
            set_build_status(
                state="running",
                message=f"Regenerating rechits data from event {rechits_event_index}...",
            )
            print(f"\nRegenerating rechits data from event {rechits_event_index}...")
            rechits_script = project_root / "preprocess" / "build_rechits_json.py"
            rechits_args = [
                sys.executable,
                str(rechits_script),
                str(root_path),
                str(project_root / "data" / "rechits.json"),
                "--event-index",
                str(rechits_event_index),
            ]

            result = subprocess.run(
                rechits_args,
                cwd=project_root,
                capture_output=True,
                text=True,
                timeout=1800,
            )

            if result.returncode != 0:
                error_msg = result.stderr or result.stdout or "unknown error"
                print(f"  ERROR: {error_msg}")
                set_build_status(
                    state="error",
                    message=f"Rechits generation failed: {error_msg}",
                    finishedAt=time.time(),
                )
                return

            print("  Rechits data generated successfully!")
            print(result.stdout)

        set_build_status(
            state="success",
            message="Upload processing completed successfully.",
            finishedAt=time.time(),
        )

    except subprocess.TimeoutExpired:
        set_build_status(
            state="error",
            message="Upload processing timed out.",
            finishedAt=time.time(),
        )
    except Exception as e:
        print(f"  ERROR: {str(e)}")
        set_build_status(
            state="error",
                message=f"Upload processing failed: {str(e)}",
                finishedAt=time.time(),
        )


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

    def do_GET(self):
        """Handle status requests, then fall back to static file serving."""
        path = urlparse(self.path).path.rstrip('/')
        if path == '/upload-status' or path.endswith('/upload-status'):
            self.send_json_response({
                'success': True,
                'build': get_build_status(),
            })
            return

        super().do_GET()

    def do_POST(self):
        """Handle POST requests for file uploads"""
        path = urlparse(self.path).path.rstrip('/')
        if path == '/upload' or path.endswith('/upload'):
            self.handle_upload()
        else:
            self.send_json_response({'success': False, 'error': 'Not Found'}, 404)

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
            dot_item = self.get_upload_item(form, 'dotFile')
            root_item = self.get_upload_item(form, 'rootFile')
            try:
                rechits_event_index = self.get_non_negative_int_field(form, 'rechitsEventIndex', 0)
            except ValueError as exc:
                self.send_json_response({'success': False, 'error': str(exc)}, 400)
                return

            if dot_item is None:
                self.send_json_response({'success': False, 'error': 'DOT graph file is required'}, 400)
                return

            # Get project root
            project_root = Path(__file__).parent

            if get_build_status()["state"] in {"queued", "running"}:
                self.send_json_response({
                    'success': False,
                    'error': 'A bundle build is already running'
                }, 409)
                return

            # Save files
            dot_path = project_root / "truthgraph.dot"
            root_path = project_root / "rechits.root" if root_item is not None else None

            print("\nSaving uploaded files...")
            with open(dot_path, 'wb') as f:
                f.write(dot_item.file.read())
            print(f"  Saved: {dot_path}")

            if root_item is not None:
                with open(root_path, 'wb') as f:
                    f.write(root_item.file.read())
                print(f"  Saved: {root_path}")
                print(f"  Rechits event index: {rechits_event_index}")

            set_build_status(
                state="queued",
                message="Input files uploaded. Processing is starting...",
                startedAt=time.time(),
                finishedAt=None,
            )
            thread = threading.Thread(
                target=run_uploaded_build,
                args=(project_root, dot_path, root_path, rechits_event_index),
                daemon=True,
            )
            thread.start()

            self.send_json_response({
                'success': True,
                'message': 'Input files uploaded. Processing is running.',
                'build': get_build_status(),
            }, 202)

        except Exception as e:
            print(f"  ERROR: {str(e)}")
            self.send_json_response({
                'success': False,
                'error': f'Upload failed: {str(e)}'
            }, 500)

    def get_upload_item(self, form, key):
        """Return a file upload item only when the field has a selected file."""
        if key not in form:
            return None

        item = form[key]
        if isinstance(item, list):
            item = item[0] if item else None

        if item is None or not getattr(item, 'filename', None) or not getattr(item, 'file', None):
            return None

        return item

    def get_non_negative_int_field(self, form, key, default):
        """Return a non-negative integer form field value."""
        if key not in form:
            return default

        item = form[key]
        if isinstance(item, list):
            item = item[0] if item else None

        value = getattr(item, 'value', default)
        if value in (None, ""):
            return default

        try:
            int_value = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{key} must be a non-negative integer") from exc

        if int_value < 0:
            raise ValueError(f"{key} must be a non-negative integer")

        return int_value

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


def port_number(value):
    """Parse and validate a TCP port number."""
    try:
        port = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid port: {value}") from exc

    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1 and 65535")

    return port


def positive_int(value):
    """Parse and validate a positive integer."""
    try:
        number = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid integer: {value}") from exc

    if number < 1:
        raise argparse.ArgumentTypeError("value must be at least 1")

    return number


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Run the Truth Graph Viewer local development server."
    )
    parser.add_argument(
        "--host",
        default="localhost",
        help="Host interface to bind to. Defaults to localhost.",
    )
    parser.add_argument(
        "--start-port",
        "--port",
        dest="start_port",
        default=8009,
        type=port_number,
        help="Port to bind to, or the first port to try when auto-find is enabled. Defaults to 8009.",
    )
    parser.add_argument(
        "--auto-find-port",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Try subsequent ports when the start port is already in use. Enabled by default.",
    )
    parser.add_argument(
        "--max-port-attempts",
        default=100,
        type=positive_int,
        help="Maximum number of ports to try when auto-find is enabled. Defaults to 100.",
    )
    return parser.parse_args()


def create_server(host, start_port, handler, auto_find_port=True, max_attempts=100):
    """Bind to start_port, optionally trying following ports if unavailable."""
    attempts = max_attempts if auto_find_port else 1
    end_port = min(65535, start_port + attempts - 1)

    for port in range(start_port, end_port + 1):
        try:
            return port, ReusableTCPServer((host, port), handler)
        except OSError as exc:
            if exc.errno not in {48, 98}:  # EADDRINUSE on macOS/BSD and Linux
                raise
            if not auto_find_port:
                raise

    raise RuntimeError(f"No available port found from {start_port} to {end_port}")


def ensure_initial_bundle(project_root):
    """Ensure server mode has a bundle to load after a fresh S2I clone."""
    bundle_path = project_root / "data" / "bundle.json"
    if bundle_path.exists():
        return

    dot_candidates = [
        project_root / "truthgraph.dot",
        project_root / "dependency.gv",
    ]
    dot_path = next((path for path in dot_candidates if path.exists()), None)

    if dot_path is not None:
        print(f"Bundle not found. Generating from: {dot_path}")
        subprocess.run(
            [
                sys.executable,
                str(project_root / "preprocess" / "build_bundle.py"),
                str(dot_path),
                str(bundle_path),
            ],
            cwd=project_root,
            check=True,
        )
        return

    print("Bundle not found and no DOT file is available. Creating an empty bundle.")
    bundle_path.parent.mkdir(parents=True, exist_ok=True)
    with open(bundle_path, "w", encoding="utf-8") as f:
        json.dump(EMPTY_BUNDLE, f, indent=2)


def main():
    args = parse_args()

    # Change to project root directory
    project_root = Path(__file__).parent
    os.chdir(project_root)
    ensure_initial_bundle(project_root)

    port, httpd = create_server(
        args.host,
        args.start_port,
        CORSRequestHandler,
        auto_find_port=args.auto_find_port,
        max_attempts=args.max_port_attempts,
    )

    print("=" * 60)
    print("Truth Graph Viewer Server")
    print("=" * 60)
    print(f"\nServing from: {project_root}")
    print(f"Server address: http://{args.host}:{port}")
    print(f"Application URL: http://{args.host}:{port}/app/")
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
