// get_examples (SPEC mcp-examples-spec): the surface that shows
// the delivered designs as labeled images. These tests prove the
// spec's invariants 1, 2, and 4 against the same seeded KV path
// production uses (invariant 3, the phase-one pricing scan over
// get_examples, lives in test/pricing-presentation.test.ts, and
// invariant 5 is the rest of the suite passing).
//
// Invariant 1: get_examples answers keyless; pagination over
// shape "all" yields all 27 examples exactly once (no gaps, no
// duplicates), and per-shape pagination yields 25 and 2.
// Invariant 2: every label's shape + number equals the
// get_artwork_spec pick for the same example id.
// Invariant 4: batch image count never exceeds 9; every
// structured entry carries id, organization, shape, pickNumber,
// displayUrl.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../src/tools.ts";
import { EXAMPLES_INDEX } from "../src/examples-data.ts";
import worker from "../src/index.ts";
import type { Env } from "../src/env.ts";

class MemoryKV {
  store = new Map<string, string>();
  async get(key: string, type?: string): Promise<unknown> {
    const raw = this.store.get(key) ?? null;
    if (raw === null) return null;
    if (type === "json") return JSON.parse(raw);
    if (type === "arrayBuffer") {
      const bin = atob(raw);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.charCodeAt(i); i++) u8[i] = bin.charCodeAt(i);
      return u8.buffer;
    }
    return raw;
  }
  async put(key: string, value: unknown): Promise<void> {
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const u8 = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      let bin = "";
      for (const b of u8) bin += String.fromCharCode(b);
      this.store.set(key, btoa(bin));
    } else {
      this.store.set(key, String(value));
    }
  }
  async delete(key: string): Promise<void> { this.store.delete(key); }
  async list(): Promise<{ keys: Array<{ name: string }>; list_complete: boolean }> {
    return { keys: [...this.store.keys()].map((name) => ({ name })), list_complete: true };
  }
}

// A real 1x1 PNG payload, seeded for every delivered example id so
// the inline-image path is the KV path production uses.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=";

async function makeEnv(): Promise<Env> {
  const artwork = new MemoryKV();
  const png = Buffer.from(PNG_B64, "base64");
  const bytes = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
  for (const e of EXAMPLES_INDEX) await artwork.put(`EXAMPLE:${e.id}`, bytes);
  return {
    MCP_KEYS: new MemoryKV() as unknown as KVNamespace,
    MCP_ARTWORK: artwork as unknown as KVNamespace,
    ORDERS: new MemoryKV() as unknown as KVNamespace,
    DEV_ORDERS: new MemoryKV() as unknown as KVNamespace,
  } as unknown as Env;
}

