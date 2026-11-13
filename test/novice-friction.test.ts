// Novice-friction spec (2026-11-12, Cold-User Test lane, Dana run):
// S1 buyer lead in discovery, S2 designed-for-you path surfaced,
// S3 metal decision aid, S4 unbound recap summary, S5 status
// recovery copy, S6 overview topic alias, S7 submit verdict
// sentence, S8 dashboard mechanics moved out of discovery. Plus the
// spec's do-not-regress set (no-app answer, samples answer, kind
// below-minimum refusal).

import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool, toolByName, DESIGNED_FOR_YOU_LINE, BUYER_LEAD } from "../src/tools.ts";
import { STATUS_RECOVERY_LINE, METAL_SURFACE_AID } from "../src/facts.ts";
import { findExplainerTopic } from "../src/explainer.ts";
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
    const keys = [...this.store.keys()].filter((k) => !opts?.prefix || k.startsWith(opts.prefix));
    return { keys: keys.map((name) => ({ name })), list_complete: true };
  }
}

function makeEnv(): Env {
  return {
    MCP_KEYS: new MemoryKV() as unknown as KVNamespace,
    MCP_ARTWORK: new MemoryKV() as unknown as KVNamespace,
    ORDERS: new MemoryKV() as unknown as KVNamespace,
    DEV_ORDERS: new MemoryKV() as unknown as KVNamespace,
    STRIPE_API_KEY_TEST: "sk_test_stub",
    MCP_INVOKE_SECRET: "test-secret",
  } as unknown as Env;
}

function req(): Request {
  return new Request("https://tap.giving/mcp", { method: "POST", headers: {} });
}

const noFetch = (async () => new Response("nope", { status: 404 })) as typeof fetch;
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const SHIP_TO = {
  name: "Dana Whitfield", street: "1200 Church St", city: "Franklin", state: "TN",
  postalCode: "37064", country: "US", phone: "+19315550142",
};
const DANA_INTENT = "I have no idea what this is or how it works. What is it, do people need an app, and what would we actually have to do?";

test("S1: a buyer intent leads discovery with the buyer path, jargon-free", async () => {
  const env = makeEnv();
  const r = await runTool(env, req(), "get_discovery", { intent: DANA_INTENT }, noFetch);
  const s = r.structured as { buyerLead?: string };
  assert.equal(s.buyerLead, BUYER_LEAD, "the buyer lead rides structured content");
  const leadAt = r.text.indexOf("Getting tap working at your organization");
  assert.ok(leadAt > 0, "the buyer lead is in the text");
  assert.ok(leadAt < r.text.indexOf("What it is"), "the buyer lead comes before the What it is section");
  assert.ok(r.text.includes("No app is needed"), "the no-app answer is in the lead");
  for (const jargon of ["print-ready", "vendor-neutral"]) {
    assert.ok(!BUYER_LEAD.includes(jargon), `the lead carries no undefined jargon: ${jargon}`);
  }
  assert.ok(!/\$\d/.test(BUYER_LEAD), "the lead carries no pricing (phase one)");
});

test("S1: a design-led intent keeps the standing discovery shape", async () => {
  const env = makeEnv();
  const r = await runTool(env, req(), "get_discovery", { intent: "I have a logo in SVG and want the artwork spec for a round disc" }, noFetch);
  const s = r.structured as { buyerLead?: string };
  assert.equal(s.buyerLead, undefined, "no buyer lead for a design-led intent");
  assert.ok(!r.text.includes("Getting tap working at your organization"), "no buyer block in the text");
});

test("S1: buy-phrasings fire the buyer lead (Cold-User re-verification, 2026-11-12)", async () => {
  const env = makeEnv();
  for (const intent of [
    "How do I buy tap discs for my church?",
    "We want to purchase tap discs for our school",
    "How can we order discs for our nonprofit?",
    "I am buying tap discs for our church",
    "Where can I buy these discs?",
  ]) {
    const r = await runTool(env, req(), "get_discovery", { intent }, noFetch);
    const s = r.structured as { buyerLead?: string };
    assert.equal(s.buyerLead, BUYER_LEAD, `buyer lead fires for: ${intent}`);
    assert.ok(r.text.includes("Getting tap working at your organization"), `buyer block in the text for: ${intent}`);
  }
});

