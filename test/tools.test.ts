// Behavior tests for the tool implementations against in-memory KV
// fakes and a recording fetch stub (the business doors and Stripe are
// stubbed at the fetch seam; the acceptance run exercises the real
// deployed surfaces).

import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../src/tools.ts";
import { setRasterizerForTests } from "../src/preview.ts";
import { EXAMPLES } from "../src/examples.ts";
import { BENEFITS, NO_FEES_LINE, TAX_NOTE } from "../src/facts.ts";
import worker from "../src/index.ts";
import { sha256Hex } from "../src/keys.ts";
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

const TEST_KEY = `tg_test_mcp-acceptance-test-church_${"A".repeat(43)}`;
const LIVE_KEY_WRONG_ORG = `tg_test_other-church_${"B".repeat(43)}`;

async function makeEnv(): Promise<{ env: Env; keys: MemoryKV }> {
  const keys = new MemoryKV();
  const now = new Date().toISOString();
  const mk = async (key: string, slug: string, email: string, mode: "live" | "test") => {
    const rec: KeyRecord = {
      orgSlug: slug, orgName: slug, contactEmail: email, mode, scopes: ["orders"],
      status: "active", createdAt: now, issuedTo: email, issuedBy: "test", issuedAt: now,
    };
    await keys.put(`KEYHASH:${await sha256Hex(key)}`, JSON.stringify(rec));
  };
  await mk(TEST_KEY, "mcp-acceptance-test-church", "mcp-acceptance@example.com", "test");
  await mk(LIVE_KEY_WRONG_ORG, "other-church", "other@example.com", "test");
  const env = {
    MCP_KEYS: keys as unknown as KVNamespace,
    MCP_ARTWORK: new MemoryKV() as unknown as KVNamespace,
    ORDERS: new MemoryKV() as unknown as KVNamespace,
    DEV_ORDERS: new MemoryKV() as unknown as KVNamespace,
    STRIPE_API_KEY_TEST: "sk_test_stub",
    MCP_INVOKE_SECRET: "<MASKED_SECRET_003>",
  } as unknown as Env;
  return { env, keys };
}

