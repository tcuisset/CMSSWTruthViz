# Pileup bundle size investigation (2026-10-01)

The main recommendation is to select a manageable subgraph **before browser
loading**, remove redundant labels, and keep the complete event available for
optional expansion. Switching serialization alone leaves an oversized graph.
No application defaults or supplied event artifacts were changed in this investigation.

## Event and measurements

Input: `../hackathon/38644.0_DYToLL_M_50_14TeV+Run4D128PU/step3.root`, source event
index 0 (run 1, lumi 1, event 1). Existing output:
`data/jobs/1790864274-4e9f2189/`.
CMSSW source: `../hackathon/CMSSW_20_1_X_graph/src`;
its `.SCRAM/Environment` identifies `CMSSW_20_1_X_2026-09-28-2300`, architecture
`el9_amd64_gcc14`. These are observations of the existing artifacts and checkout,
not a newly executed cmsRun validation.

The bundle contains 181,403 particles, 96,211 vertices, and 277,454 edges.
The native JSON identifies 195 distinct interactions: signal plus 194 pileup
interactions. **All particles and vertices have bunch crossing 0.** Signal has
877 particles and 484 vertices: only 0.49% of all nodes.

Sizes below are MiB (2^20 bytes). JSON variants use compact separators,
UTF-8, and unchanged values. Gzip uses level 6.

| Representation | Nodes | Uncompressed MiB | Gzip MiB |
| --- | ---: | ---: | ---: |
| Original pretty JSON | 277,614 | 957.10 | not measured |
| Minified JSON | 277,614 | 842.22 | 55.04 |
| Minified, omit `detailLabel` | 277,614 | 647.93 | 44.67 |
| Minified, omit `detailLabel`, `rawLabel`, `displayLabel` | 277,614 | 330.08 | 28.99 |
| Same complete schema, retain `eid=0` nodes and induced edges | 1,361 | 4.17 | 0.28 |
| `eid=0`, omit those three labels | 1,361 | 1.64 | 0.16 |
| MessagePack, original full schema | 277,614 | 772.42 | 56.86 |
| MessagePack, omit those three labels | 277,614 | 279.93 | 29.88 |
| Native dumper JSON, minified | 277,614 | 75.57 | 13.69* |

The diagnostic `eid=0` induced subgraph has 1,395 edges. It is a serialization
measurement, not a rerun of CMSSW postprocessing; no truth summaries are recomputed.
The native JSON originally occupies 85.36 MiB and has a different schema and
less hit/detail information, so it is not a drop-in replacement.
*Native and rechit compression measurements used zlib-wrapped deflate level 6;
gzip framing adds 12 bytes, negligible at the displayed precision.

The largest per-node field contributions, counting key, colon and value but
excluding inter-field commas, are:

| Field | MiB |
| --- | ---: |
| `rawLabel` (Graphviz HTML table) | 306.45 |
| `detailLabel` (formatted attribute listing) | 194.03 |
| `truthHover` | 30.21 |
| `directHitsEnergies` | 13.71 |
| `directHitsDetIds` | 12.82 |
| `displayLabel` | 10.87 |

The JSON profiler reached 2.64 GiB peak process RSS on Linux. This is Python
memory during profiling, **not measured browser memory**. It demonstrates that
serialized size should not be treated as an in-memory budget.

## 1. Reduce pileup multiplicity at export

The CMSSW config already accepts `--signal-only`, `--bunch-crossings`, `--seeds`,
and `--no-keepSpectators`. However, these configure
`truthLogicalGraphProducer.postProcessing`. The default `--no-produceGraphs`
reads `truthLogicalGraphProducer::HLT` and its persisted hit index from the input
ROOT file, and does not schedule that producer. **Adding `--signal-only` to the
reported command via `--dumper-args` alone does not apply a filter.**

`--bunch-crossings 0` would also retain every interaction in this particular event,
even if the producer were scheduled. `--produceGraphs` is not a transparent fix:
the configured producer reads `g4SimHits` rather than the persisted mixed graph.
Rebuilding requires checking input products and mixed-pileup/hit-index semantics.

Two sensible implementation points:

