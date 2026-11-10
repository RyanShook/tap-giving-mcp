// No-keys honesty contract (settlements, Ryan 2026-11-09): this
// server has NO credentials at any point. There is no key to get,
// no keyed tool, and no unauthorized outcome: the error code itself
// is retired. Every published tool is probed twice, keyless and
// with a garbage Authorization header, and both probes must behave
// identically (the header is ignored). The classification
// published by get_discovery must match that enforcement, the
// settled protected string and confirmation text must stand
// verbatim on every carrying surface, and the docs (README, both
// SKILL.md copies, the spec) must carry the same contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOOLS, runTool } from "../src/tools.ts";
import { setRasterizerForTests } from "../src/preview.ts";
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
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
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
    STRIPE_API_KEY_TEST: "sk_test_stub",
    MCP_INVOKE_SECRET: "stub-invoke-secret",
  } as unknown as Env;
}

function req(key?: string): Request {
  return new Request("https://tap.giving/mcp", {
    method: "POST",
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
}

// Probe arguments each tool's own validation refuses or answers
// without side effects worth asserting on; the point of the probe
// is the outcome class, never an auth refusal.
const PROBE_ARGS: Record<string, Record<string, unknown>> = {
  get_discovery: {},
  get_quote: { quantity: 250 },
  get_product: {},
  get_artwork_spec: { shape: "round" },
  get_examples: {},
  get_order_questions: {},
  get_recap: {},
  get_order_status: {},
  submit_artwork: {},
  start_order_intent: {},
  create_order: {},
};

const READS = ["get_discovery", "get_quote", "get_product", "get_artwork_spec", "get_examples", "get_order_questions", "get_recap", "get_order_status"];
const WRITES = ["submit_artwork", "start_order_intent", "create_order"];

const SETTLED_PROTECTED = "This server moves no money itself: when an order is placed, Tap.Giving emails the invoice and the design proof, and a person pays the hosted invoice.";

async function probe(env: Env, name: string, key?: string): Promise<string> {
  try {
    await runTool(env, req(key), name, PROBE_ARGS[name], (async () => new Response("nope", { status: 404 })) as typeof fetch);
    return "answered";
  } catch (e) {
    return (e as { code?: string }).code ?? "error";
  }
}

test("every tool runs keyless, and a garbage Authorization header is ignored identically", async () => {
  setRasterizerForTests(null);
  const env = makeEnv();
  assert.equal(TOOLS.length, 11, "the tool set is eleven tools after the register_webhook retirement and the get_examples addition (SPEC mcp-examples-spec)");
  for (const t of TOOLS) assert.ok(t.name in PROBE_ARGS, `probe args exist for ${t.name}`);
  assert.equal(TOOLS.find((t) => t.name === "register_webhook"), undefined, "register_webhook is not a tool");

  for (const t of TOOLS) {
    const keyless = await probe(env, t.name);
    const garbage = await probe(env, t.name, "tg_test_garbage_header_value_that_must_be_ignored");
    assert.notEqual(keyless, "unauthorized", `${t.name} must never refuse keyless with unauthorized (got ${keyless})`);
    assert.equal(garbage, keyless, `${t.name} behaves identically with a garbage Authorization header (keyless ${keyless}, garbage ${garbage})`);
  }

  // The published classification: exactly the empirical split,
  // each tool in exactly one set, and no key vocabulary at all.
  const d = await runTool(env, req(), "get_discovery", {}, (async () => new Response("nope", { status: 404 })) as typeof fetch);
  const caps = d.structured.capabilities as Record<string, unknown>;
  assert.deepEqual([...(caps.readTools as string[])].sort(), [...READS].sort(), "readTools is exactly the eight reads, get_order_status among them");
  assert.deepEqual([...(caps.writeTools as string[])].sort(), [...WRITES].sort(), "writeTools is exactly the three writes");
  for (const absent of ["howToGetAKey", "keyedReadTools", "keyWait", "testKey"]) {
    assert.ok(!(absent in caps) && !(absent in d.structured), `${absent} appears nowhere in discovery`);
  }
  const all = [...(caps.readTools as string[]), ...(caps.writeTools as string[])];
  assert.equal(new Set(all).size, 11, "each tool appears in exactly one discovery set");
  assert.ok(!all.includes("register_webhook") && !all.includes("request_invoice"), "retired tools appear in no set");
  assert.ok(caps.artworkExport === undefined || String(caps.artworkExport).includes("capability"), "the artwork export is described as the capability read it is");

  // No key formats or key framing anywhere in the discovery
  // payload, the GET self-description, or the initialize
  // instructions.
  const res = await worker.fetch(new Request("https://tap.giving/mcp", { method: "GET" }), env);
  assert.equal(res.status, 200);
  const self = await res.text();
  const initRes = await worker.fetch(new Request("https://tap.giving/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "guard", version: "1" } } }),
  }), env);
  const init = await initRes.json() as { result: { instructions: string } };
  for (const [label, surface] of [["discovery text", d.text], ["discovery structured", JSON.stringify(d.structured)], ["GET self-description", self], ["initialize instructions", init.result.instructions]] as const) {
    assert.ok(!/tg_live_|tg_test_/.test(surface), `${label}: no key formats`);
    assert.ok(!/howToGetAKey|keyedReadTools|testKey/.test(surface), `${label}: no key vocabulary`);
    assert.ok(!/key required/i.test(surface), `${label}: nothing is described as key required`);
  }
  assert.ok(d.text.includes("no account, key, or login"), "discovery text states the no-credentials rule");
  assert.ok(self.includes("No account, key, or login at any point"), "self-description states the no-credentials rule");
  assert.ok(!self.includes("## Auth"), "the self-description has no Auth section");
  assert.ok(self.includes(SETTLED_PROTECTED), "self-description carries the settled protected string verbatim");
  assert.ok(d.text.includes(SETTLED_PROTECTED), "discovery text carries the settled protected string verbatim");

  // tools/list descriptions carry no key framing either.
  for (const t of TOOLS) {
    assert.ok(!/key required|API key/i.test(t.description), `${t.name} description carries no key framing`);
  }
});

test("get_order_questions returns the static question set in the settled order, keyless", async () => {
  const env = makeEnv();
  const r = await runTool(env, req(), "get_order_questions", {}, (async () => new Response("nope", { status: 404 })) as typeof fetch);
  const s = r.structured as { organization?: unknown; questions: Array<{ field: string }> };
  assert.equal(s.organization, undefined, "no organization block: there is no key to bind one to");
  assert.deepEqual(
    s.questions.map((q) => q.field),
    ["contactEmail", "organizationName", "shipTo", "quantity", "size", "antiMetalCount", "mounting", "linkDestination", "contactName"],
    "the settled collection order (Ryan, 2026-11-09): email, organization, ship-to with phone, quantity, size, anti-metal, mounting, destination confirmation, contact name",
  );
});

test("repo docs carry the same no-keys classification (README, SKILL, spec)", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const readme = read("../README.md");
  const skill = read("../SKILL.md");
  const skillCopy = read("../skills/nfc-tap-builder/SKILL.md");
  const spec = read("../docs/spec.md");
  const OLD_NO_MONEY_1 = "This server moves no money itself and issues no invoices: a person from Tap.Giving follows up with the invoice.";
  const OLD_NO_MONEY_2 = "it returns a hosted invoice link for a person to pay";
  for (const [label, doc] of [["README", readme], ["SKILL.md", skill], ["skills SKILL.md", skillCopy], ["spec", spec]] as const) {
    assert.ok(!doc.includes("Reads need no key;"), `${label} must not carry the retired keyed-reads framing`);
    assert.ok(!doc.includes("Read tools need no key"), `${label} must not carry the retired keyed-reads framing`);
    assert.ok(!doc.includes(OLD_NO_MONEY_2), `${label} must not carry the retired invoice-link sentence`);
    assert.ok(!doc.includes("| `request_invoice` |"), `${label} must not table the retired request_invoice tool`);
    assert.ok(!doc.includes("| `register_webhook` |"), `${label} must not table the retired register_webhook tool as a live tool`);
  }
  // Key formats are banned on the live copy surfaces. In the spec
  // they survive only inside banner-marked superseded sections
  // (the retired key-mode contract), which is deliberate history.
  for (const [label, doc] of [["README", readme], ["SKILL.md", skill], ["skills SKILL.md", skillCopy]] as const) {
    assert.ok(!/tg_live_|tg_test_/.test(doc), `${label}: no key formats`);
  }
  // The superseded 2026-11-08 no-money sentence is banned on the
  // live copy surfaces; in the spec it survives only inside dated
  // landing records that quote it as history, which is deliberate.
  for (const [label, doc] of [["README", readme], ["SKILL.md", skill], ["skills SKILL.md", skillCopy]] as const) {
    assert.ok(!doc.includes(OLD_NO_MONEY_1), `${label} must not carry the superseded no-money sentence`);
  }
  assert.ok(spec.includes(SETTLED_PROTECTED), "the spec carries the settled protected string");
  for (const [label, doc] of [["README", readme], ["SKILL.md", skill], ["skills SKILL.md", skillCopy]] as const) {
    assert.ok(doc.includes(SETTLED_PROTECTED), `${label} carries the settled protected string verbatim`);
    assert.ok(/no account, key, or login/i.test(doc), `${label} states the no-credentials rule`);
  }
  assert.ok(spec.includes("register_webhook leaves the published tool set in v1") && spec.includes("historical registration contract, not a live offer"), "the spec carries register_webhook in its retired section (2.9.1)");
  assert.equal(skill, skillCopy, "the two SKILL.md copies stay identical");
});