test("S1: a design-led intent with a buying word still gets no buyer lead", async () => {
  const env = makeEnv();
  for (const intent of [
    "How do I buy a template for my logo design?",
    "I want to buy vector artwork for our discs",
  ]) {
    const r = await runTool(env, req(), "get_discovery", { intent }, noFetch);
    const s = r.structured as { buyerLead?: string };
    assert.equal(s.buyerLead, undefined, `no buyer lead for design-led: ${intent}`);
    assert.ok(!r.text.includes("Getting tap working at your organization"), `no buyer block for: ${intent}`);
  }
});

test("S2: the designed-for-you path tops the artwork spec, mechanism named", async () => {
  const env = makeEnv();
  const r = await runTool(env, req(), "get_artwork_spec", { shape: "round" }, noFetch);
  const lineAt = r.text.indexOf(DESIGNED_FOR_YOU_LINE);
  assert.equal(lineAt, 0, "the designed-for-you line is the first line of the spec text");
  assert.ok(r.text.includes("start_order_intent"), "the mechanism is named in the spec text");
  assert.ok(r.text.indexOf("organizationName") < r.text.indexOf("bleed radius"), "the mechanism comes before the geometry");
  const s = r.structured as { designedForYou?: { line?: string; mechanism?: string } };
  assert.equal(s.designedForYou?.line, DESIGNED_FOR_YOU_LINE, "structured designedForYou carries the line");
  assert.ok((s.designedForYou?.mechanism ?? "").includes("start_order_intent"), "structured mechanism names start_order_intent");
});

test("S2: discovery carries the designed-for-you line as a step", async () => {
  const env = makeEnv();
  const r = await runTool(env, req(), "get_discovery", {}, noFetch);
  assert.ok(r.text.includes(DESIGNED_FOR_YOU_LINE), "the line is in the discovery steps");
});

test("S2: the order questions carry the explicit artwork answer", async () => {
  const env = makeEnv();
  const r = await runTool(env, req(), "get_order_questions", {}, noFetch);
  const s = r.structured as { questions: Array<{ field: string; options?: Array<{ value: string; label: string }> }> };
  const q = s.questions.find((x) => x.field === "artworkSource");
  assert.ok(q, "an artworkSource question exists");
  const labels = (q.options ?? []).map((o) => o.label);
  assert.ok(labels.includes("We have artwork"), "the have-artwork answer");
  assert.ok(labels.includes("Team designs it from our name"), "the team-designs-it answer");
  assert.ok(r.text.includes("team designs it from our name"), "the answer is in the questions text");
});

test("S2: a recap with no artwork reads as the team-design route", async () => {
  const env = makeEnv();
  const r = await runTool(env, req(), "get_recap", {
    contactEmail: "dana-novice-20261112@mcptest.org", organizationName: "TEST Grace Community Church (novice run - DO NOT CONTACT)",
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    linkDestination: "https://gracecommunity.example/give",
  }, noFetch);
  assert.ok(r.text.includes("Artwork: none attached. That is the team-design route, not a gap"), "the no-artwork line is a route");
  assert.ok(r.text.includes("emails the proof for approval before anything is printed"), "the proof follows by email");
});

test("S3: the mounting topic carries the magnet aid and no price", async () => {
  const env = makeEnv();
  const r = await runTool(env, req(), "get_product", { topic: "mounting" }, noFetch);
  assert.ok(r.text.includes("if a magnet sticks to it, it counts"), "the magnet test is in the mounting topic");
  assert.ok(r.text.includes("wood, plastic, fabric, glass, and drywall"), "the not-metal list is in the mounting topic");
  assert.ok(r.text.includes("nothing prints before you approve the proof"), "the safety net is stated");
  assert.ok(r.text.includes("the team confirms the count with you before printing"), "the unknown-count net is stated");
  assert.ok(!/\$\d/.test(r.text), "no price in the phase-one mounting topic");
  const s = r.structured as { mounting?: { metalAid?: string } };
  assert.ok((s.mounting?.metalAid ?? "").includes("magnet sticks"), "the aid rides structured content");
});

test("S3: question 6 carries the aid with the plain $1 framing", async () => {
  const env = makeEnv();
  const r = await runTool(env, req(), "get_order_questions", {}, noFetch);
  const s = r.structured as { questions: Array<{ field: string; note?: string }> };
  const q6 = s.questions.find((x) => x.field === "antiMetalCount");
  assert.ok((q6?.note ?? "").includes("magnet sticks"), "the aid is in question 6");
  assert.ok((q6?.note ?? "").includes("$1 per disc that sits on metal"), "the plain $1 framing is in question 6");
  assert.ok(r.text.includes("$1 per disc that sits on metal"), "the plain $1 framing is in the questions text");
});

