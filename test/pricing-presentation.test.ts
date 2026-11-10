// Pricing presentation and positioning guard (Ryan rulings,
// 2026-11-08, tightened 2026-11-09): phase one carries ZERO
// pricing references, not even the per-disc range. The range and
// the no-fees line first appear at get_order_questions; minimums,
// tier breakdowns, discounts, and totals appear only at the quote
// step (get_quote and the order flow after it). The same rulings make the server
// a tool first: the lead identity is creating print-ready NFC tap
// artwork proofs, the artwork is the organization's own and
// vendor-neutral, and ordering is the optional second step.
//
// Surfaces guarded here: the get_discovery payload (text and
// structured content, deep-scanned), the GET self-description,
// the initialize instructions, the tools/list first sentences
// (the lines the GET renders as its tool list), the get_product
// payload (disc pricing beyond the range, and any minimum stated
// anywhere in it), the get_artwork_spec and submit_artwork
// payloads, the explainer resources, and the tools/list
// descriptions of the four phase-one tools. Quote and post-quote
// surfaces keep their full detail and are asserted intact at the
// end, so the guard cannot be satisfied by stripping the wrong
// surface.
//
// Zero-price pattern class (CEO ruling, Ryan's spec "Phase 1
// carries ZERO pricing references, full stop", 2026-11-09, after
// the Goal 1 cold run still found them): the ferrite per-disc
// charge sentence, "at the same price", "at no extra cost", "Free
// shipping", "No subscription fees", "free Redirect Dashboard",
// and the "30-day money-back guarantee" are pricing references.
// None may appear on a phase-one surface; each stays available at
// the phase-two order questions, where the guard asserts them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../src/tools.ts";
import { BENEFITS_PHASE_TWO, NO_FEES_LINE, POSITIONING_LINE, PRICE_RANGE_LINE, SERVER_DESCRIPTION } from "../src/facts.ts";
import { EXPLAINER_TOPICS } from "../src/explainer.ts";

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

// Phase one (2026-11-09): NO pricing statement is allowed on the
// opening surfaces at all. Any pricing pattern fails: dollar
// amounts, the range line, the no-fees line, the discount code,
// percent-off copy, tier structures or ranges, unit-price fields,
// and minimum-order statements. (Geometry minimums, like the QR
// error-correction floor or the 18 mm logo minimum, are not
// pricing and are not scanned for.)
function scanPhaseOne(label: string, text: string, structuredJson: string): void {
  for (const [where, body] of [["text", text], ["structured", structuredJson]] as const) {
    assert.ok(!body.includes(PRICE_RANGE_LINE), `${label} ${where}: no price range line in phase one`);
    assert.ok(!body.includes(NO_FEES_LINE), `${label} ${where}: no no-fees line in phase one`);
    assert.ok(!body.includes("WELCOME10"), `${label} ${where}: no discount code named`);
    assert.ok(!/percent off/i.test(body), `${label} ${where}: no percent-off copy`);
    assert.ok(!body.includes("minimumQuantity"), `${label} ${where}: no minimumQuantity field`);
    assert.ok(!/minimum order/i.test(body), `${label} ${where}: no minimum-order statement`);
    assert.ok(!body.includes('"unitCents"'), `${label} ${where}: no tier unit prices`);
    assert.ok(!body.includes('"priceCents"'), `${label} ${where}: no price fields`);
    assert.ok(!body.includes('"tiers"'), `${label} ${where}: no tier structure`);
    assert.ok(!/100-199|200-399/.test(body), `${label} ${where}: no tier ranges`);
    assert.ok(!/\$\d/.test(body), `${label} ${where}: no dollar amounts`);
    assert.ok(!/\d+\.\d{2} per disc/i.test(body), `${label} ${where}: no per-disc prices`);
    // Zero-price pattern class (CEO ruling 2026-11-09): the price
    // claims are pricing references too, not just amounts.
    assert.ok(!/per[- ]disc (charge|price|pricing|cost|fee)/i.test(body), `${label} ${where}: no per-disc pricing phrasing`);
    assert.ok(!/\bcharge (settled|applies|added|per|of)\b/i.test(body), `${label} ${where}: no charge phrasing`);
    assert.ok(!/at the same price/i.test(body), `${label} ${where}: no same-price claim`);
    assert.ok(!/at no extra cost/i.test(body), `${label} ${where}: no extra-cost claim`);
    assert.ok(!/free shipping/i.test(body), `${label} ${where}: no free-shipping claim`);
    assert.ok(!/subscription fees/i.test(body), `${label} ${where}: no subscription-fees claim`);
    assert.ok(!/free Redirect Dashboard/i.test(body), `${label} ${where}: no free-dashboard claim`);
    assert.ok(!/money-back guarantee/i.test(body), `${label} ${where}: no money-back guarantee claim`);
  }
}

