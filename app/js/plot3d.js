/**
 * plot3d.js - Plotly panel for selected-node direct rechits.
 */

const Plot3DPanelManager = {
    panel: null,
    plot: null,
    emptyState: null,
    subtitle: null,
    modeButtons: [],
    closeBtn: null,
    bundleData: null,
    rechits: [],
    rechitById: new Map(),
    hasRealRechitsData: false,
    currentNodeId: null,
    mode: 'hidden',

    init(bundleData) {
        this.bundleData = bundleData || {};
        this.panel = document.getElementById('plot3d-panel');
        this.plot = document.getElementById('plot3d-container');
        this.emptyState = document.getElementById('plot3d-empty');
        this.subtitle = document.getElementById('plot3d-subtitle');
        this.modeButtons = Array.from(document.querySelectorAll('[data-plot3d-mode]'));
        this.closeBtn = document.getElementById('plot3d-close-btn');

        this.rechits = this.loadRechits();
        this.rechitById = new Map(this.rechits.map(rechit => [String(rechit.ID), rechit]));
        this.setupEventListeners();
        this.updateModeButtons();
    },

    setupEventListeners() {
        this.modeButtons.forEach(button => {
            button.addEventListener('click', () => this.setMode(button.dataset.plot3dMode));
        });

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.setMode('hidden'));
        }

        document.addEventListener('nodeSelected', event => {
            this.updateForNode(event.detail.nodeId);
        });

        document.addEventListener('nodeSelectionCleared', () => {
            this.currentNodeId = null;
            if (this.isVisible()) {
                this.showEmptyState(this.getSelectNodeMessage());
            }
        });

        window.addEventListener('resize', () => this.resizePlot());
    },

    setMode(mode) {
        if (!['hidden', 'direct', 'subgraph'].includes(mode)) {
            return;
        }

        this.mode = mode;
        this.updateModeButtons();

        if (this.isVisible()) {
            this.open();
        } else {
            this.close();
        }
    },

    isVisible() {
        return this.mode !== 'hidden';
    },

    open() {
        document.getElementById('main-content')?.classList.add('plot3d-visible');
        this.panel.classList.remove('hidden');
        this.resizeMainViews();

        if (this.currentNodeId) {
            this.renderForNode(this.currentNodeId);
        } else {
            this.showEmptyState(this.getSelectNodeMessage());
        }
    },

    close() {
        document.getElementById('main-content')?.classList.remove('plot3d-visible');
        this.panel.classList.add('hidden');
        this.resizeMainViews();
    },

    updateModeButtons() {
        this.modeButtons.forEach(button => {
            const isActive = button.dataset.plot3dMode === this.mode;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
    },

    updateForNode(nodeId) {
        this.currentNodeId = nodeId;

        if (this.isVisible()) {
            this.renderForNode(nodeId);
        }
    },

    renderForNode(nodeId) {
        if (typeof Plotly === 'undefined') {
            this.showEmptyState('Plotly.js is not available');
            return;
        }

        const nodeData = GraphManager.getBundleNode(nodeId);
        if (!nodeData) {
            this.showEmptyState('Selected node is not available in the bundle');
            return;
        }

        const hitIds = this.getSelectedHitIds(nodeData);
        const rechits = this.getRechitsForIds(hitIds, nodeData.id);
        const title = (nodeData.detailLabel || nodeData.displayLabel || nodeData.label || nodeData.id).split('\n')[0];
        const modeLabel = this.mode === 'subgraph' ? 'Subgraph hits' : 'Direct hits';
        document.querySelector('#plot3d-header h2').textContent = modeLabel;
        this.subtitle.textContent = `${title} (${rechits.length} hit${rechits.length === 1 ? '' : 's'})`;

        if (rechits.length === 0) {
            this.showEmptyState(`No ${this.mode === 'subgraph' ? 'subgraph' : 'direct'} rechits for this node`);
            return;
        }

        this.emptyState.classList.add('hidden');
        this.plot.classList.remove('hidden');

        const trace = {
            type: 'scatter3d',
            mode: 'markers',
            x: rechits.map(rechit => rechit.x),
            y: rechits.map(rechit => rechit.y),
            z: rechits.map(rechit => rechit.z),
            text: rechits.map(rechit => String(rechit.ID)),
            hovertemplate: 'ID %{text}<br>x=%{x:.3f}<br>y=%{y:.3f}<br>z=%{z:.3f}<extra></extra>',
            marker: {
                size: 4,
                color: '#e74c3c',
                opacity: 0.88
            }
        };

        const layout = {
            margin: { l: 0, r: 0, t: 0, b: 0 },
            paper_bgcolor: '#ffffff',
            scene: {
                xaxis: { title: 'x' },
                yaxis: { title: 'y' },
                zaxis: { title: 'z' },
                aspectmode: 'data'
            },
            showlegend: false
        };

        Plotly.react(this.plot, [trace], layout, {
            responsive: true,
            displaylogo: false
        });
    },

    getSelectedHitIds(nodeData) {
        if (this.mode === 'subgraph') {
            return this.getSubgraphHitIds(nodeData.id);
        }

        return this.normalizeIdList(nodeData.directHitsDetIds);
    },

    getRechitsForIds(hitIds, nodeId) {
        const selectedIds = hitIds.length > 0 || this.hasRealRechitsData
            ? hitIds
            : this.getPlaceholderHitIds(nodeId);

        return Array.from(new Set(selectedIds.map(id => String(id))))
            .map(id => this.rechitById.get(String(id)))
            .filter(Boolean)
            .filter(rechit => this.isFinitePoint(rechit));
    },

    getSubgraphHitIds(nodeId) {
        const startNode = GraphManager.cy?.getElementById(nodeId);
        if (!startNode || startNode.length === 0) {
            return [];
        }

        const hitIds = new Set();
        const visited = new Set([startNode.id()]);
        const stack = [startNode];

        while (stack.length > 0) {
            const node = stack.pop();
            const nodeData = GraphManager.getBundleNode(node.id()) || node.data();
            this.normalizeIdList(nodeData.directHitsDetIds).forEach(id => hitIds.add(String(id)));

            node.outgoers('edge').forEach(edge => {
                if (edge.data('isPartonShowerBypass')) {
                    return;
                }

                const child = edge.target();
                if (child.length === 0 || visited.has(child.id())) {
                    return;
                }

                visited.add(child.id());
                stack.push(child);
            });
        }

        return Array.from(hitIds);
    },

    normalizeIdList(value) {
        if (Array.isArray(value)) {
            return value.map(id => String(id));
        }

        if (value === undefined || value === null || value === '') {
            return [];
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return [];

            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map(id => String(id));
                }
            } catch (error) {
                // Fall through to delimiter parsing for DOT-style scalar strings.
            }

            return trimmed
                .replace(/^\[|\]$/g, '')
                .split(/[,\s]+/)
                .map(id => id.trim())
                .filter(Boolean);
        }

        return [String(value)];
    },

    loadRechits() {
        const sources = [
            this.bundleData.rechits,
            this.bundleData.rechitsData,
            this.bundleData.detectorRechits,
            this.bundleData.hitData?.rechits,
            window.RECHITS_DATA,
            window.rechitsData
        ];

        const source = sources.find(candidate => Array.isArray(candidate));
        if (source) {
            this.hasRealRechitsData = true;
            return source.map(rechit => ({
                ID: rechit.ID ?? rechit.id,
                x: Number(rechit.x),
                y: Number(rechit.y),
                z: Number(rechit.z),
                energy: Number(rechit.energy)
            }));
        }

        this.hasRealRechitsData = false;
        return this.buildPlaceholderRechits();
    },

    buildPlaceholderRechits() {
        const rechits = [];
        const layers = 12;
        const hitsPerLayer = 20;

        for (let layer = 0; layer < layers; layer += 1) {
            for (let index = 0; index < hitsPerLayer; index += 1) {
                const angle = (Math.PI * 2 * index) / hitsPerLayer + layer * 0.23;
                const radius = 35 + layer * 3.5 + (index % 5) * 1.4;
                rechits.push({
                    ID: `placeholder-${layer}-${index}`,
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius,
                    z: (layer - layers / 2) * 12,
                    energy: 0
                });
            }
        }

        return rechits;
    },

    getPlaceholderHitIds(nodeId) {
        if (this.rechits.length === 0) return [];

        const seed = Array.from(String(nodeId || 'node'))
            .reduce((sum, character) => sum + character.charCodeAt(0), 0);
        const count = Math.min(18, this.rechits.length);
        const ids = [];

        for (let offset = 0; offset < count; offset += 1) {
            const index = (seed + offset * 13) % this.rechits.length;
            ids.push(String(this.rechits[index].ID));
        }

        return ids;
    },

    isFinitePoint(rechit) {
        return Number.isFinite(rechit.x) && Number.isFinite(rechit.y) && Number.isFinite(rechit.z);
    },

    showEmptyState(message) {
        document.querySelector('#plot3d-header h2').textContent = this.mode === 'subgraph' ? 'Subgraph hits' : 'Direct hits';
        this.subtitle.textContent = message;
        this.emptyState.textContent = message;
        this.emptyState.classList.remove('hidden');
        this.plot.classList.add('hidden');

        if (this.plot && typeof Plotly !== 'undefined') {
            Plotly.purge(this.plot);
        }
    },

    resizeMainViews() {
        window.setTimeout(() => {
            GraphManager.cy?.resize();
            this.resizePlot();
        }, 0);
    },

    resizePlot() {
        if (this.isVisible() && this.plot && typeof Plotly !== 'undefined') {
            Plotly.Plots.resize(this.plot);
        }
    },

    getSelectNodeMessage() {
        return this.mode === 'subgraph'
            ? 'Select a node to view subgraph hits'
            : 'Select a node to view direct hits';
    }
};
