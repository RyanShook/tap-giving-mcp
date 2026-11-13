// Behavior tests for the tool implementations against in-memory KV
// fakes and a recording fetch stub (the business doors and Stripe are
// stubbed at the fetch seam; the acceptance run exercises the real
// deployed surfaces).

import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool, TOOLS } from "../src/tools.ts";
import { setRasterizerForTests } from "../src/preview.ts";
import { EXAMPLES_INDEX } from "../src/examples-data.ts";
import { PHOTOS_INDEX } from "../src/photos-data.ts";
import { BENEFITS, NO_FEES_LINE, PRICE_RANGE_LINE, TAX_NOTE, confirmationText, confirmationTextInvoicePending, confirmationTextInvoiceHeld, confirmationTextProofPending, confirmationTextCustomerEmailFailed } from "../src/facts.ts";
import worker from "../src/index.ts";
import { sha256Hex } from "../src/util.ts";
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

async function makeEnv(): Promise<{ env: Env; keys: MemoryKV; artwork: MemoryKV }> {
  const keys = new MemoryKV();
  const artwork = new MemoryKV();
  const env = {
    MCP_KEYS: keys as unknown as KVNamespace,
    MCP_ARTWORK: artwork as unknown as KVNamespace,
    ORDERS: new MemoryKV() as unknown as KVNamespace,
    DEV_ORDERS: new MemoryKV() as unknown as KVNamespace,
    STRIPE_API_KEY_TEST: "sk_test_stub",
    MCP_INVOKE_SECRET: "<redacted>",
  } as unknown as Env;
  return { env, keys, artwork };
}

// Seed the KV-backed example and photo bytes (a real PNG payload for
// every id in the committed indexes), so route and inline-image tests
// exercise the same KV path production uses.
async function seedExamples(artwork: MemoryKV): Promise<void> {
  const png = Buffer.from(PNG_B64, "base64");
  const bytes = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
  for (const e of EXAMPLES_INDEX) await artwork.put(`EXAMPLE:${e.id}`, bytes);
  for (const p of PHOTOS_INDEX) await artwork.put(`PHOTO:${p.id}`, bytes);
}

function req(key?: string): Request {
  return new Request("https://tap.giving/mcp", {
    method: "POST",
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
}

// A fetch stub: business doors record their calls; Stripe INVOKED
function stubFetch(calls: Array<{ url: string; body?: string }>) {
  return async (input: unknown, init?: { method?: string; body?: string }): Promise<Response> => {
    const url = String((input as { url?: string })?.url ?? input);
    calls.push({ url, body: init?.body });
    if (url.includes("/api/lead")) return new Response(JSON.stringify({ queued: true }), { status: 200 });
    if (url.includes("/api/invoice-request")) return new Response(JSON.stringify({ ok: true, totalUsd: "900.00" }), { status: 200 });
    if (url.includes("/api/mcp-invoke")) {
      const parsed = JSON.parse(init?.body || "{}");
      if (parsed.op === "recordArtworkSubmission") return new Response(JSON.stringify({ ok: true, recordKey: "STEPCAP:1:x" }), { status: 200 });
      if (parsed.op === "notifyOrderPlaced") return new Response(JSON.stringify({ ok: true, messageId: "msg_stub_order_email" }), { status: 200 });
      if (parsed.op === "mintOrderInvoice") {
        const t = (parsed.input?.totals ?? {}) as Record<string, unknown>;
        const totalCents = t.discountEligible === true ? t.firstOrderTotalCents : t.grandTotalCents;
        return new Response(JSON.stringify({ ok: true, invoice: { id: "in_stub", number: "TEST-0001", status: "open", hostedInvoiceUrl: "https://invoice.stripe.com/i/stub", invoicePdf: "https://stripe.example/in_stub.pdf", totalCents, finalizedAt: "2026-11-09T12:00:00.000Z" } }), { status: 200 });
      }
      if (parsed.op === "sendOrderInvoiceProof") return new Response(JSON.stringify({ ok: true, messageId: "msg_stub_customer_email" }), { status: 200 });
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
  assert.ok(!JSON.stringify(p.structured).includes("30-day money-back guarantee"), "guarantee absent from phase-one product facts (CEO ruling 2026-11-09)");
  assert.ok(JSON.stringify(p.structured).includes("in seconds"), "dashboard changes-in-seconds claim present");
  assert.ok(!JSON.stringify(d.structured).includes("30-day money-back guarantee"), "guarantee absent from phase-one discovery (CEO ruling 2026-11-09)");
  assert.ok(!JSON.stringify(d.structured).includes("WELCOME10"), "discount code absent from discovery (pricing rule 2026-11-08)");
  assert.ok(!("pricing" in d.structured), "discovery carries no pricing block in the design phase");
  const a = await runTool(env, req(), "get_artwork_spec", { shape: "round" }, fetchFn);
  assert.equal((a.structured.examples as unknown[]).length, EXAMPLES_INDEX.filter((e) => e.shape === "round").length);
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
  assert.ok(Array.isArray(r.structured.benefits) && (r.structured.benefits as string[]).length === 3);
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
  const r = await runTool(env, req(), "start_order_intent", { email: "mcp-acceptance@mcptest.org", organizationName: "MCP Acceptance Test Organization", quantityHint: 250 }, stubFetch(calls) as typeof fetch);
  assert.equal(r.structured.captured, true);
  const lead = calls.find((c) => c.url.includes("/api/lead"));
  assert.ok(lead);
  const body = JSON.parse(lead!.body!);
  assert.equal(body.source, "mcp:intent");
  assert.equal(body.quantity, "250", "the lead door's quantity field is a string (LeadCoreData)");
  assert.ok(!("hp" in body) && !("formStartedAt" in body), "no honeypot or timing fields are fabricated");
});

test("dedupe: a repeat start_order_intent with the same email returns the existing intent and creates no second lead", async () => {
  const { env } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchFn = stubFetch(calls) as typeof fetch;
  const first = await runTool(env, req(), "start_order_intent", { email: "owner@sunrise-coffee.org", organizationName: "TEST Sunrise Coffee" }, fetchFn);
  const second = await runTool(env, req(), "start_order_intent", { email: "Owner@Sunrise-Coffee.org", organizationName: "TEST Sunrise Coffee" }, fetchFn);
  assert.equal(second.structured.intentRef, first.structured.intentRef, "the repeat returns the existing intentRef");
  assert.equal(second.structured.existing, true);
  assert.match(second.text, /Already captured/);
  assert.match(second.text, /no second lead was created/);
  assert.equal(calls.filter((c) => c.url.includes("/api/lead")).length, 1, "the lead door was called exactly once");
  const other = await runTool(env, req(), "start_order_intent", { email: "other@sunrise-coffee.org" }, fetchFn);
  assert.notEqual(other.structured.intentRef, first.structured.intentRef, "a different email gets its own intent");
  assert.equal(calls.filter((c) => c.url.includes("/api/lead")).length, 2);
});

test("dedupe: a repeat call links a new artworkRef to the existing intent", async () => {
  const { env } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchFn = stubFetch(calls) as typeof fetch;
  const sha = await pngSha();
  const art = await runTool(env, req(), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: sha,
  }, fetchFn);
  const artworkRef = art.structured.artworkRef as string;
  const first = await runTool(env, req(), "start_order_intent", { email: "owner@sunrise-coffee.org" }, fetchFn);
  const second = await runTool(env, req(), "start_order_intent", { email: "owner@sunrise-coffee.org", artworkRef }, fetchFn);
  assert.equal(second.structured.intentRef, first.structured.intentRef);
  assert.equal(second.structured.existing, true);
  assert.equal(second.structured.artworkRef, artworkRef);
  assert.equal(second.structured.artworkLinked, true);
  assert.equal(calls.filter((c) => c.url.includes("/api/lead")).length, 1, "still exactly one lead");
});

test("test-lane journey: recap, create_order (idempotent, record plus order email plus invoice mint), status by statusRef", async () => {
  const { env } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchFn = stubFetch(calls) as typeof fetch;
  const sha = await pngSha();
  const art = await runTool(env, req(), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: sha,
  }, fetchFn);
  const artworkRef = art.structured.artworkRef as string;

  const recapArgs = {
    quantity: 250, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    artworkRef, contactEmail: "mcp-acceptance@mcptest.org", organizationName: "MCP Acceptance Test Church",
  };
  const recap = await runTool(env, req(), "get_recap", recapArgs, fetchFn);
  assert.equal((recap.structured.cost as { grandTotalCents: number }).grandTotalCents, 100000);
  assert.deepEqual(recap.structured.notes, [
    "Shipping usually takes two to three weeks from artwork approval.",
    "We email you a final proof before anything is printed.",
  ]);
  assert.ok(recap.text.includes("mcp-acceptance@mcptest.org"), "recap names the contact");
  assert.ok(recap.text.includes("production waits until the final proof is approved by email"), "sequence sentence present");
  assert.ok(recap.text.includes("WELCOME10"), "conditional discount named in recap text");
  const recapRef = recap.structured.recapRef as string;

  const orderArgs = {
    ...recapArgs, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef, exit: "pay_now", idempotencyKey: "acceptance-order-0001",
  };
  const order = await runTool(env, req(), "create_order", orderArgs, fetchFn);
  const orderRef = order.structured.orderRef as string;
  assert.ok(orderRef.startsWith("mcp:mcp-acceptance-test-church:"));
  // S5 follow-up (2026-11-12): the placement response carries the
  // status-reference recovery line at both create_order seats (the
  // structured note and the text line), not the retired claim that
  // the reference cannot be recovered.
  const orderNote = order.structured.statusRefNote as string;
  assert.ok(orderNote.includes("Your reference is in your invoice email"), "placement statusRefNote carries the recovery line");
  assert.ok(orderNote.includes("the team re-sends it"), "placement statusRefNote names the re-send");
  assert.ok(!orderNote.includes("cannot be recovered"), "no unrecoverable claim in the placement note");
  assert.ok(order.text.includes(`Status reference: ${order.structured.statusRef as string}`), "the text names the reference plainly");
  assert.ok(order.text.includes("the team re-sends it"), "the placement text carries the recovery line");
  assert.ok(!order.text.includes("cannot be recovered"), "no unrecoverable claim in the placement text");
  // The test lane got the INVREQ-shaped record (DEV_ORDERS write).
  const devOrders = (env.DEV_ORDERS as unknown as MemoryKV).store;
  assert.equal([...devOrders.keys()].filter((k) => k.startsWith("INVREQ:")).length, 1);

  // Retry with the same key and payload returns the original, no second write.
  const replay = await runTool(env, req(), "create_order", orderArgs, fetchFn);
  assert.equal(replay.structured.orderRef, orderRef);
  const replayNote = replay.structured.statusRefNote as string;
  assert.ok(replayNote.includes("the team re-sends it"), "replay statusRefNote carries the recovery line");
  assert.ok(!replayNote.includes("cannot be recovered"), "no unrecoverable claim in the replay note");
  assert.equal([...devOrders.keys()].filter((k) => k.startsWith("INVREQ:")).length, 1);

  // Same key, different payload: conflict naming the field.
  await assert.rejects(
    () => runTool(env, req(), "create_order", { ...orderArgs, quantity: 300 }, fetchFn),
    /differing fields are: quantity/);

  // The settled confirmation text, verbatim, with the contact email.
  assert.equal(order.structured.confirmation, "Your order is placed, and your invoice and design proof are on their way to mcp-acceptance@mcptest.org. A person from Tap.Giving follows up from there; production waits for your proof approval, and the invoice is paid on its hosted page.");
  const emailState = order.structured.orderEmail as { sent: boolean; messageRef?: string };
  assert.equal(emailState.sent, true, "the order email is confirmed sent");
  assert.equal(emailState.messageRef, "msg_stub_order_email");
  const notifyCalls = calls.filter((c) => (c.body ?? "").includes('"op":"notifyOrderPlaced"'));
  assert.equal(notifyCalls.length, 1, "exactly one order email for the placement");
  const notifyBody = JSON.parse(notifyCalls[0].body ?? "{}") as { input: Record<string, unknown> };
  assert.equal(notifyBody.input.organizationName, "MCP Acceptance Test Church");
  assert.equal(notifyBody.input.contactEmail, "mcp-acceptance@mcptest.org");
  assert.equal(notifyBody.input.quantity, 250);
  assert.equal(notifyBody.input.testMode, true);
  assert.equal(calls.filter((c) => (c.body ?? "").includes('"op":"notifyOrderPlaced"')).length, 1, "replay does not re-send a sent email");

  // The final-step chain: the invoice minted through the seat, and
  // the customer email suppressed by the test lane.
  const mintCalls = calls.filter((c) => (c.body ?? "").includes('"op":"mintOrderInvoice"'));
  assert.equal(mintCalls.length, 1, "exactly one mint for the placement");
  const mintBody = JSON.parse(mintCalls[0].body ?? "{}") as { input: Record<string, unknown> };
  assert.equal(mintBody.input.testLane, true);
  const invoice = order.structured.invoice as { id: string; totalCents: number } | null;
  assert.ok(invoice, "the invoice is recorded on the order result");
  assert.equal(invoice!.id, "in_stub");
  const custEmail = order.structured.customerEmail as { sent: boolean; suppressed?: string };
  assert.equal(custEmail.sent, false);
  assert.ok((custEmail.suppressed ?? "").includes("test lane"), "test lane suppresses the customer email");
  assert.equal(calls.filter((c) => (c.body ?? "").includes('"op":"sendOrderInvoiceProof"')).length, 0, "no customer email seat call in the test lane");

  // Status by capability: the statusRef from placement reads the
  // order; only its hash is stored; a fabricated reference and a
  // garbage Authorization header both answer not_found identically.
  const statusRef = order.structured.statusRef as string;
  assert.ok(statusRef && statusRef.length >= 40, "the status reference is minted at placement");
  const stored = [...(env.MCP_KEYS as unknown as MemoryKV).store.keys()].filter((k) => k.startsWith("STATUS:"));
  assert.equal(stored.length, 1);
  assert.ok(!stored[0].includes(statusRef), "the stored index key is the hash, never the plaintext");
  const status = await runTool(env, req(), "get_order_status", { statusRef }, fetchFn);
  assert.equal(status.structured.stage, "received"); // seat says no CRM row yet
  assert.equal((status.structured.invoice as { invoiceId: string }).invoiceId, "in_stub");
  await assert.rejects(
    () => runTool(env, req(), "get_order_status", { statusRef: "fabricated-reference-value" }, fetchFn),
    (e: Error & { code?: string }) => e.code === "not_found");
  await assert.rejects(
    () => runTool(env, req("tg_test_whatever_garbage"), "get_order_status", { statusRef: "fabricated-reference-value" }, fetchFn),
    (e: Error & { code?: string }) => e.code === "not_found");
});

test("create_order refuses below minimum, bad size is manual_exception, no recap is refused", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const base = {
    contactName: "T", contactEmail: "mcp-acceptance@mcptest.org", contactPhone: "+17135550199",
    quantity: 250, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    recapRef: "recap_missing", idempotencyKey: "acceptance-order-0002",
  };
  await assert.rejects(() => runTool(env, req(), "create_order", { ...base, quantity: 50 }, fetchFn), /minimum order is 100/);
  await assert.rejects(() => runTool(env, req(), "create_order", { ...base, size: "150mm-round" }, fetchFn),
    (e: Error & { code?: string }) => e.code === "manual_exception");
  await assert.rejects(() => runTool(env, req(), "create_order", base, fetchFn), /not a recap/);
});