test("phase one carries zero pricing; pricing first appears at the order questions; the quote step keeps full detail", async () => {
  const env = makeEnv();

  // get_discovery, with and without an intent naming a disc count
  // (the intent path used to quote worked totals here).
  const d = await runTool(env, req(), "get_discovery", {}, fetchFn);
  scanPhaseOne("get_discovery", d.text, JSON.stringify(d.structured));
  const di = await runTool(env, req(), "get_discovery", { intent: "We want about 150 discs. What will it cost?" }, fetchFn);
  scanPhaseOne("get_discovery with intent", di.text, JSON.stringify(di.structured));
  // Positioning: the tool lead is present in text and structured,
  // and the structured journey walks the design path first with
  // the order step last and framed optional.
  assert.ok(d.text.startsWith("NFC Tap Builder by Tap.Giving\n" + POSITIONING_LINE), "discovery text leads with the positioning line");
  assert.equal((d.structured.introduction as { positioning: string }).positioning, POSITIONING_LINE, "structured introduction carries the positioning line");
  const journey = d.structured.journey as Array<{ step: string; tool: string }>;
  assert.deepEqual(journey.map((j) => j.tool), ["get_artwork_spec", "get_artwork_spec", "submit_artwork", "get_quote", "get_order_questions", "get_recap", "create_order"], "journey order: spec, build, submit and proof, then the optional order run through placing the order");
  assert.ok(/optional/.test(journey[3].step), "the order step is framed optional");
  assert.equal(journey[journey.length - 1].step, "Email me my invoice and design proof.", "the final journey step carries its settled label");
  assert.equal((d.structured.capabilities as { kickoff: string }).kickoff, "get_artwork_spec", "capabilities kickoff is the design path, not capture");

  // GET self-description and initialize instructions.
  const res = await worker.fetch(new Request("https://tap.giving/mcp", { method: "GET" }), env);
  const getText = await res.text();
  scanPhaseOne("GET self-description", getText, "");
  assert.ok(getText.includes(POSITIONING_LINE), "GET carries the positioning line");
  assert.ok(getText.indexOf(POSITIONING_LINE) < getText.indexOf("## Tools"), "positioning sits in the GET opening, before the tool list");
  const initRes = await worker.fetch(new Request("https://tap.giving/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "guard", version: "1" } } }),
  }), env);
  const init = await initRes.json() as { result: { instructions: string } };
  scanPhaseOne("initialize instructions", init.result.instructions, "");
  assert.ok(init.result.instructions.startsWith(POSITIONING_LINE), "initialize instructions lead with the positioning line");
  assert.equal(SERVER_DESCRIPTION.startsWith(POSITIONING_LINE), true, "server description leads with the positioning line");

  // tools/list first sentences: no pricing patterns in any of them.
  const listRes = await worker.fetch(new Request("https://tap.giving/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  }), env);
  const list = await listRes.json() as { result: { tools: Array<{ name: string; description: string }> } };
  assert.equal(list.result.tools.length, 11, "tools/list carries exactly eleven tools (get_examples added, SPEC mcp-examples-spec)");
  for (const t of list.result.tools) {
    const first = t.description.split(". ")[0] + ".";
    assert.ok(!first.includes("WELCOME10") && !/\$\d/.test(first) && !/minimum order/i.test(first), `tools/list first sentence for ${t.name}: no pricing pattern`);
  }
  const discoveryLine = list.result.tools.find((t) => t.name === "get_discovery")!.description.split(". ")[0];
  assert.ok(/design tool/.test(discoveryLine), "get_discovery's listed line leads with the design tool");

  // get_product: no pricing at all (discs carry no range, stands
  // and badges carry no prices), and no minimum stated anywhere.
  const p = await runTool(env, req(), "get_product", {}, fetchFn);
  const pJson = JSON.stringify(p.structured);
  scanPhaseOne("get_product", p.text, pJson);
  assert.ok(!(p.structured.discs as Record<string, unknown>).unitCents, "no disc unit price in get_product");
  assert.ok(!("priceRange" in (p.structured.discs as Record<string, unknown>)), "no price range on the discs block in phase one");
  assert.ok(!/minimum/i.test(pJson) && !/minimum/i.test(p.text), "no minimum stated anywhere in get_product");
  const stands = (p.structured.stands as { products: Array<Record<string, unknown>> }).products;
  assert.ok(stands.every((x) => !("priceCents" in x) && !("minimum" in x)), "stand prices and minimums are gone from phase one");

  // get_artwork_spec and submit_artwork are phase-one surfaces too.
  const spec = await runTool(env, req(), "get_artwork_spec", { shape: "round" }, fetchFn);
  scanPhaseOne("get_artwork_spec", spec.text, JSON.stringify(spec.structured));

  // The tools/list descriptions of the four phase-one tools are
  // phase-one surfaces: the whole description is scanned, not just
  // its first sentence. "Free-text" input wording is protocol
  // language, not a price claim, and is masked before the scan.
  const phaseOneToolNames = ["get_discovery", "get_product", "get_artwork_spec", "submit_artwork"];
  for (const t of list.result.tools) {
    if (!phaseOneToolNames.includes(t.name)) continue;
    scanPhaseOne(`tools/list ${t.name}`, t.description.replace(/free-text/gi, "open-text"), "");
  }
  // The schema description of chosenExampleRef rides the artwork
  // spec and submit listings; it names the pick paths only.
  const specTool = list.result.tools.find((t) => t.name === "get_artwork_spec")!;
  assert.ok(JSON.stringify(specTool).includes("description words"), "listed spec schema names description picks");

  // The explainer resources are phase-one surfaces.
  for (const topic of EXPLAINER_TOPICS) {
    scanPhaseOne(`explainer ${topic.slug}`, topic.body, "");
  }

  // submit_artwork is scanned on a real minimal submission.
  const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const sub = await runTool(env, req(), "submit_artwork", {
    file: { filename: "guard.png", mediaType: "image/png", contentBase64: PNG_B64 },
    sha256: [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(Buffer.from(PNG_B64, "base64"))))].map((b) => b.toString(16).padStart(2, "0")).join(""),
  }, fetchFn);
  scanPhaseOne("submit_artwork", sub.text, JSON.stringify(sub.structured));

  // Pricing first appears at get_order_questions: the range line
  // and the no-fees line, in text and structured content.
  const oq = await runTool(env, req(), "get_order_questions", {}, fetchFn);
  assert.ok(oq.text.includes(PRICE_RANGE_LINE) && oq.text.includes(NO_FEES_LINE), "both pricing lines present at the order questions");
  assert.equal((oq.structured.pricing as { range: string }).range, PRICE_RANGE_LINE, "structured pricing carries the range line at the order questions");

  // Phase-two availability (CEO ruling 2026-11-09): every claim
  // removed from phase one remains available at the order
  // questions, in the structured set or the answer text.
  assert.deepEqual(oq.structured.benefits, BENEFITS_PHASE_TWO, "the full benefits set, price claims included, rides the order questions");
  const oqAll = oq.text + JSON.stringify(oq.structured);
  assert.ok(/free shipping/i.test(oqAll), "free shipping available at the order questions");
  assert.ok(/money-back guarantee/i.test(oqAll), "the guarantee available at the order questions");
  assert.ok(/included free on every order/i.test(oqAll), "the free-dashboard claim available at the order questions");
  assert.ok(/priced the same/i.test(oqAll), "the same-price fact available at the order questions");
  assert.ok(/at no extra cost/i.test(oqAll), "the no-extra-cost claim available at the order questions");
  assert.ok(/per shielded disc/i.test(oqAll), "the anti-metal per-disc price stated at the order questions");

  // The quote step keeps the full detail: this guard fails if the
  // stripping ever reaches the wrong surface.
  const q = await runTool(env, req(), "get_quote", { quantity: 100, antiMetalCount: 20 }, fetchFn);
  assert.equal(q.structured.firstOrderTotalCents, 47000, "first-order payable total intact at the quote step");
  assert.equal((q.structured.discount as { code: string }).code, "WELCOME10", "discount detail intact at the quote step");
  await assert.rejects(() => runTool(env, req(), "get_quote", { quantity: 99 }, fetchFn), /minimum order is 100/, "minimum enforcement intact at the quote step");
});

test("get_examples carries zero pricing (phase-one scan, SPEC mcp-examples-spec)", async () => {
  const env = makeEnv();
  const all = await runTool(env, req(), "get_examples", {}, fetchFn);
  scanPhaseOne("get_examples", all.text, JSON.stringify(all.structured));
  const squarePage = await runTool(env, req(), "get_examples", { shape: "square" }, fetchFn);
  scanPhaseOne("get_examples square page", squarePage.text, JSON.stringify(squarePage.structured));
  const lastPage = await runTool(env, req(), "get_examples", { offset: 18 }, fetchFn);
  scanPhaseOne("get_examples last page", lastPage.text, JSON.stringify(lastPage.structured));
});