function req(key?: string): Request {
  return new Request("https://tap.giving/mcp", {
    method: "POST",
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
}

// A fetch stub: business doors record their calls; Stripe INVOKED
// returns canned objects; everything else 404s.
function stubFetch(calls: Array<{ url: string; body?: string }>) {
  return async (input: unknown, init?: { method?: string; body?: string }): Promise<Response> => {
    const url = String((input as { url?: string })?.url ?? input);
    calls.push({ url, body: init?.body });
    if (url.includes("/api/lead")) return new Response(JSON.stringify({ queued: true }), { status: 200 });
    if (url.includes("/api/invoice-request")) return new Response(JSON.stringify({ ok: true, totalUsd: "900.00" }), { status: 200 });
    if (url.includes("/api/mcp-invoke")) {
      const parsed = JSON.parse(init?.body || "{}");
      if (parsed.op === "recordArtworkSubmission") return new Response(JSON.stringify({ ok: true, recordKey: "STEPCAP:1:x" }), { status: 200 });
      if (parsed.op === "readOrderRecords") return new Response(JSON.stringify({ ok: true, found: false, crmRow: null, fulfillment: null }), { status: 200 });
      return new Response(JSON.stringify({ ok: false }), { status: 400 });
    }
    if (url.includes("api.stripe.com")) {
      if (url.includes("/customers") && (!init || init.method === "GET" || !init.method)) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes("/customers")) return new Response(JSON.stringify({ id: "cus_stub" }), { status: 200 });
      if (url.includes("/invoices") && init?.method !== "POST") {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.includes("/invoices") && init?.method === "POST" && !url.includes("finalize")) {
        return new Response(JSON.stringify({ id: "in_stub" }), { status: 200 });
      }
      if (url.includes("/invoiceitems")) return new Response(JSON.stringify({ id: "ii_stub" }), { status: 200 });
      if (url.includes("finalize")) {
        return new Response(JSON.stringify({ id: "in_stub", number: "TEST-0001", status: "open", hosted_invoice_url: "https://invoice.stripe.com/i/stub", total: 90000 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }
    return new Response("nope", { status: 404 });
  };
}

// 1x1 PNG (a real decodable PNG).
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function pngSha(): Promise<string> {
  const bin = atob(PNG_B64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return sha256HexBytes(u8);
}
async function sha256HexBytes(u8: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", u8 as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SHIP_TO = { name: "MCP Acceptance Test Church", street: "100 Test Way", city: "Spring", state: "TX", postalCode: "77380", country: "US", phone: "+17135550199" };

test("cold leg: discovery, quote, product, artwork spec need no key", async () => {
  const { env } = await makeEnv();
  const calls: Array<{ url: string }> = [];
  const fetchFn = stubFetch(calls) as typeof fetch;
  const d = await runTool(env, req(), "get_discovery", {}, fetchFn);
  assert.equal((d.structured.server as { name: string }).name, "NFC Tap Builder by Tap.Giving");
  const q = await runTool(env, req(), "get_quote", { quantity: 250 }, fetchFn);
  // Headline totals are LIST totals (Marketing content check 2026-11-06);
  // the WELCOME10 figure is a conditional line, never asserted eligible
  // for an unverified keyless caller.
  assert.equal(q.structured.grandTotalCents, 100000);
  assert.equal(q.structured.grandTotalWithFirstOrderDiscountCents, 90000);
  assert.equal(q.structured.discUnitCents, 400);
  assert.equal(q.structured.discSubtotalCents, 100000);
  const disc = q.structured.discount as Record<string, unknown>;
  assert.equal(disc.code, "WELCOME10");
  assert.equal(disc.appliedInHeadlineTotals, false);
  assert.ok(!("eligible" in disc) && !("baked" in disc), "no eligibility assertion to an unverified caller");
  assert.equal(q.structured.shippingLine, "Shipping: Free");
  const p = await runTool(env, req(), "get_product", {}, fetchFn);
  assert.ok(JSON.stringify(p.structured).includes("NTAG213"));
  assert.ok(JSON.stringify(p.structured).includes("30-day money-back guarantee"), "guarantee named in product facts");
  assert.ok(JSON.stringify(p.structured).includes("in seconds"), "dashboard changes-in-seconds claim present");
  assert.ok(JSON.stringify(d.structured).includes("30-day money-back guarantee"), "guarantee named in discovery");
  assert.ok(JSON.stringify(d.structured).includes("WELCOME10"), "discount code named in discovery");
  assert.ok(JSON.stringify(d.structured).includes("7-day renewing window"), "discount window named in discovery");
  const a = await runTool(env, req(), "get_artwork_spec", { shape: "round" }, fetchFn);
  assert.equal((a.structured.examples as unknown[]).length, 3);
  assert.ok(JSON.stringify(a.structured).includes("5 MB"), "artwork spec states the 5 MB intake cap");
  assert.ok(!JSON.stringify(a.structured).includes("never raster"), "intake wording is permissive, no raster refusal");
  await assert.rejects(() => runTool(env, req(), "get_quote", { quantity: 99 }, fetchFn), /minimum order is 100/);
});

test("submit_artwork: keyless PNG accepted, hash echoed, benefits present", async () => {
  const { env } = await makeEnv();
  const sha = await pngSha();
  const r = await runTool(env, req(), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: sha,
  }, stubFetch([]) as typeof fetch);
  assert.equal(r.structured.received, true);
  assert.equal(r.structured.sha256, sha);
  assert.ok(Array.isArray(r.structured.benefits) && (r.structured.benefits as string[]).length === 6);
  assert.ok(!r.text.includes("Why Tap.Giving"), "the repeated benefits block is out of the submit text (F13)");
  assert.ok(Array.isArray(r.images) && r.images.length >= 1, "submission returns a preview image");
  assert.ok(!r.text.startsWith("TEST MODE"), "a keyless submission carries no TEST MODE line");
});

test("submit_artwork: masquerade and hash mismatch are refused", async () => {
  const { env } = await makeEnv();
  const sha = await pngSha();
  const exeB64 = btoa("MZ" + "x".repeat(100));
  await assert.rejects(() => runTool(env, req(), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: exeB64 }, sha256: "0".repeat(64),
  }, stubFetch([]) as typeof fetch), /sha256 does not match|bytes are a/);
  await assert.rejects(() => runTool(env, req(), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: "0".repeat(64),
  }, stubFetch([]) as typeof fetch), /does not match/);
  void sha;
});

test("start_order_intent posts to /api/lead with the mcp:intent source", async () => {
  const { env } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const r = await runTool(env, req(), "start_order_intent", { email: "mcp-acceptance@example.com", organizationName: "MCP Acceptance Test Organization", quantityHint: 250 }, stubFetch(calls) as typeof fetch);
  assert.equal(r.structured.captured, true);
  const lead = calls.find((c) => c.url.includes("/api/lead"));
  assert.ok(lead);
  const body = JSON.parse(lead!.body!);
  assert.equal(body.source, "mcp:intent");
  assert.equal(body.quantity, "250", "the lead door's quantity field is a string (LeadCoreData)");
  assert.ok(!("hp" in body) && !("formStartedAt" in body), "no honeypot or timing fields are fabricated");
});

test("keyed journey: recap, create_order (idempotent), request_invoice, status", async () => {
  const { env } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchFn = stubFetch(calls) as typeof fetch;
  const sha = await pngSha();
  const art = await runTool(env, req(TEST_KEY), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: sha,
  }, fetchFn);
  const artworkRef = art.structured.artworkRef as string;

  const recapArgs = {
    quantity: 250, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    artworkRef, contactEmail: "mcp-acceptance@example.com",
  };
  const recap = await runTool(env, req(TEST_KEY), "get_recap", recapArgs, fetchFn);
  assert.equal((recap.structured.cost as { grandTotalCents: number }).grandTotalCents, 100000);
  assert.deepEqual(recap.structured.notes, [
    "Shipping usually takes two to three weeks from artwork approval.",
    "We email you a final proof before anything is printed.",
  ]);
  // F17/F18: the recap names the customer, the destination, the proof
  // recipient, the sequence, and the conditional discount line.
  assert.ok(recap.text.includes("coo") || recap.text.includes("mcp-acceptance@example.com"), "recap names the contact");
  assert.ok(recap.text.includes("production waits until the final proof is approved by email"), "sequence sentence present");
  assert.ok(recap.text.includes("WELCOME10"), "conditional discount named in recap text");
  const recapRef = recap.structured.recapRef as string;

  const orderArgs = {
    ...recapArgs, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef, exit: "pay_now", idempotencyKey: "acceptance-order-0001",
  };
  const order = await runTool(env, req(TEST_KEY), "create_order", orderArgs, fetchFn);
  const orderRef = order.structured.orderRef as string;
  assert.ok(orderRef.startsWith("mcp:mcp-acceptance-test-church:"));
  // The test seat got the INVREQ-shaped record (DEV_ORDERS write).
  const devOrders = (env.DEV_ORDERS as unknown as MemoryKV).store;
  assert.equal([...devOrders.keys()].filter((k) => k.startsWith("INVREQ:")).length, 1);

  // Retry with the same key and payload returns the original, no second write.
  const replay = await runTool(env, req(TEST_KEY), "create_order", orderArgs, fetchFn);
  assert.equal(replay.structured.orderRef, orderRef);
  assert.equal([...devOrders.keys()].filter((k) => k.startsWith("INVREQ:")).length, 1);

  // Same key, different payload: conflict naming the field.
  await assert.rejects(
    () => runTool(env, req(TEST_KEY), "create_order", { ...orderArgs, quantity: 300 }, fetchFn),
    /differing fields are: quantity/);

  const inv = await runTool(env, req(TEST_KEY), "request_invoice", { orderRef, idempotencyKey: "acceptance-invoice-0001" }, fetchFn);
  assert.equal(inv.structured.status, "open");
  assert.equal(inv.structured.handoffLine, "Review your invoice: https://invoice.stripe.com/i/stub");
  assert.equal(inv.structured.totalCents, 90000);

  const status = await runTool(env, req(TEST_KEY), "get_order_status", { orderRef }, fetchFn);
  assert.equal(status.structured.stage, "received"); // seat says no CRM row yet
  assert.ok(JSON.stringify(status.structured).includes("invoice.stripe.com"));

  // Another org's key reads not_found for this orderRef.
  await assert.rejects(
    () => runTool(env, req(LIVE_KEY_WRONG_ORG), "get_order_status", { orderRef }, fetchFn),
    /not an order this key/);
});

test("create_order refuses below minimum, bad size is manual_exception, no recap is refused", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const base = {
    contactName: "T", contactEmail: "mcp-acceptance@example.com", contactPhone: "+17135550199",
    quantity: 250, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    recapRef: "recap_missing", idempotencyKey: "acceptance-order-0002",
  };
  await assert.rejects(() => runTool(env, req(TEST_KEY), "create_order", { ...base, quantity: 50 }, fetchFn), /minimum order is 100/);
  await assert.rejects(() => runTool(env, req(TEST_KEY), "create_order", { ...base, size: "150mm-round" }, fetchFn),
    (e: Error & { code?: string }) => e.code === "manual_exception");
  await assert.rejects(() => runTool(env, req(TEST_KEY), "create_order", base, fetchFn), /not a recap/);
  // Email mismatch with the key's org: forbidden.
  await assert.rejects(() => runTool(env, req(TEST_KEY), "create_order", { ...base, contactEmail: "someoneelse@example.com" }, fetchFn),
    (e: Error & { code?: string }) => e.code === "forbidden");
});

test("register_webhook stores the subscription and says delivery is pending", async () => {
  const { env, keys } = await makeEnv();
  const r = await runTool(env, req(TEST_KEY), "register_webhook", {
    callbackUrl: "https://example.com/hook", events: ["proof_ready", "shipped"],
  }, stubFetch([]) as typeof fetch);
  assert.equal(r.structured.delivery, "pending");
  assert.ok(String(r.structured.subscriptionSecret).startsWith("whsec_"));
  assert.ok(keys.store.has("WEBHOOK:mcp-acceptance-test-church"));
  await assert.rejects(() => runTool(env, req(TEST_KEY), "register_webhook", {
    callbackUrl: "http://example.com/hook", events: ["proof_ready"],
  }, stubFetch([]) as typeof fetch), /https/);
});

test("writes without a key are unauthorized; garbage keys are unauthorized", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  await assert.rejects(() => runTool(env, req(), "get_order_questions", {}, fetchFn),
    (e: Error & { code?: string }) => e.code === "unauthorized");
  await assert.rejects(() => runTool(env, req("tg_test_nope_short"), "get_order_questions", {}, fetchFn),
    (e: Error & { code?: string }) => e.code === "unauthorized");
});