function req(key?: string): Request {
  return new Request("https://tap.giving/mcp", {
    method: "POST",
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
}

const fetchFn = (async () => new Response("{}", { status: 404 })) as typeof fetch;

interface ExamplesStructured {
  totalByShape: { round: number; square: number };
  examples: Array<Record<string, unknown>>;
  nextOffset: number | null;
  returned: number;
}

async function pageAll(env: Env, args: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
  const seen: Array<Record<string, unknown>> = [];
  let offset = 0;
  for (let guard = 0; guard < 40; guard++) {
    const r = await runTool(env, req(), "get_examples", { ...args, offset }, fetchFn);
    const s = r.structured as unknown as ExamplesStructured;
    seen.push(...s.examples);
    if (s.nextOffset === null) return seen;
    assert.ok(s.nextOffset > offset, "nextOffset advances");
    offset = s.nextOffset;
  }
  throw new Error("pagination did not terminate");
}

test("invariant 1: keyless, and pagination over all yields every delivered example exactly once", async () => {
  const env = await makeEnv();
  // Keyless: no Authorization header at all, and a garbage header
  // behaves identically (the header is ignored server-wide).
  const keyless = await runTool(env, req(), "get_examples", {}, fetchFn);
  const garbage = await runTool(env, req("tg_live_garbage_value"), "get_examples", {}, fetchFn);
  assert.deepEqual(
    (garbage.structured as unknown as ExamplesStructured).examples.map((e) => e.id),
    (keyless.structured as unknown as ExamplesStructured).examples.map((e) => e.id),
    "a garbage Authorization header changes nothing",
  );
  const first = keyless.structured as unknown as ExamplesStructured;
  assert.deepEqual(first.totalByShape, { round: 25, square: 2 }, "totals by shape come from the delivered index");
  assert.equal(first.returned, 9, "the default page is nine");
  assert.equal(first.nextOffset, 9, "the first page names the next offset");

  const all = await pageAll(env, {});
  assert.equal(all.length, 27, "all pages together carry the full delivered set");
  assert.equal(new Set(all.map((e) => e.id)).size, 27, "no example repeats across pages");
  const expectedOrder = [
    ...EXAMPLES_INDEX.filter((e) => e.shape === "round"),
    ...EXAMPLES_INDEX.filter((e) => e.shape === "square"),
  ].map((e) => e.id);
  assert.deepEqual(all.map((e) => e.id), expectedOrder, "order is the delivered index order, round first then square");

  const round = await pageAll(env, { shape: "round" });
  assert.equal(round.length, 25, "round pagination yields all 25");
  assert.ok(round.every((e) => e.shape === "round"));
  const square = await pageAll(env, { shape: "square" });
  assert.equal(square.length, 2, "square pagination yields both");
  assert.ok(square.every((e) => e.shape === "square"));

  const pastEnd = await runTool(env, req(), "get_examples", { offset: 27 }, fetchFn);
  const past = pastEnd.structured as unknown as ExamplesStructured;
  assert.equal(past.returned, 0, "an offset past the end returns an empty page, not an error");
  assert.equal(past.nextOffset, null);
});

test("invariant 2: every label's shape and number equals the get_artwork_spec pick for the same id", async () => {
  const env = await makeEnv();
  const pickById = new Map<string, { shape: string; pickNumber: number }>();
  for (const shape of ["round", "square"] as const) {
    const spec = await runTool(env, req(), "get_artwork_spec", { shape }, fetchFn);
    const examples = (spec.structured as { examples: Array<Record<string, unknown>> }).examples;
    for (const e of examples) pickById.set(e.id as string, { shape, pickNumber: e.pickNumber as number });
  }
  assert.equal(pickById.size, 27, "the spec index covers the full set");

  // Walk every page of "all" and read the label lines out of the
  // interleaved content blocks, in order.
  const labelById = new Map<string, string>();
  let offset = 0;
  for (let guard = 0; guard < 40; guard++) {
    const r = await runTool(env, req(), "get_examples", { offset }, fetchFn);
    const s = r.structured as unknown as ExamplesStructured;
    assert.ok(r.blocks, "get_examples composes interleaved content blocks");
    const labelBlocks = r.blocks!.filter((b) => b.type === "text").slice(1, -1);
    assert.equal(labelBlocks.length, s.examples.length, "one label block per example on the page");
    for (const [i, e] of s.examples.entries()) {
      const block = labelBlocks[i];
      assert.ok(block.type === "text");
      labelById.set(e.id as string, (block as { text: string }).text);
    }
    if (s.nextOffset === null) break;
    offset = s.nextOffset;
  }
  assert.equal(labelById.size, 27, "every example got a label");
  for (const e of EXAMPLES_INDEX) {
    const label = labelById.get(e.id)!;
    const pick = pickById.get(e.id)!;
    const shapeWord = e.shape === "round" ? "Round" : "Square";
    const shapeTotal = e.shape === "round" ? 25 : 2;
    assert.ok(
      label.startsWith(`${shapeWord} ${pick.pickNumber} of ${shapeTotal}: `),
      `${e.id}: label "${label.slice(0, 40)}..." carries the spec pick ${pick.pickNumber} for ${e.shape}`,
    );
    assert.ok(label.includes(e.description), `${e.id}: the label carries the description`);
    assert.ok(label.includes(`the design delivered to ${e.organization}`), `${e.id}: the label names the organization`);
    assert.ok(label.endsWith(`, ${e.size}`), `${e.id}: the label ends with the size`);
  }
  // The flat text channel carries the same labels.
  const first = await runTool(env, req(), "get_examples", {}, fetchFn);
  for (const e of EXAMPLES_INDEX.slice(0, 3)) {
    assert.ok(first.text.includes(labelById.get(e.id)!), "flat text carries the first page's labels");
  }
});

test("invariant 4: a batch never carries more than 9 images, and every entry carries the named fields", async () => {
  const env = await makeEnv();
  for (const args of [{}, { count: 9 }, { count: 27 }, { shape: "round" }, { shape: "square", count: 9 }, { offset: 26 }]) {
    const r = await runTool(env, req(), "get_examples", args, fetchFn);
    const s = r.structured as unknown as ExamplesStructured;
    assert.ok((r.images ?? []).length <= 9, `images never exceed 9 for ${JSON.stringify(args)}`);
    assert.equal((r.images ?? []).length, s.returned, "one image per returned example (KV seeded)");
    assert.equal(s.examples.length, s.returned, "structured entries match the returned count");
    const imageBlocks = r.blocks!.filter((b) => b.type === "image");
    assert.equal(imageBlocks.length, s.returned, "one image block per returned example");
    // Interleaving: intro text, then label/image pairs, then the
    // closing text.
    assert.equal(r.blocks![0].type, "text", "the first block is the intro text");
    assert.equal(r.blocks![r.blocks!.length - 1].type, "text", "the last block is the closing text");
    for (let i = 0; i < s.returned; i++) {
      assert.equal(r.blocks![1 + i * 2].type, "text", `label ${i} precedes its image`);
      assert.equal(r.blocks![2 + i * 2].type, "image", `image ${i} follows its label`);
    }
    for (const e of s.examples) {
      for (const field of ["id", "organization", "shape", "pickNumber", "displayUrl"]) {
        assert.ok(e[field] !== undefined && e[field] !== "", `${e.id}: entry carries ${field}`);
      }
      assert.equal(e.displayUrl, `https://tap.giving/mcp/examples/${e.id}.png`, `${e.id}: displayUrl is the examples route`);
    }
  }
  const capped = await runTool(env, req(), "get_examples", { count: 27 }, fetchFn);
  assert.equal((capped.structured as unknown as ExamplesStructured).returned, 9, "a count above the cap is capped at 9, not refused");
});

test("get_examples refuses malformed paging arguments as invalid_input", async () => {
  const env = await makeEnv();
  for (const args of [{ shape: "oval" }, { offset: -1 }, { count: 0 }, { offset: 1.5 }]) {
    await assert.rejects(
      () => runTool(env, req(), "get_examples", args, fetchFn),
      (e: Error & { code?: string }) => e.code === "invalid_input",
      `${JSON.stringify(args)} refuses as invalid_input`,
    );
  }
});

test("the wire answer interleaves labels and images, intro first and closing last", async () => {
  const env = await makeEnv();
  const res = await worker.fetch(new Request("https://tap.giving/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "get_examples", arguments: { shape: "square" } } }),
  }), env);
  const body = await res.json() as { result: { content: Array<{ type: string; text?: string }>; structuredContent: ExamplesStructured } };
  const content = body.result.content;
  assert.equal(content.length, 1 + 2 * 2 + 1, "intro, two label/image pairs, closing");
  assert.equal(content[0].type, "text");
  assert.ok(content[0].text!.includes("Delivered examples:"), "the intro leads");
  assert.equal(content[1].type, "text");
  assert.ok(content[1].text!.startsWith("Square 1 of 2: "), "the first label names its pick");
  assert.equal(content[2].type, "image", "the first image follows its label");
  assert.equal(content[3].type, "text");
  assert.ok(content[3].text!.startsWith("Square 2 of 2: "));
  assert.equal(content[4].type, "image");
  assert.equal(content[5].type, "text");
  assert.ok(content[5].text!.includes("get_artwork_spec"), "the closing names the next step");
  assert.equal(body.result.structuredContent.returned, 2);
  assert.equal(body.result.structuredContent.nextOffset, null);
});
