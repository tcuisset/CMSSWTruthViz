# JSON Data Format

The browser reads a graph bundle generated from a Graphviz DOT file. Optional rechit data can be loaded from a separate ROOT-derived JSON file.

## Reading the DOT

`preprocess/dot_reader.py` reads the DOT, gzipped or not. The dumper writes one
statement per line, all node attributes in one bracket list and one HTML-like label per
node, so the reader needs no general DOT grammar. It replaced `pydot`, which spent
almost all of the preprocessing time: on the ttbar demo event, 7701 nodes in a 14 MB
file, `pydot` takes 66 s and the reader takes 0.7 s, and the whole `build_bundle.py` run
goes from 69 s to 2.2 s. The bundle is byte-identical, checked attribute by attribute
against `pydot` on eleven graphs: the eight prepared events, a raw `TruthGraph` dump of
7037 nodes and two older files.

Loading the finished bundle is not the cost: `json.load` of the 26 MB ttbar bundle takes
0.12 s. A JSON dump straight from the producer would therefore save the remaining 1.5 s
of classification and writing, not more, unless it also carried the truth classification
that `parse_graph.py` adds.

## Graph Bundle

The main file is `data/bundle.json`:

```json
{
  "nodes": [],
  "edges": [],
  "labelToId": {},
  "metadata": {
    "graph_name": "TruthLogicalGraph",
    "is_directed": true,
    "node_count": 0,
    "edge_count": 0
  }
}
```

Static mode uses `app/js/bundle.js`, which wraps the same payload as:

```js
window.EMBEDDED_BUNDLE_DATA = { ... };
```

`preprocess/build_bundle.py` generates both files.

## Nodes

Each node has these core fields:

```json
{
  "id": "n123",
  "label": "pi+",
  "displayLabel": "pi+",
  "detailLabel": "n123\npid: 211\np4: (...)",
  "rawLabel": "<Graphviz label text>"
}
```

Common optional fields include:

- `particleName`: display name derived from a PDG ID when the `particle` Python package can resolve it.
- `vertexKey`: compact key for vertex-like nodes.
- `pid`, `pdgId`, `pdgid`, `pdg`: particle identifiers copied from DOT attributes.
- `p4`, `x4`, `m`, `energy`: physics quantities copied from DOT attributes.
- `prodVtx`, `endVtx`, `nIn`, `nOut`: relationship and count fields copied from DOT attributes.
- `hasGen`, `hasSim`, `crossedBoundary`, `directHitsDetIds`: truth-graph fields used by frontend styling or the 3D panel when present.
- `truthKind`, `truthLevel`, `truthLevels`, `truthFootprint`, `truthRole`, `truthReason`,
  `truthTitle`, `truthSubtitle`, `truthHover`: the truth-graph classification, added only
  for a `TruthLogicalGraph` DOT. They carry the node kind, the dominant truth level, the
  hit footprint, the role of an artificial vertex, the two-line label and the hover
  summary. See FRONTEND.md for how each is drawn.
- `shape`, `color`, `fillcolor`, `style`, `penwidth`, and other DOT styling attributes copied from the DOT file.

The parser preserves most DOT attributes as flat node properties. The frontend therefore treats unknown attributes as displayable metadata and as fields usable by advanced search.

## Node Label Generation

`preprocess/parse_graph.py` builds labels for readability:

- Vertex-like nodes use `key`, `vertexKey`, `vertex_key`, `barcode`, parsed `key=...`, or numeric node IDs such as `v12`.
- Particle-like nodes use known PDG-related attributes and resolve them through the `particle` package.
- Unknown nodes fall back to `node: <id-number>`.

The original DOT label is kept in `rawLabel`, and a fuller multi-line label is built in `detailLabel`.

## Edges

Each edge has at least:

```json
{
  "source": "n1",
  "target": "n2"
}
```

Any DOT edge attributes are copied as additional flat fields. Cytoscape edge IDs are generated in the browser from source and target IDs.

Edges whose endpoints are not present in the parsed node set are skipped during preprocessing.

## labelToId

`labelToId` maps generated node labels to node IDs:

```json
{
  "pi+": "n123"
}
```

Labels are not guaranteed to be unique in all DOT graphs. Browser search therefore scans node data directly instead of relying only on this mapping.

## Metadata

`metadata` currently contains:

- `graph_name`: DOT graph name, for example `TruthLogicalGraph`.
- `is_directed`: true for DOT `digraph`.
- `node_count`: generated node count.
- `edge_count`: generated edge count.

The frontend has additional semantic handling when `graph_name` is `TruthLogicalGraph`.

## Rechits Data

Optional rechit coordinates are stored in `data/rechits.json`:

```json
{
  "rechits": [
    {
      "ID": 123456,
      "x": 1.0,
      "y": 2.0,
      "z": 3.0,
      "energy": 0.0
    }
  ],
  "metadata": {
    "source": "rechits.root",
    "tree": "Events",
    "event_index": 0,
    "rechit_count": 1,
    "branches": {
      "ID": "rechits_rechit_ID",
      "x": "rechits_rechit_x",
      "y": "rechits_rechit_y",
      "z": "rechits_rechit_z"
    }
  }
}
```

Static mode can use `app/js/rechits.js`, which wraps the same payload as:

```js
window.EMBEDDED_RECHITS_DATA = { ... };
```

The 3D panel matches selected graph nodes to rechits through node fields such as `directHitsDetIds`.

## ROOT Input Assumptions

`preprocess/build_rechits_json.py` reads one event from a ROOT tree using `uproot`. The default tree is `Events`, and the required branch names are:

- `rechits_rechit_ID`
- `rechits_rechit_x`
- `rechits_rechit_y`
- `rechits_rechit_z`

The current script writes `energy: 0.0` for each rechit because the required branch map does not include an energy branch.
