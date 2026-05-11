/**
 * dependency.js - Dependency explorer
 * Handles showing upstream/downstream dependencies with configurable depth
 */

const DependencyExplorer = {
    depthInput: null,
    showBtn: null,
    upstreamBtn: null,
    downstreamBtn: null,
    selectedNodeName: null,

    /**
     * Initialize dependency explorer
     */
    init() {
        this.depthInput = document.getElementById('dep-depth');
        this.showBtn = document.getElementById('dep-show-btn');
        this.upstreamBtn = document.getElementById('dep-upstream-btn');
        this.downstreamBtn = document.getElementById('dep-downstream-btn');
        this.selectedNodeName = document.getElementById('selected-node-name');

        this.setupEventListeners();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.upstreamBtn.addEventListener('click', () => this.show('upstream'));
        this.downstreamBtn.addEventListener('click', () => this.show('downstream'));
        this.showBtn.addEventListener('click', () => this.show('both'));

        // Update selected node name when panel opens
        document.addEventListener('panelOpened', (e) => {
            this.selectedNodeName.textContent = e.detail.nodeName || 'None selected';
        });
    },

    /**
     * Show dependencies
     */
    show(direction) {
        const depth = parseInt(this.depthInput.value);

        if (!PanelManager.currentNode) {
            alert('Please select a node first');
            return;
        }

        console.log(`Showing ${direction} dependencies with depth:`, depth);

        const nodes = GraphManager.getNodeByLabel(PanelManager.currentNode);

        if (nodes.length === 0) {
            alert('Current node not found in graph');
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
        const visited = new Set([centerNode.id()]);
        const nodes = GraphManager.cy.collection().union(centerNode);
        const edges = GraphManager.cy.collection();

        let currentLevel = GraphManager.cy.collection().union(centerNode);

        for (let i = 0; i < depth; i++) {
            const nextLevel = GraphManager.cy.collection();

            currentLevel.forEach(node => {
                let neighbors;

                if (direction === 'upstream') {
                    neighbors = node.outgoers('node');
                } else if (direction === 'downstream') {
                    neighbors = node.incomers('node');
                } else {
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
                    connectedEdges = node.connectedEdges().filter(edge => {
                        return edge.source().id() === node.id() && visited.has(edge.target().id());
                    });
                } else if (direction === 'downstream') {
                    connectedEdges = node.connectedEdges().filter(edge => {
                        return edge.target().id() === node.id() && visited.has(edge.source().id());
                    });
                } else {
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
    PanelManager.open = function(nodeName, nodeId) {
        originalOpen.call(this, nodeName, nodeId);

        // Dispatch custom event
        const event = new CustomEvent('panelOpened', {
            detail: { nodeName, nodeId }
        });
        document.dispatchEvent(event);
    };
});
