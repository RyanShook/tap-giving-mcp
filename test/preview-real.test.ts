// Real-rasterizer tests (2026-11-08 cold-test fix): these exercise
// renderArtworkOnDisc with NO test rasterizer installed, so the
// production path (static @resvg/resvg-wasm import, bundled wasm and
// font assets, the nested-SVG and data-URL composites) is what runs.
// The fake seam in the other suites masked a dead production renderer
// for the server's whole life: the deployed bundle had been built
// without the resvg package in node_modules, the dynamic import was
// left external, and its failure was swallowed. If the real path
// breaks again, these tests fail instead of the preview degrading
// silently.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderArtworkOnDisc, renderSvgToPng, setRasterizerForTests } from "../src/preview.ts";

setRasterizerForTests(null);

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function assertPng(bytes: Uint8Array | null, label: string): Uint8Array {
  assert.ok(bytes, `${label}: real rasterizer returned null`);
  assert.ok(bytes.length > 1000, `${label}: PNG suspiciously small (${bytes.length} bytes)`);
  assert.deepEqual([...bytes.slice(0, 8)], PNG_MAGIC, `${label}: output is not a PNG`);
  return bytes;
}

// 1x1 PNG (a real decodable PNG), same fixture as tools.test.ts.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const pngBytes = new Uint8Array(Buffer.from(PNG_B64, "base64"));

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="106mm" height="106mm" viewBox="0 0 106 106"><circle cx="53" cy="53" r="53" fill="#1B3A5C"/><text x="53" y="56" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#FFFFFF">TEST</text></svg>`;
const svgBytes = new Uint8Array(Buffer.from(SVG));

test("real rasterizer: a plain SVG renders to PNG", async () => {
  assertPng(await renderSvgToPng(SVG), "plain SVG");
});

test("real rasterizer: SVG artwork composited on the round disc", async () => {
  assertPng(await renderArtworkOnDisc(svgBytes, "svg", "round"), "SVG on round disc");
});

test("real rasterizer: SVG artwork composited on the square disc", async () => {
  assertPng(await renderArtworkOnDisc(svgBytes, "svg", "square"), "SVG on square disc");
});

test("real rasterizer: PNG artwork composited on the disc via the data-URL wrapper", async () => {
  assertPng(await renderArtworkOnDisc(pngBytes, "png", "round"), "PNG on round disc");
});
