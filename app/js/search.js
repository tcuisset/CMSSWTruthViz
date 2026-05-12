/**
 * search.js - Search functionality
 * Handles node search and highlighting
 */

const SearchManager = {
    searchInput: null,
    searchBtn: null,
    clearBtn: null,
    prevBtn: null,
    nextBtn: null,
    resultCount: null,
    advancedToggleBtn: null,
    advancedPanel: null,
    advancedInput: null,
    advancedBtn: null,
    advancedStatus: null,
    matches: null,
    currentIndex: 0,
    lastQuery: '',

    /**
     * Initialize search functionality
     */
    init() {
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');
        this.clearBtn = document.getElementById('search-clear-btn');
        this.prevBtn = document.getElementById('search-prev-btn');
        this.nextBtn = document.getElementById('search-next-btn');
        this.resultCount = document.getElementById('search-result-count');
        this.advancedToggleBtn = document.getElementById('advanced-search-toggle-btn');
        this.advancedPanel = document.getElementById('advanced-search-panel');
        this.advancedInput = document.getElementById('advanced-search-input');
        this.advancedBtn = document.getElementById('advanced-search-btn');
        this.advancedStatus = document.getElementById('advanced-search-status');

        this.setupEventListeners();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.searchBtn.addEventListener('click', () => this.search());
        this.clearBtn.addEventListener('click', () => this.clear());
        this.prevBtn.addEventListener('click', () => this.showPreviousResult());
        this.nextBtn.addEventListener('click', () => this.showNextResult());
        this.advancedToggleBtn.addEventListener('click', () => this.toggleAdvancedPanel());
        this.advancedBtn.addEventListener('click', () => this.advancedSearch());

        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (this.hasMultipleResults() && this.searchInput.value.trim() === this.lastQuery) {
                    this.showNextResult();
                } else {
                    this.search();
                }
            }
        });

        this.advancedInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                this.advancedSearch();
            }
        });
    },

    /**
     * Perform search
     */
    search() {
        const query = this.searchInput.value.trim();

        if (!query) {
            this.clear();
            return;
        }

        console.log('Searching for:', query);

        // Find matching nodes (case-insensitive substring match)
        const matches = GraphManager.cy.nodes().filter(node => {
            const searchableText = [
                node.data('label'),
                node.data('displayLabel'),
                node.data('detailLabel'),
                node.data('rawLabel'),
                node.id()
            ].filter(Boolean).join('\n');

            return searchableText.toLowerCase().includes(query.toLowerCase());
        });

        this.showMatches(matches, query);
    },

    /**
     * Perform advanced attribute search.
     */
    advancedSearch() {
        const query = this.advancedInput.value.trim();
        this.setAdvancedStatus('');

        if (!query) {
            this.setAdvancedStatus('Enter one or more criteria.');
            return;
        }

        let criteria;
        try {
            criteria = this.parseAdvancedCriteria(query);
        } catch (error) {
            this.setAdvancedStatus(error.message, true);
            return;
        }

        const matches = GraphManager.cy.nodes().filter(node => {
            return criteria.every(criterion => this.matchesCriterion(node, criterion));
        });

        this.showMatches(matches, query);
        if (matches.length > 0) {
            this.setAdvancedStatus(`${matches.length} match${matches.length === 1 ? '' : 'es'}`);
        } else {
            this.setAdvancedStatus('No matches.', true);
        }
    },

    /**
     * Store and show matches using the shared search result UI.
     */
    showMatches(matches, query) {
        if (matches.length === 0) {
            this.clearSearchState();
            GraphManager.clearHighlight();
            GraphManager.clearSelection();
            alert(`No nodes found matching "${query}"`);
            return;
        }

        // Clear previous highlights
        GraphManager.clearHighlight();
        GraphManager.clearSelection();
        this.matches = matches;
        this.currentIndex = 0;
        this.lastQuery = query;

        if (matches.length === 1) {
            this.updateResultControls();

            // Single match: open panel and focus the matching node
            const node = matches[0];
            const label = node.data('label');
            const nodeId = node.id();

            node.addClass('highlighted');
            PanelManager.open(label, nodeId);
        } else {
            this.updateResultControls();
            this.showCurrentResult();
            console.log(`Found ${matches.length} matching nodes`);
        }
    },

    /**
     * Toggle advanced search controls.
     */
    toggleAdvancedPanel() {
        const isHidden = this.advancedPanel.classList.toggle('hidden');
        this.advancedToggleBtn.classList.toggle('active', !isHidden);
        this.advancedToggleBtn.setAttribute('aria-expanded', String(!isHidden));

        if (!isHidden) {
            this.advancedInput.focus();
        }
    },

    /**
     * Parse an AND-only advanced query into flat node attribute criteria.
     */
    parseAdvancedCriteria(query) {
        const parts = query
            .split(/\s*(?:&&|\bAND\b|[;\n])\s*/i)
            .map(part => part.trim())
            .filter(Boolean);

        if (parts.length === 0) {
            throw new Error('Enter one or more criteria.');
        }

        return parts.map(part => {
            const comparison = part.match(/^([A-Za-z_$][\w$.-]*)\s*(==|!=|>=|<=|>|<|~=|contains)\s*(.+)$/i);
            if (comparison) {
                return {
                    key: comparison[1],
                    operator: comparison[2].toLowerCase(),
                    value: this.parseCriterionValue(comparison[3])
                };
            }

            const bareFlag = part.match(/^!?[A-Za-z_$][\w$.-]*$/);
            if (bareFlag) {
                const negated = part.startsWith('!');
                return {
                    key: negated ? part.slice(1) : part,
                    operator: negated ? 'falsy' : 'truthy'
                };
            }

            throw new Error(`Could not parse criterion: ${part}`);
        });
    },

    /**
     * Normalize a literal from the query.
     */
    parseCriterionValue(value) {
        const trimmed = value.trim();
        const quoted = trimmed.match(/^(['"])(.*)\1$/);
        return quoted ? quoted[2] : trimmed;
    },

    /**
     * Evaluate one criterion against a Cytoscape node.
     */
    matchesCriterion(node, criterion) {
        const attrValue = this.getNodeAttribute(node, criterion.key);

        if (criterion.operator === 'truthy') {
            return this.isTruthy(attrValue);
        }

        if (criterion.operator === 'falsy') {
            return !this.isTruthy(attrValue);
        }

        if (attrValue === undefined) {
            return false;
        }

        if (criterion.operator === '~=' || criterion.operator === 'contains') {
            return String(attrValue).toLowerCase().includes(String(criterion.value).toLowerCase());
        }

        return this.compareValues(attrValue, criterion.operator, criterion.value);
    },

    /**
     * Read a flat or dotted node data attribute.
     */
    getNodeAttribute(node, key) {
        if (key === 'id') return node.id();

        const data = node.data();
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            return data[key];
        }

        return key.split('.').reduce((value, part) => {
            if (value === undefined || value === null) return undefined;
            return value[part];
        }, data);
    },

    /**
     * Compare attribute values with numeric and boolean normalization where possible.
     */
    compareValues(leftValue, operator, rightValue) {
        const leftNumber = Number(leftValue);
        const rightNumber = Number(rightValue);
        const bothNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);

        if (bothNumeric) {
            return this.comparePrimitives(leftNumber, operator, rightNumber);
        }

        const leftBoolean = this.parseBooleanLike(leftValue);
        const rightBoolean = this.parseBooleanLike(rightValue);
        if (leftBoolean !== null && rightBoolean !== null && (operator === '==' || operator === '!=')) {
            return operator === '==' ? leftBoolean === rightBoolean : leftBoolean !== rightBoolean;
        }

        const left = String(leftValue).toLowerCase();
        const right = String(rightValue).toLowerCase();
        return this.comparePrimitives(left, operator, right);
    },

    /**
     * Compare already normalized primitive values.
     */
    comparePrimitives(left, operator, right) {
        switch (operator) {
            case '==':
                return left === right;
            case '!=':
                return left !== right;
            case '>':
                return left > right;
            case '>=':
                return left >= right;
            case '<':
                return left < right;
            case '<=':
                return left <= right;
            default:
                return false;
        }
    },

    /**
     * Whether a value should count as a checked/bare flag.
     */
    isTruthy(value) {
        if (value === true || value === 1) return true;
        if (value === false || value === 0 || value === null || value === undefined) return false;

        const normalized = String(value).trim().toLowerCase();
        return normalized !== '' && normalized !== '0' && normalized !== 'false' && normalized !== 'no' && normalized !== 'none' && normalized !== '<none>';
    },

    /**
     * Parse graph-style boolean values.
     */
    parseBooleanLike(value) {
        if (value === true || value === 1) return true;
        if (value === false || value === 0) return false;

        const normalized = String(value).trim().toLowerCase();
        if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
        if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
        return null;
    },

    /**
     * Update advanced search status text.
     */
    setAdvancedStatus(message, isError = false) {
        this.advancedStatus.textContent = message;
        this.advancedStatus.classList.toggle('error', isError);
    },

    /**
     * Whether the current search has multiple navigable results.
     */
    hasMultipleResults() {
        return this.matches && this.matches.length > 1;
    },

    /**
     * Show the previous search result, wrapping around.
     */
    showPreviousResult() {
        if (!this.hasMultipleResults()) return;

        this.currentIndex = (this.currentIndex - 1 + this.matches.length) % this.matches.length;
        this.showCurrentResult();
    },

    /**
     * Show the next search result, wrapping around.
     */
    showNextResult() {
        if (!this.hasMultipleResults()) return;

        this.currentIndex = (this.currentIndex + 1) % this.matches.length;
        this.showCurrentResult();
    },

    /**
     * Center the current match while keeping all matches visible as highlights.
     */
    showCurrentResult() {
        const node = this.matches[this.currentIndex];
        if (!node || node.length === 0) return;

        this.applyMultipleResultHighlight(node);
        this.openResultPanel(node);
        this.updateResultControls();

        GraphManager.cy.animate({
            center: { eles: node },
            zoom: Math.max(GraphManager.cy.zoom(), 1.5)
        }, {
            duration: 350
        });
    },

    /**
     * Highlight every match and mark the current match as selected.
     */
    applyMultipleResultHighlight(currentNode) {
        GraphManager.clearHighlight();
        GraphManager.clearSelection();

        this.matches.addClass('highlighted');
        GraphManager.cy.nodes().difference(this.matches).addClass('dimmed');
        GraphManager.cy.edges().addClass('dimmed');
        GraphManager.applySelection(currentNode);
    },

    /**
     * Open details for a result without replacing the multi-result highlights.
     */
    openResultPanel(node) {
        const nodeId = node.id();
        const nodeData = GraphManager.getBundleNode(nodeId);

        if (!nodeData) {
            return;
        }

        const nodeName = node.data('label') || nodeId;
        PanelManager.currentNode = nodeId;

        if (PanelManager.history.length === 0 || PanelManager.history[PanelManager.history.length - 1] !== nodeName) {
            PanelManager.history.push(nodeName);
        }

        PanelManager.displayNode(nodeData);
        PanelManager.updateBreadcrumbs();
        PanelManager.panel.classList.remove('hidden');
    },

    /**
     * Update the result navigation controls.
     */
    updateResultControls() {
        const hasMultipleResults = this.hasMultipleResults();
        [this.prevBtn, this.nextBtn, this.resultCount].forEach(element => {
            element.classList.toggle('hidden', !hasMultipleResults);
        });

        if (hasMultipleResults) {
            this.resultCount.textContent = `${this.currentIndex + 1} / ${this.matches.length}`;
        } else {
            this.resultCount.textContent = '0 / 0';
        }
    },

    /**
     * Reset stored search navigation state.
     */
    clearSearchState() {
        this.matches = null;
        this.currentIndex = 0;
        this.lastQuery = '';
        this.updateResultControls();
    },

    /**
     * Clear search
     */
    clear() {
        this.searchInput.value = '';
        this.advancedInput.value = '';
        this.setAdvancedStatus('');
        this.clearSearchState();
        GraphManager.clearHighlight();
        GraphManager.clearSelection();
        GraphManager.fit();
    }
};
