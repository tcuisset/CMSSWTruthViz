import os
import tempfile
import threading
import time
import unittest
from pathlib import Path

from job_manager import JobManager


class JobManagerTests(unittest.TestCase):
    def test_processor_logs_are_available_in_job_status(self):
        with tempfile.TemporaryDirectory() as tmp:
            def processor(job, update):
                update(log="===== cmsRun =====\n[stdout]\nprocessing event\n")
                result = job.job_dir / "result.json"
                result.write_text("{}", encoding="utf-8")
                return result

            manager = JobManager(Path(tmp), processor)
            try:
                job = manager.reserve("root")
                manager.enqueue(job.capability)
                deadline = time.time() + 2
                while time.time() < deadline and manager.status(job.capability)["state"] != "success":
                    time.sleep(0.01)
                status = manager.status(job.capability)
                self.assertIn("===== cmsRun =====", status["logs"])
                self.assertIn("processing event", status["logs"])
            finally:
                manager.shutdown()

    def test_jobs_are_isolated_fifo_and_acknowledged_independently(self):
        with tempfile.TemporaryDirectory() as tmp:
            first_started = threading.Event()
            release_first = threading.Event()
            execution_order = []

            def processor(job, update):
                execution_order.append(job.metadata["name"])
                if job.metadata["name"] == "first":
                    first_started.set()
                    release_first.wait(2)
                result = job.job_dir / "result.json"
                result.write_text("{}", encoding="utf-8")
                return result

            manager = JobManager(Path(tmp), processor)
            try:
                first = manager.reserve("prepared", {"name": "first"})
                second = manager.reserve("prepared", {"name": "second"})
                third = manager.reserve("prepared", {"name": "third"})
                self.assertNotEqual(first.capability, second.capability)
                self.assertNotEqual(first.job_dir, second.job_dir)

                manager.enqueue(first.capability)
                self.assertTrue(first_started.wait(2))
                manager.enqueue(second.capability)
                manager.enqueue(third.capability)
                self.assertEqual(manager.status(second.capability)["queuePosition"], 1)
                self.assertEqual(manager.status(third.capability)["queuePosition"], 2)

                release_first.set()
                deadline = time.time() + 3
                while time.time() < deadline and manager.status(third.capability)["state"] != "success":
                    time.sleep(0.01)
                self.assertEqual(execution_order, ["first", "second", "third"])
                self.assertEqual(manager.status(first.capability)["state"], "success")
                self.assertTrue(manager.acknowledge(first.capability))
                self.assertFalse(first.job_dir.exists())
                self.assertTrue(second.job_dir.exists())
                self.assertIsNone(manager.status(first.capability))
            finally:
                manager.shutdown()

    def test_running_job_cannot_be_acknowledged(self):
        with tempfile.TemporaryDirectory() as tmp:
            release = threading.Event()

            def processor(job, update):
                release.wait(2)
                result = job.job_dir / "result.json"
                result.write_text("{}", encoding="utf-8")
                return result

            manager = JobManager(Path(tmp), processor)
            try:
                job = manager.reserve("root", {"name": "running"})
                manager.enqueue(job.capability)
                deadline = time.time() + 2
                while time.time() < deadline and manager.status(job.capability)["state"] != "running":
                    time.sleep(0.01)
                with self.assertRaisesRegex(ValueError, "cannot be deleted"):
                    manager.acknowledge(job.capability)
                release.set()
            finally:
                release.set()
                manager.shutdown()

    def test_terminal_job_expires_and_startup_removes_only_old_managed_directories(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = root / "truthviz-old"
            keep = root / "unrelated"
            old.mkdir()
            keep.mkdir()
            os.utime(old, (1, 1))
            os.utime(keep, (1, 1))

            manager = JobManager(root, lambda job, update: job.job_dir / "result.json", ttl_seconds=10, start_worker=False)
            self.assertFalse(old.exists())
            self.assertTrue(keep.exists())

            job = manager.reserve("prepared", {"name": "expired"})
            manager.update(job.capability, state="error", finished_at=1)
            manager.cleanup_expired(now=20)
            self.assertIsNone(manager.status(job.capability))
            self.assertFalse(job.job_dir.exists())


if __name__ == "__main__":
    unittest.main()
