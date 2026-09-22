import os
import sys
import tempfile
import unittest
from pathlib import Path
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


if __name__ == "__main__":
    unittest.main()