test("S4: get_recap without a contact email returns the unbound summary", async () => {
  const env = makeEnv();
  const r = await runTool(env, req(), "get_recap", {
    organizationName: "TEST Grace Community Church (novice run - DO NOT CONTACT)",
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
    linkDestination: "https://gracecommunity.example/give",
  }, noFetch);
  assert.ok(r.text.includes("This is an unbound summary: it is not placeable until a contact email is captured."), "the not-placeable marker is in the text");
  assert.ok(r.text.includes("Cost: $500.00 total"), "the summary is complete, total included");
  assert.ok(r.text.includes("the invoice and the design proof are emailed to that address"), "the marker says what the email is for");
  assert.ok(r.text.includes("capturing it starts no order and sends nothing else"), "the marker says capturing starts nothing");
  const s = r.structured as { recapRef: string; customer: { contactEmail: unknown; unbound?: boolean; placeable?: boolean } };
  assert.equal(s.customer.contactEmail, null, "no contact email on an unbound recap");
  assert.equal(s.customer.unbound, true, "structured unbound flag");
  assert.equal(s.customer.placeable, false, "structured placeable flag");
  // And create_order refuses the unbound recap by name.
  await assert.rejects(
    () => runTool(env, req(), "create_order", {
      contactName: "Dana Whitfield", contactEmail: "dana-novice-20261112@mcptest.org", contactPhone: "+19315550142",
      organizationName: "TEST Grace Community Church (novice run - DO NOT CONTACT)",
      quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
      linkDestination: "https://gracecommunity.example/give",
      recapRef: s.recapRef, idempotencyKey: "novice-s4-unbound-1", exit: "pay_now",
    }, noFetch),
    /unbound summary/,
    "create_order refuses an unbound recap",
  );
});

test("S4: a bound recap is unchanged in shape", async () => {
  const env = makeEnv();
  const r = await runTool(env, req(), "get_recap", {
    contactEmail: "dana-novice-20261112@mcptest.org", organizationName: "TEST Grace Community Church (novice run - DO NOT CONTACT)",
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
  }, noFetch);
  assert.ok(!r.text.includes("unbound summary"), "no unbound marker on a bound recap");
  const s = r.structured as { customer: { contactEmail: unknown; unbound?: boolean } };
  assert.equal(s.customer.contactEmail, "dana-novice-20261112@mcptest.org");
  assert.equal(s.customer.unbound, undefined);
});

test("S5: the status recovery line replaces the unrecoverable claim", async () => {
  const env = makeEnv();
  const d = await runTool(env, req(), "get_discovery", {}, noFetch);
  assert.ok(d.text.includes(STATUS_RECOVERY_LINE), "discovery carries the recovery line");
  assert.ok(!d.text.includes("cannot be recovered"), "the unrecoverable claim is gone from discovery");
  await assert.rejects(() => runTool(env, req(), "get_order_status", {}, noFetch), /team re-sends it/, "the missing-reference error names the recovery");
  await assert.rejects(() => runTool(env, req(), "get_order_status", { statusRef: "bogus-reference" }, noFetch), /not one this server knows\. Your reference is in your invoice email/, "not_found appends the recovery line");
});

test("S5: the create_order description carries the recovery line (follow-up seat)", async () => {
  const def = toolByName("create_order");
  assert.ok(def, "create_order is defined");
  assert.ok(def.description.includes(STATUS_RECOVERY_LINE), "the create_order description carries the recovery line");
  assert.ok(!def.description.includes("cannot be recovered"), "no unrecoverable claim in the create_order description");
});

test("S6: overview and general alias to the full product summary", async () => {
  const env = makeEnv();
  for (const topic of ["overview", "general"]) {
    const r = await runTool(env, req(), "get_product", { topic }, noFetch);
    const s = r.structured as Record<string, unknown>;
    assert.ok(s.discs && s.mounting && s.shipping, `${topic} returns the full summary`);
  }
  await assert.rejects(() => runTool(env, req(), "get_product", { topic: "bogus" }, noFetch), /Unknown topic/, "a genuinely unknown topic still refuses");
});

