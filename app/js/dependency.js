/**
 * dependency.js - Dependency explorer
 * Handles showing upstream/downstream dependencies with configurable depth
 */

const DependencyExplorer = {
    depthInput: null,
    showBtn: null,
    pathsBtn: null,
    upstreamBtn: null,
    downstreamBtn: null,
    selectedModuleName: null,
    autoShowOnClick: true,  // Auto-show dependencies when clicking a node

    /**
     * Initialize dependency explorer
     */
    init() {
        this.depthInput = document.getElementById('dep-depth');
        this.showBtn = document.getElementById('dep-show-btn');
        this.pathsBtn = document.getElementById('dep-paths-btn');
        this.upstreamBtn = document.getElementById('dep-upstream-btn');
        this.downstreamBtn = document.getElementById('dep-downstream-btn');
        this.selectedModuleName = document.getElementById('selected-module-name');

        this.setupEventListeners();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.pathsBtn.addEventListener('click', () => this.show('paths'));
        this.upstreamBtn.addEventListener('click', () => this.show('upstream'));
        this.downstreamBtn.addEventListener('click', () => this.show('downstream'));
        this.showBtn.addEventListener('click', () => this.show('both'));

        // Auto-show toggle
        const autoToggle = document.getElementById('auto-deps-toggle');
        if (autoToggle) {
            autoToggle.addEventListener('change', (e) => {
                this.autoShowOnClick = e.target.checked;
                console.log('Auto-show dependencies:', this.autoShowOnClick);
            });
        }

        // Update selected module name when panel opens
        document.addEventListener('panelOpened', (e) => {
            this.selectedModuleName.textContent = e.detail.moduleName || 'None selected';
        });
    },

    /**
     * Show dependencies for a specific node (called when clicking)
     */
    showForNode(node) {
        const depth = parseInt(this.depthInput.value);
        const direction = 'paths';  // Show direct paths only (no cross-connections)

        console.log(`Auto-showing dependencies for ${node.data('label')} with depth:`, depth);

        this.showDependenciesForNode(node, depth, direction);
    },

    /**
     * Show dependencies
     */
    show(direction) {
        const depth = parseInt(this.depthInput.value);

        if (!PanelManager.currentModule) {
            alert('Please select a module first');
            return;
        }

        console.log(`Showing ${direction} dependencies with depth:`, depth);

        // Find the current module's node
        const nodes = GraphManager.getNodeByLabel(PanelManager.currentModule);

        if (nodes.length === 0) {
            alert('Current module not found in graph');
            return;
        }

        const centerNode = nodes[0];
        this.showDependenciesForNode(centerNode, depth, direction);
    },

    /**
     * Show dependencies for a given node
     */
    showDependenciesForNode(centerNode, depth, direction) {
        // Get dependencies
        const dependencies = this.getDependencies(centerNode, depth, direction);

        // Hide nodes not in dependencies
        GraphManager.cy.nodes().addClass('hidden');
        dependencies.nodes.removeClass('hidden');

        // Hide edges where both endpoints are not visible
        GraphManager.cy.edges().addClass('hidden');
        dependencies.edges.removeClass('hidden');

        // Highlight the center node
        GraphManager.clearHighlight();
        centerNode.addClass('highlighted');

        // Fit view to visible nodes
        GraphManager.cy.animate({
            fit: { eles: dependencies.nodes, padding: 50 }
        }, {
            duration: 500
        });

        console.log(`Showing ${dependencies.nodes.length} nodes in ${direction} dependencies (depth ${depth})`);
    },

    /**
     * Get dependencies using BFS
     */
    getDependencies(centerNode, depth, direction) {
        // For 'paths' mode, get upstream and downstream separately and combine
        if (direction === 'paths') {
            const upstream = this.getDependencies(centerNode, depth, 'upstream');
            const downstream = this.getDependencies(centerNode, depth, 'downstream');

            return {
                nodes: upstream.nodes.union(downstream.nodes),
                edges: upstream.edges.union(downstream.edges)
            };
        }

        const visited = new Set([centerNode.id()]);
        const nodes = GraphManager.cy.collection().union(centerNode);
        const edges = GraphManager.cy.collection();

        let currentLevel = GraphManager.cy.collection().union(centerNode);

        for (let i = 0; i < depth; i++) {
            const nextLevel = GraphManager.cy.collection();

            currentLevel.forEach(node => {
                let neighbors;

                if (direction === 'upstream') {
                    // Upstream: what this module depends on (its dependencies/sources)
                    neighbors = node.outgoers('node');
                } else if (direction === 'downstream') {
                    // Downstream: what depends on this module (its consumers/dependents)
                    neighbors = node.incomers('node');
                } else {
                    // Both directions (includes cross-connections)
                    neighbors = node.neighborhood('node');
                }

                neighbors.forEach(neighbor => {
                    if (!visited.has(neighbor.id())) {
                        visited.add(neighbor.id());
                        nodes.merge(neighbor);
                        nextLevel.merge(neighbor);
                    }
                });

                // Add edges based on direction
                let connectedEdges;

                if (direction === 'upstream') {
                    // Upstream: edges pointing FROM this node TO dependencies
                    connectedEdges = node.connectedEdges().filter(edge => {
                        return edge.source().id() === node.id() && visited.has(edge.target().id());
                    });
                } else if (direction === 'downstream') {
                    // Downstream: edges pointing TO this node FROM dependents
                    connectedEdges = node.connectedEdges().filter(edge => {
                        return edge.target().id() === node.id() && visited.has(edge.source().id());
                    });
                } else {
                    // Both: include ALL edges between visited nodes (cross-connections)
                    connectedEdges = node.connectedEdges().filter(edge => {
                        return visited.has(edge.source().id()) && visited.has(edge.target().id());
                    });
                }

                edges.merge(connectedEdges);
            });

            currentLevel = nextLevel;

            if (currentLevel.length === 0) {
                break;
            }
        }

        return { nodes, edges };
    }
};

// Custom event for panel opening
document.addEventListener('DOMContentLoaded', () => {
    const originalOpen = PanelManager.open;
    PanelManager.open = function(moduleName, nodeId) {
        originalOpen.call(this, moduleName, nodeId);

        // Dispatch custom event
        const event = new CustomEvent('panelOpened', {
            detail: { moduleName, nodeId }
        });
        document.dispatchEvent(event);
    };
});
