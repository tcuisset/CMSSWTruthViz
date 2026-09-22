import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "preprocess"))

from dot_reader import parse_attributes, read_dot, read_text


class DotReaderTests(unittest.TestCase):
    """The reader must return what the truth dumper writes, values included, the
    way pydot returned them: a quoted value keeps its quotes and an HTML-like
    value keeps its angle brackets."""

    def test_quoted_value_keeps_its_quotes_and_its_commas(self):
        attributes = parse_attributes('pid=211, x4="(0.245, -0.199, -4.253, 0.180)", nIn=1')

        self.assertEqual(attributes["pid"], "211")
        self.assertEqual(attributes["x4"], '"(0.245, -0.199, -4.253, 0.180)"')
        self.assertEqual(attributes["nIn"], "1")

    def test_html_value_keeps_its_brackets_and_its_nesting(self):
        attributes = parse_attributes('raw_GEN=<GenVertex #4 key=-4>, label=<\n  <TABLE>\n'
                                      '  <TR><TD>a, b</TD></TR>\n  </TABLE>\n  >')

        self.assertEqual(attributes["raw_GEN"], "<GenVertex #4 key=-4>")
        self.assertIn("<TD>a, b</TD>", attributes["label"])
        self.assertTrue(attributes["label"].startswith("<"))
        self.assertTrue(attributes["label"].endswith(">"))

    def test_graph_header_and_statements(self):
        text = ('digraph TruthLogicalGraph {\n'
                '  rankdir=LR;\n'
                '  node [fontsize=10];\n'
                '  p0 [shape=ellipse, pid=22, label=<\n    <TABLE>\n    </TABLE>\n  >];\n'
                '  v0 [shape=diamond, reason="Primary"];\n'
                '  p0 -> v0;\n'
                '}\n')
        path = Path(self.tmp) / "graph.dot"
        path.write_text(text, encoding="utf-8")

        graph = read_dot(path)

        self.assertEqual(graph["graph_name"], "TruthLogicalGraph")
        self.assertTrue(graph["is_directed"])
        self.assertEqual([name for name, _ in graph["nodes"]], ["p0", "v0"])
        self.assertEqual(graph["edges"], [("p0", "v0", {})])
        self.assertEqual(dict(graph["nodes"])["v0"]["reason"], '"Primary"')

    def test_reads_a_gzipped_file(self):
        import gzip

        path = Path(self.tmp) / "graph.dot.gz"
        with gzip.open(path, "wt", encoding="utf-8") as out:
            out.write("digraph G {\n  a [pid=1];\n  b [pid=2];\n  a -> b;\n}\n")

        self.assertIn("digraph G", read_text(path))
        graph = read_dot(path)
        self.assertEqual([name for name, _ in graph["nodes"]], ["a", "b"])
        self.assertEqual(graph["edges"], [("a", "b", {})])

    def setUp(self):
        import tempfile

        self._directory = tempfile.TemporaryDirectory()
        self.tmp = self._directory.name

    def tearDown(self):
        self._directory.cleanup()


if __name__ == "__main__":
    unittest.main()