1. Add explicit selection options to `TruthLogicalGraphDumper`, selecting on the
   persisted graph's `eventId`. Its existing `hideParticle`/`hideVertex` masks and
   edge checks provide a natural place to implement this. Apply consistent
   selection to DOT and native JSON; native JSON is currently written before
   those masks. Keep original IDs and hit-index lookup IDs intact. Use
   `eventId == 0` for all particles of the signal interaction, not a hard-process
   flag, which would discard its shower descendants and underlying event.
2. Filter before construction of bundle nodes in the Python conversion step.
   Keep nodes with `eid == 0`, drop edges whose endpoints are absent, prune the
   label map, and update counts. This can recover the already-dumped event without
   cmsRun. Filtering after JSON load in the browser cannot avoid the initial load
   and parse cost. Filtering at conversion also does not avoid the large DOT dump.

If pileup is scientifically needed, provide an explicit selection rather than
making signal-only an unconditional default: selected collision IDs, a region
around a signal branch, or collapsed pileup summaries with optional expansion.
Keep ancestors/context for selected branches and retain enough descendants to
make the intended hit footprint interpretable. A pT/energy threshold on every
shower particle independently can remove relevant soft shower contributions;
apply branch/root selection or aggregate dropped branches with an explicit policy.
Region selection must define which momentum or hit geometry it uses and expose
the criterion in output metadata.

Simply retaining particles with any subgraph hits is weak here: 169,844 of
180,526 pileup particles have calorimeter or tracker hits; 159,458 have calorimeter
hits. Such a cut alone retains about 94% or 88% of pileup particles, respectively,
before adding the necessary vertices/context.

## 2. Compact the schema and control browser memory

`preprocess/build_bundle.py` currently pretty-prints the bundle.
`preprocess/parse_graph.py` stores the original DOT HTML, a second complete textual
attribute listing, individual attributes, duplicate display labels, and derived
presentation/classification fields. Removing formatted duplication provides far
more benefit than whitespace minification.

Recommended schema work:

- Use compact separators in generated bundles and rechits.
- Generate detailed labels and hover text on demand from canonical attributes.
  Keep `rawLabel` only in a separate optional debug/detail artifact if exact DOT
  inspection remains useful. Keep one compact display label.
- Audit basic search (currently searches formatted labels), logical flag
  fallbacks, vertex-key fallbacks, and the raw DOT label panel before omission.
  Current logical nodes have explicit flags and the parser materializes vertex
  keys, but legacy DOT data needs compatibility handling.
- Remove `labelToId` from a versioned compact schema: no current application JS
  consumer was found. Store numeric quantities as numbers rather than strings;
  use consistent missing/default semantics rather than indiscriminately removing
  every zero-valued attribute.
- Preserve `directHitsDetIds`: the 3D panel traverses descendants and unions these
  IDs. `dumpSimHits=False` sacrifices hit selection and saves much less than labels.
- Keep only IDs, styling/layout fields, and required summaries on Cytoscape
  elements; retain optional details outside Cytoscape and load them on demand.
  Do not reconstruct every formatted label immediately after decoding a compact file.
- For complete pileup exploration, partition by interaction/branch and instantiate
  only the selected portion in Cytoscape. Hiding nodes after creation retains
  Cytoscape's per-element cost.

