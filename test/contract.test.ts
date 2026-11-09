// Contract tests (spec 9.2 item 2, and the section 2.2 fact-source
// requirement): tier boundaries equal the llms.txt figures, artwork
// geometry equals artwork/_audit.py's constants as cited, tool
// annotations are honest, and no tool name or description states or
// implies the server takes payment.

import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteFor, tierForQuantity, PRICING_TIERS } from "../src/pricing.ts";
import { ARTWORK_GEOMETRY, NO_FEES_LINE, PRODUCT, SERVER_DESCRIPTION, TAX_NOTE } from "../src/facts.ts";
import { TOOLS, toolByName } from "../src/tools.ts";
import { EXAMPLES } from "../src/examples.ts";

// llms.txt (business repo, website/llms.txt): "100-199 discs: $5.00 per
// disc; 200-399: $4.00; 400+: $3.50; Minimum order: 100 discs".
test("tier boundaries equal the llms.txt figures", () => {
  assert.equal(tierForQuantity(100).unitCents, 500);
  assert.equal(tierForQuantity(199).unitCents, 500);
  assert.equal(tierForQuantity(200).unitCents, 400);
  assert.equal(tierForQuantity(399).unitCents, 400);
  assert.equal(tierForQuantity(400).unitCents, 350);
  assert.equal(tierForQuantity(7000).unitCents, 350);
  assert.deepEqual(PRICING_TIERS.map((t) => [t.minQuantity, t.unitCents]), [[400, 350], [200, 400], [100, 500]]);
});

test("quote math matches the invoice door's quoteFor shape", () => {
  // 250 discs, no add-ons. The door's baked per-unit figure is
  // 400 * 0.9 = 360, carried as the conditional discounted total
  // (90000); the headline is the LIST total (Marketing content check
  // 2026-11-06: llms.txt worked totals are list, 250 at $4.00 = 100000).
  const q = quoteFor({ qty: 250 });
  assert.equal(q.unitCents, 400);
  assert.equal(q.discUnitCents, 400);
  assert.equal(q.discSubtotalCents, 100000);
  assert.equal(q.discountedTotalCents, 90000);
  assert.equal(q.grandTotalCents, 100000);
  assert.equal(q.discountBaked, true);
  assert.equal(q.antiMetalMeta, "unknown");
  // Known anti-metal count rides at full price, undiscounted.
  const q2 = quoteFor({ qty: 250, antiMetal: 40 });
  assert.equal(q2.addOnCents, 4000);
  assert.equal(q2.grandTotalCents, 104000);
  assert.equal(q2.discountedTotalCents, 94000);
  assert.equal(q2.antiMetalMeta, "40");
  // Over-quantity count clamps and reports the clamp.
  const q3 = quoteFor({ qty: 100, antiMetal: 500 });
  assert.equal(q3.antiMetalCount, 100);
  assert.equal(q3.antiMetalClamped, true);
  // Explicit zero is distinct from unknown.
  const q4 = quoteFor({ qty: 100, antiMetal: 0 });
  assert.equal(q4.antiMetalMeta, "0");
});

test("artwork geometry equals the cited production constants", () => {
  const g = ARTWORK_GEOMETRY;
  assert.equal(g.canvasMm, 106.0); // PLATE_CANVAS_MM
  assert.equal(g.round.cutRadiusMm, 50.0); // CUT_R
  assert.equal(g.round.bleedRadiusMm, 53.0); // BLEED_R
  assert.equal(g.round.safeRadiusMm, 45.0); // SAFE_R
  assert.equal(g.square.bleedHalfWidthMm, 53.0); // SQUARE_BLEED_HALF
  assert.equal(g.square.safeHalfWidthMm, 47.0); // SQUARE_SAFE_HALF
  assert.equal(g.minimumLogoMm, 18.0); // MIN_LOGO_MM
  assert.deepEqual(g.round.centreMm, { x: 53, y: 53 });
  assert.deepEqual(g.square.cutBoxMm, { from: 3, to: 103 });
});

test("product facts carry the for-agents strings", () => {
  assert.ok(PRODUCT.chipDetail.includes("NTAG213"));
  assert.ok(PRODUCT.material.includes("waterproof PVC"));
  assert.equal(PRODUCT.sizes.length, 2);
  assert.ok(PRODUCT.sizes.every((s) => s.label.includes("100 mm (4 inch)")));
});

test("the v1 tool set is exactly the specced twelve", () => {
  const names = TOOLS.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "create_order", "get_artwork_spec", "get_discovery", "get_order_questions",
    "get_order_status", "get_product", "get_quote", "get_recap",
    "register_webhook", "request_invoice", "start_order_intent", "submit_artwork",
  ].sort());
});

test("annotations are honest: reads are read-only, writes never are", () => {
  for (const t of TOOLS) {
    const reads = ["get_discovery", "get_quote", "get_product", "get_artwork_spec", "get_order_questions", "get_recap", "get_order_status"];
    if (reads.includes(t.name)) {
      assert.equal(t.annotations.readOnlyHint, true, t.name);
    } else {
      assert.notEqual(t.annotations.readOnlyHint, true, t.name);
    }
    assert.equal(t.annotations.destructiveHint, false, t.name);
  }
});

test("no tool offers payment, approval, or production release", () => {
  for (const t of TOOLS) {
    assert.ok(!/pay_invoice|approve|release|fulfill|ship_order/i.test(t.name), t.name);
  }
  const all = TOOLS.map((t) => `${t.name} ${t.description}`).join("\n");
  assert.ok(!/\bwe charge\b|\bcharges your card\b|accepts payment/i.test(all));
});

test("get_quote's description carries the get_pricing alias", () => {
  assert.ok(toolByName("get_quote")!.description.includes("get_pricing"));
});

test("examples are a house set of six, round and square across it", () => {
  assert.equal(EXAMPLES.length, 6);
  assert.ok(EXAMPLES.some((e) => e.shape === "round"));
  assert.ok(EXAMPLES.some((e) => e.shape === "square"));
  for (const e of EXAMPLES) {
    assert.ok(e.svgText.includes("<svg"), e.id);
    assert.ok(e.pngBase64.length > 1000, e.id);
    assert.ok(e.direction.length > 10, e.id);
  }
});

test("server description carries the no-fees line and the verbatim gate sentence", () => {
  assert.ok(SERVER_DESCRIPTION.includes(NO_FEES_LINE), "no-fees statement in the server description");
  assert.ok(SERVER_DESCRIPTION.includes("This server moves no money itself and issues no invoices: a person from Tap.Giving follows up with the invoice."), "gate sentence verbatim in the server description");
  assert.equal(TAX_NOTE, "Tax, where it applies, is calculated on the invoice.");
});
