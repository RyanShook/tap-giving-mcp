// The versioned price contract (spec section 2.2).
//
// Prices, tiers, minimums, the discount, and anti-metal on the business
// side are computed ONLY from shared/business-rules.ts through
// worker/tap-order/src/pricing.ts quoteFor(). This server may not
// import across the repo boundary, so it implements the SAME figures
// as a small versioned contract whose stated sources are
// documentation/INVOICE-PLAYBOOK.md and the llms.txt tier lines, which
// publish identical figures. If this contract and the business source
// ever disagree, the business source is right and this contract is the
// bug; the acceptance run quotes the same carts through both doors and
// requires identical totals.
//
// quoteFor() semantics mirrored exactly (read from pricing.ts):
//   tiers descending: 400+ at 350, 200-399 at 400, 100-199 at 500 cents
//   antiMetal: undefined means 0 for the plain call, but the invoice
//     door (and this server, per spec 2.3) distinguishes "unknown"
//     (the caller omitted the count): unknown bills 0 and is reported
//     as the string "unknown"; a positive count clamps to quantity.
//   discount: the invoice door's quoteFor BAKES the discount into its
//     arithmetic (bakeDiscount: true). That baked figure is the door's
//     internal record figure, NOT the MCP's headline: Marketing's
//     content check (2026-11-06) ruled the MCP quote must headline LIST
//     totals (the llms.txt published worked totals: 100 = $500,
//     200 = $800, 400 = $1,400) and carry the first-order discount only
//     as a conditional WELCOME10 line. So this contract keeps both:
//     grandTotalCents is the LIST total (unitCents * qty + addOnCents),
//     and discountedTotalCents is the conditional figure the discount
//     produces when it applies at invoice time, computed with the door's
//     own per-unit rounding, round(unitCents * 0.9) * qty + addOnCents.
//     discountEligible and discountBaked still mirror the door's flags
//     (the stored order record carries them for the invoice leg's parity
//     read-back); they are never asserted to an unverified caller.
//   redirect: adds the free Redirect Dashboard add-on line at 0 cents.

export const PRICE_CONTRACT_VERSION = "2026-11-06.2";
export const PRICE_SOURCE =
  "shared/business-rules.ts (PRICING_TIERS, ORDER_POLICY), computed by worker/tap-order/src/pricing.ts quoteFor";

export const MIN_QTY = 100;
export const MAX_QTY = 7000;
export const ANTI_METAL_UNIT_CENTS = 100;
export const FIRST_ORDER_DISCOUNT_BPS = 1000;

export interface PricingTier {
  minQuantity: number;
  unitCents: number;
  label: string;
}

// Descending so the first matching tier is authoritative (same order
// as PRICING_TIERS in shared/business-rules.ts).
export const PRICING_TIERS: readonly PricingTier[] = [
  { minQuantity: 400, unitCents: 350, label: "400+ discs" },
  { minQuantity: 200, unitCents: 400, label: "200-399 discs" },
  { minQuantity: 100, unitCents: 500, label: "100-199 discs" },
];

export function tierForQuantity(quantity: number): PricingTier {
  for (const tier of PRICING_TIERS) {
    if (quantity >= tier.minQuantity) return tier;
  }
  return PRICING_TIERS[PRICING_TIERS.length - 1];
}

export function discountedTotalCents(subtotalCents: number): number {
  return Math.round(subtotalCents * (10_000 - FIRST_ORDER_DISCOUNT_BPS) / 10_000);
}

export interface Quote {
  qty: number;
  unitCents: number;
  discUnitCents: number;
  discSubtotalCents: number;
  discountedTotalCents: number;
  addOns: { name: string; amountCents: number; quantity: number }[];
  addOnCents: number;
  grandTotalCents: number;
  discountEligible: boolean;
  discountBaked: boolean;
  antiMetalCount: number;
  antiMetalMeta: string; // "unknown" is distinct from "0" on purpose
  redirectApplies: boolean;
  // MCP-only reporting extras (not part of quoteFor's return): whether
  // a caller-supplied anti-metal count was clamped to the quantity.
  antiMetalClamped: boolean;
}

/**
 * Mirror of quoteFor() with the invoice door's call shape
 * (bakeDiscount: true). `antiMetal` semantics:
 *   undefined  -> unknown (bills 0, meta "unknown")
 *   -1         -> unknown (quoteFor's own sentinel)
 *   0          -> none
 *   >0         -> that many, clamped to qty
 */
export function quoteFor(p: {
  qty: number;
  antiMetal?: number;
  redirect?: boolean;
  discountEligible?: boolean;
}): Quote {
  const qty = p.qty;
  const tier = tierForQuantity(qty);
  const unitCents = tier.unitCents;
  const discountEligible = p.discountEligible !== false;
  const redirectApplies = p.redirect === true;

  const raw: number | undefined = typeof p.antiMetal === "number" ? p.antiMetal : undefined;
  const unknown = raw === undefined || raw === -1;
  const antiMetalCount = !unknown && raw! > 0 ? Math.min(raw!, qty) : 0;
  const antiMetalClamped = !unknown && raw! > qty;
  const antiMetalMeta = unknown ? "unknown" : String(antiMetalCount);

  const addOns: { name: string; amountCents: number; quantity: number }[] = [];
  if (antiMetalCount > 0) {
    addOns.push({ name: "Metal-surface shielding layer", amountCents: ANTI_METAL_UNIT_CENTS, quantity: antiMetalCount });
  }
  if (redirectApplies) {
    addOns.push({ name: "Redirect Dashboard (included, free)", amountCents: 0, quantity: 1 });
  }
  const hasAddOn = addOns.length > 0;
  // The invoice door always bakes (bakeDiscount: true in
  // invoice-request.ts): bake = discountEligible && (hasAddOn ||
  // bakeDiscount), with bakeDiscount true on this call shape. The flag
  // and the door's baked per-unit figure stay computed here because the
  // stored order record carries them for the invoice leg; the MCP's
  // headline total, however, is the LIST total (see the header note).
  const bakeDiscount = true;
  const bake = discountEligible && (hasAddOn || bakeDiscount);
  const bakedUnitCents = bake ? discountedTotalCents(unitCents) : unitCents;
  const addOnCents = addOns.reduce((s, a) => s + a.amountCents * a.quantity, 0);

  return {
    qty, unitCents,
    discUnitCents: unitCents,
    discSubtotalCents: unitCents * qty,
    discountedTotalCents: bakedUnitCents * qty + addOnCents,
    addOns, addOnCents,
    grandTotalCents: unitCents * qty + addOnCents,
    discountEligible, discountBaked: bake,
    antiMetalCount, antiMetalMeta, redirectApplies,
    antiMetalClamped,
  };
}
