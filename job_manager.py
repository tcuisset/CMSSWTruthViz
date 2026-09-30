"""Capability-scoped, single-worker processing jobs for the HTTP server."""

from __future__ import annotations

import queue
import secrets
import shutil
import tempfile
import threading
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


TERMINAL_STATES = {"success", "error"}
MAX_LOG_CHARS = 200_000


@dataclass
class Job:
    capability: str
    kind: str
    job_dir: Path
    metadata: dict[str, Any]
    payload: dict[str, Any] = field(default_factory=dict)
    state: str = "preparing"
    phase: str = "preparing"
    message: str = "Preparing input..."
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    finished_at: float | None = None
    result_path: Path | None = None
    logs: str = ""


class JobManager:
    """Own isolated job directories and execute jobs through one worker."""

    def __init__(
        self,
        job_root: Path,
        processor: Callable[[Job, Callable[..., None]], Path],
        *,
        ttl_seconds: int = 24 * 60 * 60,
        start_worker: bool = True,
    ):
        self.job_root = Path(job_root).expanduser().resolve()
        self.job_root.mkdir(parents=True, exist_ok=True)
        self.processor = processor
        self.ttl_seconds = ttl_seconds
        self._jobs: dict[str, Job] = {}
        self._queue: queue.Queue[str | None] = queue.Queue()
        self._lock = threading.RLock()
        self._worker = None
        self._cleanup_thread = None
        self._stop_cleanup = threading.Event()
        self.cleanup_startup_directories()
        if start_worker:
            self._worker = threading.Thread(target=self._work, name="truthviz-job-worker", daemon=True)
            self._worker.start()
            self._cleanup_thread = threading.Thread(
                target=self._cleanup_loop, name="truthviz-job-cleanup", daemon=True
            )
            self._cleanup_thread.start()

    def reserve(self, kind: str, metadata: dict[str, Any] | None = None) -> Job:
        capability = secrets.token_urlsafe(32)
        directory = Path(tempfile.mkdtemp(prefix="truthviz-", dir=self.job_root))
        job = Job(capability, kind, directory, dict(metadata or {}))
        with self._lock:
            self._jobs[capability] = job
        return job

    def enqueue(self, capability: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        with self._lock:
            job = self._require(capability)
            if job.state != "preparing":
                raise ValueError("Job has already been queued")
            job.payload = dict(payload or {})
            job.state = "queued"
            job.phase = "queued"
            job.message = "Waiting for the processing worker..."
            self._queue.put(capability)
            return self._snapshot_locked(job)

    def fail_preparation(self, capability: str) -> None:
        with self._lock:
            job = self._jobs.pop(capability, None)
        if job:
            shutil.rmtree(job.job_dir, ignore_errors=True)

    def get(self, capability: str) -> Job | None:
        self.cleanup_expired()
        with self._lock:
            return self._jobs.get(capability)

    def status(self, capability: str) -> dict[str, Any] | None:
        self.cleanup_expired()
        with self._lock:
            job = self._jobs.get(capability)
            return self._snapshot_locked(job) if job else None

    def acknowledge(self, capability: str) -> bool:
        with self._lock:
            job = self._jobs.get(capability)
            if job is None:
                return False
            if job.state not in TERMINAL_STATES:
                raise ValueError("A running or queued job cannot be deleted")
            del self._jobs[capability]
        shutil.rmtree(job.job_dir, ignore_errors=True)
        return True

    def update(self, capability: str, **updates: Any) -> None:
        with self._lock:
            job = self._require(capability)
            for key, value in updates.items():
                if not hasattr(job, key):
                    raise AttributeError(key)
                setattr(job, key, value)

    def append_log(self, capability: str, text: str) -> None:
        """Add processor output while bounding the status response size."""
        if not text:
            return
        with self._lock:
            job = self._require(capability)
            combined = f"{job.logs}{text}"
            if len(combined) > MAX_LOG_CHARS:
                omitted = len(combined) - MAX_LOG_CHARS
                marker = f"[Earlier log output omitted ({omitted} characters).]\n"
                combined = marker + combined[-(MAX_LOG_CHARS - len(marker)):]
            job.logs = combined

    def cleanup_expired(self, now: float | None = None) -> None:
        now = time.time() if now is None else now
        expired: list[Job] = []
        with self._lock:
            for capability, job in list(self._jobs.items()):
                if job.state in TERMINAL_STATES and job.finished_at is not None:
                    if now - job.finished_at >= self.ttl_seconds:
                        expired.append(job)
                        del self._jobs[capability]
        for job in expired:
            shutil.rmtree(job.job_dir, ignore_errors=True)

    def cleanup_startup_directories(self, now: float | None = None) -> None:
        now = time.time() if now is None else now
        with self._lock:
            registered = {job.job_dir for job in self._jobs.values()}
        for path in self.job_root.glob("truthviz-*"):
            if path in registered:
                continue
            try:
                age = now - path.stat().st_mtime
            except FileNotFoundError:
                continue
            if path.is_dir() and age >= self.ttl_seconds:
                shutil.rmtree(path, ignore_errors=True)

    def shutdown(self) -> None:
        self._stop_cleanup.set()
        if self._worker is not None:
            self._queue.put(None)
            self._worker.join(timeout=5)
        if self._cleanup_thread is not None:
            self._cleanup_thread.join(timeout=5)

    def _cleanup_loop(self) -> None:
        interval = min(60, max(1, self.ttl_seconds))
        while not self._stop_cleanup.wait(interval):
            self.cleanup_expired()
            self.cleanup_startup_directories()

    def _work(self) -> None:
        while True:
            capability = self._queue.get()
            if capability is None:
                self._queue.task_done()
                return
            with self._lock:
                job = self._jobs.get(capability)
                if job is None:
                    self._queue.task_done()
                    continue
                job.state = "running"
                job.phase = "starting"
                job.message = "Processing started..."
                job.started_at = time.time()

            def update(**updates: Any) -> None:
                log = updates.pop("log", None)
                if log is not None:
                    self.append_log(capability, str(log))
                updates.setdefault("state", "running")
                self.update(capability, **updates)

            try:
                result_path = self.processor(job, update)
                with self._lock:
                    current = self._require(capability)
                    current.state = "success"
                    current.phase = "complete"
                    current.message = "Processing completed successfully."
                    current.result_path = Path(result_path)
                    current.finished_at = time.time()
            except Exception as exc:  # The HTTP layer reports the sanitized message.
                print(f"Job {capability} failed ({type(exc).__name__}): {exc}", flush=True)
                traceback.print_exc()
                with self._lock:
                    current = self._jobs.get(capability)
                    if current is not None:
                        current.state = "error"
                        current.phase = "error"
                        current.message = "Processing failed. See the server log for details."
                        current.finished_at = time.time()
            finally:
                self._queue.task_done()

    def _require(self, capability: str) -> Job:
        job = self._jobs.get(capability)
        if job is None:
            raise KeyError(capability)
        return job

    def _snapshot_locked(self, job: Job) -> dict[str, Any]:
        queue_position = None
        if job.state == "queued":
            queued = sorted(
                (candidate for candidate in self._jobs.values() if candidate.state == "queued"),
                key=lambda candidate: candidate.created_at,
            )
            queue_position = next(
                (index for index, candidate in enumerate(queued, start=1) if candidate is job),
                None,
            )
        return {
            "id": job.capability,
            "state": job.state,
            "phase": job.phase,
            "message": job.message,
            "queuePosition": queue_position,
            "createdAt": job.created_at,
            "startedAt": job.started_at,
            "finishedAt": job.finished_at,
            "logs": job.logs,
        }
