import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { minify } from "terser";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = path.join(projectRoot, "app", "vendor");

const assets = new Map([
  ["node_modules/cytoscape/dist/cytoscape.min.js", "cytoscape.min.js"],
  ["node_modules/dagre/dist/dagre.min.js", "dagre.min.js"],
  ["node_modules/elkjs/lib/elk.bundled.js", "elk.bundled.js"],
  ["node_modules/cytoscape-elk/dist/cytoscape-elk.js", "cytoscape-elk.js"],
  ["node_modules/jspdf/dist/jspdf.umd.min.js", "jspdf.umd.min.js"],
  ["node_modules/plotly.js-dist-min/plotly.min.js", "plotly-2.35.2.min.js"]
]);

const minifiedAssets = new Map([
  ["node_modules/cytoscape-dagre/cytoscape-dagre.js", "cytoscape-dagre.min.js"],
  ["node_modules/layout-base/layout-base.js", "layout-base.min.js"],
  ["node_modules/cose-base/cose-base.js", "cose-base.min.js"],
  ["node_modules/cytoscape-fcose/cytoscape-fcose.js", "cytoscape-fcose.min.js"]
]);

await rm(vendorDir, { recursive: true, force: true });
await mkdir(vendorDir, { recursive: true });

for (const [source, destination] of assets) {
  await copyFile(path.join(projectRoot, source), path.join(vendorDir, destination));
}

for (const [source, destination] of minifiedAssets) {
  const code = await readFile(path.join(projectRoot, source), "utf8");
  const result = await minify(code, {
    format: { comments: /^!|@preserve|@license|@cc_on/i }
  });
  if (!result.code) {
    throw new Error(`Terser produced no output for ${source}`);
  }
  await writeFile(path.join(vendorDir, destination), `${result.code}\n`);
}

console.log(`Generated ${assets.size + minifiedAssets.size} browser dependencies in app/vendor/`);

// Empty legacy wrappers allow a fresh static viewer to open JSON without
// missing-resource errors. Never overwrite an existing generated event.
for (const [file, variable] of [
  ["bundle.js", "EMBEDDED_BUNDLE_DATA"],
  ["rechits.js", "EMBEDDED_RECHITS_DATA"],
  ["associations.js", "EMBEDDED_ASSOCIATION_DATA"]
]) {
  try {
    await writeFile(path.join(projectRoot, "app", "js", file),
      `window.${variable} = null;\n`, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST" && error.code !== "ENOENT") throw error;
  }
}
