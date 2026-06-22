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
import shutil
import uuid
from pathlib import Path
from urllib.parse import urlparse
import cgi

from truth_pipeline import (
    PipelineOptions,
    default_job_root,
    find_catalog_sample,
    load_catalog,
    materialize_catalog_sample,
    parse_dumper_args,
    parse_non_negative_int,
    process_cmssw_root,
)


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
    "phase": None,
    "jobId": None,
    "message": "No bundle build is running.",
    "startedAt": None,
    "finishedAt": None,
    "outputs": None,
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
            phase="bundle",
            message="Regenerating graph bundle...",
            startedAt=time.time(),
            finishedAt=None,
            outputs=None,
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
                phase="bundle",
                message=f"Bundle generation failed: {error_msg}",
                finishedAt=time.time(),
            )
            return

        print("  Bundle generated successfully!")
        print(result.stdout)

        if root_path is not None:
            set_build_status(
                state="running",
                phase="rechits",
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
                    phase="rechits",
                    message=f"Rechits generation failed: {error_msg}",
                    finishedAt=time.time(),
                )
                return

            print("  Rechits data generated successfully!")
            print(result.stdout)

        set_build_status(
            state="success",
            phase="complete",
            message="Upload processing completed successfully.",
            finishedAt=time.time(),
            outputs={
                "bundlePath": str(project_root / "data" / "bundle.json"),
                "rechitsJsonPath": str(project_root / "data" / "rechits.json") if root_path is not None else None,
            },
        )

    except subprocess.TimeoutExpired:
        set_build_status(
            state="error",
            phase="timeout",
            message="Upload processing timed out.",
            finishedAt=time.time(),
        )
    except Exception as e:
        print(f"  ERROR: {str(e)}")
        set_build_status(
            state="error",
            phase="error",
            message=f"Upload processing failed: {str(e)}",
            finishedAt=time.time(),
        )