// ─── request_invoice: live-mode keys proceed (parity passed 2026-11-07) ─────────────────

const LIVE_KEY = `tg_live_live-org-church_${"C".repeat(43)}`;

async function seedLiveKey(keys: MemoryKV): Promise<void> {
  const now = new Date().toISOString();
  const rec: KeyRecord = {
    orgSlug: "live-org-church", orgName: "live-org-church", contactEmail: "live@example.com",
    mode: "live", scopes: ["orders"], status: "active", createdAt: now,
    issuedTo: "live@example.com", issuedBy: "test", issuedAt: now,
  };
  await keys.put(`KEYHASH:${await sha256Hex(LIVE_KEY)}`, JSON.stringify(rec));
}

test("request_invoice with a live-mode key proceeds past the former parity gate to the order lookup", async () => {
  const { env, keys } = await makeEnv();
  await seedLiveKey(keys);
  // The parity gate is lifted (leg (f) passed 2026-11-07): a live-mode
  // key now enters the normal flow. With no order under this ref, the
  // flow stops at the order lookup, before any fetch or Stripe call.
  (env as unknown as Record<string, unknown>).STRIPE_API_KEY_LIVE = "sk_live_stub";
  const calls: Array<{ url: string; body?: string }> = [];
  await assert.rejects(
    () => runTool(env, req(LIVE_KEY), "request_invoice", { orderRef: "mcp:live-org-church:abc123", idempotencyKey: "live-invoice-0001" }, stubFetch(calls) as typeof fetch),
    (e: unknown) => {
      assert.equal((e as { code?: string }).code, "not_found");
      return true;
    },
  );
  assert.equal(calls.length, 0, "no fetch of any kind: the order lookup stops the flow before Stripe");
});

test("request_invoice in test mode still stops at stripe_unavailable while no test secret is set", async () => {
  const { env } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchFn = stubFetch(calls) as typeof fetch;
  const sha = await pngSha();
  const art = await runTool(env, req(TEST_KEY), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: sha,
  }, fetchFn);
  const recapArgs = {
    quantity: 250, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    artworkRef: art.structured.artworkRef as string, contactEmail: "mcp-acceptance@example.com",
  };
  const recap = await runTool(env, req(TEST_KEY), "get_recap", recapArgs, fetchFn);
  const order = await runTool(env, req(TEST_KEY), "create_order", {
    ...recapArgs, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap.structured.recapRef as string, exit: "pay_now", idempotencyKey: "parity-probe-order-0001",
  }, fetchFn);
  const orderRef = order.structured.orderRef as string;
  (env as unknown as Record<string, unknown>).STRIPE_API_KEY_TEST = undefined;
  await assert.rejects(
    () => runTool(env, req(TEST_KEY), "request_invoice", { orderRef, idempotencyKey: "parity-probe-invoice-0001" }, fetchFn),
    (e: unknown) => {
      assert.equal((e as { code?: string }).code, "stripe_unavailable");
      return true;
    },
  );
  assert.equal(calls.filter((c) => c.url.includes("api.stripe.com")).length, 0);
});

test("get_artwork_spec: inline example images and numbered build-from pick list, both shapes", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  for (const shape of ["round", "square"] as const) {
    const r = await runTool(env, req(), "get_artwork_spec", { shape }, fetchFn);
    const expected = EXAMPLES.filter((e) => e.shape === shape);
    assert.equal(expected.length, 3);
    // structuredContent unchanged: the examples array and its
    // displayUrls are intact, in the established order.
    const exs = r.structured.examples as Array<{ id: string; direction: string; shape: string; displayUrl: string }>;
    assert.deepEqual(exs.map((e) => e.id), expected.map((e) => e.id));
    for (const [i, e] of exs.entries()) {
      assert.equal(e.direction, expected[i].direction);
      assert.equal(e.shape, shape);
      assert.ok(e.displayUrl.endsWith(`/mcp/examples/${e.id}.png`), "displayUrl fallback intact");
    }
    // The result carries exactly one text block (r.text) plus three
    // image blocks (r.images), and no single-image field.
    assert.equal(typeof r.text, "string");
    assert.equal(r.image, undefined);
    assert.ok(r.images);
    assert.equal(r.images.length, 3);
    for (const [i, img] of r.images.entries()) {
      assert.equal(img.mimeType, "image/png");
      // Byte equality against the source files the displayUrls serve.
      assert.equal(img.data, expected[i].pngBase64);
      const bytes = Buffer.from(img.data, "base64");
      assert.ok(bytes.equals(Buffer.from(expected[i].pngBase64, "base64")));
      assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "real PNG magic");
    }
    // Numbered pick list: entries correspond one-to-one and in order
    // with structuredContent.examples and with the image blocks
    // (entry N describes image block N).
    let lastIdx = -1;
    for (const [i, e] of exs.entries()) {
      const line = `${i + 1}. ${shape === "round" ? "Round" : "Square"}, ${expected[i].pickLabel}: ${e.direction}.`;
      const idx = r.text.indexOf(line);
      assert.ok(idx > lastIdx, `pick list entry ${i + 1} present and in order`);
      lastIdx = idx;
    }
    // Build-from framing: directions are starting templates for the
    // caller's own artwork, submitted via submit_artwork; the closing
    // ask is a number selection of a direction.
    assert.ok(r.text.includes("starting templates to build from"), "frames examples as build-from templates");
    assert.ok(r.text.includes("Tell me the number of the direction you want to build from"), "closing ask: number of a direction");
    assert.ok(r.text.includes("compose your own artwork"), "compose step is explicit");
    assert.ok(r.text.includes("submit_artwork"), "names the submission path");
    assert.ok(r.text.includes("never ordered or shipped as-is"), "no example is presented as shippable as-is");
    assert.ok(!/\b(pick|choose) (one|it|the|your)\b/i.test(r.text), "no bare pick/choose phrasing");
  }
});

