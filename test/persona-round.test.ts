// Persona Loop Round 1 (2026-11-08): the Cold-User Test chat's
// findings P-1 to P-16, pinned per item. Copies and behaviors here
// are the ones the loop re-tests live; keep them exact.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../src/tools.ts";
import { sha256Hex } from "../src/util.ts";
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
  async list(opts?: { prefix?: string }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean }> {
    const names = [...this.store.keys()].filter((k) => !opts?.prefix || k.startsWith(opts.prefix));
    return { keys: names.map((name) => ({ name })), list_complete: true };
  }
}

const SHIP_TO = { name: "Persona Test Church", street: "1 Test Way", city: "Spring", state: "TX", postalCode: "77380", country: "US", phone: "+17135550199" };

interface Captured { url: string; body?: string }

function dispatchFetch(calls: Captured[], opts?: { failOrderEmail?: boolean }): typeof fetch {
  return (async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input);
    calls.push({ url, body: init?.body });
    if (url.includes("/api/mcp-invoke")) {
      const parsed = JSON.parse(init?.body ?? "{}") as { op: string; input?: Record<string, unknown> };
      if (parsed.op === "recordArtworkSubmission") return new Response(JSON.stringify({ ok: true, recordKey: "STEPCAP:1:x" }), { status: 200 });
      if (parsed.op === "readOrderRecords") return new Response(JSON.stringify({ ok: true, found: false }), { status: 200 });
      if (parsed.op === "mintOrderInvoice") {
        const totals = parsed.input?.totals as { grandTotalCents: number; firstOrderTotalCents: number; discountEligible: boolean } | undefined;
        const totalCents = totals ? (totals.discountEligible ? totals.firstOrderTotalCents : totals.grandTotalCents) : 0;
        return new Response(JSON.stringify({ ok: true, invoice: { id: "in_persona", number: "PERSONA-0001", status: "open", hostedInvoiceUrl: "https://invoice.stripe.com/i/persona", invoicePdf: "https://pay.stripe.com/invoice/pdf/persona", totalCents, finalizedAt: "2026-11-09T00:00:00.000Z" } }), { status: 200 });
      }
      if (parsed.op === "sendOrderInvoiceProof") return new Response(JSON.stringify({ ok: true, messageId: "msg_persona_customer" }), { status: 200 });
      if (parsed.op === "notifyOrderPlaced") {
        if (opts?.failOrderEmail) return new Response(JSON.stringify({ ok: false, error: "stub seat failure" }), { status: 500 });
        return new Response(JSON.stringify({ ok: true, messageId: "msg_persona_1" }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 400 });
    }
    if (url.includes("/api/invoice-request")) return new Response(JSON.stringify({ ok: true, invoiceRequestId: "invreq_stub" }), { status: 200 });
    if (url.includes("/api/lead")) return new Response(JSON.stringify({ ok: true, leadId: "lead_stub" }), { status: 200 });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

async function makeEnv(): Promise<{ env: Env; keys: MemoryKV; dev: MemoryKV }> {
  const keys = new MemoryKV();
  const dev = new MemoryKV();
  const env = {
    MCP_KEYS: keys as unknown as KVNamespace,
    MCP_ARTWORK: new MemoryKV() as unknown as KVNamespace,
    ORDERS: new MemoryKV() as unknown as KVNamespace,
    DEV_ORDERS: dev as unknown as KVNamespace,
    STRIPE_API_KEY_TEST: "sk_test_stub",
    MCP_INVOKE_SECRET: "stub-invoke-secret",
  } as unknown as Env;
  return { env, keys, dev };
}

function req(key?: string): Request {
  return new Request("https://tap.giving/mcp", { method: "POST", headers: key ? { Authorization: `Bearer ${key}` } : {} });
}

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SVG_BYTES = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2120" height="2120"><rect width="2120" height="2120" fill="#123456"/></svg>'));

async function submitSvg(env: Env, fetchFn: typeof fetch, key?: string): Promise<string> {
  const sub = await runTool(env, req(key), "submit_artwork", {
    file: { filename: "disc.svg", mediaType: "image/svg+xml", contentBase64: Buffer.from(SVG_BYTES).toString("base64") },
    sha256: await sha256HexBytes(SVG_BYTES), shape: "round",
  }, fetchFn);
  return sub.structured.artworkRef as string;
}

function imageCount(r: { image?: unknown; images?: unknown[] }): number {
  return (r.image ? 1 : 0) + (r.images?.length ?? 0);
}

// ─── P-1 / P-3 / P-11: discovery facts ─────────────────────────────

test("P-1/P-11: discovery carries the samples fact and the plain-language block", async () => {
  const { env } = await makeEnv();
  const d = await runTool(env, req(), "get_discovery", {}, dispatchFetch([]));
  const s = d.structured as unknown as { samples: string; plainLanguage: { nfc: string; status: string }; taxExempt: string };
  assert.ok(s.samples.includes("we do not offer physical samples"), "structured samples fact");
  assert.ok(!s.samples.includes("30-day money-back guarantee"), "samples fact carries no guarantee in phase one (CEO ruling 2026-11-09)");
  assert.ok(d.text.includes("Samples: we do not offer physical samples"), "samples fact in the discovery text");
  assert.ok(s.plainLanguage.nfc.includes("No app is needed"), "plain NFC line");
  assert.ok(s.plainLanguage.status.includes("status reference"), "plain status-reference line (the keys entry retired with the keys)");
  assert.ok(!("keys" in s.plainLanguage), "no plain-language keys entry remains");
  assert.ok(s.taxExempt.includes("recorded on the order"), "tax-exempt fact (P-3)");
});

// ─── P-4: the guidance question map ────────────────────────────────

test("P-4: guidance answers the recognizable questions in the intent", async () => {
  const { env } = await makeEnv();
  const fetchFn = dispatchFetch([]);
  const cases: Array<[string, string]> = [
    ["Can we get samples first?", "Samples: we do not offer physical samples"],
    ["We are tax-exempt, does that change anything?", "Tax-exempt: say so when you order"],
    ["Our tables are metal, will these work?", "Metal surfaces: discs that go on metal need the anti-metal shielding layer"],
    ["Do visitors need an app to use these?", "No app is needed: a visitor taps a phone"],
    ["Can we change the link destination later?", "You can change where a disc points anytime in the Redirect Dashboard"],
    ["How do we reorder more later?", "Reordering: your design stays on file"],
    ["We don't have a logo, can you design it for us?", "Design help: send a logo if you have one"],
    ["How do we pay for these?", "Payment: this server takes no payment"],
  ];
  for (const [intent, needle] of cases) {
    const d = await runTool(env, req(), "get_discovery", { intent }, fetchFn);
    assert.ok((d.structured.guidance as string).includes(needle), `guidance answers: ${intent}`);
  }
});

test("P-2b/P-9: guidance deadline verdicts and the under-minimum line", async () => {
  const { env } = await makeEnv();
  const fetchFn = dispatchFetch([]);
  const fmt = (days: number) => {
    const dt = new Date(Date.now() + days * 86400000);
    return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  };
  const soon = await runTool(env, req(), "get_discovery", { intent: `Our gala is on ${fmt(10)} and we need discs by then` }, fetchFn);
  assert.ok((soon.structured.guidance as string).includes("On your date: it cannot be met."), "inside 14 days cannot be met");
  const tight = await runTool(env, req(), "get_discovery", { intent: `Our event is on ${fmt(17)}, can we have discs?` }, fetchFn);
  assert.ok((tight.structured.guidance as string).includes("On your date: it is at risk"), "14 to 20 days is at risk");
  const small = await runTool(env, req(), "get_discovery", { intent: "We need 45 discs for our cafe" }, fetchFn);
  assert.ok((small.structured.guidance as string).startsWith("One quantity note first: the smallest order is 100 discs"), "under-minimum leads the guidance (P-9)");
});

// ─── P-2a / P-5: quote framing and the metal warning ───────────────

test("P-2a/P-5: quote carries delivery framing, the eligibility line, and the metal warning", async () => {
  const { env } = await makeEnv();
  const fetchFn = dispatchFetch([]);
  const q = await runTool(env, req(), "get_quote", { quantity: 250 }, fetchFn);
  const s = q.structured as unknown as { deliveryFraming: string; metalWarning: string; discountEligibility: string };
  assert.ok(s.deliveryFraming.includes("2 to 3 weeks from artwork approval"), "delivery framing next to the totals (P-2a)");
  assert.ok(q.text.includes("Delivery: production and delivery run 2 to 3 weeks from artwork approval"), "framing in the quote text");
  assert.ok(s.metalWarning.includes("cannot be added afterwards"), "metal warning when the count is unset (P-5)");
  assert.ok(s.discountEligibility.includes("does not use it up"), "eligibility in plain words at the quote step");
  assert.ok(q.text.includes("does not use it up"), "eligibility in plain words in the quote TEXT channel too (round 2 residual: structured-only was invisible to text readers)");
  const zero = await runTool(env, req(), "get_quote", { quantity: 250, antiMetalCount: 0 }, fetchFn);
  assert.ok((zero.structured as unknown as { metalWarning?: string }).metalWarning, "metal warning when the count is zero");
  const counted = await runTool(env, req(), "get_quote", { quantity: 250, antiMetalCount: 40 }, fetchFn);
  assert.equal((counted.structured as unknown as { metalWarning?: string }).metalWarning, undefined, "no warning when shielding is already counted");
});

// ─── P-8 / P-10 / objections: product prose ────────────────────────

test("P-8/P-10: product topics return prose; mounting carries the surface guide and its photos", async () => {
  const { env } = await makeEnv();
  const fetchFn = dispatchFetch([]);
  const mounting = await runTool(env, req(), "get_product", { topic: "mounting" }, fetchFn);
  assert.ok(!mounting.text.trimStart().startsWith("{"), "mounting text is prose, not a JSON dump (P-10)");
  assert.ok(mounting.text.includes("smooth surfaces"), "adhesive surface contrast (P-8)");
  assert.ok(mounting.text.includes("Screws not included"), "screws-not-included surfaces in the mounting prose");
  assert.ok(imageCount(mounting) >= 3, "mounting topic carries the mounting photos plus the product photo (P-6)");
  const discs = await runTool(env, req(), "get_product", { topic: "discs" }, fetchFn);
  assert.ok(discs.text.includes("only when the design carries a printed code"), "QR-conditional stated in the discs topic");
  assert.ok(discs.text.includes("printed code"), "the printed-codes comparison is present");
  const samples = await runTool(env, req(), "get_product", { topic: "samples" }, fetchFn);
  assert.ok(samples.text.includes("we do not offer physical samples"), "samples topic prose (P-1)");
  const ordering = await runTool(env, req(), "get_product", { topic: "ordering" }, fetchFn);
  assert.ok(ordering.text.includes("Tax-exempt organizations: say so when you order"), "tax fact in the ordering topic (P-3)");
  const all = await runTool(env, req(), "get_product", {}, fetchFn);
  assert.ok(!all.text.includes('"antiMetal"'), "the all-topics text is prose end to end");
});

// ─── P-13: verify-against-example on spec and submit ───────────────

test("P-13: spec and submit carry the verify-against-example checklist", async () => {
  const { env } = await makeEnv();
  const fetchFn = dispatchFetch([]);
  const spec = await runTool(env, req(), "get_artwork_spec", { shape: "round" }, fetchFn);
  const specCheck = (spec.structured as unknown as { verifyAgainstExample: { checklist: string[] } }).verifyAgainstExample;
  assert.ok(specCheck.checklist.includes("flat solid background"), "checklist items on the spec");
  assert.ok(spec.text.includes("compare the rendered art with the direction you chose"), "checklist instruction in the spec text");
  assert.ok(spec.text.includes("build from the organization's name alone"), "name-only path named in the spec");
  const artworkRef = await submitSvg(env, fetchFn);
  const again = await runTool(env, req(), "submit_artwork", {
    file: { filename: "disc.svg", mediaType: "image/svg+xml", contentBase64: Buffer.from(SVG_BYTES).toString("base64") },
    sha256: await sha256HexBytes(SVG_BYTES), shape: "round",
  }, fetchFn);
  assert.ok(again.structured.verifyAgainstExample, "checklist on the submit response");
  assert.ok(again.text.includes("compare the rendered art with the direction you chose"), "checklist instruction in the submit text");
  assert.ok(artworkRef.startsWith("art_"), "artwork ref shape");
});

// ─── P-12: the print-file export ───────────────────────────────────

test("P-12: the export fetch returns the file as submitted and its PNG render, keyless", async () => {
  const { env } = await makeEnv();
  const fetchFn = dispatchFetch([]);
  const sub = await runTool(env, req(), "submit_artwork", {
    file: { filename: "disc.svg", mediaType: "image/svg+xml", contentBase64: Buffer.from(SVG_BYTES).toString("base64") },
    sha256: await sha256HexBytes(SVG_BYTES), shape: "round",
  }, fetchFn);
  const exp = (sub.structured as unknown as { export: { printFile: { url: string; label: string }; printRenderPng: { url: string } } }).export;
  assert.equal(exp.printFile.label, "PRINT FILE");
  assert.ok(!sub.text.includes("PRINT FILE:"), "S7 (2026-11-12): the print-file mechanics are not in the submit text; the structured export carries them");
  assert.ok(sub.text.includes("ON-DISC PREVIEW, a mock composite"), "preview labeled as the mock it is");

  const original = await worker.fetch(new Request(`https://tap.giving${new URL(exp.printFile.url).pathname}`), env);
  assert.equal(original.status, 200);
  const got = new Uint8Array(await original.arrayBuffer());
  assert.deepEqual([...got], [...SVG_BYTES], "the export returns the submitted bytes unchanged");

  const render = await worker.fetch(new Request(`https://tap.giving${new URL(exp.printRenderPng.url).pathname}`), env);
  assert.equal(render.status, 200);
  assert.equal(render.headers.get("content-type"), "image/png");
  const png = new Uint8Array(await render.arrayBuffer());
  assert.deepEqual([...png.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], "the render is a real PNG derived from the submitted file");

  const missing = await worker.fetch(new Request("https://tap.giving/mcp/artwork/art_missing.png"), env);
  assert.equal(missing.status, 404, "an unknown capability id 404s");
});

// ─── P-15/P-16: keyless placement end to end ───────────────────────

test("P-15/P-16: a keyless placement records the order and emails the whole order", async () => {
  const { env, keys } = await makeEnv();
  const calls: Captured[] = [];
  const fetchFn = dispatchFetch(calls);
  const artworkRef = await submitSvg(env, fetchFn);
  const intent = await runTool(env, req(), "start_order_intent", {
    organizationName: "Keyless Persona Church", email: "pastor@keylesstest.org", note: "persona round keyless placement",
  }, fetchFn);
  const intentRef = intent.structured.intentRef as string;
  const flow = {
    quantity: 150, size: "100mm-round", mounting: "adhesive", antiMetalCount: 0,
    linkDestination: "https://keylesstest.org/give", artworkRef,
    contactEmail: "pastor@keylesstest.org", shipTo: SHIP_TO,
  };
  const recap = await runTool(env, req(), "get_recap", flow, fetchFn);
  assert.ok(imageCount(recap) >= 1, "get_recap surfaces the order's artwork (visual standard)");
  const order = await runTool(env, req(), "create_order", {
    ...flow, contactName: "Pat Pastor", contactPhone: "+17135550199",
    recapRef: recap.structured.recapRef as string, intentRef, exit: "pay_now", idempotencyKey: "persona-keyless-0001",
  }, fetchFn);
  assert.equal(order.structured.confirmation, "Your order is placed, and your invoice and design proof are on their way to pastor@keylesstest.org. A person from Tap.Giving follows up from there; production waits for your proof approval, and the invoice is paid on its hosted page.");
  const customerEmail = order.structured.customerEmail as { sent: boolean; messageRef?: string };
  assert.equal(customerEmail.sent, true, "the customer email fired at placement (the order carries artwork)");
  assert.equal(customerEmail.messageRef, "msg_persona_customer");
  assert.ok(order.structured.statusRef, "the status reference is returned at placement");
  const emailState = order.structured.orderEmail as { sent: boolean; messageRef?: string };
  assert.equal(emailState.sent, true);
  assert.equal(emailState.messageRef, "msg_persona_1");
  assert.ok(imageCount(order) >= 1, "create_order carries the order's artwork image (visual standard)");

  // Effect 1: the INVREQ door write, the website's own record.
  const door = calls.find((c) => c.url.includes("/api/invoice-request"));
  assert.ok(door, "the invoice-request door was called");
  const doorBody = JSON.parse(door.body ?? "{}") as { source: string; lead: { email: string; quantity: number } };
  assert.equal(doorBody.source, "mcp");
  assert.equal(doorBody.lead.email, "pastor@keylesstest.org");
  assert.equal(doorBody.lead.quantity, 150);

  // Effect 2: the seat email carries the whole order (P-16 list).
  const notify = calls.filter((c) => (c.body ?? "").includes("notifyOrderPlaced"));
  assert.equal(notify.length, 1);
  const input = (JSON.parse(notify[0].body ?? "{}") as { input: Record<string, unknown> }).input;
  assert.equal(input.organizationName, "Keyless Persona Church");
  assert.equal(input.contactName, "Pat Pastor");
  assert.equal(input.contactEmail, "pastor@keylesstest.org");
  assert.equal(input.contactPhone, "+17135550199");
  assert.equal(input.quantity, 150);
  assert.equal(input.size, "100mm-round");
  assert.equal(input.mounting, "adhesive");
  assert.equal(input.linkDestination, "https://keylesstest.org/give");
  assert.equal(input.artworkRef, artworkRef);
  assert.equal((input.shipTo as { phone: string }).phone, "+17135550199", "shipping address carries the phone");
  const totals = input.totals as { discsSubtotalCents: number; grandTotalCents: number; firstOrderTotalCents: number; discountEligible: boolean };
  assert.equal(totals.discsSubtotalCents, 75000);
  assert.equal(totals.grandTotalCents, 75000);
  assert.equal(totals.firstOrderTotalCents, 67500);
  assert.equal(totals.discountEligible, true);
  assert.equal(input.testMode, false);

  // The stored order binds to the flow's own data, not to a key.
  const orderRef = order.structured.orderRef as string;
  const stored = JSON.parse(keys.store.get(`ORDER:${orderRef}`) ?? "{}") as { keylessBinding?: { contactEmail: string; intentRef?: string }; mode: string };
  assert.equal(stored.mode, "live");
  assert.equal(stored.keylessBinding?.contactEmail, "pastor@keylesstest.org");
  assert.equal(stored.keylessBinding?.intentRef, intentRef);
});

test("P-16: an order-email failure is partial success, stated plainly, never silent", async () => {
  const { env } = await makeEnv();
  const calls: Captured[] = [];
  const fetchFn = dispatchFetch(calls, { failOrderEmail: true });
  const flow = {
    quantity: 100, size: "100mm-round", mounting: "adhesive",
    contactEmail: "pastor@keylesstest.org", shipTo: SHIP_TO,
  };
  const recap = await runTool(env, req(), "get_recap", flow, fetchFn);
  const order = await runTool(env, req(), "create_order", {
    ...flow, contactName: "Pat Pastor", contactPhone: "+17135550199",
    recapRef: recap.structured.recapRef as string, exit: "pay_now", idempotencyKey: "persona-keyless-fail-0001",
  }, fetchFn);
  assert.ok(order.structured.orderRef, "the placement itself stands (the record is durable first)");
  const emailState = order.structured.orderEmail as { sent: boolean };
  assert.equal(emailState.sent, false);
  assert.ok(order.text.includes("failed to send"), "the failure is stated in the response");
  assert.ok(calls.some((c) => c.url.includes("/api/invoice-request")), "the CRM record write still happened");
});

test("P-15/P-16 test lane: a test-lane placement writes the DEV_ORDERS record and a TEST-marked email", async () => {
  const { env, dev } = await makeEnv();
  const calls: Captured[] = [];
  const fetchFn = dispatchFetch(calls);
  const flow = {
    quantity: 100, size: "100mm-round", mounting: "adhesive",
    contactEmail: "persona@mcptest.org", shipTo: SHIP_TO,
  };
  const recap = await runTool(env, req(), "get_recap", flow, fetchFn);
  const order = await runTool(env, req(), "create_order", {
    ...flow, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap.structured.recapRef as string, exit: "pay_now", idempotencyKey: "persona-testmode-0001",
  }, fetchFn);
  const devKeys = [...dev.store.keys()];
  const devRows = [...dev.store.values()].map((v) => JSON.parse(v) as { source?: string });
  assert.ok(devKeys.some((k) => k.startsWith("INVREQ:")), "the test placement lands in DEV_ORDERS under an INVREQ key");
  assert.ok(devRows.some((r) => r.source === "mcp"), "the DEV_ORDERS record is the MCP placement record");
  assert.ok(!calls.some((c) => c.url.includes("/api/invoice-request")), "a test placement never touches the live door");
  const notify = calls.filter((c) => (c.body ?? "").includes("notifyOrderPlaced"));
  assert.equal(notify.length, 1, "the order email still fires for a test placement");
  const input = (JSON.parse(notify[0].body ?? "{}") as { input: Record<string, unknown> }).input;
  assert.equal(input.testMode, true, "the email payload marks the placement as TEST");
  const mint = calls.filter((c) => (c.body ?? "").includes("mintOrderInvoice"));
  assert.equal(mint.length, 1, "the test-lane mint still runs, against the test key at the seat");
  assert.equal((JSON.parse(mint[0].body ?? "{}") as { input: Record<string, unknown> }).input.testLane, true);
  assert.ok((order.structured.customerEmail as { suppressed?: string }).suppressed, "the customer email is suppressed in the test lane, with the reason recorded");
});

// ─── Visual standard: order status images ──────────────────────────

test("visual standard: status shows the submitted artwork labeled; an artwork-less order returns cleanly", async () => {
  const { env } = await makeEnv();
  const calls: Captured[] = [];
  const fetchFn = dispatchFetch(calls);
  const artworkRef = await submitSvg(env, fetchFn);
  const flow = {
    quantity: 100, size: "100mm-round", mounting: "adhesive", artworkRef,
    contactEmail: "persona@example.com", shipTo: SHIP_TO,
  };
  const recap = await runTool(env, req(), "get_recap", flow, fetchFn);
  const order = await runTool(env, req(), "create_order", {
    ...flow, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap.structured.recapRef as string, exit: "pay_now", idempotencyKey: "persona-status-img-0001",
  }, fetchFn);
  const status = await runTool(env, req(), "get_order_status", { statusRef: order.structured.statusRef as string }, fetchFn);
  assert.ok(imageCount(status) >= 1, "status carries the artwork image");
  const design = (status.structured as unknown as { design: { imageLabel: string } }).design;
  assert.ok(design.imageLabel.includes("not the proof"), "the image is labeled as submitted artwork, not the proof");

  const bareFlow = { quantity: 100, size: "100mm-round", mounting: "adhesive", contactEmail: "persona@example.com", shipTo: SHIP_TO };
  const recap2 = await runTool(env, req(), "get_recap", bareFlow, fetchFn);
  const order2 = await runTool(env, req(), "create_order", {
    ...bareFlow, contactName: "Test Pastor", contactPhone: "+17135550199",
    recapRef: recap2.structured.recapRef as string, exit: "pay_now", idempotencyKey: "persona-status-bare-0001",
  }, fetchFn);
  const status2 = await runTool(env, req(), "get_order_status", { statusRef: order2.structured.statusRef as string }, fetchFn);
  assert.equal((status2.structured as unknown as { design: { state?: string } }).design.state, "not-attached", "the design block states not-attached where the order carries no artwork");
  assert.ok(status2.text.includes("proof"), "the text still points at the emailed proof");
});
