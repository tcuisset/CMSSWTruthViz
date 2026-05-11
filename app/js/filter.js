/**
 * filter.js - Category filters
 * Handles filtering nodes by category (Reco, Analysis, PAT, HLT, Producer, Filter, Analyzer)
 */

const FilterManager = {
    filters: {
        reco: null,
        analysis: null,
        pat: null,
        hlt: null,
        producer: null,
        filter: null,
        analyzer: null
    },
    selectAllBtn: null,
    deselectAllBtn: null,
    statsSpan: null,

    /**
     * Initialize filter manager
     */
    init() {
        if (!window.bundleData?.metadata?.module_count) {
            const wrapper = document.getElementById('filter-controls-wrapper');
            if (wrapper) {
                wrapper.style.display = 'none';
            }
            return;
        }

        // Get filter checkboxes
        this.filters.reco = document.getElementById('filter-reco');
        this.filters.analysis = document.getElementById('filter-analysis');
        this.filters.pat = document.getElementById('filter-pat');
        this.filters.hlt = document.getElementById('filter-hlt');
        this.filters.producer = document.getElementById('filter-producer');
        this.filters.filter = document.getElementById('filter-filter');
        this.filters.analyzer = document.getElementById('filter-analyzer');

        // Get buttons
        this.selectAllBtn = document.getElementById('filter-select-all');
        this.deselectAllBtn = document.getElementById('filter-deselect-all');
        this.statsSpan = document.getElementById('filter-stats');

        this.setupEventListeners();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Add listeners to each filter checkbox
        Object.values(this.filters).forEach(checkbox => {
            checkbox.addEventListener('change', () => this.applyFilters());
        });

        // Select/deselect all buttons
        this.selectAllBtn.addEventListener('click', () => {
            Object.values(this.filters).forEach(checkbox => {
                checkbox.checked = true;
            });
            this.applyFilters();
        });

        this.deselectAllBtn.addEventListener('click', () => {
            Object.values(this.filters).forEach(checkbox => {
                checkbox.checked = false;
            });
            this.applyFilters();
        });
    },

    /**
     * Apply filters to graph
     */
    applyFilters() {
        const enabled = {
            reco: this.filters.reco.checked,
            analysis: this.filters.analysis.checked,
            pat: this.filters.pat.checked,
            hlt: this.filters.hlt.checked,
            producer: this.filters.producer.checked,
            filter: this.filters.filter.checked,
            analyzer: this.filters.analyzer.checked
        };

        let visibleCount = 0;
        let hiddenCount = 0;

        // Filter nodes
        GraphManager.cy.nodes().forEach(node => {
            const shouldShow = this.shouldShowNode(node, enabled);

            if (shouldShow) {
                node.removeClass('hidden');
                visibleCount++;
            } else {
                node.addClass('hidden');
                hiddenCount++;
            }
        });

        // Hide edges where either endpoint is hidden
        GraphManager.cy.edges().forEach(edge => {
            const source = edge.source();
            const target = edge.target();

            if (source.hasClass('hidden') || target.hasClass('hidden')) {
                edge.addClass('hidden');
            } else {
                edge.removeClass('hidden');
            }
        });

        // Update stats
        this.updateStats(visibleCount, hiddenCount);

        // Fit view to visible nodes
        const visibleNodes = GraphManager.cy.nodes().filter(node => !node.hasClass('hidden'));
        if (visibleNodes.length > 0) {
            GraphManager.cy.fit(visibleNodes);
        }

        console.log(`Filters applied: ${visibleCount} visible, ${hiddenCount} hidden`);
    },

    /**
     * Determine if a node should be shown based on filters
     */
    shouldShowNode(node, enabled) {
        const label = node.data('label') || '';
        const tooltip = node.data('tooltip') || '';
        const fillcolor = node.data('fillcolor') || '';

        // Get module data if available
        const moduleData = window.bundleData?.modules[label];
        const moduleType = moduleData?.type || '';

        // Stage filters (Reco vs Analysis)
        const isReco = fillcolor === 'green';
        const isAnalysis = fillcolor === 'lightgrey';

        // Specific category filters
        const isPAT = label.toLowerCase().includes('pat') ||
                      tooltip.toLowerCase().includes('pat');
        const isHLT = label.toLowerCase().includes('hlt') ||
                      tooltip.toLowerCase().includes('hlt');

        // Type filters
        const isProducer = moduleType === 'EDProducer';
        const isFilter = moduleType === 'EDFilter';
        const isAnalyzer = moduleType === 'EDAnalyzer';

        // Apply stage filters first
        let stageMatch = false;
        if (enabled.reco && isReco) stageMatch = true;
        if (enabled.analysis && isAnalysis) stageMatch = true;

        // If no stage filters are enabled, show nothing
        if (!enabled.reco && !enabled.analysis) {
            return false;
        }

        // If node doesn't match stage filter, hide it
        if (!stageMatch) {
            return false;
        }

        // Apply specific category filters
        if (isPAT && !enabled.pat) {
            return false;
        }

        if (isHLT && !enabled.hlt) {
            return false;
        }

        // Apply type filters
        if (moduleType) {
            // If any type filter is disabled, check if this node matches it
            if (!enabled.producer && isProducer) return false;
            if (!enabled.filter && isFilter) return false;
            if (!enabled.analyzer && isAnalyzer) return false;
        }

        return true;
    },

    /**
     * Update filter stats display
     */
    updateStats(visibleCount, hiddenCount) {
        const totalCount = visibleCount + hiddenCount;
        const percentage = totalCount > 0 ? Math.round((visibleCount / totalCount) * 100) : 0;

        this.statsSpan.textContent = `Showing ${visibleCount} of ${totalCount} nodes (${percentage}%)`;
    }
};
