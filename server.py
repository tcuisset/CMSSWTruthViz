#!/usr/bin/env python3
"""HTTP server for isolated truth-graph processing and browser sessions."""

from __future__ import annotations

import argparse
import datetime as dt
import http.server
import json
import os
import shutil
import socketserver
import sys
import traceback
from pathlib import Path
from urllib.parse import unquote, urlparse

from job_manager import Job, JobManager
from multipart_form import MultipartError, parse_multipart_form
from truth_pipeline import (
    PipelineOptions,
    catalog_path,
    default_job_root,
    find_catalog_sample,
    load_catalog,
    parse_dumper_args,
    parse_non_negative_int,
    process_cmssw_root,
    run_process_with_live_output,
)


PROJECT_ROOT = Path(__file__).resolve().parent
SCHEMA_VERSION = 1
JOB_MANAGER: JobManager | None = None


def truthy_env(name):
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def resolve_cmssw_root_server_path(raw_path):
    """Validate a server-side CMSSW ROOT path selected from the launcher."""
    root_path_text = str(raw_path or "").strip()
    if not root_path_text:
        raise ValueError("CMSSW ROOT path is required")
    root_path = Path(root_path_text).expanduser()
    if not root_path.is_absolute():
        raise ValueError("CMSSW ROOT path must be absolute")
    if not root_path_text.startswith("/eos/") and not truthy_env("TRUTHVIZ_ALLOW_LOCAL_ROOT_PATHS"):
        raise ValueError(
            "CMSSW ROOT path must be under /eos/. "
            "Set TRUTHVIZ_ALLOW_LOCAL_ROOT_PATHS=1 for local development tests."
        )
    root_path = root_path.resolve()
    if not root_path.exists():
        raise ValueError(f"CMSSW ROOT path does not exist: {root_path}")
    if not root_path.is_file():
        raise ValueError(f"CMSSW ROOT path is not a file: {root_path}")
    return root_path