test("example display routes: HEAD returns the GET headers with no body", async () => {
  const { env } = await makeEnv();
  for (const ex of [EXAMPLES[0], EXAMPLES[1]]) {
    const url = `https://tap.giving/mcp/examples/${ex.id}.png`;
    const get = await worker.fetch(new Request(url), env);
    assert.equal(get.status, 200);
    const getBytes = Buffer.from(await get.arrayBuffer());
    assert.ok(getBytes.equals(Buffer.from(ex.pngBase64, "base64")), "GET serves the source bytes");
    const head = await worker.fetch(new Request(url, { method: "HEAD" }), env);
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("Content-Type"), "image/png");
    assert.equal(head.headers.get("Content-Length"), String(getBytes.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0, "HEAD has no body");
  }
});

test("GET self-description carries the connect guidance", async () => {
  const { env } = await makeEnv();
  const res = await worker.fetch(new Request("https://tap.giving/mcp", { method: "GET" }), env);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes("## Connect"), "connect section present in GET text");
  assert.ok(text.includes('"tap-giving"'), "named server in the config block");
  assert.ok(text.includes('"type": "http"'), "http transport in the config block");
  assert.ok(text.includes('"url": "https://tap.giving/mcp"'), "endpoint in the config block");
  assert.ok(text.includes("claude mcp add --transport http tap-giving https://tap.giving/mcp"), "Claude Code one-liner present");
  assert.ok(text.includes("Reads need no key"), "keyless-reads note present");
});

test("get_discovery: sectioned first presentation with the no-fees lead line", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const d = await runTool(env, req(), "get_discovery", {}, fetchFn);
  // Headed sections, in order.
  let lastIdx = -1;
  for (const h of ["What it is", "Why Tap.Giving", "Pricing", "How it works", "Gates"]) {
    const idx = d.text.indexOf(`\n${h}\n`);
    assert.ok(idx > lastIdx, `section heading present and in order: ${h}`);
    lastIdx = idx;
  }
  // The Why section leads with the no-fees line, before the benefits
  // bullets; all six benefits appear as bullets, unchanged.
  const whyIdx = d.text.indexOf("Why Tap.Giving");
  const leadIdx = d.text.indexOf(NO_FEES_LINE, whyIdx);
  assert.ok(leadIdx > whyIdx, "no-fees lead line sits inside the Why section");
  for (const b of BENEFITS) {
    const bi = d.text.indexOf(`- ${b}`);
    assert.ok(bi > leadIdx, `benefit bullet present after the lead line: ${b}`);
  }
  assert.deepEqual(d.structured.capabilities && (d.structured.capabilities as { benefits: string[] }).benefits, BENEFITS, "structured benefits unchanged");
  // Pricing leads with the range line only (Amendment A, refined,
  // Ryan 2026-11-07): the tier breakdown and the minimum are out of
  // the discovery text entirely, while the structured pricing data
  // keeps both intact.
  assert.ok(d.text.includes("Price range of $3.50 - $5.00 per disc depending on quantity."), "range line verbatim in discovery text");
  assert.ok(!d.text.includes("100-199 discs at $5.00 each"), "tier list absent from discovery text");
  assert.ok(!/minimum/i.test(d.text), "minimum not named anywhere in discovery text");
  const pricing = d.structured.pricing as { minimumQuantity: number; tiers: Array<{ quantity: number; unitCents: number }> };
  assert.equal(pricing.minimumQuantity, 100, "structured minimumQuantity intact");
  assert.deepEqual(pricing.tiers.map((t) => [t.quantity, t.unitCents]), [[100, 500], [200, 400], [400, 350]], "structured tiers intact");
  // Pricing still carries the guarantee and the new tax note.
  assert.ok(d.text.includes("30-day money-back guarantee"));
  assert.equal(TAX_NOTE, "Tax, where it applies, is calculated on the invoice.");
  assert.ok(d.text.includes(TAX_NOTE), "new tax sentence present in discovery text");
  // No affirmative checkout claim anywhere in the discovery text.
  assert.ok(!/checkout/i.test(d.text), "no checkout claim in discovery text");
  // The payment gate sentence stands verbatim.
  assert.ok(d.text.includes("This server moves no money itself: it returns a hosted invoice link for a person to pay."), "gate sentence verbatim");
  // How it works names the build-from and submit path.
  assert.ok(d.text.includes("Build artwork from the example directions in get_artwork_spec, and submit it with submit_artwork."));
});

// ─── first-user round 1 fixes ─────────────────────────────────────

test("F19: live-mode writes carry no TEST MODE line, test-mode reads neither", async () => {
  const { env, keys } = await makeEnv();
  await seedLiveKey(keys);
  (env as unknown as Record<string, unknown>).STRIPE_API_KEY_LIVE = "sk_live_stub";
  const fetchFn = stubFetch([]) as typeof fetch;
  const d = await runTool(env, req(TEST_KEY), "get_discovery", {}, fetchFn);
  assert.ok(!d.text.startsWith("TEST MODE"), "reads are unprefixed");
});

test("F3 + F1: discovery classifies keyed reads honestly and carries the product photos", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const d = await runTool(env, req(), "get_discovery", {}, fetchFn);
  const caps = d.structured.capabilities as { readTools: string[]; keyedReadTools: string[] };
  assert.deepEqual(caps.readTools, ["get_discovery", "get_quote", "get_product", "get_artwork_spec"]);
  assert.deepEqual(caps.keyedReadTools, ["get_order_questions", "get_recap", "get_order_status"]);
  assert.ok(d.images && d.images.length === 2, "discovery returns the two product photos inline");
  assert.ok(d.text.includes("Order questions, recaps, and order status are reads that use your organization key"));
  assert.ok(!/ask Ryan/.test(d.text), "no first-name key ask in discovery text");
  const p = await runTool(env, req(), "get_product", {}, fetchFn);
  assert.ok(p.images && p.images.length === 2, "product returns the two photos inline");
  assert.ok(!/rides a later phase/.test(JSON.stringify(p.structured)), "no phase jargon in product facts");
});

