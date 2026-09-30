/** Browser-local storage for complete, versioned event sessions. */
const SessionStore = {
    databaseName: 'truth-graph-viewer',
    databaseVersion: 1,
    storeName: 'sessions',
    databasePromise: null,

    open() {
        if (this.databasePromise) return this.databasePromise;
        this.databasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.databaseName, this.databaseVersion);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(this.storeName)) {
                    const store = database.createObjectStore(this.storeName, {keyPath: 'session.id'});
                    store.createIndex('createdAt', 'session.createdAt');
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Could not open IndexedDB'));
        });
        return this.databasePromise;
    },

    async list() {
        const records = await this.request('readonly', store => store.getAll());
        return records.sort((left, right) =>
            String(right.session.createdAt || '').localeCompare(String(left.session.createdAt || ''))
        );
    },

    get(id) {
        return this.request('readonly', store => store.get(id));
    },

    delete(id) {
        return this.request('readwrite', store => store.delete(id));
    },

    async saveServerResult(result) {
        if (result.schemaVersion !== 1 || !result.session || !result.bundle) {
            throw new Error('The server returned an unsupported session payload');
        }
        const browserId = crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const record = {
            ...result,
            session: {...result.session, id: browserId},
        };
        record.session.sizeBytes = new Blob([JSON.stringify(record)]).size;
        await this.request('readwrite', store => store.put(record));
        const verified = await this.get(browserId);
        if (!verified || verified.schemaVersion !== result.schemaVersion) {
            throw new Error('The saved browser session could not be verified');
        }
        return verified;
    },

    async requestPersistence() {
        if (!navigator.storage?.persist) return false;
        try {
            return await navigator.storage.persist();
        } catch (error) {
            console.warn('Persistent browser storage was not granted:', error);
            return false;
        }
    },

    async storageInfo() {
        if (!navigator.storage?.estimate) return null;
        try {
            return await navigator.storage.estimate();
        } catch (error) {
            return null;
        }
    },

    async request(mode, operation) {
        const database = await this.open();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(this.storeName, mode);
            const request = operation(transaction.objectStore(this.storeName));
            let result;
            request.onsuccess = () => { result = request.result; };
            request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
            transaction.oncomplete = () => resolve(result);
            transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
            transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
        });
    },
};
