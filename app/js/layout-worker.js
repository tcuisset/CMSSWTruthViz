/**
 * layout-worker.js - off-main-thread graph layout calculations
 */

importScripts('https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js');

self.onmessage = event => {
    const { nodes, edges, options } = event.data;
    const graph = new dagre.graphlib.Graph({ multigraph: true });

    graph.setGraph({
        rankdir: options.rankdir,
        ranker: options.ranker,
        nodesep: options.nodesep,
        edgesep: options.edgesep,
        ranksep: options.ranksep,
        marginx: options.marginx,
        marginy: options.marginy
    });
    graph.setDefaultEdgeLabel(() => ({}));

    nodes.forEach(node => {
        graph.setNode(node.id, {
            width: node.width,
            height: node.height
        });
    });

    edges.forEach(edge => {
        if (edge.source === edge.target) {
            return;
        }

        graph.setEdge(edge.source, edge.target, {
            weight: edge.weight || 1
        }, edge.id);
    });

    dagre.layout(graph);

    const spacingFactor = Number.isFinite(options.spacingFactor) ? options.spacingFactor : 1;
    const positions = nodes.map(node => {
        const graphNode = graph.node(node.id);
        return {
            id: node.id,
            x: graphNode.x * spacingFactor,
            y: graphNode.y * spacingFactor
        };
    });

    self.postMessage({ positions });
};
