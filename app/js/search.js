/**
 * search.js - Search functionality
 * Handles node search and highlighting
 */

const SearchManager = {
    searchInput: null,
    searchBtn: null,
    clearBtn: null,

    /**
     * Initialize search functionality
     */
    init() {
        this.searchInput = document.getElementById('search-input');
        this.searchBtn = document.getElementById('search-btn');
        this.clearBtn = document.getElementById('search-clear-btn');

        this.setupEventListeners();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.searchBtn.addEventListener('click', () => this.search());
        this.clearBtn.addEventListener('click', () => this.clear());

        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.search();
            }
        });
    },

    /**
     * Perform search
     */
    search() {
        const query = this.searchInput.value.trim();

        if (!query) {
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
            alert(`No nodes found matching "${query}"`);
            return;
        }

        // Clear previous highlights
        GraphManager.clearHighlight();

        if (matches.length === 1) {
            // Single match: open panel and focus the matching node
            const node = matches[0];
            const label = node.data('label');
            const nodeId = node.id();

            node.addClass('highlighted');
            PanelManager.open(label, nodeId);
        } else {
            // Multiple matches: highlight all and fit view
            matches.addClass('highlighted');

            // Dim non-matching nodes
            GraphManager.cy.nodes().difference(matches).addClass('dimmed');
            GraphManager.cy.edges().addClass('dimmed');

            // Fit to highlighted nodes
            GraphManager.cy.animate({
                fit: { eles: matches, padding: 50 }
            }, {
                duration: 500
            });

            console.log(`Found ${matches.length} matching nodes`);
        }
    },

    /**
     * Clear search
     */
    clear() {
        this.searchInput.value = '';
        GraphManager.clearHighlight();
        GraphManager.fit();
    }
};
