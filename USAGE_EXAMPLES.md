# Usage Examples

Common workflows and examples for using the CMSSW Graph Visualization tool.

## Table of Contents

- [Quick Tasks](#quick-tasks)
- [Investigation Workflows](#investigation-workflows)
- [Advanced Scenarios](#advanced-scenarios)

---

## Quick Tasks

### Find a Specific Module

**Task:** Locate "hgcalMergeLayerClusters" in the graph

**Steps:**
1. Type `hgcalMergeLayerClusters` in the Search field
2. Press Enter
3. Graph zooms to the module and opens its details panel

**Result:** You can now see its type, parameters, and InputTags

---

### Find All Dependencies

**Task:** Show complete dependency tree for a module (depth 3)

**Steps:**
1. Click on your module of interest
2. Set **Depth** to `3`
3. Click **Show Dependencies**

**Result:** Graph shows all modules within 3 steps upstream or downstream

---

## Investigation Workflows

### Workflow 2: Find Who Uses a Module's Output

**Scenario:** You modified a module and need to know what will be affected

**Example:** Find all consumers of "hgcalLayerClustersEE"

**Steps:**

1. **Find the producer:**
   ```
   Search: "hgcalLayerClustersEE"
   ```

2. **Show downstream dependencies:**
   - Depth: `3` (or higher)
   - Click **Downstream Only**

3. **Review consumers:**
   - Each visible node depends on this module (directly or indirectly)
   - Click nodes to see how they use it (check their InputTags)

4. **Result:**
   - List of all affected modules
   - Understanding of impact radius

---

### Workflow 4: Explore Module Neighborhood

**Scenario:** You want to see only the immediate context around a module

**Example:** Explore local dependencies of "siPixelClusters"

**Steps:**

1. **Select the module:**
   ```
   Search: "siPixelClusters"
   Press Enter
   ```

2. **Apply focus radius:**
   - Focus Radius: `1`
   - Click **Apply**

3. **Examine neighbors:**
   - Graph shows only direct neighbors (1 hop away)
   - These are immediate inputs and outputs

4. **Expand context if needed:**
   - Focus Radius: `2`
   - Click **Apply**

5. **Result:**
   - Clean view of local context without noise
   - Easy to understand immediate dependencies

---

## Advanced Scenarios

### Scenario 1: Find Shared Dependencies

**Task:** Find modules that both ModuleA and ModuleB depend on

**Steps:**

1. **Explore ModuleA upstream:**
   - Select ModuleA
   - Depth: `5`
   - Click **Upstream Only**
   - Note visible modules

2. **Explore ModuleB upstream:**
   - Search for ModuleB
   - Depth: `5`
   - Click **Upstream Only**
   - Note visible modules

3. **Find intersection:**
   - Common visible modules are shared dependencies
   - Click through to verify

**Note:** This is manual for now. Future enhancement could highlight shared dependencies automatically.

---

### Scenario 3: Keyboard-Based Exploration

**Task:** Browse the graph without using the mouse

**Steps:**

1. **Start navigation:**
   - Press **Tab** to select first node

2. **Move around:**
   - Use **↑↓←→** to navigate spatially
   - Or **Tab** to cycle through nodes

3. **Inspect modules:**
   - Press **Enter** to open panel
   - Read the details

4. **Follow InputTags:**
   - (Switch to mouse to click InputTag)
   - Or use breadcrumbs with keyboard

5. **Close and continue:**
   - Press **Esc** to close panel
   - Continue with arrow keys

**Result:** Hands-free graph exploration (mostly)

---

### Scenario 4: Export Subgraph (Manual)

**Task:** Get a list of modules in a dependency tree for documentation

**Steps:**

1. **Show dependency tree:**
   - Select root module
   - Set depth as needed
   - Click **Show Dependencies**

2. **Manually list modules:**
   - Click through visible nodes
   - Copy module names from panel headers

3. **Alternative - Browser Console:**
   - Open browser DevTools (F12)
   - Run in console:
     ```javascript
     GraphManager.cy.nodes().filter(n => !n.hasClass('hidden')).map(n => n.data('label'))
     ```
   - Copy the array output

**Result:** List of module names in the subgraph

**Note:** Future enhancement could add an "Export" button.

---

## Common Patterns

## Tips for Large Graphs

### Reducing Visual Clutter

1. **Start with filters:**
   - Uncheck categories you don't care about
   - Gradually enable as needed

2. **Use focus radius:**
   - Start with radius 1-2
   - Expand only if needed

3. **Search first:**
   - Find your target module
   - Then use dependency explorer

### Improving Performance

1. **Limit visible nodes:**
   - Use filters aggressively
   - <500 visible nodes is smooth
   - 500-1000 is acceptable
   - >1000 may lag on pan/zoom

2. **Reset when confused:**
   - Press **R** to reset view
   - Start over with fresh filters

3. **Close panel when not needed:**
   - Panel rendering adds overhead
   - Press **Esc** when done reading

---

## Troubleshooting Investigations

### Issue: "No dependencies shown"

**Problem:** Dependency explorer shows only selected module

**Possible causes:**
1. Module is isolated (no connections)
2. Depth is too small
3. Edges were filtered during preprocessing

**How to investigate:**
- Increase depth to 10
- Try "Both" instead of upstream/downstream
- Check panel to see if InputTags are listed

---

### Issue: "Search finds nothing"

**Problem:** Search returns "No modules found"

**Possible causes:**
1. Typo in search term
2. Module not in the graph
3. Case sensitivity issue (shouldn't happen)

**How to investigate:**
- Search for partial name (e.g., "pixel" instead of "siPixelClusters")
- Check module list in bundle.json
- Try browsing visually with keyboard navigation

---

## Best Practices

1. **Always start broad:** Load full graph, then filter down
2. **Use breadcrumbs:** They're there for a reason - backtrack easily
3. **Combine features:** Search + Dependency Explorer is powerful
4. **Document your findings:** Copy module names, take screenshots
5. **Reset frequently:** Don't get lost in filters, press R to start fresh
6. **Keyboard shortcuts:** Learn them, they're much faster

---

**For full feature reference, see [FEATURES.md](FEATURES.md)**

**For setup and installation, see [README.md](README.md)**
