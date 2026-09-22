/**
 * forceatlas2.js - ForceAtlas2 layout for Cytoscape
 *
 * The algorithm of Jacomy, Venturini, Heymann and Bastian (PLoS ONE 9(6), 2014),
 * as used by Gephi: repulsion between every pair of nodes scaled by their degree,
 * attraction along every edge, gravity towards the centre, and a global speed that
 * adapts to how much the drawing swings. Repulsion is summed with a Barnes-Hut
 * quadtree, so a graph of a few thousand nodes lays out in seconds.
 *
 * The layout is registered under the name 'forceatlas2'.
 */
(function () {
    'use strict';

    const DEFAULTS = {
        iterations: 400,
        gravity: 1,
        scalingRatio: 10,
        edgeWeightInfluence: 0,
        // A hub pushes its neighbours away instead of pulling them in, which opens up
        // the branches of a truth graph where one vertex carries many daughters.
        outboundAttractionDistribution: true,
        linLogMode: false,
        strongGravityMode: false,
        // Node sizes enter the repulsion, so two drawn boxes do not settle on top of
        // each other. The sizes come from the caller, labels included.
        adjustSizes: true,
        barnesHutTheta: 0.6,
        jitterTolerance: 1,
        animate: false,
        fit: false,
        padding: 40
    };

    // Barnes-Hut quadtree. A region far enough away, judged by theta, is summed as
    // one body at its centre of mass instead of node by node.
    function Quadtree(bounds) {
        this.x1 = bounds.x1;
        this.y1 = bounds.y1;
        this.size = Math.max(bounds.x2 - bounds.x1, bounds.y2 - bounds.y1) || 1;
        this.root = { mass: 0, centreX: 0, centreY: 0, body: null, children: null };
    }

    Quadtree.prototype.insert = function (body) {
        this._insert(this.root, body, this.x1, this.y1, this.size, 0);
    };

    Quadtree.prototype._insert = function (node, body, x, y, size, depth) {
        node.mass += body.mass;
        node.centreX += body.mass * body.x;
        node.centreY += body.mass * body.y;

        if (node.children === null && node.body === null) {
            node.body = body;
            return;
        }

        // A deep pile of coincident nodes would recurse for ever, so at some depth
        // the region keeps several bodies and is treated as one.
        if (depth > 24) {
            return;
        }

        if (node.children === null) {
            const existing = node.body;
            node.body = null;
            node.children = [null, null, null, null];
            this._place(node, existing, x, y, size, depth);
        }

        this._place(node, body, x, y, size, depth);
    };

    Quadtree.prototype._place = function (node, body, x, y, size, depth) {
        const half = size / 2;
        const right = body.x >= x + half ? 1 : 0;
        const bottom = body.y >= y + half ? 1 : 0;
        const index = right + 2 * bottom;

        if (node.children[index] === null) {
            node.children[index] = { mass: 0, centreX: 0, centreY: 0, body: null, children: null };
        }

        this._insert(node.children[index], body, x + right * half, y + bottom * half, half, depth + 1);
    };

    Quadtree.prototype.applyRepulsion = function (body, coefficient, theta, adjustSizes) {
        this._repulse(this.root, this.size, body, coefficient, theta, adjustSizes);
    };

    Quadtree.prototype._repulse = function (node, size, body, coefficient, theta, adjustSizes) {
        if (node.mass === 0) {
            return;
        }

        if (node.body !== null) {
            if (node.body !== body) {
                applyPairRepulsion(body, node.body, coefficient, adjustSizes);
            }
            return;
        }

        const centreX = node.centreX / node.mass;
        const centreY = node.centreY / node.mass;
        const dx = body.x - centreX;
        const dy = body.y - centreY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0 && size / distance < theta) {
            const factor = coefficient * body.mass * node.mass / (distance * distance);
            body.dx += dx * factor;
            body.dy += dy * factor;
            return;
        }

        for (let i = 0; i < 4; i += 1) {
            if (node.children[i] !== null) {
                this._repulse(node.children[i], size / 2, body, coefficient, theta, adjustSizes);
            }
        }
    };

    // Repulsion of one node on another. With adjustSizes the distance is measured
    // between the drawn boxes, and two that already overlap are pushed apart hard.
    function applyPairRepulsion(a, b, coefficient, adjustSizes) {
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) {
            // Two nodes at the same point have no direction to separate along, so one
            // is nudged deterministically by its index.
            dx = (a.index % 7) - 3 || 1;
            dy = (a.index % 5) - 2 || 1;
            distance = Math.sqrt(dx * dx + dy * dy);
        }

        if (adjustSizes) {
            const gap = distance - a.size - b.size;
            if (gap > 0) {
                const factor = coefficient * a.mass * b.mass / (gap * gap);
                a.dx += dx * factor;
                a.dy += dy * factor;
                return;
            }
            const factor = 100 * coefficient * a.mass * b.mass / (distance * distance);
            a.dx += dx * factor;
            a.dy += dy * factor;
            return;
        }

        const factor = coefficient * a.mass * b.mass / (distance * distance);
        a.dx += dx * factor;
        a.dy += dy * factor;
    }

    function ForceAtlas2Layout(options) {
        this.options = Object.assign({}, DEFAULTS, options);
        this.stopped = false;
    }

    ForceAtlas2Layout.prototype.run = function () {
        const options = this.options;
        const nodes = options.eles.nodes();
        const edges = options.eles.edges();
        const count = nodes.length;

        if (count === 0) {
            return this;
        }

        const index = new Map();
        const bodies = new Array(count);

        nodes.forEach((node, i) => {
            const position = node.position();
            const box = options.nodeSize
                ? options.nodeSize(node)
                : Math.max(node.outerWidth(), node.outerHeight()) / 2;
            index.set(node.id(), i);
            bodies[i] = {
                index: i,
                x: position.x,
                y: position.y,
                dx: 0,
                dy: 0,
                oldDx: 0,
                oldDy: 0,
                mass: 1,
                size: box
            };
        });

        const links = [];
        edges.forEach((edge) => {
            const source = index.get(edge.source().id());
            const target = index.get(edge.target().id());
            if (source === undefined || target === undefined || source === target) {
                return;
            }
            const weight = options.edgeWeightInfluence === 0
                ? 1
                : Math.pow(Number.parseFloat(edge.data('weight')) || 1, options.edgeWeightInfluence);
            links.push({ source, target, weight });
            bodies[source].mass += 1;
            bodies[target].mass += 1;
        });

        let speed = 1;
        let speedEfficiency = 1;

        for (let iteration = 0; iteration < options.iterations && !this.stopped; iteration += 1) {
            speed = this._iterate(bodies, links, speed, speedEfficiency, options);
            speedEfficiency = this.speedEfficiency;
        }

        const positions = new Map();
        nodes.forEach((node, i) => positions.set(node.id(), { x: bodies[i].x, y: bodies[i].y }));

        nodes.layoutPositions(this, options, node => positions.get(node.id()));
        return this;
    };

    ForceAtlas2Layout.prototype._iterate = function (bodies, links, speed, speedEfficiency, options) {
        const count = bodies.length;

        for (let i = 0; i < count; i += 1) {
            const body = bodies[i];
            body.oldDx = body.dx;
            body.oldDy = body.dy;
            body.dx = 0;
            body.dy = 0;
        }

        // Repulsion, summed over the quadtree of this iteration's positions.
        let x1 = Infinity;
        let y1 = Infinity;
        let x2 = -Infinity;
        let y2 = -Infinity;
        for (let i = 0; i < count; i += 1) {
            x1 = Math.min(x1, bodies[i].x);
            y1 = Math.min(y1, bodies[i].y);
            x2 = Math.max(x2, bodies[i].x);
            y2 = Math.max(y2, bodies[i].y);
        }

        const tree = new Quadtree({ x1, y1, x2, y2 });
        for (let i = 0; i < count; i += 1) {
            tree.insert(bodies[i]);
        }
        for (let i = 0; i < count; i += 1) {
            tree.applyRepulsion(bodies[i], options.scalingRatio, options.barnesHutTheta, options.adjustSizes);
        }

        // Gravity towards the origin of the drawing.
        for (let i = 0; i < count; i += 1) {
            const body = bodies[i];
            const distance = Math.sqrt(body.x * body.x + body.y * body.y) || 1;
            const factor = options.strongGravityMode
                ? options.gravity * body.mass
                : options.gravity * body.mass / distance;
            body.dx -= body.x * factor;
            body.dy -= body.y * factor;
        }

        // Attraction along the edges.
        for (let i = 0; i < links.length; i += 1) {
            const link = links[i];
            const source = bodies[link.source];
            const target = bodies[link.target];
            let dx = source.x - target.x;
            let dy = source.y - target.y;
            let distance = Math.sqrt(dx * dx + dy * dy);

            if (options.adjustSizes) {
                distance = Math.max(0, distance - source.size - target.size);
            }

            let factor;
            if (options.linLogMode) {
                factor = distance > 0 ? -link.weight * Math.log(1 + distance) / distance : 0;
            } else {
                factor = -link.weight;
            }
            if (options.outboundAttractionDistribution) {
                factor /= source.mass;
            }

            source.dx += dx * factor;
            source.dy += dy * factor;
            target.dx -= dx * factor;
            target.dy -= dy * factor;
        }

        // Global speed: the drawing is allowed to move faster while it converges and
        // is slowed down as soon as it starts to swing.
        let totalSwinging = 0;
        let totalEffectiveTraction = 0;
        for (let i = 0; i < count; i += 1) {
            const body = bodies[i];
            const swinging = Math.sqrt((body.oldDx - body.dx) ** 2 + (body.oldDy - body.dy) ** 2);
            totalSwinging += body.mass * swinging;
            totalEffectiveTraction += 0.5 * body.mass
                * Math.sqrt((body.oldDx + body.dx) ** 2 + (body.oldDy + body.dy) ** 2);
        }

        const estimatedOptimalJitterTolerance = 0.05 * Math.sqrt(count);
        const minJitter = Math.sqrt(estimatedOptimalJitterTolerance);
        const maxJitter = 10;
        let jitter = options.jitterTolerance * Math.max(minJitter, Math.min(maxJitter,
            estimatedOptimalJitterTolerance * totalEffectiveTraction / (count * count)));

        const minSpeedEfficiency = 0.05;
        if (totalEffectiveTraction > 0 && totalSwinging / totalEffectiveTraction > 2) {
            if (speedEfficiency > minSpeedEfficiency) {
                speedEfficiency *= 0.5;
            }
            jitter = Math.max(jitter, options.jitterTolerance);
        }

        const targetSpeed = totalSwinging > 0
            ? jitter * jitter * speedEfficiency * totalEffectiveTraction / totalSwinging
            : speed;

        if (totalSwinging > jitter * totalEffectiveTraction) {
            if (speedEfficiency > minSpeedEfficiency) {
                speedEfficiency *= 0.7;
            }
        } else if (speed < 1000) {
            speedEfficiency *= 1.3;
        }

        // A large jump in one step tears the drawing apart, so the speed grows slowly.
        const nextSpeed = speed + Math.min(targetSpeed - speed, 0.5 * speed);
        this.speedEfficiency = speedEfficiency;

        for (let i = 0; i < count; i += 1) {
            const body = bodies[i];
            const swinging = body.mass * Math.sqrt((body.oldDx - body.dx) ** 2 + (body.oldDy - body.dy) ** 2);
            let factor = nextSpeed / (1 + Math.sqrt(nextSpeed * swinging));

            if (options.adjustSizes) {
                const displacement = Math.sqrt(body.dx * body.dx + body.dy * body.dy);
                factor = Math.min(factor, 10 / (displacement || 1));
            }

            body.x += body.dx * factor;
            body.y += body.dy * factor;
        }

        return nextSpeed;
    };

    ForceAtlas2Layout.prototype.stop = function () {
        this.stopped = true;
        return this;
    };

    ForceAtlas2Layout.prototype.destroy = function () {
        return this;
    };

    if (typeof cytoscape !== 'undefined') {
        cytoscape('layout', 'forceatlas2', ForceAtlas2Layout);
    }

    if (typeof window !== 'undefined') {
        window.ForceAtlas2Layout = ForceAtlas2Layout;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ForceAtlas2Layout;
    }
})();