def iso_now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def load_json(path: Path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def load_rechits_json(path: Path):
    payload = load_json(path)
    metadata = payload.get("metadata")
    if isinstance(metadata, dict) and metadata.get("source"):
        metadata["source"] = Path(str(metadata["source"])).name
    return payload


def optional_associations(directory: Path):
    candidates = sorted(directory.rglob("*association*.json"), key=lambda path: path.stat().st_mtime)
    return load_json(candidates[-1]) if candidates else None


def write_result(job: Job, bundle_path: Path, rechits_path: Path | None, associations=None) -> Path:
    result_path = job.job_dir / "result.json"
    envelope = {
        "schemaVersion": SCHEMA_VERSION,
        "session": {
            "id": job.capability,
            "name": job.metadata["name"],
            "sourceType": job.metadata["sourceType"],
            "eventIndex": job.metadata["eventIndex"],
            "createdAt": job.metadata["createdAt"],
        },
        "bundle": load_json(bundle_path),
        "rechits": load_rechits_json(rechits_path) if rechits_path is not None else None,
        "associations": associations,
    }
    with open(result_path, "w", encoding="utf-8") as handle:
        json.dump(envelope, handle, separators=(",", ":"))
    return result_path


def run_checked(args, *, timeout=1800, status_callback=None, phase="Python converter"):
    result = run_process_with_live_output(
        args,
        cwd=PROJECT_ROOT,
        timeout=timeout,
        phase=phase,
        status_callback=status_callback,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "converter failed")


def process_job(job: Job, update) -> Path:
    """Run one queued job without publishing into the shared viewer."""
    if job.kind == "root":
        options = PipelineOptions(
            event_index=job.metadata["eventIndex"],
            dumper_args=job.payload.get("dumperArgs", []),
            job_id=job.job_dir.name,
            job_root=job.job_dir.parent,
            copy_to_viewer=False,
        )

        def pipeline_update(**updates):
            forwarded = {
                key: updates[key]
                for key in ("phase", "message", "log")
                if key in updates
            }
            update(**forwarded)

        result = process_cmssw_root(
            Path(job.payload["inputRoot"]), options, status_callback=pipeline_update
        )
        update(phase="packaging", message="Packaging graph and rechit data for the browser...")
        return write_result(
            job,
            result.bundle_path,
            result.rechits_json_path,
            optional_associations(result.cmssw_outdir),
        )

    if job.kind == "prepared":
        bundle_path = job.job_dir / "bundle.json"
        update(phase="bundle", message="Building browser graph bundle...")
        run_checked([
            sys.executable,
            str(PROJECT_ROOT / "preprocess" / "build_bundle.py"),
            job.payload["dotPath"],
            str(bundle_path),
            "--no-js-output",
        ], status_callback=update, phase="Python: build_bundle.py")
        rechits_path = None
        if job.payload.get("rootPath"):
            rechits_path = job.job_dir / "rechits.json"
            update(phase="rechits", message="Building rechit data...")
            run_checked([
                sys.executable,
                str(PROJECT_ROOT / "preprocess" / "build_rechits_json.py"),
                job.payload["rootPath"],
                str(rechits_path),
                "--event-index",
                str(job.metadata["eventIndex"]),
                "--no-js-output",
            ], status_callback=update, phase="Python: build_rechits_json.py")
        update(phase="packaging", message="Packaging data for the browser...")
        return write_result(job, bundle_path, rechits_path)

    raise ValueError(f"Unsupported job kind: {job.kind}")


def get_job_manager() -> JobManager:
    if JOB_MANAGER is None:
        raise RuntimeError("Job manager is not configured")
    return JOB_MANAGER


def public_catalog():
    samples = []
    for sample in load_catalog().get("samples", []):
        samples.append({key: sample[key] for key in ("id", "label", "description") if key in sample})
    return {"schemaVersion": SCHEMA_VERSION, "samples": samples}


def resolve_catalog_artifact(sample: dict, key: str) -> Path | None:
    value = (sample.get("artifacts") or {}).get(key)
    if not value:
        return None
    base = catalog_path().resolve().parent
    path = (base / value).resolve()
    if base not in path.parents:
        raise ValueError(f"Catalogue {key} path escapes the catalogue directory")
    if not path.is_file():
        raise FileNotFoundError(f"Catalogue {key} artifact is missing for {sample.get('id')}")
    return path


def catalog_result(sample_id: str):
    sample = find_catalog_sample(sample_id)
    bundle_path = resolve_catalog_artifact(sample, "bundle")
    if bundle_path is None:
        raise ValueError(f"Catalogue sample {sample_id} has no prebuilt bundle")
    rechits_path = resolve_catalog_artifact(sample, "rechits")
    associations_path = resolve_catalog_artifact(sample, "associations")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "session": {
            "id": sample_id,
            "name": sample.get("label", sample_id),
            "sourceType": "catalog",
            "eventIndex": parse_non_negative_int(sample.get("eventIndex", 0), "eventIndex"),
            "createdAt": None,
        },
        "bundle": load_json(bundle_path),
        "rechits": load_rechits_json(rechits_path) if rechits_path else None,
        "associations": load_json(associations_path) if associations_path else None,
    }


