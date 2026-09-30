import os
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


class ServerPathTests(unittest.TestCase):
    def test_local_cmssw_root_path_requires_dev_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            root_path = Path(tmp) / "input.root"
            root_path.write_text("root", encoding="utf-8")

            with mock.patch.dict(os.environ, {}, clear=True):
                with self.assertRaisesRegex(ValueError, "under /eos"):
                    server.resolve_cmssw_root_server_path(str(root_path))

    def test_local_cmssw_root_path_allowed_with_dev_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            root_path = Path(tmp) / "input.root"
            root_path.write_text("root", encoding="utf-8")

            with mock.patch.dict(os.environ, {"TRUTHVIZ_ALLOW_LOCAL_ROOT_PATHS": "1"}, clear=True):
                self.assertEqual(server.resolve_cmssw_root_server_path(str(root_path)), root_path.resolve())

    def test_cmssw_root_path_must_be_absolute(self):
        with self.assertRaisesRegex(ValueError, "absolute"):
            server.resolve_cmssw_root_server_path("input.root")


class ServerSessionTests(unittest.TestCase):
    def test_catalogue_result_reads_prebuilt_json_without_processing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            artifacts = root / "artifacts" / "sample"
            artifacts.mkdir(parents=True)
            (artifacts / "bundle.json").write_text(json.dumps({"nodes": [], "edges": []}), encoding="utf-8")
            (artifacts / "rechits.json").write_text(json.dumps({
                "rechits": [{"id": 1}], "metadata": {"source": "/private/job/rechits.root"},
            }), encoding="utf-8")
            catalog = root / "catalog.json"
            catalog.write_text(json.dumps({"samples": [{
                "id": "sample", "label": "Sample", "eventIndex": 3,
                "artifacts": {
                    "bundle": "artifacts/sample/bundle.json",
                    "rechits": "artifacts/sample/rechits.json",
                },
            }]}), encoding="utf-8")

            with mock.patch.dict(os.environ, {"TRUTHVIZ_CATALOG": str(catalog)}):
                with mock.patch("server.process_cmssw_root") as process:
                    result = server.catalog_result("sample")

            process.assert_not_called()
            self.assertEqual(result["session"]["sourceType"], "catalog")
            self.assertEqual(result["session"]["eventIndex"], 3)
            self.assertEqual(result["rechits"]["rechits"][0]["id"], 1)
            self.assertEqual(result["rechits"]["metadata"]["source"], "rechits.root")

    def test_prepared_job_writes_only_inside_its_random_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            job_dir = root / "truthviz-random"
            upload = job_dir / "upload"
            upload.mkdir(parents=True)
            dot_path = upload / "input.dot"
            dot_path.write_text("digraph {}", encoding="utf-8")
            root_path = upload / "rechits.root"
            root_path.write_text("root", encoding="utf-8")
            job = SimpleNamespace(
                capability="secret", kind="prepared", job_dir=job_dir,
                metadata={"name": "Prepared", "sourceType": "prepared", "eventIndex": 4, "createdAt": "now"},
                payload={"dotPath": str(dot_path), "rootPath": str(root_path)},
            )

            def fake_converter(args, **kwargs):
                output = Path(args[3])
                if "build_bundle.py" in args[1]:
                    output.write_text(json.dumps({"nodes": [], "edges": []}), encoding="utf-8")
                else:
                    output.write_text(json.dumps({"rechits": [{"id": 4}]}), encoding="utf-8")

            with mock.patch("server.run_checked", side_effect=fake_converter):
                result_path = server.process_job(job, lambda **updates: None)

            self.assertEqual(result_path.parent, job_dir)
            envelope = json.loads(result_path.read_text(encoding="utf-8"))
            self.assertEqual(envelope["rechits"]["rechits"][0]["id"], 4)
            self.assertFalse((root / "data" / "bundle.json").exists())

    def test_root_job_disables_shared_viewer_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            job_dir = root / "truthviz-random"
            job_dir.mkdir()
            input_root = job_dir / "input.root"
            input_root.write_text("root", encoding="utf-8")
            bundle = job_dir / "bundle.json"
            rechits = job_dir / "rechits.json"
            bundle.write_text(json.dumps({"nodes": [], "edges": []}), encoding="utf-8")
            rechits.write_text(json.dumps({"rechits": []}), encoding="utf-8")
            cmssw = job_dir / "cmssw"
            cmssw.mkdir()
            job = SimpleNamespace(
                capability="secret", kind="root", job_dir=job_dir,
                metadata={"name": "ROOT", "sourceType": "upload", "eventIndex": 7, "createdAt": "now"},
                payload={"inputRoot": str(input_root), "dumperArgs": []},
            )
            pipeline_result = SimpleNamespace(
                bundle_path=bundle, rechits_json_path=rechits, cmssw_outdir=cmssw,
            )

            with mock.patch("server.process_cmssw_root", return_value=pipeline_result) as process:
                server.process_job(job, lambda **updates: None)

            options = process.call_args.args[1]
            self.assertFalse(options.copy_to_viewer)
            self.assertEqual(options.event_index, 7)


if __name__ == "__main__":
    unittest.main()
