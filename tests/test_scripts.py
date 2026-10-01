import os
from pathlib import Path
import subprocess
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class ScriptTests(unittest.TestCase):
    def run_script(self, script, *args, env=None):
        command_env = os.environ.copy()
        if env:
            command_env.update(env)
        return subprocess.run(
            [str(PROJECT_ROOT / script), *args],
            cwd=PROJECT_ROOT,
            env=command_env,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_install_cmssw_reuses_only_matching_topic(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            install_root = Path(temporary_directory)
            project = install_root / "CMSSW_TEST"
            truth_info = project / "src/PhysicsTools/TruthInfo/test"
            (project / ".SCRAM").mkdir(parents=True)
            truth_info.mkdir(parents=True)
            (truth_info / "dumpTruthGraphsFromGENSIMRECO_cfg.py").touch()
            (project / ".truthviz-topic").write_text("alice:feature")

            matching = self.run_script(
                "scripts/install-cmssw.sh",
                "--release", "CMSSW_TEST",
                "--install-root", str(install_root),
                "--topic", "alice:feature",
            )
            self.assertEqual(matching.returncode, 0, matching.stderr)
            self.assertEqual(matching.stdout.strip(), str(project / "src"))

            mismatching = self.run_script(
                "scripts/install-cmssw.sh",
                "--release", "CMSSW_TEST",
                "--install-root", str(install_root),
                "--topic", "bob:other-feature",
            )
            self.assertNotEqual(mismatching.returncode, 0)
            self.assertIn("does not match", mismatching.stderr)

    def test_install_cmssw_rejects_invalid_build_jobs(self):
        result = self.run_script(
            "scripts/install-cmssw.sh",
            "--install-root", "/tmp/unused-cmssw-test",
            "--jobs", "zero",
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("positive integer", result.stderr)

    def test_install_cmssw_rebases_and_builds_fork_topic(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            fake_bin = temporary_path / "bin"
            install_root = temporary_path / "install"
            release_base = temporary_path / "release-base"
            cmsset = temporary_path / "cmsset_default.sh"
            call_log = temporary_path / "calls.log"
            fake_bin.mkdir()
            cmsset.touch()
            release_truth_info = release_base / "src/PhysicsTools/TruthInfo/test"
            release_truth_info.mkdir(parents=True)
            (release_truth_info / "dumpTruthGraphsFromGENSIMRECO_cfg.py").touch()

            commands = {
                "cmsrel": """#!/usr/bin/env bash
set -eu
printf 'cmsrel %s\\n' "$*" >> "$CALL_LOG"
mkdir -p "$1/.SCRAM" "$1/src"
""",
                "scram": f"""#!/usr/bin/env bash
set -eu
if [ "$1" = runtime ]; then
  printf '%s\\n' "export CMSSW_RELEASE_BASE='{release_base}'"
else
  printf 'scram %s\\n' "$*" >> "$CALL_LOG"
fi
""",
                "git": """#!/usr/bin/env bash
set -eu
printf 'git %s\\n' "$*" >> "$CALL_LOG"
""",
            }
            for name, content in commands.items():
                command = fake_bin / name
                command.write_text(content)
                command.chmod(0o755)

            result = self.run_script(
                "scripts/install-cmssw.sh",
                "--release", "CMSSW_TEST",
                "--arch", "el9_test",
                "--install-root", str(install_root),
                "--topic", "alice:feature",
                "--jobs", "3",
                env={
                    "CALL_LOG": str(call_log),
                    "CMSSET_DEFAULT": str(cmsset),
                    "PATH": f"{fake_bin}:{os.environ['PATH']}",
                },
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            calls = call_log.read_text()
            self.assertIn("cmsrel CMSSW_TEST", calls)
            self.assertIn("git cms-rebase-topic alice:feature", calls)
            self.assertIn("scram b -j 3", calls)
            project = install_root / "CMSSW_TEST"
            self.assertEqual((project / ".truthviz-topic").read_text(), "alice:feature")
            self.assertTrue((project / "src/PhysicsTools/TruthInfo").is_symlink())

    def test_production_entrypoint_requires_cms_environment(self):
        result = self.run_script(
            "scripts/run-production.sh",
            env={"CMSSET_DEFAULT": "/missing/cmsset_default.sh"},
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("CMS environment bootstrap is unavailable", result.stderr)

    def test_production_entrypoint_rejects_missing_cmssw_area(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            cmsset = Path(temporary_directory) / "cmsset_default.sh"
            cmsset.touch()
            result = self.run_script(
                "scripts/run-production.sh",
                env={
                    "CMSSET_DEFAULT": str(cmsset),
                    "TRUTHVIZ_CMSSW_SRC": str(Path(temporary_directory) / "missing-src"),
                },
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not contain PhysicsTools/TruthInfo", result.stderr)

    def test_start_server_rejects_invalid_port_mode(self):
        result = self.run_script(
            "scripts/start-server.sh",
            env={
                "TRUTHVIZ_SERVER_PYTHON": "/bin/true",
                "TRUTHVIZ_SERVER_AUTO_FIND_PORT": "sometimes",
            },
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be 0/1", result.stderr)


if __name__ == "__main__":
    unittest.main()