test("register_webhook no longer exists as a tool (retired from v1)", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  assert.equal(TOOLS.some((t) => t.name === "register_webhook"), false, "the tool is not registered");
  assert.equal(TOOLS.length, 11, "the v1 surface is eleven tools (get_examples added, SPEC mcp-examples-spec)");
  await assert.rejects(
    () => runTool(env, req(), "register_webhook", { callbackUrl: "https://example.com/hook", events: ["proof_ready"] }, fetchFn),
    (e: Error & { code?: string }) => e.code === "not_found");
});

test("no keys anywhere: every tool runs keyless, and a garbage Authorization header is ignored identically", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  await assert.rejects(() => runTool(env, req(), "get_order_status", {}, fetchFn), /statusRef/);
  await assert.rejects(
    () => runTool(env, req("tg_live_garbage_value"), "get_order_status", { statusRef: "nope" }, fetchFn),
    (e: Error & { code?: string }) => e.code === "not_found");
  const d = await runTool(env, req("Bearer nonsense"), "get_discovery", {}, fetchFn);
  assert.ok(d.structured.server, "discovery answers identically with a garbage header");
});

// ─── request_invoice: retired by P-16 (2026-11-08) ─────────────────
// Placement never mints an invoice: create_order records the order
// and emails it to the team, and a person follows up with the actual
// invoice. The tool, and the Stripe mint path behind it, are gone.

test("request_invoice no longer exists as a tool", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  assert.equal(TOOLS.some((t) => t.name === "request_invoice"), false, "the tool is not registered");
  await assert.rejects(
    () => runTool(env, req(), "request_invoice", { orderRef: "mcp:x:y", idempotencyKey: "gone-0001" }, fetchFn),
    (e: unknown) => {
      assert.equal((e as { code?: string }).code, "not_found");
      return true;
    },
  );
});