test("F7 + F9 + F6: quote cliff line, helpful minimum, no source paths in text", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const q150 = await runTool(env, req(), "get_quote", { quantity: 150 }, fetchFn);
  assert.ok(q150.text.includes("200 discs would be $800.00 ($4.00 each): $50.00 more for 50 more discs."), "cliff line at 150");
  assert.ok(!q150.text.includes("Source:"), "no internal source paths in quote text");
  assert.ok("priceSource" in q150.structured, "price source stays in structured data");
  const q250 = await runTool(env, req(), "get_quote", { quantity: 250 }, fetchFn);
  assert.ok(!q250.text.includes("would be"), "no cliff line far from a boundary");
  await assert.rejects(() => runTool(env, req(), "get_quote", { quantity: 50 }, fetchFn),
    /smallest order is 100 discs for \$500\.00 list/);
});

test("F12: chosenExampleRef resolves by number and by id, confirms by name, refuses unknown", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const byNum = await runTool(env, req(), "get_artwork_spec", { shape: "round", chosenExampleRef: "2" }, fetchFn);
  assert.ok(byNum.text.includes("You picked: Deep Green & Gold Leaf"), "pick confirmed by name");
  assert.equal(byNum.images!.length, 1, "only the chosen design is shown");
  assert.equal((byNum.structured.chosenExample as { id: string }).id, "ex-forest-round");
  const byId = await runTool(env, req(), "get_artwork_spec", { shape: "square", chosenExampleRef: "ex-sand-square" }, fetchFn);
  assert.ok(byId.text.includes("You picked: Soft Sand, Stacked Serif"));
  await assert.rejects(() => runTool(env, req(), "get_artwork_spec", { shape: "round", chosenExampleRef: "9" }, fetchFn),
    /not one of the example directions/);
  const spec = await runTool(env, req(), "get_artwork_spec", { shape: "round" }, fetchFn);
  assert.ok(JSON.stringify(spec.structured).includes("disc-template-round.svg"), "template linked from the spec");
  assert.ok(JSON.stringify(spec.structured).includes("43.25"), "screw-hole positions stated in the spec");
  assert.ok(spec.text.includes("Screw holes"), "screw holes named in the spec text");
});

test("F13/F16: an SVG submission returns its design on the disc; the recap embeds the same render", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const fakePng = Buffer.from(PNG_B64, "base64");
  setRasterizerForTests(async (svg) => {
    assert.ok(svg.includes('clipPath'), "the rasterizer receives the disc composite, not the bare artwork");
    return new Uint8Array(fakePng);
  });
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 106 106"><rect width="106" height="106" fill="#1e4634"/><text x="53" y="55">CEDAR HOLLOW</text></svg>`;
    const svgB64 = Buffer.from(svg).toString("base64");
    const sha = await sha256HexBytes(new Uint8Array(Buffer.from(svg)));
    const sub = await runTool(env, req(TEST_KEY), "submit_artwork", {
      file: { filename: "cedar.svg", mediaType: "image/svg+xml", contentBase64: svgB64 }, sha256: sha, shape: "round",
    }, fetchFn);
    assert.equal((sub.structured.preview as { kind: string }).kind, "on-disc");
    assert.ok(sub.images && sub.images.length === 1, "one disc render for the chosen shape");
    const recap = await runTool(env, req(TEST_KEY), "get_recap", {
      quantity: 150, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
      artworkRef: sub.structured.artworkRef as string, contactEmail: "mcp-acceptance@example.com",
      linkDestination: "https://give.example.com/cedar",
    }, fetchFn);
    assert.ok(recap.image, "recap embeds the on-disc render");
    assert.equal(recap.image!.mimeType, "image/png");
    assert.ok(recap.text.includes("Tap destination: https://give.example.com/cedar"), "recap shows the link destination entered");
  } finally {
    setRasterizerForTests(null);
  }
});

test("F4 + F15: order questions carry the whoami block and every required field; the forbidden error names the allowed email", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const q = await runTool(env, req(TEST_KEY), "get_order_questions", {}, fetchFn);
  const org = q.structured.organization as { name: string; contactEmail: string };
  assert.equal(org.contactEmail, "mcp-acceptance@example.com");
  const fields = (q.structured.questions as Array<{ field: string }>).map((x) => x.field);
  assert.deepEqual(fields, ["size", "quantity", "antiMetalCount", "mounting", "linkDestination", "contactName", "contactEmail", "contactPhone", "shipTo"]);
  assert.ok(q.text.includes("never left going nowhere") || q.text.includes("never"), "blank destination default is stated");
  await assert.rejects(
    () => runTool(env, req(TEST_KEY), "get_recap", {
      quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO, contactEmail: "pastor.dana@cedarhollow.example",
    }, fetchFn),
    (e: Error & { code?: string; details?: Record<string, unknown> }) => {
      assert.equal(e.code, "forbidden");
      assert.ok(/mcp-acceptance@example\.com/.test(e.message), "the error names the allowed email");
      assert.equal(e.details?.contactEmail, "mcp-acceptance@example.com");
      return true;
    });
});

test("F14: intent with a key skips the get-a-key line, returns intentRef, links artwork", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const sha = await pngSha();
  const art = await runTool(env, req(TEST_KEY), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: sha,
  }, fetchFn);
  const keyed = await runTool(env, req(TEST_KEY), "start_order_intent", {
    email: "mcp-acceptance@example.com", organizationName: "MCP Acceptance Test Organization", artworkRef: art.structured.artworkRef as string,
  }, fetchFn);
  assert.ok(String(keyed.structured.intentRef).startsWith("intent_"));
  assert.equal(keyed.structured.artworkLinked, true);
  assert.ok(!/ask Ryan|get a key|needs an organization API key/.test(keyed.text), "no get-a-key line when a key is present");
  assert.ok(/within one business day/.test(keyed.text), "follow-up expectation stated");
  const keyless = await runTool(env, req(), "start_order_intent", { email: "new@example.com" }, fetchFn);
  assert.ok(/hello@tap\.giving/.test(keyless.text), "keyless intent points at the team address");
  assert.ok(!/ask Ryan/.test(keyless.text));
});

