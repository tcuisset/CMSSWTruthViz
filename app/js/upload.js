/**
 * upload.js - File upload functionality
 * Handles uploading a DOT graph, then regenerating the bundle
 */

const UploadManager = {
    modal: null,
    form: null,
    dotFileInput: null,
    dotFileInfo: null,
    uploadProgress: null,
    uploadStatus: null,
    submitBtn: null,

    /**
     * Initialize upload manager
     */
    init() {
        this.modal = document.getElementById('upload-modal');
        this.form = document.getElementById('upload-form');
        this.dotFileInput = document.getElementById('dot-file-input');
        this.dotFileInfo = document.getElementById('dot-file-info');
        this.uploadProgress = document.getElementById('upload-progress');
        this.uploadStatus = document.getElementById('upload-status');
        this.submitBtn = document.getElementById('upload-submit-btn');

        this.setupEventListeners();
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

        // File input changes
        this.dotFileInput.addEventListener('change', (e) => {
            this.updateFileInfo(e.target, this.dotFileInfo);
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
        this.dotFileInfo.textContent = 'No file selected';
        this.uploadProgress.classList.add('hidden');
        this.submitBtn.disabled = false;
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
        const dotFile = this.dotFileInput.files[0];

        if (!dotFile) {
            alert('Please select a DOT graph file');
            return;
        }

        // Show progress
        this.uploadProgress.classList.remove('hidden');
        this.uploadStatus.textContent = 'Uploading files...';
        this.submitBtn.disabled = true;

        try {
            // Create form data
            const formData = new FormData();
            formData.append('dotFile', dotFile);

            // Upload files
            const response = await fetch('../upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.uploadStatus.textContent = 'Bundle regenerated successfully! Reloading...';

                // Wait a bit then reload the page
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                throw new Error(result.error || 'Upload failed');
            }

        } catch (error) {
            console.error('Upload error:', error);
            this.uploadStatus.textContent = `Error: ${error.message}`;
            this.submitBtn.disabled = false;

            alert(`Upload failed: ${error.message}`);
        }
    }
};