test("get_artwork_spec: full delivered set in the structured index, bounded inline images, numbered pick list", async () => {
  const { env, artwork } = await makeEnv();
  await seedExamples(artwork);
  const fetchFn = stubFetch([]) as typeof fetch;
  for (const shape of ["round", "square"] as const) {
    const r = await runTool(env, req(), "get_artwork_spec", { shape }, fetchFn);
    const expected = EXAMPLES_INDEX.filter((e) => e.shape === shape);
    assert.ok(expected.length >= 2, "each shape carries several delivered examples");
    // The structured index carries the full set for the shape, in
    // index order, each with its display URL.
    const exs = r.structured.examples as Array<{ id: string; organization: string; shape: string; displayUrl: string; description: string; size: string }>;
    assert.deepEqual(exs.map((e) => e.id), expected.map((e) => e.id));
    for (const [i, e] of exs.entries()) {
      assert.equal(e.organization, expected[i].organization);
      assert.equal(e.shape, shape);
      assert.ok(e.displayUrl.endsWith(`/mcp/examples/${e.id}.png`), "displayUrl intact");
      assert.equal(e.description, expected[i].description, "curated description rides with the entry");
      assert.equal(e.size, expected[i].size, "curated size rides with the entry");
    }
    // Inline images are bounded: the first 6 examples for the shape,
    // then the two mounting photos.
    assert.equal(typeof r.text, "string");
    assert.equal(r.image, undefined);
    assert.ok(r.images);
    const inlineCount = Math.min(6, expected.length);
    assert.equal(r.images.length, inlineCount + 2);
    for (const img of r.images.slice(0, inlineCount)) {
      assert.equal(img.mimeType, "image/png");
      assert.equal(Buffer.from(img.data, "base64").subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "real PNG magic");
    }
    // Pick list: per-shape numbering from 1 in index order (the
    // cold-run fix, 2026-11-09), one printed number per example in
    // the FULL set, with the curated description and size in the
    // brief's format; each structured entry's pick field carries
    // the same number its printed line shows.
    let lastIdx = -1;
    for (const [pi, e] of expected.entries()) {
      const n = pi + 1;
      assert.equal((exs[pi] as unknown as { pick: number }).pick, n, "structured pick field equals the printed number");
      const line = `${n}. ${e.description}, ${e.shape}, ${e.size}: the design delivered to ${e.organization}, at https://tap.giving/mcp/examples/${e.id}.png.`;
      const idx = r.text.indexOf(line);
      assert.ok(idx > lastIdx, `pick list entry ${n} present and in order`);
      lastIdx = idx;
    }
    // Honest framing: real delivered designs, full count stated, an
    // example is never shipped to a different organization as-is.
    assert.ok(r.text.includes(`${expected.length} real ${shape} designs`), "states the full-set count");
    assert.ok(r.text.includes("never shipped to a different organization as-is"), "no example is presented as shippable to another organization");
    assert.ok(r.text.includes("submit_artwork"), "names the submission path");
    assert.ok(!/house/i.test(r.text), "no house-template framing");
    const explainer = r.structured.explainerPhotos as Array<{ category: string }>;
    assert.ok(explainer.length > 0 && explainer.every((p) => ["mounting explainer", "church setting", "in-use tap moment"].includes(p.category)), "explainer set rides with the spec");
  }
});

test("example display routes: KV bytes served, HEAD mirrors GET, retired house ids 404", async () => {
  const { env, artwork } = await makeEnv();
  await seedExamples(artwork);
  for (const ex of [EXAMPLES_INDEX[0], EXAMPLES_INDEX[1]]) {
    const url = `https://tap.giving/mcp/examples/${ex.id}.png`;
    const get = await worker.fetch(new Request(url), env);
    assert.equal(get.status, 200);
    const getBytes = Buffer.from(await get.arrayBuffer());
    assert.ok(getBytes.equals(Buffer.from(PNG_B64, "base64")), "GET serves the KV bytes");
    const head = await worker.fetch(new Request(url, { method: "HEAD" }), env);
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("Content-Type"), "image/png");
    assert.equal(head.headers.get("Content-Length"), String(getBytes.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0, "HEAD has no body");
  }
  for (const old of ["ex-navy-round", "ex-forest-round", "ex-slate-round", "ex-cream-square", "ex-burgundy-square", "ex-sand-square"]) {
    const res = await worker.fetch(new Request(`https://tap.giving/mcp/examples/${old}.png`), env);
    assert.equal(res.status, 404, `retired ${old} 404s`);
    const resSvg = await worker.fetch(new Request(`https://tap.giving/mcp/examples/${old}.svg`), env);
    assert.equal(resSvg.status, 404, `retired ${old} svg 404s`);
  }
  const photo = await worker.fetch(new Request("https://tap.giving/mcp/photos/cafe-table-disc.webp"), env);
  assert.equal(photo.status, 200, "KV-backed photo served");
  assert.equal(photo.headers.get("Content-Type"), "image/webp");
  const barred = await worker.fetch(new Request("https://tap.giving/mcp/photos/pews3.webp"), env);
  assert.equal(barred.status, 404, "pews3 is not served");
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
  assert.ok(text.includes("No account, key, or login at any point"), "no-credentials note present");
  assert.ok(text.includes("This server moves no money itself: when an order is placed, Tap.Giving emails the invoice and the design proof, and a person pays the hosted invoice."), "settled protected string present");
  assert.ok(!/tg_live_|tg_test_|API key/i.test(text), "no key framing anywhere in the GET text");
});

test("get_discovery: sectioned first presentation, design first, no pricing anywhere", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const d = await runTool(env, req(), "get_discovery", {}, fetchFn);
  // Headed sections, in order. The design path ("How it works")
  // walks before the Why section (flow rule, Ryan 2026-11-08), and
  // phase one carries NO pricing section at all (2026-11-09 spec):
  // pricing first appears at get_order_questions.
  let lastIdx = -1;
  for (const h of ["What it is", "How it works: the design path first", "Why Tap.Giving", "Gates"]) {
    const idx = d.text.indexOf(`\n${h}\n`);
    assert.ok(idx > lastIdx, `section heading present and in order: ${h}`);
    lastIdx = idx;
  }
  assert.ok(!d.text.includes("Pricing"), "no Pricing section in discovery text");
  assert.ok(!("pricing" in d.structured), "no structured pricing on discovery");
  assert.ok(!d.text.includes(PRICE_RANGE_LINE) && !d.text.includes(NO_FEES_LINE), "neither pricing line appears in phase one");
  assert.ok(!/\$\d/.test(d.text), "no dollar figure anywhere in discovery text");
  assert.ok(!/minimum/i.test(d.text), "minimum not named anywhere in discovery text");
  // All phase-one benefits appear as bullets in the Why section.
  const whyIdx = d.text.indexOf("Why Tap.Giving");
  for (const b of BENEFITS) {
    const bi = d.text.indexOf(`- ${b}`);
    assert.ok(bi > whyIdx, `benefit bullet present in the Why section: ${b}`);
  }
  assert.deepEqual(d.structured.capabilities && (d.structured.capabilities as { benefits: string[] }).benefits, BENEFITS, "structured benefits unchanged");
  assert.ok(!d.text.includes("30-day money-back guarantee"), "no guarantee claim in phase-one discovery text (CEO ruling 2026-11-09)");
  assert.equal(TAX_NOTE, "Tax, where it applies, is calculated on the invoice.");
  assert.ok(d.text.includes(TAX_NOTE), "tax sentence present in discovery text");
  assert.ok(!/checkout/i.test(d.text), "no checkout claim in discovery text");
  // The settled protected string stands verbatim in the Gates section.
  assert.ok(d.text.includes("This server moves no money itself: when an order is placed, Tap.Giving emails the invoice and the design proof, and a person pays the hosted invoice."), "settled protected string verbatim");
  // How it works walks the design path first, ordering last and
  // framed as optional (flow rule, Ryan 2026-11-08).
  assert.ok(d.text.includes("Get the artwork spec and the design directions for that shape from get_artwork_spec."));
  assert.ok(d.text.includes("Submit the finished file with submit_artwork and see it on the disc as a proof."));
  const proofIdx = d.text.indexOf("see it on the disc as a proof");
  const orderIdx = d.text.indexOf("Optional, only if you want the discs made");
  assert.ok(orderIdx > proofIdx, "ordering step presented after the proof step, framed optional");
  assert.ok(d.text.includes("Email me my invoice and design proof"), "the final step carries its settled label");
});

// ─── first-user round 1 fixes ─────────────────────────────────────

test("no TEST MODE banner exists anywhere: writes and reads carry no test banner", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const d = await runTool(env, req(), "get_discovery", {}, fetchFn);
  assert.ok(!d.text.startsWith("TEST MODE"), "reads are unprefixed");
  assert.ok(!JSON.stringify(d.structured).includes("TEST MODE"), "no banner in structured content");
});