class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Serve the app plus capability-scoped processing APIs."""

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parts = self.api_parts()
        if parts == ["api", "catalog"]:
            self.send_json_response({"success": True, "catalog": public_catalog()})
            return
        if len(parts) == 4 and parts[:2] == ["api", "catalog"] and parts[3] == "result":
            try:
                self.send_json_response(catalog_result(parts[2]))
            except Exception as exc:
                status = 404 if "not found" in str(exc).lower() else 500
                self.send_json_response({"success": False, "error": str(exc)}, status)
            return
        if len(parts) == 4 and parts[:2] == ["api", "jobs"] and parts[3] == "status":
            status = get_job_manager().status(parts[2])
            if status is None:
                self.send_json_response({"success": False, "error": "Job not found"}, 404)
            else:
                self.send_json_response({"success": True, "job": status})
            return
        if len(parts) == 4 and parts[:2] == ["api", "jobs"] and parts[3] == "result":
            job = get_job_manager().get(parts[2])
            if job is None:
                self.send_json_response({"success": False, "error": "Job not found"}, 404)
            elif job.state != "success" or job.result_path is None:
                self.send_json_response({"success": False, "error": "Job result is not ready"}, 409)
            else:
                self.send_json_file(job.result_path)
            return
        if not parts:
            self.send_response(302)
            self.send_header("Location", "/app/")
            self.end_headers()
            return
        if parts[0] != "app":
            self.send_json_response({"success": False, "error": "Not Found"}, 404)
            return
        super().do_GET()

    def do_POST(self):
        parts = self.api_parts()
        try:
            if parts == ["api", "jobs", "root"]:
                self.handle_root_job()
            elif parts == ["api", "jobs", "prepared"]:
                self.handle_prepared_job()
            else:
                self.send_json_response({"success": False, "error": "Not Found"}, 404)
        except Exception as exc:
            traceback.print_exc()
            self.send_json_response({"success": False, "error": f"Job could not be started: {exc}"}, 500)

    def do_DELETE(self):
        parts = self.api_parts()
        if len(parts) == 3 and parts[:2] == ["api", "jobs"]:
            try:
                deleted = get_job_manager().acknowledge(parts[2])
            except ValueError as exc:
                self.send_json_response({"success": False, "error": str(exc)}, 409)
                return
            if not deleted:
                self.send_json_response({"success": False, "error": "Job not found"}, 404)
            else:
                self.send_json_response({"success": True})
            return
        self.send_json_response({"success": False, "error": "Not Found"}, 404)

    def handle_root_job(self):
        form = self.parse_upload_form()
        if form is None:
            return
        source = self.get_form_value(form, "source", "upload")
        root_item = self.get_upload_item(form, "rootFile")
        if source not in {"upload", "path"}:
            self.send_json_response({"success": False, "error": "source must be upload or path"}, 400)
            return
        if source == "upload" and root_item is None:
            self.send_json_response({"success": False, "error": "CMSSW ROOT file is required"}, 400)
            return
        try:
            event_index = self.get_non_negative_int_field(form, "eventIndex", 0)
            dumper_args = parse_dumper_args(self.get_form_value(form, "dumperArgs", ""))
            input_path = (
                resolve_cmssw_root_server_path(self.get_form_value(form, "rootPath", ""))
                if source == "path" else None
            )
        except ValueError as exc:
            self.send_json_response({"success": False, "error": str(exc)}, 400)
            return

        suggested = Path(str(input_path)).name if input_path else Path(root_item.filename).name
        metadata = self.session_metadata(form, source, event_index, suggested)
        manager = get_job_manager()
        job = manager.reserve("root", metadata)
        try:
            if source == "upload":
                upload_dir = job.job_dir / "upload"
                upload_dir.mkdir()
                input_path = upload_dir / "input.root"
                with open(input_path, "wb") as handle:
                    shutil.copyfileobj(root_item.file, handle)
            status = manager.enqueue(job.capability, {
                "inputRoot": str(input_path), "dumperArgs": dumper_args,
            })
        except Exception:
            manager.fail_preparation(job.capability)
            raise
        self.send_json_response({"success": True, "job": status}, 202)

    def handle_prepared_job(self):
        form = self.parse_upload_form()
        if form is None:
            return
        dot_item = self.get_upload_item(form, "dotFile")
        root_item = self.get_upload_item(form, "rootFile")
        if dot_item is None:
            self.send_json_response({"success": False, "error": "DOT graph file is required"}, 400)
            return
        try:
            event_index = self.get_non_negative_int_field(form, "rechitsEventIndex", 0)
        except ValueError as exc:
            self.send_json_response({"success": False, "error": str(exc)}, 400)
            return
        metadata = self.session_metadata(form, "prepared", event_index, Path(dot_item.filename).stem)
        manager = get_job_manager()
        job = manager.reserve("prepared", metadata)
        try:
            upload_dir = job.job_dir / "upload"
            upload_dir.mkdir()
            dot_path = upload_dir / (Path(dot_item.filename).name or "graph.dot")
            with open(dot_path, "wb") as handle:
                shutil.copyfileobj(dot_item.file, handle)
            root_path = None
            if root_item is not None:
                root_path = upload_dir / "rechits.root"
                with open(root_path, "wb") as handle:
                    shutil.copyfileobj(root_item.file, handle)
            status = manager.enqueue(job.capability, {
                "dotPath": str(dot_path), "rootPath": str(root_path) if root_path else None,
            })
        except Exception:
            manager.fail_preparation(job.capability)
            raise
        self.send_json_response({"success": True, "job": status}, 202)

    def session_metadata(self, form, source_type, event_index, suggested):
        name = str(self.get_form_value(form, "sessionName", "") or "").strip()
        return {
            "name": name or f"{suggested}, event {event_index}",
            "sourceType": source_type,
            "eventIndex": event_index,
            "createdAt": iso_now(),
        }

    def parse_upload_form(self):
        if not self.validate_upload_size():
            return None
        if not self.headers.get("Content-Type", "").startswith("multipart/form-data"):
            self.send_json_response({"success": False, "error": "Invalid content type"}, 400)
            return None
        try:
            return parse_multipart_form(self.rfile, self.headers)
        except MultipartError as exc:
            self.send_json_response({"success": False, "error": str(exc)}, 400)
            return None

    def api_parts(self):
        return [unquote(part) for part in urlparse(self.path).path.split("/") if part]

    def get_upload_item(self, form, key):
        item = form.get(key)
        if isinstance(item, list):
            item = item[0] if item else None
        return item if item is not None and getattr(item, "filename", None) and getattr(item, "file", None) else None

    def get_form_value(self, form, key, default=None):
        item = form.get(key)
        if isinstance(item, list):
            item = item[0] if item else None
        return getattr(item, "value", default) if item is not None else default

    def get_non_negative_int_field(self, form, key, default):
        return parse_non_negative_int(self.get_form_value(form, key, default), key)

    def validate_upload_size(self):
        max_mb = int(os.environ.get("TRUTHVIZ_MAX_UPLOAD_MB", "2048"))
        raw = self.headers.get("Content-Length")
        if raw is None:
            return True
        try:
            size = int(raw)
        except ValueError:
            self.send_json_response({"success": False, "error": "Invalid Content-Length"}, 400)
            return False
        if size > max_mb * 1024 * 1024:
            self.send_json_response({"success": False, "error": f"Upload exceeds TRUTHVIZ_MAX_UPLOAD_MB={max_mb}"}, 413)
            return False
        return True

    def send_json_file(self, path: Path):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(path.stat().st_size))
        self.end_headers()
        with open(path, "rb") as handle:
            shutil.copyfileobj(handle, self.wfile)

    def send_json_response(self, data, status=200):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))


class ReusableThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def port_number(value):
    try:
        port = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid port: {value}") from exc
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1 and 65535")
    return port


def positive_int(value):
    try:
        number = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid integer: {value}") from exc
    if number < 1:
        raise argparse.ArgumentTypeError("value must be at least 1")
    return number


def parse_args():
    parser = argparse.ArgumentParser(description="Run the Truth Graph Viewer server.")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--start-port", "--port", dest="start_port", default=8009, type=port_number)
    parser.add_argument("--auto-find-port", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--max-port-attempts", default=100, type=positive_int)
    return parser.parse_args()


def create_server(host, start_port, handler, auto_find_port=True, max_attempts=100):
    attempts = max_attempts if auto_find_port else 1
    for port in range(start_port, min(65535, start_port + attempts - 1) + 1):
        try:
            return port, ReusableThreadingTCPServer((host, port), handler)
        except OSError as exc:
            if exc.errno not in {48, 98} or not auto_find_port:
                raise
    raise RuntimeError(f"No available port found from {start_port}")


def main():
    global JOB_MANAGER
    args = parse_args()
    os.chdir(PROJECT_ROOT)
    ttl = int(os.environ.get("TRUTHVIZ_JOB_TTL_SEC", str(24 * 60 * 60)))
    JOB_MANAGER = JobManager(default_job_root(PROJECT_ROOT), process_job, ttl_seconds=ttl)
    port, httpd = create_server(
        args.host, args.start_port, CORSRequestHandler,
        auto_find_port=args.auto_find_port, max_attempts=args.max_port_attempts,
    )
    print(f"Truth Graph Viewer: http://{args.host}:{port}/app/")
    try:
        with httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
    finally:
        JOB_MANAGER.shutdown()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise
