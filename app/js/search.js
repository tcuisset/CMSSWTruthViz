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

        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (this.hasMultipleResults() && this.searchInput.value.trim() === this.lastQuery) {
                    this.showNextResult();
                } else {
                    this.search();
                }
            }
        });
    },

    /**
     * Perform search
     */
    search() {
        const query = this.searchInput.value.trim();

        if (!query) {
            this.clearSearchState();
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

        if (matches.length === 0) {
            this.clearSearchState();
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
        this.clearSearchState();
        GraphManager.clearHighlight();
        GraphManager.clearSelection();
        GraphManager.fit();
    }
};