test("F3 + F1: discovery classifies reads honestly and carries the product photos", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const d = await runTool(env, req(), "get_discovery", {}, fetchFn);
  const caps = d.structured.capabilities as { readTools: string[]; writeTools: string[] };
  // The no-keys classification (2026-11-09): every tool runs with no
  // credential; the split itself is asserted in
  // test/discovery-key-honesty.test.ts.
  assert.deepEqual(caps.readTools, ["get_discovery", "get_quote", "get_product", "get_artwork_spec", "get_examples", "get_order_questions", "get_recap", "get_order_status"]);
  assert.deepEqual(caps.writeTools, ["submit_artwork", "start_order_intent", "create_order"]);
  assert.ok(!("keyedReadTools" in caps) && !("howToGetAKey" in caps), "no keyed classification survives");
  assert.ok(d.images && d.images.length === 1, "discovery returns the product photo inline");
  assert.ok(d.text.includes("no account, key, or login"));
  assert.ok(!/ask Ryan/.test(d.text), "no first-name key ask in discovery text");
  const p = await runTool(env, req(), "get_product", {}, fetchFn);
  assert.ok(p.images && p.images.length === 1, "product returns the product photo inline");
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

test("F12: chosenExampleRef resolves by pick-list number and by any set id, confirms by organization, refuses unknown", async () => {
  const { env, artwork } = await makeEnv();
  await seedExamples(artwork);
  const fetchFn = stubFetch([]) as typeof fetch;
  const round = EXAMPLES_INDEX.filter((e) => e.shape === "round");
  const byNum = await runTool(env, req(), "get_artwork_spec", { shape: "round", chosenExampleRef: "2" }, fetchFn);
  assert.ok(byNum.text.includes(`You picked the design delivered to ${round[1].organization}`), "pick confirmed by organization");
  assert.equal((byNum.structured.chosenExample as { id: string }).id, round[1].id);
  assert.equal(byNum.images!.length, 3, "the chosen design plus the two mounting photos");
  const lastRound = round[round.length - 1];
  const byId = await runTool(env, req(), "get_artwork_spec", { shape: "round", chosenExampleRef: lastRound.id }, fetchFn);
  assert.equal((byId.structured.chosenExample as { id: string }).id, lastRound.id, "any id in the full set resolves, not just the inline subset");
  await assert.rejects(() => runTool(env, req(), "get_artwork_spec", { shape: "round", chosenExampleRef: "not-a-real-example" }, fetchFn),
    /not one of the delivered examples/);
  await assert.rejects(() => runTool(env, req(), "get_artwork_spec", { shape: "round", chosenExampleRef: "ex-navy-round" }, fetchFn),
    /not one of the delivered examples/, "retired house ids are refused");
  const spec = await runTool(env, req(), "get_artwork_spec", { shape: "round" }, fetchFn);
  assert.ok(JSON.stringify(spec.structured).includes("disc-template-round.svg"), "template linked from the spec");
  assert.ok(JSON.stringify(spec.structured).includes("43.25"), "screw-hole positions stated in the spec");
  assert.ok(spec.text.includes("Screw holes"), "screw holes named in the spec text");
});

test("F12b: every printed pick number resolves to the example its line names (exhaustive sweep, CEO guard 2026-11-09)", async () => {
  const { env, artwork } = await makeEnv();
  await seedExamples(artwork);
  const ff = stubFetch([]) as typeof fetch;
  for (const shape of ["round", "square"] as const) {
    const set = EXAMPLES_INDEX.filter((e) => e.shape === shape);
    const list = await runTool(env, req(), "get_artwork_spec", { shape }, ff);
    for (const [i, e] of set.entries()) {
      const n = i + 1;
      const line = `${n}. ${e.description}, ${e.shape}, ${e.size}: the design delivered to ${e.organization}, at https://tap.giving/mcp/examples/${e.id}.png.`;
      assert.ok(list.text.includes(line), `${shape} pick ${n}: the printed line names ${e.id}`);
      const picked = await runTool(env, req(), "get_artwork_spec", { shape, chosenExampleRef: String(n) }, ff);
      assert.equal((picked.structured.chosenExample as { id: string }).id, e.id, `${shape} pick ${n} resolves to the example its line names`);
      assert.ok(picked.text.includes(`You picked the design delivered to ${e.organization}`), `${shape} pick ${n} confirms by organization`);
    }
    // Out-of-range numbers refuse, naming the valid range.
    await assert.rejects(() => runTool(env, req(), "get_artwork_spec", { shape, chosenExampleRef: String(set.length + 1) }, ff),
      new RegExp(`1 to ${set.length}`), `${shape}: an out-of-range number refuses naming the valid range`);
    await assert.rejects(() => runTool(env, req(), "get_artwork_spec", { shape, chosenExampleRef: "0" }, ff),
      /not one of the delivered examples/, `${shape}: zero refuses`);
  }
});

test("F12c: picks by description words resolve; ambiguous fragments refuse naming candidates", async () => {
  const { env, artwork } = await makeEnv();
  await seedExamples(artwork);
  const ff = stubFetch([]) as typeof fetch;
  const round = EXAMPLES_INDEX.filter((e) => e.shape === "round");
  const centerPoint = round.find((e) => e.id === "center-point-church")!;
  // The full printed description resolves (the cold run's failing probe).
  const byDesc = await runTool(env, req(), "get_artwork_spec", { shape: "round", chosenExampleRef: centerPoint.description }, ff);
  assert.equal((byDesc.structured.chosenExample as { id: string }).id, centerPoint.id, "full printed description resolves");
  // A distinctive fragment resolves.
  const byFrag = await runTool(env, req(), "get_artwork_spec", { shape: "round", chosenExampleRef: "Bright red round" }, ff);
  assert.equal((byFrag.structured.chosenExample as { id: string }).id, centerPoint.id, "distinctive fragment resolves");
  // An ambiguous fragment refuses and names the candidates.
  await assert.rejects(() => runTool(env, req(), "get_artwork_spec", { shape: "round", chosenExampleRef: "Navy round" }, ff),
    /matches more than one delivered example/, "an ambiguous fragment refuses naming candidates");
  // A non-matching string still refuses as before.
  await assert.rejects(() => runTool(env, req(), "get_artwork_spec", { shape: "round", chosenExampleRef: "polka dot unicorn" }, ff),
    /not one of the delivered examples/, "a non-matching string refuses");
  // submit_artwork accepts a description pick too (its seat resolves
  // through the same resolver).
  const sha = await pngSha();
  const sub = await runTool(env, req(), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: sha,
    shape: "round", chosenExampleRef: "Bright red round",
  }, ff);
  assert.equal((sub.structured.chosenExample as { id: string }).id, centerPoint.id, "submit_artwork resolves a description pick");
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
    const sub = await runTool(env, req(), "submit_artwork", {
      file: { filename: "cedar.svg", mediaType: "image/svg+xml", contentBase64: svgB64 }, sha256: sha, shape: "round",
    }, fetchFn);
    assert.equal((sub.structured.preview as { kind: string }).kind, "on-disc");
    assert.ok(sub.images && sub.images.length === 1, "one disc render for the chosen shape");
    const recap = await runTool(env, req(), "get_recap", {
      quantity: 150, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
      artworkRef: sub.structured.artworkRef as string, contactEmail: "mcp-acceptance@mcptest.org",
      linkDestination: "https://give.example.com/cedar",
    }, fetchFn);
    assert.ok(recap.image, "recap embeds the on-disc render");
    assert.equal(recap.image!.mimeType, "image/png");
    assert.ok(recap.text.includes("Tap destination: https://give.example.com/cedar"), "recap shows the link destination entered");
  } finally {
    setRasterizerForTests(null);
  }
});

test("order questions carry every field in the settled order, with the pricing block", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const q = await runTool(env, req(), "get_order_questions", {}, fetchFn);
  // Ryan's settled collection order (2026-11-09; artwork answer
  // added by the novice spec, 2026-11-12): contactEmail,
  // organizationName, shipTo (contactPhone inside the ship-to
  // block), quantity, size, antiMetalCount, mounting,
  // artworkSource, linkDestination as the confirmation entry,
  // contactName.
  const fields = (q.structured.questions as Array<{ field: string }>).map((x) => x.field);
  assert.deepEqual(fields, ["contactEmail", "organizationName", "shipTo", "quantity", "size", "antiMetalCount", "mounting", "artworkSource", "linkDestination", "contactName"]);
  const shipQ = (q.structured.questions as Array<{ field: string; question?: string; prompt?: string; note?: string }>).find((x) => x.field === "shipTo");
  assert.ok(shipQ && /phone/i.test(`${shipQ.question ?? ""} ${shipQ.prompt ?? ""} ${shipQ.note ?? ""}`), "the ship-to block collects the phone");
  const destQ = (q.structured.questions as Array<{ field: string; question?: string; confirmation?: boolean }>).find((x) => x.field === "linkDestination");
  assert.ok(destQ && destQ.confirmation === true && /confirm/i.test(destQ.question ?? ""), "the destination is asked as a confirmation");
  assert.ok(q.text.includes("never left going nowhere"), "blank destination default is stated");
  // Pricing lives here and only here in the opening flow.
  const pricing = q.structured.pricing as { range: string; noFees: string };
  assert.equal(pricing.range, PRICE_RANGE_LINE);
  assert.equal(pricing.noFees, NO_FEES_LINE);
  assert.ok(q.text.includes(PRICE_RANGE_LINE) && q.text.includes(NO_FEES_LINE), "both pricing lines in the questions text");
});

test("F14: an intent returns intentRef, links artwork, and carries no key language anywhere", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const sha = await pngSha();
  const art = await runTool(env, req(), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: sha,
  }, fetchFn);
  const intent = await runTool(env, req(), "start_order_intent", {
    email: "mcp-acceptance@mcptest.org", organizationName: "MCP Acceptance Test Organization", artworkRef: art.structured.artworkRef as string,
  }, fetchFn);
  assert.ok(String(intent.structured.intentRef).startsWith("intent_"));
  assert.equal(intent.structured.artworkLinked, true);
  assert.ok(!/ask Ryan|get a key|API key|needs an organization/.test(intent.text), "no key language in the intent text");
  assert.ok(/within one business day/.test(intent.text), "follow-up expectation stated");
  assert.ok(intent.text.includes("this contact capture is real"), "test-lane capture honesty in the intent text");
  const other = await runTool(env, req(), "start_order_intent", { email: "new@mcptest.org" }, fetchFn);
  assert.ok(!/ask Ryan/.test(other.text));
});

