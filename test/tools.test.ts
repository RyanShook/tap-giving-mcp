// Behavior tests for the tool implementations against in-memory KV
// fakes and a recording fetch stub (the business doors and Stripe are
// stubbed at the fetch seam; the acceptance run exercises the real
// deployed surfaces).

import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../src/tools.ts";
import { EXAMPLES } from "../src/examples.ts";
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
  assert.ok(r.image, "raster submission returns image content");
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
  const r = await runTool(env, req(), "start_order_intent", { email: "mcp-acceptance@example.com", church: "MCP Acceptance Test Church", quantityHint: 250 }, stubFetch(calls) as typeof fetch);
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
    "Shipping usually takes two to three weeks.",
    "We send a final proof via email before any order is placed.",
  ]);
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
