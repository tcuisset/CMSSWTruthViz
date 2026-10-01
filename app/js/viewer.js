/** Client-side JSON opening; usable on file:// and any static HTTP host. */
const ViewerInput = {
    init() {
        const button = document.getElementById('upload-btn');
        button.textContent = 'Open JSON';
        button.addEventListener('click', () => document.getElementById('viewer-modal').classList.remove('hidden'));
        document.getElementById('viewer-close-btn').addEventListener('click', () => {
            if (window.bundleData) document.getElementById('viewer-modal').classList.add('hidden');
        });
        document.getElementById('viewer-form').addEventListener('submit', async event => {
            event.preventDefault();
            const status = document.getElementById('viewer-status');
            try {
                const file = document.getElementById('viewer-json').files[0];
                if (!file) throw new Error('Select a JSON bundle or event envelope');
                const payload = JSON.parse(await file.text());
                attachViewerEvent(payload);
                const rechits = document.getElementById('viewer-rechits').files[0];
                if (rechits) {
                    const data = JSON.parse(await rechits.text());
                    if (!Array.isArray(data.rechits)) throw new Error('Rechits JSON must contain a rechits array');
                    window.bundleData.rechits = data.rechits;
                    window.bundleData.rechitsMetadata = data.metadata;
                }
                const associations = document.getElementById('viewer-associations').files[0];
                if (associations) window.associationData = JSON.parse(await associations.text());
                const saved = await SessionStore.saveServerResult({
                    schemaVersion: 1,
                    session: {name: file.name, sourceType: 'json', eventIndex: 0, createdAt: new Date().toISOString()},
                    bundle: window.bundleData, associations: window.associationData,
                });
                const url = new URL(window.location.href);
                url.search = '';
                url.searchParams.set('session', saved.session.id);
                window.location.assign(url.toString());
            } catch (error) {
                status.textContent = error.message;
            }
        });
    },
    show() {
        document.getElementById('viewer-modal').classList.remove('hidden');
    },
};

function attachViewerEvent(payload) {
    const bundle = payload?.schemaVersion === undefined ? payload : payload.bundle;
    if (payload?.schemaVersion !== undefined && payload.schemaVersion !== 1) {
        throw new Error('Unsupported event-session format');
    }
    if (!Array.isArray(bundle?.nodes) || !Array.isArray(bundle?.edges)) {
        throw new Error('A graph bundle must contain nodes and edges arrays');
    }
    if (payload.rechits != null && !Array.isArray(payload.rechits.rechits)) {
        throw new Error('Rechits JSON must contain a rechits array');
    }
    window.bundleData = bundle;
    window.associationData = payload.associations || null;
    if (Array.isArray(payload.rechits?.rechits)) {
        window.bundleData.rechits = payload.rechits.rechits;
        window.bundleData.rechitsMetadata = payload.rechits.metadata;
    }
}