The CLI serves the whole event as a JS assignment in `/js/event.js`
(`viewer_cli.ViewerHandler.do_GET`), so the browser must compile a very large JS
literal before initialization. A data fetch with bounded/partitioned loading avoids
that giant script stage. `GraphManager.init()` then creates node-data objects for
every element and initializes Cytoscape; Dagre is the selected layout engine.
Reducing transmitted bytes alone leaves these costs. This matches Cytoscape's
[performance guidance](https://js.cytoscape.org/#performance), which identifies
element count and labels as significant costs.

For backend browser sessions, `SessionStore.saveServerResult()` additionally
`JSON.stringify`s the entire record to calculate size, stores it, and reads it
back; `SessionStore.list()` uses `getAll()` on complete event records. Replace
the size calculation with recorded payload sizes and give the session list a
metadata-only index/store. Preserve the existing commit/readback-before-delete
guarantee while verifying records without repeatedly materializing full events.

## 3. Rechits and alternate formats

The separate rechit file adds 103.04 MiB and 553,778 rows. Minification reduces
it to 72.41 MiB, deflate to 9.59 MiB. MessagePack gives 40.18 MiB, compressed to
6.18 MiB. Binary encoding is more useful here because the rows contain actual
numbers, unlike the graph's many textual attributes and labels.

For a selected graph, optionally export only coordinate/energy rows whose DetIds
occur in its retained particles' `directHitsDetIds`, or load detector/region chunks
on demand. This restricts available cells; it does **not** separate signal energy
from pileup energy in a reconstructed cell. Preserve full-event rechits when that
context is needed. Float precision reduction needs an explicit tolerance; none was
used in these measurements.

Format comparison:

- **Compressed JSON:** simplest near-term transport/storage optimization. Gzip
  does not reduce expanded objects or the number of rendered graph elements.
- **MessagePack/CBOR:** useful for wire encoding, especially numeric arrays, but a
  map-per-node schema still repeats keys and decodes into objects. Measured
  MessagePack saved only 8.3% versus minified JSON for the full graph and slightly
  worsened gzip size. The [MessagePack specification](https://github.com/msgpack/msgpack/blob/master/spec.md)
  describes map, array, string and numeric encodings; a format change does not
  inherently deduplicate formatted labels.
- **Columnar JSON:** shared field names plus arrays reduce repeated keys without
  requiring a binary decoder. Materializing full objects for every row on load
  would lose much of the memory benefit. This was not benchmarked.
- **Arrow or a versioned typed-array format:** better long-term candidates for
  rechits and graph adjacency: integer DetIds/IDs, numeric coordinate/energy
  columns, indexed endpoints, dictionary-coded categories, and offset/value
  arrays for variable-length hit lists. [Arrow's columnar format](https://arrow.apache.org/docs/format/Columnar.html)
  supports contiguous typed buffers and dictionary encoding. A benefit to browser
  memory depends on keeping these columns and materializing only the visible
  subgraph; Cytoscape still requires element objects. This was not benchmarked.
- **Existing native JSON:** promising canonical input to a new converter. It
  already gives typed values and adjacency, bypassing the DOT labels and Python's
  redundant NetworkX construction. Extend it with direct hit IDs and the summaries
  required by the viewer before using it to replace the DOT path; it currently
  contains subgraph hit counts but no direct hit-ID/energy lists.

## Recommended order and validation

First implement explicit filtering of the persisted graph (signal-only plus an
option to preserve selected pileup), then remove duplicated label storage with
search/detail compatibility. Next partition details and rechits and limit
Cytoscape to the active subgraph. Consider a typed/columnar format after measuring
that design; a direct switch from JSON to MessagePack is a low-priority graph fix.

The signal-induced graph is roughly 230 times smaller than the original file even
with all current fields retained; label removal adds another factor of 2.5. These
effects dominate the serialization choice.

Validation performed for this investigation:

- Host parser/unit suite: 50 tests passed; shell/Python compilation checks and
  3 frontend mode tests passed. The profiler was also checked against exact
  JSON/gzip sizes on a small Unicode fixture with field omission and induced edges.
- Existing server/catalogue: not exercised.
- Real cmsRun/ROOT: existing supplied output profiled; no new cmsRun was executed.
- Browser rendering: not exercised; no claim that a candidate loads successfully.
- No development/deployment container was started or stopped. The prescribed dev
  image is based on `cmssw/el9:x86_64`; no running image was inspected or validated.

Before shipping runtime changes, use `./dev full-setup` and `./dev url`, then test
the prepared path, the included single-electron ROOT sample, and this pileup
sample at event index 0. Check node/edge provenance, hit selection and coordinate
consistency, search/details, peak browser memory, layout time, browser console
errors, and session save/readback. The existing wrapper uses the config's default
`ExtendedRun4D127` geometry whereas the sample name says D128; verify the actual
input geometry and set the matching geometry for any ROOT rerun.

Reproduce the JSON measurements without modifying the bundle:

```bash
venv/bin/python scripts/profile_bundle.py \
  data/jobs/1790864274-4e9f2189/bundle.json \
  --output /tmp/truth-bundle-profile.json
```

Full byte counts from JSON, native JSON and MessagePack experiments are saved in
`docs/bundle-size-measurements.json`. MessagePack used the host's installed Python
package; no project dependency was added. The profiling script uses only the
standard library and does not write reduced bundles.