test("F20: order status by statusRef returns the dashboard address and the minted invoice", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const sha = await pngSha();
  const art = await runTool(env, req(), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: sha,
  }, fetchFn);
  const recapArgs = {
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    artworkRef: art.structured.artworkRef as string, contactEmail: "mcp-acceptance@mcptest.org",
    organizationName: "MCP Acceptance Test Church",
  };
  const recap = await runTool(env, req(), "get_recap", recapArgs, fetchFn);
  const order = await runTool(env, req(), "create_order", {
    ...recapArgs, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap.structured.recapRef as string, exit: "pay_now", idempotencyKey: "f20-status-order-0001",
  }, fetchFn);
  assert.ok(!order.text.includes("TEST MODE"), "no banner in the order text");
  assert.ok(!order.text.includes("adoption pass"), "no machinery voice in the order text");
  const statusRef = order.structured.statusRef as string;
  const status = await runTool(env, req(), "get_order_status", { statusRef }, fetchFn);
  const dash = status.structured.dashboard as { tapAddress: string; loginUrl: string; username: string };
  assert.equal(dash.tapAddress, "https://go.tap.giving/mcp-acceptance-test-church");
  assert.equal(dash.loginUrl, "https://go.tap.giving/dashboard/login");
  // The final step minted the invoice through the seat: status
  // carries it (the P-16 no-invoice posture is retired).
  const inv = status.structured.invoice as { invoiceId: string; invoiceNumber: string } | null;
  assert.ok(inv && inv.invoiceId === "in_stub" && inv.invoiceNumber === "TEST-0001", "the minted invoice rides the status read");
  assert.ok(status.text.includes("Invoice TEST-0001"), "the invoice line in status text");
});

test("F12 routes: the template SVG and the product photos are served", async () => {
  const { env } = await makeEnv();
  const tpl = await worker.fetch(new Request("https://tap.giving/mcp/templates/disc-template-round.svg"), env);
  assert.equal(tpl.status, 200);
  const tplText = await tpl.text();
  assert.ok(tplText.includes('id="screw-hole-guides"'), "template carries the hole guides");
  assert.ok(tplText.includes('id="cut-guide"') && tplText.includes('id="safe-guide"') && tplText.includes('id="bleed-guide"'));
  const photo = await worker.fetch(new Request("https://tap.giving/mcp/photos/phone-tap.webp"), env);
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
  assert.ok(d.text.includes("For 150 discs: the binding total comes from get_quote at that exact count"), "text points at get_quote for the total, no total quoted in discovery");
  assert.ok(!d.text.includes("$750.00") && !d.text.includes("$675.00"), "no worked totals in discovery text");
  const guidance = (d.structured as { guidance?: string }).guidance ?? "";
  assert.ok(guidance.startsWith("About 150 discs: start with the shape choice"), "guidance leads with the design path");
  assert.ok(guidance.includes("call get_quote with 150 for the binding total"), "guidance names the quote step for the total");
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

test("R2 F15/F19: order questions carry the mounting photos inline and plain closing; no banner anywhere", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const q = await runTool(env, req(), "get_order_questions", {}, fetchFn);
  assert.ok(q.images && q.images.length === 2, "both mounting photos inline");
  assert.ok(!q.text.includes("idempotencyKey"), "no agent plumbing in the closing line");
  assert.ok(q.text.includes("keep the recap reference it returns"), "plain closing line");
  assert.ok(!q.text.startsWith("TEST MODE:"), "no banner on the questions");
  const recap = await runTool(env, req(), "get_recap", {
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO, contactEmail: "mcp-acceptance@mcptest.org",
  }, fetchFn);
  assert.ok(!recap.text.startsWith("TEST MODE:"), "no banner on the recap either: the banner is retired");
  assert.ok(recap.text.includes("emails the invoice and the design proof to the contact;"), "the settled final-step proof line in recap text");
  assert.ok(!recap.text.includes("before any order is placed"), "old proof line gone");
});

test("R2 F17: the recap echoes a contact name and phone when given", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const recap = await runTool(env, req(), "get_recap", {
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    contactEmail: "mcp-acceptance@mcptest.org", contactName: "Dana Whitfield", contactPhone: "+19315550142",
  }, fetchFn);
  const customer = recap.structured.customer as { contactName?: string; contactPhone?: string };
  assert.equal(customer.contactName, "Dana Whitfield");
  assert.equal(customer.contactPhone, "+19315550142");
  assert.ok(recap.text.includes("Contact: Dana Whitfield, mcp-acceptance@mcptest.org, phone +19315550142."), "contact line carries name and phone");
});

test("R2 F21: the spec warns about the hole areas; a screws recap draws the holes on the preview", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const spec = await runTool(env, req(), "get_artwork_spec", { shape: "round" }, fetchFn);
  assert.ok(spec.text.includes("keep the two 6 mm (about 0.24 inch) hole areas clear"), "guideline in spec text");
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
    const sub = await runTool(env, req(), "submit_artwork", {
      file: { filename: "plain.svg", mediaType: "image/svg+xml", contentBase64: Buffer.from(svg).toString("base64") }, sha256: sha, shape: "round",
    }, fetchFn);
    captured = "";
    const recap = await runTool(env, req(), "get_recap", {
      quantity: 100, size: "100mm-round", mounting: "screws", shipTo: SHIP_TO,
      artworkRef: sub.structured.artworkRef as string, contactEmail: "mcp-acceptance@mcptest.org",
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
    const sub = await runTool(env, req(), "submit_artwork", {
      file: { filename: "cedar.svg", mediaType: "image/svg+xml", contentBase64: Buffer.from(svg).toString("base64") }, sha256: sha, shape: "round",
    }, fetchFn);
    assert.ok(sub.text.includes("live text"), "the font caveat is stated");
    assert.ok(sub.text.includes("Georgia"), "the family is named");
    assert.ok(sub.text.includes("Convert text to outlines"), "the exact-match path is given");
  } finally {
    setRasterizerForTests(null);
  }
});

test("R2 isolation: a test-lane intent says the capture is real; a test order says it stays out of the CRM", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const intent = await runTool(env, req(), "start_order_intent", {
    email: "pastor.dana@mcptest.org", organizationName: "Cedar Hollow Community Organization", quantityHint: 150,
  }, fetchFn);
  assert.ok(intent.text.includes("this contact capture is real"), "capture honesty in intent text");
  assert.ok(intent.text.includes("stay out of the production CRM"), "the isolation is named");
  const live = await runTool(env, req(), "start_order_intent", {
    email: "pastor.dana@cedarhollowchurch.org", organizationName: "Cedar Hollow Community Organization", quantityHint: 150,
  }, fetchFn);
  assert.ok(!live.text.includes("test-lane"), "a live-lane intent carries no test framing");
});

test("R2 F22: a second order is discount-ineligible once the first carries an invoice; status exposure is tightened", async () => {
  const { env } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const fresh = stubFetch(calls) as typeof fetch;
  const shipArgs = { size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO, contactEmail: "mcp-acceptance@mcptest.org" };

  const recap1 = await runTool(env, req(), "get_recap", { ...shipArgs, quantity: 150 }, fresh);
  const order1 = await runTool(env, req(), "create_order", {
    ...shipArgs, quantity: 150, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap1.structured.recapRef as string, exit: "pay_now", idempotencyKey: "r2-order-0001",
  }, fresh);
  const orderRef1 = order1.structured.orderRef as string;
  const devRecs = () => [...(env.DEV_ORDERS as unknown as MemoryKV).store.values()].map((v) => JSON.parse(v) as { mcpOrderRef: string; discountEligible: boolean });
  assert.equal(devRecs().find((r) => r.mcpOrderRef === orderRef1)?.discountEligible, true, "the first order is discount-eligible");
  // The final step minted an invoice onto order 1's record through
  // the seat; carrying one is what spends the eligibility.
  assert.ok(order1.structured.invoice, "order 1 carries its minted invoice");

  const recap2 = await runTool(env, req(), "get_recap", { ...shipArgs, quantity: 200 }, fresh);
  const order2 = await runTool(env, req(), "create_order", {
    ...shipArgs, quantity: 200, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap2.structured.recapRef as string, exit: "pay_now", idempotencyKey: "r2-order-0002",
  }, fresh);
  const orderRef2 = order2.structured.orderRef as string;
  assert.equal(devRecs().find((r) => r.mcpOrderRef === orderRef2)?.discountEligible, false, "the second order is NOT discount-eligible once the first carries an invoice");
  assert.ok(String(order2.structured.crmExpectation).includes("does NOT enter the production CRM"), "test order states its isolation");

  // Status is the capability read: the order's own invoice named
  // plainly, and the tightened exposure set (no CRM row, no ship-to
  // phone, no internal ids) holds.
  const status2 = await runTool(env, req(), "get_order_status", { statusRef: order2.structured.statusRef as string }, fresh);
  assert.ok(!status2.text.startsWith("TEST MODE:"), "no banner on status");
  assert.ok(status2.text.includes("Invoice TEST-0001"), "status names the order's invoice");
  assert.ok(!("crm" in status2.structured), "no CRM row in the status read");
  assert.ok(!JSON.stringify(status2.structured).includes("+17135550199"), "no ship-to phone in the status read");
});


