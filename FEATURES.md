# Features Reference

Quick reference guide for all features in the CMSSW Graph Visualization tool.

## Table of Contents

- [Graph Visualization](#graph-visualization)
- [node Details Panel](#node-details-panel)
- [Search & Navigation](#search--navigation)
- [Focus & Filtering](#focus--filtering)
- [Dependency Analysis](#dependency-analysis)
- [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Graph Visualization

### Visual Encoding
**Node Colors:**
**Node Shapes:**
**Node Size:**
**Edge Style:**
- Directed arrows showing dependency flow

### Interaction

| Action | Gesture |
|--------|---------|
| **Pan graph** | Click + drag on background |
| **Zoom** | Mouse wheel / pinch |
| **Select node** | Click on node |
| **View details** | Click opens side panel |
| **Hover tooltip** | Mouse over node (if available) |

### Layout

- **Dagre**: hierarchical layout, similar to Graphviz `dot`
- **fCoSE**: force-directed layout for compact clustered views
- **Runtime switch**: use the Layout selector in the header
- **Layout status**: running layouts show a status pill with a cancel button

---

## node Details Panel

### Display Sections


### Panel Interactions

**Resize:**
- Drag the left edge to adjust width
- Min width: 300px
- Max width: 80% of viewport
- Width saved to localStorage

**Navigate:**
- Click any node to jump to that node
- Breadcrumbs show navigation history
- Click breadcrumb to go back

**Close:**
- Click × button in header
- Press **Esc** key
- Click graph background

---

## Search & Navigation

### Search node

**Location:** Top controls bar

**Usage:**
1. Type node/label (partial match, case-insensitive)
2. Press **Enter** or click **Find**

**Results:**
- **Single match**: Opens panel, zooms to node
- **Multiple matches**: Highlights all, dims others
- **No matches**: Alert dialog

**Clear:**
- Click **Clear** button
- Resets all highlights
- Fits full graph to view

### Breadcrumb Navigation

**Location:** Side panel header

**Display:** `nodeA › nodeB › nodeC`

**Interaction:**
- Current node: Plain text (not clickable)
- Previous nodes: Blue, clickable
- Click any to jump back in history

---

## Focus & Filtering

### Focus Radius (Ego Graph)

**Purpose:** Show N-hop neighborhood around selected node

**Controls:**
- **Focus Radius**: 1-5 hops (number input)
- **Apply**: Show neighborhood
- **Reset View**: Restore full graph

**Algorithm:** BFS (Breadth-First Search) undirected

**Behavior:**
- Hides nodes outside N-hop radius
- Hides edges with hidden endpoints
- Fits view to visible nodes

**Example:**
- Radius 1: Show only direct neighbors
- Radius 2: Show neighbors + neighbors of neighbors

### Category Filters

**Location:** Filter controls wrapper (blue background)

**Stats Display:** Shows "Showing X of Y nodes (Z%)"

---

## Dependency Analysis

### Dependency Explorer

**Purpose:** Trace upstream/downstream dependencies with configurable depth

**Controls:**
- **Selected node**: Display current node name
- **Depth**: 1-10 levels (number input)
- **Show Dependencies**: Both upstream and downstream
- **Upstream Only**: nodes this depends on (predecessors)
- **Downstream Only**: nodes that depend on this (successors)

**Requirements:**
- Must select a node first (click to open panel)

**Behavior:**
- BFS traversal up to specified depth
- Hides nodes outside dependency tree
- Highlights selected node (red border)
- Fits view to dependency tree

**Use Cases:**
- **Upstream**: "What does this node need to run?"
- **Downstream**: "What depends on this node's output?"
- **Both**: "What's the full context around this node?"

**Example:**
```
Depth 1 Upstream:
  nodeA ← nodeB ← [nodeC]
         (selected)

Depth 2 Downstream:
  [nodeC] → nodeD → nodeE
  (selected)     ↓
              nodeF
```

---

## Keyboard Shortcuts

Press **?** to toggle help overlay.

### Navigation Keys

| Key | Action | Details |
|-----|--------|---------|
| **↑** | Navigate up | Move to nearest node above |
| **↓** | Navigate down | Move to nearest node below |
| **←** | Navigate left | Move to nearest node left |
| **→** | Navigate right | Move to nearest node right |
| **Tab** | Cycle next | Move to next visible node |
| **Enter** | Open panel | Show details for selected node |

### Control Keys

| Key | Action | Details |
|-----|--------|---------|
| **Esc** | Close panel | Close side panel, clear highlights |
| **R** | Reset view | Show all nodes, fit to screen |
| **?** | Toggle help | Show/hide keyboard shortcuts |

### Visual Feedback

- **Selected node**: Orange border (`#f39c12`)
- **Highlighted node**: Red border (`#e74c3c`)
- **Dimmed node**: 30% opacity

### Notes

- Shortcuts disabled when typing in input fields
- Arrow keys navigate spatially (geometric direction)
- Tab cycles through nodes in array order
- Selection persists until cleared (Esc or R)

---

## Tips & Tricks

### Efficient Workflow

### Performance Optimization

- **Large graphs**: Use filters early to reduce visible nodes
- **Slow layout**: Wait for initial layout to complete before interacting
- **Memory**: Close unused browser tabs if graph is very large

### Customization

- **Panel width**: Resize once, it's saved automatically
- **Layout**: Use the header selector to switch between Dagre and fCoSE
- **Colors**: Edit `style.css` to change color scheme

---

## Data Coverage

---

**For full documentation, see [README.md](README.md)**
