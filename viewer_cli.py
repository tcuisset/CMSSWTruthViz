"""Local event viewer: optional ROOT conversion followed by static HTTP serving.

This module uses only the standard library until a ROOT input is selected. It
never imports server.py or exposes processing APIs.
"""
import argparse
from functools import partial
import http.server
import json
from pathlib import Path
import sys
import webbrowser

PROJECT_ROOT = Path(__file__).resolve().parent


def port_number(value):
    port = int(value)
    if not 0 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 0 and 65535")
    return port


def validate_event(payload):
    if not isinstance(payload, dict):
        raise ValueError("Expected a JSON graph bundle or version 1 event envelope")
    if "schemaVersion" in payload:
        if payload["schemaVersion"] != 1:
            raise ValueError("Unsupported event-session format")
        bundle = payload.get("bundle")
    else:
        bundle = payload
    if not isinstance(bundle, dict) or not isinstance(bundle.get("nodes"), list) or not isinstance(bundle.get("edges"), list):
        raise ValueError("A graph bundle must contain nodes and edges arrays")
    rechits = payload.get("rechits") if "schemaVersion" in payload else None
    if rechits is not None and (not isinstance(rechits, dict) or not isinstance(rechits.get("rechits"), list)):
        raise ValueError("Rechits JSON must contain a rechits array")
    return payload


def read_json(path):
    with path.open(encoding="utf-8") as source:
        return json.load(source)


def load_event(args):
    path = args.input.expanduser().resolve()
    if path.suffix.lower() == ".json":
        payload = validate_event(read_json(path))
        if args.rechits or args.associations:
            if "schemaVersion" not in payload:
                payload = {"schemaVersion": 1, "bundle": payload}
            if args.rechits:
                payload["rechits"] = read_json(args.rechits)
            if args.associations:
                payload["associations"] = read_json(args.associations)
        return validate_event(payload)
    if path.suffix.lower() != ".root":
        raise ValueError("Input must be a CMSSW EDM .root file or a .json bundle/event envelope")
    if args.rechits or args.associations:
        raise ValueError("--rechits and --associations are for JSON input; ROOT conversion produces its own data")
    from truth_pipeline import PipelineOptions, parse_dumper_args, process_cmssw_root
    result = process_cmssw_root(path, PipelineOptions(
        event_index=args.event_index, dumper_args=parse_dumper_args(args.dumper_args),
        job_root=args.job_root, cmssw_src=args.cmssw_src, debug_dir=args.debug_dir,
        copy_to_viewer=False,
    ))
    associations = sorted(result.cmssw_outdir.rglob("*association*.json"), key=lambda path: path.stat().st_mtime)
    payload = {
        "schemaVersion": 1,
        "bundle": read_json(result.bundle_path),
        "rechits": read_json(result.rechits_json_path),
        "associations": read_json(associations[-1]) if associations else None,
    }
    print(f"Generated event in {result.job_dir}", flush=True)
    return validate_event(payload)


class ViewerHandler(http.server.SimpleHTTPRequestHandler):
    """Read-only static assets and an immutable event; no Python backend API."""
    def __init__(self, *args, event, **kwargs):
        self.event = event
        super().__init__(*args, directory=str(PROJECT_ROOT / "app"), **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        wrappers = {
            "/js/bundle.js": "window.EMBEDDED_BUNDLE_DATA = null;",
            "/js/rechits.js": "window.EMBEDDED_RECHITS_DATA = null;",
            "/js/associations.js": "window.EMBEDDED_ASSOCIATION_DATA = null;",

        }
        if path == "/js/event.js":
            wrappers[path] = "window.EMBEDDED_EVENT_DATA = " + json.dumps(self.event) + ";"
        if path in wrappers:
            body = wrappers[path].encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


def parse_args(argv=None):
    parser = argparse.ArgumentParser(prog="visualizeTruthGraph", description="Open a ROOT EDM event or JSON graph in the client-side viewer.")
    parser.add_argument("input", type=Path)
    parser.add_argument("--event-index", type=int, default=0)
    parser.add_argument("--cmssw-src", type=Path)
    parser.add_argument("--job-root", type=Path)
    parser.add_argument("--save-debug", "--debug-dir", dest="debug_dir", type=Path)
    parser.add_argument("--dumper-args", default="")
    parser.add_argument("--rechits", type=Path, help="Optional rechits JSON accompanying a JSON bundle")
    parser.add_argument("--associations", type=Path, help="Optional associations JSON accompanying a JSON bundle")
    parser.add_argument("--no-server", action="store_true", help="Validate/convert input and exit")
    parser.add_argument("--no-browser", action="store_true", help="Print the URL without opening a browser")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=port_number, default=0, help="Static viewer port (default: automatically allocated)")
    args = parser.parse_args(argv)
    if args.event_index < 0:
        parser.error("--event-index must be non-negative")
    return args


def main(argv=None):
    args = parse_args(argv)
    try:
        event = load_event(args)
        if args.no_server:
            print("Event ready.")
            return 0
        if not (PROJECT_ROOT / "app/vendor/cytoscape.min.js").exists():
            raise ValueError("Frontend libraries are missing. Run npm ci && npm run vendor first.")
        handler = partial(ViewerHandler, event=event)
        with http.server.ThreadingHTTPServer((args.host, args.port), handler) as httpd:
            url = f"http://{args.host}:{httpd.server_port}/"
            print(f"Truth Graph Viewer (visualization only): {url}", flush=True)
            if not args.no_browser:
                webbrowser.open(url)
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                pass
        return 0
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
