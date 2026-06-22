#!/usr/bin/env python3
"""
CMSSW ROOT-to-viewer processing pipeline.

This module keeps the CMSSW execution and browser-bundle generation in one
place so the server and local CLI use identical behavior.
"""

from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse
from urllib.request import urlretrieve


PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_CMSSW_RELEASE = "CMSSW_20_1_X_2026-06-20-1100"
DEFAULT_CMSSW_SRC = PROJECT_ROOT.parent / DEFAULT_CMSSW_RELEASE / "src"


class PipelineError(RuntimeError):
    """Raised when an input processing job cannot complete."""


@dataclass
class PipelineOptions:
    event_index: int = 0
    dumper_args: list[str] = field(default_factory=list)
    job_id: str | None = None
    job_root: Path | None = None
    cmssw_src: Path | None = None
    cmsrun_timeout: int | None = None
    cmsrun_wrapper: str | None = None
    copy_to_viewer: bool = True


@dataclass
class PipelineResult:
    job_id: str
    job_dir: Path
    cmssw_outdir: Path
    dot_path: Path
    rechits_root_path: Path
    bundle_path: Path
    rechits_json_path: Path
    viewer_bundle_path: Path | None
    viewer_rechits_path: Path | None

    def as_dict(self) -> dict:
        return {
            "jobId": self.job_id,
            "jobDir": str(self.job_dir),
            "cmsswOutdir": str(self.cmssw_outdir),
            "dotPath": str(self.dot_path),
            "rechitsRootPath": str(self.rechits_root_path),
            "bundlePath": str(self.bundle_path),
            "rechitsJsonPath": str(self.rechits_json_path),
            "viewerBundlePath": str(self.viewer_bundle_path) if self.viewer_bundle_path else None,
            "viewerRechitsPath": str(self.viewer_rechits_path) if self.viewer_rechits_path else None,
        }


def default_job_root(project_root: Path = PROJECT_ROOT) -> Path:
    return Path(os.environ.get("TRUTHVIZ_JOB_ROOT", project_root / "data" / "jobs")).expanduser()


