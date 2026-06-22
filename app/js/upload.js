/**
 * upload.js - File upload functionality
 * Handles prepared DOT/ROOT uploads, CMSSW ROOT processing, and catalogue samples.
 */

const UploadManager = {
    modal: null,
    form: null,
    modeInputs: null,
    cmsswRootFileInput: null,
    cmsswRootFileInfo: null,
    eventIndexInput: null,
    dumperArgsInput: null,
    dotFileInput: null,
    dotFileInfo: null,
    rootFileInput: null,
    rootFileInfo: null,
    rechitsEventIndexInput: null,
    sampleSelect: null,
    sampleInfo: null,
    uploadProgress: null,
    uploadStatus: null,
    submitBtn: null,
    samples: [],

    /**
     * Initialize upload manager
     */
    init() {
        this.modal = document.getElementById('upload-modal');
        this.form = document.getElementById('upload-form');
        this.modeInputs = Array.from(document.querySelectorAll('input[name="input-mode"]'));
        this.cmsswRootFileInput = document.getElementById('cmssw-root-file-input');
        this.cmsswRootFileInfo = document.getElementById('cmssw-root-file-info');
        this.eventIndexInput = document.getElementById('event-index-input');
        this.dumperArgsInput = document.getElementById('dumper-args-input');
        this.dotFileInput = document.getElementById('dot-file-input');
        this.dotFileInfo = document.getElementById('dot-file-info');
        this.rootFileInput = document.getElementById('root-file-input');
        this.rootFileInfo = document.getElementById('root-file-info');
        this.rechitsEventIndexInput = document.getElementById('rechits-event-index-input');
        this.sampleSelect = document.getElementById('sample-select');
        this.sampleInfo = document.getElementById('sample-info');
        this.uploadProgress = document.getElementById('upload-progress');
        this.uploadStatus = document.getElementById('upload-status');
        this.submitBtn = document.getElementById('upload-submit-btn');

        this.setupEventListeners();
        this.updateModeVisibility();
        this.loadSamples();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Open modal button
        document.getElementById('upload-btn').addEventListener('click', () => {
            this.openModal();
        });

        // Close modal buttons
        document.getElementById('modal-close-btn').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('upload-cancel-btn').addEventListener('click', () => {
            this.closeModal();
        });

        // Close on background click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });

        this.modeInputs.forEach(input => {
            input.addEventListener('change', () => this.updateModeVisibility());
        });

        // File input changes
        this.cmsswRootFileInput.addEventListener('change', (e) => {
            this.updateFileInfo(e.target, this.cmsswRootFileInfo);
        });
        this.dotFileInput.addEventListener('change', (e) => {
            this.updateFileInfo(e.target, this.dotFileInfo);
        });
        this.rootFileInput.addEventListener('change', (e) => {
            this.updateFileInfo(e.target, this.rootFileInfo);
        });
        this.sampleSelect.addEventListener('change', () => {
            this.updateSampleInfo();
        });

        // Form submit
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUpload();
        });
    },

    /**
     * Open upload modal
     */
    openModal() {
        this.modal.classList.remove('hidden');
        this.resetForm();
    },

    /**
     * Close upload modal
     */
    closeModal() {
        this.modal.classList.add('hidden');
        this.resetForm();
    },

    /**
     * Reset form
     */
    resetForm() {
        this.form.reset();
        this.cmsswRootFileInfo.textContent = 'No file selected';
        this.dotFileInfo.textContent = 'No file selected';
        this.rootFileInfo.textContent = 'No file selected';
        this.eventIndexInput.value = '0';
        this.dumperArgsInput.value = '';
        this.rechitsEventIndexInput.value = '0';
        this.uploadProgress.classList.add('hidden');
        this.submitBtn.disabled = false;
        this.updateModeVisibility();
        this.updateSampleInfo();
    },

    /**
     * Update file info display
     */
    updateFileInfo(input, infoElement) {
        if (input.files.length > 0) {
            const file = input.files[0];
            const sizeMB = (file.size / 1024 / 1024).toFixed(2);
            infoElement.textContent = `${file.name} (${sizeMB} MB)`;
        } else {
            infoElement.textContent = 'No file selected';
        }
    },

    /**
     * Handle file upload
     */
    async handleUpload() {
        const mode = this.getMode();

        try {
            if (mode === 'cmssw') {
                await this.handleCmsswRootUpload();
                return;
            }

            if (mode === 'sample') {
                await this.handleSampleProcessing();
                return;
            }

            await this.handlePreparedUpload();
        } catch (error) {
            console.error('Upload error:', error);
            this.uploadStatus.textContent = `Error: ${error.message}`;
            this.submitBtn.disabled = false;
            alert(`Processing failed: ${error.message}`);
        }
    },

    async handlePreparedUpload() {
        const dotFile = this.dotFileInput.files[0];
        const rootFile = this.rootFileInput.files[0];
        const rechitsEventIndex = this.parseNonNegativeInteger(this.rechitsEventIndexInput.value);

        if (!dotFile) {
            alert('Please select a DOT graph file');
            return;
        }

        if (rootFile && rechitsEventIndex === null) {
            alert('Please enter a non-negative rechits event number');
            return;
        }

        // Show progress
        this.uploadProgress.classList.remove('hidden');
        this.uploadStatus.textContent = 'Uploading files...';
        this.submitBtn.disabled = true;

        const formData = new FormData();
        formData.append('mode', 'prepared');
        formData.append('dotFile', dotFile);
        if (rootFile) {
            formData.append('rootFile', rootFile);
            formData.append('rechitsEventIndex', String(rechitsEventIndex));
        }

        const response = await fetch('../upload', {
            method: 'POST',
            body: formData
        });

        const result = await this.parseJsonResponse(response, 'Upload');
        await this.finishStartedProcessing(result, 'Upload complete. Processing files...');
    },

    async handleCmsswRootUpload() {
        const rootFile = this.cmsswRootFileInput.files[0];
        const eventIndex = this.parseNonNegativeInteger(this.eventIndexInput.value);

        if (!rootFile) {
            alert('Please select a CMSSW EDM ROOT file');
            return;
        }

        if (eventIndex === null) {
            alert('Please enter a non-negative event number');
            return;
        }

        this.uploadProgress.classList.remove('hidden');
        this.uploadStatus.textContent = 'Uploading CMSSW ROOT file...';
        this.submitBtn.disabled = true;

        const formData = new FormData();
        formData.append('rootFile', rootFile);
        formData.append('eventIndex', String(eventIndex));
        if (this.dumperArgsInput.value.trim()) {
            formData.append('dumperArgs', this.dumperArgsInput.value.trim());
        }

        const response = await fetch('../process-root', {
            method: 'POST',
            body: formData
        });

        const result = await this.parseJsonResponse(response, 'CMSSW ROOT processing');
        await this.finishStartedProcessing(result, 'Upload complete. Running cmsRun...');
    },

    async handleSampleProcessing() {
        const sampleId = this.sampleSelect.value;
        if (!sampleId) {
            alert('Please select a sample');
            return;
        }

        this.uploadProgress.classList.remove('hidden');
        this.uploadStatus.textContent = 'Starting sample processing...';
        this.submitBtn.disabled = true;

        const response = await fetch(`../samples/${encodeURIComponent(sampleId)}/process`, {
            method: 'POST'
        });

        const result = await this.parseJsonResponse(response, 'Sample processing');
        await this.finishStartedProcessing(result, 'Sample processing started...');
    },

    async finishStartedProcessing(result, initialMessage) {
        if (!result.success) {
            throw new Error(result.error || 'Processing failed');
        }

        this.uploadStatus.textContent = initialMessage;
        await this.waitForBundleBuild();

        this.uploadStatus.textContent = 'Files processed successfully! Reloading...';
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    },

    /**
     * Parse a JSON response and produce a useful error for proxy/server HTML pages.
     */
    async parseJsonResponse(response, label) {
        const responseText = await response.text();
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (error) {
            const message = response.ok
                ? `${label} response was not valid JSON`
                : `${label} failed with HTTP ${response.status}`;
            throw new Error(message);
        }

        if (!response.ok || result.success === false) {
            throw new Error(result.error || `${label} failed with HTTP ${response.status}`);
        }

        return result;
    },

    /**
     * Poll the server until the asynchronous bundle build finishes.
     */
    async waitForBundleBuild() {
        const startedAt = Date.now();
        const timeoutMs = 60 * 60 * 1000;

        while (Date.now() - startedAt < timeoutMs) {
            await this.sleep(2000);

            const response = await fetch('../upload-status');
            const result = await this.parseJsonResponse(response, 'Build status');
            const build = result.build || {};

            if (build.state === 'success') {
                return;
            }

            if (build.state === 'error') {
                throw new Error(build.message || 'Bundle generation failed');
            }

            if (build.message) {
                this.uploadStatus.textContent = build.message;
            }
        }

        throw new Error('Bundle generation is still running after 60 minutes');
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    parseNonNegativeInteger(rawValue) {
        const value = String(rawValue).trim();
        if (value === '') return 0;

        const eventIndex = Number(value);
        if (!Number.isInteger(eventIndex) || eventIndex < 0) return null;

        return eventIndex;
    },

    getMode() {
        const selected = this.modeInputs.find(input => input.checked);
        return selected ? selected.value : 'cmssw';
    },

    updateModeVisibility() {
        const mode = this.getMode();
        const cmsswGroups = Array.from(document.querySelectorAll('.cmssw-input-group'));
        const sampleGroups = Array.from(document.querySelectorAll('.sample-input-group'));
        const preparedGroups = [
            this.dotFileInput.closest('.form-group'),
            this.rootFileInput.closest('.form-group'),
            this.rechitsEventIndexInput.closest('.form-group')
        ];

        cmsswGroups.forEach(group => group.classList.toggle('hidden', mode !== 'cmssw'));
        preparedGroups.forEach(group => group.classList.toggle('hidden', mode !== 'prepared'));
        sampleGroups.forEach(group => group.classList.toggle('hidden', mode !== 'sample'));
        this.submitBtn.textContent = mode === 'sample' ? 'Process Sample' : 'Upload & Process';
    },

    async loadSamples() {
        try {
            const response = await fetch('../samples');
            const result = await this.parseJsonResponse(response, 'Sample catalogue');
            this.samples = (result.catalog && result.catalog.samples) || [];
            this.renderSamples();
        } catch (error) {
            this.samples = [];
            this.sampleSelect.innerHTML = '<option value="">No samples available</option>';
            this.sampleInfo.textContent = error.message;
        }
    },

    renderSamples() {
        if (!this.samples.length) {
            this.sampleSelect.innerHTML = '<option value="">No samples configured</option>';
            this.updateSampleInfo();
            return;
        }

        this.sampleSelect.innerHTML = this.samples.map(sample => (
            `<option value="${this.escapeHtml(sample.id)}">${this.escapeHtml(sample.label || sample.id)}</option>`
        )).join('');
        this.updateSampleInfo();
    },

    updateSampleInfo() {
        const sample = this.samples.find(item => item.id === this.sampleSelect.value);
        this.sampleInfo.textContent = sample ? (sample.description || '') : '';
    },

    escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[character]));
    }
};
