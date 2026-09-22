#!/usr/bin/env python3
"""Read the DOT files the truth-graph dumper writes.

The dumper emits one statement per line, node attributes in a single bracket list
and one HTML-like label per node that spans lines. Reading that shape needs no
general DOT grammar, and a purpose-built reader is much faster than a general one:
on the ttbar demo event, 7701 nodes in a 14 MB file, pydot takes 66 s and this
takes about a second.

Attribute values are returned the way pydot returns them: a quoted value keeps its
quotes and an HTML-like value keeps its angle brackets, so parse_graph cleans both
with the same rule as before.
"""

import gzip
import re

HEADER = re.compile(r'\s*(?:strict\s+)?(digraph|graph)\s+(?:"([^"]*)"|([A-Za-z_][A-Za-z_0-9]*))?\s*\{')
EDGE = re.compile(r'\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z_0-9]*))\s*->\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z_0-9]*))\s*(\[.*\])?\s*;')
NODE_START = re.compile(r'\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z_0-9]*))\s*\[')
KEY = re.compile(r'([A-Za-z_][A-Za-z_0-9]*)\s*=\s*')


def read_text(path):
    """The text of a DOT file, gzipped or not."""
    if str(path).endswith(".gz"):
        with gzip.open(path, "rt", encoding="utf-8") as source:
            return source.read()
    with open(path, "r", encoding="utf-8") as source:
        return source.read()


def _matching_angle(text, start):
    """The index of the '>' that closes the '<' at start, counting nesting."""
    depth = 0
    index = start
    length = len(text)
    while index < length:
        opened = text.find("<", index)
        closed = text.find(">", index)
        if closed == -1:
            return -1
        if opened != -1 and opened < closed:
            depth += 1
            index = opened + 1
            continue
        depth -= 1
        if depth == 0:
            return closed
        index = closed + 1
    return -1


def parse_attributes(text):
    """The attributes of one bracket list, in the order they are written."""
    attributes = {}
    index = 0
    length = len(text)

    while index < length:
        match = KEY.search(text, index)
        if match is None:
            break

        key = match.group(1)
        index = match.end()
        if index >= length:
            break

        first = text[index]
        if first == '"':
            end = index + 1
            while True:
                end = text.find('"', end)
                if end == -1:
                    end = length
                    break
                if text[end - 1] != "\\":
                    break
                end += 1
            value = text[index:end + 1]
            index = end + 1
        elif first == "<":
            end = _matching_angle(text, index)
            if end == -1:
                end = length - 1
            value = text[index:end + 1]
            index = end + 1
        else:
            end = index
            while end < length and text[end] not in ",]":
                end += 1
            value = text[index:end].strip()
            index = end

        attributes[key] = value

        stop = text.find(",", index)
        if stop == -1:
            break
        index = stop + 1

    return attributes


def read_dot(path):
    """Parse a DOT file into the graph name, the nodes and the edges.

    Returns a dict with graph_name, is_directed, nodes as (id, attributes) and
    edges as (source, target, attributes). Graph-level and default statements,
    which the truth dumper uses only for rankdir and the default font size, are
    skipped.
    """
    text = read_text(path)

    header = HEADER.match(text)
    graph_name = ""
    is_directed = True
    position = 0
    if header is not None:
        is_directed = header.group(1) == "digraph"
        graph_name = header.group(2) or header.group(3) or ""
        position = header.end()

    nodes = []
    edges = []
    length = len(text)

    while position < length:
        end_of_line = text.find("\n", position)
        if end_of_line == -1:
            end_of_line = length
        line = text[position:end_of_line]
        stripped = line.strip()

        if not stripped or stripped in ("}",):
            position = end_of_line + 1
            continue

        edge = EDGE.match(line)
        if edge is not None:
            source = edge.group(1) or edge.group(2)
            target = edge.group(3) or edge.group(4)
            attributes = parse_attributes(edge.group(5)[1:-1]) if edge.group(5) else {}
            edges.append((source, target, attributes))
            position = end_of_line + 1
            continue

        node = NODE_START.match(line)
        if node is not None:
            name = node.group(1) or node.group(2)
            # A node statement runs to the first '];' that closes its bracket
            # list, which is several lines later when it carries an HTML label.
            close = text.find("];", position + node.end() - 1)
            if close == -1:
                close = length
            body = text[position + node.end():close]
            if name in ("node", "graph", "edge"):
                # A default statement, not a node.
                position = close + 2
                continue
            nodes.append((name, parse_attributes(body)))
            position = close + 2
            continue

        position = end_of_line + 1

    return {
        "graph_name": graph_name,
        "is_directed": is_directed,
        "nodes": nodes,
        "edges": edges,
    }