test("F20: order status returns the dashboard address and login hint and the same-invoice note", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const sha = await pngSha();
  const art = await runTool(env, req(TEST_KEY), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: sha,
  }, fetchFn);
  const recapArgs = {
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    artworkRef: art.structured.artworkRef as string, contactEmail: "mcp-acceptance@example.com",
  };
  const recap = await runTool(env, req(TEST_KEY), "get_recap", recapArgs, fetchFn);
  const order = await runTool(env, req(TEST_KEY), "create_order", {
    ...recapArgs, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap.structured.recapRef as string, exit: "pay_now", idempotencyKey: "f20-status-order-0001",
  }, fetchFn);
  assert.ok(order.text.startsWith("TEST MODE"), "create_order text carries the TEST MODE line");
  assert.ok(!order.text.includes("adoption pass"), "no machinery voice in the order text");
  const orderRef = order.structured.orderRef as string;
  await runTool(env, req(TEST_KEY), "request_invoice", { orderRef, idempotencyKey: "f20-status-inv-0001" }, fetchFn);
  const status = await runTool(env, req(TEST_KEY), "get_order_status", { orderRef }, fetchFn);
  const dash = status.structured.dashboard as { tapAddress: string; loginUrl: string; username: string };
  assert.equal(dash.tapAddress, "https://go.tap.giving/mcp-acceptance-test-church");
  assert.equal(dash.loginUrl, "https://tap.giving/login");
  assert.ok(status.text.includes("Both links open the same invoice"), "same-invoice note in status text");
});

test("F12 routes: the template SVG and the product photos are served", async () => {
  const { env } = await makeEnv();
  const tpl = await worker.fetch(new Request("https://tap.giving/mcp/templates/disc-template-round.svg"), env);
  assert.equal(tpl.status, 200);
  const tplText = await tpl.text();
  assert.ok(tplText.includes('id="screw-hole-guides"'), "template carries the hole guides");
  assert.ok(tplText.includes('id="cut-guide"') && tplText.includes('id="safe-guide"') && tplText.includes('id="bleed-guide"'));
  const photo = await worker.fetch(new Request("https://tap.giving/mcp/photos/pew-disc.webp"), env);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("Content-Type"), "image/webp");
});

// ─── Round 2 fix pass ───────────────────────────────────────────────
import { buildDiscSvg } from "../src/preview.ts";

test("R2 F27: discovery answers an intent with a disc count and never echoes '?.'", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const d = await runTool(env, req(), "get_discovery", {
    intent: "I am a pastor of a 220-person church. We want about 150 discs. What will it cost, and what does it look like?",
  }, fetchFn);
  assert.ok(d.text.includes("For 150 discs: $750.00 total, or $675.00 with the first-order discount."), "headline in text");
  const guidance = (d.structured as { guidance?: string }).guidance ?? "";
  assert.ok(guidance.startsWith("About 150 discs: $750.00"), "guidance leads with the quote headline");
  assert.ok(!d.text.includes("?."), "no stray punctuation in text");
  assert.ok(!guidance.includes("?."), "no stray punctuation in guidance");
  const echo = await runTool(env, req(), "get_discovery", { intent: "Tell me about stands?" }, fetchFn);
  const echoGuidance = (echo.structured as { guidance?: string }).guidance ?? "";
  assert.ok(echoGuidance.startsWith("Noted intent: Tell me about stands."), "echo drops the trailing question mark");
});

test("R2 F7: the cliff line says '1 more disc' at 199", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const q = await runTool(env, req(), "get_quote", { quantity: 199 }, fetchFn);
  assert.ok(q.text.includes("1 more disc."), "singular handled");
  assert.ok(!q.text.includes("1 more discs"), "no plural slip");
});

test("R2 F5: customer text drops the chip jargon; the fact stays structured", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const d = await runTool(env, req(), "get_discovery", {}, fetchFn);
  assert.ok(!d.text.includes("NTAG213"), "discovery text is plain");
  assert.ok(!((d.structured.introduction as { product: string }).product.includes("NTAG213")), "introduction prose is plain");
  const p = await runTool(env, req(), "get_product", {}, fetchFn);
  assert.ok(!p.text.includes("NTAG213"), "product text is plain");
  assert.ok(!BENEFITS.join(" ").includes("NTAG213"), "benefits are plain");
  assert.ok(((p.structured.discs as { chip: string }).chip.includes("NTAG213")), "the chip fact stays in structured data");
});

test("R2 F15/F19: order questions carry the mounting photos inline and plain closing; keyed reads carry the banner", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const q = await runTool(env, req(TEST_KEY), "get_order_questions", {}, fetchFn);
  assert.ok(q.images && q.images.length === 2, "both mounting photos inline");
  assert.ok(!q.text.includes("idempotencyKey"), "no agent plumbing in the closing line");
  assert.ok(q.text.includes("keep the recap reference it returns"), "plain closing line");
  assert.ok(q.text.startsWith("TEST MODE:"), "keyed read carries the banner");
  const recap = await runTool(env, req(TEST_KEY), "get_recap", {
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO, contactEmail: "mcp-acceptance@example.com",
  }, fetchFn);
  assert.ok(recap.text.startsWith("TEST MODE:"), "recap carries the banner");
  assert.ok(recap.text.includes("We email you a final proof before anything is printed."), "F24 line in recap text");
  assert.ok(!recap.text.includes("before any order is placed"), "old proof line gone");
});

test("R2 F17: the recap echoes a contact name and phone when given", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const recap = await runTool(env, req(TEST_KEY), "get_recap", {
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    contactEmail: "mcp-acceptance@example.com", contactName: "Dana Whitfield", contactPhone: "+19315550142",
  }, fetchFn);
  const customer = recap.structured.customer as { contactName?: string; contactPhone?: string };
  assert.equal(customer.contactName, "Dana Whitfield");
  assert.equal(customer.contactPhone, "+19315550142");
  assert.ok(recap.text.includes("Contact: Dana Whitfield, mcp-acceptance@example.com, phone +19315550142."), "contact line carries name and phone");
});