test("status never surfaces cross-order invoice comparisons (the shared-invoice naming is retired)", async () => {
  const { env, keys } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const fresh = stubFetch(calls) as typeof fetch;
  const shipArgs = { size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO, contactEmail: "mcp-acceptance@mcptest.org" };
  const recap = await runTool(env, req(), "get_recap", { ...shipArgs, quantity: 150 }, fresh);
  const order = await runTool(env, req(), "create_order", {
    ...shipArgs, quantity: 150, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap.structured.recapRef as string, exit: "pay_now", idempotencyKey: "r2c-order-0001",
  }, fresh);
  const orderRef = order.structured.orderRef as string;
  // Even if a record somehow carried the retired comparison fields,
  // the capability read does not surface them: the seat refuses
  // shared invoices now, and the exposure set is tightened.
  const raw = keys.store.get(`ORDER:${orderRef}`);
  assert.ok(raw);
  const rec = JSON.parse(raw as string) as Record<string, unknown>;
  rec.invoice = {
    invoiceId: "in_prior", invoiceNumber: "PRIOR-0001", status: "open",
    hostedInvoiceUrl: "https://invoice.stripe.com/i/prior", totalCents: 67500,
    existing: true, existingOrderRef: "mcp:other:order", existingDifferingFields: ["quantity"],
  };
  keys.store.set(`ORDER:${orderRef}`, JSON.stringify(rec));
  const status = await runTool(env, req(), "get_order_status", { statusRef: order.structured.statusRef as string }, fresh);
  assert.ok(!status.text.includes("was already open from order"), "no shared-invoice naming in status");
  assert.ok(!status.text.includes("differs from this order"), "no differing-fields line in status");
  assert.ok(!JSON.stringify(status.structured).includes("existingDifferingFields"), "no comparison fields in structured status");
});

// ─── Pre-registry pass (2026-11-08): items 1, 3, 4, 5, 6, 8, 9 ─────

test("item 5: start_order_intent refuses reserved and undeliverable domains before any capture", async () => {
  const { env } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchFn = stubFetch(calls) as typeof fetch;
  const bad = [
    "maya@test-sunrise-coffee.example",
    "someone@church.test",
    "someone@church.invalid",
    "someone@intranet.local",
    "someone@example.com",
    "someone@example.org",
    "someone@nodot",
  ];
  for (const email of bad) {
    await assert.rejects(
      () => runTool(env, req(), "start_order_intent", { email }, fetchFn),
      (e: Error & { code?: string }) => e.code === "invalid_input" && /real email address|complete domain/.test(e.message),
      email,
    );
  }
  assert.equal(calls.length, 0, "no capture call was made for any refused address");
});

test("item 5: start_order_intent still accepts real addresses", async () => {
  const { env } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const r = await runTool(env, req(), "start_order_intent", { email: "pastor@firstbaptist.org" }, stubFetch(calls) as typeof fetch);
  assert.equal(r.structured.captured, true);
  assert.equal(calls.length, 1);
});

test("item 6: get_quote states one payable first-order total, the add-on rule, the window meaning, and turnaround", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const q = await runTool(env, req(), "get_quote", { quantity: 100, antiMetalCount: 20 }, fetchFn);
  assert.equal(q.structured.firstOrderTotalCents, 47000);
  assert.match(q.structured.firstOrderTotalNote as string, /one payable total is \$470\.00/);
  const d = q.structured.discount as Record<string, unknown>;
  assert.match(String(d.appliesToAddOns), /discs only/);
  assert.match(String(d.windowMeaning), /within 7 days of this quote/);
  assert.match(String(d.windowMeaning), /fresh quote/);
  assert.equal(q.structured.turnaround, "Production and delivery run 2 to 3 weeks from artwork approval.");
  assert.match(q.text, /total to pay is \$470\.00/);
  assert.match(q.text, /discount covers the discs only/);
  assert.match(q.text, /2 to 3 weeks from artwork approval/);
});

test("items 1, 4, 8, settled 2026-11-09: discovery states there are no keys, the destination model, and the turnaround", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const d = await runTool(env, req(), "get_discovery", {}, fetchFn);
  const caps = d.structured.capabilities as Record<string, unknown>;
  assert.ok(!("howToGetAKey" in caps) && !("keyWait" in caps), "no key-obtainment copy in capabilities");
  assert.ok(!("testKey" in d.structured), "no testKey block in discovery");
  assert.match(d.text, /no account, key, or login/i);
  assert.match(String(d.structured.destination), /per disc/);
  assert.match(String(d.structured.destination), /review profile/);
  assert.equal(d.structured.turnaround, "Production and delivery run 2 to 3 weeks from artwork approval.");
  assert.match(d.text, /2 to 3 weeks from artwork approval/);
  assert.match(d.text, /per disc/);
  assert.ok(!/tg_live_|tg_test_/.test(d.text + JSON.stringify(d.structured)), "no key formats anywhere in discovery");
});

test("items 4, 7b, 9: get_product topic answers mirror the all-topics structure; stands are team-routed and unpriced in cold text", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const topic = await runTool(env, req(), "get_product", { topic: "discs" }, fetchFn);
  assert.equal((topic.structured as { topic?: string }).topic, "discs");
  const block = topic.structured.discs as Record<string, unknown>;
  assert.ok(block && typeof block === "object", "the topic block sits under its topic name");
  assert.match(String(block.destination), /per disc/);
  assert.equal((topic.structured.photos as unknown[]).length, PHOTOS_INDEX.length);
  assert.match(String(topic.structured.destination), /per disc/);
  assert.equal(topic.images?.length, 1);
  const shipping = await runTool(env, req(), "get_product", { topic: "shipping" }, fetchFn);
  assert.ok((shipping.structured.shipping as Record<string, unknown>).terms);
  const all = await runTool(env, req(), "get_product", {}, fetchFn);
  assert.doesNotMatch(all.text, /at \$7|at \$9|at \$5/);
  assert.match(all.text, /come from the Tap.Giving team/);
  const stands = all.structured.stands as Record<string, unknown>;
  assert.match(String(stands.ordering), /email hello@tap.giving/);
});

test("visual standard: get_quote carries the product photo; the mounting topic carries the mounting photos", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const q = await runTool(env, req(), "get_quote", { quantity: 250 }, fetchFn);
  assert.ok(q.images && q.images.length === 1, "quote returns the product photo inline");
  assert.equal((q.structured.photos as Array<{ id: string }>)[0].id, "phone-tap");
  assert.match(q.text, /The photo with this answer shows the disc in use/);
  const m = await runTool(env, req(), "get_product", { topic: "mounting" }, fetchFn);
  assert.equal(m.images?.length, 3, "mounting topic: the product photo plus both mounting photos inline");
  assert.equal((m.structured.mountingPhotos as Array<{ id: string }>).map((x) => x.id).join(","), "mount-adhesive,mount-screws");
  const discTopic = await runTool(env, req(), "get_product", { topic: "discs" }, fetchFn);
  assert.equal(discTopic.images?.length, 1, "other topics keep the product photo only");
});

test("items 1, 2, settled 2026-11-09: submit_artwork nextStep runs the placement path after the capture; no artwork-stage proof email is promised", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const sha = await pngSha();
  const r = await runTool(env, req(), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: sha,
  }, fetchFn);
  const ns = String(r.structured.nextStep);
  assert.match(ns, /start_order_intent/);
  assert.match(ns, /get_recap/);
  assert.match(ns, /Email me my invoice and design proof/);
  assert.ok(!/key/i.test(ns), "no key language in the next step");
  assert.match(r.text, /Nothing is emailed at this stage/);
  assert.doesNotMatch(r.text, /proof we email|emailed proof shows|final proof comes by email/);
  assert.equal((r.structured.preview as { kind: string }).kind, "on-disc");
  assert.match(ns, /the preview image with this answer/);
});

test("items 1, 2: with a working render, submit_artwork nextStep does direct the agent to the preview image", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const fakePng = Buffer.from(PNG_B64, "base64");
  setRasterizerForTests(async () => new Uint8Array(fakePng));
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 106 106"><rect width="106" height="106" fill="#1e4634"/></svg>`;
    const sha = await sha256HexBytes(new Uint8Array(Buffer.from(svg)));
    const r = await runTool(env, req(), "submit_artwork", {
      file: { filename: "plain.svg", mediaType: "image/svg+xml", contentBase64: Buffer.from(svg).toString("base64") }, sha256: sha, shape: "round",
    }, fetchFn);
    assert.equal((r.structured.preview as { kind: string }).kind, "on-disc");
    assert.match(String(r.structured.nextStep), /the preview image with this answer/);
  } finally {
    setRasterizerForTests(null);
  }
});

test("item 3, settled: status errors name no key formats; missing and fabricated references are indistinguishable", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  await assert.rejects(
    () => runTool(env, req(), "get_order_status", {}, fetchFn),
    (e: Error) => !/tg_test_|tg_live_|API key/.test(e.message),
  );
  await assert.rejects(
    () => runTool(env, req("bogus"), "get_order_status", { statusRef: "tg_test_fabricated_reference_value" }, fetchFn),
    (e: Error & { code?: string }) => e.code === "not_found",
  );
});

