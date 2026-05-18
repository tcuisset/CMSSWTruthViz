# CMSSW Module Dependency Graph Visualization

Interactive web-based visualization tool for exploring CMSSW (CMS Software) module dependencies and configurations.

![CMSSW Graph Visualization](https://img.shields.io/badge/visualization-cytoscape.js-blue)
![Python](https://img.shields.io/badge/python-3.6+-green)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

## Overview

This tool combines graph topology from Graphviz DOT files with detailed module configuration data to provide an intuitive, interactive interface for understanding complex CMSSW workflows.

**Key Capabilities:**
- Visualize 1,300+ module dependencies in an interactive graph
- Click modules to see detailed configuration (type, plugin, parameters, InputTags)
- Navigate between modules by clicking InputTag references
- Search for specific modules
- Focus on subgraphs with configurable radius (ego graph)
- Explore dependencies (upstream/downstream) with configurable depth
- Filter by category (Reco/Analysis/PAT/HLT, Producer/Filter/Analyzer)
- Full keyboard navigation support
- Breadcrumb navigation history

## Prerequisites

### Required Software
python, graphviz, installing the python virtual environment (automatically installed when you run `./run.sh` for the first time.)

## Two Ways to Use

### 📁 Static Mode (No Server - Easiest!)

Just open the HTML file in your browser - no installation needed!

```bash
# One-time setup
python preprocess/build_bundle.py

# Then simply open the file
open app/index.html              # macOS
xdg-open app/index.html          # Linux
start app/index.html             # Windows
# Or just double-click app/index.html
```

**See [STATIC_MODE.md](STATIC_MODE.md) for details**

### 🌐 Server Mode (With Upload Feature)

Run with a local server to enable file upload functionality.

## Quick Start

### One-Command Setup

```bash
# Navigate to the project directory
cd /path/to/CMSSWGraph

# Make the script executable (first time only)
chmod +x run.sh

# Run the application (handles everything automatically)
./run.sh

# Use a specific DOT graph
./run.sh --dot ../truthlogicalgraph.dot
```

### What run.sh Does

The script automatically handles the complete setup:

1. ✅ **Creates virtual environment** (if `venv/` doesn't exist)
   - Creates an isolated Python environment

2. ✅ **Activates virtual environment**
   - Ensures packages are installed in the project venv

3. ✅ **Installs Python dependencies** (if not already installed)
   - Runs `pip install -r preprocess/requirements.txt` if needed

4. ✅ **Generates data bundle** (if missing, stale, or using a different DOT file)
   - Runs `python preprocess/build_bundle.py [dot_file]`
   - Parses the selected DOT file
   - Creates `data/bundle.json` (~22 MB)

5. ✅ **Starts web server**
   - Runs on the first available port starting at `http://localhost:8009`
   - Serves the application at `/app/`

Then open the **Application URL** printed by the server, usually: **http://localhost:8009/app/**

### Requirements for run.sh
**For detailed platform-specific installation instructions, see [INSTALL.md](INSTALL.md)**

## Installation

### Automatic Setup (Recommended)

```bash
chmod +x run.sh
./run.sh
```

### Manual Setup

```bash
# 1. Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# 2. Install Python dependencies
pip install -r preprocess/requirements.txt

# 3. Generate data bundle
python preprocess/build_bundle.py

# 4. Start web server
python server.py
```

## Project Structure

```
CMSSWGraph/
├── preprocess/              # Data preprocessing scripts
│   ├── parse_graph.py      # Parse Graphviz DOT file
│   ├── parse_config.py     # Parse CMSSW config dump
│   ├── build_bundle.py     # Generate JSON bundle
│   └── requirements.txt    # Python dependencies
├── data/
│   └── bundle.json         # Generated graph + module data
├── app/                    # Web application
│   ├── index.html         # Main page
│   ├── css/style.css      # Styling
│   └── js/                # Application logic
│       ├── main.js        # Initialization
│       ├── graph.js       # Cytoscape graph
│       ├── panel.js       # Side panel
│       ├── search.js      # Search functionality
│       ├── ego.js         # Focus radius
│       ├── dependency.js  # Dependency explorer
│       ├── keyboard.js    # Keyboard navigation
│       ├── filter.js      # Category filters
│       └── utils.js       # Helper functions
├── server.py              # Local HTTP server
├── run.sh                 # Quick start script
└── README.md             # This file
```

For implementation details, see [TECHNICAL_DETAILS.md](TECHNICAL_DETAILS.md). It documents the Cytoscape.js integration, layout pipeline, bundle generation, data model, server/upload flow, and main JavaScript managers.

## Usage Guide

### Basic Navigation

**Graph Interaction:**
- **Pan**: Click and drag on the background
- **Zoom**: Mouse wheel or pinch gesture
- **Select node**: Click on any module box
- **View details**: Click opens the side panel with full module info

### Search

1. Enter module name in the **Search** field (top left)
2. Click **Find** or press Enter
3. Single match: Opens panel and zooms to node
4. Multiple matches: Highlights all matching nodes
5. Click **Clear** to reset view

**Example:** Search for "hgcalMergeLayerClusters"

### Side Panel Features

**Resizable Panel:**
- Drag the left edge to resize
- Width is saved automatically

**Breadcrumb Navigation:**
- Shows your navigation path
- Click any previous module to go back
- Close button (×) closes panel and clears highlights

### Focus Radius (Ego Graph)

Show only nodes within N hops of the selected module:

1. Select a module (click it to open the panel)
2. Set **Focus Radius** (1-5 hops)
3. Click **Apply**
4. Click **Reset View** to see the full graph again

**Use case:** Isolate a module's immediate neighborhood to reduce clutter

### Dependency Explorer

Explore upstream/downstream dependencies with configurable depth:

1. Select a module
2. Set **Depth** (1-10 levels)
3. Choose:
   - **Show Dependencies**: Both upstream and downstream
   - **Upstream Only**: Modules this module depends on
   - **Downstream Only**: Modules that depend on this module

**Use case:** Trace the full dependency chain for a specific module

### Category Filters

Filter nodes by stage, specificity, or type:

**Quick Actions:**
- **All**: Select all filters
- **None**: Deselect all filters

The filter stats show how many nodes are visible.

### Keyboard Navigation

Press **?** to see the help overlay.

| Key | Action |
|-----|--------|
| **↑ ↓ ← →** | Navigate to adjacent nodes |
| **Tab** | Cycle to next node |
| **Enter** | Open details panel for selected node |
| **Esc** | Close panel |
| **R** | Reset view (show all nodes, fit to screen) |
| **?** | Toggle keyboard shortcuts help |

**Navigation behavior:**
- Arrow keys move to the nearest node in that direction
- Selected nodes have an orange border
- Press Enter to open the panel for the selected node

## Advanced Features

### Navigation History

The breadcrumb trail at the top of the side panel shows your path:

```
ModuleA › ModuleB › ModuleC
```

Click any previous module to jump back in the history.

### Graph Layout

The graph layout can be switched at runtime:
- **Dagre**: hierarchical layout, similar in spirit to Graphviz `dot`
- **fCoSE**: force-directed layout for compact clustered views
- **ELK**: layered rightward layout with orthogonal edge routing
- Node labels are visible by default with semi-transparent backgrounds

## Troubleshooting

### Bundle generation fails

**Error:** `FileNotFoundError: dependency.gv or dumpConfig.py not found`

**Solution:** Ensure your input files are in the project root or update paths in `build_bundle.py`

### Graph doesn't load

**Error:** `Failed to load bundle.json`

**Solution:**
```bash
# Regenerate the bundle
python preprocess/build_bundle.py
```

### Default port already in use

**Solution:**
`server.py` automatically tries the next available port starting at `8009`. Use the **Application URL** printed in the terminal.

### Graph performance issues

If you have >5,000 nodes, the initial layout may be slow. Solutions:
- Use filters to reduce visible nodes
- Use focus radius or dependency explorer for targeted views
- Consider sampling the input graph for exploration

## Extending the Tool

### Adding New Filters

Edit `app/js/filter.js` and add your filter logic in `shouldShowNode()`.

### Custom Graph Layouts

Edit `app/js/graph.js` and change the layout configuration:

```javascript
layout: {
    name: 'dagre',  // Or: 'fcose', 'elk'
    // ... other options
}
```

### Additional Module Metadata

Edit `preprocess/parse_config.py` to extract more fields from the config dump, then update `panel.js` to display them.

### Export Functionality

Add export buttons in `index.html` and implement export logic (e.g., to PNG, PDF, or filtered DOT file).

## Data Files

### Input Files (Required)


### Generated Files

**data/bundle.json** (21+ MB)
- Combined graph + module data
- Regenerated automatically by `run.sh` if missing
- Can be regenerated with: `python preprocess/build_bundle.py`

Structure:
```json
{
  "nodes": [{id, label, shape, color, fillcolor, tooltip}],
  "edges": [{source, target, color, style}],
  "modules": {
    "ModuleName": {
      "type": "EDProducer",
      "plugin": "PluginClass",
      "parameters": {...},
      "inputTags": [{field, module, instance, process, found, targetId}],
      "rawSnippet": "..."
    }
  },
  "labelToId": {"ModuleName": "nodeId"}
}
```

## Technology Stack

**Preprocessing:**
- Python 3.6+
- [pydot](https://pypi.org/project/pydot/) - DOT file parsing
- [NetworkX](https://networkx.org/) - Graph manipulation

**Frontend:**
- [Cytoscape.js](https://js.cytoscape.org/) - Graph visualization
- Vanilla JavaScript (ES6+)
- HTML5 + CSS3

**Server:**
- Python built-in `http.server`

## Performance Notes

- **Graph size**: Tested with 1,316 nodes and 3,427 edges
- **Rendering time**: ~2-3 seconds for initial layout
- **Memory usage**: ~50-100 MB in browser

## License

MIT License - feel free to use, modify, and distribute.

## Contributing

Contributions welcome! Areas for improvement:
- Additional layout algorithms
- Path finding between modules
- Subgraph grouping 
- Progressive rendering for larger graphs

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review browser console for error messages
3. Verify input files are correctly formatted
4. Regenerate bundle.json if data seems stale

---

## Plan for new features
### 3D display
 - color alpha function of energy
 - interaction point & detector outline
 - different color for "own" and "children" hits ?
 




