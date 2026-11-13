// Post-placement novice friction spec (2026-11-12, Cold-User Test
// lane, Dana run continued past placement): P1 status text leads
// with the human sentence, P2 numbered what-happens-next with
// per-step state derived from the record, P3 destination route
// before arrival, P4 after-you-order status paragraph, P5 one
// canonical sign-in line. Do-not-regress pins: the placement
// confirmation's completeness, the explainer prompt's plainness
// (covered in tools.test.ts), and proof gating honesty.

// Behavior tests for the tool implementations against in-memory KV
// fakes and a recording fetch stub (the business doors and Stripe are
// stubbed at the fetch seam; the acceptance run exercises the real
// deployed surfaces).

import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../src/tools.ts";
import { EXAMPLES_INDEX } from "../src/examples-data.ts";
import { PHOTOS_INDEX } from "../src/photos-data.ts";
import { STATUS_RECOVERY_LINE, DASHBOARD_LOGIN_URL, DESTINATION_BEFORE_ARRIVAL_LINE, dashboardSignInLine } from "../src/facts.ts";
import { findExplainerTopic } from "../src/explainer.ts";
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


const PP_SHIP_TO = { name: "Dana Novice", street: "1 Test Way", city: "Spring", state: "TX", postalCode: "77380", country: "US", phone: "+17135550199" };

async function placeOrder(env: Env, fetchFn: typeof fetch): Promise<{ statusRef: string; orderText: string; recapText: string }> {
  await seedExamples((env.MCP_ARTWORK as unknown as MemoryKV));
  await runTool(env, req(), "start_order_intent", { email: "dana-post@mcptest.org", organizationName: "TEST Post Placement Church (DO NOT CONTACT)" }, fetchFn);
  const recap = await runTool(env, req(), "get_recap", {
    contactEmail: "dana-post@mcptest.org", organizationName: "TEST Post Placement Church (DO NOT CONTACT)",
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: PP_SHIP_TO,
  }, fetchFn);
  const recapRef = recap.structured.recapRef as string;
  const order = await runTool(env, req(), "create_order", {
    contactName: "Dana", contactEmail: "dana-post@mcptest.org", contactPhone: "+17135550199",
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: PP_SHIP_TO,
    recapRef, idempotencyKey: "post-placement-test-0001",
  }, fetchFn);
  return { statusRef: order.structured.statusRef as string, orderText: order.text, recapText: recap.text };
}

test("P1+P2+P3+P5: status text leads human, sequences next steps, one sign-in line", async () => {
  const { env } = await makeEnv();
  const fetchFn = stubFetch([]) as unknown as typeof fetch;
  const { statusRef, orderText, recapText } = await placeOrder(env, fetchFn);

  // P5 at the recap and placement seats: discs open the tap address;
  // the sign-in is the canonical login URL, never the tap address.
  for (const t of [recapText, orderText]) {
    assert.ok(t.includes("Your discs open go.tap.giving/test-post-placement-church-do-not-contact"), "discs-open line");
    assert.ok(t.includes(dashboardSignInLine("test-post-placement-church-do-not-contact")), "canonical sign-in line");
    assert.ok(!t.includes("Dashboard sign-in: go.tap.giving"), "the tap address is never the sign-in");
    assert.ok(!t.includes("tap.giving/login"), "no legacy login address");
  }
  // Do-not-regress: the placement confirmation stays complete (total,
  // invoice, recovery line, protected confirmation sentence).
  assert.ok(orderText.includes("Your order is placed, and your invoice and design proof are on their way to dana-post@mcptest.org."), "confirmation sentence stands");
  assert.ok(orderText.includes(STATUS_RECOVERY_LINE), "recovery line at placement");

  const status = await runTool(env, req(), "get_order_status", { statusRef }, fetchFn);
  const firstLine = status.text.split("\n")[0];
  assert.equal(firstLine, "Your order is in and being prepared. The business records catch up within about an hour; that wait is normal, not a problem with your order.", "P1: the human sentence leads");
  assert.ok(!status.text.includes("stage received"), "P1: no stage code in the text");
  assert.ok(!status.text.includes(status.structured.orderRef as string), "P1: no raw order ref in the text");
  assert.equal(status.structured.stage, "received", "the stage code stays in structuredContent");
  // P2: the numbered block, states derived from this record (invoice
  // open, proof unpublished in the test lane flow, no fulfillment).
  assert.ok(status.text.includes("What happens next:"), "P2 block present");
  assert.ok(status.text.includes("1. Approve the design proof in the email we sent (production cannot start without it). [waiting on you"), "proof step waits on the customer");
  assert.ok(status.text.includes("2. Pay the invoice on its hosted page. [waiting on you: pay the invoice on its hosted page (it is open)]"), "pay step derived from the live invoice state");
  assert.ok(status.text.includes("3. Production and delivery run 2 to 3 weeks from artwork approval; tracking arrives by email when the discs ship. [after steps 1 and 2]"), "production step");
  const steps = status.structured.nextSteps as Array<{ step: string; state: string }>;
  assert.equal(steps.length, 3);
  assert.ok(steps[0].state.startsWith("waiting on you"));
  // Proof gating honesty holds in text.
  assert.ok(status.text.includes("Fulfillment has not begun (it starts after payment and proof approval)"), "proof gating stated plainly");
  // P3 + P5 at the status seat.
  assert.ok(status.text.includes(dashboardSignInLine("test-post-placement-church-do-not-contact")), "canonical sign-in at status");
  assert.ok(status.text.includes(DESTINATION_BEFORE_ARRIVAL_LINE), "before-arrival destination line at status");
  const dash = status.structured.dashboard as { loginUrl: string; note: string };
  assert.equal(dash.loginUrl, DASHBOARD_LOGIN_URL);
  assert.ok(dash.note.includes(DESTINATION_BEFORE_ARRIVAL_LINE), "before-arrival line in the structured note");
});

test("P3+P4: after-you-order names destinations and checking status", async () => {
  const topic = findExplainerTopic("tapgiving://explainer/after-you-order");
  assert.ok(topic, "the resource exists");
  const body = topic!.body;
  assert.ok(body.includes("Where a tap goes: your discs open your dashboard address."), "destination section opens");
  assert.ok(body.includes(DASHBOARD_LOGIN_URL), "canonical login in the resource");
  assert.ok(body.includes("re-point any disc anytime"), "after-arrival route");
  assert.ok(body.includes(DESTINATION_BEFORE_ARRIVAL_LINE), "before-arrival route");
  assert.ok(body.includes("Checking on your order: ask for its status with your status reference"), "status paragraph");
  assert.ok(body.includes(STATUS_RECOVERY_LINE), "recovery matches the explainer prompt line");
  assert.ok(!body.includes("tap.giving/login"), "no legacy login address in the resource");
});
