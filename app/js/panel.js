/**
 * panel.js - Side panel with DOT node details
 * Handles panel display, navigation, and resizing
 */

const PanelManager = {
    panel: null,
    history: [],
    currentNode: null,
    isResizing: false,
    startX: 0,
    startWidth: 0,

    /**
     * Initialize panel
     */
    init() {
        this.panel = document.getElementById('side-panel');
        this.setupResizing();
        this.setupCloseButton();
        this.loadPanelWidth();
    },

    /**
     * Setup panel resizing
     */
    setupResizing() {
        const handle = document.getElementById('panel-resize-handle');

        handle.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            this.startX = e.clientX;
            this.startWidth = this.panel.offsetWidth;
            this.panel.classList.add('resizing');
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isResizing) return;

            const deltaX = this.startX - e.clientX;
            const newWidth = this.startWidth + deltaX;

            // Respect min and max width
            const minWidth = 300;
            const maxWidth = window.innerWidth * 0.8;

            if (newWidth >= minWidth && newWidth <= maxWidth) {
                this.panel.style.width = newWidth + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isResizing) {
                this.isResizing = false;
                this.panel.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                this.savePanelWidth();
            }
        });
    },

    /**
     * Setup close button
     */
    setupCloseButton() {
        document.getElementById('panel-close-btn').addEventListener('click', () => {
            this.close();
        });
    },

    /**
     * Save panel width to localStorage
     */
    savePanelWidth() {
        localStorage.setItem('panelWidth', this.panel.offsetWidth);
    },

    /**
     * Load panel width from localStorage
     */
    loadPanelWidth() {
        const savedWidth = localStorage.getItem('panelWidth');
        if (savedWidth) {
            this.panel.style.width = savedWidth + 'px';
        }
    },

    /**
     * Open panel with node details
     */
    open(nodeName, nodeId) {
        this.currentNode = nodeId || nodeName;

        // Add to history if different from current
        if (this.history.length === 0 || this.history[this.history.length - 1] !== nodeName) {
            this.history.push(nodeName);
        }

        const nodeData = GraphManager.getBundleNode(nodeId);
        if (nodeData) {
            this.displayNode(nodeData);
            this.updateBreadcrumbs();
            this.panel.classList.remove('hidden');

            Plot3DPanelManager.updateForNode(nodeData.id);

            if (nodeId) {
                GraphManager.highlightNode(nodeId);
            }
            return;
        }

        this.displayError(nodeName);
    },

    /**
     * Display generic DOT node information.
     */
    displayNode(nodeData) {
        const title = (nodeData.detailLabel || nodeData.label || nodeData.id).split('\n')[0];
        document.getElementById('node-name').textContent = title;
        document.getElementById('node-id').textContent = nodeData.id;
        document.getElementById('node-particle-name').innerHTML = this.getParticleNiceName(nodeData);
        document.getElementById('node-pdg-id').textContent = this.formatValue(this.getPdgId(nodeData));
        document.getElementById('node-energy').textContent = this.formatEnergy(this.getEnergy(nodeData));
        document.getElementById('node-momentum').textContent = this.formatMomentum(this.getMomentum(nodeData));

        const ignoredKeys = new Set(['id', 'label', 'displayLabel', 'detailLabel', 'rawLabel']);
        const parameters = {};

        Object.keys(nodeData).forEach(key => {
            if (!ignoredKeys.has(key) && nodeData[key] !== undefined && nodeData[key] !== null) {
                parameters[key] = {
                    type: 'attribute',
                    value: String(nodeData[key])
                };
            }
        });

        this.displayParameters(parameters);
        this.displayConnectedNodes(nodeData.id);

        this.displayRawDotLabel(nodeData);
    },

    /**
     * Render incoming and outgoing direct neighbors for the selected node.
     */
    displayConnectedNodes(nodeId) {
        const node = GraphManager.cy?.getElementById(nodeId);
        if (!node || node.length === 0) {
            this.displayConnectedNodeList('connected-towards-list', []);
            this.displayConnectedNodeList('connected-away-list', []);
            return;
        }

        const towards = node.incomers('edge').map(edge => edge.source());
        const away = node.outgoers('edge').map(edge => edge.target());

        this.displayConnectedNodeList('connected-towards-list', this.uniqueNodes(towards), 'towards');
        this.displayConnectedNodeList('connected-away-list', this.uniqueNodes(away), 'away');
    },

    /**
     * Keep one row per node if parallel edges exist.
     */
    uniqueNodes(nodes) {
        const seen = new Set();
        return nodes.filter(node => {
            if (!node || node.length === 0 || seen.has(node.id())) {
                return false;
            }

            seen.add(node.id());
            return true;
        });
    },

    /**
     * Display one clickable direct-neighbor list.
     */
    displayConnectedNodeList(containerId, nodes, direction) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        if (nodes.length === 0) {
            container.innerHTML = '<div class="empty-state">No connected nodes</div>';
            return;
        }

        nodes.forEach(node => {
            const entry = document.createElement('div');
            entry.className = 'connected-node-entry';
            entry.appendChild(this.createConnectedNodeButton(node));

            const nextLevelNodes = this.getVertexNextLevelNodes(node, direction);
            if (nextLevelNodes.length > 0) {
                const sublist = document.createElement('div');
                sublist.className = 'connected-node-sublist';

                nextLevelNodes.forEach(nextNode => {
                    sublist.appendChild(this.createConnectedNodeButton(nextNode, true));
                });

                entry.appendChild(sublist);
            }

            container.appendChild(entry);
        });
    },

    /**
     * Build one clickable connected-node row.
     */
    createConnectedNodeButton(node, isNested = false) {
        const data = node.data();
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `connected-node-item${isNested ? ' nested' : ''}`;
        button.title = `Select ${data.id}`;
        button.addEventListener('click', () => {
            GraphManager.focusNode(node);
            this.open(data.label || data.id, data.id);
        });

        const fields = [
            ['ID', data.id],
            ['Kind', this.getNodeKindLabel(data)],
            ['Particle', this.getConnectedParticleName(data)],
            ['Energy', this.formatEnergy(this.getEnergy(data))]
        ];

        fields.forEach(([label, value]) => {
            const field = document.createElement('span');
            field.className = 'connected-node-field';

            const labelSpan = document.createElement('strong');
            labelSpan.textContent = label;

            const valueSpan = document.createElement('span');
            if (label === 'Particle') {
                valueSpan.innerHTML = value;
            } else {
                valueSpan.textContent = value;
            }

            field.appendChild(labelSpan);
            field.appendChild(valueSpan);
            button.appendChild(field);
        });

        return button;
    },

    /**
     * If a direct connected node is a vertex, show one more level in the same direction.
     */
    getVertexNextLevelNodes(node, direction) {
        if (!GraphManager.isLogicalVertex(node) && !this.getNodeKindLabel(node.data()).includes('vertex')) {
            return [];
        }

        const nextNodes = direction === 'towards'
            ? node.incomers('edge').map(edge => edge.source())
            : node.outgoers('edge').map(edge => edge.target());

        return this.uniqueNodes(nextNodes);
    },

    /**
     * Short display kind for panel neighbor rows.
     */
    getNodeKindLabel(data) {
        const ele = this.makeDataAccessor(data);
        const kind = GraphManager.getNodeKind(ele);
        const normalized = String(kind || '').toLowerCase();

        if (normalized.includes('event')) return 'gen';
        if (normalized.includes('particle') || normalized === 'simtrack') return 'particle';
        if (normalized.includes('vertex')) {
            if (normalized.includes('sim')) return 'sim-vertex';
            if (normalized.includes('gen')) return 'gen-vertex';
            return 'vertex';
        }

        return kind || 'node';
    },

    /**
     * Particle nice name from explicit attributes or the rendered DOT text.
     */
    getParticleNiceName(data) {
        const name = GraphManager.getParticleNameFromData(data);
        if (name && name !== '0') return name;

        const kind = this.getNodeKindLabel(data);
        return kind || 'N/A';
    },

    getConnectedParticleName(data) {
        const isParticle = GraphManager.isParticleNode(this.makeDataAccessor(data));
        if (!isParticle) {
            return 'N/A';
        }

        return this.getParticleNiceName(data);
    },

    getPdgId(data) {
        const particleId = data.pdgId ?? data.pdgid ?? data.pid;
        if (particleId !== undefined && particleId !== null) {
            return particleId;
        }

        if (data.pdg === undefined || data.pdg === null) {
            return null;
        }

        const isParticle = GraphManager.isParticleNode(this.makeDataAccessor(data));
        if (!isParticle && String(data.pdg) === '0') {
            return null;
        }

        return data.pdg;
    },

    getEnergy(data) {
        return GraphManager.getNodeEnergy(this.makeDataAccessor(data));
    },

    getMomentum(data) {
        return this.convertP4ToMomentum(data.p4);
    },

    makeDataAccessor(data) {
        return {
            id: () => data.id,
            data: key => data[key]
        };
    },

    formatValue(value) {
        if (value === undefined || value === null || value === '') {
            return 'N/A';
        }

        return String(value);
    },

    formatEnergy(value) {
        return Number.isFinite(value) ? value.toFixed(3) : 'N/A';
    },

    parseP4(value) {
        let parts;

        if (Array.isArray(value)) {
            parts = value;
        } else if (typeof value === 'string') {
            const cleaned = value.trim().replace(/^<|>$/g, '').trim();
            const tupleText = cleaned.startsWith('(') && cleaned.endsWith(')')
                ? cleaned.slice(1, -1)
                : cleaned;
            parts = tupleText.split(',').map(part => part.trim());
        } else {
            return null;
        }

        if (parts.length < 4) return null;

        const [px, py, pz, energy] = parts.slice(0, 4).map(Number.parseFloat);
        if (![px, py, pz, energy].every(Number.isFinite)) return null;

        return { px, py, pz, energy };
    },

    convertP4ToMomentum(value) {
        const p4 = this.parseP4(value);
        if (!p4) return null;

        const { px, py, pz, energy } = p4;
        const pt = Math.hypot(px, py);
        const phi = Math.atan2(py, px);
        const eta = pt === 0
            ? (pz === 0 ? 0 : Math.sign(pz) * Infinity)
            : Math.asinh(pz / pt);
        const massSquared = energy * energy - px * px - py * py - pz * pz;
        const mass = massSquared >= 0
            ? Math.sqrt(massSquared)
            : (Math.abs(massSquared) < 1e-9 ? 0 : NaN);

        return { pt, eta, phi, mass };
    },

    formatMomentum(momentum) {
        if (!momentum) return 'N/A';

        const formatComponent = value => {
            if (value === Infinity) return '+Infinity';
            if (value === -Infinity) return '-Infinity';
            return Number.isFinite(value) ? value.toFixed(3) : 'N/A';
        };

        return `(${formatComponent(momentum.pt)}, ${formatComponent(momentum.eta)}, ${formatComponent(momentum.phi)}, ${formatComponent(momentum.mass)})`;
    },

    /**
     * Render DOT HTML-like labels as actual HTML, with a text fallback.
     */
    displayRawDotLabel(nodeData) {
        const container = document.getElementById('raw-snippet');
        container.innerHTML = '';

        const htmlLabel = this.extractDotHtmlLabel(nodeData.rawLabel);
        if (htmlLabel) {
            const renderedLabel = document.createElement('div');
            renderedLabel.className = 'dot-html-label';
            renderedLabel.innerHTML = htmlLabel;
            container.appendChild(renderedLabel);
            return;
        }

        const fallback = document.createElement('pre');
        fallback.className = 'raw-label-text';
        fallback.textContent = nodeData.rawLabel || nodeData.detailLabel || nodeData.label || nodeData.id;
        container.appendChild(fallback);
    },

    /**
     * Graphviz HTML labels are stored with an outer <...> wrapper.
     */
    extractDotHtmlLabel(rawLabel) {
        if (!rawLabel) return null;

        const trimmed = rawLabel.trim();
        if (/^<\s*</.test(trimmed) && />\s*>$/.test(trimmed)) {
            return trimmed.slice(1, -1).trim();
        }

        if (/^<\s*[a-z][\s>]/i.test(trimmed)) {
            return trimmed;
        }

        return null;
    },

    /**
     * Display node attributes
     */
    displayParameters(parameters) {
        const container = document.getElementById('parameters-list');
        container.innerHTML = '';

        const attributeNames = Object.keys(parameters);
        if (attributeNames.length === 0) {
            container.innerHTML = '<div class="empty-state">No additional attributes</div>';
            return;
        }

        attributeNames.forEach(key => {
            const param = parameters[key];
            const div = document.createElement('div');
            div.className = 'parameter-item';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'parameter-name';
            nameSpan.textContent = key;

            if (param.type) {
                const typeSpan = document.createElement('span');
                typeSpan.className = 'parameter-type';
                typeSpan.textContent = param.type;
                nameSpan.appendChild(typeSpan);
            }

            const valueDiv = document.createElement('div');
            valueDiv.className = 'parameter-value';
            valueDiv.textContent = param.value || 'N/A';

            div.appendChild(nameSpan);
            div.appendChild(valueDiv);
            container.appendChild(div);
        });
    },

    /**
     * Display error message
     */
    displayError(nodeName) {
        document.getElementById('node-name').textContent = nodeName;
        document.getElementById('node-id').textContent = 'N/A';
        document.getElementById('node-particle-name').textContent = 'N/A';
        document.getElementById('node-pdg-id').textContent = 'N/A';
        document.getElementById('node-energy').textContent = 'N/A';
        document.getElementById('node-momentum').textContent = 'N/A';
        document.getElementById('connected-towards-list').innerHTML = '<div class="empty-state">No connected nodes</div>';
        document.getElementById('connected-away-list').innerHTML = '<div class="empty-state">No connected nodes</div>';
        document.getElementById('parameters-list').innerHTML = '<div class="empty-state">No attributes</div>';
        document.getElementById('raw-snippet').innerHTML = '<div class="empty-state">No DOT label available</div>';

        this.panel.classList.remove('hidden');
    },

    /**
     * Navigate to a different node by label
     */
    navigateToNode(nodeName) {
        console.log('Navigating to node:', nodeName);

        const nodes = GraphManager.getNodeByLabel(nodeName);

        if (nodes.length > 0) {
            const nodeId = nodes[0].id();
            this.open(nodeName, nodeId);
        } else {
            console.warn('Node not found in graph:', nodeName);
        }
    },

    /**
     * Update breadcrumbs
     */
    updateBreadcrumbs() {
        const container = document.getElementById('breadcrumbs');
        container.innerHTML = '';

        this.history.forEach((nodeName, index) => {
            if (index > 0) {
                const separator = document.createElement('span');
                separator.className = 'breadcrumb-separator';
                separator.textContent = '›';
                container.appendChild(separator);
            }

            const crumb = document.createElement('span');
            crumb.className = 'breadcrumb-item';

            if (index === this.history.length - 1) {
                crumb.className += ' current';
            }

            crumb.textContent = nodeName;

            if (index < this.history.length - 1) {
                crumb.onclick = () => {
                    // Truncate history and navigate back
                    this.history = this.history.slice(0, index + 1);
                    this.navigateToNode(nodeName);
                };
            }

            container.appendChild(crumb);
        });
    },

    /**
     * Close panel
     */
    close() {
        this.panel.classList.add('hidden');
        GraphManager.clearHighlight();
        this.history = [];
        this.currentNode = null;
    }
};
