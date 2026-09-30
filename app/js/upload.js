/** Launcher, isolated job submission, and browser-session handoff. */
const UploadManager = {
    apiBase: '../api',
    modal: null,
    form: null,
    samples: [],
    pendingResultJob: null,
    pendingSavedSession: null,
    required: false,

    async init() {
        this.modal = document.getElementById('upload-modal');
        this.form = document.getElementById('upload-form');
        this.modeInputs = Array.from(document.querySelectorAll('input[name="input-mode"]'));
        this.sourceInputs = Array.from(document.querySelectorAll('input[name="cmssw-root-source"]'));
        this.submitBtn = document.getElementById('upload-submit-btn');
        this.closeBtn = document.getElementById('modal-close-btn');
        this.cancelBtn = document.getElementById('upload-cancel-btn');
        this.status = document.getElementById('upload-status');
        this.progress = document.getElementById('upload-progress');
        this.logBox = document.getElementById('upload-log');
        this.sessionName = document.getElementById('session-name-input');
        this.rootFile = document.getElementById('cmssw-root-file-input');
        this.rootPath = document.getElementById('cmssw-root-path-input');
        this.eventIndex = document.getElementById('event-index-input');
        this.dumperArgs = document.getElementById('dumper-args-input');
        this.dotFile = document.getElementById('dot-file-input');
        this.rechitsFile = document.getElementById('root-file-input');
        this.rechitsEventIndex = document.getElementById('rechits-event-index-input');
        this.sampleSelect = document.getElementById('sample-select');
        this.setupEventListeners();
        this.updateModeVisibility();
    },

    setupEventListeners() {
        document.getElementById('upload-btn').addEventListener('click', () => this.returnToLauncher());
        this.closeBtn.addEventListener('click', () => this.closeModal());
        this.cancelBtn.addEventListener('click', () => this.closeModal());
        this.modal.addEventListener('click', event => {
            if (event.target === this.modal && !this.required) this.closeModal();
        });
        this.modeInputs.forEach(input => input.addEventListener('change', () => this.updateModeVisibility()));
        this.sourceInputs.forEach(input => input.addEventListener('change', () => this.updateModeVisibility()));
        this.form.addEventListener('submit', event => {
            event.preventDefault();
            this.handleSubmit();
        });
        this.rootFile.addEventListener('change', () => this.suggestName());
        this.rootPath.addEventListener('change', () => this.suggestName());
        this.dotFile.addEventListener('change', () => this.suggestName());
        this.eventIndex.addEventListener('input', () => this.suggestName());
        this.rechitsEventIndex.addEventListener('input', () => this.suggestName());
        this.sessionName.addEventListener('input', () => {
            this.sessionName.dataset.edited = this.sessionName.value ? 'true' : 'false';
        });
        this.sampleSelect.addEventListener('change', () => this.updateSampleInfo());
    },

    async showLauncher(required = false) {
        this.required = required;
        this.closeBtn.classList.toggle('hidden', required);
        this.cancelBtn.classList.toggle('hidden', required);
        this.modal.classList.remove('hidden');
        await Promise.all([this.loadSamples(), this.renderSavedSessions()]);
    },

    closeModal() {
        if (!this.required) this.modal.classList.add('hidden');
    },

    returnToLauncher() {
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        window.location.assign(url.toString());
    },

    navigateTo(kind, id) {
        const url = new URL(window.location.href);
        url.search = '';
        url.searchParams.set(kind, id);
        window.location.assign(url.toString());
    },

    getMode() {
        return this.modeInputs.find(input => input.checked)?.value || 'saved';
    },

    getSource() {
        return this.sourceInputs.find(input => input.checked)?.value || 'upload';
    },

    updateModeVisibility() {
        const mode = this.getMode();
        document.querySelectorAll('[data-launcher-mode]').forEach(element => {
            const modes = element.dataset.launcherMode.split(' ');
            element.classList.toggle('hidden', !modes.includes(mode));
        });
        const source = this.getSource();
        document.querySelectorAll('[data-root-source]').forEach(element => {
            element.classList.toggle('hidden', element.dataset.rootSource !== source || mode !== 'cmssw');
        });
        this.submitBtn.classList.toggle('hidden', mode === 'saved');
        this.submitBtn.textContent = mode === 'sample' ? 'Open sample' : 'Process and save';
        this.suggestName();
    },

    suggestName() {
        const mode = this.getMode();
        if (!['cmssw', 'prepared'].includes(mode) || this.sessionName.dataset.edited === 'true') return;
        let sourceName = '';
        let eventIndex = '0';
        if (mode === 'cmssw') {
            sourceName = this.getSource() === 'path'
                ? this.rootPath.value.trim().split('/').pop()
                : this.rootFile.files[0]?.name;
            eventIndex = this.eventIndex.value || '0';
        } else {
            sourceName = this.dotFile.files[0]?.name;
            eventIndex = this.rechitsEventIndex.value || '0';
        }
        if (!sourceName) return;
        const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
        this.sessionName.value = `${sourceName}, event ${eventIndex} — ${stamp}`;
    },

    async handleSubmit() {
        try {
            if (this.pendingResultJob) {
                if (this.pendingSavedSession) {
                    await this.acknowledgeAndOpen(this.pendingResultJob, this.pendingSavedSession);
                } else {
                    await this.downloadAndSave(this.pendingResultJob);
                }
                return;
            }
            const mode = this.getMode();
            if (mode === 'sample') {
                if (!this.sampleSelect.value) throw new Error('Please select a catalogue sample');
                this.navigateTo('catalog', this.sampleSelect.value);
                return;
            }
            const formData = mode === 'cmssw' ? this.rootFormData() : this.preparedFormData();
            this.setBusy(true, 'Uploading input...');
            this.setLogs('');
            const endpoint = mode === 'cmssw' ? 'root' : 'prepared';
            const response = await fetch(`${this.apiBase}/jobs/${endpoint}`, {method: 'POST', body: formData});
            const payload = await this.parseResponse(response, 'Job submission');
            await this.waitForJob(payload.job.id);
            await this.downloadAndSave(payload.job.id);
        } catch (error) {
            console.error(error);
            this.setBusy(false, `Error: ${error.message}`);
        }
    },

    rootFormData() {
        const source = this.getSource();
        const eventIndex = this.nonNegativeInteger(this.eventIndex.value, 'event number');
        if (source === 'upload' && !this.rootFile.files[0]) throw new Error('Please select a CMSSW ROOT file');
        if (source === 'path' && !this.rootPath.value.trim()) throw new Error('Please enter a CERN EOS path');
        const form = new FormData();
        form.append('source', source);
        if (source === 'upload') form.append('rootFile', this.rootFile.files[0]);
        else form.append('rootPath', this.rootPath.value.trim());
        form.append('eventIndex', String(eventIndex));
        form.append('sessionName', this.sessionName.value.trim());
        if (this.dumperArgs.value.trim()) form.append('dumperArgs', this.dumperArgs.value.trim());
        return form;
    },

    preparedFormData() {
        if (!this.dotFile.files[0]) throw new Error('Please select a DOT graph file');
        const eventIndex = this.nonNegativeInteger(this.rechitsEventIndex.value, 'rechits event number');
        const form = new FormData();
        form.append('dotFile', this.dotFile.files[0]);
        if (this.rechitsFile.files[0]) form.append('rootFile', this.rechitsFile.files[0]);
        form.append('rechitsEventIndex', String(eventIndex));
        form.append('sessionName', this.sessionName.value.trim());
        return form;
    },

    async waitForJob(id) {
        const deadline = Date.now() + 60 * 60 * 1000;
        while (Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const response = await fetch(`${this.apiBase}/jobs/${encodeURIComponent(id)}/status`);
            const payload = await this.parseResponse(response, 'Job status');
            const job = payload.job;
            this.updateJobDisplay(job);
            if (job.state === 'success') return;
            if (job.state === 'error') throw new Error(job.message || 'Processing failed');
        }
        throw new Error('Processing is still running after 60 minutes');
    },

    async downloadAndSave(id) {
        this.pendingResultJob = id;
        this.setBusy(true, 'Downloading processed JSON...');
        try {
            const response = await fetch(`${this.apiBase}/jobs/${encodeURIComponent(id)}/result`);
            const result = await this.parseResponse(response, 'Job result');
            this.status.textContent = 'Saving the event in this browser...';
            await SessionStore.requestPersistence();
            const saved = await SessionStore.saveServerResult(result);
            this.pendingSavedSession = saved;
            await this.acknowledgeAndOpen(id, saved);
        } catch (error) {
            this.submitBtn.textContent = this.pendingSavedSession ? 'Retry server cleanup' : 'Retry browser save';
            throw new Error(`${error.message}. The server copy has been retained for retry.`);
        }
    },

    async acknowledgeAndOpen(id, saved) {
        try {
            this.status.textContent = 'Browser copy verified. Removing temporary server files...';
            const acknowledgement = await fetch(`${this.apiBase}/jobs/${encodeURIComponent(id)}`, {method: 'DELETE'});
            await this.parseResponse(acknowledgement, 'Server cleanup');
            this.pendingResultJob = null;
            this.pendingSavedSession = null;
            this.navigateTo('session', saved.session.id);
        } catch (error) {
            throw error;
        }
    },

    async loadSamples() {
        try {
            const response = await fetch(`${this.apiBase}/catalog`);
            const payload = await this.parseResponse(response, 'Catalogue');
            this.samples = payload.catalog.samples || [];
            this.sampleSelect.innerHTML = this.samples.map(sample =>
                `<option value="${this.escapeHtml(sample.id)}">${this.escapeHtml(sample.label || sample.id)}</option>`
            ).join('') || '<option value="">No samples available</option>';
            this.updateSampleInfo();
        } catch (error) {
            this.sampleSelect.innerHTML = '<option value="">Catalogue unavailable</option>';
            document.getElementById('sample-info').textContent = error.message;
        }
    },

    updateSampleInfo() {
        const sample = this.samples.find(item => item.id === this.sampleSelect.value);
        document.getElementById('sample-info').textContent = sample?.description || '';
    },

    async renderSavedSessions() {
        const container = document.getElementById('saved-session-list');
        try {
            const [sessions, storage] = await Promise.all([SessionStore.list(), SessionStore.storageInfo()]);
            if (!sessions.length) {
                container.innerHTML = '<p class="empty-sessions">No sessions saved in this browser yet.</p>';
            } else {
                container.innerHTML = sessions.map(record => {
                    const session = record.session;
                    return `<div class="saved-session-row">
                        <div><strong>${this.escapeHtml(session.name)}</strong>
                        <span>${this.escapeHtml(session.sourceType)} · event ${session.eventIndex} · ${this.formatDate(session.createdAt)} · ${this.formatBytes(session.sizeBytes)}</span></div>
                        <button type="button" data-open-session="${this.escapeHtml(session.id)}">Open</button>
                        <button type="button" class="delete-session" data-delete-session="${this.escapeHtml(session.id)}">Delete</button>
                    </div>`;
                }).join('');
                container.querySelectorAll('[data-open-session]').forEach(button =>
                    button.addEventListener('click', () => this.navigateTo('session', button.dataset.openSession))
                );
                container.querySelectorAll('[data-delete-session]').forEach(button =>
                    button.addEventListener('click', () => this.deleteSession(button.dataset.deleteSession))
                );
            }
            const info = document.getElementById('browser-storage-info');
            info.textContent = storage?.quota
                ? `Browser storage: ${this.formatBytes(storage.usage || 0)} used of approximately ${this.formatBytes(storage.quota)}.`
                : 'Sessions are local to this browser profile.';
        } catch (error) {
            container.innerHTML = `<p class="empty-sessions">Browser storage unavailable: ${this.escapeHtml(error.message)}</p>`;
        }
    },

    async deleteSession(id) {
        const record = await SessionStore.get(id);
        if (!record) return;
        if (!window.confirm(`Delete the saved session “${record.session.name}”?`)) return;
        await SessionStore.delete(id);
        await this.renderSavedSessions();
    },

    async parseResponse(response, label) {
        let payload;
        try {
            payload = await response.json();
        } catch (error) {
            throw new Error(`${label} returned HTTP ${response.status} without valid JSON`);
        }
        if (!response.ok || payload.success === false) {
            throw new Error(payload.error || `${label} failed with HTTP ${response.status}`);
        }
        return payload;
    },

    setBusy(busy, message) {
        this.progress.classList.remove('hidden');
        this.submitBtn.disabled = busy;
        this.status.textContent = message;
        if (!busy) this.submitBtn.disabled = false;
    },

    updateJobDisplay(job) {
        const queue = job.queuePosition ? ` (queue position ${job.queuePosition})` : '';
        this.status.textContent = `${job.message || job.phase}${queue}`;
        this.setLogs(job.logs || '');
    },

    setLogs(logs) {
        if (!this.logBox) return;
        const wasNearBottom = this.logBox.scrollHeight - this.logBox.scrollTop - this.logBox.clientHeight < 24;
        this.logBox.value = logs;
        if (wasNearBottom) this.logBox.scrollTop = this.logBox.scrollHeight;
    },

    nonNegativeInteger(value, label) {
        const number = Number(value || 0);
        if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer`);
        return number;
    },

    formatBytes(bytes) {
        if (!Number.isFinite(bytes)) return 'size unknown';
        const units = ['B', 'KiB', 'MiB', 'GiB'];
        let value = bytes;
        let unit = 0;
        while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
        return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
    },

    formatDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.valueOf()) ? 'unknown date' : date.toLocaleString();
    },

    escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[character]));
    },
};
