import io
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import truth_pipeline
from truth_pipeline import PipelineOptions


class FakeProcess:
    def __init__(self, *, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = io.StringIO(stdout)
        self.stderr = io.StringIO(stderr)

    def wait(self, timeout=None):
        return self.returncode

    def kill(self):
        self.returncode = -9


class TruthPipelineTests(unittest.TestCase):
    def test_default_cmssw_release_is_regular_pre3(self):
        self.assertEqual(truth_pipeline.DEFAULT_CMSSW_RELEASE, "CMSSW_20_1_0_pre3")

    def test_cmsrun_wrapper_config_sets_skip_events(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wrapper = root / "wrapper_cfg.py"
            original_cfg = root / "dumpTruthGraphsFromGENSIMRECO_cfg.py"
            output_dir = root / "out"
            input_root = root / "sample.root"

            truth_pipeline.write_cmsrun_wrapper_config(
                wrapper,
                original_cfg,
                input_root,
                output_dir,
                PipelineOptions(event_index=7, dumper_args=["--no-keepSpectators", "-s", "23"]),
            )

            content = wrapper.read_text(encoding="utf-8")
            self.assertIn("runpy.run_path", content)
            self.assertIn("file:" + str(input_root), content)
            self.assertIn("'-n', '1'", content)
            self.assertIn("--no-keepSpectators", content)
            self.assertIn("process.source.skipEvents = cms.untracked.uint32(7)", content)
            self.assertIn("process.truthLogicalGraphDumper.dumpSimHits = cms.bool(True)", content)

    def test_cmsrun_command_runs_wrapper_config_only(self):
        command = truth_pipeline.cmsrun_command(
            Path("/cmssw/src"),
            Path("/cmssw/src/PhysicsTools/TruthInfo/test/dumpTruthGraphsFromGENSIMRECO_cfg.py"),
        )

        self.assertIn("cmsRun", command)
        self.assertIn("dumpTruthGraphsFromGENSIMRECO_cfg.py", command)
        self.assertNotIn("--skipEvents", command)

    def test_find_single_newest_uses_event_suffixed_dot(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            older = directory / "truthlogicalgraph_run1_lumi1_event1.dot"
            newer = directory / "truthlogicalgraph_run1_lumi1_event2.dot"
            older.write_text("old", encoding="utf-8")
            newer.write_text("new", encoding="utf-8")
            os.utime(older, (1, 1))
            os.utime(newer, (2, 2))

            found = truth_pipeline.find_single_newest(
                "truthlogicalgraph*_run*_lumi*_event*.dot",
                directory,
                "logical DOT file",
            )

            self.assertEqual(found, newer)

    def test_cmsrun_subprocess_args_supports_wrapper(self):
        args = truth_pipeline.cmsrun_subprocess_args("cd /cmssw/src && cmsRun cfg.py", "cmssw-el9")

        self.assertEqual(args, ["cmssw-el9", "--command-to-run", "cd /cmssw/src && cmsRun cfg.py"])

    def test_resolve_cmssw_src_prefers_app_local_install(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_root = Path(tmp) / "CMSSWGraphViz"
            app_local_src = project_root / truth_pipeline.DEFAULT_CMSSW_RELEASE / "src"
            app_local_src.mkdir(parents=True)

            with mock.patch.object(truth_pipeline, "PROJECT_ROOT", project_root):
                with mock.patch.dict(os.environ, {}, clear=True):
                    self.assertEqual(truth_pipeline.resolve_cmssw_src(), app_local_src.resolve())

    def test_resolve_cmssw_src_finds_managed_install(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_root = Path(tmp) / "CMSSWGraphViz"
            managed_src = project_root / "data" / "cmssw" / truth_pipeline.DEFAULT_CMSSW_RELEASE / "src"
            managed_src.mkdir(parents=True)

            with mock.patch.object(truth_pipeline, "PROJECT_ROOT", project_root):
                with mock.patch.dict(os.environ, {}, clear=True):
                    self.assertEqual(truth_pipeline.resolve_cmssw_src(), managed_src.resolve())

    def test_load_catalog_requires_samples_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            catalog = Path(tmp) / "catalog.json"
            catalog.write_text(json.dumps({"samples": [{"id": "zmm", "path": "/tmp/zmm.root"}]}), encoding="utf-8")

            loaded = truth_pipeline.load_catalog(catalog)

            self.assertEqual(loaded["samples"][0]["id"], "zmm")

    @mock.patch("truth_pipeline.run_checked")
    @mock.patch("truth_pipeline.subprocess.Popen")
    def test_process_cmssw_root_discovers_outputs_and_runs_converters(self, mock_popen, mock_run_checked):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cmssw_src = root / "CMSSW" / "src"
            cfg = cmssw_src / "PhysicsTools" / "TruthInfo" / "test" / "dumpTruthGraphsFromGENSIMRECO_cfg.py"
            cfg.parent.mkdir(parents=True)
            cfg.write_text("# cfg", encoding="utf-8")
            input_root = root / "input.root"
            input_root.write_text("root", encoding="utf-8")
            job_root = root / "jobs"

            def fake_popen(args, **kwargs):
                outdir = job_root / "job1" / "cmssw"
                outdir.mkdir(parents=True, exist_ok=True)
                (outdir / "truthlogicalgraph_run1_lumi1_event8.dot").write_text("digraph {}", encoding="utf-8")
                (outdir / "rechits_nano.root").write_text("root", encoding="utf-8")
                return FakeProcess(stdout="cmsRun stdout\n", stderr="cmsRun stderr\n")

            mock_popen.side_effect = fake_popen
            updates = []

            result = truth_pipeline.process_cmssw_root(
                input_root,
                PipelineOptions(
                    event_index=8,
                    job_id="job1",
                    job_root=job_root,
                    cmssw_src=cmssw_src,
                    copy_to_viewer=False,
                ),
                status_callback=lambda **values: updates.append(values),
            )

            self.assertEqual(result.dot_path.name, "truthlogicalgraph_run1_lumi1_event8.dot")
            self.assertEqual(result.rechits_root_path.name, "rechits_nano.root")
            self.assertIsNone(result.debug_dir)
            self.assertEqual(mock_run_checked.call_count, 2)
            rechits_command = mock_run_checked.call_args_list[1].args[0]
            event_index_flag = rechits_command.index("--event-index")
            self.assertEqual(rechits_command[event_index_flag + 1], "0")
            cmsrun_logs = [value["log"] for value in updates if "log" in value]
            self.assertIn("===== cmsRun =====", cmsrun_logs[0])
            self.assertIn("cmsRun stdout", "".join(cmsrun_logs))
            self.assertIn("cmsRun stderr", "".join(cmsrun_logs))

    @mock.patch("truth_pipeline.run_checked")
    @mock.patch("truth_pipeline.subprocess.Popen")
    def test_process_cmssw_root_saves_debug_artifacts(self, mock_popen, mock_run_checked):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cmssw_src = root / "CMSSW" / "src"
            cfg = cmssw_src / "PhysicsTools" / "TruthInfo" / "test" / "dumpTruthGraphsFromGENSIMRECO_cfg.py"
            cfg.parent.mkdir(parents=True)
            cfg.write_text("# cfg", encoding="utf-8")
            input_root = root / "input.root"
            input_root.write_text("root", encoding="utf-8")
            job_root = root / "jobs"
            debug_root = root / "debug"

            def fake_popen(args, **kwargs):
                outdir = job_root / "job-debug" / "cmssw"
                outdir.mkdir(parents=True, exist_ok=True)
                (outdir / "truthlogicalgraph_run1_lumi1_event8.dot").write_text("digraph {}", encoding="utf-8")
                (outdir / "rechits_nano.root").write_text("root", encoding="utf-8")
                return FakeProcess(stdout="cmsRun stdout\n", stderr="cmsRun stderr\n")

            mock_popen.side_effect = fake_popen

            result = truth_pipeline.process_cmssw_root(
                input_root,
                PipelineOptions(
                    event_index=8,
                    job_id="job-debug",
                    job_root=job_root,
                    cmssw_src=cmssw_src,
                    debug_dir=debug_root,
                    copy_to_viewer=False,
                ),
            )

            saved_dir = debug_root / "job-debug"
            self.assertEqual(result.debug_dir, saved_dir)
            self.assertIn("process.source.skipEvents = cms.untracked.uint32(8)",
                          (saved_dir / "dumpTruthGraphs_wrapper_cfg.py").read_text(encoding="utf-8"))
            pipeline_log = (saved_dir / "pipeline.log").read_text(encoding="utf-8")
            self.assertIn("===== cmsRun =====", pipeline_log)
            self.assertIn("[stdout] cmsRun stdout", pipeline_log)
            self.assertEqual(mock_run_checked.call_args_list[0].kwargs["log_path"], saved_dir / "pipeline.log")
            self.assertEqual((saved_dir / "cmsrun.stdout.log").read_text(encoding="utf-8"), "cmsRun stdout\n")
            self.assertEqual((saved_dir / "cmsrun.stderr.log").read_text(encoding="utf-8"), "cmsRun stderr\n")

    @mock.patch("truth_pipeline.subprocess.Popen")
    def test_process_log_is_saved_when_a_process_times_out(self, mock_popen):
        class TimedOutProcess(FakeProcess):
            def wait(self, timeout=None):
                if timeout == 1:
                    raise subprocess.TimeoutExpired("cmsRun", timeout)
                return self.returncode

        mock_popen.return_value = TimedOutProcess()
        with tempfile.TemporaryDirectory() as tmp:
            log_path = Path(tmp) / "pipeline.log"
            with self.assertRaisesRegex(truth_pipeline.PipelineError, "timed out"):
                truth_pipeline.run_process_with_live_output(
                    ["cmsRun", "wrapper.py"],
                    cwd=Path(tmp),
                    timeout=1,
                    phase="cmsRun",
                    log_path=log_path,
                )
            self.assertIn("===== cmsRun =====", log_path.read_text(encoding="utf-8"))

    @mock.patch("truth_pipeline.subprocess.Popen")
    def test_converter_output_is_reported_to_status_callback(self, mock_popen):
        mock_popen.return_value = FakeProcess(
            stdout="converter stdout\n",
            stderr="converter stderr\n",
        )
        logs = []

        truth_pipeline.run_checked(
            ["python3", "converter.py"],
            cwd=Path("/tmp"),
            timeout=30,
            phase="Python: converter.py",
            status_callback=lambda **updates: logs.append(updates["log"]),
        )

        self.assertIn("===== Python: converter.py =====", logs[0])
        self.assertIn("[stdout] converter stdout", "".join(logs))
        self.assertIn("[stderr] converter stderr", "".join(logs))

    def test_process_output_is_forwarded_before_process_finishes(self):
        first_line_seen = threading.Event()
        process_finished = threading.Event()
        result_holder = []

        def callback(**updates):
            if "[stdout] first line" in updates.get("log", ""):
                first_line_seen.set()

        def run_process():
            result_holder.append(truth_pipeline.run_process_with_live_output(
                [
                    sys.executable,
                    "-u",
                    "-c",
                    "import time; print('first line', flush=True); time.sleep(0.75); print('second line', flush=True)",
                ],
                cwd=Path.cwd(),
                timeout=5,
                phase="Python: streaming test",
                status_callback=callback,
            ))
            process_finished.set()

        worker = threading.Thread(target=run_process)
        worker.start()
        self.assertTrue(first_line_seen.wait(2))
        self.assertFalse(process_finished.is_set())
        worker.join(5)
        self.assertTrue(process_finished.is_set())
        self.assertEqual(result_holder[0].returncode, 0)


if __name__ == "__main__":
    unittest.main()
