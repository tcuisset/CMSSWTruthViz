/**
 * plot3d.js - Plotly panel for selected-node direct rechits.
 */

// The CMS envelope drawn behind the hits, in cm: radius of the muon system and half length
// of the detector. The axis ranges are fixed to it, so the view keeps its scale from node
// to node and the user zooms in or out instead.
const CMS_RADIUS_CM = 750;
const CMS_HALF_LENGTH_CM = 1300;

// Subdetector envelopes drawn as transparent cylinders in the colour of their hits, cm,
// Phase-2 layout: [name, radius, z from, z to, detector whose colour to use]. A pair of
// entries with mirrored z draws both endcaps.
const SUBDETECTOR_ENVELOPES = [
    ['tracker', 112, -270, 270, 'Tracker'],
    ['ECAL barrel', 152, -300, 300, 'ECAL barrel'],
    ['HCAL barrel', 287, -430, 430, 'HCAL barrel'],
    ['HGCAL CE-E', 260, 320, 364, 'HGCAL EE'],
    ['HGCAL CE-E', 260, -364, -320, 'HGCAL EE'],
    ['HGCAL CE-H', 260, 364, 520, 'HGCAL HSi'],
    ['HGCAL CE-H', 260, -520, -364, 'HGCAL HSi'],
    ['HF', 130, 1110, 1265, 'HF'],
    ['HF', 130, -1265, -1110, 'HF']
];