test("R2 F21: the spec warns about the hole areas; a screws recap draws the holes on the preview", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const spec = await runTool(env, req(), "get_artwork_spec", { shape: "round" }, fetchFn);
  assert.ok(spec.text.includes("keep the two 6 mm hole areas clear"), "guideline in spec text");
  const withHoles = buildDiscSvg({ shape: "round", svgInner: { viewBox: "0 0 106 106", inner: "<rect width=\"106\" height=\"106\"/>" }, holes: true });
  assert.ok(withHoles.includes('cx="9.75"') && withHoles.includes('cx="96.25"'), "holes drawn at production centres");
  const noHoles = buildDiscSvg({ shape: "round", svgInner: { viewBox: "0 0 106 106", inner: "<rect width=\"106\" height=\"106\"/>" } });
  assert.ok(!noHoles.includes('cx="9.75"'), "no holes by default");

  const fakePng = Buffer.from(PNG_B64, "base64");
  let captured = "";
  setRasterizerForTests(async (svg) => { captured = svg; return new Uint8Array(fakePng); });
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 106 106"><rect width="106" height="106" fill="#1e4634"/></svg>`;
    const sha = await sha256HexBytes(new Uint8Array(Buffer.from(svg)));
    const sub = await runTool(env, req(TEST_KEY), "submit_artwork", {
      file: { filename: "plain.svg", mediaType: "image/svg+xml", contentBase64: Buffer.from(svg).toString("base64") }, sha256: sha, shape: "round",
    }, fetchFn);
    captured = "";
    const recap = await runTool(env, req(TEST_KEY), "get_recap", {
      quantity: 100, size: "100mm-round", mounting: "screws", shipTo: SHIP_TO,
      artworkRef: sub.structured.artworkRef as string, contactEmail: "mcp-acceptance@example.com",
    }, fetchFn);
    assert.ok(recap.image, "screws recap embeds the render");
    assert.ok(captured.includes('cx="9.75"'), "the recap render draws the holes for screws");
  } finally {
    setRasterizerForTests(null);
  }
});

test("R2 F26: live text in an SVG submission is called out with its font families", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const fakePng = Buffer.from(PNG_B64, "base64");
  setRasterizerForTests(async () => new Uint8Array(fakePng));
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 106 106"><rect width="106" height="106" fill="#1e4634"/><text x="53" y="55" font-family="Georgia, serif" font-weight="bold">CEDAR HOLLOW</text></svg>`;
    const sha = await sha256HexBytes(new Uint8Array(Buffer.from(svg)));
    const sub = await runTool(env, req(TEST_KEY), "submit_artwork", {
      file: { filename: "cedar.svg", mediaType: "image/svg+xml", contentBase64: Buffer.from(svg).toString("base64") }, sha256: sha, shape: "round",
    }, fetchFn);
    assert.ok(sub.text.includes("live text"), "the font caveat is stated");
    assert.ok(sub.text.includes("Georgia"), "the family is named");
    assert.ok(sub.text.includes("Convert text to outlines"), "the exact-match path is given");
  } finally {
    setRasterizerForTests(null);
  }
});

test("R2 isolation: a test-key intent says the capture is real; a test order says it stays out of the CRM", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const intent = await runTool(env, req(TEST_KEY), "start_order_intent", {
    email: "pastor.dana@cedarhollow.example", organizationName: "Cedar Hollow Community Organization", quantityHint: 150,
  }, fetchFn);
  assert.ok(intent.text.includes("this contact capture is real"), "capture honesty in intent text");
  assert.ok(intent.text.includes("lead list"), "the lead list is named");
});

