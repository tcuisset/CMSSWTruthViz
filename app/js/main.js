/**
 * main.js - Application initialization
 * Loads data and initializes the viewer
 * Supports visualization-only and explicitly enabled backend modes
 */

// Global data storage
window.bundleData = null;

/** Backend features are enabled by server.py, independently of URL protocol. */
function isViewerMode() {
    return window.TRUTHVIZ_RUNTIME?.mode !== 'backend';
}

/**
 * Initialize the application
 */
async function initApp() {
    console.log('Initializing Graph Visualization...');

    const viewerMode = isViewerMode();
    console.log(`Mode: ${viewerMode ? 'Visualization only' : 'Backend'}`);

    try {
        // Show loading indicator
        showLoading(true);

        if (viewerMode) {
            ViewerInput.init();
            const sessionId = new URLSearchParams(window.location.search).get('session');
            const selected = sessionId ? await SessionStore.get(sessionId) : null;
            if (sessionId && !selected) throw new Error('This browser session no longer exists');
            if (selected || window.EMBEDDED_EVENT_DATA) {
                attachViewerEvent(selected || window.EMBEDDED_EVENT_DATA);
            } else if (window.EMBEDDED_BUNDLE_DATA) {
                window.bundleData = window.EMBEDDED_BUNDLE_DATA;
                attachEmbeddedRechitsData();
                window.associationData = window.EMBEDDED_ASSOCIATION_DATA || null;
            } else {
                showLoading(false);
                ViewerInput.show();
                return;
            }
        } else {
            await UploadManager.init();
            const selection = await loadServerSelection();
            if (!selection) {
                showLoading(false);
                await UploadManager.showLauncher(true);
                return;
            }
            attachSessionEnvelope(selection);
        }

        // Initialize graph
        GraphManager.init(window.bundleData);

        // Initialize UI components
        PanelManager.init();
        Plot3DPanelManager.init(window.bundleData);
        SearchManager.init();
        EgoGraphManager.init();
        DependencyExplorer.init();
        KeyboardNav.init();
        ExportManager.init();

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
        if (viewerMode) ViewerInput.show();
        if (!viewerMode && UploadManager.modal) {
            await UploadManager.showLauncher(true);
        }
    }
}

async function loadServerSelection() {
    const parameters = new URLSearchParams(window.location.search);
    const sessionId = parameters.get('session');
    const catalogId = parameters.get('catalog');
    if (sessionId) {
        const result = await SessionStore.get(sessionId);
        if (!result) throw new Error('This browser session no longer exists');
        return result;
    }
    if (catalogId) {
        const response = await fetch(`../api/catalog/${encodeURIComponent(catalogId)}/result`);
        const payload = await response.json();
        if (!response.ok || payload.success === false) {
            throw new Error(payload.error || `Catalogue loading failed with HTTP ${response.status}`);
        }
        return payload;
    }
    return null;
}

function attachSessionEnvelope(envelope) {
    if (envelope.schemaVersion !== 1 || !envelope.bundle) {
        throw new Error('Unsupported event-session format');
    }
    window.bundleData = envelope.bundle;
    if (Array.isArray(envelope.rechits?.rechits)) {
        window.bundleData.rechits = envelope.rechits.rechits;
        window.bundleData.rechitsMetadata = envelope.rechits.metadata;
    }
    window.associationData = envelope.associations || null;
    console.log('Session loaded:', {
        name: envelope.session?.name,
        nodes: window.bundleData.nodes.length,
        edges: window.bundleData.edges.length,
        rechits: window.bundleData.rechits?.length || 0
    });
}

/**
 * Attach optional static-mode rechits data if app/js/rechits.js was generated.
 */
function attachEmbeddedRechitsData() {
    if (!window.EMBEDDED_RECHITS_DATA?.rechits) {
        return;
    }

    window.bundleData.rechits = window.EMBEDDED_RECHITS_DATA.rechits;
    window.bundleData.rechitsMetadata = window.EMBEDDED_RECHITS_DATA.metadata;
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
