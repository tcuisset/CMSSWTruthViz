/**
 * graph.js - Cytoscape graph visualization
 * Handles graph initialization, rendering, and interactions
 */

const GraphManager = {
    cy: null,
    fullGraph: null,
    dagreRegistered: false,
    graphName: '',
    hideGenEventNodes: true,
    hideSimVertexKey0Node: true,
    nodeTypeColors: {
        gen: '#2e86de',
        sim: '#e67e22',
        event: '#f1c40f'
    },

    getNodeKind(ele) {
        const explicitType = String(ele.data('type') || '').trim();
        if (explicitType) return explicitType;

        if (!this.isLogicalGraph()) return '';

        const logicalFlags = this.getLogicalFlags(ele);
        const isVertex = this.isLogicalVertex(ele);

        if (logicalFlags.hasGen && logicalFlags.hasSim) {
            return isVertex ? 'GenSimVertex' : 'GenSimParticle';
        }
        if (logicalFlags.hasGen) {
            return isVertex ? 'GenVertex' : 'GenParticle';
        }
        if (logicalFlags.hasSim) {
            return isVertex ? 'SimVertex' : 'SimTrack';
        }

        return isVertex ? 'LogicalVertex' : 'LogicalParticle';
    },

    isLogicalGraph() {
        return this.graphName === 'TruthLogicalGraph';
    },

    isTruthyAttribute(value) {
        if (value === true || value === 1) return true;
        if (value === false || value === 0 || value === null || value === undefined) return false;

        const normalized = String(value).trim().toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes';
    },

    extractLogicalFlagFromText(ele, key) {
        const text = `${ele.data('rawLabel') || ''}\n${ele.data('detailLabel') || ''}`;
        const match = text.match(new RegExp(`${key}\\s*:\\s*(yes|no|true|false|1|0)`, 'i'));
        return match ? this.isTruthyAttribute(match[1]) : false;
    },

    getLogicalFlags(ele) {
        const hasGenAttribute = ele.data('hasGen');
        const hasSimAttribute = ele.data('hasSim');

        let hasGen = hasGenAttribute !== undefined
            ? this.isTruthyAttribute(hasGenAttribute)
            : this.extractLogicalFlagFromText(ele, 'hasGen');
        let hasSim = hasSimAttribute !== undefined
            ? this.isTruthyAttribute(hasSimAttribute)
            : this.extractLogicalFlagFromText(ele, 'hasSim');

        if (!hasGen && !hasSim) {
            const domainText = `${ele.data('rawLabel') || ''}\n${ele.data('detailLabel') || ''}`;
            if (/domain\s*:\s*GEN/i.test(domainText)) hasGen = true;
            if (/domain\s*:\s*SIM/i.test(domainText)) hasSim = true;
        }

        return { hasGen, hasSim };
    },

    isLogicalGenSimNode(ele) {
        if (!this.isLogicalGraph()) return false;

        const logicalFlags = this.getLogicalFlags(ele);
        return logicalFlags.hasGen && logicalFlags.hasSim;
    },

    isLogicalVertex(ele) {
        const shape = String(ele.data('shape') || '').trim();
        return shape === 'diamond' || /^v\d+$/.test(ele.id());
    },

    hasCrossedBoundary(ele) {
        const value = ele.data('crossedBoundary');
        return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
    },

    getNodeFillColor(ele) {
        const type = this.getNodeKind(ele);
        if (type.startsWith('GenSim')) return this.nodeTypeColors.gen;
        if (type === 'GenEvent') return this.nodeTypeColors.event;
        if (type.startsWith('Gen')) return this.nodeTypeColors.gen;
        if (type.startsWith('Sim')) return this.nodeTypeColors.sim;

        const fillcolor = ele.data('fillcolor');
        if (fillcolor === 'green') return '#2ecc71';
        if (fillcolor === 'lightgrey') return '#d3d3d3';
        return '#3498db';
    },

    getNodeShape(ele) {
        const type = this.getNodeKind(ele);
        if (type === 'GenEvent') return 'star';
        if (type === 'GenVertex' || type === 'SimVertex' || type === 'GenSimVertex' || type === 'LogicalVertex') return 'diamond';
        if (type === 'GenParticle' || type === 'SimTrack' || type === 'GenSimParticle' || type === 'LogicalParticle') return 'rectangle';

        const shape = ele.data('shape');
        if (shape === 'diamond') return 'diamond';
        if (shape === 'box') return 'rectangle';
        return 'rectangle';
    },

    getNodeSize(ele) {
        const type = this.getNodeKind(ele);
        if (type === 'GenEvent') return 88;
        if (type === 'GenVertex' || type === 'SimVertex' || type === 'GenSimVertex' || type === 'LogicalVertex') return 52;
        if (type === 'GenParticle' || type === 'SimTrack' || type === 'GenSimParticle' || type === 'LogicalParticle') return 74;
        return 'label';
    },

    getNodeBorderColor(ele) {
        if (this.hasCrossedBoundary(ele)) return '#e804ec';
        if (this.isLogicalGenSimNode(ele)) return this.nodeTypeColors.sim;
        if (this.isLogicalGraph()) return '#34495e';

        const color = ele.data('color');
        return color || '#34495e';
    },

    getNodeBorderWidth(ele) {
        if (this.isLogicalGenSimNode(ele)) return 5;
        return this.hasCrossedBoundary(ele) ? 5 : 2;
    },

    /**
     * Initialize Cytoscape graph with data
     */
    init(data) {
        console.log('Initializing graph with', data.nodes.length, 'nodes and', data.edges.length, 'edges');
        this.graphName = data.metadata?.graph_name || data.graph_name || '';

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
                            return GraphManager.getNodeFillColor(ele);
                        },
                        'border-width': function(ele) {
                            return GraphManager.getNodeBorderWidth(ele);
                        },
                        'border-color': function(ele) {
                            return GraphManager.getNodeBorderColor(ele);
                        },
                        'shape': function(ele) {
                            return GraphManager.getNodeShape(ele);
                        },
                        'width': function(ele) {
                            return GraphManager.getNodeSize(ele);
                        },
                        'height': function(ele) {
                            return GraphManager.getNodeSize(ele);
                        },
                        'border-style': function(ele) {
                            return GraphManager.hasCrossedBoundary(ele) || GraphManager.isLogicalGenSimNode(ele) ? 'double' : 'solid';
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
                {
                    selector: 'node.gen-event-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'node.sim-vertex-key0-filtered',
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
                {
                    selector: 'edge.gen-event-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'edge.sim-vertex-key0-filtered',
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
                },
                // Highlighted edge
                {
                    selector: 'edge.highlighted',
                    style: {
                        'width': 3,
                        'line-color': '#e74c3c',
                        'target-arrow-color': '#e74c3c',
                        'arrow-scale': 1.6,
                        'z-index': 9997
                    }
                },
                // Selected edge
                {
                    selector: 'edge.selected',
                    style: {
                        'width': 3,
                        'line-color': '#f39c12',
                        'target-arrow-color': '#f39c12',
                        'arrow-scale': 1.6,
                        'z-index': 9996
                    }
                }
            ],

            layout: this.getLayoutConfig(),

            minZoom: 0.02,
            maxZoom: 3,
            wheelSensitivity: 0.2
        });

        // Store full graph for reset
        this.fullGraph = this.cy.elements().clone();

        // Event handlers
        this.setupEventHandlers();
        this.setupViewOptions();

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
        // Node click - open panel and select the node
        this.cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            const nodeId = node.id();
            const label = node.data('label');

            console.log('Node clicked:', label);
            PanelManager.open(label, nodeId);
        });

        // Edge click - jump to the endpoint furthest from the current view center.
        this.cy.on('tap', 'edge', (evt) => {
            const edge = evt.target;
            const destination = this.getFurthestEdgeEndpoint(edge);

            if (destination) {
                this.focusNode(destination);
            }
        });

        this.cy.on('mouseover', 'edge', () => {
            this.cy.container().style.cursor = 'pointer';
        });

        this.cy.on('mouseout', 'edge', () => {
            this.cy.container().style.cursor = '';
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
     * Setup graph-level view option controls.
     */
    setupViewOptions() {
        const hideGenEventCheckbox = document.getElementById('hide-gen-event-checkbox');
        if (hideGenEventCheckbox) {
            hideGenEventCheckbox.checked = this.hideGenEventNodes;
            hideGenEventCheckbox.addEventListener('change', () => {
                this.setHideGenEventNodes(hideGenEventCheckbox.checked);
            });
        }

        const hideSimVertexKey0Checkbox = document.getElementById('hide-simvertex-key0-checkbox');
        if (hideSimVertexKey0Checkbox) {
            hideSimVertexKey0Checkbox.checked = this.hideSimVertexKey0Node;
            hideSimVertexKey0Checkbox.addEventListener('change', () => {
                this.setHideSimVertexKey0Node(hideSimVertexKey0Checkbox.checked);
            });
        }
    },

    /**
     * Toggle nodes whose DOT label contains GenEvent.
     */
    setHideGenEventNodes(shouldHide) {
        this.hideGenEventNodes = shouldHide;
        this.applyGenEventFilter();
        this.relayoutVisible();
    },

    /**
     * Apply the GenEvent view filter without disturbing focus/dependency filters.
     */
    applyGenEventFilter() {
        this.cy.nodes().removeClass('gen-event-filtered');
        this.cy.edges().removeClass('gen-event-filtered');

        if (!this.hideGenEventNodes) {
            return;
        }

        const genEventNodes = this.cy.nodes().filter(node => this.isGenEventNode(node));
        genEventNodes.addClass('gen-event-filtered');
        genEventNodes.connectedEdges().addClass('gen-event-filtered');
    },

    /**
     * The source DOT label is stored as rawLabel; fall back to label for older bundles.
     */
    isGenEventNode(node) {
        const labelAttribute = node.data('rawLabel') || node.data('label') || '';
        return String(labelAttribute).includes('GenEvent');
    },

    /**
     * Hide the SimVertex whose source label contains key=0.
     */
    setHideSimVertexKey0Node(shouldHide) {
        this.hideSimVertexKey0Node = shouldHide;
        this.applySimVertexKey0Filter();
        this.relayoutVisible();
    },

    /**
     * Apply the SimVertex key=0 view filter without disturbing focus/dependency filters.
     */
    applySimVertexKey0Filter() {
        this.cy.nodes().removeClass('sim-vertex-key0-filtered');
        this.cy.edges().removeClass('sim-vertex-key0-filtered');

        if (!this.hideSimVertexKey0Node) {
            return;
        }

        const simVertexKey0Nodes = this.cy.nodes().filter(node => this.isSimVertexKey0Node(node));
        simVertexKey0Nodes.addClass('sim-vertex-key0-filtered');
        simVertexKey0Nodes.connectedEdges().addClass('sim-vertex-key0-filtered');
    },

    /**
     * The source DOT label is stored as rawLabel; fall back to label for older bundles.
     */
    isSimVertexKey0Node(node) {
        const labelAttribute = node.data('rawLabel') || node.data('label') || '';
        const label = String(labelAttribute);
        return label.includes('SimVertex') && /\bkey=0\b/.test(label);
    },

    /**
     * Highlight a specific node
     */
    highlightNode(nodeId) {
        this.clearHighlight();
        const node = this.cy.getElementById(nodeId);
        if (node.length > 0) {
            node.addClass('highlighted');
            node.connectedEdges().addClass('highlighted');
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
     * Select and center the graph on a node.
     */
    focusNode(node) {
        this.applySelection(node);

        this.cy.animate({
            center: { eles: node },
            zoom: this.cy.zoom()
        }, {
            duration: 300
        });
    },

    /**
     * Mark a node and its connected arrows as selected.
     */
    applySelection(node) {
        this.cy.nodes().removeClass('selected');
        this.cy.edges().removeClass('selected');
        node.addClass('selected');
        node.connectedEdges().addClass('selected');
        KeyboardNav.selectedNode = node;
    },

    /**
     * Return the endpoint of an edge that is furthest from the current viewport center.
     */
    getFurthestEdgeEndpoint(edge) {
        const source = edge.source();
        const target = edge.target();

        if (source.length === 0 || target.length === 0) {
            return null;
        }

        const center = this.getViewportCenter();
        const sourceDistance = this.distanceBetween(center, source.position());
        const targetDistance = this.distanceBetween(center, target.position());

        return sourceDistance > targetDistance ? source : target;
    },

    /**
     * Current visible viewport center in graph coordinates.
     */
    getViewportCenter() {
        const extent = this.cy.extent();

        return {
            x: (extent.x1 + extent.x2) / 2,
            y: (extent.y1 + extent.y2) / 2
        };
    },

    /**
     * Calculate distance between two graph positions.
     */
    distanceBetween(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
     * Clear all highlights
     */
    clearHighlight() {
        this.cy.nodes().removeClass('highlighted dimmed');
        this.cy.edges().removeClass('highlighted dimmed');
    },

    /**
     * Clear selection
     */
    clearSelection() {
        this.cy.nodes().removeClass('selected');
        this.cy.edges().removeClass('selected');
        KeyboardNav.selectedNode = null;
    },

    /**
     * Reset graph to full view
     */
    reset() {
        this.cy.nodes().removeClass('highlighted dimmed selected hidden');
        this.cy.edges().removeClass('highlighted dimmed selected hidden');
        this.applyGenEventFilter();
        this.applySimVertexKey0Filter();
        this.fitVisible();
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
        this.fitVisible();
    },

    /**
     * Recompute layout using only nodes still visible after all active filters.
     */
    relayoutVisible() {
        const visibleNodes = this.getVisibleNodes();

        if (visibleNodes.length === 0) {
            this.cy.fit();
            return;
        }

        const visibleEdges = this.cy.edges().filter(edge => {
            return this.isEdgeVisibleForLayout(edge);
        });

        const layout = visibleNodes.union(visibleEdges).layout(this.getLayoutConfig());
        layout.one('layoutstop', () => this.fitVisible());
        layout.run();
    },

    /**
     * Nodes still visible after all active filters.
     */
    getVisibleNodes() {
        return this.cy.nodes().filter(node => this.isNodeVisibleForLayout(node));
    },

    isNodeVisibleForLayout(node) {
        return !node.hasClass('hidden')
            && !node.hasClass('gen-event-filtered')
            && !node.hasClass('sim-vertex-key0-filtered');
    },

    isEdgeVisibleForLayout(edge) {
        return !edge.hasClass('hidden')
            && !edge.hasClass('gen-event-filtered')
            && !edge.hasClass('sim-vertex-key0-filtered')
            && this.isNodeVisibleForLayout(edge.source())
            && this.isNodeVisibleForLayout(edge.target());
    },

    /**
     * Fit to nodes still visible after all active filters.
     */
    fitVisible() {
        const visibleNodes = this.getVisibleNodes();

        if (visibleNodes.length > 0) {
            this.cy.fit(visibleNodes);
        } else {
            this.cy.fit();
        }
    }
};
