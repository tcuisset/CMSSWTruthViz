/**
 * main.js - Application initialization
 * Loads data and initializes the viewer
 * Supports both static mode (file://) and server mode (http://)
 */

// Global data storage
window.bundleData = null;

/**
 * Detect if running in static mode
 */
function isStaticMode() {
    return window.location.protocol === 'file:' || window.EMBEDDED_BUNDLE_DATA !== undefined;
}

/**
 * Initialize the application
 */
async function initApp() {
    console.log('Initializing Graph Visualization...');

    const staticMode = isStaticMode();
    console.log(`Mode: ${staticMode ? 'Static (file://)' : 'Server (http://)'}`);

    try {
        // Show loading indicator
        showLoading(true);

        // Load bundle data based on mode
        if (staticMode && window.EMBEDDED_BUNDLE_DATA) {
            // Static mode: Use embedded data
            console.log('Loading embedded bundle data...');
            window.bundleData = window.EMBEDDED_BUNDLE_DATA;
            console.log('Embedded bundle data loaded:', {
                nodes: window.bundleData.nodes.length,
                edges: window.bundleData.edges.length
            });
        } else {
            // Server mode: Fetch from server
            console.log('Fetching bundle data from server...');
            const response = await fetch('../data/bundle.json');
            if (!response.ok) {
                throw new Error(`Failed to load bundle.json: ${response.statusText}`);
            }

            window.bundleData = await response.json();
            console.log('Bundle data loaded from server:', {
                nodes: window.bundleData.nodes.length,
                edges: window.bundleData.edges.length
            });
        }

        // Initialize graph
        GraphManager.init(window.bundleData);

        // Initialize UI components
        PanelManager.init();
        SearchManager.init();
        EgoGraphManager.init();
        DependencyExplorer.init();
        KeyboardNav.init();

        // Initialize upload only in server mode
        if (!staticMode) {
            UploadManager.init();
        } else {
            // Hide upload button in static mode
            const uploadBtn = document.getElementById('upload-btn');
            if (uploadBtn) {
                uploadBtn.style.display = 'none';
            }
        }

        // Update stats
        updateStats({
            nodeCount: window.bundleData.nodes.length,
            edgeCount: window.bundleData.edges.length
        });

        // Hide loading indicator
        showLoading(false);

        // Fit graph to viewport
        GraphManager.fit();

        console.log('Application initialized successfully');

    } catch (error) {
        console.error('Error initializing application:', error);
        showLoading(false);
        alert(`Failed to initialize application: ${error.message}`);
    }
}

/**
 * Show/hide loading indicator
 */
function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

/**
 * Update statistics display
 */
function updateStats(stats) {
    document.getElementById('node-count').textContent = `Nodes: ${stats.nodeCount}`;
    document.getElementById('edge-count').textContent = `Edges: ${stats.edgeCount}`;
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
