// Server card guard (SEP-2127 seat on the server itself,
// GET /mcp/server-card): the card this server serves about itself
// must state the same truth as the well-known card on the site
// Worker and as the server's own live surfaces. The tool list is
// pinned against the TOOLS registry tools/list serves (never a
// second hand-kept list), the retired tool names and the keyed /
// keyless split must be absent, and the access statement is the
// facts module's settled sentence, verbatim.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import worker from "../src/index.ts";
import type { Env } from "../src/env.ts";
import { ACCESS_STATEMENT, ENDPOINT, REPO_URL, SERVER_NAME } from "../src/facts.ts";
import { TOOLS } from "../src/tools.ts";
import { AGENTS_GUIDE_URL, SERVER_CARD_NAME, SERVER_CARD_SCHEMA_URL, SERVER_VERSION } from "../src/server-card.ts";

class MemoryKV {
  store = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  async list(): Promise<{ keys: Array<{ name: string }>; list_complete: boolean }> {
    return { keys: [...this.store.keys()].map((name) => ({ name })), list_complete: true };
  }
}

const env = {
  MCP_KEYS: new MemoryKV() as unknown as KVNamespace,
  MCP_ARTWORK: new MemoryKV() as unknown as KVNamespace,
  ORDERS: new MemoryKV() as unknown as KVNamespace,
  DEV_ORDERS: new MemoryKV() as unknown as KVNamespace,
} as unknown as Env;

const SETTLED_STATEMENT =
  "Discovery, quotes, product facts, the artwork spec, artwork submission, and ordering all work with no key and no login, at any point.";
const LIVE_TOOL_NAMES = [
  "get_discovery",
  "get_quote",
  "get_product",
  "get_artwork_spec",
  "submit_artwork",
  "start_order_intent",
  "get_order_questions",
  "get_recap",
  "create_order",
  "get_order_status",
];

async function getCard(): Promise<{ res: Response; body: string; card: Record<string, any> }> {
  const res = await worker.fetch(new Request("https://tap.giving/mcp/server-card"), env);
  const body = await res.text();
  return { res, body, card: JSON.parse(body) as Record<string, any> };
}

test("GET /mcp/server-card serves the card with the server-card content type", async () => {
  const { res, card } = await getCard();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "application/mcp-server-card+json");
  assert.equal(card.$schema, SERVER_CARD_SCHEMA_URL);
  assert.equal(card.title, SERVER_NAME);
  assert.equal(card.websiteUrl, "https://tap.giving/");
  assert.deepEqual(card.repository, { url: REPO_URL, source: "github" });
  assert.deepEqual(card.remotes, [
    { type: "streamable-http", url: ENDPOINT, supportedProtocolVersions: ["2025-03-26"] },
  ]);
});

test("the card name and version match server.json, the registry source", () => {
  const serverJson = JSON.parse(
    readFileSync(fileURLToPath(new URL("../server.json", import.meta.url)), "utf8"),
  ) as { name: string; version: string };
  assert.equal(SERVER_CARD_NAME, serverJson.name);
  assert.equal(SERVER_VERSION, serverJson.version);
});

test("the card's tools are the live registry, in order, with no retired names", async () => {
  const { body, card } = await getCard();
  const cardTools = card["io.github.ryanshook/tools"] as string[];
  assert.deepEqual(cardTools, TOOLS.map((t) => t.name));
  assert.deepEqual(cardTools, LIVE_TOOL_NAMES);
  assert.ok(!body.includes("request_invoice"), "retired request_invoice must not appear");
  assert.ok(!body.includes("register_webhook"), "retired register_webhook must not appear");

  // The same names the server's own tools/list answers right now.
  const listRes = await worker.fetch(
    new Request("https://tap.giving/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }),
    env,
  );
  const list = (await listRes.json()) as { result: { tools: Array<{ name: string }> } };
  assert.deepEqual(cardTools, list.result.tools.map((t) => t.name));
});

test("the card carries no keyed or keyless split, only the unified access statement", async () => {
  const { body, card } = await getCard();
  assert.ok(!/keyed/i.test(body), "no keyed split term anywhere in the card");
  assert.ok(!/keyless/i.test(body), "no keyless split term anywhere in the card");
  assert.equal(ACCESS_STATEMENT, SETTLED_STATEMENT);
  assert.deepEqual(card["io.github.ryanshook/access"], {
    statement: SETTLED_STATEMENT,
    guide: AGENTS_GUIDE_URL,
  });
});

test("HEAD /mcp/server-card mirrors GET with no body", async () => {
  const { res: getRes, body } = await getCard();
  const head = await worker.fetch(new Request("https://tap.giving/mcp/server-card", { method: "HEAD" }), env);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("Content-Type"), "application/mcp-server-card+json");
  assert.equal(head.headers.get("Content-Length"), String(new TextEncoder().encode(body).length));
  assert.equal(await head.text(), "");
  assert.equal(getRes.headers.get("Content-Length"), String(new TextEncoder().encode(body).length));
});
