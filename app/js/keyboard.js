/**
 * keyboard.js - Keyboard navigation
 * Handles keyboard shortcuts for graph navigation
 */

const KeyboardNav = {
    selectedNode: null,
    helpVisible: false,

    /**
     * Initialize keyboard navigation
     */
    init() {
        this.setupKeyboardShortcuts();
        console.log('Keyboard navigation initialized');
    },

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    this.navigateUp();
                    break;

                case 'ArrowDown':
                    e.preventDefault();
                    this.navigateDown();
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    this.navigateLeft();
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    this.navigateRight();
                    break;

                case 'Enter':
                    e.preventDefault();
                    this.openSelected();
                    break;

                case 'Tab':
                    e.preventDefault();
                    this.cycleNext();
                    break;

                case 'Escape':
                    e.preventDefault();
                    this.closePanel();
                    break;

                case 'r':
                case 'R':
                    e.preventDefault();
                    this.reset();
                    break;

                case '?':
                    e.preventDefault();
                    this.toggleHelp();
                    break;

                default:
                    break;
            }
        });
    },

    /**
     * Navigate up (to node with smaller Y coordinate)
     */
    navigateUp() {
        if (!this.selectedNode) {
            this.selectFirst();
            return;
        }

        const currentPos = this.selectedNode.position();
        const candidates = GraphManager.cy.nodes()
            .filter(node => !node.hasClass('hidden'))
            .filter(node => node.position().y < currentPos.y);

        if (candidates.length > 0) {
            // Find closest node above
            let closest = candidates[0];
            let minDist = this.distance(currentPos, closest.position());

            candidates.forEach(node => {
                const dist = this.distance(currentPos, node.position());
                if (dist < minDist) {
                    minDist = dist;
                    closest = node;
                }
            });

            this.selectNode(closest);
        }
    },

    /**
     * Navigate down
     */
    navigateDown() {
        if (!this.selectedNode) {
            this.selectFirst();
            return;
        }

        const currentPos = this.selectedNode.position();
        const candidates = GraphManager.cy.nodes()
            .filter(node => !node.hasClass('hidden'))
            .filter(node => node.position().y > currentPos.y);

        if (candidates.length > 0) {
            let closest = candidates[0];
            let minDist = this.distance(currentPos, closest.position());

            candidates.forEach(node => {
                const dist = this.distance(currentPos, node.position());
                if (dist < minDist) {
                    minDist = dist;
                    closest = node;
                }
            });

            this.selectNode(closest);
        }
    },

    /**
     * Navigate left
     */
    navigateLeft() {
        if (!this.selectedNode) {
            this.selectFirst();
            return;
        }

        const currentPos = this.selectedNode.position();
        const candidates = GraphManager.cy.nodes()
            .filter(node => !node.hasClass('hidden'))
            .filter(node => node.position().x < currentPos.x);

        if (candidates.length > 0) {
            let closest = candidates[0];
            let minDist = this.distance(currentPos, closest.position());

            candidates.forEach(node => {
                const dist = this.distance(currentPos, node.position());
                if (dist < minDist) {
                    minDist = dist;
                    closest = node;
                }
            });

            this.selectNode(closest);
        }
    },

    /**
     * Navigate right
     */
    navigateRight() {
        if (!this.selectedNode) {
            this.selectFirst();
            return;
        }

        const currentPos = this.selectedNode.position();
        const candidates = GraphManager.cy.nodes()
            .filter(node => !node.hasClass('hidden'))
            .filter(node => node.position().x > currentPos.x);

        if (candidates.length > 0) {
            let closest = candidates[0];
            let minDist = this.distance(currentPos, closest.position());

            candidates.forEach(node => {
                const dist = this.distance(currentPos, node.position());
                if (dist < minDist) {
                    minDist = dist;
                    closest = node;
                }
            });

            this.selectNode(closest);
        }
    },

    /**
     * Cycle to next node
     */
    cycleNext() {
        const visibleNodes = GraphManager.cy.nodes().filter(node => !node.hasClass('hidden'));

        if (visibleNodes.length === 0) {
            return;
        }

        if (!this.selectedNode) {
            this.selectNode(visibleNodes[0]);
            return;
        }

        const currentIndex = visibleNodes.indexOf(this.selectedNode);
        const nextIndex = (currentIndex + 1) % visibleNodes.length;
        this.selectNode(visibleNodes[nextIndex]);
    },

    /**
     * Select first visible node
     */
    selectFirst() {
        const visibleNodes = GraphManager.cy.nodes().filter(node => !node.hasClass('hidden'));
        if (visibleNodes.length > 0) {
            this.selectNode(visibleNodes[0]);
        }
    },

    /**
     * Select a specific node
     */
    selectNode(node) {
        this.selectedNode = node;
        GraphManager.applySelection(node);

        // Center on node
        GraphManager.cy.animate({
            center: { eles: node },
            zoom: GraphManager.cy.zoom()
        }, {
            duration: 300
        });
    },

    /**
     * Open details for selected node
     */
    openSelected() {
        if (!this.selectedNode) {
            return;
        }

        const label = this.selectedNode.data('label');
        const nodeId = this.selectedNode.id();

        PanelManager.open(label, nodeId);
    },

    /**
     * Close panel
     */
    closePanel() {
        PanelManager.close();
    },

    /**
     * Reset view
     */
    reset() {
        GraphManager.reset();
        this.selectedNode = null;
        PanelManager.close();
    },

    /**
     * Toggle help overlay
     */
    toggleHelp() {
        if (this.helpVisible) {
            this.hideHelp();
        } else {
            this.showHelp();
        }
    },

    /**
     * Show help overlay
     */
    showHelp() {
        const helpDiv = document.createElement('div');
        helpDiv.id = 'keyboard-help';
        helpDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.95);
            color: white;
            padding: 30px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            max-width: 500px;
        `;

        helpDiv.innerHTML = `
            <h2 style="margin-top: 0; margin-bottom: 20px;">Keyboard Shortcuts</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px;"><strong>↑ ↓ ← →</strong></td><td style="padding: 8px;">Navigate nodes</td></tr>
                <tr><td style="padding: 8px;"><strong>Enter</strong></td><td style="padding: 8px;">Open details panel</td></tr>
                <tr><td style="padding: 8px;"><strong>Tab</strong></td><td style="padding: 8px;">Cycle to next node</td></tr>
                <tr><td style="padding: 8px;"><strong>Esc</strong></td><td style="padding: 8px;">Close panel</td></tr>
                <tr><td style="padding: 8px;"><strong>R</strong></td><td style="padding: 8px;">Reset view</td></tr>
                <tr><td style="padding: 8px;"><strong>?</strong></td><td style="padding: 8px;">Toggle this help</td></tr>
            </table>
            <p style="margin-top: 20px; text-align: center; color: #999;">Press ? or Esc to close</p>
        `;

        document.body.appendChild(helpDiv);
        this.helpVisible = true;
    },

    /**
     * Hide help overlay
     */
    hideHelp() {
        const helpDiv = document.getElementById('keyboard-help');
        if (helpDiv) {
            helpDiv.remove();
        }
        this.helpVisible = false;
    },

    /**
     * Calculate distance between two points
     */
    distance(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
};
