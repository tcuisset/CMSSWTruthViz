#!/usr/bin/env python3
"""
Streaming parser for multipart/form-data request bodies.

Python 3.13 removed the cgi module, so cgi.FieldStorage is no longer available.
File parts are streamed to a temporary file, so a large upload does not sit in
memory.
"""

from __future__ import annotations

import email.message
import email.parser
import email.policy
import email.utils
import io
import tempfile


CHUNK_SIZE = 64 * 1024
SPOOL_MAX_SIZE = 1024 * 1024


class MultipartError(ValueError):
    """The request body is not valid multipart/form-data."""


class FormField:
    """One part of a multipart body.

    `file` is a readable stream for a file part and None for a text part.
    `value` is the decoded text of a text part and None for a file part.
    """

    def __init__(self, name, filename=None, file=None, value=None):
        self.name = name
        self.filename = filename
        self.file = file
        self.value = value


class _Discard:
    """Sink that drops what it is given."""

    def write(self, data):
        return len(data)


class _BodyReader:
    """Read at most `remaining` bytes from a stream, with lookahead."""

    def __init__(self, stream, remaining):
        self._stream = stream
        self._remaining = max(0, remaining)
        self._buffer = b""

    def _fill(self, want):
        while len(self._buffer) < want and self._remaining > 0:
            chunk = self._stream.read(min(CHUNK_SIZE, self._remaining))
            if not chunk:
                self._remaining = 0
                break
            self._remaining -= len(chunk)
            self._buffer += chunk
        return self._buffer

    def peek(self, count):
        return self._fill(count)[:count]

    def skip(self, count):
        self._fill(count)
        self._buffer = self._buffer[count:]

    def read_until(self, needle, sink):
        """Copy bytes into `sink` up to `needle`, consume `needle`, and report
        whether it was found."""
        while True:
            buffered = self._fill(max(CHUNK_SIZE, 2 * len(needle)))
            index = buffered.find(needle)
            if index >= 0:
                sink.write(buffered[:index])
                self._buffer = buffered[index + len(needle):]
                return True
            if self._remaining <= 0:
                sink.write(buffered)
                self._buffer = b""
                return False
            keep = len(needle) - 1
            if keep:
                sink.write(buffered[:-keep])
                self._buffer = buffered[-keep:]
            else:
                sink.write(buffered)
                self._buffer = b""


def _decode_param(value):
    if isinstance(value, tuple):
        return email.utils.collapse_rfc2231_value(value)
    return value


def _read_boundary(headers):
    message = email.message.Message()
    message["Content-Type"] = headers.get("Content-Type", "")
    boundary = _decode_param(message.get_param("boundary"))
    if not boundary:
        raise MultipartError("the Content-Type header carries no boundary")
    try:
        return boundary.encode("ascii")
    except UnicodeEncodeError as exc:
        raise MultipartError("the boundary is not ASCII") from exc


def _read_content_length(headers):
    raw = headers.get("Content-Length")
    if raw is None:
        raise MultipartError("the Content-Length header is missing")
    try:
        return int(raw)
    except ValueError as exc:
        raise MultipartError("the Content-Length header is not a number") from exc


def _add_field(fields, field):
    existing = fields.get(field.name)
    if existing is None:
        fields[field.name] = field
    elif isinstance(existing, list):
        existing.append(field)
    else:
        fields[field.name] = [existing, field]


def parse_multipart_form(stream, headers):
    """Parse a multipart/form-data body into a mapping of name to FormField.

    A name that appears more than once maps to a list of FormField.
    """
    boundary = _read_boundary(headers)
    reader = _BodyReader(stream, _read_content_length(headers))
    delimiter = b"--" + boundary

    if not reader.read_until(delimiter, _Discard()):
        raise MultipartError("the opening boundary is missing")

    fields = {}
    while True:
        marker = reader.peek(2)
        if marker.startswith(b"--"):
            return fields
        if not marker.startswith(b"\r\n"):
            raise MultipartError("a boundary is not followed by a line break")
        reader.skip(2)

        raw_headers = io.BytesIO()
        if not reader.read_until(b"\r\n\r\n", raw_headers):
            raise MultipartError("the headers of a part are truncated")
        part = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(
            raw_headers.getvalue() + b"\r\n\r\n"
        )
        name = _decode_param(part.get_param("name", header="content-disposition"))
        if name is None:
            raise MultipartError("a part carries no name")
        filename = _decode_param(part.get_param("filename", header="content-disposition"))

        body = tempfile.SpooledTemporaryFile(max_size=SPOOL_MAX_SIZE)
        if not reader.read_until(b"\r\n" + delimiter, body):
            body.close()
            raise MultipartError("the closing boundary is missing")
        body.seek(0)

        if filename is None:
            charset = part.get_content_charset() or "utf-8"
            value = body.read().decode(charset, "replace")
            body.close()
            _add_field(fields, FormField(name, value=value))
        else:
            _add_field(fields, FormField(name, filename=filename, file=body))
