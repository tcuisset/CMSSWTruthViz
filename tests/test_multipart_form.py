import io
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from multipart_form import MultipartError, parse_multipart_form


BOUNDARY = "----truthvizBoundary"


class Headers(dict):
    """Minimal stand-in for the header mapping of BaseHTTPRequestHandler."""

    def get(self, key, default=None):
        for name, value in self.items():
            if name.lower() == key.lower():
                return value
        return default


def build_body(parts):
    """Build a multipart body from (name, filename, payload) triples."""
    chunks = []
    for name, filename, payload in parts:
        disposition = f'form-data; name="{name}"'
        if filename is not None:
            disposition += f'; filename="{filename}"'
        chunks.append(b"--" + BOUNDARY.encode())
        chunks.append(b"\r\n")
        chunks.append(f"Content-Disposition: {disposition}\r\n\r\n".encode())
        chunks.append(payload if isinstance(payload, bytes) else payload.encode())
        chunks.append(b"\r\n")
    body = b"".join(chunks) + b"--" + BOUNDARY.encode() + b"--\r\n"
    headers = Headers({
        "Content-Type": f"multipart/form-data; boundary={BOUNDARY}",
        "Content-Length": str(len(body)),
    })
    return io.BytesIO(body), headers


class MultipartFormTests(unittest.TestCase):
    def test_text_field_is_decoded(self):
        stream, headers = build_body([("mode", None, "prepared")])
        form = parse_multipart_form(stream, headers)
        self.assertEqual(form["mode"].value, "prepared")
        self.assertIsNone(form["mode"].filename)

    def test_file_field_keeps_filename_and_bytes(self):
        payload = b"digraph G { a -> b; }"
        stream, headers = build_body([("dotFile", "graph.dot", payload)])
        form = parse_multipart_form(stream, headers)
        self.assertEqual(form["dotFile"].filename, "graph.dot")
        self.assertEqual(form["dotFile"].file.read(), payload)

    def test_binary_payload_spanning_chunks_is_intact(self):
        payload = bytes(range(256)) * 4096
        stream, headers = build_body([("rootFile", "input.root", payload)])
        form = parse_multipart_form(stream, headers)
        self.assertEqual(form["rootFile"].file.read(), payload)

    def test_payload_containing_the_boundary_text_is_intact(self):
        payload = b"prefix--" + BOUNDARY.encode() + b"suffix"
        stream, headers = build_body([("dotFile", "graph.dot", payload)])
        form = parse_multipart_form(stream, headers)
        self.assertEqual(form["dotFile"].file.read(), payload)

    def test_mixed_parts_are_all_returned(self):
        stream, headers = build_body([
            ("dotFile", "graph.dot", b"digraph {}"),
            ("mode", None, "prepared"),
            ("rechitsEventIndex", None, "3"),
        ])
        form = parse_multipart_form(stream, headers)
        self.assertEqual(form["dotFile"].filename, "graph.dot")
        self.assertEqual(form["mode"].value, "prepared")
        self.assertEqual(form["rechitsEventIndex"].value, "3")

    def test_repeated_name_gives_a_list(self):
        stream, headers = build_body([("tag", None, "a"), ("tag", None, "b")])
        form = parse_multipart_form(stream, headers)
        self.assertEqual([field.value for field in form["tag"]], ["a", "b"])

    def test_missing_boundary_is_rejected(self):
        headers = Headers({"Content-Type": "multipart/form-data", "Content-Length": "0"})
        with self.assertRaises(MultipartError):
            parse_multipart_form(io.BytesIO(b""), headers)

    def test_truncated_body_is_rejected(self):
        stream, headers = build_body([("dotFile", "graph.dot", b"digraph {}")])
        body = stream.getvalue()[:-12]
        headers["Content-Length"] = str(len(body))
        with self.assertRaises(MultipartError):
            parse_multipart_form(io.BytesIO(body), headers)


if __name__ == "__main__":
    unittest.main()