test("S7: a PNG submit leads with the verdict sentence, no print-file paragraph", async () => {
  const env = makeEnv();
  const bin = atob(PNG_B64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", u8 as BufferSource))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const r = await runTool(env, req(), "submit_artwork", {
    file: { filename: "grace-community-design.png", mediaType: "image/png", contentBase64: PNG_B64 },
    sha256: sha,
  }, noFetch);
  assert.ok(r.text.includes("Your file works for the proof. If a sharper file is needed for printing, the team asks by email; it never blocks your proof."), "the verdict sentence is in the text");
  assert.ok(!r.text.includes("vector preferred"), "the dangling fragment is gone");
  assert.ok(!r.text.includes("PRINT FILE:"), "the print-file paragraph is out of the human text");
  const s = r.structured as { export?: { printFile?: { label?: string } } };
  assert.equal(s.export?.printFile?.label, "PRINT FILE", "the structured export keeps the print file for agents");
});

test("S8: dashboard mechanics moved from discovery to the recap", async () => {
  const env = makeEnv();
  const d = await runTool(env, req(), "get_discovery", {}, noFetch);
  assert.ok(!d.text.includes("password arrives by email"), "no credential mechanics in discovery");
  assert.ok(d.text.includes("A free dashboard lets you re-point any disc anytime"), "the one dashboard line stays in discovery");
  const r = await runTool(env, req(), "get_recap", {
    contactEmail: "dana-novice-20261112@mcptest.org", organizationName: "TEST Grace Community Church (novice run - DO NOT CONTACT)",
    quantity: 100, size: "100mm-round", mounting: "adhesive", shipTo: SHIP_TO,
  }, noFetch);
  assert.ok(r.text.includes("password arrives by email with your shipping notice"), "the mechanics are at the recap");
  assert.ok(r.text.includes("go.tap.giving/test-grace-community-church-novice-run-do-not-contact") || r.text.includes("go.tap.giving/"), "the recap names the dashboard address");
});

test("do not regress: no-app answer, samples answer, kind below-minimum refusal", async () => {
  const env = makeEnv();
  const d = await runTool(env, req(), "get_discovery", {}, noFetch);
  const s = d.structured as { plainLanguage: { nfc: string }; samples: string };
  assert.ok(s.plainLanguage.nfc.includes("No app is needed"), "the no-app answer stands");
  assert.ok(s.samples.includes("we do not offer physical samples"), "the samples answer stands");
  await assert.rejects(() => runTool(env, req(), "get_quote", { quantity: 50 }, noFetch), /smallest order is 100 discs/, "the below-minimum refusal stays kind and complete");
});

// Explainer novice read (2026-11-13, Cold-User Test lane): E1 the
// how-it-works resource carries the designed-for-you route, E2 the
// materials-and-care resource carries the metal decision aid.

test("E1: the how-it-works explainer carries the designed-for-you line, homework story gone", async () => {
  const topic = findExplainerTopic("tapgiving://explainer/how-it-works");
  assert.ok(topic, "the how-it-works explainer exists");
  assert.ok(topic.body.includes(DESIGNED_FOR_YOU_LINE), "the designed-for-you line is carried verbatim");
  assert.ok(!topic.body.includes("compose the artwork with your own tools"), "the do-it-yourself compose story is gone");
  assert.ok(!topic.body.includes("print-ready PDF is a file your own agent produces"), "the agent-produces-the-PDF story is gone");
  assert.ok(topic.body.includes("The artwork is yours to take to any printer"), "the take-it-anywhere fact stays");
  assert.ok(topic.body.includes("Email me my invoice and design proof"), "the final-step label still closes phase two");
});

test("E2: the materials-and-care explainer carries the magnet aid, no price", async () => {
  const topic = findExplainerTopic("tapgiving://explainer/materials-and-care");
  assert.ok(topic, "the materials-and-care explainer exists");
  assert.ok(topic.body.includes(METAL_SURFACE_AID), "the metal aid is carried verbatim");
  assert.ok(topic.body.includes("if a magnet sticks to it, it counts"), "the magnet test is in materials and care");
  assert.ok(topic.body.includes("the team confirms the count with you before printing"), "the unknown-count net is stated");
  assert.ok(!/\$\d/.test(topic.body), "no price in the phase-one materials topic");
});
