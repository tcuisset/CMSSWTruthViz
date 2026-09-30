#!/usr/bin/env python3
"""Rebuild persistent catalogue JSON from the manifest's ROOT inputs."""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from truth_pipeline import (  # noqa: E402
    PipelineOptions,
    catalog_path,
    load_catalog,
    materialize_catalog_sample,
    parse_dumper_args,
    parse_non_negative_int,
    process_cmssw_root,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample", action="append", help="Only rebuild this sample ID (repeatable)")
    args = parser.parse_args()
    selected = set(args.sample or [])
    manifest_path = catalog_path().resolve()

    for sample in load_catalog(manifest_path)["samples"]:
        sample_id = sample.get("id")
        if selected and sample_id not in selected:
            continue
        artifacts = sample.get("artifacts") or {}
        if not artifacts.get("bundle") or not artifacts.get("rechits"):
            raise RuntimeError(f"Sample {sample_id} must define bundle and rechits artifacts")
        dumper_args = sample.get("dumperArgs", [])
        if isinstance(dumper_args, str):
            dumper_args = parse_dumper_args(dumper_args)

        with tempfile.TemporaryDirectory(prefix=f"truthviz-catalog-{sample_id}-") as tmp:
            temporary = Path(tmp)
            input_dir = temporary / "input"
            input_dir.mkdir()
            input_root = materialize_catalog_sample(sample, input_dir)
            result = process_cmssw_root(
                input_root,
                PipelineOptions(
                    event_index=parse_non_negative_int(sample.get("eventIndex", 0), "eventIndex"),
                    dumper_args=[str(value) for value in dumper_args],
                    job_root=temporary / "jobs",
                    copy_to_viewer=False,
                ),
            )
            bundle_target = (manifest_path.parent / artifacts["bundle"]).resolve()
            rechits_target = (manifest_path.parent / artifacts["rechits"]).resolve()
            bundle_target.parent.mkdir(parents=True, exist_ok=True)
            rechits_target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(result.bundle_path, bundle_target)
            shutil.copyfile(result.rechits_json_path, rechits_target)
            print(f"Rebuilt {sample_id}: {bundle_target}, {rechits_target}")


if __name__ == "__main__":
    main()
