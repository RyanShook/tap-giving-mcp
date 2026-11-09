// F3 discovery honesty, re-pinned to the P-15/P-16 contract
// (Ryan rulings 2026-11-08, persona round 1): placing an order
// never requires a key. get_recap and create_order answer keyless,
// binding to the flow's own data (the contact email and the
// captured intent); request_invoice is retired (placement records
// the order and emails it to the team; a person follows up with
// the invoice). get_order_status and register_webhook stay keyed.
// The classification published by get_discovery must match actual
// enforcement for every tool, and no agent-facing surface may
// state or imply that a keyed tool is keyless or that placement
// needs a key. Enforcement is established empirically: each tool
// is called with NO Authorization header against in-memory fakes.
// A keyed tool refuses with an `unauthorized` ToolError before any
// other validation; a keyless tool answers, or refuses for a
// non-auth reason (its own input validation), never `unauthorized`.
// Key-gated tools are probed with inputs their own validation
// refuses before any write can happen (the auth gate runs first in
// every key-gated handler), so the probe creates nothing. The
// key-optional writes (submit_artwork, start_order_intent,
// create_order) are probed the same way.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOOLS, runTool } from "../src/tools.ts";
import { setRasterizerForTests } from "../src/preview.ts";
import { KEY_REQUEST_LINE } from "../src/facts.ts";
import { sha256Hex } from "../src/keys.ts";
import worker from "../src/index.ts";
import type { Env } from "../src/env.ts";
import type { KeyRecord } from "../src/keys.ts";

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

const TEST_KEY = `tg_test_f3-honesty-org_${"D".repeat(43)}`;

