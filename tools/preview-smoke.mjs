// Preview smoke test against the REAL bundled Worker (wrangler dev /
// miniflare), the layer the unit suites cannot see: it proves the
// deployed bundle's resvg rasterizer actually renders on-disc
// previews for an SVG and a PNG submission. The 2026-11-08 cold test
// found production returning preview kind "unavailable" /
// "submitted-file" for both while every unit test passed through the
// fake rasterizer seam; this script exists so that cannot hide again.
//
// Usage: node tools/preview-smoke.mjs [baseUrl]
//   With no argument it boots `wrangler dev` on port 8791 itself.
//   With a baseUrl (e.g. https://tap.giving) it probes that server
//   and creates two TEST artwork submissions there (refs printed).

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="106mm" height="106mm" viewBox="0 0 106 106"><circle cx="53" cy="53" r="53" fill="#1B3A5C"/><text x="53" y="56" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#FFFFFF">TEST</text></svg>`;

let base = process.argv[2];
let child = null;
if (!base) {
  base = "http://127.0.0.1:8791";
  child = spawn("npx", ["wrangler", "dev", "--port", "8791", "--ip", "127.0.0.1"], { stdio: "pipe" });
  child.stderr.on("data", (d) => process.stderr.write(`[wrangler] ${d}`));
}
async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${base}/mcp`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("server did not become ready");
}
async function tool(name, args) {
  const r = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const j = await r.json();
  return j.result;
}
function submit(filename, mediaType, bytes) {
  return tool("submit_artwork", {
    file: { filename, mediaType, contentBase64: Buffer.from(bytes).toString("base64") },
    sha256: createHash("sha256").update(bytes).digest("hex"),
    shape: "round",
    note: "TEST preview smoke - do not produce",
  });
}
try {
  await waitReady();
  for (const [label, filename, mediaType, bytes] of [
    ["SVG", "smoke-test.svg", "image/svg+xml", Buffer.from(SVG)],
    ["PNG", "smoke-test.png", "image/png", Buffer.from(PNG_B64, "base64")],
  ]) {
    const res = await submit(filename, mediaType, bytes);
    const sc = res.structuredContent || {};
    const images = (res.content || []).filter((c) => c.type === "image");
    console.log(`${label}: artworkRef=${sc.artworkRef} preview.kind=${sc.preview?.kind} images=${images.length}`);
    if (sc.preview?.kind !== "on-disc" || images.length === 0) {
      console.error(`FAIL: ${label} preview is not an on-disc composite`);
      process.exitCode = 1;
    }
  }
  console.log(process.exitCode ? "PREVIEW SMOKE: FAIL" : "PREVIEW SMOKE: PASS");
} finally {
  if (child) child.kill("SIGTERM");
}