def resolve_cmssw_src(explicit: str | Path | None = None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()

    env_src = os.environ.get("TRUTHVIZ_CMSSW_SRC")
    if env_src:
        return Path(env_src).expanduser().resolve()

    cmssw_base = os.environ.get("CMSSW_BASE")
    if cmssw_base:
        return Path(cmssw_base).expanduser().resolve() / "src"

    app_local_src = PROJECT_ROOT / DEFAULT_CMSSW_RELEASE / "src"
    if app_local_src.exists():
        return app_local_src.resolve()

    return DEFAULT_CMSSW_SRC.resolve()


def parse_non_negative_int(value, name: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a non-negative integer") from exc
    if number < 0:
        raise ValueError(f"{name} must be a non-negative integer")
    return number


def parse_dumper_args(args_text: str | None) -> list[str]:
    if not args_text:
        return []
    return shlex.split(args_text)


def validate_cmssw_src(cmssw_src: Path) -> None:
    if not cmssw_src.exists():
        raise PipelineError(f"CMSSW src directory does not exist: {cmssw_src}")
    cfg = cmssw_src / "PhysicsTools" / "TruthInfo" / "test" / "dumpTruthGraphsFromGENSIMRECO_cfg.py"
    if not cfg.exists():
        raise PipelineError(f"CMSSW dumper config not found: {cfg}")


def cmsrun_command(cmssw_src: Path, cfg_path: Path, input_root: Path, outdir: Path, options: PipelineOptions) -> str:
    input_arg = str(input_root)
    if ":" not in input_arg:
        input_arg = f"file:{input_arg}"

    args = [
        "cmsRun",
        str(cfg_path),
        input_arg,
        "-n",
        "1",
        "-o",
        str(outdir),
        "--skipEvents",
        str(options.event_index),
    ]
    args.extend(options.dumper_args)

    quoted_args = " ".join(shlex.quote(arg) for arg in args)
    quoted_src = shlex.quote(str(cmssw_src))
    return f"cd {quoted_src} && CMSSW_ENV=$(scram runtime -sh) && eval \"$CMSSW_ENV\" && {quoted_args}"


def update_status(callback: Callable[..., None] | None, **updates) -> None:
    if callback is not None:
        callback(**updates)


def run_checked(args, *, cwd: Path, timeout: int | None, phase: str) -> subprocess.CompletedProcess:
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        output = "\n".join(part for part in [result.stdout, result.stderr] if part).strip()
        raise PipelineError(f"{phase} failed with exit code {result.returncode}: {output or 'no output'}")
    return result


def cmsrun_subprocess_args(command: str, wrapper: str | None) -> list[str]:
    if wrapper:
        return [*shlex.split(wrapper), "--command-to-run", command]
    return ["bash", "-lc", command]


def find_single_newest(pattern: str, directory: Path, label: str) -> Path:
    matches = sorted(directory.glob(pattern), key=lambda path: path.stat().st_mtime, reverse=True)
    if not matches:
        raise PipelineError(f"No {label} found in {directory} matching {pattern}")
    return matches[0]


def process_cmssw_root(input_root: Path, options: PipelineOptions | None = None, status_callback=None) -> PipelineResult:
    options = options or PipelineOptions()
    options.event_index = parse_non_negative_int(options.event_index, "eventIndex")

    input_root = Path(input_root).expanduser().resolve()
    if not input_root.exists():
        raise PipelineError(f"Input ROOT file does not exist: {input_root}")

    cmssw_src = resolve_cmssw_src(options.cmssw_src)
    validate_cmssw_src(cmssw_src)

    job_root = Path(options.job_root).expanduser().resolve() if options.job_root else default_job_root().resolve()
    job_id = options.job_id or f"{int(time.time())}-{uuid.uuid4().hex[:8]}"
    job_dir = job_root / job_id
    cmssw_outdir = job_dir / "cmssw"
    bundle_path = job_dir / "bundle.json"
    rechits_json_path = job_dir / "rechits.json"
    job_dir.mkdir(parents=True, exist_ok=True)
    cmssw_outdir.mkdir(parents=True, exist_ok=True)

    timeout = options.cmsrun_timeout
    if timeout is None:
        timeout = int(os.environ.get("TRUTHVIZ_CMSRUN_TIMEOUT_SEC", "3600"))

    cfg_path = cmssw_src / "PhysicsTools" / "TruthInfo" / "test" / "dumpTruthGraphsFromGENSIMRECO_cfg.py"
    command = cmsrun_command(cmssw_src, cfg_path, input_root, cmssw_outdir, options)
    wrapper = options.cmsrun_wrapper or os.environ.get("TRUTHVIZ_CMSRUN_WRAPPER")

    update_status(status_callback, phase="cmsrun", message=f"Running cmsRun for event {options.event_index}...")
    result = subprocess.run(
        cmsrun_subprocess_args(command, wrapper),
        cwd=cmssw_src,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    (job_dir / "cmsrun.stdout.log").write_text(result.stdout or "", encoding="utf-8")
    (job_dir / "cmsrun.stderr.log").write_text(result.stderr or "", encoding="utf-8")
    if result.returncode != 0:
        output = "\n".join(part for part in [result.stdout, result.stderr] if part).strip()
        raise PipelineError(f"cmsRun failed with exit code {result.returncode}: {output or 'no output'}")

    dot_path = find_single_newest("truthlogicalgraph*_run*_lumi*_event*.dot", cmssw_outdir, "logical DOT file")
    rechits_root_path = find_single_newest("rechits_nano*.root", cmssw_outdir, "rechits ROOT file")

    update_status(status_callback, phase="bundle", message="Building browser graph bundle...")
    run_checked(
        [
            sys.executable,
            str(PROJECT_ROOT / "preprocess" / "build_bundle.py"),
            str(dot_path),
            str(bundle_path),
            "--no-js-output",
        ],
        cwd=PROJECT_ROOT,
        timeout=1800,
        phase="Bundle generation",
    )

    update_status(status_callback, phase="rechits", message="Building rechits JSON...")
    run_checked(
        [
            sys.executable,
            str(PROJECT_ROOT / "preprocess" / "build_rechits_json.py"),
            str(rechits_root_path),
            str(rechits_json_path),
            "--event-index",
            "0",
            "--no-js-output",
        ],
        cwd=PROJECT_ROOT,
        timeout=1800,
        phase="Rechits generation",
    )

    viewer_bundle_path = None
    viewer_rechits_path = None
    if options.copy_to_viewer:
        update_status(status_callback, phase="viewer", message="Publishing generated files to the viewer...")
        viewer_bundle_path = PROJECT_ROOT / "data" / "bundle.json"
        viewer_rechits_path = PROJECT_ROOT / "data" / "rechits.json"
        viewer_bundle_js_path = PROJECT_ROOT / "app" / "js" / "bundle.js"
        viewer_rechits_js_path = PROJECT_ROOT / "app" / "js" / "rechits.js"
        viewer_bundle_path.parent.mkdir(parents=True, exist_ok=True)
        viewer_bundle_js_path.parent.mkdir(parents=True, exist_ok=True)

        shutil.copy2(bundle_path, viewer_bundle_path)
        shutil.copy2(rechits_json_path, viewer_rechits_path)
        run_checked(
            [
                sys.executable,
                str(PROJECT_ROOT / "preprocess" / "generate_bundle_js.py"),
                str(viewer_bundle_path),
                str(viewer_bundle_js_path),
            ],
            cwd=PROJECT_ROOT,
            timeout=1800,
            phase="Static bundle JS generation",
        )
        run_checked(
            [
                sys.executable,
                str(PROJECT_ROOT / "preprocess" / "build_rechits_json.py"),
                str(rechits_root_path),
                str(viewer_rechits_path),
                "--event-index",
                "0",
                "--js-output",
                str(viewer_rechits_js_path),
            ],
            cwd=PROJECT_ROOT,
            timeout=1800,
            phase="Static rechits JS generation",
        )

    return PipelineResult(
        job_id=job_id,
        job_dir=job_dir,
        cmssw_outdir=cmssw_outdir,
        dot_path=dot_path,
        rechits_root_path=rechits_root_path,
        bundle_path=bundle_path,
        rechits_json_path=rechits_json_path,
        viewer_bundle_path=viewer_bundle_path,
        viewer_rechits_path=viewer_rechits_path,
    )


def catalog_path(project_root: Path = PROJECT_ROOT) -> Path:
    return Path(os.environ.get("TRUTHVIZ_CATALOG", project_root / "samples" / "catalog.json")).expanduser()


def load_catalog(path: Path | None = None) -> dict:
    path = Path(path).expanduser() if path else catalog_path()
    if not path.exists():
        return {"samples": []}
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    samples = data.get("samples", [])
    if not isinstance(samples, list):
        raise PipelineError("Sample catalog must contain a 'samples' list")
    return {"samples": samples}


def find_catalog_sample(sample_id: str, path: Path | None = None) -> dict:
    catalog = load_catalog(path)
    for sample in catalog["samples"]:
        if sample.get("id") == sample_id:
            return sample
    raise PipelineError(f"Sample not found in catalog: {sample_id}")


def materialize_catalog_sample(sample: dict, job_dir: Path) -> Path:
    if "path" in sample:
        sample_path = Path(sample["path"]).expanduser()
        if not sample_path.is_absolute():
            sample_path = (catalog_path().parent / sample_path).resolve()
        else:
            sample_path = sample_path.resolve()
        if not sample_path.exists():
            raise PipelineError(f"Catalog sample path does not exist: {sample_path}")
        return sample_path

    if "url" in sample:
        url = sample["url"]
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            raise PipelineError(f"Unsupported catalog sample URL scheme: {parsed.scheme}")
        destination = job_dir / "input.root"
        urlretrieve(url, destination)
        return destination

    raise PipelineError("Catalog sample must define either 'path' or 'url'")
