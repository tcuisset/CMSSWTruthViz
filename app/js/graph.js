/**
 * graph.js - Cytoscape graph visualization
 * Handles graph initialization, rendering, and interactions
 */

const GraphManager = {
    cy: null,
    fullGraph: null,
    dagreRegistered: false,

    /**
     * Initialize Cytoscape graph with data
     */
    init(data) {
        console.log('Initializing graph with', data.nodes.length, 'nodes and', data.edges.length, 'edges');

        if (!this.dagreRegistered && typeof cytoscapeDagre === 'function') {
            try {
                cytoscape.use(cytoscapeDagre);
                this.dagreRegistered = true;
            } catch (error) {
                console.warn('Could not register cytoscape-dagre; falling back to breadthfirst layout', error);
            }
        }

        // Convert data to Cytoscape format
        const elements = {
            nodes: data.nodes.map(n => ({
                data: {
                    id: n.id,
                    label: n.displayLabel || n.label || n.id,
                    ...n
                }
            })),
            edges: data.edges.map(e => ({
                data: {
                    id: `${e.source}-${e.target}`,
                    source: e.source,
                    target: e.target,
                    ...e
                }
            }))
        };

        // Initialize Cytoscape
        this.cy = cytoscape({
            container: document.getElementById('cy'),
            elements: elements,

            style: [
                // Node styles
                {
                    selector: 'node',
                    style: {
                        'width': 'label',
                        'height': 'label',
                        'padding': 10,
                        'label': 'data(label)',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'font-size': 8,
                        'text-wrap': 'wrap',
                        'text-max-width': 180,
                        'line-height': 1.25,
                        'color': '#000',
                        'text-background-color': 'rgba(255, 255, 255, 0.7)',
                        'text-background-opacity': 1,
                        'text-background-padding': 2,
                        'text-background-shape': 'roundrectangle',
                        'background-color': function(ele) {
                            const fillcolor = ele.data('fillcolor');
                            if (fillcolor === 'green') return '#2ecc71';
                            if (fillcolor === 'lightgrey') return '#d3d3d3';
                            return '#3498db';
                        },
                        'border-width': 2,
                        'border-color': function(ele) {
                            const color = ele.data('color');
                            return color || '#34495e';
                        },
                        'shape': function(ele) {
                            const shape = ele.data('shape');
                            if (shape === 'diamond') return 'diamond';
                            if (shape === 'box') return 'rectangle';
                            return 'rectangle';
                        }
                    }
                },
                // Highlighted node
                {
                    selector: 'node.highlighted',
                    style: {
                        'border-width': 4,
                        'border-color': '#e74c3c',
                        'z-index': 9999
                    }
                },
                // Selected node
                {
                    selector: 'node.selected',
                    style: {
                        'border-width': 4,
                        'border-color': '#f39c12',
                        'z-index': 9998
                    }
                },
                // Dimmed node
                {
                    selector: 'node.dimmed',
                    style: {
                        'opacity': 0.3
                    }
                },
                // Hidden node
                {
                    selector: 'node.hidden',
                    style: {
                        'display': 'none'
                    }
                },
                // Edge styles
                {
                    selector: 'edge',
                    style: {
                        'width': 1,
                        'line-color': function(ele) {
                            const color = ele.data('color');
                            return color || '#95a5a6';
                        },
                        'target-arrow-color': function(ele) {
                            const color = ele.data('color');
                            return color || '#95a5a6';
                        },
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'arrow-scale': 1.2
                    }
                },
                // Hidden edge
                {
                    selector: 'edge.hidden',
                    style: {
                        'display': 'none'
                    }
                },
                // Dimmed edge
                {
                    selector: 'edge.dimmed',
                    style: {
                        'opacity': 0.2
                    }
                }
            ],

            layout: this.getLayoutConfig(),

            minZoom: 0.1,
            maxZoom: 3,
            wheelSensitivity: 0.2
        });

        // Store full graph for reset
        this.fullGraph = this.cy.elements().clone();

        // Event handlers
        this.setupEventHandlers();

        console.log('Graph initialized successfully');
        return this.cy;
    },

    /**
     * Prefer dagre when its extension is available, otherwise use a built-in hierarchical layout.
     */
    getLayoutConfig() {
        if (this.dagreRegistered) {
            return {
                name: 'dagre',
                animate: false,
                rankDir: 'TB',
                ranker: 'network-simplex',
                nodeSep: 40,
                edgeSep: 16,
                rankSep: 90,
                spacingFactor: 1.1,
                fit: true,
                padding: 30
            };
        }

        return {
            name: 'breadthfirst',
            animate: false,
            directed: true,
            spacingFactor: 1.1,
            fit: true,
            padding: 30
        };
    },

    /**
     * Setup event handlers for graph interactions
     */
    setupEventHandlers() {
        // Node click - open panel and show dependencies
        this.cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            const moduleId = node.id();
            const label = node.data('label');

            console.log('Node clicked:', label);
            PanelManager.open(label, moduleId);

            // Auto-show dependencies (upstream + downstream)
            if (DependencyExplorer && DependencyExplorer.autoShowOnClick) {
                DependencyExplorer.showForNode(node);
            }
        });

        // Node hover - show tooltip
        this.cy.on('mouseover', 'node', (evt) => {
            const node = evt.target;
            const tooltip = node.data('tooltip');
            if (tooltip) {
                node.style('text-background-color', 'rgba(255, 255, 255, 0.9)');
            }
        });

        this.cy.on('mouseout', 'node', (evt) => {
            const node = evt.target;
            node.style('text-background-color', 'rgba(255, 255, 255, 0.7)');
        });

        // Background click - clear selection
        this.cy.on('tap', (evt) => {
            if (evt.target === this.cy) {
                this.clearSelection();
            }
        });
    },

    /**
     * Highlight a specific node
     */
    highlightNode(nodeId) {
        this.clearHighlight();
        const node = this.cy.getElementById(nodeId);
        if (node.length > 0) {
            node.addClass('highlighted');
            this.cy.animate({
                center: { eles: node },
                zoom: 1.5
            }, {
                duration: 500
            });
            return true;
        }
        return false;
    },

    /**
     * Clear all highlights
     */
    clearHighlight() {
        this.cy.nodes().removeClass('highlighted dimmed');
        this.cy.edges().removeClass('dimmed');
    },

    /**
     * Clear selection
     */
    clearSelection() {
        this.cy.nodes().removeClass('selected');
        KeyboardNav.selectedNode = null;
    },

    /**
     * Reset graph to full view
     */
    reset() {
        this.cy.nodes().removeClass('highlighted dimmed selected hidden');
        this.cy.edges().removeClass('dimmed hidden');
        this.cy.fit();
    },

    /**
     * Get node by label
     */
    getNodeByLabel(label) {
        return this.cy.nodes().filter(node => {
            return node.data('label') === label || node.data('id') === label;
        });
    },

    /**
     * Get source node data from the bundle by ID
     */
    getBundleNode(nodeId) {
        return window.bundleData?.nodes?.find(node => node.id === nodeId) || null;
    },

    /**
     * Fit graph to viewport
     */
    fit() {
        this.cy.fit();
    }
};
