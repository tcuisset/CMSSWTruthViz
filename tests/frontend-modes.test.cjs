const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function load(file, context) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}

test('HTTP without explicit backend configuration remains visualization only', () => {
    const context = vm.createContext({window: {location: {protocol: 'http:'}},
        document: {addEventListener() {}}});
    load('app/js/runtime-config.js', context);
    load('app/js/main.js', context);
    assert.equal(vm.runInContext('isViewerMode()', context), true);
    context.window.TRUTHVIZ_RUNTIME = {mode: 'backend'};
    assert.equal(vm.runInContext('isViewerMode()', context), false);
});

test('viewer event attaches rechits and clears stale associations when opening another graph', () => {
    const context = vm.createContext({window: {}});
    load('app/js/viewer.js', context);
    vm.runInContext(`attachViewerEvent({schemaVersion: 1, bundle: {nodes: [], edges: []},
        rechits: {rechits: [{id: 9}], metadata: {eventIndex: 0}}, associations: {recoObjects: []}})`, context);
    assert.equal(context.window.bundleData.rechits[0].id, 9);
    assert.equal(context.window.bundleData.rechitsMetadata.eventIndex, 0);
    assert.ok(context.window.associationData);
    vm.runInContext('attachViewerEvent({nodes: [], edges: []})', context);
    assert.equal(context.window.associationData, null);
    assert.throws(() => vm.runInContext('attachViewerEvent({schemaVersion: 2, bundle: {nodes: [], edges: []}})', context), /Unsupported/);
});

test('node details extract energy from p4 without a removed GraphManager method', () => {
    const context = vm.createContext({});
    load('app/js/panel.js', context);
    assert.equal(vm.runInContext('PanelManager.getEnergy({p4: "(3, 4, 0, 5)"})', context), 5);
    assert.equal(vm.runInContext('PanelManager.getEnergy({rawEnergy: 7, p4: "(3, 4, 0, 5)"})', context), 7);
    assert.ok(Number.isNaN(vm.runInContext('PanelManager.getEnergy({})', context)));
});