def run_cmssw_build(input_root, options):
    """Run the CMSSW ROOT pipeline in the background."""
    try:
        def update(**updates):
            updates.setdefault("state", "running")
            updates.setdefault("jobId", options.job_id)
            set_build_status(**updates)

        result = process_cmssw_root(input_root, options, status_callback=update)
        set_build_status(
            state="success",
            phase="complete",
            jobId=result.job_id,
            message="CMSSW ROOT processing completed successfully.",
            finishedAt=time.time(),
            outputs=result.as_dict(),
        )
    except subprocess.TimeoutExpired:
        set_build_status(
            state="error",
            phase="timeout",
            jobId=options.job_id,
            message="CMSSW ROOT processing timed out.",
            finishedAt=time.time(),
        )
    except Exception as exc:
        print(f"  ERROR: {str(exc)}")
        set_build_status(
            state="error",
            phase="error",
            jobId=options.job_id,
            message=f"CMSSW ROOT processing failed: {str(exc)}",
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
        if path == '/samples' or path.endswith('/samples'):
            self.handle_samples()
            return

        super().do_GET()

    def do_POST(self):
        """Handle POST requests for file uploads"""
        path = urlparse(self.path).path.rstrip('/')
        if path == '/upload' or path.endswith('/upload'):
            self.handle_upload()
        elif path == '/process-root' or path.endswith('/process-root'):
            self.handle_process_root()
        elif '/samples/' in path and path.endswith('/process'):
            self.handle_process_sample(path)
        else:
            self.send_json_response({'success': False, 'error': 'Not Found'}, 404)

    def handle_upload(self):
        """Handle prepared DOT/ROOT upload and bundle regeneration."""
        try:
            if not self.validate_upload_size():
                return

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
            mode = self.get_form_value(form, 'mode', 'prepared')
            if mode != 'prepared':
                self.send_json_response({
                    'success': False,
                    'error': 'Use /process-root for CMSSW ROOT input'
                }, 400)
                return
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
                phase="prepared",
                jobId=None,
                message="Input files uploaded. Processing is starting...",
                startedAt=time.time(),
                finishedAt=None,
                outputs=None,
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

    def handle_process_root(self):
        """Handle CMSSW EDM ROOT upload and launch ROOT-to-viewer processing."""
        try:
            if not self.validate_upload_size():
                return

            content_type = self.headers.get('Content-Type')
            if not content_type or not content_type.startswith('multipart/form-data'):
                self.send_json_response({'success': False, 'error': 'Invalid content type'}, 400)
                return

            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST'}
            )

            root_item = self.get_upload_item(form, 'rootFile')
            if root_item is None:
                self.send_json_response({'success': False, 'error': 'CMSSW ROOT file is required'}, 400)
                return

            if get_build_status()["state"] in {"queued", "running"}:
                self.send_json_response({
                    'success': False,
                    'error': 'A processing job is already running'
                }, 409)
                return

            try:
                event_index = self.get_non_negative_int_field(form, 'eventIndex', 0)
                dumper_args = parse_dumper_args(self.get_form_value(form, 'dumperArgs', ''))
            except ValueError as exc:
                self.send_json_response({'success': False, 'error': str(exc)}, 400)
                return

            project_root = Path(__file__).parent
            job_root = default_job_root(project_root)
            job_id = f"{int(time.time())}-upload-{uuid.uuid4().hex[:8]}"
            upload_dir = job_root / job_id / "upload"
            upload_dir.mkdir(parents=True, exist_ok=False)
            root_path = upload_dir / "input.root"
            with open(root_path, 'wb') as f:
                shutil.copyfileobj(root_item.file, f)

            options = PipelineOptions(
                event_index=event_index,
                dumper_args=dumper_args,
                job_id=job_id,
                job_root=job_root,
            )

            set_build_status(
                state="queued",
                phase="cmssw",
                jobId=job_id,
                message="CMSSW ROOT file uploaded. Processing is starting...",
                startedAt=time.time(),
                finishedAt=None,
                outputs=None,
            )
            thread = threading.Thread(
                target=run_cmssw_build,
                args=(root_path, options),
                daemon=True,
            )
            thread.start()

            self.send_json_response({
                'success': True,
                'message': 'CMSSW ROOT processing is running.',
                'build': get_build_status(),
            }, 202)

        except Exception as e:
            print(f"  ERROR: {str(e)}")
            self.send_json_response({
                'success': False,
                'error': f'CMSSW ROOT processing failed to start: {str(e)}'
            }, 500)

    def handle_samples(self):
        """Return the configured sample catalogue."""
        try:
            self.send_json_response({'success': True, 'catalog': load_catalog()})
        except Exception as exc:
            self.send_json_response({'success': False, 'error': str(exc)}, 500)

    def handle_process_sample(self, path):
        """Launch processing for a manifest-declared sample."""
        try:
            if get_build_status()["state"] in {"queued", "running"}:
                self.send_json_response({
                    'success': False,
                    'error': 'A processing job is already running'
                }, 409)
                return

            parts = [part for part in path.split('/') if part]
            route = parts[-3:] if len(parts) >= 3 else []
            if len(route) != 3 or route[0] != 'samples' or route[2] != 'process':
                self.send_json_response({'success': False, 'error': 'Not Found'}, 404)
                return

            sample_id = route[1]
            sample = find_catalog_sample(sample_id)
            job_root = default_job_root(Path(__file__).parent)
            job_id = f"{int(time.time())}-sample-{sample_id}-{uuid.uuid4().hex[:8]}"
            staging_dir = job_root / job_id / "sample"
            staging_dir.mkdir(parents=True, exist_ok=False)

            event_index = parse_non_negative_int(sample.get("eventIndex", 0), "eventIndex")
            dumper_args = sample.get("dumperArgs", [])
            if isinstance(dumper_args, str):
                dumper_args = parse_dumper_args(dumper_args)
            if not isinstance(dumper_args, list):
                self.send_json_response({'success': False, 'error': 'sample dumperArgs must be a list or string'}, 400)
                return

            input_root = materialize_catalog_sample(sample, staging_dir)
            options = PipelineOptions(
                event_index=event_index,
                dumper_args=[str(arg) for arg in dumper_args],
                job_id=job_id,
                job_root=job_root,
            )

            set_build_status(
                state="queued",
                phase="sample",
                jobId=job_id,
                message=f"Sample {sample_id} processing is starting...",
                startedAt=time.time(),
                finishedAt=None,
                outputs=None,
            )
            thread = threading.Thread(
                target=run_cmssw_build,
                args=(input_root, options),
                daemon=True,
            )
            thread.start()

            self.send_json_response({
                'success': True,
                'message': 'Sample processing is running.',
                'build': get_build_status(),
            }, 202)

        except Exception as exc:
            self.send_json_response({'success': False, 'error': str(exc)}, 500)

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

    def get_form_value(self, form, key, default=None):
        """Return a scalar form field value."""
        if key not in form:
            return default

        item = form[key]
        if isinstance(item, list):
            item = item[0] if item else None

        return getattr(item, 'value', default) if item is not None else default

    def validate_upload_size(self):
        """Reject uploads above TRUTHVIZ_MAX_UPLOAD_MB when Content-Length is present."""
        max_mb = int(os.environ.get("TRUTHVIZ_MAX_UPLOAD_MB", "2048"))
        content_length = self.headers.get('Content-Length')
        if not content_length:
            return True

        try:
            size_bytes = int(content_length)
        except ValueError:
            self.send_json_response({'success': False, 'error': 'Invalid Content-Length'}, 400)
            return False

        if size_bytes > max_mb * 1024 * 1024:
            self.send_json_response({
                'success': False,
                'error': f'Upload exceeds TRUTHVIZ_MAX_UPLOAD_MB={max_mb}'
            }, 413)
            return False

        return True

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