test("item 8: artwork spec geometry carries inches alongside mm", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as typeof fetch;
  const a = await runTool(env, req(), "get_artwork_spec", { shape: "round" }, fetchFn);
  assert.equal(a.structured.canvasInches, 4.17);
  assert.equal((a.structured.screwHoles as Record<string, unknown>).diameterInches, 0.24);
  assert.match(a.text, /4\.2 inch/);
  assert.match(a.text, /0\.24 inch/);
});

test("item 9, settled: register_webhook is absent from tools/list and no tool description mentions a key", async () => {
  assert.equal(TOOLS.find((t) => t.name === "register_webhook"), undefined);
  for (const t of TOOLS) assert.ok(!/API key/i.test(t.description), `${t.name} description carries no key framing`);
});

test("final-step chain: a failed mint still records the test-lane suppression on the order", async () => {
  const { env, keys } = await makeEnv();
  const base = stubFetch([]);
  const fetchFn = (async (input: unknown, init?: { body?: string }) => {
    const url = String(input);
    if (url.includes("/api/mcp-invoke") && (init?.body ?? "").includes('"op":"mintOrderInvoice"')) {
      return new Response(JSON.stringify({ ok: false, error: "stripe key not configured for the test lane" }), { status: 502 });
    }
    return (base as unknown as (i: unknown, n?: unknown) => Promise<Response>)(input, init);
  }) as typeof fetch;
  const flowArgs = {
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    contactEmail: "mintfail@mcptest.org", organizationName: "Mintfail Test Church",
  };
  const recap = await runTool(env, req(), "get_recap", flowArgs, fetchFn);
  const order = await runTool(env, req(), "create_order", {
    ...flowArgs, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap.structured.recapRef as string, exit: "pay_now", idempotencyKey: "mintfail-order-0001",
  }, fetchFn);
  assert.equal(order.structured.invoice, null, "no invoice when the mint fails");
  assert.ok((order.structured.partialStates as string[]).some((p) => p.startsWith("invoice_pending")), "the partial state names the pending invoice");
  // The E2E contradiction, pinned (2026-11-09): the confirmation
  // must not claim the invoice and proof are on their way in the
  // same response that states the invoice was not minted. The
  // pending confirmation names the incomplete step and what
  // happens next, in the structured field, the text, and the
  // closing next-step line alike.
  assert.equal(order.structured.confirmation, confirmationTextInvoicePending("mintfail@mcptest.org"), "the pending confirmation states the incomplete step plainly");
  assert.ok(!(order.structured.confirmation as string).includes("are on their way"), "the pending confirmation makes no on-their-way claim");
  assert.ok(order.text.includes(confirmationTextInvoicePending("mintfail@mcptest.org")), "the response text carries the pending confirmation");
  assert.ok(!order.text.includes("on their way to the contact email"), "no line of the response claims delivery is on its way");
  assert.ok((order.structured.nextStep as string).includes("re-attempts only the mint"), "the next step names the retry, not a delivery");
  // The same order at the other exit: the pending wording does not
  // borrow the pay-now framing either.
  const recap2 = await runTool(env, req(), "get_recap", flowArgs, fetchFn);
  const order2 = await runTool(env, req(), "create_order", {
    ...flowArgs, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap2.structured.recapRef as string, exit: "lock_in", idempotencyKey: "mintfail-order-0002",
  }, fetchFn);
  assert.equal(order2.structured.confirmation, confirmationTextInvoicePending("mintfail@mcptest.org"), "the lock-in exit carries the same pending confirmation");
  assert.ok(!(order2.structured.nextStep as string).includes("on their way"), "the lock-in next step makes no delivery claim");
  const stored = JSON.parse(keys.store.get(`ORDER:${order.structured.orderRef as string}`) ?? "{}") as { invoiceAttempt?: { error: string }; customerEmail?: { suppressed?: string } };
  assert.equal(stored.invoiceAttempt?.error, "stripe key not configured for the test lane", "the seat error is recorded on the order");
  assert.ok(stored.customerEmail?.suppressed, "the test-lane suppression is recorded on the order even though the mint failed");
});

// ─── invoice_held recognition (the seat's typed hold) ───────────────
// The mint seat answers a hold as ok:false with invoice_held and a
// hold block (a foreign live invoice, or this order's own invoice
// content diverged). tap-mcp records it as a first-class review
// state, not a mint failure, notifies the team through the seat, and
// never attempts the customer email; a replay re-attempts only a
// failed notification.

function heldFetch(calls: Array<{ url: string; body?: string }>, opts?: { notifyFailures?: number }) {
  const base = stubFetch(calls);
  let notifyAttempts = 0;
  return (async (input: unknown, init?: { body?: string }) => {
    const url = String((input as { url?: string })?.url ?? input);
    const body = init?.body ?? "";
    calls.push({ url, body });
    if (url.includes("/api/mcp-invoke") && (JSON.parse(body || "{}").op === "mintOrderInvoice")) {
      return new Response(JSON.stringify({
        ok: false, invoice_held: true,
        hold: {
          reason: "content_divergence",
          differingFields: ["destinationLine", "totalCents"],
          existingInvoiceId: "in_held", existingStatus: "open",
          existingOrderRef: null, existingTotalCents: 99999,
        },
      }), { status: 200 });
    }
    if (url.includes("/api/mcp-invoke") && (JSON.parse(body || "{}").op === "notifyInvoiceHeld")) {
      notifyAttempts += 1;
      if ((opts?.notifyFailures ?? 0) >= notifyAttempts) {
        return new Response(JSON.stringify({ ok: false, error: "held notify seat down" }), { status: 502 });
      }
      return new Response(JSON.stringify({ ok: true, messageId: "msg_stub_held" }), { status: 200 });
    }
    return (base as unknown as (i: unknown, n?: unknown) => Promise<Response>)(input, init);
  }) as typeof fetch;
}

async function heldOrderArgs(env: Env, fetchFn: typeof fetch, email: string, idem: string) {
  const flowArgs = {
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    contactEmail: email, organizationName: "Held Invoice Test Church",
  };
  const recap = await runTool(env, req(), "get_recap", flowArgs, fetchFn);
  return {
    ...flowArgs, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap.structured.recapRef as string, exit: "pay_now" as const, idempotencyKey: idem,
  };
}

test("invoice_held: the seat hold is a first-class state, the team is notified, and no customer email is attempted", async () => {
  const { env, keys } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchFn = heldFetch(calls);
  const orderArgs = await heldOrderArgs(env, fetchFn, "held@mcptest.org", "held-order-0001");
  const order = await runTool(env, req(), "create_order", orderArgs, fetchFn);
  assert.equal(order.structured.invoice, null, "no invoice on a hold");
  assert.equal(order.structured.invoiceAttempt, undefined, "no invoice field carries the hold");
  const heldOut = order.structured.invoiceHeld as { reason: string; differingFields?: string[]; notified: boolean };
  assert.equal(heldOut.reason, "content_divergence");
  assert.deepEqual(heldOut.differingFields, ["destinationLine", "totalCents"]);
  assert.equal(heldOut.notified, true);
  const states = order.structured.partialStates as string[];
  assert.ok(states.some((p) => p.startsWith("invoice_held:")), "the response states the hold");
  assert.ok(!states.some((p) => p.startsWith("invoice_pending")), "the hold is never stated as a pending mint");
  assert.ok(order.text.includes("held for review"), "the response text states the hold in plain words");
  // The held confirmation is conditional too (2026-11-09): it
  // states the hold and makes no on-their-way claim, in the
  // structured field, the text, and the next-step line.
  assert.equal(order.structured.confirmation, confirmationTextInvoiceHeld("held@mcptest.org"), "the held confirmation states the hold plainly");
  assert.ok(!(order.structured.confirmation as string).includes("are on their way"), "the held confirmation makes no on-their-way claim");
  assert.ok(!order.text.includes("on their way to the contact email"), "no line of the held response claims delivery is on its way");
  assert.ok((order.structured.nextStep as string).includes("resolves the invoice hold first"), "the held next step names the resolution, not a delivery");
  const stored = JSON.parse(keys.store.get(`ORDER:${order.structured.orderRef as string}`) ?? "{}") as {
    invoiceAttempt?: unknown;
    invoiceHeld?: { reason: string; differingFields?: string[]; existingInvoiceId?: string; existingOrderRef?: string | null; existingTotalCents?: number; notify?: { sent: boolean; messageRef?: string } };
    customerEmail?: { sent: boolean; suppressed?: string };
  };
  assert.equal(stored.invoiceAttempt, undefined, "the hold is not recorded as a mint attempt error");
  assert.equal(stored.invoiceHeld?.reason, "content_divergence");
  assert.deepEqual(stored.invoiceHeld?.differingFields, ["destinationLine", "totalCents"]);
  assert.equal(stored.invoiceHeld?.existingInvoiceId, "in_held");
  assert.equal(stored.invoiceHeld?.existingOrderRef, null);
  assert.equal(stored.invoiceHeld?.existingTotalCents, 99999);
  assert.equal(stored.invoiceHeld?.notify?.sent, true);
  assert.equal(stored.invoiceHeld?.notify?.messageRef, "msg_stub_held");
  // The test identity records only the lane's standing suppression
  // outcome; no send is attempted on a hold in either lane.
  assert.equal(stored.customerEmail?.sent, false, "no customer email is sent on a hold");
  assert.ok(stored.customerEmail?.suppressed, "the only customer-email outcome in the test lane is its standing suppression record");
  assert.equal(calls.filter((c) => (c.body ?? "").includes('"op":"notifyInvoiceHeld"')).length, 1, "exactly one held notification");
  assert.equal(calls.filter((c) => (c.body ?? "").includes('"op":"sendOrderInvoiceProof"')).length, 0, "no customer email seat call on a hold");
  const status = await runTool(env, req(), "get_order_status", { statusRef: order.structured.statusRef as string }, fetchFn);
  const statusHeld = status.structured.invoiceHeld as { reason: string } | undefined;
  assert.equal(statusHeld?.reason, "content_divergence", "status surfaces the held state for the order's own reference");
  assert.ok(status.text.includes("held for review"), "status text states the hold");
});

