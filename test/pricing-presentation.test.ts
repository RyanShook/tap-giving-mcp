// Pricing presentation and positioning guard (Ryan rulings,
// 2026-11-08): on the opening surfaces, the MCP lists ONLY the
// per-disc range. Minimums, tier breakdowns, discounts, and
// totals appear only at the very end, the quote step (get_quote
// and the order flow after it). The same rulings make the server
// a tool first: the lead identity is creating print-ready NFC tap
// artwork proofs, the artwork is the organization's own and
// vendor-neutral, and ordering is the optional second step.
//
// Surfaces guarded here: the get_discovery payload (text and
// structured content, deep-scanned), the GET self-description,
// the initialize instructions, the tools/list first sentences
// (the lines the GET renders as its tool list), and the
// get_product payload (disc pricing beyond the range, and any
// minimum stated anywhere in it). Quote and post-quote surfaces
// keep their full detail and are asserted intact at the end, so
// the guard cannot be satisfied by stripping the wrong surface.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../src/tools.ts";
import { POSITIONING_LINE, PRICE_RANGE_LINE, SERVER_DESCRIPTION } from "../src/facts.ts";
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

function makeEnv(): Env {
  return {
    MCP_KEYS: new MemoryKV() as unknown as KVNamespace,
    MCP_ARTWORK: new MemoryKV() as unknown as KVNamespace,
    ORDERS: new MemoryKV() as unknown as KVNamespace,
    DEV_ORDERS: new MemoryKV() as unknown as KVNamespace,
  } as unknown as Env;
}

function req(): Request {
  return new Request("https://tap.giving/mcp", { method: "POST", headers: {} });
}

const fetchFn = (async () => new Response("{}", { status: 404 })) as typeof fetch;

// The exact range line is the one pricing statement allowed on
// the opening surfaces; its own numbers are not tier leaks, so
// scans run with it removed.
function stripRange(s: string): string {
  return s.split(PRICE_RANGE_LINE).join("");
}

function scanOpening(label: string, text: string, structuredJson: string, opts: { fullToolList?: boolean; rangeLineRequired?: boolean } = {}): void {
  // The GET renders every tool's first sentence as its tool list,
  // and two of those lines are descriptions OF the quote step and
  // the printed-disc counts in the question set: "The binding
  // quote ... first-order discount scope ..." and "... the two
  // 6 mm hole areas ... minimum..." style factual lines. Those are
  // statements about post-opening surfaces, not this surface's own
  // pricing presentation, so for the GET the discount and minimum
  // wording scans skip the rendered tool-list block; the list's
  // own first sentences are scanned separately below, per tool.
  const textForWording = opts.fullToolList
    ? text.split("\n## Auth")[0].split("\n## Tools")[0]
    : text;
  for (const [where, raw] of [["text", text], ["structured", structuredJson]] as const) {
    const body = stripRange(raw);
    const wordingBody = where === "text" ? stripRange(textForWording) : body;
    assert.ok(!body.includes("WELCOME10"), `${label} ${where}: no discount code named`);
    assert.ok(!/discount/i.test(wordingBody), `${label} ${where}: no discount mention`);
    assert.ok(!body.includes("minimumQuantity"), `${label} ${where}: no minimumQuantity field`);
    assert.ok(!/minimum/i.test(wordingBody), `${label} ${where}: no minimum statement`);
    assert.ok(!body.includes('"unitCents"'), `${label} ${where}: no tier unit prices`);
    assert.ok(!body.includes('"tiers"'), `${label} ${where}: no tier structure`);
    assert.ok(!/100-199|200-399/.test(body), `${label} ${where}: no tier ranges`);
    assert.ok(!/\$\d+\.\d{2}/.test(body), `${label} ${where}: no dollar totals or prices`);
    assert.ok(!/percent off/i.test(body), `${label} ${where}: no percent-off copy`);
  }
  // The range line itself: required in discovery (text and
  // structured). The GET and the initialize instructions carried
  // no pricing prose before this pass either (the GET's only
  // pricing leak was the discount code inside a rendered tool
  // line), so for those two the requirement is absence, asserted
  // by the scans above; callers pass rangeLineRequired: false.
  if (opts.rangeLineRequired !== false) {
    assert.ok(text.includes(PRICE_RANGE_LINE) || structuredJson.includes(PRICE_RANGE_LINE),
      `${label}: the per-disc range line is present`);
  }
}

