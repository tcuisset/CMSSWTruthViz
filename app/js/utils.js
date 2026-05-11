/**
 * Utility functions for the truth graph viewer
 */

const Utils = {
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Update statistics display
     */
    updateStats(nodeCount, edgeCount) {
        document.getElementById('node-count').textContent = `Nodes: ${nodeCount.toLocaleString()}`;
        document.getElementById('edge-count').textContent = `Edges: ${edgeCount.toLocaleString()}`;
    },

    /**
     * Show loading indicator
     */
    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
    },

    /**
     * Hide loading indicator
     */
    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    },

    /**
     * Debounce function to limit rate of function calls
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};
