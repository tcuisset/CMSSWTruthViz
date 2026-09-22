# Frontend And UI

The frontend is a plain JavaScript app served from `app/index.html`. There is no npm build step in the current repository. Browser libraries are loaded from CDNs, and project code is loaded as ordered script tags.

## Runtime Entry Points

- `app/index.html`: page structure, controls, upload modal, CDN scripts, embedded data scripts, and app script order.
- `app/js/main.js`: loads data, initializes all managers, updates graph statistics, and hides upload controls in static mode.
- `app/js/graph.js`: Cytoscape lifecycle, stylesheet, layout registration, node/edge semantics, filters, selection, and viewport fitting.
- `app/js/panel.js`: side panel, breadcrumbs, DOT attributes, neighbor lists, rendered DOT labels, and persisted panel width.
- `app/js/search.js`: text search and advanced attribute search.
- `app/js/ego.js`: focus-radius filtering.
- `app/js/dependency.js`: directed upstream/downstream/both link filtering.
- `app/js/plot3d.js`: Plotly rechit display for selected nodes.
- `app/js/export.js`: PNG and PDF export of the current Cytoscape viewport.
- `app/js/upload.js`: server-mode DOT/ROOT upload modal and build-status polling.

## Browser Dependencies

`index.html` loads these libraries from CDNs:

- Cytoscape.js
- dagre and `cytoscape-dagre`
- `layout-base`, `cose-base`, and `cytoscape-fcose`
- ELK and `cytoscape-elk`
- jsPDF
- Plotly.js

Because these are CDN-hosted, first load requires network access unless the libraries are vendored locally.

## Data Loading

`main.js` supports two modes:

- Static mode: when opened with `file://`, it reads `window.EMBEDDED_BUNDLE_DATA` from `app/js/bundle.js`. If present, `window.EMBEDDED_RECHITS_DATA` from `app/js/rechits.js` is attached to the bundle.
- Server mode: when opened through HTTP, it fetches `../data/bundle.json` and optionally `../data/rechits.json`.

Upload controls are enabled only in server mode.

## Cytoscape Graph

`GraphManager.init(data)` turns the bundle into Cytoscape elements:

- Nodes become Cytoscape nodes with `data.id` plus all node fields from the bundle.
- Edges become Cytoscape edges with generated IDs and the bundle's `source`, `target`, and extra edge fields.

The original bundle stays available as `window.bundleData`. View state is represented with Cytoscape classes such as `highlighted`, `selected`, `dimmed`, `hidden`, `gen-event-filtered`, `sim-vertex-key0-filtered`, and `small-subgraph-filtered`.

## Node Semantics

The viewer draws two different graphs and shows a different legend for each. The
graph name in the bundle metadata selects which one.

### TruthLogicalGraph

The logical truth graph is standalone, so a node is described by its own truth
level, its hit footprint and its role. GEN and SIM provenance is not used.
`preprocess/parse_graph.py` stamps `truthKind`, `truthLevel`, `truthLevels`,
`truthFootprint`, `truthRole`, `truthTitle`, `truthSubtitle` and `truthHover` on
each node, and the frontend maps them onto the canvas:

- Shape carries the node kind: ellipse for a particle, diamond for a vertex, and
  star, pentagon, rhomboid or rounded rectangle for the four artificial vertices the
  post-processor adds (`domain=Internal`, `role=interaction`, `initial state`,
  `beam side input`, `underlying event`).
- Fill carries the dominant truth level, most signal-like first: `signal`,
  `hardProcess`, `partonJets`, `bHadrons`, `cHadrons`, `tauVisibleHadronic`,
  `tauVisibleLeptonic`, `reconstructableFromSignal`, `reconstructableFinalState`,
  `stableLegsFromInitialState`, `stableDecayProducts`, `caloBoundary`,
  `underlyingEvent`. These are the names of
  `PhysicsTools/TruthInfo/interface/TruthLevels.h`, plus `signal`, which the
  selection post-processing owns and the dumper appends to the same attribute. The
  two earlier names, `visibleTau` and `stableLegsFromUpstream`, keep the rank of the
  name that replaced them and appear in the filters and the legend only when the
  graph on screen carries them. A particle usually carries several levels; the hover
  summary lists them all.
- Border width carries the hit footprint: calo rec hits, calo sim hits only,
  tracker or MTD or muon only, and no hits, which is drawn dashed.
- Border style and colour carry the markers: a double ring for the root of a
  selected branch, teal for checkpoints, orange for a backscattered particle.
