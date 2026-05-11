/**
 * panel.js - Side panel with module details
 * Handles panel display, navigation, and resizing
 */

const PanelManager = {
    panel: null,
    history: [],
    currentModule: null,
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
     * Open panel with module details
     */
    open(moduleName, nodeId) {
        this.currentModule = moduleName;

        // Add to history if different from current
        if (this.history.length === 0 || this.history[this.history.length - 1] !== moduleName) {
            this.history.push(moduleName);
        }

        // Get module data
        const moduleData = window.bundleData.modules?.[moduleName];

        if (!moduleData) {
            const nodeData = GraphManager.getBundleNode(nodeId);
            if (nodeData) {
                this.displayNode(nodeData);
                this.updateBreadcrumbs();
                this.panel.classList.remove('hidden');

                if (nodeId) {
                    GraphManager.highlightNode(nodeId);
                }
                return;
            }

            this.displayError(moduleName);
        } else {
            // Display module info
            this.displayModule(moduleName, moduleData, nodeId);

            // Update breadcrumbs
            this.updateBreadcrumbs();

            // Show panel
            this.panel.classList.remove('hidden');

            // Highlight node in graph
            if (nodeId) {
                GraphManager.highlightNode(nodeId);
            }
        }
    },

    /**
     * Display module information
     */
    displayModule(moduleName, moduleData, nodeId) {
        // Basic info
        document.getElementById('module-name').textContent = moduleName;
        document.getElementById('module-type').textContent = moduleData.type || 'N/A';
        document.getElementById('module-plugin').textContent = moduleData.plugin || 'N/A';

        // Input tags
        this.displayInputTags(moduleData.inputTags || []);

        // Parameters
        this.displayParameters(moduleData.parameters || {}, moduleData.inputTags || []);

        // Raw snippet
        document.getElementById('raw-snippet').textContent = moduleData.rawSnippet || 'No configuration available';
    },

    /**
     * Display generic DOT node information.
     */
    displayNode(nodeData) {
        const title = (nodeData.detailLabel || nodeData.label || nodeData.id).split('\n')[0];
        document.getElementById('module-name').textContent = title;
        document.getElementById('module-type').textContent = nodeData.shape || 'DOT node';
        document.getElementById('module-plugin').textContent = nodeData.id;

        document.getElementById('input-tags-list').innerHTML = '<div class="empty-state">No CMSSW input tags for this graph</div>';

        const ignoredKeys = new Set(['id', 'label', 'displayLabel', 'detailLabel', 'rawLabel']);
        const parameters = {};

        Object.keys(nodeData).forEach(key => {
            if (!ignoredKeys.has(key) && nodeData[key] !== undefined && nodeData[key] !== null) {
                parameters[key] = {
                    type: 'DOT attribute',
                    value: String(nodeData[key])
                };
            }
        });

        this.displayParameters(parameters, []);

        const rawLines = [];
        if (nodeData.rawLabel) {
            rawLines.push('raw label:');
            rawLines.push(nodeData.rawLabel);
            rawLines.push('');
        }

        rawLines.push('display label:');
        rawLines.push(nodeData.detailLabel || nodeData.label || nodeData.id);

        document.getElementById('raw-snippet').textContent = rawLines.join('\n');
    },

    /**
     * Display input tags with VInputTag grouping
     */
    displayInputTags(inputTags) {
        const container = document.getElementById('input-tags-list');
        container.innerHTML = '';

        if (inputTags.length === 0) {
            container.innerHTML = '<div class="empty-state">No input tags found</div>';
            return;
        }

        // Group VInputTags by field name
        const grouped = {};
        const singles = [];

        inputTags.forEach(tag => {
            if (tag.type === 'VInputTag' || tag.type === 'ESInputTag') {
                if (!grouped[tag.field]) {
                    grouped[tag.field] = [];
                }
                grouped[tag.field].push(tag);
            } else {
                singles.push(tag);
            }
        });

        // Display VInputTag groups
        Object.keys(grouped).forEach(field => {
            const group = grouped[field];
            const groupDiv = document.createElement('div');
            groupDiv.className = 'vinput-tag-group';

            const header = document.createElement('div');
            header.className = 'vinput-tag-header';
            header.textContent = field;

            const typeSpan = document.createElement('span');
            typeSpan.className = 'tag-type';
            typeSpan.textContent = group[0].type;
            header.appendChild(typeSpan);

            groupDiv.appendChild(header);

            group.forEach((tag, idx) => {
                const item = this.createInputTagItem(tag, `${field}[${idx}]`, true);
                groupDiv.appendChild(item);
            });

            container.appendChild(groupDiv);
        });

        // Display single InputTags
        singles.forEach(tag => {
            const item = this.createInputTagItem(tag, tag.field, false);
            container.appendChild(item);
        });
    },

    /**
     * Create input tag item element
     */
    createInputTagItem(tag, displayField, isGrouped) {
        const div = document.createElement('div');
        div.className = 'input-tag-item';
        if (isGrouped) {
            div.className += ' vinput-item';
        }

        if (tag.found) {
            div.className += ' clickable';
            div.onclick = () => {
                this.navigateToModule(tag.module);
            };
        } else {
            div.className += ' not-found';
        }

        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'input-tag-field';
        fieldDiv.textContent = displayField;

        if (!isGrouped && tag.type) {
            const typeSpan = document.createElement('span');
            typeSpan.className = 'tag-type';
            typeSpan.textContent = tag.type;
            fieldDiv.appendChild(typeSpan);
        }

        const valueDiv = document.createElement('div');
        valueDiv.className = 'input-tag-value';
        valueDiv.textContent = Utils.formatInputTag(tag);

        div.appendChild(fieldDiv);
        div.appendChild(valueDiv);

        if (!tag.found) {
            const statusDiv = document.createElement('div');
            statusDiv.className = 'input-tag-status not-found';
            statusDiv.textContent = 'Module not found in graph';
            div.appendChild(statusDiv);
        }

        return div;
    },

    /**
     * Display parameters
     */
    displayParameters(parameters, inputTags) {
        const container = document.getElementById('parameters-list');
        container.innerHTML = '';

        // Filter out InputTag parameters (already shown above)
        const inputTagFields = new Set(inputTags.map(t => t.field));
        const otherParams = Object.keys(parameters).filter(key => !inputTagFields.has(key));

        if (otherParams.length === 0) {
            container.innerHTML = '<div class="empty-state">No additional parameters</div>';
            return;
        }

        otherParams.forEach(key => {
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
    displayError(moduleName) {
        document.getElementById('module-name').textContent = moduleName;
        document.getElementById('module-type').textContent = 'N/A';
        document.getElementById('module-plugin').textContent = 'N/A';
        document.getElementById('input-tags-list').innerHTML = '<div class="empty-state">Module data not available</div>';
        document.getElementById('parameters-list').innerHTML = '<div class="empty-state">No parameters</div>';
        document.getElementById('raw-snippet').textContent = 'No configuration available';

        this.panel.classList.remove('hidden');
    },

    /**
     * Navigate to a different module
     */
    navigateToModule(moduleName) {
        console.log('Navigating to module:', moduleName);

        // Find node in graph
        const nodes = GraphManager.getNodeByLabel(moduleName);

        if (nodes.length > 0) {
            const nodeId = nodes[0].id();
            this.open(moduleName, nodeId);
        } else {
            console.warn('Module not found in graph:', moduleName);
        }
    },

    /**
     * Update breadcrumbs
     */
    updateBreadcrumbs() {
        const container = document.getElementById('breadcrumbs');
        container.innerHTML = '';

        this.history.forEach((moduleName, index) => {
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

            crumb.textContent = moduleName;

            if (index < this.history.length - 1) {
                crumb.onclick = () => {
                    // Truncate history and navigate back
                    this.history = this.history.slice(0, index + 1);
                    this.navigateToModule(moduleName);
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
        this.currentModule = null;
    }
};