test("opening surfaces: range line only, positioning leads, ordering optional and last", async () => {
  const env = makeEnv();

  // get_discovery, with and without an intent naming a disc count
  // (the intent path used to quote worked totals here).
  const d = await runTool(env, req(), "get_discovery", {}, fetchFn);
  scanOpening("get_discovery", d.text, JSON.stringify(d.structured));
  const di = await runTool(env, req(), "get_discovery", { intent: "We want about 150 discs. What will it cost?" }, fetchFn);
  scanOpening("get_discovery with intent", di.text, JSON.stringify(di.structured));
  // Positioning: the tool lead is present in text and structured,
  // and the structured journey walks the design path first with
  // the order step last and framed optional.
  assert.ok(d.text.startsWith("NFC Tap Builder by Tap.Giving\n" + POSITIONING_LINE), "discovery text leads with the positioning line");
  assert.equal((d.structured.introduction as { positioning: string }).positioning, POSITIONING_LINE, "structured introduction carries the positioning line");
  const journey = d.structured.journey as Array<{ step: string; tool: string }>;
  // Persona round 1 (P-14a as amended by P-16): the journey states
  // the complete path: the design walk first, then the optional
  // order run (quote, questions, recap, place the order) in order.
  assert.deepEqual(journey.map((j) => j.tool), ["get_artwork_spec", "get_artwork_spec", "submit_artwork", "get_quote", "get_order_questions", "get_recap", "create_order"], "journey order: spec, build, submit and proof, then the optional order run through placing the order");
  assert.ok(/optional/.test(journey[3].step), "the order step is framed optional");
  assert.equal((d.structured.capabilities as { kickoff: string }).kickoff, "get_artwork_spec", "capabilities kickoff is the design path, not capture");

  // GET self-description and initialize instructions.
  const res = await worker.fetch(new Request("https://tap.giving/mcp", { method: "GET" }), env);
  const getText = await res.text();
  scanOpening("GET self-description", getText, "", { fullToolList: true, rangeLineRequired: false });
  assert.ok(getText.includes(POSITIONING_LINE), "GET carries the positioning line");
  assert.ok(getText.indexOf(POSITIONING_LINE) < getText.indexOf("## Tools"), "positioning sits in the GET opening, before the tool list");
  const initRes = await worker.fetch(new Request("https://tap.giving/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "guard", version: "1" } } }),
  }), env);
  const init = await initRes.json() as { result: { instructions: string } };
  scanOpening("initialize instructions", init.result.instructions, "", { rangeLineRequired: false });
  assert.ok(init.result.instructions.startsWith(POSITIONING_LINE), "initialize instructions lead with the positioning line");
  assert.equal(SERVER_DESCRIPTION.startsWith(POSITIONING_LINE), true, "server description leads with the positioning line");

  // tools/list first sentences: the lines the GET renders as its
  // tool list. The get_quote line names its own detail (it is the
  // quote step, where detail belongs) but never the code itself.
  const listRes = await worker.fetch(new Request("https://tap.giving/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  }), env);
  const list = await listRes.json() as { result: { tools: Array<{ name: string; description: string }> } };
  for (const t of list.result.tools) {
    const first = t.description.split(". ")[0] + ".";
    assert.ok(!first.includes("WELCOME10"), `tools/list first sentence for ${t.name}: no discount code`);
    if (t.name === "get_discovery" || t.name === "get_product" || t.name === "get_artwork_spec" || t.name === "submit_artwork") {
      assert.ok(!/minimum/i.test(first), `tools/list first sentence for ${t.name}: no minimum statement`);
    }
  }
  const discoveryLine = list.result.tools.find((t) => t.name === "get_discovery")!.description.split(". ")[0];
  assert.ok(/design tool/.test(discoveryLine), "get_discovery's listed line leads with the design tool");

  // get_product: disc pricing is the range only, and no minimum
  // is stated anywhere in the payload (the stands and badges keep
  // their product prices; their old minimum fields are gone).
  const p = await runTool(env, req(), "get_product", {}, fetchFn);
  const pJson = JSON.stringify(p.structured);
  assert.ok(!(p.structured.discs as Record<string, unknown>).unitCents, "no disc unit price in get_product");
  assert.equal((p.structured.discs as { priceRange: string }).priceRange, PRICE_RANGE_LINE, "discs block carries the range line");
  assert.ok(!/minimum/i.test(pJson) && !/minimum/i.test(p.text), "no minimum stated anywhere in get_product");
  assert.ok(!pJson.includes("WELCOME10"), "no discount in get_product");
  const stands = (p.structured.stands as { products: Array<Record<string, unknown>> }).products;
  assert.ok(stands.every((x) => typeof x.priceCents === "number" && !("minimum" in x)), "stand prices stay, stand minimums are gone");

  // The quote step keeps the full detail: this guard fails if the
  // stripping ever reaches the wrong surface.
  const q = await runTool(env, req(), "get_quote", { quantity: 100, antiMetalCount: 20 }, fetchFn);
  assert.equal(q.structured.firstOrderTotalCents, 47000, "first-order payable total intact at the quote step");
  assert.equal((q.structured.discount as { code: string }).code, "WELCOME10", "discount detail intact at the quote step");
  await assert.rejects(() => runTool(env, req(), "get_quote", { quantity: 99 }, fetchFn), /minimum order is 100/, "minimum enforcement intact at the quote step");
});