- The label holds two lines: the particle name or PDG id with its energy, or the
  vertex title with its position. The vertex title is the same one the dumper writes
  in the first row of the DOT label: the vertex reason, which comes from the Geant4
  process and is therefore empty for a GEN-only vertex, and then the topology,
  `decay` for one incoming particle and `production` for more. The vertex label is drawn under the diamond,
  because the four-position is much wider than the node. Hovering a node opens the
  full summary, which carries the incoming and outgoing counts.

The control bar folds away with its own button or with the H key, so the graph can
use the whole window; the button stays over the canvas to bring it back, and the
search box stays with it, over the canvas at the top left. The legend
collapses to its title bar, and it scrolls inside the graph container
rather than growing under the controls bar. Its truth-level list is generated from
the same vocabulary as the level filter, so the two cannot drift apart.

A particle with no PDG identity is named by the producer, not by the PDG table: the
dumper writes `connector` or `signal stand-in` into the first row of the HTML label
rather than into an attribute, so the viewer reads the title from there and shows no
energy for it.

### Truth filters

Four filters apply to the logical graph, in the view options:

- Hide pile-up. Signal is bunch crossing 0 and event 0, which the producer encodes
  as an eventId of 0, so any other value is pile-up. This mirrors
  `truth::Branch::isFromPileup()`.
- Hide underlying event. Drops particles carrying the `underlyingEvent` level and
  the artificial underlying-event vertex.
- Hide subgraphs with 0 sim hits. Drops a particle whose whole subgraph leaves no
  sim hit in any channel, so it can never be reconstructed. It counts the subgraph,
  not the particle itself, so it removes neutrinos and other dead branches and keeps
  a parent whose daughters do leave hits. A DOT dumped without a hit index reports
  zero for every particle; the filter detects that and refuses to run rather than
  empty the view.
- Hide particles below an energy threshold in GeV.
- Levels shown. One entry per truth level plus one for a particle with no level. A
  particle is judged on its dominant level, the same one that gives it its colour,
  so the list is a partition rather than an overlapping set of tags.

A line under the filters reports how many nodes survive them, and says when a
filter cannot run.

Hiding always collapses. Every collapsing filter, including the older parton-shower
one, contributes to a single hidden set, and one pass then joins the visible parents
of that set to its visible children. Running the filters as separate passes would
let each bridge only around its own hidden nodes, which strands a node whose
neighbours another filter hid.

A vertex that filtering leaves dangling is hidden too, and the sweep repeats until
nothing more dangles, because hiding one vertex can strand the next. A vertex
dangles when it once had parents and no visible node is reachable upstream of it, or
it once had children and none is reachable downstream. Reachability follows the same
walk through hidden nodes that the bypass edges take, so a vertex whose daughters are
hidden but whose grand-daughters are visible stays, reconnected by a bypass. The test
is against what the node originally had, so a true source or sink of the graph is
never removed and an unfiltered graph is left untouched. Hiding every level therefore
empties the canvas: with no particle visible, no vertex has anything to join.

### TruthGraph

The raw gen plus sim graph keeps the earlier inference, because GEN and SIM
provenance is still its subject:

- `GenEvent`
- `GenVertex`
- `GenParticle`
- `SimVertex`
- `SimTrack`
- `GenSimVertex`
- `GenSimParticle`
- `LogicalVertex`
- `LogicalParticle`

These kinds drive color, shape, legend entries, label handling, and side-panel summaries. Detection uses explicit DOT fields when available, plus fallback checks on labels, raw labels, node IDs, and shape attributes.

## Layouts

The layout selector currently offers:

- Dagre: hierarchical layout, selected by default.
- fCoSE: force-directed layout for denser graph exploration.
- ELK: layered layout with orthogonal edge routing.
- ForceAtlas2: the force-directed layout of Jacomy et al. (PLoS ONE 9(6), 2014), the one
  Gephi uses, implemented in `app/js/forceatlas2.js`. Repulsion is summed with a
  Barnes-Hut quadtree, a vertex with many daughters pushes them apart instead of pulling
  them together, and the node sizes enter the repulsion, labels included.

Layouts are run on currently visible nodes plus edges whose endpoints are visible. A running layout shows a status pill and can be cancelled when the underlying layout engine supports `stop()`.

Every engine is given the drawn extent of a node, labels included, because a vertex
carries its label under the diamond and a particle box is three times wider than a
vertex box. When the layout ends, `tidyLayout` opens up the drawn view in two stages.
`separateOverlaps` pushes apart two node boxes that still overlap and steps a node
aside when an edge runs across it; the node moves, never the edge, so the layout keeps
the shape it computed. `untangleEdges` then swaps two neighbouring nodes when that
removes crossings, trying only the nodes that take part in one. A stage is kept only
when the number of crossing edge pairs does not grow, so a layout that already orders
its ranks is left as it is.

