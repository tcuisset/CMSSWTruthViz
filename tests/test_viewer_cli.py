"""Regression coverage for isolated local viewing and backend opt-in."""
from functools import partial
import http.server
import json
from pathlib import Path
import tempfile
import threading
import unittest
from types import SimpleNamespace
from unittest import mock
from urllib.error import HTTPError
from urllib.request import urlopen, Request

import server
import viewer_cli


class ViewerTests(unittest.TestCase):
    def test_json_needs_no_pipeline_and_preserves_optional_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "event.json"
            event = {"schemaVersion": 1, "bundle": {"nodes": [], "edges": []},
                     "rechits": {"rechits": [{"id": 7}]}, "associations": {"recoObjects": []}}
            path.write_text(json.dumps(event))
            with mock.patch("truth_pipeline.process_cmssw_root") as pipeline:
                self.assertEqual(viewer_cli.load_event(viewer_cli.parse_args([str(path)])), event)
            pipeline.assert_not_called()

    def test_root_disables_shared_publication_and_keeps_selected_event(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bundle = root / "bundle.json"
            hits = root / "rechits.json"
            bundle.write_text('{"nodes": [], "edges": []}')
            hits.write_text('{"rechits": [{"id": 8}]}')
            result = SimpleNamespace(bundle_path=bundle, rechits_json_path=hits,
                                     cmssw_outdir=root, job_dir=root)
            with mock.patch("truth_pipeline.process_cmssw_root", return_value=result) as pipeline:
                payload = viewer_cli.load_event(viewer_cli.parse_args([str(root / 'event.root'), '--event-index', '4']))
            options = pipeline.call_args.args[1]
            self.assertFalse(options.copy_to_viewer)
            self.assertEqual(options.event_index, 4)
            self.assertEqual(payload['rechits']['rechits'][0]['id'], 8)

    def test_invalid_event_formats(self):
        for event in [[], {}, {"schemaVersion": 2, "bundle": {"nodes": [], "edges": []}},
                      {"nodes": {}, "edges": []}]:
            with self.subTest(event=event), self.assertRaises(ValueError):
                viewer_cli.validate_event(event)

    def test_static_http_serves_event_and_never_enables_backend(self):
        event = {"nodes": [{"id": "selected"}], "edges": []}
        handler = partial(viewer_cli.ViewerHandler, event=event)
        with http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler) as httpd:
            thread = threading.Thread(target=httpd.serve_forever)
            thread.start()
            url = f'http://127.0.0.1:{httpd.server_port}'
            try:
                with urlopen(url + '/js/event.js') as response:
                    self.assertIn('selected', response.read().decode())
                with urlopen(url + '/js/runtime-config.js') as response:
                    self.assertIn("mode: 'viewer'", response.read().decode())
                with urlopen(url + '/js/rechits.js') as response:
                    self.assertIn('null', response.read().decode())
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(url + '/api/jobs/root', data=b'input'))
                self.assertEqual(error.exception.code, 501)
                with self.assertRaises(HTTPError) as error:
                    urlopen(url + '/api/catalog')
                self.assertEqual(error.exception.code, 404)
            finally:
                httpd.shutdown()
                thread.join()

    def test_backend_explicitly_enables_its_frontend(self):
        with http.server.ThreadingHTTPServer(('127.0.0.1', 0), server.CORSRequestHandler) as httpd:
            thread = threading.Thread(target=httpd.serve_forever)
            thread.start()
            try:
                with urlopen(f'http://127.0.0.1:{httpd.server_port}/app/js/runtime-config.js') as response:
                    self.assertIn('mode: "backend"', response.read().decode())
            finally:
                httpd.shutdown()
                thread.join()

    def test_server_environment_and_cli_override(self):
        with mock.patch.dict('os.environ', {'TRUTHVIZ_SERVER_HOST': '0.0.0.0',
                                          'TRUTHVIZ_SERVER_PORT': '3000',
                                          'TRUTHVIZ_SERVER_AUTO_FIND_PORT': '0'}):
            with mock.patch('sys.argv', ['server.py']):
                args = server.parse_args()
            self.assertEqual((args.host, args.start_port, args.auto_find_port), ('0.0.0.0', 3000, False))
            with mock.patch('sys.argv', ['server.py', '--port', '8009', '--auto-find-port']):
                args = server.parse_args()
            self.assertEqual((args.start_port, args.auto_find_port), (8009, True))
        with mock.patch.dict('os.environ', {'TRUTHVIZ_SERVER_AUTO_FIND_PORT': 'sometimes'}):
            with mock.patch('sys.argv', ['server.py']), self.assertRaises(SystemExit):
                server.parse_args()


if __name__ == '__main__':
    unittest.main()
