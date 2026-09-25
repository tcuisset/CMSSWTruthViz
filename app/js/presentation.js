/**
 * presentation.js - small, opt-in bridge for embedded Reveal.js slides.
 *
 * The viewer remains fully interactive by default.  When its parent sends the
 * same slide:start/slide:stop lifecycle messages used by the deck's other
 * embedded displays, the bridge runs a short deterministic tour and then
 * leaves the normal controls available for manual exploration.
 */

(() => {
    'use strict';

    const presentation = {
        runId: 0,
        timers: [],
        collapsedControls: false,
    };

    const delay = (milliseconds, runId) => new Promise(resolve => {
        const timer = window.setTimeout(() => resolve(runId === presentation.runId), milliseconds);
        presentation.timers.push(timer);
    });

    const stopTour = () => {
        presentation.runId += 1;
        presentation.timers.splice(0).forEach(timer => window.clearTimeout(timer));
    };

    const waitForViewer = (callback, attempts = 0) => {
        if (typeof GraphManager !== 'undefined' && GraphManager.cy
            && typeof PanelManager !== 'undefined'
            && typeof KeyboardNav !== 'undefined') {
            callback();
            return;
        }
        if (attempts >= 200) {
            console.warn('Presentation tour skipped: viewer initialization did not finish.');
            return;
        }
        window.setTimeout(() => waitForViewer(callback, attempts + 1), 50);
    };

    const waitForLayout = async runId => {
        for (let attempt = 0; attempt < 160; attempt += 1) {
            if (!GraphManager.activeLayout && !GraphManager.pendingLayoutStart) {
                return true;
            }
            if (!(await delay(100, runId))) return false;
        }
        return runId === presentation.runId;
    };

    const nodeValue = (node, key) => node?.data(key);

    const particleNodes = () => GraphManager.cy.nodes().filter(node => (
        !node.hasClass('hidden') && GraphManager.truthKind(node) === 'particle'
    ));

    const firstByLevel = level => particleNodes()
        .filter(node => nodeValue(node, 'truthLevel') === level)
        .sort((left, right) => (
            Number(nodeValue(right, 'truthEnergy') || 0) - Number(nodeValue(left, 'truthEnergy') || 0)
        ))[0];

    const lineageChildren = node => node.outgoers('edge')
        .filter(edge => !edge.data('isMatchEdge'))
        .map(edge => edge.target());

    const highestEnergy = nodes => nodes
        .sort((left, right) => (
            Number(nodeValue(right, 'truthEnergy') || 0) - Number(nodeValue(left, 'truthEnergy') || 0)
        ))[0];

    // The logical graph normally inserts a decay vertex between two particles.
    // Follow that vertex so the tour advances through particle generations rather
    // than stopping on the bookkeeping node.
    const nextDecayParticle = node => {
        const children = lineageChildren(node);
        const directParticles = children.filter(child => GraphManager.truthKind(child) === 'particle');
        if (directParticles.length > 0) return highestEnergy(directParticles);

        const particlesAfterVertices = children
            .filter(child => GraphManager.isLogicalVertex(child))
            .flatMap(vertex => lineageChildren(vertex))
            .filter(child => GraphManager.truthKind(child) === 'particle');
        return highestEnergy(particlesAfterVertices);
    };

    const decayChain = (start, maximumParticles = 4) => {
        const chain = [];
        const visited = new Set();
        let current = start;

        while (current && chain.length < maximumParticles && !visited.has(current.id())) {
            chain.push(current);
            visited.add(current.id());
            current = nextDecayParticle(current);
        }

        return chain;
    };

    const checkpointParticle = () => particleNodes()
        .filter(node => String(nodeValue(node, 'hasCheckpoints')) === '1')
        .sort((left, right) => (
            Number(nodeValue(right, 'nSubgraphSimHits') || 0)
            - Number(nodeValue(left, 'nSubgraphSimHits') || 0)
        ))[0];

    const selectNode = (node, openDetails = false) => {
        if (!node || node.length === 0) return false;
        KeyboardNav.selectNode(node);
        if (openDetails) KeyboardNav.openSelected();
        return true;
    };

    const centerNode = (node, zoom = 1.5) => {
        if (!node || node.length === 0) return;
        GraphManager.cy.stop(true);
        GraphManager.cy.center(node);
        GraphManager.cy.zoom(zoom);
    };

    const setControlsCollapsed = collapsed => {
        const app = document.getElementById('app');
        const toggle = document.getElementById('controls-toggle');
        if (!app || !toggle) return;
        app.classList.toggle('controls-collapsed', collapsed);
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.textContent = collapsed ? 'Show controls' : 'Hide controls';
        GraphManager.cy?.resize();
    };

    const resetView = ({ restoreControls = false } = {}) => {
        GraphManager.clearSelectionFilter();
        GraphManager.clearSelection();
        GraphManager.clearHighlight();
        GraphManager.reset();
        PanelManager.close();
        Plot3DPanelManager.setMode('hidden');
        if (restoreControls && presentation.collapsedControls) {
            setControlsCollapsed(false);
            presentation.collapsedControls = false;
        }
    };

    const playTour = () => {
        stopTour();
        waitForViewer(async () => {
            const runId = presentation.runId;
            presentation.collapsedControls = !document.getElementById('app')
                ?.classList.contains('controls-collapsed');
            setControlsCollapsed(true);
            resetView();
            GraphManager.cancelActiveLayout({ silent: true });
            if (!(await delay(350, runId))) return;

            // First isolate the signal ancestry: this keeps the upgraded viewer's
            // truth-level colours and edge direction visible at slide scale.
            const signal = firstByLevel('signal');
            const chain = signal ? decayChain(signal) : [];
            if (signal) {
                const center = GraphManager.cy.collection([signal]);
                DependencyExplorer.showDependenciesForNodes(center, 8, 'downstream');
                GraphManager.relayoutVisible();
                if (!(await waitForLayout(runId))) return;
                selectNode(signal);
                centerNode(signal);
            }

            // Pause on successive particle generations so the audience can see
            // the decay chain unfold instead of only seeing its endpoints.
            for (const particle of chain.slice(1)) {
                if (!(await delay(1250, runId))) return;
                selectNode(particle);
                centerNode(particle);
            }

            if (!(await delay(1000, runId))) return;

            // Open the richer node record, including truth levels, hit counts,
            // generator/simulation provenance, and momentum-like quantities.
            const boundary = chain.at(-1)
                || checkpointParticle()
                || firstByLevel('reconstructableFinalState')
                || signal;
            if (boundary) {
                selectNode(boundary, true);
                centerNode(boundary, 1.0);
                const data = GraphManager.getBundleNode(boundary.id()) || boundary.data();
                if (Array.isArray(data.directHitsDetIds) && data.directHitsDetIds.length > 0) {
                    Plot3DPanelManager.setMode('subgraph');
                }
            }
        });
    };

    const handleMessage = event => {
        if (event.source !== window.parent) return;
        if (event.data === 'slide:start') playTour();
        if (event.data === 'slide:stop') {
            stopTour();
            waitForViewer(() => resetView({ restoreControls: true }));
        }
    };

    window.addEventListener('message', handleMessage);

    window.truthGraphPresentation = {
        playTour,
        stopTour,
        reset: () => {
            stopTour();
            waitForViewer(() => resetView({ restoreControls: true }));
        },
    };

    if (window.parent !== window) {
        window.parent.postMessage('truthviz:ready', '*');
    }
})();