test("R2 F22: a second order is discount-ineligible, and a reused invoice is named in plain text", async () => {
  const { env } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const fresh = stubFetch(calls) as typeof fetch;
  const shipArgs = { size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO, contactEmail: "mcp-acceptance@example.com" };

  const recap1 = await runTool(env, req(TEST_KEY), "get_recap", { ...shipArgs, quantity: 150 }, fresh);
  const order1 = await runTool(env, req(TEST_KEY), "create_order", {
    ...shipArgs, quantity: 150, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap1.structured.recapRef as string, exit: "pay_now", idempotencyKey: "r2-order-0001",
  }, fresh);
  const orderRef1 = order1.structured.orderRef as string;
  const devRecs = () => [...(env.DEV_ORDERS as unknown as MemoryKV).store.values()].map((v) => JSON.parse(v) as { mcpOrderRef: string; discountEligible: boolean });
  assert.equal(devRecs().find((r) => r.mcpOrderRef === orderRef1)?.discountEligible, true, "the first order is discount-eligible");
  await runTool(env, req(TEST_KEY), "request_invoice", { orderRef: orderRef1, idempotencyKey: "r2-invoice-0001" }, fresh);

  const recap2 = await runTool(env, req(TEST_KEY), "get_recap", { ...shipArgs, quantity: 200 }, fresh);
  const order2 = await runTool(env, req(TEST_KEY), "create_order", {
    ...shipArgs, quantity: 200, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap2.structured.recapRef as string, exit: "pay_now", idempotencyKey: "r2-order-0002",
  }, fresh);
  const orderRef2 = order2.structured.orderRef as string;
  assert.equal(devRecs().find((r) => r.mcpOrderRef === orderRef2)?.discountEligible, false, "the second order is NOT discount-eligible");
  assert.ok(String(order2.structured.crmExpectation).includes("does NOT enter the production CRM"), "test order states its isolation");

  // Stripe now shows order 1's invoice still open for this customer.
  const existingStub = (async (input: unknown, init?: { method?: string; body?: string }): Promise<Response> => {
    const url = String((input as { url?: string })?.url ?? input);
    if (url.includes("/api/")) return fresh(input as RequestInfo, init as RequestInit);
    if (url.includes("api.stripe.com")) {
      if (url.includes("/customers") && (!init || init.method === "GET" || !init.method)) {
        return new Response(JSON.stringify({ data: [{ id: "cus_prior" }] }), { status: 200 });
      }
      if (url.includes("/customers")) return new Response(JSON.stringify({ id: "cus_prior" }), { status: 200 });
      if (url.includes("/invoices") && init?.method !== "POST") {
        if (url.includes("status=open")) {
          return new Response(JSON.stringify({ data: [{ id: "in_prior", number: "PRIOR-0001", status: "open", hosted_invoice_url: "https://invoice.stripe.com/i/prior", total: 67500, metadata: { mcp_order_ref: orderRef1 } }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;

  const inv2 = await runTool(env, req(TEST_KEY), "request_invoice", { orderRef: orderRef2, idempotencyKey: "r2-invoice-0002" }, existingStub);
  assert.equal(inv2.structured.existing, true);
  assert.equal(inv2.structured.existingFromOrderRef, orderRef1, "the prior order is named in structured data");
  assert.ok(inv2.text.includes("PRIOR-0001"), "the prior invoice number is in the text");
  assert.ok(inv2.text.includes(orderRef1), "the prior order is named in the text");
  assert.ok(inv2.text.includes("150 discs, $675.00 total"), "the prior order's quantity and the invoice total are in the text");
  assert.ok(inv2.text.includes("is not invoiced separately"), "the consequence is stated");

  // The two orders differ on quantity (150 vs 200), so the stored
  // mint-time comparison names it on the invoice surfaces too.
  assert.deepEqual(inv2.structured.existingDifferingFields, ["quantity"], "the quantity difference is stored and returned");
  assert.ok(inv2.text.includes("The earlier order differs from this order in: quantity."), "the invoice text names the differing field");

  const status2 = await runTool(env, req(TEST_KEY), "get_order_status", { orderRef: orderRef2 }, fresh);
  assert.ok(status2.text.startsWith("TEST MODE:"), "status carries the banner");
  assert.ok(status2.text.includes(`was already open from order ${orderRef1}`), "status names the shared invoice's order");
  assert.ok(status2.text.includes("The earlier order differs from this order in: quantity."), "status appends the stored differing-fields line");
});


test("R2 F22 comparison: identical re-present warns on nothing; artwork and mounting diffs are named; status never recomputes", async () => {
  const { env, keys } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const fresh = stubFetch(calls) as typeof fetch;
  const shipArgs = { size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO, contactEmail: "mcp-acceptance@example.com" };

  // Submit two real artworks so both refs are valid order inputs.
  const artRefs: string[] = [];
  for (const seed of ["alpha", "beta"]) {
    const bytes = new Uint8Array(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" data-seed="${seed}"></svg>`));
    const sub = await runTool(env, req(TEST_KEY), "submit_artwork", {
      file: { filename: `${seed}.svg`, mediaType: "image/svg+xml", contentBase64: Buffer.from(bytes).toString("base64") },
      sha256: await sha256HexBytes(bytes), shape: "round",
    }, fresh);
    artRefs.push(sub.structured.artworkRef as string);
  }

  const mkOrder = async (over: Record<string, unknown>, key: string) => {
    const args = { ...shipArgs, quantity: 150, ...over };
    const recap = await runTool(env, req(TEST_KEY), "get_recap", args, fresh);
    const order = await runTool(env, req(TEST_KEY), "create_order", {
      ...args, contactName: "Test Pastor", contactPhone: "+17135550199",
      recapRef: recap.structured.recapRef as string, exit: "pay_now", idempotencyKey: key,
    }, fresh);
    return order.structured.orderRef as string;
  };

  // Order 1 carries artwork A; its own invoice mints fresh.
  const orderRef1 = await mkOrder({ artworkRef: artRefs[0] }, "r2c-order-0001");
  await runTool(env, req(TEST_KEY), "request_invoice", { orderRef: orderRef1, idempotencyKey: "r2c-invoice-0001" }, fresh);

  // Stripe reports order 1's invoice open for this customer from here on.
  const existingStub = (async (input: unknown, init?: { method?: string; body?: string }): Promise<Response> => {
    const url = String((input as { url?: string })?.url ?? input);
    if (url.includes("/api/")) return fresh(input as RequestInfo, init as RequestInit);
    if (url.includes("api.stripe.com")) {
      if (url.includes("/customers") && (!init || init.method === "GET" || !init.method)) {
        return new Response(JSON.stringify({ data: [{ id: "cus_prior" }] }), { status: 200 });
      }
      if (url.includes("/customers")) return new Response(JSON.stringify({ id: "cus_prior" }), { status: 200 });
      if (url.includes("/invoices") && init?.method !== "POST") {
        if (url.includes("status=open")) {
          return new Response(JSON.stringify({ data: [{ id: "in_prior", number: "PRIOR-0001", status: "open", hosted_invoice_url: "https://invoice.stripe.com/i/prior", total: 67500, metadata: { mcp_order_ref: orderRef1 } }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;

  // (a) Identical re-present: same five fields, new idempotency key.
  const orderRefSame = await mkOrder({ artworkRef: artRefs[0] }, "r2c-order-0002");
  const invSame = await runTool(env, req(TEST_KEY), "request_invoice", { orderRef: orderRefSame, idempotencyKey: "r2c-invoice-0002" }, existingStub);
  assert.equal(invSame.structured.existingFromOrderRef, orderRef1);
  assert.deepEqual(invSame.structured.existingDifferingFields, [], "identical orders carry an empty comparison");
  assert.ok(!invSame.text.includes("differs from this order"), "no warning line when nothing differs");
  const statusSame = await runTool(env, req(TEST_KEY), "get_order_status", { orderRef: orderRefSame }, fresh);
  assert.ok(!statusSame.text.includes("differs from this order"), "status carries no warning for the identical re-present");

  // (b) Same price, different artwork: the warning names artwork.
  const orderRefArt = await mkOrder({ artworkRef: artRefs[1] }, "r2c-order-0003");
  const invArt = await runTool(env, req(TEST_KEY), "request_invoice", { orderRef: orderRefArt, idempotencyKey: "r2c-invoice-0003" }, existingStub);
  assert.deepEqual(invArt.structured.existingDifferingFields, ["artworkRef"], "structured names the record field");
  assert.ok(invArt.text.includes("The earlier order differs from this order in: artwork."), "text names artwork");
  const statusArt = await runTool(env, req(TEST_KEY), "get_order_status", { orderRef: orderRefArt }, fresh);
  assert.ok(statusArt.text.includes("The earlier order differs from this order in: artwork."), "status names artwork");

  // (c) Mounting only: names mounting, not artwork.
  const orderRefMount = await mkOrder({ artworkRef: artRefs[0], mounting: "screws" }, "r2c-order-0004");
  const invMount = await runTool(env, req(TEST_KEY), "request_invoice", { orderRef: orderRefMount, idempotencyKey: "r2c-invoice-0004" }, existingStub);
  assert.deepEqual(invMount.structured.existingDifferingFields, ["mounting"]);
  assert.ok(invMount.text.includes("in: mounting."), "text names mounting");
  assert.ok(!invMount.text.includes("in: artwork"), "artwork is not named");

  // (d) Stored, not recomputed: mutate the prior order's mounting in
  // the record store; status for the artwork case must still report
  // the mint-time diff (artwork only, no mounting added).
  const priorRaw = keys.store.get(`ORDER:${orderRef1}`);
  assert.ok(priorRaw);
  const priorRec = JSON.parse(priorRaw as string) as { mounting: string };
  priorRec.mounting = "screws";
  keys.store.set(`ORDER:${orderRef1}`, JSON.stringify(priorRec));
  const statusArt2 = await runTool(env, req(TEST_KEY), "get_order_status", { orderRef: orderRefArt }, fresh);
  assert.ok(statusArt2.text.includes("The earlier order differs from this order in: artwork."), "status still reports the mint-time diff");
  assert.ok(!statusArt2.text.includes("mounting"), "the mutated prior field does not leak into status");
});