// One colour and one marker per subdetector, so hits from different detectors tell apart.
const DETECTOR_STYLE = {
    'HGCAL EE': { color: '#1f77b4', symbol: 'circle' },
    'HGCAL HSi': { color: '#17becf', symbol: 'diamond' },
    'HGCAL HSc': { color: '#2ca02c', symbol: 'square' },
    'ECAL barrel': { color: '#ff7f0e', symbol: 'circle-open' },
    'ECAL endcap': { color: '#ffbb78', symbol: 'circle-open' },
    'ES': { color: '#c49c94', symbol: 'cross' },
    'HCAL barrel': { color: '#d62728', symbol: 'square-open' },
    'HCAL endcap': { color: '#e377c2', symbol: 'square-open' },
    'HO': { color: '#8c564b', symbol: 'cross' },
    'HF': { color: '#9467bd', symbol: 'x' },
    'Tracker': { color: '#7f7f7f', symbol: 'diamond-open' },
    'Muon': { color: '#bcbd22', symbol: 'cross' },
    'other': { color: '#555555', symbol: 'circle' }
};

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

        const traces = [this.envelopeTrace(), this.beamLineTrace(), ...this.subdetectorTraces(), ...this.hitTraces(rechits)];

        const halfWidth = CMS_RADIUS_CM * 1.07;
        const halfLength = CMS_HALF_LENGTH_CM * 1.05;
        const layout = {
            margin: { l: 0, r: 0, t: 0, b: 0 },
            paper_bgcolor: '#ffffff',
            scene: {
                xaxis: { title: 'x [cm]', range: [-halfWidth, halfWidth] },
                yaxis: { title: 'y [cm]', range: [-halfWidth, halfWidth] },
                zaxis: { title: 'z [cm]', range: [-halfLength, halfLength] },
                // Fixed ranges and a manual aspect ratio keep the geometry undistorted and the
                // scale the same for every node; the camera looks from the side, so the beam
                // axis z runs horizontally and y points up.
                aspectmode: 'manual',
                aspectratio: { x: 1, y: 1, z: halfLength / halfWidth },
                camera: {
                    up: { x: 0, y: 1, z: 0 },
                    eye: { x: 2.0, y: 0.6, z: 0.0 },
                    center: { x: 0, y: 0, z: 0 }
                },
                dragmode: 'orbit'
            },
            legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: 0.02 },
            showlegend: true,
            // Keep the camera the user set when another node is selected.
            uirevision: 'hits'
        };

        Plotly.react(this.plot, traces, layout, {
            responsive: true,
            displaylogo: false
        });
    },

    hitTraces(rechits) {
        const groups = new Map();
        rechits.forEach(rechit => {
            const detector = rechit.detector || this.detectorOf(rechit.ID);
            if (!groups.has(detector)) {
                groups.set(detector, []);
            }
            groups.get(detector).push(rechit);
        });

        return Array.from(groups.entries()).map(([detector, hits]) => {
            const style = DETECTOR_STYLE[detector] || DETECTOR_STYLE.other;
            return {
                type: 'scatter3d',
                mode: 'markers',
                name: `${detector} (${hits.length})`,
                x: hits.map(hit => hit.x),
                y: hits.map(hit => hit.y),
                z: hits.map(hit => hit.z),
                text: hits.map(hit => `ID ${hit.ID}, E ${Number(hit.energy).toPrecision(3)} GeV`),
                hovertemplate: `%{text}<br>x=%{x:.1f} y=%{y:.1f} z=%{z:.1f} cm<extra>${detector}</extra>`,
                marker: {
                    size: 3,
                    color: style.color,
                    symbol: style.symbol,
                    opacity: 0.9
                }
            };
        });
    },

    // An open cylinder of radius r between zFrom and zTo, as one transparent surface.
    cylinderTrace(name, radius, zFrom, zTo, color, opacity, showlegend) {
        const steps = 48;
        const x = [];
        const y = [];
        const z = [];
        [zFrom, zTo].forEach(zEnd => {
            const ringX = [];
            const ringY = [];
            const ringZ = [];
            for (let i = 0; i <= steps; i += 1) {
                const angle = (2 * Math.PI * i) / steps;
                ringX.push(radius * Math.cos(angle));
                ringY.push(radius * Math.sin(angle));
                ringZ.push(zEnd);
            }
            x.push(ringX);
            y.push(ringY);
            z.push(ringZ);
        });

        return {
            type: 'surface',
            name,
            legendgroup: name,
            x,
            y,
            z,
            opacity,
            showscale: false,
            showlegend,
            hoverinfo: 'skip',
            colorscale: [[0, color], [1, color]],
            contours: { x: { show: false }, y: { show: false }, z: { show: false } }
        };
    },

    envelopeTrace() {
        return this.cylinderTrace('CMS envelope', CMS_RADIUS_CM, -CMS_HALF_LENGTH_CM, CMS_HALF_LENGTH_CM, '#0033a0', 0.05, false);
    },

    // The subdetector cylinders, one legend entry per name so a pair of endcaps toggles together.
    subdetectorTraces() {
        const seen = new Set();
        return SUBDETECTOR_ENVELOPES.map(([name, radius, zFrom, zTo, detector]) => {
            const color = (DETECTOR_STYLE[detector] || DETECTOR_STYLE.other).color;
            const first = !seen.has(name);
            seen.add(name);
            return this.cylinderTrace(name, radius, zFrom, zTo, color, 0.12, first);
        });
    },

    beamLineTrace() {
        return {
            type: 'scatter3d',
            mode: 'lines',
            name: 'beam axis',
            x: [0, 0],
            y: [0, 0],
            z: [-CMS_HALF_LENGTH_CM, CMS_HALF_LENGTH_CM],
            line: { color: '#888888', width: 2, dash: 'dash' },
            hoverinfo: 'skip',
            showlegend: false
        };
    },

    // The subdetector of a CMS DetId from its det and subdet fields, for rechit files
    // written before the preprocessing recorded it.
    detectorOf(id) {
        const value = Number(id);
        if (!Number.isFinite(value)) {
            return 'other';
        }
        const det = Math.floor(value / 2 ** 28) & 0xF;
        const subdet = Math.floor(value / 2 ** 25) & 0x7;
        if (det === 3) {
            return { 1: 'ECAL barrel', 2: 'ECAL endcap', 3: 'ES' }[subdet] || 'ECAL barrel';
        }
        if (det === 4) {
            return { 1: 'HCAL barrel', 2: 'HCAL endcap', 3: 'HO', 4: 'HF' }[subdet] || 'HCAL barrel';
        }
        return { 1: 'Tracker', 2: 'Muon', 8: 'HGCAL EE', 9: 'HGCAL HSi', 10: 'HGCAL HSc' }[det] || 'other';
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
                // Match edges lead to reco objects, which carry no hits of their own.
                if (edge.data('isPartonShowerBypass') || edge.data('isMatchEdge')) {
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
                energy: Number(rechit.energy),
                detector: rechit.detector || this.detectorOf(rechit.ID ?? rechit.id)
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
