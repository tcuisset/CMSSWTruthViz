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
    return window.location.protocol === 'file:';
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

        // Static exports keep their embedded one-event behavior. Server mode starts
        // from an explicit browser session or catalogue selection; a bare URL opens
        // the launcher and never reads pod-wide data files.
        if (staticMode && window.EMBEDDED_BUNDLE_DATA) {
            // Static mode: Use embedded data
            console.log('Loading embedded bundle data...');
            window.bundleData = window.EMBEDDED_BUNDLE_DATA;
            attachEmbeddedRechitsData();
            console.log('Embedded bundle data loaded:', {
                nodes: window.bundleData.nodes.length,
                edges: window.bundleData.edges.length,
                rechits: window.bundleData.rechits?.length || 0
            });
        } else if (!staticMode) {
            await UploadManager.init();
            const selection = await loadServerSelection();
            if (!selection) {
                showLoading(false);
                await UploadManager.showLauncher(true);
                return;
            }
            attachSessionEnvelope(selection);
        }

        if (staticMode) await attachAssociationData();

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

        // Initialize upload only in server mode
        if (!staticMode) {
            const uploadBtn = document.getElementById('upload-btn');
            if (uploadBtn) uploadBtn.textContent = 'Open event';
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
        if (!staticMode && UploadManager.modal) {
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

/**
 * Load the reco to truth-branch associations if the job produced them. A graph dumped
 * without the associators simply has no file, which is not an error.
 */
async function attachAssociationData() {
    // A page opened as a file cannot fetch, so the generated associations.js is used
    // when it is there; the server path still reads the JSON, which is always current.
    if (isStaticMode() && window.EMBEDDED_ASSOCIATION_DATA) {
        window.associationData = window.EMBEDDED_ASSOCIATION_DATA;
        console.log('Associations loaded from the embedded file:',
                    window.associationData.recoObjects?.length || 0, 'reco objects');
        return;
    }

    try {
        const response = await fetch('../data/associations.json');
        if (!response.ok) return;
        window.associationData = await response.json();
        console.log('Associations loaded:', window.associationData.recoObjects?.length || 0, 'reco objects');
    } catch (error) {
        if (window.EMBEDDED_ASSOCIATION_DATA) {
            window.associationData = window.EMBEDDED_ASSOCIATION_DATA;
            console.log('Associations loaded from the embedded file after a failed fetch');
            return;
        }
        console.log('No association data:', error.message);
    }
}