test("invoice_held: a replay never re-mints and re-attempts only a failed notification", async () => {
  const { env, keys } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  // The notification leg fails on its first two attempts: the
  // create_order chain itself retries a failed notification once
  // inside the same call (the order-email step does the same), so the
  // failure state surfaces only after both attempts are spent.
  const fetchFn = heldFetch(calls, { notifyFailures: 2 });
  const orderArgs = await heldOrderArgs(env, fetchFn, "heldreplay@mcptest.org", "held-order-0002");
  const order = await runTool(env, req(), "create_order", orderArgs, fetchFn);
  const states = order.structured.partialStates as string[];
  assert.ok(states.some((p) => p.startsWith("invoice_held:")), "the response states the hold");
  assert.ok(states.some((p) => p.startsWith("invoice_held_notify_failed:")), "the failed notification is its own partial state");
  // A failed team notification does not change the confirmation:
  // the held wording already states that nothing has been emailed,
  // so the notify failure adds its partial state and nothing else.
  assert.equal(order.structured.confirmation, confirmationTextInvoiceHeld("heldreplay@mcptest.org"), "the notify-failed response keeps the held confirmation");
  assert.ok(!(order.structured.confirmation as string).includes("are on their way"), "the notify-failed confirmation makes no on-their-way claim");
  const storedAfterFirst = JSON.parse(keys.store.get(`ORDER:${order.structured.orderRef as string}`) ?? "{}") as {
    invoiceHeld?: { notify?: { sent: boolean; error?: string } };
  };
  assert.equal(storedAfterFirst.invoiceHeld?.notify?.sent, false);
  assert.equal(storedAfterFirst.invoiceHeld?.notify?.error, "held notify seat down");
  const replay = await runTool(env, req(), "create_order", orderArgs, fetchFn);
  assert.equal(replay.structured.orderRef, order.structured.orderRef);
  assert.equal(calls.filter((c) => (c.body ?? "").includes('"op":"mintOrderInvoice"')).length, 1, "the replay never re-mints");
  assert.equal(calls.filter((c) => (c.body ?? "").includes('"op":"notifyInvoiceHeld"')).length, 3, "the replay re-attempts the failed notification (two spent attempts, then the replay's)");
  const replayHeld = replay.structured.invoiceHeld as { notified: boolean };
  assert.equal(replayHeld.notified, true);
  const stored = JSON.parse(keys.store.get(`ORDER:${order.structured.orderRef as string}`) ?? "{}") as {
    invoiceHeld?: { notify?: { sent: boolean } };
  };
  assert.equal(stored.invoiceHeld?.notify?.sent, true);
  const replay2 = await runTool(env, req(), "create_order", orderArgs, fetchFn);
  assert.equal(replay2.structured.orderRef, order.structured.orderRef);
  assert.equal(calls.filter((c) => (c.body ?? "").includes('"op":"notifyInvoiceHeld"')).length, 3, "a sent notification is never duplicated");
  assert.equal(calls.filter((c) => (c.body ?? "").includes('"op":"sendOrderInvoiceProof"')).length, 0, "still no customer email after replays");
});

// ─── conditional placement confirmations (2026-11-09) ──────────────
// The settled confirmation sentence is CEO-approved verbatim for
// the success path only. Each partial state carries its own
// plain-words confirmation; the two live-lane states below complete
// the set the test lane cannot reach (proof_pending needs a minted
// invoice with no artwork; customer_email_failed needs a failed
// customer-email seat call behind a minted invoice).

test("proof_pending: a minted no-artwork order confirms the pending proof email, never a delivery", async () => {
  const { env, keys } = await makeEnv();
  const calls: Array<{ url: string; body?: string }> = [];
  const fetchFn = stubFetch(calls) as typeof fetch;
  const flowArgs = {
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    contactEmail: "pastor@proofpending.example.org", organizationName: "Proof Pending Church",
  };
  const recap = await runTool(env, req(), "get_recap", flowArgs, fetchFn);
  const order = await runTool(env, req(), "create_order", {
    ...flowArgs, contactName: "Real Pastor", contactPhone: "+17135550199",
    recapRef: recap.structured.recapRef as string, exit: "pay_now", idempotencyKey: "proofpending-order-0001",
  }, fetchFn);
  assert.ok(order.structured.invoice, "the invoice mints on a no-artwork order");
  assert.ok((order.structured.partialStates as string[]).some((p) => p.startsWith("proof_pending")), "the partial state names the pending proof email");
  assert.equal(order.structured.confirmation, confirmationTextProofPending("pastor@proofpending.example.org"), "the proof-pending confirmation states the pending email plainly");
  assert.ok(!(order.structured.confirmation as string).includes("are on their way"), "the proof-pending confirmation makes no on-their-way claim");
  assert.ok(!order.text.includes("on their way to the contact email"), "no line of the response claims delivery is on its way");
  assert.ok((order.structured.nextStep as string).includes("once the design proof is published"), "the next step names the publish trigger");
  assert.equal(calls.filter((c) => (c.body ?? "").includes('"op":"sendOrderInvoiceProof"')).length, 0, "no customer email seat call while the proof is pending");
  const stored = JSON.parse(keys.store.get(`ORDER:${order.structured.orderRef as string}`) ?? "{}") as { customerEmail?: { sent: boolean; proofPending?: boolean } };
  assert.equal(stored.customerEmail?.proofPending, true, "the pending state is recorded on the order");
});

test("customer_email_failed: a failed customer email behind a minted invoice confirms the failure, never a delivery", async () => {
  const { env, keys } = await makeEnv();
  const base = stubFetch([]);
  const fetchFn = (async (input: unknown, init?: { body?: string }) => {
    const url = String(input);
    if (url.includes("/api/mcp-invoke") && (init?.body ?? "").includes('"op":"sendOrderInvoiceProof"')) {
      return new Response(JSON.stringify({ ok: false, error: "customer email seat down" }), { status: 502 });
    }
    return (base as unknown as (i: unknown, n?: unknown) => Promise<Response>)(input, init);
  }) as typeof fetch;
  const sha = await pngSha();
  const art = await runTool(env, req(), "submit_artwork", {
    file: { filename: "disc.png", mediaType: "image/png", contentBase64: PNG_B64 }, sha256: sha,
  }, fetchFn);
  const flowArgs = {
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    artworkRef: art.structured.artworkRef as string,
    contactEmail: "pastor@emailfail.example.org", organizationName: "Email Fail Church",
  };
  const recap = await runTool(env, req(), "get_recap", flowArgs, fetchFn);
  const order = await runTool(env, req(), "create_order", {
    ...flowArgs, contactName: "Real Pastor", contactPhone: "+17135550199",
    recapRef: recap.structured.recapRef as string, exit: "pay_now", idempotencyKey: "emailfail-order-0001",
  }, fetchFn);
  assert.ok(order.structured.invoice, "the invoice stands behind the failed email");
  assert.ok((order.structured.partialStates as string[]).some((p) => p.startsWith("customer_email_failed")), "the partial state names the failed email");
  assert.equal(order.structured.confirmation, confirmationTextCustomerEmailFailed("pastor@emailfail.example.org"), "the failed-email confirmation states the failure plainly");
  assert.ok(!(order.structured.confirmation as string).includes("are on their way"), "the failed-email confirmation makes no on-their-way claim");
  assert.ok(!order.text.includes("on their way to the contact email"), "no line of the response claims delivery is on its way");
  const stored = JSON.parse(keys.store.get(`ORDER:${order.structured.orderRef as string}`) ?? "{}") as { customerEmail?: { sent: boolean; error?: string } };
  assert.equal(stored.customerEmail?.error, "customer email seat down", "the seat error is recorded on the order");
});

test("the settled success confirmation stays byte-identical, and only the success path carries it", async () => {
  // The verbatim pin, stated once here against the facts module so
  // every journey test above and below inherits the same contract:
  // the settled sentence is the CEO-approved text, unchanged.
  assert.equal(
    confirmationText("someone@example.org"),
    "Your order is placed, and your invoice and design proof are on their way to someone@example.org. A person from Tap.Giving follows up from there; production waits for your proof approval, and the invoice is paid on its hosted page.",
  );
  for (const variant of [confirmationTextInvoicePending, confirmationTextInvoiceHeld, confirmationTextProofPending, confirmationTextCustomerEmailFailed]) {
    assert.ok(!variant("someone@example.org").includes("are on their way to someone@example.org"), "no partial-state confirmation borrows the settled claim");
  }
});
