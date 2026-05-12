/**
 * export.js - Browser-side graph export helpers
 */

const ExportManager = {
    pngBtn: null,
    pdfBtn: null,

    init() {
        this.pngBtn = document.getElementById('export-png-btn');
        this.pdfBtn = document.getElementById('export-pdf-btn');

        if (!this.pngBtn || !this.pdfBtn) return;

        this.pngBtn.addEventListener('click', () => this.savePng());
        this.pdfBtn.addEventListener('click', () => this.savePdf());
    },

    getCy() {
        if (!GraphManager.cy) {
            throw new Error('Graph is not ready yet.');
        }
        return GraphManager.cy;
    },

    getBaseFilename(extension) {
        const graphName = GraphManager.graphName || window.bundleData?.metadata?.graph_name || 'truth-graph';
        const safeName = String(graphName)
            .trim()
            .replace(/[^a-z0-9_-]+/gi, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase() || 'truth-graph';

        return `${safeName}.${extension}`;
    },

    getViewportPng() {
        return this.getCy().png({
            output: 'base64uri',
            bg: '#ffffff',
            scale: 2
        });
    },

    downloadDataUrl(dataUrl, filename) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
    },

    async savePng() {
        try {
            this.downloadDataUrl(this.getViewportPng(), this.getBaseFilename('png'));
        } catch (error) {
            console.error('PNG export failed:', error);
            alert(`Could not export PNG: ${error.message}`);
        }
    },

    async savePdf() {
        try {
            if (!window.jspdf?.jsPDF) {
                throw new Error('PDF export library is not loaded.');
            }

            const cy = this.getCy();
            const container = cy.container();
            const width = Math.max(1, container.clientWidth);
            const height = Math.max(1, container.clientHeight);
            const orientation = width >= height ? 'landscape' : 'portrait';
            const pdf = new window.jspdf.jsPDF({
                orientation,
                unit: 'pt',
                format: [width, height]
            });

            pdf.addImage(this.getViewportPng(), 'PNG', 0, 0, width, height);
            pdf.save(this.getBaseFilename('pdf'));
        } catch (error) {
            console.error('PDF export failed:', error);
            alert(`Could not export PDF: ${error.message}`);
        }
    }
};