async function makeEnv(): Promise<Env> {
  const keys = new MemoryKV();
  const now = new Date().toISOString();
  const rec: KeyRecord = {
    orgSlug: "f3-honesty-org", orgName: "F3 Honesty Org", contactEmail: "f3@example.com", mode: "test",
    scopes: ["orders"], status: "active", createdAt: now, issuedTo: "f3@example.com", issuedBy: "test", issuedAt: now,
  };
  await keys.put(`KEYHASH:${await sha256Hex(TEST_KEY)}`, JSON.stringify(rec));
  return {
    MCP_KEYS: keys as unknown as KVNamespace,
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

// Non-auth-refusing arguments for every tool: valid where a keyless
// tool needs input, and refused by a keyed tool's own validation
// (never executed) if it were wrongly keyless.
const PROBE_ARGS: Record<string, Record<string, unknown>> = {
  get_discovery: {},
  get_quote: { quantity: 250 },
  get_product: {},
  get_artwork_spec: { shape: "round" },
  get_order_questions: {},
  get_recap: {},
  get_order_status: {},
  submit_artwork: {},
  start_order_intent: {},
  create_order: {},
  register_webhook: {},
};

const KEYLESS_READS = ["get_discovery", "get_quote", "get_product", "get_artwork_spec", "get_order_questions", "get_recap"];
const KEYED_READS = ["get_order_status"];
const KEYED_WRITES = ["register_webhook"];
// Key-optional writes by standing ruling, NOT key gated: they
// answer keyless and bind to the key's organization when one is
// presented. create_order joined this set under P-15 (keyless
// placement binds to the flow's contact email and intent instead).
// They belong to writeTools and to neither read set.
const OPTIONAL_WRITES = ["submit_artwork", "start_order_intent", "create_order"];
const KEYED = [...KEYED_READS, ...KEYED_WRITES];

async function probe(env: Env, name: string): Promise<string> {
  try {
    await runTool(env, req(), name, PROBE_ARGS[name], (async () => new Response("nope", { status: 404 })) as typeof fetch);
    return "answered";
  } catch (e) {
    return (e as { code?: string }).code ?? "error";
  }
}

test("discovery classification matches actual key enforcement for all 11 tools", async () => {
  setRasterizerForTests(null);
  const env = await makeEnv();
  assert.equal(TOOLS.length, 11, "the tool set is eleven tools after the request_invoice retirement");
  for (const t of TOOLS) assert.ok(t.name in PROBE_ARGS, `probe args exist for ${t.name}`);

  // Empirical enforcement, keyless calls.
  for (const name of KEYLESS_READS) {
    const outcome = await probe(env, name);
    assert.notEqual(outcome, "unauthorized", `${name} must answer without a key (got ${outcome})`);
  }
  for (const name of KEYED) {
    const outcome = await probe(env, name);
    assert.equal(outcome, "unauthorized", `${name} must refuse a keyless call with unauthorized (got ${outcome})`);
  }
  for (const name of OPTIONAL_WRITES) {
    const outcome = await probe(env, name);
    assert.notEqual(outcome, "unauthorized", `${name} is a key-optional write and must not refuse a keyless call with unauthorized (got ${outcome})`);
  }

  // The published classification: exactly the empirical split,
  // each tool in exactly one set.
  const d = await runTool(env, req(), "get_discovery", {}, (async () => new Response("nope", { status: 404 })) as typeof fetch);
  const caps = (d.structured as { capabilities: { readTools: string[]; keyedReadTools: string[]; writeTools: string[]; howToGetAKey: string; artworkExport: string } }).capabilities;
  assert.deepEqual([...caps.readTools].sort(), [...KEYLESS_READS].sort(), "readTools is exactly the keyless reads (get_recap among them, per P-15)");
  assert.deepEqual([...caps.keyedReadTools].sort(), [...KEYED_READS].sort(), "keyedReadTools is exactly the keyed reads (order status only)");
  assert.deepEqual([...caps.writeTools].sort(), [...KEYED_WRITES, ...OPTIONAL_WRITES].sort(), "writeTools is exactly the four writes");
  const all = [...caps.readTools, ...caps.keyedReadTools, ...caps.writeTools];
  assert.equal(new Set(all).size, 11, "each tool appears in exactly one discovery set");
  assert.ok(!all.includes("request_invoice"), "the retired tool appears in no set");
  // P-12: the artwork export fetch is published as what it is, a
  // keyless capability read.
  assert.ok(caps.artworkExport.includes("keyless capability read"), "capabilities describe the artwork export fetch as a keyless capability read");

  // The discovery text states the P-15 scope plainly: placement
  // needs no key; order status is the one keyed read.
  assert.ok(d.text.includes("Placing an order needs no key"), "discovery text states keyless placement");
  assert.ok(d.text.includes("Order status is the one read that uses the organization key"), "discovery text names order status as the keyed read");
  assert.ok(!d.text.includes("Recaps and order status are reads that use your organization key"), "the pre-P-15 keyed-reads sentence is gone");
  assert.ok(caps.howToGetAKey.includes("Placing an order never requires a key"), "howToGetAKey leads with keyless placement");
  assert.ok(caps.howToGetAKey.includes("order questions"), "howToGetAKey names the order questions among the keyless reads");
  assert.ok(!/Read tools need no key/.test(caps.howToGetAKey), "howToGetAKey must not claim read tools as a class need no key");
  assert.ok(!/Read tools need no key/.test(KEY_REQUEST_LINE), "KEY_REQUEST_LINE must not claim read tools as a class need no key");

  // tools/list descriptions agree with enforcement.
  for (const name of KEYED_READS) {
    assert.match(TOOLS.find((t) => t.name === name)!.description, /key required/i, `${name} description must say a key is required`);
  }
  for (const name of KEYED_WRITES) {
    assert.match(TOOLS.find((t) => t.name === name)!.description, /key/i, `${name} description must name the key it requires`);
  }
  for (const name of OPTIONAL_WRITES) {
    assert.doesNotMatch(TOOLS.find((t) => t.name === name)!.description, /key required/i, `${name} description must not say a key is required`);
  }
  for (const name of KEYLESS_READS) {
    assert.doesNotMatch(TOOLS.find((t) => t.name === name)!.description, /key required/i, `${name} description must not say a key is required`);
  }
  assert.match(TOOLS.find((t) => t.name === "get_order_questions")!.description, /no key/i, "get_order_questions description must say no key is needed");
  assert.match(TOOLS.find((t) => t.name === "get_discovery")!.description, /no key/i, "get_discovery description must say calling get_order_questions needs no key");
  assert.match(TOOLS.find((t) => t.name === "create_order")!.description, /no key/i, "create_order description must say no key is needed");

  // The GET self-description agrees with enforcement.
  const res = await worker.fetch(new Request("https://tap.giving/mcp", { method: "GET" }), env);
  assert.equal(res.status, 200);
  const self = await res.text();
  assert.ok(!self.includes("Reads need no key;"), "self-description must not claim reads as a class need no key");
  const authSection = self.slice(self.indexOf("## Auth"));
  assert.ok(authSection.includes("get_order_questions"), "self-description Auth section names get_order_questions");
  const keylessLine = authSection.split("\n").find((l) => l.startsWith("Keyless reads")) ?? "";
  assert.ok(keylessLine.includes("get_order_questions"), "self-description lists get_order_questions among the keyless reads");
  assert.ok(keylessLine.includes("get_recap"), "self-description lists get_recap among the keyless reads (P-15)");
  assert.ok(authSection.includes("Order status is the read that needs the organization's key"), "self-description names order status as the keyed read");
  assert.ok(!authSection.includes("Recaps and order status"), "self-description must not group the recap with the keyed reads");
});

test("get_order_questions keyless returns only the static question set", async () => {
  const env = await makeEnv();
  const r = await runTool(env, req(), "get_order_questions", {}, (async () => new Response("nope", { status: 404 })) as typeof fetch);
  const s = r.structured as { organization?: unknown; keylessNote?: unknown; questions: Array<{ field: string }> };
  assert.equal(s.organization, undefined, "no organization block without a key");
  assert.ok(!JSON.stringify(s).includes("f3-honesty-org"), "no key organization data in the keyless answer");
  assert.ok(!JSON.stringify(s).includes("f3@example.com"), "no key contact email in the keyless answer");
  assert.deepEqual(
    s.questions.map((q) => q.field),
    ["size", "quantity", "antiMetalCount", "mounting", "linkDestination", "contactName", "contactEmail", "contactPhone", "shipTo"],
    "the static question set, in order",
  );

  // With a key, the whoami block is present and bound to the key.
  const keyed = await runTool(env, req(TEST_KEY), "get_order_questions", {}, (async () => new Response("nope", { status: 404 })) as typeof fetch);
  const ks = keyed.structured as { organization?: { name?: string; contactEmail?: string } };
  assert.equal(ks.organization?.name, "F3 Honesty Org");
  assert.equal(ks.organization?.contactEmail, "f3@example.com");
});

test("repo docs carry the same classification (README, SKILL, spec)", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const readme = read("../README.md");
  const skill = read("../SKILL.md");
  const skillCopy = read("../skills/nfc-tap-builder/SKILL.md");
  const spec = read("../docs/spec.md");
  const NEW_NO_MONEY = "This server moves no money itself and issues no invoices: a person from Tap.Giving follows up with the invoice.";
  const OLD_NO_MONEY = "it returns a hosted invoice link for a person to pay";
  for (const [label, doc] of [["README", readme], ["SKILL.md", skill], ["skills SKILL.md", skillCopy], ["spec", spec]] as const) {
    assert.ok(!doc.includes("Reads need no key;"), `${label} must not claim reads as a class need no key`);
    assert.ok(!doc.includes("Read tools need no key"), `${label} must not claim read tools as a class need no key`);
    assert.ok(!/get_order_questions` \| yes/.test(doc), `${label} must not table get_order_questions as keyed`);
    assert.ok(!doc.includes("(v1, read, key required\nso the answers bind"), `${label} must not spec get_order_questions as key required`);
    assert.ok(!doc.includes(OLD_NO_MONEY), `${label} must not carry the retired invoice-link sentence (CEO reword, 2026-11-08)`);
    assert.ok(!doc.includes("| `request_invoice` |"), `${label} must not table the retired request_invoice tool`);
  }
  assert.ok(readme.includes("| `get_order_questions` | no |"), "README tools table lists get_order_questions as keyless");
  assert.ok(readme.includes("| `get_recap` | no |"), "README tools table lists get_recap as keyless (P-15)");
  assert.ok(readme.includes("| `create_order` | no |"), "README tools table lists create_order as keyless (P-15)");
  assert.ok(readme.includes(NEW_NO_MONEY), "README carries the reworded no-money sentence verbatim");
  assert.ok(skill.includes(NEW_NO_MONEY), "SKILL.md carries the reworded no-money sentence verbatim");
  const keylessBlock = skill.slice(skill.indexOf("Keyless reads"), skill.indexOf("Keyless or optional-key writes"));
  assert.ok(keylessBlock.includes("`get_order_questions`"), "SKILL.md lists get_order_questions among the keyless reads");
  assert.ok(keylessBlock.includes("`get_recap`"), "SKILL.md lists get_recap among the keyless reads (P-15)");
  const keyedBlock = skill.slice(skill.indexOf("Keyed tools"), skill.indexOf("Every tool declares"));
  assert.ok(!keyedBlock.includes("`get_order_questions`"), "SKILL.md keyed table must not list get_order_questions");
  assert.ok(!keyedBlock.includes("`get_recap`"), "SKILL.md keyed table must not list get_recap (P-15)");
  assert.ok(!keyedBlock.includes("`create_order`"), "SKILL.md keyed table must not list create_order (P-15)");
  assert.equal(skill, skillCopy, "the two SKILL.md copies stay identical");
});