Measured with fCoSE on the ttbar demo event, 2566 nodes and 2568 edges: 1945 crossing
edge pairs before and 679 after, 51 edges crossing a node before and 20 after, in 2.4 s.
On the z_ee event, 422 nodes: 69 crossing pairs before and 21 after, 16 edges crossing a
node before and 4 after, in 0.2 s. With Dagre, which minimises crossings itself, the pass
takes the z_ee event from 15 crossings to 5 and the ttbar event from 133 to 128. No two
node boxes overlap in any of these runs.

The four engines on the same two events, crossing edge pairs before and after the pass,
and the time the layout itself takes:

| engine | z_ee, 422 nodes | ttbar, 2566 nodes |
|---|---|---|
| Dagre | 15 to 5, 0.3 s | 133 to 128, 1.8 s |
| fCoSE | 66 to 7, 0.3 s | 1697 to 472, 1.5 s |
| ForceAtlas2 | 2 to 1, 0.5 s | 226 to 121, 3.8 s |

ForceAtlas2 draws the fewest crossings of the three force-directed runs, and it spreads
the graph wider to do it: 9170 by 6290 against 5268 by 3543 for fCoSE on z_ee. Dagre stays
the default because it is the only one that keeps the parent to child direction readable.

Every filter collapses in one pass: the visible parents of the hidden nodes are joined
to their visible children, so no node is left without an edge. The GenEvent filter and
the SimVertex key=0 filter belong to the raw GEN/SIM graph and do not run on the logical
truth graph, where key=0 is an ordinary SimVertex that can carry a real decay.

Every filter starts off, so the first view of a graph is the whole graph. The filters
that can be switched on hide:

- GenEvent nodes.
- `SimVertex` nodes with `key=0`.
- The parton shower: the status window and the soft gluons of the older rule, plus the
  shower bookkeeping that the main event now carries, which is a string, a cluster, a
  diquark, a pomeron or a generator-internal state. Same species as
  `truth::isShowerObject`, minus the bare partons, which the `partonJets` and
  `hardProcess` levels do ask about.
- Small disconnected components with fewer than 10 nodes.

## Search

Basic search is a case-insensitive substring search over:

- `label`
- `displayLabel`
- `detailLabel`
- `rawLabel`
- node ID

Advanced search matches flat node attributes with AND-only criteria. Supported forms include:

```text
hasCheckpoints
!crossedBoundary
pid==211
energy>10
particleName contains pi
domain~=GEN
hasGen AND hasSim
```

Multiple text-search results can be stepped through with the previous/next controls.

## Focus And Link Filtering

Focus radius uses undirected breadth-first search from the selected node and hides nodes outside the selected hop count.

The link filter uses directed traversal from the selected node:

- Upstream follows the source-side convention used by the app.
- Downstream follows the target-side convention used by the app.
- Both shows the combined traversal result and edges among visible nodes.

The graph direction comes from the DOT truth graph. Check the domain meaning before renaming upstream/downstream behavior.

## Side Panel

Clicking a node opens the side panel with:

- Compact summary: ID, particle name, PDG ID, energy, and momentum-like fields where available.
- Rendered DOT label.
- Ancestors and descendants. These follow the truth lineage only: a match edge leads to a
  reco object, which is neither a parent nor a child, so it is left out. The dependency
  explorer walks the same way.
- Association matches, when the node has any: the reco objects matched to a truth node, or
  the truth nodes a reco object matched, each with its working points and score.
- Flat DOT attributes copied into the bundle.
- Breadcrumb history.

The panel can be resized. Width is stored in `localStorage`.

## 3D Rechit Panel

The 3D controls can show:

- Direct hits: rechits listed in the selected node's `directHitsDetIds`.
- Subgraph hits: direct hits from the selected node and its descendants.

Real rechit data comes from `data/rechits.json` in server mode or `app/js/rechits.js` in static mode. If no real rechit data exists, the panel creates placeholder points so the UI remains testable.

## Keyboard Shortcuts

Press `?` in the app for the overlay. Current shortcuts include:

| Key | Action |
| --- | --- |
| Arrow keys | Move to a nearby node in that screen direction |
| Tab | Cycle through visible nodes |
| Enter | Open the side panel for the selected node |
| Esc | Close the panel and clear selection |
| R | Reset view |
| ? | Toggle shortcut help |

Shortcuts are ignored while typing in form fields.
