# Usage Examples

Common workflows for exploring CMSSW simulation truth graphs.

## Find A Particle Or Vertex

Use basic search when you know a visible label, node ID, PDG ID, or text from the DOT label.

Examples:

```text
mu
pi+
n123
SimVertex
```

Steps:

1. Type the query in **Search**.
2. Press Enter or click **Find**.
3. Use previous/next controls when there are multiple matches.
4. Click a result or press Enter to open the side panel.

## Search By DOT Attribute

Use **Advanced** search for attribute-level questions.

Examples:

```text
pid==211
status==1
hasGen AND hasSim
crossedBoundary
particleName contains mu
energy>10
```

Advanced search is AND-only. Separate criteria with new lines, semicolons, `AND`, or `&&`.

## Inspect A Node

Steps:

1. Click a node.
2. Read the summary fields in the side panel.
3. Check **Ancestors** and **Descendants**.
4. Open **Rendered DOT Label** when the original DOT label contains useful formatted text.
5. Use **DOT Attributes** for the raw copied attributes.

The breadcrumb bar records recent node navigation.

## Reduce Visual Clutter

Start with the built-in filters:

1. Hide GenEvent nodes.
2. Hide `SimVertex key=0`.
3. Hide small disconnected subgraphs.
4. Hide parton shower when status-2 gluon detail is not relevant.

Then apply one of:

- Focus radius for local undirected context.
- Upstream/downstream link filtering for directed context.
- Advanced search to highlight nodes with matching attributes.

## Explore Local Truth Context

Use focus radius to understand the immediate neighborhood around a node.

Steps:

1. Select a node.
2. Set **Focus Radius** to `1`.
3. Click the apply checkmark.
4. Increase to `2` or `3` only if more context is needed.
5. Click **Reset View** to restore the full graph.

This is useful when the full graph layout is too dense to inspect directly.

## Trace Directed Links

Use the **Links** controls to follow graph direction around a selected node.

Steps:

1. Select a node.
2. Set **Depth**.
3. Choose **Upstream**, **Downstream**, or **Both**.
4. Click the apply checkmark.

The graph direction is the direction encoded in the DOT file. In this app, upstream/downstream names follow the truth-graph convention implemented by the frontend.

## View Rechits For A Node

When rechit data is loaded:

1. Select **Direct hits** in the 3D display mode.
2. Click a node with `directHitsDetIds`.
3. Use Plotly controls to rotate, zoom, or pan.

For aggregate context:

1. Select **Subgraph hits**.
2. Click a node.
3. The panel collects direct hits from the selected node and descendants.

If no real rechit data is loaded, the app displays placeholder points for UI testing.

## Upload New Input Files

Server mode only:

1. Start the app with `./run.sh` or `python server.py`.
2. Click **Upload Files**.
3. Select a DOT file.
4. Optionally select a ROOT file and event index.
5. Click **Upload & Process**.

The server rebuilds graph and optional rechit JSON in the background. The page reloads after a successful build.

## Export The Current View

After filtering or zooming:

- Click **Save PNG** for an image.
- Click **Save PDF** for a one-page PDF.

Exports capture the current Cytoscape viewport. Fit or zoom the graph before exporting.

## Console Helpers

Open browser DevTools to inspect visible nodes:

```javascript
GraphManager.cy.nodes().filter(node => node.visible()).map(node => node.data())
```

List currently non-hidden node labels:

```javascript
GraphManager.cy.nodes()
  .filter(node => !node.hasClass('hidden'))
  .map(node => node.data('label'))
```
