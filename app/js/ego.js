/**
 * ego.js - Focus radius (ego graph)
 * Handles showing N-hop neighborhood around selected node
 */

const EgoGraphManager = {
    radiusInput: null,
    applyBtn: null,
    resetBtn: null,
    currentCenter: null,

    /**
     * Initialize ego graph functionality
     */
    init() {
        this.radiusInput = document.getElementById('ego-radius');
        this.applyBtn = document.getElementById('ego-apply-btn');
        this.resetBtn = document.getElementById('ego-reset-btn');

        this.setupEventListeners();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.applyBtn.addEventListener('click', () => this.apply());
        this.resetBtn.addEventListener('click', () => this.reset());
    },

    /**
     * Apply ego graph filter
     */
    apply() {
        const radius = parseInt(this.radiusInput.value);

        const selectedNodes = GraphManager.getSelectedNodesForFiltering();

        if (selectedNodes.length === 0) {
            alert('Please select a node first');
            return;
        }

        console.log('Applying ego graph with radius:', radius);

        this.currentCenter = selectedNodes;

        // Find N-hop neighborhood using BFS
        const neighborhood = this.getNeighborhood(selectedNodes, radius);

        // Hide nodes not in neighborhood
        GraphManager.cy.nodes().addClass('hidden');
        neighborhood.nodes.removeClass('hidden');

        // Hide edges where both endpoints are not visible
        GraphManager.cy.edges().addClass('hidden');
        neighborhood.edges.removeClass('hidden');

        // Fit view to visible nodes
        GraphManager.cy.animate({
            fit: { eles: neighborhood.nodes, padding: 50 }
        }, {
            duration: 500
        });

        console.log(`Showing ${neighborhood.nodes.length} nodes within radius ${radius}`);
    },

    /**
     * Get N-hop neighborhood using BFS
     */
    getNeighborhood(centerNodes, radius) {
        const visited = new Set(centerNodes.map(node => node.id()));
        const nodes = GraphManager.cy.collection().union(centerNodes);
        const edges = GraphManager.cy.collection();

        let currentLevel = GraphManager.cy.collection().union(centerNodes);

        for (let i = 0; i < radius; i++) {
            const nextLevel = GraphManager.cy.collection();

            currentLevel.forEach(node => {
                // Get all neighbors (both incoming and outgoing, undirected)
                const neighbors = node.neighborhood('node');

                neighbors.forEach(neighbor => {
                    if (!visited.has(neighbor.id())) {
                        visited.add(neighbor.id());
                        nodes.merge(neighbor);
                        nextLevel.merge(neighbor);
                    }
                });

                // Add edges between visited nodes
                const connectedEdges = node.connectedEdges();
                connectedEdges.forEach(edge => {
                    const source = edge.source();
                    const target = edge.target();

                    if (visited.has(source.id()) && visited.has(target.id())) {
                        edges.merge(edge);
                    }
                });
            });

            currentLevel = nextLevel;

            if (currentLevel.length === 0) {
                break;
            }
        }

        return { nodes, edges };
    },

    /**
     * Reset to full graph view
     */
    reset() {
        GraphManager.reset();
        this.currentCenter = null;
    }
};
