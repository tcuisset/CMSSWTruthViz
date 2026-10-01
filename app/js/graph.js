/**
 * graph.js - Cytoscape graph visualization
 * Handles graph initialization, rendering, and interactions
 */

const GraphManager = {
    cy: null,
    fullGraph: null,
    activeLayout: null,
    activeLayoutWorker: null,
    pendingLayoutStart: null,
    layoutRunId: 0,
    canceledLayoutRunId: null,
    selectedLayoutEngine: 'dagre',
    dagreRegistered: false,
    fcoseRegistered: false,
    elkRegistered: false,
    graphName: '',
    // Truth-level filtering collapses hidden nodes: visible parents are joined to
    // visible children, so nothing is orphaned.
    hiddenTruthLevels: new Set(),
    // Pileup nodes are hidden by default alongside the truth-level filter.
    hidePileup: true,
    // The reco overlay is shown or hidden independently of truth-level filtering.
    showRecoObjects: true,
    forceAtlas2Registered: false,
    nodeTypeColors: {
        gen: '#c1daf3',
        sim: '#e4b892',
        genSim: '#2ecc71',
        event: '#c79f00'
    },

    // The logical truth graph is standalone: a node is described by its own truth
    // level, its hit footprint and its role, not by GEN or SIM provenance.
    // Fill colour carries the dominant truth level, most signal-like first.
    // Same order as TRUTH_LEVEL_ORDER in preprocess/parse_graph.py, most
    // signal-like first. This is the only place the precedence is written down.
    truthLevelOrder: [
        'signal', 'hardProcess', 'partonJets', 'bHadrons', 'cHadrons',
        'tauVisibleHadronic', 'tauVisibleLeptonic', 'visibleTau',
        'reconstructableFromSignal', 'reconstructableFinalState',
        'stableLegsFromInitialState', 'stableLegsFromUpstream',
        'stableDecayProducts', 'caloBoundary', 'underlyingEvent'
    ],
    truthLevelLabels: {
        signal: 'signal',
        hardProcess: 'hard process',
        partonJets: 'parton jet',
        bHadrons: 'b hadron',
        cHadrons: 'c hadron',
        tauVisibleHadronic: 'visible tau, hadronic',
        tauVisibleLeptonic: 'visible tau, leptonic',
        reconstructableFromSignal: 'reconstructable from signal',
        reconstructableFinalState: 'reconstructable final state',
        stableLegsFromInitialState: 'stable leg from initial state',
        stableDecayProducts: 'stable decay product',
        caloBoundary: 'calo boundary',
        underlyingEvent: 'underlying event',
        visibleTau: 'visible tau (old name)',
        stableLegsFromUpstream: 'stable leg from upstream (old name)',
        none: 'no level'
    },
    // The canvas keeps the colourblind-safe palette rather than the pale label
    // backgrounds of the DOT dump: a fill behind white text needs the contrast.
    truthLevelColors: {
        signal: '#d35fb7',
        hardProcess: '#bd1f01',
        partonJets: '#e76300',
        bHadrons: '#a96b59',
        cHadrons: '#d0a190',
        tauVisibleHadronic: '#717581',
        tauVisibleLeptonic: '#a8adb8',
        reconstructableFromSignal: '#832db6',
        reconstructableFinalState: '#c3a3e0',
        stableLegsFromInitialState: '#3f90da',
        stableDecayProducts: '#92dadd',
        caloBoundary: '#b9ac70',
        underlyingEvent: '#94a4a2',
        visibleTau: '#717581',
        stableLegsFromUpstream: '#3f90da',
        none: '#e8e8e8'
    },
    truthLevelDarkFills: new Set([
        '#bd1f01', '#e76300', '#832db6', '#3f90da', '#a96b59', '#717581', '#d35fb7'
    ]),
    truthVertexColor: '#d9d9d9',
    // upstream is the earlier name of the initial-state role, kept so a bundle built
    // before the rename still draws its artificial vertex.
    truthArtificialColors: {
        interaction: '#ffa90e',
        initialState: '#a96b59',
        upstream: '#a96b59',
        beamSideInput: '#b9ac70',
        underlyingEvent: '#94a4a2'
    },
    truthArtificialShapes: {
        interaction: 'star',
        initialState: 'pentagon',
        upstream: 'pentagon',
        beamSideInput: 'rhomboid',
        underlyingEvent: 'round-rectangle'
    },
    // Border width carries the hit footprint. No hits is drawn dashed.
    truthFootprintBorderWidths: {
        caloRec: 5,
        caloSim: 3,
        tracker: 2,
        none: 1
    },
    truthMarkerColors: {
        backscattered: '#e76300',
        checkpoints: '#009988',
        plain: '#34495e'
    },
    truthArtificialNodeSize: 64,

    // Reco overlay. A reco object is drawn as a rounded rectangle joined to the truth
    // node its association chose, and the working point decides which edge is shown.
    recoNodeSize: 46,
    // Space left between two drawn node boxes by the separation pass.
    nodeSeparationMargin: 12,
    // Cell size of the grid the crossing search uses, and how many neighbours a
    // node is tried against when the untangle pass looks for a swap.
    crossingGridCell: 300,
    untanglePartnerLimit: 10,
    // One colour per association domain of
    // SimGeneral/TruthGraphAssociatorProducers/python/truthGraphAssociationLabels_cff.py.
    recoDomainColors: {
        tracksters: '#0d7d8c',
        tracks: '#5b6ee1',
        vertices: '#8c5a8c',
        secondaryVertices: '#b07aa1',
        pfClustersEcal: '#c46a1b',
        pfClustersHcal: '#6a7b2e'
    },
    activeWorkingPoint: '',
    workingPoints: [],
    defaultNodeSize: 58,
    vertexNodeSize: 30,
    eventNodeSize: 88,
    statusOneNodeSizeMultiplier: 1.1,
    statusOneNodeColor: '#ff9589',
    smallParticlePdgIds: new Set([22, 11, -11]),

    // The truth-graph DOT dumper encodes the role of a node in its Graphviz shape.
    // Map those onto the Cytoscape shape vocabulary so the producer's intent shows
    // through (seed, muon, and the four vertex kinds are immediately recognisable).
    gvShapeToCytoscape: {
        doublecircle: 'ellipse',    // selection seed (rendered with a gold double ring)
        circle: 'ellipse',
        ellipse: 'ellipse',         // particle leaving tracker/calo hits
        oval: 'ellipse',
        hexagon: 'hexagon',         // muon
        diamond: 'diamond',         // decay / production vertex
        box: 'round-rectangle',     // underlying-event vertex
        rect: 'round-rectangle',
        rectangle: 'round-rectangle',
        house: 'pentagon',          // ISR / upstream vertex
        doubleoctagon: 'octagon',   // hard-interaction vertex
        octagon: 'octagon',
        star: 'star',
    },

    // Graphviz uses X11 colour names, several of them numbered variants
    // (darkseagreen1, goldenrod4, red2, gray20, ...) that are NOT valid CSS and
    // would render as black/transparent in the browser. Translate the ones the
    // truth-graph dumper emits to the exact hex graphviz itself uses, so the
    // interactive view matches the static SVGs. Plain CSS names pass through.
    gvColors: {
        aliceblue: '#f0f8ff', blue: '#0000ff', darkgreen: '#006400',
        darkorange3: '#cd6600', darkseagreen1: '#c1ffc1', deepskyblue: '#00bfff',
        firebrick4: '#8b1a1a', gold: '#ffd700', goldenrod4: '#8b6914',
        gray20: '#333333', gray45: '#737373', gray50: '#7f7f7f', gray55: '#8c8c8c',
        gray65: '#a6a6a6', gray75: '#bfbfbf', gray85: '#d9d9d9', gray92: '#ebebeb',
        indianred1: '#ff6a6a', khaki: '#f0e68c', lightblue: '#add8e6',
        lightskyblue: '#87cefa', mediumpurple1: '#ab82ff', navajowhite: '#ffdead',
        navy: '#000080', orangered3: '#cd3700', purple: '#a020f0', red2: '#ee0000',
        royalblue: '#4169e1', salmon: '#fa8072', sienna1: '#ff8247',
        skyblue: '#87ceeb', violetred1: '#ff3e96', white: '#ffffff',
    },

    // Translate a Graphviz colour token to a browser-safe colour: pass through
    // hex (#rrggbb) and CSS names, map known X11 names, fall back to the input.
    gvColor(name) {
        if (name === undefined || name === null) return null;
        const raw = String(name).trim();
        if (!raw) return null;
        if (raw.charAt(0) === '#') return raw;
        return this.gvColors[raw.toLowerCase()] || raw;
    },

    htmlLabelToCanvasText(value) {
        const superscriptChars = {
            '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
            '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
            '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
            'n': 'ⁿ', 'i': 'ⁱ'
        };
        const subscriptChars = {
            '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
            '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
            '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎'
        };

        const convertText = (text, replacements) => Array.from(text)
            .map(character => replacements[character] || character)
            .join('');

        const template = document.createElement('template');
        template.innerHTML = String(value);

        const nodeToText = (node, replacements = null) => {
            if (node.nodeType === Node.TEXT_NODE) {
                return replacements ? convertText(node.textContent, replacements) : node.textContent;
            }

            if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
                return '';
            }

            const tagName = node.nodeType === Node.ELEMENT_NODE ? node.tagName.toUpperCase() : '';
            const childReplacements = tagName === 'SUP'
                ? superscriptChars
                : tagName === 'SUB'
                    ? subscriptChars
                    : replacements;

            return Array.from(node.childNodes)
                .map(child => nodeToText(child, childReplacements))
                .join('');
        };

        return nodeToText(template.content);
    },

    getNodeKind(ele) {
        const explicitType = String(ele.data('type') || '').trim();
        if (explicitType) return explicitType;

        if (!this.isLogicalGraph()) return '';

        const logicalFlags = this.getLogicalFlags(ele);
        const isVertex = this.isLogicalVertex(ele);

        if (logicalFlags.hasGen && logicalFlags.hasSim) {
            return isVertex ? 'GenSimVertex' : 'GenSimParticle';
        }
        if (logicalFlags.hasGen) {
            return isVertex ? 'GenVertex' : 'GenParticle';
        }
        if (logicalFlags.hasSim) {
            return isVertex ? 'SimVertex' : 'SimTrack';
        }

        return isVertex ? 'LogicalVertex' : 'LogicalParticle';
    },

    isLogicalGraph() {
        return this.graphName === 'TruthLogicalGraph';
    },

    /**
     * Turn the association file into reco nodes and one match edge per working point.
     * The edge target is the truth node the match names, which is the same particle
     * index the graph dumper wrote, so no name lookup is needed.
     */
    // The match to draw for one working point. The Fixed map ranks every candidate root
    // by shared energy, and an ancestor always holds the hits of its descendants, so its
    // first entries are hard-process ancestors. Drawn is the best candidate that enters
    // the calorimeter (a caloBoundary member), which is the level the validation reads
    // dominance from; then any level member; then the first entry. The adaptive points
    // carry the single branch they climbed to.
    pickMatch(matches, truthNodeIds) {
        const present = (matches || []).filter(m => truthNodeIds.has(m.node));
        if (present.length === 0) return null;
        const levelsOf = (id) => {
            const node = this.getBundleNode(id) || {};
            const levels = node.truthLevels;
            return Array.isArray(levels) ? levels : (levels ? String(levels).split(',') : []);
        };
        return present.find(m => levelsOf(m.node).includes('caloBoundary'))
            || present.find(m => levelsOf(m.node).length > 0)
            || present[0];
    },

    // The collection name a reco node shows on the canvas; the hover keeps the full one.
    shortCollectionName(collection) {
        const known = {
            ticlTrackstersCLUE3DHigh: 'CLUE3D trackster',
            ticlTracksterLinks: 'linked trackster',
            ticlTracksterLinksSuperclusteringDNN: 'supercluster',
            ticlCandidate: 'TICL candidate',
            particleFlowClusterECAL: 'ECAL PF cluster',
            particleFlowClusterHCAL: 'HCAL PF cluster',
            generalTracks: 'track',
            offlinePrimaryVertices: 'primary vertex',
            inclusiveSecondaryVertices: 'secondary vertex'
        };
        return known[collection] || String(collection).replace(/^ticl/, '');
    },

    buildRecoElements(associations, truthNodeIds) {
        const nodes = [];
        const edges = [];
        if (!associations || !Array.isArray(associations.recoObjects)) {
            return { nodes, edges, workingPoints: [] };
        }

        const workingPoints = associations.workingPoints || [];
        associations.recoObjects.forEach((object) => {
            const matchesByWp = object.matches || {};
            // A reco object that no working point matched would float unattached, so it
            // is left out rather than drawn with no edge.
            const attached = workingPoints.some(wp => (matchesByWp[wp] || []).some(m => truthNodeIds.has(m.node)));
            if (!attached) return;

            nodes.push({
                data: {
                    id: object.id,
                    truthKind: 'reco',
                    recoDomain: object.domain,
                    recoCollection: object.collection,
                    recoIndex: object.index,
                    rawEnergy: object.rawEnergy,
                    truthTitle: this.shortCollectionName(object.collection),
                    truthSubtitle: `${Number(object.rawEnergy).toFixed(1)} GeV`,
                    truthHover: [
                        `${object.collection} #${object.index}`,
                        `raw energy ${Number(object.rawEnergy).toFixed(2)} GeV`,
                        `eta ${Number(object.eta).toFixed(2)}  phi ${Number(object.phi).toFixed(2)}`,
                        `${object.nLayerClusters} layer clusters`,
                        ...workingPoints.map((wp) => {
                            const best = this.pickMatch(matchesByWp[wp], truthNodeIds);
                            return best
                                ? `${wp}: ${best.node}  score ${Number(best.score).toFixed(3)}`
                                : `${wp}: no match`;
                        })
                    ].join('\n')
                }
            });

            workingPoints.forEach((wp) => {
                const best = this.pickMatch(matchesByWp[wp], truthNodeIds);
                if (!best) return;
                // The edge runs from the truth node to the reco node, so the layout
                // ranks a reco object one row below the particle it matched. The arrow
                // is drawn at the source end and still points at the truth.
                edges.push({
                    data: {
                        id: `match-${wp}-${object.id}`,
                        source: best.node,
                        target: object.id,
                        isMatchEdge: true,
                        workingPoint: wp,
                        matchScore: best.score,
                        matchSharedEnergy: best.sharedEnergy
                    }
                });
            });
        });

        return { nodes, edges, workingPoints };
    },

    /**
     * Show the match edges of one working point and hide the others, so switching the
     * point moves the match on the canvas.
     */
    setWorkingPoint(name) {
        this.activeWorkingPoint = name;
        if (!this.cy) return;

        this.cy.edges('[isMatchEdge]').forEach((edge) => {
            edge.toggleClass('inactive-match', edge.data('workingPoint') !== name);
        });

        this.setWorkingPointStatus();
    },

    setWorkingPointStatus() {
        const status = document.getElementById('working-point-status');
        if (!status || !this.cy) return;

        if (!this.showRecoObjects) {
            status.textContent = 'Reco objects are hidden.';
            return;
        }

        const name = this.activeWorkingPoint;
        const shown = this.cy.edges('[isMatchEdge]').filter(e => e.data('workingPoint') === name).length;
        status.textContent = `${shown} matched reco objects at ${name}.`;
    },

    // A node carries a truth classification when the preprocessing recognised the
    // logical graph. Graphs without it keep the legacy GEN/SIM styling.
    truthKind(ele) {
        return String(ele.data('truthKind') || '').trim();
    },

    hasTruthClassification(ele) {
        return this.truthKind(ele) !== '';
    },

    truthLevel(ele) {
        const level = String(ele.data('truthLevel') || '').trim();
        return level || 'none';
    },

    truthFootprint(ele) {
        return String(ele.data('truthFootprint') || 'none').trim();
    },

    truthRole(ele) {
        return String(ele.data('truthRole') || '').trim();
    },

    isTruthRoot(ele) {
        return String(ele.data('isRoot') || '').trim() === '1';
    },

    isBackscattered(ele) {
        return String(ele.data('backscattered') || '').trim() === '1';
    },

    hasCheckpoints(ele) {
        const count = Number.parseInt(ele.data('nCheckpoints'), 10);
        return Number.isFinite(count) && count > 0;
    },

    isTruthyAttribute(value) {
        if (value === true || value === 1) return true;
        if (value === false || value === 0 || value === null || value === undefined) return false;

        const normalized = String(value).trim().toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes';
    },

    extractLogicalFlagFromText(ele, key) {
        const text = `${ele.data('rawLabel') || ''}\n${ele.data('detailLabel') || ''}`;
        const match = text.match(new RegExp(`${key}\\s*:\\s*(yes|no|true|false|1|0)`, 'i'));
        return match ? this.isTruthyAttribute(match[1]) : false;
    },

    getLogicalFlags(ele) {
        const hasGenAttribute = ele.data('hasGen');
        const hasSimAttribute = ele.data('hasSim');

        let hasGen = hasGenAttribute !== undefined
            ? this.isTruthyAttribute(hasGenAttribute)
            : this.extractLogicalFlagFromText(ele, 'hasGen');
        let hasSim = hasSimAttribute !== undefined
            ? this.isTruthyAttribute(hasSimAttribute)
            : this.extractLogicalFlagFromText(ele, 'hasSim');

        if (!hasGen && !hasSim) {
            const domainText = `${ele.data('rawLabel') || ''}\n${ele.data('detailLabel') || ''}`;
            if (/domain\s*:\s*GEN/i.test(domainText)) hasGen = true;
            if (/domain\s*:\s*SIM/i.test(domainText)) hasSim = true;
        }

        return { hasGen, hasSim };
    },

    isLogicalGenSimNode(ele) {
        if (!this.isLogicalGraph()) return false;

        const logicalFlags = this.getLogicalFlags(ele);
        return logicalFlags.hasGen && logicalFlags.hasSim;
    },

    isLogicalVertex(ele) {
        const shape = String(ele.data('shape') || '').trim();
        return shape === 'diamond' || /^v\d+$/.test(ele.id());
    },

    getParticlePdgId(ele) {
        const rawParticleId = ele.data('pdgId') ?? ele.data('pdgid') ?? ele.data('pid') ?? ele.data('pdg');
        const particleId = Number.parseInt(rawParticleId, 10);
        return Number.isFinite(particleId) ? particleId : null;
    },

    isParticleNode(ele) {
        const type = this.getNodeKind(ele);
        if (type === 'GenParticle' || type === 'SimTrack' || type === 'GenSimParticle' || type === 'LogicalParticle') return true;

        const particleId = this.getParticlePdgId(ele);
        if (particleId !== null && particleId !== 0) return true;

        const shape = String(ele.data('shape') || '').trim();
        return shape === 'ellipse' || /^p\d+$/.test(ele.id());
    },

    getCompactLabelFromData(data) {
        // A truth-classified node carries its own two-line label: the title, which
        // is the particle name or the vertex reason, and a short second line.
        if (data.truthKind) {
            const title = this.htmlLabelToCanvasText(data.truthTitle || data.id);
            return data.truthSubtitle ? `${title}\n${data.truthSubtitle}` : title;
        }

        const dataAccessor = {
            id: () => data.id,
            data: key => data[key]
        };

        let label;
        if (this.isLogicalVertex(dataAccessor)) {
            label = this.getVertexKeyFromData(data) || data.id;
        } else if (this.isParticleNode(dataAccessor)) {
            label = this.getParticleNameFromData(data) || data.id;
        } else {
            label = data.displayLabel || data.label || data.id;
        }

        return this.htmlLabelToCanvasText(label);
    },

    getParticleNameFromData(data) {
        const explicitName = data.particleName || data.particle_name || data.niceName || data.niceParticleName;
        if (explicitName) return String(explicitName);

        const displayMatch = String(data.displayLabel || data.label || '').match(/^particle:\s*(.+)$/im);
        if (displayMatch) return displayMatch[1].trim();

        const rawMatch = String(data.rawLabel || '').match(/\bpid:\s*([^(<\n]+)/i);
        if (rawMatch) return rawMatch[1].trim();

        const particleId = data.pdgId ?? data.pdgid ?? data.pid ?? data.pdg;
        return particleId !== undefined && particleId !== null ? String(particleId) : '';
    },

    getVertexKeyFromData(data) {
        const explicitKey = data.key ?? data.vertexKey ?? data.vertex_key ?? data.barcode;
        if (explicitKey !== undefined && explicitKey !== null) return String(explicitKey);

        const text = `${data.rawLabel || ''}\n${data.detailLabel || ''}`;
        const match = text.match(/\b(?:GenVertex|SimVertex)[^<\n]*\bkey=([^\s<]+)/i)
            || text.match(/\bkey=([^\s<]+)/i);
        if (match) return match[1];

        const idMatch = String(data.id || '').match(/^v(\d+)$/);
        return idMatch ? idMatch[1] : '';
    },

    getDagreEdgeWeight(edge) {
        return 1;
    },

    hasCrossedBoundary(ele) {
        const value = ele.data('crossedBoundary');
        const value2 = ele.data("nCheckpoints");
        return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true' || value2 == "1";
    },

    hasStatusOne(ele) {
        return String(ele.data('status')).trim() === '1';
    },

    getTruthFillColor(ele) {
        const kind = this.truthKind(ele);
        if (kind === 'reco') {
            return this.recoDomainColors[String(ele.data('recoDomain') || '')] || this.recoDomainColors.tracksters;
        }
        if (kind === 'artificial') {
            return this.truthArtificialColors[this.truthRole(ele)] || this.truthArtificialColors.interaction;
        }
        if (kind === 'vertex') return this.truthVertexColor;
        return this.truthLevelColors[this.truthLevel(ele)] || this.truthLevelColors.none;
    },

    getNodeTextColor(ele) {
        if (this.truthKind(ele) === 'reco') return '#fff';
        if (!this.hasTruthClassification(ele)) return '#000';
        return this.truthLevelDarkFills.has(this.getTruthFillColor(ele)) ? '#fff' : '#000';
    },

    getNodeFillColor(ele) {
        if (this.hasTruthClassification(ele)) return this.getTruthFillColor(ele);

        if (this.hasStatusOne(ele)) return this.statusOneNodeColor;

        // The truth-graph dumper encodes detector region / role in the node fillcolor
        // (navajowhite=calo, darkseagreen1=tracker, lightskyblue=muon, gold=seed,
        // aliceblue=GEN-only, ... vertices by role). X11/SVG colour names are
        // understood directly by the browser, so honour them for logical graphs.
        if (this.isLogicalGraph()) {
            const producerFill = this.gvColor(ele.data('fillcolor'));
            if (producerFill) return producerFill;
        }

        const type = this.getNodeKind(ele);
        if (type.startsWith('GenSim')) return this.nodeTypeColors.genSim;
        if (type === 'GenEvent') return this.nodeTypeColors.event;
        if (type.startsWith('Gen')) return this.nodeTypeColors.gen;
        if (type.startsWith('Sim')) return this.nodeTypeColors.sim;

        const fillcolor = ele.data('fillcolor');
        if (fillcolor === 'green') return '#2ecc71';
        if (fillcolor === 'lightgrey') return '#d3d3d3';
        return '#3498db';
    },

    isSeedNode(ele) {
        return String(ele.data('shape') || '').trim().toLowerCase() === 'doublecircle';
    },

    getNodeShape(ele) {
        const truthKind = this.truthKind(ele);
        if (truthKind === 'reco') return 'round-rectangle';
        if (truthKind === 'artificial') {
            return this.truthArtificialShapes[this.truthRole(ele)] || 'star';
        }
        if (truthKind === 'vertex') return 'diamond';
        if (truthKind === 'particle') return 'ellipse';

        if (this.hasStatusOne(ele)) return 'rectangle';

        // Honour the producer's shape encoding (seed/muon/vertex kinds) when we can
        // map it; fall back to the kind-based shapes for graphs that do not set it.
        if (this.isLogicalGraph()) {
            const gvShape = String(ele.data('shape') || '').trim().toLowerCase();
            const mapped = this.gvShapeToCytoscape[gvShape];
            if (mapped) return mapped;
        }

        const type = this.getNodeKind(ele);
        if (type === 'GenEvent') return 'star';
        if (type === 'GenVertex' || type === 'SimVertex' || type === 'GenSimVertex' || type === 'LogicalVertex') return 'diamond';
        if (type === 'GenParticle' || type === 'SimTrack' || type === 'GenSimParticle' || type === 'LogicalParticle') return 'ellipse';
        if (this.isParticleNode(ele)) return 'ellipse';

        const shape = ele.data('shape');
        if (shape === 'diamond') return 'diamond';
        if (shape === 'ellipse') return 'ellipse';
        if (shape === 'box') return 'rectangle';
        return 'rectangle';
    },

    getNodeSize(ele) {
        const truthKind = this.truthKind(ele);
        if (truthKind === 'reco') return this.recoNodeSize;
        if (truthKind === 'artificial') return this.truthArtificialNodeSize;
        if (truthKind === 'vertex') return this.vertexNodeSize;
        if (truthKind === 'particle') {
            const particleId = this.getParticlePdgId(ele);
            const scale = this.smallParticlePdgIds.has(particleId) ? 0.8 : 1;
            return this.defaultNodeSize * scale;
        }

        const type = this.getNodeKind(ele);
        if (type === 'GenEvent') return this.eventNodeSize;
        if (type === 'GenVertex' || type === 'SimVertex' || type === 'GenSimVertex' || type === 'LogicalVertex') return this.vertexNodeSize;
        if (this.isLogicalVertex(ele)) return this.vertexNodeSize;
        if (type === 'GenParticle' || type === 'SimTrack' || type === 'GenSimParticle' || type === 'LogicalParticle' || this.isParticleNode(ele)) {
            const particleId = this.getParticlePdgId(ele);
            const scale = this.smallParticlePdgIds.has(particleId) ? 0.5 : 1;
            const statusScale = this.hasStatusOne(ele) ? this.statusOneNodeSizeMultiplier : 1;
            return this.defaultNodeSize * scale * statusScale;
        }
        return this.defaultNodeSize;
    },

    // Particles and reco objects carry their text inside the node, so they are wider
    // than tall; vertices keep their label below the diamond and stay square.
    getNodeWidth(ele) {
        const size = this.getNodeSize(ele);
        const truthKind = this.truthKind(ele);
        if (truthKind === 'particle') return size * 1.8;
        if (truthKind === 'reco') return size * 2.3;
        if (truthKind === 'vertex' || truthKind === 'artificial') return size;
        return this.isParticleNode(ele) ? size * 1.8 : size;
    },

    getNodeFontSize(ele) {
        const truthKind = this.truthKind(ele);
        if (truthKind === 'reco') return 10;
        if (truthKind === 'artificial') return 11;
        if (truthKind === 'vertex') return 8;
        if (truthKind === 'particle') return 14;

        const type = this.getNodeKind(ele);
        if (type === 'GenVertex' || type === 'SimVertex' || type === 'GenSimVertex' || type === 'LogicalVertex' || this.isLogicalVertex(ele)) {
            return 10;
        }
        return 20;
    },

    getNodeBorderColor(ele) {
        if (this.hasTruthClassification(ele)) {
            if (this.isBackscattered(ele)) return this.truthMarkerColors.backscattered;
            if (this.hasCheckpoints(ele)) return this.truthMarkerColors.checkpoints;
            return this.truthMarkerColors.plain;
        }

        if (this.hasCrossedBoundary(ele)) return '#e804ec';

        // Honour the producer's border colour (the dumper outlines seeds in gold,
        // muons in navy, vertices by role); fall back to the default slate.
        const color = this.gvColor(ele.data('color'));
        return color || '#34495e';
    },

    getNodeBorderWidth(ele) {
        if (this.hasTruthClassification(ele)) {
            if (this.truthKind(ele) !== 'particle') return 1;
            return this.truthFootprintBorderWidths[this.truthFootprint(ele)] ?? 1;
        }

        if (this.hasCrossedBoundary(ele)) return 3;

        // Honour the producer's penwidth so seeds (penwidth 3) and muons stand out.
        const penwidth = Number.parseFloat(ele.data('penwidth'));
        if (Number.isFinite(penwidth) && penwidth > 0) {
            return Math.min(6, Math.max(1, penwidth));
        }
        return 1;
    },

    /**
     * Initialize Cytoscape graph with data
     */
    init(data) {
        console.log('Initializing graph with', data.nodes.length, 'nodes and', data.edges.length, 'edges');
        this.graphName = data.metadata?.graph_name || data.graph_name || '';
        this._simHitInformation = undefined;
        this.updateLegend();
        this.registerLayoutExtensions();

        // Reco overlay, when the job also produced the associations.
        const truthNodeIds = new Set(data.nodes.map(n => n.id));
        const reco = this.buildRecoElements(window.associationData, truthNodeIds);
        this.workingPoints = reco.workingPoints;
        this.activeWorkingPoint = reco.workingPoints[0] || '';

        // Convert data to Cytoscape format
        const elements = {
            nodes: data.nodes.map(n => ({
                data: {
                    id: n.id,
                    ...n,
                    label: this.getCompactLabelFromData(n)
                }
            })).concat(reco.nodes.map(n => ({
                data: { ...n.data, label: this.getCompactLabelFromData(n.data) }
            }))),
            edges: reco.edges.concat(data.edges.map(e => ({
                data: {
                    id: `${e.source}-${e.target}`,
                    source: e.source,
                    target: e.target,
                    ...e
                }
            })))
        };

        // Initialize Cytoscape
        this.cy = cytoscape({
            container: document.getElementById('cy'),
            elements: elements,

            style: [
                // Node styles
                {
                    selector: 'node',
                    style: {
                        'padding': 2,
                        'label': 'data(label)',
                        'text-valign': function(ele) {
                            return GraphManager.truthKind(ele) === 'vertex' ? 'bottom' : 'center';
                        },
                        'text-halign': 'center',
                        'text-margin-y': function(ele) {
                            return GraphManager.truthKind(ele) === 'vertex' ? 3 : 0;
                        },
                        'font-size': function(ele) {
                            return GraphManager.getNodeFontSize(ele);
                        },
                        'font-weight': 600,
                        'text-wrap': 'wrap',
                        'text-max-width': function(ele) {
                            // The vertex four-position needs one line, not the width
                            // of the diamond it sits under.
                            if (GraphManager.truthKind(ele) === 'vertex') return 190;
                            const width = GraphManager.getNodeWidth(ele);
                            return Number.isFinite(width) ? Math.max(22, width - 4) : 80;
                        },
                        'line-height': 1.1,
                        'color': function(ele) {
                            return GraphManager.getNodeTextColor(ele);
                        },
                        'text-background-opacity': 0,
                        'text-background-padding': 0,
                        'text-background-shape': 'roundrectangle',
                        'background-color': function(ele) {
                            return GraphManager.getNodeFillColor(ele);
                        },
                        'border-width': function(ele) {
                            return GraphManager.getNodeBorderWidth(ele);
                        },
                        'border-color': function(ele) {
                            return GraphManager.getNodeBorderColor(ele);
                        },
                        'shape': function(ele) {
                            return GraphManager.getNodeShape(ele);
                        },
                        'width': function(ele) {
                            return GraphManager.getNodeWidth(ele);
                        },
                        'height': function(ele) {
                            return GraphManager.getNodeSize(ele);
                        },
                        'border-style': function(ele) {
                            if (GraphManager.hasTruthClassification(ele)) {
                                if (GraphManager.isTruthRoot(ele)) return 'double';
                                if (GraphManager.truthKind(ele) === 'particle'
                                    && GraphManager.truthFootprint(ele) === 'none') return 'dashed';
                                return 'solid';
                            }
                            if (GraphManager.hasCrossedBoundary(ele)) return 'double';
                            // Evoke the producer's doublecircle seed marker.
                            if (GraphManager.isSeedNode(ele)) return 'double';
                            return 'solid';
                        }
                    }
                },
                // Highlighted node
                {
                    selector: 'node.highlighted',
                    style: {
                        'border-width': 4,
                        'border-color': '#e74c3c',
                        'z-index': 9999
                    }
                },
                // Selected node
                {
                    selector: 'node.selected',
                    style: {
                        'border-width': 4,
                        'border-color': '#f39c12',
                        'z-index': 9998
                    }
                },
                // Dimmed node
                {
                    selector: 'node.dimmed',
                    style: {
                        'opacity': 0.3
                    }
                },
                // Hidden node
                {
                    selector: 'node.hidden',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'node.truth-level-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'node.reco-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                // Edge styles
                {
                    selector: 'edge',
                    style: {
                        // Honour the producer's edge width: the dumper encodes
                        // provenance as red2/penwidth 2.4 (signal), blue/1.3
                        // (underlying event), gray20/dashed/0.8 (the rest).
                        'width': function(ele) {
                            const penwidth = Number.parseFloat(ele.data('penwidth'));
                            return Number.isFinite(penwidth) && penwidth > 0
                                ? Math.min(6, Math.max(0.8, penwidth))
                                : 1;
                        },
                        'line-style': function(ele) {
                            return String(ele.data('style') || '').toLowerCase().includes('dashed')
                                ? 'dashed'
                                : 'solid';
                        },
                        'line-color': function(ele) {
                            return GraphManager.gvColor(ele.data('color')) || '#95a5a6';
                        },
                        'target-arrow-color': function(ele) {
                            return GraphManager.gvColor(ele.data('color')) || '#95a5a6';
                        },
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'arrow-scale': 1.2
                    }
                },
                // Hidden edge
                {
                    selector: 'edge.hidden',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'edge.truth-level-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'edge.reco-filtered',
                    style: {
                        'display': 'none'
                    }
                },
                {
                    selector: 'edge[isMatchEdge]',
                    style: {
                        'line-style': 'dashed',
                        'line-color': '#0d7d8c',
                        'source-arrow-color': '#0d7d8c',
                        'source-arrow-shape': 'triangle',
                        'target-arrow-shape': 'none',
                        'curve-style': 'bezier',
                        'width': function(ele) {
                            const shared = Number.parseFloat(ele.data('matchSharedEnergy'));
                            if (!Number.isFinite(shared) || shared <= 0) return 1.5;
                            return Math.min(7, 1.5 + Math.sqrt(shared) * 12);
                        },
                        'opacity': 0.95,
                        'z-index': 20
                    }
                },
                {
                    selector: 'edge.inactive-match',
                    style: {
                        'display': 'none'
                    }
                },
                // Dimmed edge
                {
                    selector: 'edge.dimmed',
                    style: {
                        'opacity': 0.2
                    }
                },
                // Highlighted edge
                {
                    selector: 'edge.highlighted',
                    style: {
                        'width': 3,
                        'line-color': '#e74c3c',
                        'target-arrow-color': '#e74c3c',
                        'arrow-scale': 1.6,
                        'z-index': 9997
                    }
                },
                // Selected edge
                {
                    selector: 'edge.selected',
                    style: {
                        'width': 3,
                        'line-color': '#f39c12',
                        'target-arrow-color': '#f39c12',
                        'arrow-scale': 1.6,
                        'z-index': 9996
                    }
                }
            ],

            layout: {
                name: 'preset',
                fit: false
            },

            minZoom: 0.02,
            maxZoom: 3,
            wheelSensitivity: 0.2
        });

        // Store full graph for reset
        this.fullGraph = this.cy.elements().clone();

        // Event handlers
        this.setupEventHandlers();
        this.setupViewOptions();
        this.applyTruthLevelFilter();
        this.relayoutVisible();

        console.log('Graph initialized successfully');
        return this.cy;
    },

    /**
     * Register optional Cytoscape layout extensions loaded from index.html.
     */
    registerLayoutExtensions() {
        if (!this.dagreRegistered && typeof cytoscapeDagre === 'function') {
            try {
                cytoscape.use(cytoscapeDagre);
                this.dagreRegistered = true;
            } catch (error) {
                console.warn('Could not register cytoscape-dagre', error);
            }
        }

        if (!this.fcoseRegistered && typeof cytoscapeFcose === 'function') {
            try {
                cytoscape.use(cytoscapeFcose);
                this.fcoseRegistered = true;
            } catch (error) {
                console.warn('Could not register cytoscape-fcose', error);
            }
        }

        if (!this.forceAtlas2Registered && typeof ForceAtlas2Layout === 'function') {
            // The layout registers itself when it is loaded next to cytoscape; this
            // only records that it is there.
            this.forceAtlas2Registered = true;
        }

        if (!this.elkRegistered && typeof cytoscapeElk === 'function') {
            try {
                cytoscape.use(cytoscapeElk);
                this.elkRegistered = true;
            } catch (error) {
                console.warn('Could not register cytoscape-elk', error);
            }
        }
    },

    /**
     * Layout configuration for the selected engine.
     */
    getLayoutConfig() {
        if (this.selectedLayoutEngine === 'fcose' && this.fcoseRegistered) {
            return {
                name: 'fcose',
                quality: 'proof',
                randomize: true,
                animate: false,
                fit: false,
                padding: 40,

                // A particle box is three times wider than a vertex box, and a vertex
                // draws its label under the diamond, so the force model must use the
                // real size of each node and the size of its label.
                uniformNodeDimensions: false,
                nodeDimensionsIncludeLabels: true,

                packComponents: true,

                samplingType: true,
                sampleSize: 50,
                nodeSeparation: 500,

                nodeRepulsion: () => 20000,
                idealEdgeLength: () => 150,
                edgeElasticity: () => 0.2,
                gravity: 0.05,
                gravityRange: 4.5,

                numIter: 30000,
                tile: true,
                tilingPaddingVertical: 20,
                tilingPaddingHorizontal: 20
            };
        }

        if (this.selectedLayoutEngine === 'forceatlas2' && this.forceAtlas2Registered) {
            return {
                name: 'forceatlas2',
                animate: false,
                fit: false,
                padding: 40,
                // Gephi's defaults, with the two switches that suit a truth graph: a
                // vertex with many daughters pushes them apart instead of pulling them
                // together, and the node sizes keep the drawn boxes from settling on
                // top of each other.
                iterations: 400,
                gravity: 1,
                scalingRatio: 10,
                outboundAttractionDistribution: true,
                adjustSizes: true,
                barnesHutTheta: 0.6,
                nodeSize: (node) => {
                    const box = node.boundingBox({ includeLabels: true, includeOverlays: false });
                    return Math.max(box.w, box.h) / 2 + this.nodeSeparationMargin / 2;
                }
            };
        }

        if (this.selectedLayoutEngine === 'elk' && this.elkRegistered) {
            return {
                name: 'elk',
                animate: false,
                fit: false,
                nodeDimensionsIncludeLabels: true,
                elk: {
                    algorithm: 'layered',
                    'elk.direction': 'DOWN',
                    'elk.layered.spacing.nodeNodeBetweenLayers': 70,
                    'elk.spacing.nodeNode': 40,
                    'elk.spacing.edgeNode': 20,
                    'elk.spacing.edgeEdge': 12,
                    'elk.edgeRouting': 'ORTHOGONAL'

                    // algorithm: 'stress', // Never ending.....
                    // 'elk.stress.iterationLimit':10,

                        //   algorithm: 'disco',
                        // componentLayoutAlgorithm: 'stress',
                        // 'elk.stress.iterationLimit':10,
                }
            };
        }

        if (this.dagreRegistered) {
            return {
                name: 'dagre',
                animate: false,
                nodeDimensionsIncludeLabels: true,
                rankDir: 'TB',
                ranker: 'network-simplex',
                nodeSep: 45,
                edgeSep: 10,
                rankSep: 90,
                spacingFactor: 1.0,
                fit: false,
                padding: 30,
                edgeWeight: edge => this.getDagreEdgeWeight(edge)
            };
        }

        return {
            name: 'breadthfirst',
            animate: false,
            directed: true,
            spacingFactor: 1.1,
            fit: false,
            padding: 30
        };
    },

    /**
     * Setup event handlers for graph interactions
     */
    setupEventHandlers() {
        // Node click - open panel and select the node
        this.cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            const nodeId = node.id();
            const label = node.data('label');

            console.log('Node clicked:', label);
            this.applySelection(node);
            PanelManager.open(label, nodeId);
        });

        // Edge click - jump to the endpoint furthest from the current view center.
        this.cy.on('tap', 'edge', (evt) => {
            const edge = evt.target;
            const destination = this.getFurthestEdgeEndpoint(edge);

            if (destination) {
                this.focusNode(destination);
            }
        });

        this.cy.on('mouseover', 'edge', () => {
            this.cy.container().style.cursor = 'pointer';
        });

        this.cy.on('mouseout', 'edge', () => {
            this.cy.container().style.cursor = '';
        });

        // Node hover - expand the two-line label into the full summary
        this.cy.on('mouseover', 'node', (evt) => {
            const node = evt.target;
            node.style('text-background-color', 'rgba(255, 255, 255, 0.9)');
            this.showNodeTooltip(node, evt.renderedPosition);
        });

        this.cy.on('mousemove', 'node', (evt) => {
            this.moveNodeTooltip(evt.renderedPosition);
        });

        this.cy.on('mouseout', 'node', (evt) => {
            const node = evt.target;
            node.style('text-background-color', 'rgba(255, 255, 255, 0.7)');
            this.hideNodeTooltip();
        });

        this.cy.on('pan zoom', () => this.hideNodeTooltip());

        // Background click - clear selection
        this.cy.on('tap', (evt) => {
            if (evt.target === this.cy) {
                this.clearSelection();
            }
        });
    },

    /**
     * Show the legend that matches the loaded graph. The logical truth graph is
     * standalone, so its legend replaces the GEN/SIM one rather than adding to it.
     */
    updateLegend() {
        const truthLegend = document.getElementById('legend-truth');
        const genSimLegend = document.getElementById('legend-gensim');
        if (!truthLegend || !genSimLegend) return;

        const isTruth = this.isLogicalGraph();
        truthLegend.classList.toggle('hidden', !isTruth);
        genSimLegend.classList.toggle('hidden', isTruth);

        // Truth-level options have no meaning in the raw GEN/SIM graph.
        document.querySelectorAll('.truth-only').forEach((element) => {
            element.classList.toggle('hidden', !isTruth);
        });
    },

    /**
     * Return the element that carries the hover summary, creating it on first use.
     */
    nodeTooltipElement() {
        if (!this._nodeTooltip) {
            const element = document.createElement('div');
            element.id = 'node-tooltip';
            element.className = 'hidden';
            document.body.appendChild(element);
            this._nodeTooltip = element;
        }
        return this._nodeTooltip;
    },

    /**
     * Show the full node summary next to the cursor. The canvas label stays at
     * two lines, so the rest of the truth information appears only on hover.
     */
    showNodeTooltip(node, renderedPosition) {
        const text = node.data('truthHover') || node.data('tooltip') || node.data('detailLabel');
        if (!text) return;

        const element = this.nodeTooltipElement();
        element.textContent = this.htmlLabelToCanvasText(text);
        element.classList.remove('hidden');
        this.moveNodeTooltip(renderedPosition);
    },

    moveNodeTooltip(renderedPosition) {
        if (!this._nodeTooltip || this._nodeTooltip.classList.contains('hidden')) return;
        if (!renderedPosition) return;

        const container = this.cy.container().getBoundingClientRect();
        const element = this._nodeTooltip;
        const left = container.left + renderedPosition.x + 16;
        const top = container.top + renderedPosition.y + 16;
        const maxLeft = window.innerWidth - element.offsetWidth - 8;
        const maxTop = window.innerHeight - element.offsetHeight - 8;

        element.style.left = `${Math.max(8, Math.min(left, maxLeft))}px`;
        element.style.top = `${Math.max(8, Math.min(top, maxTop))}px`;
    },

    hideNodeTooltip() {
        if (this._nodeTooltip) this._nodeTooltip.classList.add('hidden');
    },

    /**
     * Setup graph-level view option controls.
     */
    setupLegendToggle() {
        const toggle = document.getElementById('legend-toggle');
        const legend = document.getElementById('legend');
        if (!toggle || !legend) return;

        toggle.addEventListener('click', () => {
            const collapsed = legend.classList.toggle('collapsed');
            toggle.setAttribute('aria-expanded', String(!collapsed));
        });
    },

    /**
     * Build the truth-level check list and wire its controls.
     */
    setupTruthFilters() {
        const levelFilter = document.getElementById('level-filter');
        if (levelFilter && this.isLogicalGraph()) {
            levelFilter.classList.remove('hidden');
        }

        const items = document.getElementById('level-filter-items');
        if (!items) return;

        items.innerHTML = '';
        const levels = this.levelsForControls();
        levels.forEach((level) => {
            const label = document.createElement('label');
            label.className = 'checkbox-label level-filter-item';

            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = !this.hiddenTruthLevels.has(level);
            box.dataset.level = level;
            box.addEventListener('change', () => this.setTruthLevelVisible(level, box.checked));

            const swatch = document.createElement('span');
            swatch.className = 'level-filter-swatch';
            swatch.style.background = this.truthLevelColors[level] || this.truthLevelColors.none;

            label.appendChild(box);
            label.appendChild(swatch);
            label.appendChild(document.createTextNode(this.truthLevelLabels[level] || level));
            items.appendChild(label);
        });

        const hidePileup = document.getElementById('hide-pileup-checkbox');
        if (hidePileup) {
            hidePileup.checked = this.hidePileup;
            hidePileup.onchange = () => this.setPileupHidden(hidePileup.checked);
        }

        const setAll = (visible) => {
            items.querySelectorAll('input[type="checkbox"]').forEach((box) => { box.checked = visible; });
            this.hiddenTruthLevels = visible ? new Set() : new Set(levels);
            this.applyTruthLevelFilter();
            this.relayoutVisible();
        };

        const allButton = document.getElementById('level-filter-all');
        if (allButton) allButton.addEventListener('click', () => setAll(true));
        const noneButton = document.getElementById('level-filter-none');
        if (noneButton) noneButton.addEventListener('click', () => setAll(false));
    },

    /**
     * The dominant levels the filter list and the legend show. Filtering uses the
     * dominant level as a partition, so a level carried only as a secondary tag
     * must not be presented as a control that appears to filter independently.
     */
    levelsForControls() {
        const present = new Set();
        if (this.cy) {
            this.cy.nodes().forEach(node => {
                if (this.truthKind(node) === 'particle') {
                    present.add(this.truthLevel(node));
                }
            });
        }
        const levels = this.truthLevelOrder.filter(level => present.has(level));
        // Keep a visible control even for a logical bundle whose particles carry
        // no level metadata yet; that value is still a valid filter category.
        if (present.has('none') || levels.length === 0) levels.push('none');
        return levels;
    },

    /**
     * Fill the truth-level legend from the same vocabulary the filters use, so the
     * two can never drift apart.
     */
    buildLevelLegend() {
        const container = document.getElementById('legend-levels');
        if (!container) return;

        container.innerHTML = '';
        this.levelsForControls().forEach((level) => {
            const item = document.createElement('div');
            item.className = 'legend-item';

            const swatch = document.createElement('div');
            swatch.className = 'legend-color';
            swatch.style.background = this.truthLevelColors[level] || this.truthLevelColors.none;

            const text = document.createElement('span');
            text.textContent = this.truthLevelLabels[level] || level;

            item.appendChild(swatch);
            item.appendChild(text);
            container.appendChild(item);
        });
    },

    /**
     * Let the control bar fold away, so the graph gets the whole window. The
     * button stays visible, and H toggles it from the keyboard.
     */
    setupControlsToggle() {
        const toggle = document.getElementById('controls-toggle');
        const app = document.getElementById('app');
        if (!toggle || !app) return;

        const apply = () => {
            const collapsed = app.classList.contains('controls-collapsed');
            const searchControls = document.getElementById('search-controls');
            if (collapsed && searchControls) searchControls.open = true;
            toggle.setAttribute('aria-expanded', String(!collapsed));
            toggle.textContent = collapsed ? 'Show controls' : 'Hide controls';
            if (this.cy) this.cy.resize();
        };

        toggle.addEventListener('click', () => {
            app.classList.toggle('controls-collapsed');
            apply();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'h' && event.key !== 'H') return;
            const target = event.target;
            const tag = target && target.tagName ? target.tagName.toUpperCase() : '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (target && target.isContentEditable) return;

            app.classList.toggle('controls-collapsed');
            apply();
        });

        apply();
    },

    /**
     * Build the working-point selector from what the association file carries, and
     * apply the first point. Hidden when the job produced no associations.
     */
    setupWorkingPointControl() {
        const container = document.getElementById('working-point-control');
        if (!container) return;

        if (this.workingPoints.length === 0) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');

        const showReco = document.getElementById('show-reco-checkbox');
        if (showReco) {
            showReco.checked = this.showRecoObjects;
            showReco.onchange = () => this.setShowRecoObjects(showReco.checked);
        }

        const items = document.getElementById('working-point-items');
        items.innerHTML = '';
        this.workingPoints.forEach((name) => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'working-point';
            radio.value = name;
            radio.checked = name === this.activeWorkingPoint;
            radio.addEventListener('change', () => {
                if (radio.checked) this.setWorkingPoint(name);
            });

            label.appendChild(radio);
            label.appendChild(document.createTextNode(name));
            items.appendChild(label);
        });

        this.applyRecoFilter();
        this.setWorkingPoint(this.activeWorkingPoint);
    },

    setupViewOptions() {
        this.setupLegendToggle();
        this.setupWorkingPointControl();
        this.setupControlsToggle();
        this.buildLevelLegend();
        this.setupTruthFilters();

        const layoutEngineSelect = document.getElementById('layout-engine-select');
        if (layoutEngineSelect) {
            layoutEngineSelect.value = this.selectedLayoutEngine;
        }

        const layoutApplyBtn = document.getElementById('layout-apply-btn');
        if (layoutApplyBtn) {
            layoutApplyBtn.addEventListener('click', () => {
                this.setLayoutEngine(layoutEngineSelect ? layoutEngineSelect.value : this.selectedLayoutEngine);
            });
        }

        const layoutCancelBtn = document.getElementById('layout-cancel-btn');
        if (layoutCancelBtn) {
            layoutCancelBtn.addEventListener('click', () => this.cancelActiveLayout());
        }
    },

    /**
     * Switch layout engines and recompute positions for visible elements.
     */
    setLayoutEngine(engine) {
        if (engine !== 'dagre' && engine !== 'fcose' && engine !== 'elk') {
            return;
        }

        this.selectedLayoutEngine = engine;
        this.relayoutVisible();
    },

    /**
     * Hide truth nodes rejected by the active filters, then join the visible
     * parents of hidden nodes to their visible children.
     */
    applyTruthLevelFilter() {
        this.cy.edges('[isTruthLevelBypass]').remove();
        this.cy.nodes().removeClass('truth-level-filtered');
        this.cy.edges().removeClass('truth-level-filtered');

        let hiddenNodes = this.cy.nodes().filter(node => this.isTruthLevelFiltered(node));
        if (hiddenNodes.length === 0) {
            this.reportFilterState();
            return;
        }

        hiddenNodes = this.withDanglingVerticesHidden(hiddenNodes);
        hiddenNodes.addClass('truth-level-filtered');
        hiddenNodes.connectedEdges().addClass('truth-level-filtered');
        this.addTruthLevelBypassEdges(hiddenNodes);
        this.reportFilterState();
    },

    /**
     * Show how many nodes survive the filters, and warn when a filter cannot run.
     */
    reportFilterState() {
        const status = document.getElementById('filter-status');
        if (!status) return;

        const total = this.cy.nodes().length;
        const visible = this.getVisibleNodes().length;
        status.textContent = `Showing ${visible} of ${total} nodes.`;
    },

    /**
     * Add to the hidden set every vertex that filtering has left dangling, and
     * repeat until nothing more dangles, because hiding one vertex can strand the
     * next. A vertex dangles when it once had parents and no visible node is
     * reachable upstream of it, or it once had children and none is reachable
     * downstream. Reachability is judged through the hidden nodes, the same walk
     * the bypass edges follow, so a vertex whose daughters are hidden but whose
     * grand-daughters are visible stays: the bypass reconnects it.
     *
     * The test is against what the node originally had, so a true source or sink
     * of the graph is never removed and an unfiltered graph is left untouched.
     */
    withDanglingVerticesHidden(hiddenNodes) {
        let hidden = hiddenNodes;
        let hiddenIds = new Set(hidden.map(node => node.id()));

        for (let pass = 0; pass < 100; pass++) {
            const dangling = this.cy.nodes().filter((node) => {
                if (hiddenIds.has(node.id())) return false;
                const kind = this.truthKind(node);
                if (kind !== 'vertex' && kind !== 'artificial') return false;

                const hadParents = node.incomers('node').length > 0;
                const hadChildren = node.outgoers('node').length > 0;

                if (hadParents && this.getVisibleBoundaryNodes(node, 'in', hiddenIds).length === 0) return true;
                if (hadChildren && this.getVisibleBoundaryNodes(node, 'out', hiddenIds).length === 0) return true;
                return false;
            });

            if (dangling.length === 0) break;

            hidden = hidden.union(dangling);
            hiddenIds = new Set(hidden.map(node => node.id()));
        }

        return hidden;
    },

    /**
     * Report whether the active truth filters reject this node. The pileup flag
     * applies to every node carrying it; level selection applies to particles.
     */
    isTruthLevelFiltered(node) {
        if (this.hidePileup && this.isTruthyAttribute(node.data('truthPileup'))) return true;
        if (!this.hasTruthClassification(node)) return false;
        return this.truthKind(node) === 'particle'
            && this.hiddenTruthLevels.has(this.truthLevel(node));
    },

    setPileupHidden(shouldHide) {
        this.hidePileup = shouldHide;
        this.applyTruthLevelFilter();
        this.relayoutVisible();
    },

    setShowRecoObjects(shouldShow) {
        this.showRecoObjects = shouldShow;
        this.applyRecoFilter();
        this.relayoutVisible();
    },

    /**
     * Show or hide the reco overlay. A reco object is only ever the target of a
     * match edge, so hiding it strands no truth node and needs no bypass edge.
     */
    applyRecoFilter() {
        if (!this.cy) return;

        const hide = !this.showRecoObjects;
        this.cy.nodes().filter(node => this.truthKind(node) === 'reco').toggleClass('reco-filtered', hide);
        this.cy.edges('[isMatchEdge]').toggleClass('reco-filtered', hide);
        this.setWorkingPointStatus();
    },

    setTruthLevelVisible(level, visible) {
        if (visible) {
            this.hiddenTruthLevels.delete(level);
        } else {
            this.hiddenTruthLevels.add(level);
        }
        this.applyTruthLevelFilter();
        this.relayoutVisible();
    },

    addTruthLevelBypassEdges(hiddenNodes) {
        const hiddenIds = new Set(hiddenNodes.map(node => node.id()));
        const edgeKeys = new Set(this.cy.edges().map(edge => `${edge.source().id()}->${edge.target().id()}`));
        const bypassEdges = [];

        hiddenNodes.forEach(node => {
            const parents = this.getVisibleBoundaryNodes(node, 'in', hiddenIds);
            const children = this.getVisibleBoundaryNodes(node, 'out', hiddenIds);

            parents.forEach(parent => {
                children.forEach(child => {
                    if (parent.id() === child.id()) {
                        return;
                    }

                    const edgeKey = `${parent.id()}->${child.id()}`;
                    if (edgeKeys.has(edgeKey)) {
                        return;
                    }

                    edgeKeys.add(edgeKey);
                    bypassEdges.push({
                        group: 'edges',
                        data: {
                            id: `truth-level-bypass-${parent.id()}-${child.id()}`,
                            source: parent.id(),
                            target: child.id(),
                            isTruthLevelBypass: true
                        }
                    });
                });
            });
        });

        if (bypassEdges.length > 0) {
            this.cy.add(bypassEdges);
        }
    },

    getVisibleBoundaryNodes(startNode, direction, hiddenIds) {
        const visited = new Set([startNode.id()]);
        const stack = [startNode];
        const boundaryNodes = this.cy.collection();
        const useIncoming = direction === 'in';

        while (stack.length > 0) {
            const node = stack.pop();
            const edges = useIncoming ? node.incomers('edge') : node.outgoers('edge');

            edges.forEach(edge => {
                if (edge.data('isTruthLevelBypass')) {
                    return;
                }

                const nextNode = useIncoming ? edge.source() : edge.target();
                if (visited.has(nextNode.id())) {
                    return;
                }

                visited.add(nextNode.id());
                if (hiddenIds.has(nextNode.id())) {
                    stack.push(nextNode);
                } else {
                    boundaryNodes.merge(nextNode);
                }
            });
        }

        return boundaryNodes;
    },

    /**
     * Highlight a specific node
     */
    highlightNode(nodeId) {
        this.clearHighlight();
        const node = this.cy.getElementById(nodeId);
        if (node.length > 0) {
            node.addClass('highlighted');
            node.connectedEdges().addClass('highlighted');
            this.cy.animate({
                center: { eles: node },
                zoom: 1.5
            }, {
                duration: 500
            });
            return true;
        }
        return false;
    },

    /**
     * Select and center the graph on a node.
     */
    focusNode(node) {
        this.applySelection(node);

        this.cy.animate({
            center: { eles: node },
            zoom: this.cy.zoom()
        }, {
            duration: 300
        });
    },

    /**
     * Mark a node and its connected arrows as selected.
     */
    applySelection(node) {
        this.cy.nodes().removeClass('selected');
        this.cy.edges().removeClass('selected');
        node.addClass('selected');
        node.connectedEdges().addClass('selected');
        KeyboardNav.selectedNode = node;

        document.dispatchEvent(new CustomEvent('nodeSelected', {
            detail: {
                nodeId: node.id(),
                nodeName: node.data('label') || node.id()
            }
        }));
    },

    /**
     * Return the endpoint of an edge that is furthest from the current viewport center.
     */
    getFurthestEdgeEndpoint(edge) {
        const source = edge.source();
        const target = edge.target();

        if (source.length === 0 || target.length === 0) {
            return null;
        }

        const center = this.getViewportCenter();
        const sourceDistance = this.distanceBetween(center, source.position());
        const targetDistance = this.distanceBetween(center, target.position());

        return sourceDistance > targetDistance ? source : target;
    },

    /**
     * Current visible viewport center in graph coordinates.
     */
    getViewportCenter() {
        const extent = this.cy.extent();

        return {
            x: (extent.x1 + extent.x2) / 2,
            y: (extent.y1 + extent.y2) / 2
        };
    },

    /**
     * Calculate distance between two graph positions.
     */
    distanceBetween(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /**
     * Clear all highlights
     */
    clearHighlight() {
        this.cy.nodes().removeClass('highlighted dimmed');
        this.cy.edges().removeClass('highlighted dimmed');
    },

    /**
     * Clear selection
     */
    clearSelection() {
        this.cy.nodes().removeClass('selected');
        this.cy.edges().removeClass('selected');
        KeyboardNav.selectedNode = null;

        document.dispatchEvent(new CustomEvent('nodeSelectionCleared'));
    },

    /**
     * Return selected nodes for apply-based filters, falling back to the open panel node.
     */
    getSelectedNodesForFiltering() {
        let selectedNodes = this.cy.nodes('.selected');

        if (selectedNodes.length > 0) {
            return selectedNodes;
        }

        if (!PanelManager.currentNode) {
            return this.cy.collection();
        }

        return this.getNodeByLabel(PanelManager.currentNode);
    },

    /**
     * Clear focus/dependency filtering while preserving truth-level filtering.
     */
    clearSelectionFilter() {
        this.cy.nodes().removeClass('hidden');
        this.cy.edges().removeClass('hidden');
        this.clearHighlight();
        this.fitVisible();
    },

    /**
     * Reset graph to full view
     */
    reset() {
        this.cy.nodes().removeClass('highlighted dimmed selected hidden');
        this.cy.edges().removeClass('highlighted dimmed selected hidden');
        this.applyTruthLevelFilter();
        this.fitVisible();
    },

    /**
     * Get node by label
     */
    getNodeByLabel(label) {
        return this.cy.nodes().filter(node => {
            return node.data('label') === label || node.data('id') === label;
        });
    },

    /**
     * Get source node data from the bundle by ID
     */
    getBundleNode(nodeId) {
        return window.bundleData?.nodes?.find(node => node.id === nodeId) || null;
    },

    /**
     * Fit graph to viewport
     */
    fit() {
        this.fitVisible();
    },

    /**
     * Recompute layout using only nodes still visible after all active filters.
     */
    relayoutVisible() {
        const visibleNodes = this.getVisibleNodes();

        if (visibleNodes.length === 0) {
            this.cy.fit();
            this.hideLayoutStatus();
            return;
        }

        const visibleEdges = this.cy.edges().filter(edge => {
            return this.isEdgeVisibleForLayout(edge);
        });

        if (this.shouldUseWorkerDagreLayout()) {
            this.runWorkerDagreLayout(visibleNodes, visibleEdges);
            return;
        }

        const layout = visibleNodes.union(visibleEdges).layout(this.getLayoutConfig());
        this.runLayout(layout);
    },

    shouldUseWorkerDagreLayout() {
        return this.selectedLayoutEngine === 'dagre'
            && this.dagreRegistered
            && typeof window !== 'undefined'
            && typeof window.Worker === 'function';
    },

    runWorkerDagreLayout(visibleNodes, visibleEdges) {
        this.cancelActiveLayout({ silent: true });

        const runId = this.layoutRunId + 1;
        this.layoutRunId = runId;
        this.canceledLayoutRunId = null;
        this.showLayoutStatus();

        const workerLayout = {
            stop: () => {
                if (this.activeLayoutWorker) {
                    this.activeLayoutWorker.terminate();
                    this.activeLayoutWorker = null;
                }
            }
        };

        this.activeLayout = workerLayout;
        const payload = this.buildDagreWorkerPayload(visibleNodes, visibleEdges);

        this.pendingLayoutStart = this.scheduleLayoutStart(() => {
            if (this.layoutRunId !== runId || this.activeLayout !== workerLayout) {
                return;
            }

            this.pendingLayoutStart = null;
            this.startDagreWorker(runId, workerLayout, payload, visibleNodes, visibleEdges);
        });
    },

    buildDagreWorkerPayload(visibleNodes, visibleEdges) {
        return {
            options: {
                rankdir: 'TB',
                ranker: 'network-simplex',
                nodesep: 45,
                edgesep: 10,
                ranksep: 90,
                marginx: 30,
                marginy: 30,
                spacingFactor: 1.0
            },
            nodes: visibleNodes.map(node => {
                const box = node.boundingBox({ includeLabels: true, includeOverlays: false });
                return {
                    id: node.id(),
                    width: Math.max(1, box.w),
                    height: Math.max(1, box.h)
                };
            }),
            edges: visibleEdges.map(edge => ({
                id: edge.id(),
                source: edge.source().id(),
                target: edge.target().id(),
                weight: this.getDagreEdgeWeight(edge)
            }))
        };
    },

    startDagreWorker(runId, workerLayout, payload, visibleNodes, visibleEdges) {
        let worker;

        try {
            worker = new Worker(new URL('js/layout-worker.js', window.location.href));
        } catch (error) {
            console.warn('Could not start layout worker; falling back to main-thread Dagre layout.', error);
            this.activeLayout = null;
            this.runLayout(visibleNodes.union(visibleEdges).layout(this.getLayoutConfig()));
            return;
        }

        this.activeLayoutWorker = worker;

        worker.onmessage = event => {
            if (this.layoutRunId !== runId || this.activeLayout !== workerLayout) {
                worker.terminate();
                return;
            }

            this.activeLayoutWorker = null;
            this.activeLayout = null;
            worker.terminate();

            const positions = event.data?.positions || [];
            this.applyWorkerLayoutPositions(positions);
            if (this.canceledLayoutRunId !== runId) {
                this.tidyLayout();
                this.fitVisible();
            }
            this.hideLayoutStatus();
        };

        worker.onerror = error => {
            if (this.layoutRunId !== runId || this.activeLayout !== workerLayout) {
                worker.terminate();
                return;
            }

            console.warn('Layout worker failed; falling back to main-thread Dagre layout.', error);
            this.activeLayoutWorker = null;
            this.activeLayout = null;
            worker.terminate();
            this.runLayout(visibleNodes.union(visibleEdges).layout(this.getLayoutConfig()));
        };

        worker.postMessage(payload);
    },

    applyWorkerLayoutPositions(positions) {
        this.cy.batch(() => {
            positions.forEach(position => {
                const node = this.cy.getElementById(position.id);
                if (node.nonempty()) {
                    node.position({ x: position.x, y: position.y });
                }
            });
        });
    },

    /**
     * Run a layout with status UI and cancellation support.
     */
    runLayout(layout) {
        this.cancelActiveLayout({ silent: true });

        const runId = this.layoutRunId + 1;
        this.layoutRunId = runId;
        this.canceledLayoutRunId = null;
        this.activeLayout = layout;
        this.showLayoutStatus();

        layout.one('layoutstop', () => {
            if (this.layoutRunId !== runId) {
                return;
            }

            this.activeLayout = null;
            if (this.canceledLayoutRunId !== runId) {
                this.tidyLayout();
                this.fitVisible();
            }
            this.hideLayoutStatus();
        });

        this.pendingLayoutStart = this.scheduleLayoutStart(() => {
            if (this.layoutRunId !== runId || this.activeLayout !== layout) {
                return;
            }

            this.pendingLayoutStart = null;
            layout.run();
        });
    },

    /**
     * Stop the currently running layout, if the engine supports interruption.
     */
    cancelActiveLayout(options = {}) {
        this.cancelPendingLayoutStart();

        if (!this.activeLayout) {
            return;
        }

        const layout = this.activeLayout;
        this.canceledLayoutRunId = this.layoutRunId;
        this.activeLayout = null;

        if (typeof layout.stop === 'function') {
            layout.stop();
        }

        if (this.activeLayoutWorker) {
            this.activeLayoutWorker.terminate();
            this.activeLayoutWorker = null;
        }

        if (!options.silent) {
            this.hideLayoutStatus();
        }
    },

    scheduleLayoutStart(callback) {
        if (typeof window === 'undefined') {
            callback();
            return null;
        }

        const start = {
            frameId: null,
            timeoutId: null
        };

        const queueLayoutStart = () => {
            start.frameId = null;
            start.timeoutId = window.setTimeout(() => {
                start.timeoutId = null;
                callback();
            }, 0);
        };

        if (window.requestAnimationFrame) {
            start.frameId = window.requestAnimationFrame(queueLayoutStart);
        } else {
            start.frameId = window.setTimeout(queueLayoutStart, 0);
        }

        return start;
    },

    cancelPendingLayoutStart() {
        if (!this.pendingLayoutStart || typeof window === 'undefined') {
            this.pendingLayoutStart = null;
            return;
        }

        if (this.pendingLayoutStart.frameId !== null) {
            if (window.cancelAnimationFrame) {
                window.cancelAnimationFrame(this.pendingLayoutStart.frameId);
            } else {
                window.clearTimeout(this.pendingLayoutStart.frameId);
            }
        }

        if (this.pendingLayoutStart.timeoutId !== null) {
            window.clearTimeout(this.pendingLayoutStart.timeoutId);
        }

        this.pendingLayoutStart = null;
    },

    showLayoutStatus() {
        const status = document.getElementById('layout-status');
        const statusText = document.getElementById('layout-status-text');
        if (!status) {
            return;
        }

        if (statusText) {
            statusText.textContent = `Running ${this.getSelectedLayoutLabel()} layout...`;
        }
        status.classList.remove('hidden');
    },

    hideLayoutStatus() {
        const status = document.getElementById('layout-status');
        if (status) {
            status.classList.add('hidden');
        }
    },

    getSelectedLayoutLabel() {
        if (this.selectedLayoutEngine === 'fcose') return 'fCoSE';
        if (this.selectedLayoutEngine === 'elk') return 'ELK';
        if (this.selectedLayoutEngine === 'forceatlas2') return 'ForceAtlas2';
        return 'Dagre';
    },

    /**
     * Open up the drawn view after a layout: no two node boxes overlap, and no
     * edge runs across a node it does not touch. A layout separates the boxes it
     * was given, but it draws every edge straight between two centres. Returns
     * how many pushes it applied.
     */
    separateOverlaps({ clearEdges = true, maxPasses = 6 } = {}) {
        const nodes = this.getVisibleNodes();
        if (nodes.length < 2) return 0;

        const margin = this.nodeSeparationMargin / 2;
        const items = nodes.map((node) => {
            const box = node.boundingBox({ includeLabels: true, includeOverlays: false });
            const position = node.position();
            return {
                node,
                x: position.x,
                y: position.y,
                offsetX: (box.x1 + box.x2) / 2 - position.x,
                offsetY: (box.y1 + box.y2) / 2 - position.y,
                halfWidth: box.w / 2 + margin,
                halfHeight: box.h / 2 + margin
            };
        });

        const byId = new Map(items.map(item => [item.node.id(), item]));
        const edges = this.cy.edges()
            .filter(edge => this.isEdgeVisibleForLayout(edge))
            .map(edge => ({ source: byId.get(edge.source().id()), target: byId.get(edge.target().id()) }))
            .filter(edge => edge.source && edge.target && edge.source !== edge.target);

        // A bucket grid keeps each pass close to linear: two boxes can only touch
        // when they share a cell or sit in neighbouring ones, and an edge can only
        // cross a box in a cell the edge passes through.
        const cell = items.reduce((size, item) => Math.max(size, item.halfWidth * 2, item.halfHeight * 2), 40);
        const centreX = item => item.x + item.offsetX;
        const centreY = item => item.y + item.offsetY;
        let pushes = 0;

        for (let pass = 0; pass < maxPasses; pass += 1) {
            const buckets = new Map();
            items.forEach((item) => {
                const key = `${Math.floor(centreX(item) / cell)}:${Math.floor(centreY(item) / cell)}`;
                const bucket = buckets.get(key);
                if (bucket) bucket.push(item); else buckets.set(key, [item]);
            });

            let passPushes = 0;

            // Node against node.
            buckets.forEach((bucket, key) => {
                const [column, row] = key.split(':').map(Number);
                let neighbours = [];
                for (let dx = 0; dx <= 1; dx += 1) {
                    for (let dy = -1; dy <= 1; dy += 1) {
                        if (dx === 0 && dy < 0) continue;
                        const other = buckets.get(`${column + dx}:${row + dy}`);
                        if (other && other !== bucket) neighbours = neighbours.concat(other);
                    }
                }

                bucket.forEach((a, index) => {
                    bucket.slice(index + 1).concat(neighbours).forEach((b) => {
                        const gapX = (a.halfWidth + b.halfWidth) - Math.abs(centreX(a) - centreX(b));
                        const gapY = (a.halfHeight + b.halfHeight) - Math.abs(centreY(a) - centreY(b));
                        if (gapX <= 0 || gapY <= 0) return;

                        passPushes += 1;
                        if (gapX < gapY) {
                            const shift = (gapX / 2) * (centreX(a) <= centreX(b) ? -1 : 1);
                            a.x += shift;
                            b.x -= shift;
                        } else {
                            const shift = (gapY / 2) * (centreY(a) <= centreY(b) ? -1 : 1);
                            a.y += shift;
                            b.y -= shift;
                        }
                    });
                });
            });

            // Node against edge. The node moves, not the edge, so the layout keeps
            // the shape it computed and only the node in the way steps aside.
            if (clearEdges) edges.forEach((edge) => {
                const px = centreX(edge.source);
                const py = centreY(edge.source);
                const length = Math.hypot(centreX(edge.target) - px, centreY(edge.target) - py);
                if (length < 1) return;

                const ux = (centreX(edge.target) - px) / length;
                const uy = (centreY(edge.target) - py) / length;
                const nx = -uy;
                const ny = ux;

                const seen = new Set();
                for (let step = 0; step <= length; step += cell / 2) {
                    const column = Math.floor((px + ux * step) / cell);
                    const row = Math.floor((py + uy * step) / cell);
                    for (let dx = -1; dx <= 1; dx += 1) {
                        for (let dy = -1; dy <= 1; dy += 1) {
                            const key = `${column + dx}:${row + dy}`;
                            if (seen.has(key)) continue;
                            seen.add(key);
                            (buckets.get(key) || []).forEach((item) => {
                                if (item === edge.source || item === edge.target) return;

                                const along = (centreX(item) - px) * ux + (centreY(item) - py) * uy;
                                if (along <= 0 || along >= length) return;

                                const across = (centreX(item) - px) * nx + (centreY(item) - py) * ny;
                                const half = item.halfWidth * Math.abs(nx) + item.halfHeight * Math.abs(ny);
                                const needed = half - Math.abs(across);
                                if (needed <= 0) return;

                                passPushes += 1;
                                const direction = across < 0 ? -1 : 1;
                                item.x += nx * needed * direction;
                                item.y += ny * needed * direction;
                            });
                        }
                    }
                }
            });

            pushes += passPushes;
            if (passPushes === 0) break;
        }

        if (pushes > 0) {
            this.cy.batch(() => {
                items.forEach(item => item.node.position({ x: item.x, y: item.y }));
            });
        }

        return pushes;
    },

    /**
     * The drawn edges, as straight segments between two node centres, which is
     * how cytoscape draws them.
     */
    edgeSegments() {
        return this.cy.edges().filter(edge => this.isEdgeVisibleForLayout(edge)).map((edge) => {
            const source = edge.source().position();
            const target = edge.target().position();
            return {
                sourceId: edge.source().id(),
                targetId: edge.target().id(),
                x1: source.x, y1: source.y, x2: target.x, y2: target.y
            };
        });
    },

    segmentsCross(a, b) {
        if (a.sourceId === b.sourceId || a.sourceId === b.targetId
            || a.targetId === b.sourceId || a.targetId === b.targetId) return false;

        const side = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const d1 = side(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
        const d2 = side(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
        const d3 = side(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
        const d4 = side(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
        return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
    },

    /**
     * Bucket the segments by the cells they pass through, so a crossing is only
     * looked for between segments that share a cell.
     */
    bucketSegments(segments, cell) {
        const buckets = new Map();
        segments.forEach((segment, index) => {
            const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) || 1;
            const steps = Math.max(1, Math.ceil(length / (cell / 2)));
            const seen = new Set();
            for (let step = 0; step <= steps; step += 1) {
                const ratio = step / steps;
                const key = `${Math.floor((segment.x1 + (segment.x2 - segment.x1) * ratio) / cell)}:`
                    + `${Math.floor((segment.y1 + (segment.y2 - segment.y1) * ratio) / cell)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const bucket = buckets.get(key);
                if (bucket) bucket.push(index); else buckets.set(key, [index]);
            }
        });
        return buckets;
    },

    /**
     * How many pairs of drawn edges cross. Two edges that share an endpoint meet
     * at a node by construction, so they do not count.
     */
    countEdgeCrossings(segments = this.edgeSegments()) {
        const buckets = this.bucketSegments(segments, this.crossingGridCell);
        const pairs = new Set();

        buckets.forEach((bucket) => {
            for (let i = 0; i < bucket.length; i += 1) {
                for (let j = i + 1; j < bucket.length; j += 1) {
                    const first = Math.min(bucket[i], bucket[j]);
                    const second = Math.max(bucket[i], bucket[j]);
                    const key = `${first}|${second}`;
                    if (pairs.has(key)) continue;
                    if (this.segmentsCross(segments[first], segments[second])) pairs.add(key);
                }
            }
        });

        return pairs.size;
    },

    /**
     * Swap two neighbouring nodes when that removes more crossings than it adds.
     * Only a node that takes part in a crossing is tried, and only against the
     * nodes drawn near it, so the search stays local and short.
     */
    untangleEdges(maxPasses = 3) {
        const nodes = this.getVisibleNodes();
        if (nodes.length < 2) return 0;

        const cell = this.crossingGridCell;
        const positions = new Map(nodes.map(node => [node.id(), { x: node.position('x'), y: node.position('y') }]));
        const edges = this.cy.edges().filter(edge => this.isEdgeVisibleForLayout(edge));

        const incident = new Map();
        edges.forEach((edge, index) => {
            [edge.source().id(), edge.target().id()].forEach((id) => {
                const list = incident.get(id);
                if (list) list.push(index); else incident.set(id, [index]);
            });
        });

        const segments = new Array(edges.length);
        const rebuild = (index) => {
            const edge = edges[index];
            const source = positions.get(edge.source().id());
            const target = positions.get(edge.target().id());
            segments[index] = {
                sourceId: edge.source().id(), targetId: edge.target().id(),
                x1: source.x, y1: source.y, x2: target.x, y2: target.y
            };
        };
        const cellKey = (position) => `${Math.floor(position.x / cell)}:${Math.floor(position.y / cell)}`;

        let swaps = 0;

        for (let pass = 0; pass < maxPasses; pass += 1) {
            for (let index = 0; index < edges.length; index += 1) rebuild(index);
            const buckets = this.bucketSegments(segments, cell);

            const tangled = new Set();
            buckets.forEach((bucket) => {
                for (let i = 0; i < bucket.length; i += 1) {
                    for (let j = i + 1; j < bucket.length; j += 1) {
                        const a = segments[bucket[i]];
                        const b = segments[bucket[j]];
                        if (!this.segmentsCross(a, b)) continue;
                        tangled.add(a.sourceId).add(a.targetId).add(b.sourceId).add(b.targetId);
                    }
                }
            });
            if (tangled.size === 0) break;

            const nodeBuckets = new Map();
            nodes.forEach((node) => {
                const key = cellKey(positions.get(node.id()));
                const bucket = nodeBuckets.get(key);
                if (bucket) bucket.push(node); else nodeBuckets.set(key, [node]);
            });

            // The segments drawn in a cell and in the eight around it, kept per
            // cell so a node pays for its neighbourhood only once.
            const neighbourhoods = new Map();
            const neighbourhood = (key) => {
                const known = neighbourhoods.get(key);
                if (known) return known;

                const [column, row] = key.split(':').map(Number);
                const found = new Set();
                for (let dx = -1; dx <= 1; dx += 1) {
                    for (let dy = -1; dy <= 1; dy += 1) {
                        (buckets.get(`${column + dx}:${row + dy}`) || []).forEach(index => found.add(index));
                    }
                }
                const list = [...found];
                neighbourhoods.set(key, list);
                return list;
            };

            let passSwaps = 0;

            nodes.forEach((node) => {
                if (!tangled.has(node.id())) return;

                const own = incident.get(node.id()) || [];
                if (own.length === 0) return;

                const nodeKey = cellKey(positions.get(node.id()));
                const partners = (nodeBuckets.get(nodeKey) || [])
                    .filter(other => other !== node)
                    .slice(0, this.untanglePartnerLimit);

                partners.some((partner) => {
                    const partnerEdges = incident.get(partner.id()) || [];
                    const moved = own.concat(partnerEdges);
                    const others = neighbourhood(nodeKey)
                        .concat(neighbourhood(cellKey(positions.get(partner.id()))));

                    // The swap moves these edges and no others, so only they are
                    // rebuilt and the rest of the neighbourhood is read as it is.
                    const crossings = () => {
                        moved.forEach(rebuild);
                        let total = 0;
                        moved.forEach((index) => {
                            const segment = segments[index];
                            others.forEach((other) => {
                                if (other === index) return;
                                if (this.segmentsCross(segment, segments[other])) total += 1;
                            });
                        });
                        return total;
                    };

                    const before = crossings();
                    if (before === 0) return false;

                    const here = positions.get(node.id());
                    const there = positions.get(partner.id());
                    positions.set(node.id(), there);
                    positions.set(partner.id(), here);

                    if (crossings() < before) {
                        passSwaps += 1;
                        return true;
                    }

                    positions.set(node.id(), here);
                    positions.set(partner.id(), there);
                    moved.forEach(rebuild);
                    return false;
                });
            });

            swaps += passSwaps;
            if (passSwaps === 0) break;
        }

        if (swaps > 0) {
            this.cy.batch(() => nodes.forEach(node => node.position(positions.get(node.id()))));
        }

        return swaps;
    },

    capturePositions() {
        return this.cy.nodes().map(node => ({ node, x: node.position('x'), y: node.position('y') }));
    },

    restorePositions(saved) {
        this.cy.batch(() => saved.forEach(item => item.node.position({ x: item.x, y: item.y })));
    },

    /**
     * Tidy the drawn view when a layout ends. Each stage is kept only when it
     * does not add edge crossings, so a layout that already orders its ranks,
     * like dagre, is left as it is.
     */
    tidyLayout() {
        if (!this.cy || this.getVisibleNodes().length < 2) return;

        let crossings = this.countEdgeCrossings();

        const stage = (run) => {
            const saved = this.capturePositions();
            run();
            const after = this.countEdgeCrossings();
            if (after > crossings) {
                this.restorePositions(saved);
                return;
            }
            crossings = after;
        };

        stage(() => this.separateOverlaps());
        stage(() => {
            this.untangleEdges();
            this.separateOverlaps({ clearEdges: false });
        });
    },

    /**
     * Nodes still visible after all active filters.
     */
    getVisibleNodes() {
        return this.cy.nodes().filter(node => this.isNodeVisibleForLayout(node));
    },

    isNodeVisibleForLayout(node) {
        return !node.hasClass('hidden')
            && !node.hasClass('truth-level-filtered')
            && !node.hasClass('reco-filtered');
    },

    isEdgeVisibleForLayout(edge) {
        // Only the first working point anchors reco objects in the layout: it is the
        // calorimeter-entry match, so the adaptive edges of the other points climb from
        // there to an ancestor without moving the reco node.
        if (edge.data('isMatchEdge')) {
            const anchor = Array.isArray(this.workingPoints) ? this.workingPoints[0] : null;
            if (anchor && edge.data('workingPoint') !== anchor) return false;
        }
        return !edge.hasClass('hidden')
            && !edge.hasClass('truth-level-filtered')
            && !edge.hasClass('reco-filtered')
            && this.isNodeVisibleForLayout(edge.source())
            && this.isNodeVisibleForLayout(edge.target());
    },

    /**
     * Fit to nodes still visible after all active filters.
     */
    fitVisible() {
        const visibleNodes = this.getVisibleNodes();

        if (visibleNodes.length > 0) {
            this.cy.fit(visibleNodes);
        } else {
            this.cy.fit();
        }
    }
};
