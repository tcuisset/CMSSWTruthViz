/**
 * dependency.js - Dependency explorer
 * Handles showing upstream/downstream dependencies with configurable depth
 */

const DependencyExplorer = {
    depthInput: null,
    applyBtn: null,
    noneBtn: null,
    showBtn: null,
    upstreamBtn: null,
    downstreamBtn: null,
    selectedNodeName: null,
    selectedDirection: 'none',

    /**
     * Initialize dependency explorer
     */
    init() {
        this.depthInput = document.getElementById('dep-depth');
        this.applyBtn = document.getElementById('dep-apply-btn');
        this.noneBtn = document.getElementById('dep-none-btn');
        this.showBtn = document.getElementById('dep-show-btn');
        this.upstreamBtn = document.getElementById('dep-upstream-btn');
        this.downstreamBtn = document.getElementById('dep-downstream-btn');
        this.selectedNodeName = document.getElementById('selected-node-name');

        this.setupEventListeners();
        this.updateDirectionButtons();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.noneBtn.addEventListener('click', () => this.setDirection('none'));
        this.upstreamBtn.addEventListener('click', () => this.setDirection('upstream'));
        this.downstreamBtn.addEventListener('click', () => this.setDirection('downstream'));
        this.showBtn.addEventListener('click', () => this.setDirection('both'));
        this.applyBtn.addEventListener('click', () => this.apply());

        // Update selected node name when panel opens
        document.addEventListener('panelOpened', (e) => {
            this.selectedNodeName.textContent = e.detail.nodeName || 'None selected';
        });
    },

    /**
     * Select the pending dependency direction without applying it.
     */
    setDirection(direction) {
        this.selectedDirection = direction;
        this.updateDirectionButtons();
    },

    /**
     * Keep the four-way toggle state visible.
     */
    updateDirectionButtons() {
        const buttons = [
            [this.noneBtn, 'none'],
            [this.upstreamBtn, 'upstream'],
            [this.downstreamBtn, 'downstream'],
            [this.showBtn, 'both']
        ];

        buttons.forEach(([button, direction]) => {
            if (button) {
                button.classList.toggle('active', this.selectedDirection === direction);
            }
        });
    },

    /**
     * Apply the selected dependency filter.
     */
    apply() {
        const depth = parseInt(this.depthInput.value);
        const direction = this.selectedDirection;

        if (direction === 'none') {
            GraphManager.clearSelectionFilter();
            return;
        }

        const selectedNodes = GraphManager.getSelectedNodesForFiltering();

        if (selectedNodes.length === 0) {
            alert('Please select a node first');
            return;
        }

        console.log(`Showing ${direction} dependencies with depth:`, depth);
        this.showDependenciesForNodes(selectedNodes, depth, direction);
    },

    /**
     * Show dependencies for one or more selected nodes.
     */
    showDependenciesForNodes(centerNodes, depth, direction) {
        const dependencies = this.getDependencies(centerNodes, depth, direction);

        // Hide nodes not in dependencies
        GraphManager.cy.nodes().addClass('hidden');
        dependencies.nodes.removeClass('hidden');

        // Hide edges where both endpoints are not visible
        GraphManager.cy.edges().addClass('hidden');
        dependencies.edges.removeClass('hidden');

        // Highlight the center node
        GraphManager.clearHighlight();
        centerNodes.addClass('highlighted');

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
    getDependencies(centerNodes, depth, direction) {
        const visited = new Set(centerNodes.map(node => node.id()));
        const nodes = GraphManager.cy.collection().union(centerNodes);
        const edges = GraphManager.cy.collection();

        let currentLevel = GraphManager.cy.collection().union(centerNodes);

        for (let i = 0; i < depth; i++) {
            const nextLevel = GraphManager.cy.collection();

            currentLevel.forEach(node => {
                let neighbors;

                if (direction === 'downstream') {
                    neighbors = node.outgoers('node');
                } else if (direction === 'upstream') {
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

                if (direction === 'downstream') {
                    connectedEdges = node.connectedEdges().filter(edge => {
                        return edge.source().id() === node.id() && visited.has(edge.target().id());
                    });
                } else if (direction === 'upstream') {
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
