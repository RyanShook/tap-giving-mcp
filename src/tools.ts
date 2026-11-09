// The v1 tool surface (spec section 2): contracts, annotations, and
// implementations. Every result returns both MCP structured content
// and a plain-text rendering. Tool descriptions carry the gate
// sentences of section 4, so a client that never reads the spec still
// meets the boundaries in tools/list.

import {
  ARTWORK_GUIDELINES, ARTWORK_GEOMETRY, BENEFITS, BENEFITS_PHASE_TWO, ENDPOINT, GATES,
  LINK_DESTINATION_NOTE, MOUNTING_OPTIONS, PRODUCT, PRODUCT_TOPICS, RECAP_NOTES,
  DESTINATION_MODEL, DISCOUNT_WINDOW_MEANING, TURNAROUND,
  NO_FEES_LINE, TEAM_EMAIL,
  SERVER_DESCRIPTION, SERVER_NAME, POSITIONING_LINE, PRESENTATION_SYNONYMS, TAX_NOTE, PRICE_RANGE_LINE,
  SAMPLES_LINE, SAMPLES_GUIDANCE_LINE, TAX_EXEMPT_LINE, TAX_EXEMPT_GUIDANCE_LINE, PAYMENT_GUIDANCE_LINE,
  PLAIN_NFC_LINE, QR_CONDITIONAL_LINE, VERSUS_PRINTED_CODES_LINE, DURABILITY_LINE, MOUNTING_SURFACE_GUIDE,
  PROTECTED_STRING, confirmationText, DESIGN_SHAPES, DESIGN_SHAPES_NOTE, COLOR_SPACE_STATEMENT,
  AGENT_PDF_CHECKLIST, QR_DESIGN_RULES, LOGO_RULES, GEOMETRY_GLOSSARY,
  VERIFY_AGAINST_EXAMPLE, VERIFY_AGAINST_EXAMPLE_TEXT } from "./facts.ts";
import { EXPLAINER_TOPICS, explainerResourceUri } from "./explainer.ts";
import { PRICING_TIERS } from "./pricing.ts";
import { renderArtworkOnDisc, renderArtworkFileToPng, bytesToBase64, SCREW_HOLES } from "./preview.ts";
import phoneTapPhoto from "./product-assets/phone-tap.webp.ts";
import mountAdhesivePhoto from "./product-assets/mount-adhesive.webp.ts";
import mountScrewsPhoto from "./product-assets/mount-screws.webp.ts";
import { MAX_QTY, MIN_QTY, PRICE_SOURCE, quoteFor, tierForQuantity, type Quote } from "./pricing.ts";
import {
  ToolError, invalidInput, isRecord, optInt, optString, reqInt, reqString,
} from "./errors.ts";
import { sha256Hex, randomToken } from "./util.ts";
import { DETECTED_MEDIA_TYPE, MAX_ARTWORK_BYTES, sniffArtwork } from "./sniff.ts";
import { callSeat } from "./seat.ts";
import { StripeCallError, stripeCall } from "./stripe.ts";
import { EXAMPLES_INDEX, type DeliveredExample } from "./examples-data.ts";
import { PHOTOS_INDEX } from "./photos-data.ts";
import type { Env } from "./env.ts";

const DAY = 24 * 3600;
const ARTWORK_TTL = 30 * DAY;
const RECAP_TTL = 7 * DAY;

// ─── shared shapes ──────────────────────────────────────────────────

export interface ToolResult {
  structured: Record<string, unknown>;
  text: string;
  image?: { data: string; mimeType: string };
  images?: Array<{ data: string; mimeType: string }>;
}

interface Ctx {
  env: Env;
  request: Request;
  fetchFn: typeof fetch;
}

function orderNamespace(env: Env, mode: "live" | "test"): KVNamespace {
  return mode === "live" ? env.ORDERS : env.DEV_ORDERS;
}

// The test lane (settlement 1, 2026-11-09): identity-based and
// server-side, never offered in copy. A placement is test-lane when
// the contact email domain is on the operator list or the
// organization name carries a TEST / DO NOT CONTACT marker. Test
// placements route to DEV_ORDERS, skip CRM adoption, email Ryan
// TEST-marked to team inboxes only, mint on the test Stripe key
// inside the seat, and suppress the customer email.
export const TEST_LANE_DOMAINS = ["mcptest.org"];
export function laneFor(contactEmail: string, organizationName?: string): "live" | "test" {
  const domain = contactEmail.toLowerCase().split("@")[1] ?? "";
  if (TEST_LANE_DOMAINS.includes(domain)) return "test";
  if (organizationName && /\bTEST\b|DO NOT CONTACT/i.test(organizationName)) return "test";
  return "live";
}

function stripeKeyFor(env: Env, mode: "live" | "test"): string {
  const key = mode === "live" ? env.STRIPE_API_KEY_LIVE : env.STRIPE_API_KEY_TEST;
  if (!key) throw new ToolError("stripe_unavailable", "Stripe is not configured for this mode right now. Nothing was minted; it is safe to retry later.");
  return key;
}

function quoteOutput(quote: Quote): Record<string, unknown> {
  const tier = tierForQuantity(quote.qty);
  const boundary = nextTierBoundary(quote.qty);
  const boundaryQuote = boundary ? quoteFor({ qty: boundary.quantity, antiMetal: quote.antiMetalCount > 0 || quote.antiMetalMeta !== "unknown" ? quote.antiMetalCount : undefined }) : null;
  return {
    ...(boundary && boundaryQuote ? {
      tierComparison: {
        boundaryQuantity: boundary.quantity,
        boundaryUnitCents: boundary.unitCents,
        boundaryTotalCents: boundaryQuote.grandTotalCents,
        differenceCents: boundaryQuote.grandTotalCents - quote.grandTotalCents,
        line:
          `${boundary.quantity} discs would be ${dollars(boundaryQuote.grandTotalCents)} (${dollars(boundary.unitCents)} each): ` +
          (boundaryQuote.grandTotalCents >= quote.grandTotalCents
            ? `${dollars(boundaryQuote.grandTotalCents - quote.grandTotalCents)} more for ${boundary.quantity - quote.qty} more disc${boundary.quantity - quote.qty === 1 ? "" : "s"}.`
            : `${dollars(quote.grandTotalCents - boundaryQuote.grandTotalCents)} LESS than this quote, for ${boundary.quantity - quote.qty} more disc${boundary.quantity - quote.qty === 1 ? "" : "s"}.`),
      },
    } : {}),
    quantity: quote.qty,
    tier: tier.label,
    unitCents: quote.unitCents,
    discUnitCents: quote.discUnitCents,
    discSubtotalCents: quote.discSubtotalCents,
    discount: {
      code: "WELCOME10",
      percentOff: 10,
      scope: "first order",
      window: "7-day renewing window",
      appliedInHeadlineTotals: false,
      conditionalTotalCents: quote.discountedTotalCents,
      appliesToAddOns: "The 10 percent comes off the discs only. Add-ons are billed at full price inside both totals: the add-on amount rides unchanged in the discounted total.",
      windowMeaning: DISCOUNT_WINDOW_MEANING,
      description:
        "First-order discount: 10 percent off the discs with code WELCOME10, inside a 7-day renewing window. " +
        "It is a conditional first-order line, not a price gate: the headline totals above are list totals, " +
        "and the discount applies at invoice time only when the order is the organization's first. Add-ons are " +
        "not discounted: their full amount is included in both totals. " +
        `conditionalTotalCents (${dollars(quote.discountedTotalCents)}) is what the total becomes when that first-order discount applies.`,
    },
    firstOrderTotalCents: quote.discountedTotalCents,
    firstOrderTotalNote: `If this is the organization's first order, the one payable total is ${dollars(quote.discountedTotalCents)} (list ${dollars(quote.grandTotalCents)} less 10 percent off the discs; add-ons at full price; shipping free). On any later order the payable total is the list total.`,
    discountEligibility:
      "Eligibility in plain words: the first-order discount belongs to an organization's first order. " +
      "Getting a quote does not use it up; placing the first order is what spends it, and a fresh quote " +
      "restarts the 7-day window.",
    ...(quote.antiMetalCount > 0 ? {} : {
      metalWarning:
        "Metal check: if any of these discs go on metal surfaces, they need the anti-metal shielding layer " +
        "at $1.00 per shielded disc. The layer is decided before printing and cannot be added afterwards, " +
        "so settle the count before ordering.",
    }),
    turnaround: TURNAROUND,
    deliveryFraming: "Delivery: production and delivery run 2 to 3 weeks from artwork approval, so approving the artwork today puts delivery inside that window.",
    addOns: quote.addOns,
    addOnCents: quote.addOnCents,
    antiMetal: quote.antiMetalMeta === "unknown"
      ? { state: "unknown", note: "No anti-metal count was given; an unknown count bills nothing here. Discs on metal surfaces need the shielding layer at $1.00 per shielded disc, decided before printing." }
      : { state: "counted", count: quote.antiMetalCount, ...(quote.antiMetalClamped ? { clamped: true, note: "The anti-metal count was clamped to the quantity." } : {}) },
    shippingCents: 0,
    shippingLine: "Shipping: Free",
    taxNote: TAX_NOTE,
    grandTotalCents: quote.grandTotalCents,
    grandTotalWithFirstOrderDiscountCents: quote.discountedTotalCents,
    currency: "USD",
    priceSource: PRICE_SOURCE,
  };
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function quoteText(q: Record<string, unknown>): string {
  const addOns = (q.addOns as Array<{ name: string; amountCents: number; quantity: number }>)
    .map((a) => `  ${a.name} x${a.quantity}: ${dollars(a.amountCents * a.quantity)}`).join("\n");
  const cmp = q.tierComparison as { line: string } | undefined;
  return [
    `Quote for ${q.quantity} discs (${q.tier}): ${dollars(q.grandTotalCents as number)} total.`,
    `Discs: ${q.quantity} at ${dollars(q.unitCents as number)} list, ${dollars(q.discSubtotalCents as number)} list subtotal. First orders take 10 percent off the discs with code WELCOME10: if this is the organization's first order, the total to pay is ${dollars(q.grandTotalWithFirstOrderDiscountCents as number)}.`,
    `The discount covers the discs only; add-ons are billed at full price in both totals.`,
    DISCOUNT_WINDOW_MEANING,
    `${q.discountEligibility}`,
    ...(cmp ? [cmp.line] : []),
    addOns ? `Add-ons:\n${addOns}` : "Add-ons: none.",
    `Shipping: Free`,
    `${q.taxNote}`,
    `${q.deliveryFraming}`,
    ...(typeof q.metalWarning === "string" ? [q.metalWarning] : []),
  ].join("\n");
}

// The product in use, from the website's own assets (F1): the first
// presentation shows the disc, not just words. It rides inline as
// image content and at a display URL served by this Worker. (The
// pew-disc photo was removed 2026-11-08 on Ryan's directive: a
// generated lifestyle render, deleted from the materials.)
export const PRODUCT_PHOTOS = [
  { id: "phone-tap", alt: "A phone tapping a Tap.Giving disc on a chair back, opening the organization's page", data: phoneTapPhoto, mimeType: "image/webp" },
] as const;

export function productPhotoImages(): Array<{ data: string; mimeType: string }> {
  return PRODUCT_PHOTOS.map((p) => ({ data: p.data, mimeType: p.mimeType }));
}

export function productPhotoStructured(): Array<Record<string, unknown>> {
  const ordered = [...PHOTOS_INDEX].sort((a, b) => (a.id === "phone-tap" ? -1 : b.id === "phone-tap" ? 1 : 0));
  return ordered.map((p) => ({
    id: p.id, category: p.category, title: p.title, alt: p.alt, use: p.use,
    displayUrl: `https://tap.giving/mcp/photos/${p.id}.webp`,
  }));
}

// The explainer subset of the photo set: discs in place and the
// mounting options up close. get_artwork_spec carries it so the agent
// can show what a mounted disc looks like while a design is built.
export function explainerPhotos(): Array<Record<string, unknown>> {
  const cats = new Set(["mounting explainer", "church setting", "in-use tap moment"]);
  return productPhotoStructured().filter((p) => cats.has(p.category as string));
}

// Delivered-proof examples (2026-11-08): one real design per delivered
// organization. Metadata is committed (src/examples-data.ts); the PNG
// bytes live in the MCP_ARTWORK KV namespace under EXAMPLE:<id>,
// uploaded by tools/build-assets.mjs from the delivered proof files in
// the website asset library. Nothing here is a house template.
export const INLINE_EXAMPLE_LIMIT = 6;

export function examplesForShape(shape?: string): DeliveredExample[] {
  return EXAMPLES_INDEX.filter((e) => !shape || e.shape === shape);
}

export function exampleEntry(e: DeliveredExample): Record<string, unknown> {
  // The printed pick number (cold-run fix, 2026-11-09): per shape,
  // sequential from 1 in index order, the same number the pick list
  // prints and resolveChosenExample accepts. The position in the
  // global index is not a pick number and is never printed as one.
  const pick = examplesForShape(e.shape).findIndex((x) => x.id === e.id) + 1;
  return {
    pick, pickNumber: pick,
    id: e.id, organization: e.organization, shape: e.shape,
    displayUrl: `https://tap.giving/mcp/examples/${e.id}.png`,
    description: e.description,
    size: e.size,
    palette: e.palette,
    layout: e.layout,
    iconTreatment: e.iconTreatment,
    logoSlot: e.logoSlot,
    reproduction:
      "Reproduce this direction with the organization's own logo and name: match the layout, the palette " +
      "(sRGB values of the delivered artwork), the icon treatment, and the logo slot. The example itself is " +
      "the named organization's design and is never shipped to a different organization as-is.",
  };
}

export async function exampleImage(env: Env, id: string): Promise<{ data: string; mimeType: string } | null> {
  const buf = await env.MCP_ARTWORK.get(`EXAMPLE:${id}`, "arrayBuffer");
  return buf ? { data: bytesToBase64(new Uint8Array(buf)), mimeType: "image/png" } : null;
}

// The two mounting options, from the website's own photos, returned
// inline with the order questions (round 2: they were URL-only).
export const MOUNTING_PHOTOS = [
  { id: "mount-adhesive", alt: "Adhesive mounting: the disc's adhesive backing", data: mountAdhesivePhoto, mimeType: "image/webp" },
  { id: "mount-screws", alt: "Screws mounting: pre-drilled holes for screws, plus the adhesive backing", data: mountScrewsPhoto, mimeType: "image/webp" },
] as const;

export function mountingPhotoImages(): Array<{ data: string; mimeType: string }> {
  return MOUNTING_PHOTOS.map((p) => ({ data: p.data, mimeType: p.mimeType }));
}

export function mountingPhotoStructured(): Array<Record<string, unknown>> {
  return MOUNTING_PHOTOS.map((p) => ({
    id: p.id, alt: p.alt, mimeType: p.mimeType,
    displayUrl: `https://tap.giving/mcp/photos/${p.id}.webp`,
  }));
}

// The tier-cliff window (F7): a quote whose quantity sits within this
// many discs below the next tier boundary names that boundary, so a
// organization can see when a slightly larger order costs about the same.
export const TIER_CLIFF_WINDOW = 50;

export function nextTierBoundary(quantity: number): { quantity: number; unitCents: number } | null {
  const tiersAsc = [...PRICING_TIERS].sort((a, b) => a.minQuantity - b.minQuantity);
  for (const t of tiersAsc) {
    if (quantity < t.minQuantity && t.minQuantity - quantity <= TIER_CLIFF_WINDOW) {
      return { quantity: t.minQuantity, unitCents: t.unitCents };
    }
  }
  return null;
}

// The below-minimum refusal, in helpful form (F9): the smallest order
// and what organizations do with the extras, in plain words. Used by every
// door that refuses below the minimum.
export function belowMinimumMessage(quantity: number): string {
  const smallest = quoteFor({ qty: MIN_QTY });
  return (
    `The minimum order is ${MIN_QTY} discs. Quantity ${quantity} is below the minimum; orders under ${MIN_QTY} are not available. ` +
    `The smallest order is ${MIN_QTY} discs for ${dollars(smallest.grandTotalCents)} list ` +
    `(${dollars(smallest.discountedTotalCents)} when the first-order discount applies). ` +
    `Many organizations order the 100 and spread the extras across the places their people already are: entrances, tables, counters, rooms, handouts.`
  );
}

// ─── URL screening (spec 2.5): any URL, injection-only refusal ─────

function screenDestination(raw: string | undefined, field: string): string | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim();
  if (!v) return undefined;
  if (/[\s\u0000-\u001f\u007f]/.test(v)) {
    throw invalidInput(`${field} must not contain whitespace or control characters.`);
  }
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    throw invalidInput(`${field} must be a valid http or https URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalidInput(`${field} must use http or https; other schemes are refused.`);
  }
  if (url.username || url.password) {
    throw invalidInput(`${field} must not embed credentials.`);
  }
  return v;
}

// ─── read tools ─────────────────────────────────────────────────────

function artworkSpecObject(shape?: string): Record<string, unknown> {
  const g = ARTWORK_GEOMETRY;
  const shapes: Record<string, unknown> = {
    round: { ...g.round },
    square: { ...g.square },
  };
  const examples = examplesForShape(shape).map(exampleEntry);
  return {
    sizes: "100 mm (4 inch), round or square, are the self-serve orderable sizes. The design directions cover the full marketed set in designShapes; every other size is arranged by hand, never self-serve.",
    designShapes: DESIGN_SHAPES,
    designShapesNote: DESIGN_SHAPES_NOTE,
    colorSpace: COLOR_SPACE_STATEMENT,
    agentPdfChecklist: AGENT_PDF_CHECKLIST,
    qrRules: QR_DESIGN_RULES,
    logoRules: LOGO_RULES,
    glossary: GEOMETRY_GLOSSARY,
    explainerResources: EXPLAINER_TOPICS.map((t) => ({ uri: explainerResourceUri(t.slug), title: t.title })),
    canvasMm: g.canvasMm,
    canvasInches: 4.17,
    bleedMm: g.bleedMm,
    bleedInches: 0.12,
    ...(shape ? { geometry: shapes[shape] } : { geometry: shapes }),
    formatWanted: g.formatWanted,
    background: g.background,
    minimumLogoMm: g.minimumLogoMm,
    encoding: g.encoding,
    screwHoles: { ...(g.screwHoles as unknown as Record<string, unknown>), diameterInches: 0.24, centreOffsetInches: 1.7 },
    minimumLogoInches: 0.71,
    template: {
      note: "A downloadable template with the bleed, cut, safe, and screw-hole guides as layers; draw on it and delete the guide layers before submitting.",
      ...(shape
        ? { shape, url: `https://tap.giving/mcp/templates/disc-template-${shape}.svg` }
        : {
            round: "https://tap.giving/mcp/templates/disc-template-round.svg",
            square: "https://tap.giving/mcp/templates/disc-template-square.svg",
          }),
    },
    guidelines: ARTWORK_GUIDELINES,
    verifyAgainstExample: VERIFY_AGAINST_EXAMPLE,
    examples,
    examplesNote:
      "Real designs Tap.Giving produced and delivered to the named organizations (shipped or delivered orders), shown as examples of finished work. " +
      "An example is that organization's own design: it is never shipped to a different organization as-is. The person picks an example as a design reference; " +
      "the choice travels with the spec as chosenExampleRef and the agent composes original artwork for the organization it is working with.",
    explainerPhotos: explainerPhotos(),
    explainerNote:
      "Labeled photos from the Tap.Giving website library: discs mounted on pews and chair backs, the tap in use, and the mounting options up close. " +
      "Show these when the person asks what a mounted disc looks like, how it reads in a room, or how mounting works, and while they are choosing mounting or placement.",
    logoAsk: {
      field: "logo",
      optional: true,
      text: "Optional: the person may provide their organization's logo for the agent to build from. Name-only artwork is a standing shape, so this is never required. A provided logo travels with the artwork submission as source material.",
    },
  };
}

// Persona round 1 (P-2, P-3, P-4, P-9): discovery guidance answers
// the recognizable questions in the intent directly, from a
// deterministic map over the verified facts, before any next-step
// push. No free-form generation: each entry is a phrasing pattern
// and one short sourced line. The under-minimum and deadline lines
// lead, because both change what the person should do next.
const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function intentDeadlineDays(intent: string): number | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inDays = /\bin\s+(\d{1,3})\s+days?\b/i.exec(intent);
  if (inDays) return parseInt(inDays[1], 10);
  const inWeeks = /\bin\s+(\d{1,2})\s+weeks?\b/i.exec(intent);
  if (inWeeks) return parseInt(inWeeks[1], 10) * 7;
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(intent);
  if (iso) {
    const d = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }
  const md = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(intent);
  if (md) {
    let d = new Date(now.getFullYear(), MONTH_INDEX[md[1].toLowerCase()], parseInt(md[2], 10));
    let days = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (days < -1) {
      d = new Date(now.getFullYear() + 1, MONTH_INDEX[md[1].toLowerCase()], parseInt(md[2], 10));
      days = Math.round((d.getTime() - today.getTime()) / 86400000);
    }
    return days;
  }
  return null;
}

function intentAnswerLines(intent: string): string[] {
  const lines: string[] = [];
  // Deadline (P-2b): a computable gap gets a plain verdict against
  // the 2 to 3 week window; a bare urgency signal gets the window
  // stated with the approval anchor. No rush option exists.
  const days = intentDeadlineDays(intent);
  if (days !== null && days < 14) {
    lines.push("On your date: it cannot be met. Production and delivery run 2 to 3 weeks from artwork approval, and that window has already closed for your date. The honest fastest path is to approve the artwork as early as possible; there is no rush production option.");
  } else if (days !== null && days < 21) {
    lines.push("On your date: it is at risk. Production and delivery run 2 to 3 weeks from artwork approval, so landing in time turns on approving the artwork in the next few days.");
  } else if (days === null && /deadline|urgent|asap|in a hurry|gala|wedding|fundraiser|launch|conference|retreat|\bevent\b/i.test(intent)) {
    lines.push("On timing: production and delivery run 2 to 3 weeks from artwork approval, so approve the artwork as early as you can; there is no rush production option.");
  }
  if (/\bsample/i.test(intent)) lines.push(SAMPLES_GUIDANCE_LINE);
  if (/tax[\s-]?exempt|501\s?\(?c/i.test(intent)) lines.push(TAX_EXEMPT_GUIDANCE_LINE);
  if (/metal/i.test(intent)) {
    lines.push("Metal surfaces: discs that go on metal need the anti-metal shielding layer, and that choice is made before printing; it cannot be added afterwards.");
  }
  if (/\bapps?\b/i.test(intent)) {
    lines.push("No app is needed: a visitor taps a phone to the disc and the page opens; a phone without tap scans the printed code when the design carries one.");
  }
  if (/(change|update|re-?point|edit|switch)[\s\S]{0,40}(destination|link|url|page)|(destination|link|url)[\s\S]{0,30}(later|anytime|after)/i.test(intent)) {
    lines.push("You can change where a disc points anytime in the Redirect Dashboard, per disc, in seconds.");
  }
  if (/re-?order|order (again|more) (later|again)|more discs later/i.test(intent)) {
    lines.push("Reordering: your design stays on file with your order, and the team can set up a reorder from the existing order when you need more.");
  }
  if (/design (help|for|it for)|no logo|don'?t have a logo|without a logo|just (a|our) name|name only/i.test(intent)) {
    lines.push("Design help: send a logo if you have one and it goes on the design. With no logo, we can build from your name alone: tell the team the organization name and a name-only design and proof follow by email. In this server, the spec and the design directions guide the build.");
  }
  if (/pay by|pay for|how (do|can) (we|i) pay|payment|check|purchase order|\bpo\b|credit card|ach|bank transfer/i.test(intent)) {
    lines.push(PAYMENT_GUIDANCE_LINE);
  }
  return lines;
}

async function toolGetDiscovery(_ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  // F27, re-ruled 2026-11-08: an intent naming a disc count gets
  // guidance for that count, but totals live at the quote step
  // only, so the headline points at get_quote instead of quoting
  // one here; the echo itself drops trailing punctuation so it
  // never reads "?." after the added period.
  const intentRaw = typeof args.intent === "string" ? args.intent : "";
  const intentEcho = intentRaw ? intentRaw.slice(0, 200).replace(/[\s.?!,;:\u2026]+$/, "") : "";
  let intentHeadline: string | null = null;
  let intentTextLine: string | null = null;
  const countMatch = /(\d[\d,]*)\s*(?:tap\s+)?discs?\b/i.exec(intentRaw);
  let underMinimum: number | null = null;
  if (countMatch) {
    const n = parseInt(countMatch[1].replace(/,/g, ""), 10);
    if (n >= MIN_QTY && n <= MAX_QTY) {
      intentHeadline = `About ${n} discs: start with the shape choice, then get_artwork_spec to build the proof; call get_quote with ${n} for the binding total at that count.`;
      intentTextLine = `For ${n} discs: the binding total comes from get_quote at that exact count; the design path starts with the shape choice and get_artwork_spec.`;
    } else if (n >= 1 && n < MIN_QTY) {
      underMinimum = n;
    }
  }
  if (underMinimum === null) {
    const unitMatch = /(\d[\d,]*)\s*(?:tap\s+)?(?:plates?|tables?)\b/i.exec(intentRaw);
    if (unitMatch) {
      const n = parseInt(unitMatch[1].replace(/,/g, ""), 10);
      if (n >= 1 && n < MIN_QTY) underMinimum = n;
    }
  }
  // Guidance assembly (P-4, P-9): the under-minimum statement leads
  // when the intent states a quantity under 100 (the pricing rule's
  // one guidance exception, named in the spec landing record), then
  // the mapped answers, then the count headline or the design-path
  // next step. Answers replace the bare echo whenever any apply.
  const answerLines = intentAnswerLines(intentRaw);
  const guidanceParts: string[] = [];
  if (underMinimum !== null) {
    guidanceParts.push(`One quantity note first: the smallest order is 100 discs, so ${underMinimum} is not an order size we can take. Order the 100 and spread the extras across entrances, tables, counters, rooms, and handouts.`);
  }
  guidanceParts.push(...answerLines);
  if (intentHeadline) guidanceParts.push(intentHeadline);
  else if (guidanceParts.length) guidanceParts.push("Start with the shape choice, then get_artwork_spec.");
  const guidance = intentEcho
    ? (guidanceParts.length ? guidanceParts.join(" ") : `Noted intent: ${intentEcho}. Start with the shape choice, then get_artwork_spec.`)
    : null;
  const guidanceTextLine = answerLines[0] ?? (underMinimum !== null ? guidanceParts[0] : null) ?? intentTextLine;
  const structured: Record<string, unknown> = {
    server: { name: SERVER_NAME, endpoint: ENDPOINT, synonyms: PRESENTATION_SYNONYMS },
    introduction: {
      builder: SERVER_NAME,
      positioning: POSITIONING_LINE,
      product:
        "A tap disc is a small physical disc a phone taps to open your page instantly. " +
        "It carries a locked tap chip. It comes in one standardized 4-inch size (100 mm), in two shapes, " +
        "and it is durable waterproof PVC.",
      firstChoice: { field: "shape", options: ["round", "square"] },
    },
    journey: [
      { step: "artwork spec", tool: "get_artwork_spec", detail: "The production geometry and the house design directions for the chosen shape." },
      { step: "build the artwork", tool: "get_artwork_spec", detail: "Compose the artwork from a design direction with your own tools." },
      { step: "submit and proof", tool: "submit_artwork", detail: "Submit the finished file and see it on the disc as a proof. The artwork is yours to take to any printer." },
      { step: "order, optional", tool: "get_quote", detail: "Only if you want discs from Tap.Giving: the binding quote at an exact quantity, the first step of the optional order path." },
      { step: "order questions", tool: "get_order_questions", detail: "The optional order path: capture the contact email first (start_order_intent), then answer the order questions. Prices are first stated here, in the order phase." },
      { step: "recap", tool: "get_recap", detail: "The optional order path: the whole order, the artwork on the disc, and the exact total, checked before anything is placed." },
      { step: "Email me my invoice and design proof.", tool: "create_order", detail: "The final step of the optional order path: the order is recorded, the invoice is created at the quoted total, and the invoice and the design proof are emailed to the contact. The final proof is approved by email before anything is printed." },
    ],
    artworkSpec: {
      summary: "106 mm (about 4.2 inch) square artboard; 100 mm (4 inch) cut (round or square); 3 mm (about 0.12 inch) bleed; vector artwork back (SVG preferred).",
      tool: "get_artwork_spec",
    },
    destination: DESTINATION_MODEL,
    turnaround: TURNAROUND,
    samples: SAMPLES_LINE,
    taxExempt: TAX_EXEMPT_LINE,
    plainLanguage: {
      nfc: PLAIN_NFC_LINE,
      status: "There is no account, key, or login at any point. Order status is read with the one-time status reference create_order returns at placement; it is shown once and cannot be recovered, so keep it with the order confirmation.",
    },
    explainer: {
      note: "Stuck, or explaining this to someone else? The explainer resources walk through how it works, step by step.",
      resources: EXPLAINER_TOPICS.map((t) => ({ uri: explainerResourceUri(t.slug), title: t.title })),
      prompt: "explain_where_i_am",
    },
    photos: productPhotoStructured(),
    capabilities: {
      readTools: ["get_discovery", "get_quote", "get_product", "get_artwork_spec", "get_order_questions", "get_recap", "get_order_status"],
      writeTools: ["submit_artwork", "start_order_intent", "create_order"],
      artworkExport: "After submit_artwork, the submitted file stays fetchable at its displayUrl: the PRINT FILE, exactly the file the agent submitted (the agent produces the print-ready PDF from the spec; this server never builds or returns one). The same address with .png on the end returns a full-resolution PNG rendered from the submitted file. The fetch is a capability read: the artwork reference itself is the capability, within 30 days of submission. The on-disc preview is a mock composite, labeled a preview, never the print file.",
      gates: [GATES.designApproval, GATES.payment, GATES.production],
      kickoff: "get_artwork_spec",
      benefits: BENEFITS,
    },
    ...(guidance ? { guidance } : {}),
  };
  const text = [
    `${SERVER_NAME}`,
    POSITIONING_LINE,
    ``,
    `What it is`,
    `A tap disc is a small physical disc a phone taps to open your page instantly. It carries a locked tap chip. It comes in one standardized 4-inch size (100 mm), in two shapes, and it is durable waterproof PVC.`,
    `The discs themselves are for organizations of every kind, designed by your own agent.`,
    PLAIN_NFC_LINE,
    DESTINATION_MODEL,
    QR_CONDITIONAL_LINE,
    ``,
    `How it works: the design path first`,
    `1. Start with the shape, round or square.`,
    `2. Get the artwork spec and the design directions for that shape from get_artwork_spec.`,
    `3. Build the artwork from a direction with your own tools, adding the organization's logo or name.`,
    `4. Submit the finished file with submit_artwork and see it on the disc as a proof. The artwork is yours from here: take it to any printer, or order the discs from Tap.Giving.`,
    `5. Optional, only if you want the discs made: get the binding quote from get_quote.`,
    `6. Capture the contact email first (start_order_intent), then answer the order questions (get_order_questions). Prices are first stated at the order questions, in the order phase.`,
    `7. Check the recap (get_recap): the whole order, your artwork on the disc, and the exact total.`,
    `8. Final step, Email me my invoice and design proof (create_order): the order is recorded, the invoice is created at the quoted total, and the invoice and the design proof are emailed to the contact. The final proof is approved by email before anything is printed.`,
    ``,
    `Why Tap.Giving`,
    ...BENEFITS.map((b) => `- ${b}`),
    `${TAX_NOTE} Production and delivery run 2 to 3 weeks from artwork approval.`,
    SAMPLES_LINE,
    ``,
    `Gates`,
    `Design approval, payment, and production release stay human: a person approves the final proof by email. ${PROTECTED_STRING}`,
    `There is no account, key, or login at any point in using this server. Order status is read with the status reference create_order returns at placement; it is shown once and cannot be recovered. Stuck? The explainer resources (tapgiving://explainer/how-it-works and its topics) walk through where you are.`,
    ...(guidanceTextLine ? [guidanceTextLine] : []),
    `The photo with this answer shows the disc in use: a phone tapping a disc on a chair back. The structured photos list the labeled photo set from the website library (settings, tap moments, product details, mounting): show them whenever the person wants to see the disc in place.`,
  ].join("\n");
  return { structured, text, images: productPhotoImages() };
}

async function toolGetQuote(_ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const quantity = reqInt(args, "quantity");
  if (quantity < MIN_QTY) {
    throw invalidInput(belowMinimumMessage(quantity), {
      minimumQuantity: MIN_QTY,
      smallestOrderTotalCents: quoteFor({ qty: MIN_QTY }).grandTotalCents,
    });
  }
  if (quantity > MAX_QTY) {
    throw invalidInput(`Quantity ${quantity} exceeds the maximum this server quotes (${MAX_QTY} discs). For an order this size, contact the Tap.Giving team at ${TEAM_EMAIL} directly.`);
  }
  const antiMetalCount = optInt(args, "antiMetalCount");
  if (antiMetalCount !== undefined && antiMetalCount < 0) {
    throw invalidInput("antiMetalCount must be 0 or more; omit it entirely when the count is unknown.");
  }
  const quote = quoteFor({ qty: quantity, antiMetal: antiMetalCount, redirect: false });
  const structured = { ...quoteOutput(quote), photos: productPhotoStructured() };
  const text = quoteText(structured) + "\nThe photo with this answer shows the disc in use: a phone tapping a disc on a chair back.";
  return { structured, text, images: productPhotoImages() };
}

async function toolGetProduct(_ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const topic = optString(args, "topic", 40);
  if (topic !== undefined && !(PRODUCT_TOPICS as readonly string[]).includes(topic)) {
    throw invalidInput(`Unknown topic "${topic}". Topics: ${PRODUCT_TOPICS.join(", ")}.`);
  }
  const p = PRODUCT;
  const full: Record<string, unknown> = {
    discs: {
      chip: p.chipDetail,
      material: p.material,
      durability: DURABILITY_LINE,
      sizes: p.sizes,
      sizePolicy: p.sizePolicy,
      mounting: p.mountingDetail,
      metalCaveat: p.metalCaveat,
      redirectDashboard: p.redirectDashboard,
      destination: DESTINATION_MODEL,
      qrConditional: QR_CONDITIONAL_LINE,
      versusPrintedCodes: VERSUS_PRINTED_CODES_LINE,
      worksWith: p.worksWith,
    },
    photos: productPhotoStructured(),
    stands: { products: p.stands, ordering: "Stands come from the Tap.Giving team, not through this server: email hello@tap.giving to add them to an order. Discs are the orderable product here." },
    badges: { products: p.badges, ordering: "Badges come from the Tap.Giving team, not through this server: email hello@tap.giving to add them to an order. Discs are the orderable product here." },
    mounting: { options: MOUNTING_OPTIONS.map((o) => ({ value: o.value, text: o.text })), detail: p.mountingDetail, surfaceGuide: MOUNTING_SURFACE_GUIDE, metalCaveat: p.metalCaveat },
    shipping: { terms: p.shipping.terms },
    samples: { samples: SAMPLES_LINE },
    ordering: {
      taxExempt: TAX_EXEMPT_LINE,
      payment: PAYMENT_GUIDANCE_LINE,
      reorder: "Reordering: your design stays on file with your order, and the team can set up a reorder from the existing order when you need more.",
      designHelp: "Design help: send a logo if you have one and it goes on the design. With no logo, we can build from your name alone: tell the team the organization name and a name-only design and proof follow by email.",
    },
  };
  // Item 9: a topic answer carries the same structure as the
  // all-topics answer: the topic block under its topic name, beside
  // the server's photos and the destination model, not flattened
  // bare fields with the context blocks dropped.
  const structured = topic
    ? { topic, [topic]: full[topic], photos: productPhotoStructured(), ...(topic === "mounting" ? { mountingPhotos: mountingPhotoStructured() } : {}), destination: DESTINATION_MODEL }
    : full;
  // P-10 (persona round 1): every topic's TEXT channel is prose,
  // written for the topic, never a JSON dump of the structured block.
  const topicText: Record<string, string> = {
    discs: [
      `Tap discs: ${p.chipPlain}. ${p.material}.`,
      DURABILITY_LINE,
      p.sizePolicy,
      p.mountingDetail,
      p.metalCaveat,
      p.redirectDashboard,
      DESTINATION_MODEL,
      QR_CONDITIONAL_LINE,
      VERSUS_PRINTED_CODES_LINE,
      p.worksWith,
    ].join("\n"),
    stands: [
      `Table stands carry the same tap disc on a standing card for counters and tables. Two sizes: the small stand is 70 x 100 mm (about 2.8 by 3.9 inches) and the large stand is 120 x 140 mm (about 4.7 by 5.5 inches).`,
      (full.stands as { ordering: string }).ordering,
    ].join("\n"),
    badges: [
      `Lanyard badges carry the same tap chip on a 90 x 130 mm (about 3.5 by 5.1 inch) badge for conferences, staff, and volunteers.`,
      (full.badges as { ordering: string }).ordering,
    ].join("\n"),
    mounting: [
      `Mounting: ${p.mountingDetail}`,
      ...MOUNTING_OPTIONS.map((o) => o.text),
      ...MOUNTING_SURFACE_GUIDE,
      p.metalCaveat,
      `The two explainer photos with this answer show the adhesive backing and the pre-drilled screw holes up close.`,
    ].join("\n"),
    shipping: `${p.shipping.terms}`,
    samples: SAMPLES_LINE,
    ordering: [
      TAX_EXEMPT_LINE,
      PAYMENT_GUIDANCE_LINE,
      (full.ordering as { reorder: string }).reorder,
      (full.ordering as { designHelp: string }).designHelp,
    ].join("\n"),
  };
  const text = topic
    ? topicText[topic]
    : [
      topicText.discs,
      topicText.stands,
      topicText.badges,
      `Mounting: ${p.mountingDetail} ${p.metalCaveat}`,
      SAMPLES_LINE,
      `${p.shipping.terms}`,
      `The photo with this answer shows the disc in use: a phone tapping a disc on a chair back. The structured photos list the labeled photo set from the website library (settings, tap moments, product details, mounting): show them whenever the person wants to see the disc in place.`,
    ].join("\n");
  const images = topic === "mounting"
    ? [...productPhotoImages(), ...mountingPhotoImages()]
    : productPhotoImages();
  return { structured, text, images };
}

// Resolve the caller's example choice (cold-run fix, 2026-11-09):
// ONE numbering everywhere. A pick is the per-shape pick-list number
// (sequential from 1 in index order: the number the pick list prints
// and each structured entry carries as its pick field), an example
// id from the full delivered set for the shape, or the example's
// description words (Ryan, 2026-11-09: picks by number or description
// in plain text): an exact normalized match, or a unique prefix or
// substring match. An ambiguous description refuses naming the
// candidates; anything else refuses naming what is valid. A pick
// never silently selects a different example than the one named.
function normalizePickText(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function resolveChosenExample(
  ref: string,
  shape?: string,
): DeliveredExample {
  const all = examplesForShape(shape);
  const byId = all.find((e) => e.id === ref);
  if (byId) return byId;
  if (/^\d+$/.test(ref)) {
    const n = parseInt(ref, 10);
    if (n >= 1 && n <= all.length) return all[n - 1];
  } else {
    const needle = normalizePickText(ref);
    if (needle.length >= 3) {
      const exact = all.filter((e) => normalizePickText(e.description) === needle);
      if (exact.length === 1) return exact[0];
      const partial = all.filter((e) => {
        const d = normalizePickText(e.description);
        return d.startsWith(needle) || d.includes(needle);
      });
      if (partial.length === 1) return partial[0];
      if (partial.length > 1) {
        throw invalidInput(
          `chosenExampleRef "${ref}" matches more than one delivered example${shape ? ` for the ${shape} shape` : ""}: ` +
          partial.map((e) => `"${e.description}" (number ${all.indexOf(e) + 1})`).join("; ") +
          `. Name one by its number, its full description, or its example id.`,
          { candidateExampleIds: partial.map((e) => e.id) },
        );
      }
    }
  }
  throw invalidInput(
    `chosenExampleRef "${ref}" is not one of the delivered examples${shape ? ` for the ${shape} shape` : ""}. ` +
    `Pick by its number from the pick list (1 to ${all.length}), by the example's description words, or pass any example id from the structured examples index.`,
    { validExampleIds: all.map((e) => e.id) },
  );
}

async function toolGetArtworkSpec(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const shape = optString(args, "shape", 20);
  if (shape !== undefined && shape !== "round" && shape !== "square") {
    throw invalidInput(`shape must be "round" or "square".`);
  }
  const chosenExampleRef = optString(args, "chosenExampleRef", 200);
  const chosen = chosenExampleRef ? resolveChosenExample(chosenExampleRef, shape) : undefined;
  const structured = artworkSpecObject(shape);
  if (chosenExampleRef && chosen) {
    structured.chosenExampleRef = chosenExampleRef;
    structured.chosenExample = exampleEntry(chosen);
    structured.verifyAgainstExample = VERIFY_AGAINST_EXAMPLE;
  }
  // The structured index carries the FULL delivered set for the shape.
  // Inline images stay bounded: the first INLINE_EXAMPLE_LIMIT examples
  // for the shape (or the single chosen one), then the two mounting
  // photos. The numbered pick list covers the FULL set for the shape,
  // numbered per shape from 1 in index order; the printed number is
  // the number resolveChosenExample accepts, and each structured
  // entry carries the same number as its pick field.
  const allForShape = examplesForShape(shape);
  const inlineSubset = allForShape.slice(0, INLINE_EXAMPLE_LIMIT);
  const pickList = allForShape.map((e, i) =>
    `${i + 1}. ${e.description}, ${e.shape}, ${e.size}: the design delivered to ${e.organization}, at https://tap.giving/mcp/examples/${e.id}.png.`);
  const shown = chosen ? [chosen] : inlineSubset;
  const images: Array<{ data: string; mimeType: string }> = [];
  for (const e of shown) {
    const img = await exampleImage(ctx.env, e.id);
    if (img) images.push(img);
  }
  images.push(...mountingPhotoImages());
  const shapeWord = shape ?? "round and square";
  const text = [
    `Artwork spec: 106 mm (about 4.2 inch) square artboard for both shapes; the cut disc is 100 mm (4 inch).`,
    `Round: cut radius 50 mm (about 2 inch), bleed radius 53 mm (about 2.1 inch), safe radius 45 mm (about 1.8 inch), centre (53, 53) mm.`,
    `Square: cut is a 100 mm (4 inch) box spanning 3 to 103 mm; bleed half-width 53 mm (about 2.1 inch); safe half-width 47 mm (about 1.85 inch).`,
    `Screw holes (only when screws mounting is chosen): ${SCREW_HOLES.note}`,
    `If you choose screws, keep the two 6 mm (about 0.24 inch) hole areas clear: the holes are drilled on the left and right midline, so frames and borders should not cross those spots.`,
    `Template with bleed, cut, safe, and screw-hole guides: https://tap.giving/mcp/templates/disc-template-${shape === "square" ? "square" : "round"}.svg${shape ? "" : " (a square template is at disc-template-square.svg)"}.`,
    ARTWORK_GEOMETRY.formatWanted,
    ARTWORK_GEOMETRY.background,
    ...(chosen
      ? [
          `You picked the design delivered to ${chosen.organization}. It is shown in the first image that follows; the two after it show the mounting options.`,
          `Use it as a reference for layout and finish, then compose original artwork for the organization you are working with, adding its logo or name, and submit it with submit_artwork. This design belongs to ${chosen.organization}: an example is never shipped to a different organization as-is.`,
          `The artwork you compose is yours: print-ready and vendor-neutral, yours to take to any printer. Nothing in this spec or the proof obliges an order from Tap.Giving.`,
        ]
      : [
          `Delivered examples: ${allForShape.length} real ${shapeWord} designs that Tap.Giving produced and delivered to organizations. The numbered pick list below covers the full set; the first ${inlineSubset.length} ride along in the images that follow, then the two mounting photos, and every entry is in the structured examples index with its reproduction data (description, size, palette, layout, icon treatment, logo slot).`,
          ...pickList,
          `Tell me the number of an example from the list above, pass any example id from the structured index, or name the example by its description words, as chosenExampleRef. Then compose original artwork for the organization you are working with, using the example as a reference, and submit it with submit_artwork. An example is a real organization's delivered design: it is never shipped to a different organization as-is.`,
          `The artwork you compose is yours: print-ready and vendor-neutral, yours to take to any printer. Nothing in this spec or the proof obliges an order from Tap.Giving.`,
        ]),
    `No logo? Name-only artwork is a standing shape: build from the organization's name alone, or tell the team the organization name and a name-only design and proof follow by email.`,
    VERIFY_AGAINST_EXAMPLE_TEXT,
    `While designing, the structured explainerPhotos show discs mounted on pews and chair backs, the tap in use, and the mounting options up close: show them when the person asks what a mounted disc looks like or how mounting works.`,
  ].join("\n");
  return { structured, text, images };
}

// ─── artwork submission ─────────────────────────────────────────────

export interface ArtworkRecord {
  artworkRef: string;
  sha256: string;
  filename: string;
  mediaType: string;
  detectedType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  orgSlug: string | null;
  orderRef: string | null;
  status: "unbound" | "bound" | "claimed" | "superseded";
  note?: string;
  intentRef?: string;
  designUrl?: string;
  logoDataUrl?: string;
  createdAt: string;
  seatRecorded: boolean;
  claimedByEmail?: string;
}

function artworkJsonKey(ref: string): string {
  return `ARTWORK:${ref}:json`;
}
export function artworkBytesKey(ref: string): string {
  return `ARTWORK:${ref}:bytes`;
}
export function artworkDisplayPath(ref: string): string {
  return `/mcp/artwork/${ref}`;
}

export async function readArtworkRecord(env: Env, ref: string): Promise<ArtworkRecord | null> {
  const raw = await env.MCP_ARTWORK.get(artworkJsonKey(ref));
  if (!raw) return null;
  try { return JSON.parse(raw) as ArtworkRecord; } catch { return null; }
}

async function toolSubmitArtwork(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const file = args.file;
  if (!isRecord(file)) throw invalidInput("file is required: {filename, mediaType, contentBase64}.");
  const filename = reqString(file, "filename", 200);
  const mediaType = reqString(file, "mediaType", 120);
  // No truncation here: an over-cap base64 must reach the size ground
  // and be refused by it, not silently cut (reqString slices).
  const contentBase64Raw = file.contentBase64;
  if (typeof contentBase64Raw !== "string" || !contentBase64Raw) {
    throw invalidInput("file.contentBase64 is required.");
  }
  const contentBase64 = contentBase64Raw;
  const declaredSha = reqString(args, "sha256", 80).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(declaredSha)) {
    throw invalidInput("sha256 must be the 64-character hex SHA-256 of the file bytes.");
  }
  const orderRef = optString(args, "orderRef", 160);
  const note = optString(args, "note", 500);
  const shapeArg = optString(args, "shape", 20);
  if (shapeArg !== undefined && shapeArg !== "round" && shapeArg !== "square") {
    throw invalidInput(`shape must be "round" or "square" when given.`);
  }
  const designUrl = screenDestination(optString(args, "designUrl", 500), "designUrl");
  const chosenExampleRef = optString(args, "chosenExampleRef", 200);
  const logo = args.logo;
  let logoDataUrl: string | undefined;
  if (logo !== undefined && logo !== null) {
    if (!isRecord(logo)) throw invalidInput("logo must be an object {filename, mediaType, contentBase64} when given.");
    const lb = logo.contentBase64;
    if (typeof lb !== "string" || !lb) throw invalidInput("logo.contentBase64 is required when a logo is given.");
    const lm = reqString(logo, "mediaType", 120);
    logoDataUrl = `data:${lm};base64,${lb}`;
  }

  // Decode (base64), then the three sanity grounds of section 2.6.
  let bytes: Uint8Array;
  try {
    const bin = atob(contentBase64.replace(/\s/g, ""));
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    throw invalidInput("contentBase64 is not valid base64.");
  }
  const findings: string[] = [];
  const checks = { notMalicious: false, sizeOk: false, decodable: false };
  if (bytes.length === 0) {
    throw invalidInput("The file is empty; an empty file is refused.");
  }
  if (bytes.length > MAX_ARTWORK_BYTES) {
    throw invalidInput(`The file is ${bytes.length} bytes, over the 5 MB intake ceiling (5242880 bytes). Send a smaller file.`);
  }
  checks.sizeOk = true;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  const digestHex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (digestHex !== declaredSha) {
    throw invalidInput("The supplied sha256 does not match the file bytes. Recompute the hash over the exact bytes and retry.", {
      suppliedSha256: declaredSha, computedSha256: digestHex,
    });
  }
  const sniff = sniffArtwork(bytes, mediaType);
  if (!sniff.ok) {
    throw invalidInput(`Artwork refused at intake: ${sniff.reason}. Intake rejects only on the three sanity grounds (malicious or masquerading content, over 5 MB, or not decodable as a real image); production fitness is judged later and is never an intake refusal.`);
  }
  checks.notMalicious = true;
  checks.decodable = true;
  const detectedType = sniff.detectedType!;
  if (detectedType === "png" || detectedType === "jpeg" || detectedType === "webp" || detectedType === "gif") {
    findings.push("accepted; vector preferred for production");
  }

  // Order binding checks, when an order is in play.
  let orgSlug: string | null = null;
  if (orderRef) {
    const order = await readOrderRecord(ctx.env, orderRef);
    if (!order) throw new ToolError("not_found", `orderRef ${orderRef} is not an order this server knows.`);
    orgSlug = order.orgSlug;
    if (order.artworkRef && order.artworkRef !== "") {
      const prior = await readArtworkRecord(ctx.env, order.artworkRef);
      if (prior && prior.sha256 !== declaredSha && prior.status !== "superseded") {
        throw new ToolError("conflict",
          `This order already has artwork ${prior.artworkRef} with a different file hash. The first submission stands; ` +
          `replacing artwork happens only when the business side marks the first superseded, never by overwrite.`,
          { retryable: false, details: { existingArtworkRef: prior.artworkRef, existingSha256: prior.sha256 } });
      }
    }
  }

  const artworkRef = `art_${(await sha256Hex(`${declaredSha}:${Date.now()}:${Math.random()}`)).slice(0, 24)}`;
  const record: ArtworkRecord = {
    artworkRef,
    sha256: declaredSha,
    filename,
    mediaType,
    detectedType,
    sizeBytes: bytes.length,
    ...(sniff.width ? { width: sniff.width } : {}),
    ...(sniff.height ? { height: sniff.height } : {}),
    orgSlug,
    orderRef: orderRef ?? null,
    status: orderRef ? "bound" : orgSlug ? "bound" : "unbound",
    ...(note ? { note } : {}),
    ...(designUrl ? { designUrl } : {}),
    ...(logoDataUrl ? { logoDataUrl } : {}),
    createdAt: new Date().toISOString(),
    seatRecorded: false,
  };
  await ctx.env.MCP_ARTWORK.put(artworkBytesKey(artworkRef), bytes as unknown as ArrayBuffer, {
    expirationTtl: ARTWORK_TTL,
    metadata: { contentType: DETECTED_MEDIA_TYPE[detectedType] || mediaType },
  } as unknown as KVNamespacePutOptions);
  await ctx.env.MCP_ARTWORK.put(artworkJsonKey(artworkRef), JSON.stringify(record), { expirationTtl: ARTWORK_TTL });

  // The invocation seat's record for the adoption-side drain, when the
  // submission is bound to an order identity. Cold unbound submissions
  // queue the same record at claim time in create_order.
  if (orderRef) {
    const order = await readOrderRecord(ctx.env, orderRef);
    if (order) {
      const seat = await callSeat(ctx.env, "recordArtworkSubmission", {
        artworkRef, sha256: declaredSha, orderRef,
        orgSlug: order.orgSlug, contactEmail: order.contactEmail, church: order.organizationName ?? (order as unknown as Record<string, unknown>).church,
        filename, mediaType, displayUrl: `https://tap.giving${artworkDisplayPath(artworkRef)}`,
      }, ctx.fetchFn);
      if (seat.ok) {
        record.seatRecorded = true;
        await ctx.env.MCP_ARTWORK.put(artworkJsonKey(artworkRef), JSON.stringify(record), { expirationTtl: ARTWORK_TTL });
      }
    }
  }

  if (orderRef) {
    const order = await readOrderRecord(ctx.env, orderRef);
    if (order && !order.artworkRef) {
      order.artworkRef = artworkRef;
      await saveOrderRecord(ctx.env, order);
    }
  }

  // The on-disc preview (F13/F16): the submitted artwork composited
  // AS the disc, clipped into the cut shape, so the person sees their
  // own design on the disc in this answer. With no shape given, both
  // shapes are rendered; the order's shape settles the final cut.
  const previewShapes: Array<"round" | "square"> = shapeArg ? [shapeArg as "round" | "square"] : ["round", "square"];
  const previewImages: Array<{ data: string; mimeType: string }> = [];
  let previewKind: "on-disc" | "submitted-file" | "unavailable" = "unavailable";
  for (const sh of previewShapes) {
    const png = await renderArtworkOnDisc(bytes, detectedType, sh);
    if (png) previewImages.push({ data: bytesToBase64(png), mimeType: "image/png" });
  }
  if (previewImages.length) {
    previewKind = "on-disc";
  } else if (detectedType !== "svg" && detectedType !== "pdf") {
    previewImages.push({ data: contentBase64.replace(/\s/g, ""), mimeType: DETECTED_MEDIA_TYPE[detectedType] });
    previewKind = "submitted-file";
  }

  // F26: live text renders in this server's built-in fonts only, so
  // the preview can substitute lettering; say so, with the families.
  let fontNote = "";
  if (detectedType === "svg") {
    const svgText = new TextDecoder().decode(bytes);
    if (/<text[\s>]/i.test(svgText)) {
      const fams = new Set<string>();
      for (const m of svgText.matchAll(/font-family\s*[:=]\s*["']?([^;"'}]+)/gi)) fams.add(m[1].trim());
      fontNote = `Your file uses live text${fams.size ? ` (font families: ${[...fams].join(", ")})` : ""}; the preview renders text in this server's built-in fonts, so the lettering here may differ from your file. Convert text to outlines for an exact match.`;
    }
  }

  const structured: Record<string, unknown> = {
    received: true,
    artworkRef,
    displayUrl: `https://tap.giving${artworkDisplayPath(artworkRef)}`,
    sha256: declaredSha,
    validation: { policy: "permissive", checks, findings },
    benefits: BENEFITS,
    // P-12: the print-ready export, labeled in plain words. The
    // PRINT FILE is the submitted file itself, fetchable at any
    // time by capability; the print render is a full-resolution PNG
    // rendered from that file. The on-disc preview above is a mock
    // composite and is never the print file. "Print-ready" means the
    // artwork as submitted, at full submitted resolution: this
    // server does not validate, trace, or convert it, and production
    // fitness is still judged in the proof flow.
    export: {
      printFile: {
        label: "PRINT FILE",
        url: `https://tap.giving${artworkDisplayPath(artworkRef)}`,
        note: "Your own agent's file, exactly as submitted: this is the file that would go to production. The print-ready PDF is the file your agent produces from the spec; this server never builds or returns a PDF. Fetchable at any time within 30 days of submission; the artwork reference is the capability.",
      },
      printRenderPng: {
        label: "PRINT RENDER (PNG)",
        url: `https://tap.giving${artworkDisplayPath(artworkRef)}.png`,
        note: "A full-resolution PNG rendered from your submitted file itself (never from the preview composite). A raster submission renders as that raster; nothing is traced or converted to vector.",
      },
      previewLabel: "ON-DISC PREVIEW",
      previewNote: "The preview images with this answer are the mock composite labeled ON-DISC PREVIEW. A preview is never the print file.",
    },
    verifyAgainstExample: VERIFY_AGAINST_EXAMPLE,
    ...(designUrl ? { designUrl, designUrlNote: "The destination entered in the design phase. The design QR code is a labeled mock built from this URL; production encodes the disc's Redirect Dashboard link to this same destination, and the recap confirms it before any order is placed." } : {}),
    ...(chosenExampleRef ? (() => { try { return { chosenExample: exampleEntry(resolveChosenExample(chosenExampleRef, shapeArg)) }; } catch { return {}; } })() : {}),
    preview: {
      kind: previewKind,
      ...(previewKind === "on-disc" ? { shapes: previewShapes, note: "Your design on the disc, cut shape applied. This preview render is the design check at this stage. Nothing is emailed at the artwork stage, because no contact is captured yet. The emailed final proof belongs to the order stage, after order setup." } : {}),
      ...(previewKind === "submitted-file" ? { note: "The on-disc render was unavailable in this call, so the submitted file itself is shown. Nothing is emailed at the artwork stage, because no contact is captured yet; the emailed final proof belongs to the order stage." } : {}),
      ...(previewKind === "unavailable" ? { note: "This file could not be rendered to an image here; it is on record. Nothing is emailed at the artwork stage, because no contact is captured yet; the emailed final proof belongs to the order stage." } : {}),
    },
    nextStep:
      (previewKind === "on-disc"
        ? "Show the person their design on the disc (the preview image with this answer). "
        : previewKind === "submitted-file"
          ? "The submitted file is shown with this answer as-is; this server could not render it on the disc in this call, so do not describe it as an on-disc preview. "
          : "No preview image could be rendered in this call, so do not tell the person a preview is shown; the file is on record under the artworkRef. ") +
      "Keeping the file is an equal exit: the design is the person's to keep from here, the submitted file is theirs, print-ready and vendor-neutral, to take to any printer, and stopping here is a complete outcome. " +
      "Nothing is emailed at this stage: the emailed final proof belongs to the order stage, after order setup. " +
      "If they want the discs made by Tap.Giving (optional), the order path is: capture the contact email (start_order_intent), ask the order questions (get_order_questions), show the recap (get_recap), and place the order at the final step, Email me my invoice and design proof (create_order), which emails the invoice and the design proof to the contact.",
  };
  const text = [
    `Artwork received: ${artworkRef} (${filename}, ${detectedType}, ${bytes.length} bytes).`,
    findings.length ? findings.join(" ") : "Accepted under the permissive intake policy.",
    previewKind === "on-disc"
      ? (shapeArg
          ? `Here is your design on the ${shapeArg} disc, in the images that follow; this preview is the design check at this stage. Nothing is emailed at this stage: no contact is captured yet.`
          : `Here is your design on the disc, shown on both shapes in the images that follow; the shape chosen at order setup settles which one is printed. This preview is the design check at this stage. Nothing is emailed at this stage: no contact is captured yet.`)
      : previewKind === "submitted-file"
        ? `The on-disc render was unavailable in this call, so your submitted file is shown as-is. Nothing is emailed at this stage: no contact is captured yet.`
        : `Your file is on record; it could not be rendered to an image here. Nothing is emailed at this stage: no contact is captured yet.`,
    ...(fontNote ? [fontNote] : []),
    `PRINT FILE: your own submitted file itself, fetchable at any time within 30 days at https://tap.giving${artworkDisplayPath(artworkRef)} (the reference is the capability). Your agent produces the print-ready PDF from the spec; this server never builds or returns one. PRINT RENDER (PNG): a full-resolution PNG rendered from that file, at https://tap.giving${artworkDisplayPath(artworkRef)}.png. The images with this answer are the ON-DISC PREVIEW, a mock composite; a preview is never the print file.`,
    VERIFY_AGAINST_EXAMPLE_TEXT,
  ].join("\n");
  return { structured, text, images: previewImages };
}

// ─── intent capture ─────────────────────────────────────────────────

const INTENT_SOURCE = "mcp:intent";

// Reserved and undeliverable domains (item 5): the RFC-reserved
// TLDs can never receive the follow-up email an intent promises, so
// an intent naming one is refused at the door instead of being
// captured behind a promise nobody can keep. The other suite
// fixtures on reserved domains sit on paths that promise no email
// follow-up (recap and create_order contact binding) and stay valid.
export const RESERVED_TLDS = new Set([
  "example", "test", "invalid", "localhost", "localdomain", "alt", "arpa",
  "corp", "domain", "home", "host", "internal", "intranet", "lan", "local", "onion", "private",
]);
export function emailDomainProblem(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return "email must be an email address.";
  const domain = email.slice(at + 1).toLowerCase().replace(/\.+$/, "");
  if (!domain || /\s/.test(domain) || !domain.includes(".")) {
    return "email must carry a complete domain, like name.org or school.edu.";
  }
  const labels = domain.split(".");
  if (labels.some((l) => !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(l))) {
    return "email domain is not a valid domain name.";
  }
  const tld = labels[labels.length - 1];
  if (RESERVED_TLDS.has(tld)) {
    return `".${tld}" is a reserved domain ending that can never receive email, so no follow-up could ever reach it. Give the organization's real email address.`;
  }
  if (email.toLowerCase().endsWith("@example.com") || email.toLowerCase().endsWith("@example.org") || email.toLowerCase().endsWith("@example.net")) {
    return "example.com, example.org, and example.net are reserved example domains that can never receive email. Give the organization's real email address.";
  }
  return null;
}

async function toolStartOrderIntent(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const email = reqString(args, "email", 200).toLowerCase();
  if (!email.includes("@")) throw invalidInput("email must be an email address.");
  const domainProblem = emailDomainProblem(email);
  if (domainProblem) throw invalidInput(domainProblem);
  const organizationName = optString(args, "organizationName", 300) ?? optString(args, "church", 300);
  const quantityHint = optInt(args, "quantityHint");
  const sourceNote = optString(args, "sourceNote", 300);
  const artworkRef = optString(args, "artworkRef", 120);
  let artworkRec: ArtworkRecord | null = null;
  if (artworkRef) {
    artworkRec = await readArtworkRecord(ctx.env, artworkRef);
    if (!artworkRec) throw new ToolError("not_found", `artworkRef ${artworkRef} is not a submission this server holds (unclaimed submissions expire after 30 days).`);
  }

  // Dedupe (2026-11-08 cold-test fix): one intent per email. The
  // email index in MCP_KEYS is checked BEFORE the lead door is
  // called, so a repeat capture returns the existing intentRef and
  // never creates a second lead. (Best effort under concurrency:
  // two simultaneous first captures for the same email can still
  // race; sequential repeats, the reported failure, cannot.)
  const emailIndexKey = `INTENTBYEMAIL:${await sha256Hex(email)}`;
  const indexedRef = await ctx.env.MCP_KEYS.get(emailIndexKey);
  if (indexedRef) {
    const existingRaw = await ctx.env.MCP_KEYS.get(`INTENT:${indexedRef}`);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as Record<string, unknown>;
      // Link a newly supplied artwork to the existing intent.
      if (artworkRec && artworkRef && existing.artworkRef !== artworkRef) {
        artworkRec.intentRef = indexedRef;
        await ctx.env.MCP_ARTWORK.put(artworkJsonKey(artworkRef), JSON.stringify(artworkRec), { expirationTtl: ARTWORK_TTL });
        existing.artworkRef = artworkRef;
        await ctx.env.MCP_KEYS.put(`INTENT:${indexedRef}`, JSON.stringify(existing), { expirationTtl: 30 * DAY });
      }
      return {
        structured: {
          captured: true,
          existing: true,
          intentRef: indexedRef,
          source: INTENT_SOURCE,
          ...(existing.artworkRef ? { artworkRef: existing.artworkRef as string, artworkLinked: true } : {}),
          followUp:
            "This email was already captured, so no second lead was created. The Tap.Giving team follows up by email, usually within one business day. " +
            "The contact was recorded through the same capture the website uses, so the follow-up is the ordinary first email, not a sales list.",
          nextStep: "Next: get_order_questions, then get_recap, then place the order at the final step, Email me my invoice and design proof (create_order). " +
            "An intent is a lead, not an order: it creates no invoice and reserves nothing.",
        },
        text:
          `Already captured as ${indexedRef}: this email already has an intent, so no second lead was created and the Tap.Giving team will follow up with ${email} by email, usually within one business day.` +
          (existing.artworkRef ? ` Your artwork (${existing.artworkRef as string}) is linked to this intent.` : ""),
        images: productPhotoImages(),
      };
    }
    // Index pointed at an expired intent record: fall through and
    // capture fresh; the index is rewritten below.
  }

  // The website's own public capture endpoint, with no honeypot and
  // no form timing: the endpoint's bot check passes a caller that
  // sends neither, by its design, and judges it on rate limits alone.
  // The door is called on tap-autoreply's own workers.dev hostname,
  // the same handler and records as https://tap.giving/api/lead:
  // a POST from this Worker (itself zone-routed on tap.giving) to a
  // same-zone URL is refused upstream with an empty 405 before it
  // reaches the door's handler, verified live at launch; the same
  // call to the door's own hostname lands. Browser-shaped Origin and
  // Referer ride along, as the website's own forms send them.
  const res = await ctx.fetchFn("https://tap-autoreply.shoook.workers.dev/api/lead", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://tap.giving",
      "Referer": "https://tap.giving/",
      "User-Agent": "tap-mcp/1.0 (+https://tap.giving/mcp)",
    },
    body: JSON.stringify({
      email,
      ...(organizationName ? { church: organizationName } : {}),
      source: INTENT_SOURCE,
      ...(quantityHint ? { quantity: String(quantityHint) } : {}),
      ...(sourceNote ? { note: sourceNote } : {}),
    }),
  });
  if (res.status === 429) {
    throw new ToolError("rate_limited", "The capture endpoint is rate limiting right now. Wait and retry; the contact is not captured yet.");
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new ToolError("internal", `The capture endpoint refused the contact (HTTP ${res.status}: ${bodyText.slice(0, 120) || "no body"}). Nothing was captured; retry, or reach the Tap.Giving team at ${TEAM_EMAIL}.`, {
      details: { status: res.status, body: bodyText.slice(0, 200) },
    });
  }

  // The intent record (F14): the reference every later step can cite,
  // and the artwork link, kept on this server's own records.
  const intentRef = `intent_${(await sha256Hex(`${email}:${Date.now()}:${Math.random()}`)).slice(0, 24)}`;
  await ctx.env.MCP_KEYS.put(emailIndexKey, intentRef, { expirationTtl: 30 * DAY });
  await ctx.env.MCP_KEYS.put(`INTENT:${intentRef}`, JSON.stringify({
    intentRef, email,
    ...(organizationName ? { organizationName } : {}),
    ...(quantityHint ? { quantityHint } : {}),
    ...(artworkRef ? { artworkRef } : {}),
    orgSlug: null,
    createdAt: new Date().toISOString(),
  }), { expirationTtl: 30 * DAY });
  if (artworkRec && artworkRef) {
    artworkRec.intentRef = intentRef;
    await ctx.env.MCP_ARTWORK.put(artworkJsonKey(artworkRef), JSON.stringify(artworkRec), { expirationTtl: ARTWORK_TTL });
  }

  const lane = laneFor(email, organizationName);
  const laneLine = lane === "test"
    ? " This is a test-lane capture: this contact capture is real, and test orders stay out of the production CRM."
    : "";
  const structured: Record<string, unknown> = {
    captured: true,
    intentRef,
    source: INTENT_SOURCE,
    ...(lane === "test" ? { lane: "test" } : {}),
    ...(artworkRef ? { artworkRef, artworkLinked: true } : {}),
    followUp:
      "The Tap.Giving team follows up by email, usually within one business day. The contact was recorded through " +
      "the same capture the website uses, so the follow-up is the ordinary first email, not a sales list. " +
      "The capture is real in every lane: it rides the production lead machinery, and the team may follow up." + laneLine,
    nextStep: "Next: get_order_questions, then get_recap, then place the order at the final step, Email me my invoice and design proof (create_order). " +
      "An intent is a lead, not an order: it creates no invoice and reserves nothing.",
  };
  return {
    structured,
    text: `Captured as ${intentRef}. The Tap.Giving team will follow up with ${email} by email, usually within one business day. Next: order questions, recap, then the final step, Email me my invoice and design proof.${artworkRef ? ` Your artwork (${artworkRef}) is linked to this intent.` : ""}${laneLine} The photo with this answer shows the disc in use: a phone tapping a disc on a chair back.`,
    images: productPhotoImages(),
  };
}

// ─── order questions and recap ──────────────────────────────────────

async function toolGetOrderQuestions(_ctx: Ctx, _args: Record<string, unknown>): Promise<ToolResult> {
  // The question set is static and public, in the order the order
  // phase collects it (settlement, 2026-11-09): email first (already
  // captured by start_order_intent), then the organization name, the
  // shipping address and phone, quantity, shape, mounting, and the
  // link destination as a recap confirmation. Prices are first
  // stated here, in the order phase.
  const structured: Record<string, unknown> = {
    pricing: {
      range: PRICE_RANGE_LINE,
      noFees: NO_FEES_LINE,
      note: "Prices are first stated here, at the order questions. Exact totals come from get_quote and the recap.",
    },
    benefits: BENEFITS_PHASE_TWO,
    zeroPriceTerms: {
      shipping: PRODUCT.shipping.cost,
      guarantee: PRODUCT.guarantee,
      dashboard: "The Redirect Dashboard is included free on every order, permanently.",
      sizePricing: "Both built-in sizes are priced the same.",
      screwHoles: "Pre-drilled screw holes are included at no extra cost.",
    },
    questions: [
      {
        order: 1, field: "contactEmail", question: "What email should the invoice, the proof, and the order emails go to?",
        input: { type: "email" },
        note: "Collected first, through start_order_intent. The order binds to this email: it must be an address the organization owns, and the same email captured in the flow. The invoice and the design proof are emailed to this address at placement.",
      },
      {
        order: 2, field: "organizationName", question: "What is the organization's name?",
        input: { type: "text" },
      },
      {
        order: 3, field: "shipTo", question: "Where should we ship them, and what phone reaches the contact?",
        input: {
          type: "object",
          fields: ["name", "street", "city", "state", "postalCode", "country", "phone"],
          note: "The contact phone is collected with this shipping block (the contactPhone answer) and defaults into the shipping phone: the approval email's shipping block always carries the customer's phone as its last line. create_order takes contactPhone and shipTo.phone; use the contact phone for both unless a different delivery phone is given.",
        },
      },
      {
        order: 4, field: "quantity", question: "How many tap discs?",
        input: { type: "integer", minimum: MIN_QTY, maximum: MAX_QTY },
        note: `The minimum order is ${MIN_QTY} discs, enforced by get_quote and create_order.`,
      },
      {
        order: 5, field: "size", question: "Round or square?",
        input: { type: "enum", values: ["100mm-round", "100mm-square"] },
        note: "The two built-in sizes, both 100 mm (4 inch) at the same price. Every other size is arranged by hand through the team, never self-serve.",
      },
      {
        order: 6, field: "antiMetalCount", question: "How many discs will sit on metal surfaces?",
        optional: true,
        input: { type: "integer", minimum: 0 },
        note: "Discs on metal need the anti-metal shielding layer at $1.00 per shielded disc, decided before printing. Omit the count when it is unknown; an unknown count bills nothing.",
      },
      {
        order: 7, field: "mounting", question: "How should we mount them?",
        input: { type: "enum", values: MOUNTING_OPTIONS.map((o) => o.value) },
        options: MOUNTING_OPTIONS.map((o) => ({
          value: o.value, label: o.label, imageUrl: o.imageUrl, text: o.text,
        })),
      },
      {
        order: 8, field: "linkDestination", question: "Confirm where a tap should send people.",
        optional: true,
        confirmation: true,
        note: "A confirmation, not a fresh collection: the destination carried from the design (the designUrl entered in the design phase, stored on the artwork record). " +
          LINK_DESTINATION_NOTE +
          " Give a URL here only to change it; get_recap and create_order accept it as linkDestination.",
        input: { type: "url", schemes: ["http", "https"] },
      },
      {
        order: 9, field: "contactName", question: "Who is the contact for this order?",
        input: { type: "text" },
        note: "Asked with the shipping block answers at create_order: contactName and contactPhone ride create_order itself.",
      },
    ],
    alsoRequiredAtCreateOrder: {
      recapRef: "Comes from get_recap over these same answers; run the recap before create_order.",
      idempotencyKey: "Mint one per intended order (8 to 128 characters) and reuse it on retries.",
      artworkRef: "Optional but expected: the reference from submit_artwork.",
      contactPhone: "Collected with the shipping block (question 3) and passed to create_order; it also defaults into shipTo.phone.",
    },
    emailFirst: "The contact email is captured first in this phase (start_order_intent), before the questions: the order phase's first ask.",
    destinationModel: "Where a tap lands is set per disc. An order starts with one destination for the whole set; to run two destinations, split the set afterwards in the free Redirect Dashboard, per disc or per group, in seconds.",
  };
  const text = [
    "Order questions, in the order to ask them:",
    "1. Contact email: captured first through start_order_intent. The invoice and the design proof are emailed to this address at placement.",
    "2. Organization name.",
    "3. Shipping address and phone: the contact phone is collected in this block and defaults into the shipping phone.",
    `4. Quantity: "How many tap discs?" (minimum ${MIN_QTY}).`,
    "5. Shape and size: round or square, both 100 mm (4 inch), at the same price.",
    "6. Metal surfaces: how many discs sit on metal? Those need the $1.00 shielding layer, decided before printing; omit the count when unknown.",
    '7. Mounting: "How should we mount them?" The two photos with this answer show the options: adhesive backing, and pre-drilled holes for screws (screws not included).',
    `8. Link destination, as a confirmation: the destination carried from the design. ${LINK_DESTINATION_NOTE}`,
    "The contact name rides create_order with these answers.",
    `${PRICE_RANGE_LINE} ${NO_FEES_LINE}`,
    "Shipping is free on every order, and every order is covered by our 30-day money-back guarantee.",
    "Then run get_recap over the answers; keep the recap reference it returns, because placing the order at the final step (Email me my invoice and design proof) uses it.",
  ].join("\n");
  return { structured, text, images: mountingPhotoImages() };
}

export interface RecapRecord {
  recapRef: string;
  // P-15: a keyless recap binds to the flow's contact email (and the
  // intent, when one was captured), not to an organization key, so
  // orgSlug is null and contactEmail carries the binding.
  orgSlug: string | null;
  mode: "live" | "test";
  inputs: Record<string, unknown>;
  quoteGrandTotalCents: number;
  createdAt: string;
  contactEmail?: string;
  organizationName?: string;
  intentRef?: string;
}

// The keyless placement's organization slug: derived from the
// organization name the flow collected (the same slug shape the key
// records use), so a keyless order and a later key for the same
// organization meet on one slug.
export function slugifyOrg(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function canonicalOrderInputs(v: Record<string, unknown>): Record<string, unknown> {
  const keys = ["quantity", "size", "mounting", "antiMetalCount", "shipTo", "artworkRef", "linkDestination", "contactEmail"];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (v[k] !== undefined) out[k] = v[k];
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffFields(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) if (!deepEqual(a[k], b[k])) out.push(k);
  return out.sort();
}

// F22 content comparison: when minting reuses an earlier order's
// invoice, the two orders are compared over exactly the fields the
// invoice and production embody (the verdict's five). Excluded on
// purpose: contactEmail (identical by construction), linkDestination
// and linkDestination (changeable anytime by design), antiMetalCount (it
// moves the total, which the reuse text already shows).
const INVOICE_COMPARE_FIELDS = ["artworkRef", "quantity", "size", "mounting", "shipTo"] as const;

const COMPARE_FIELD_LABELS: Record<string, string> = {
  artworkRef: "artwork",
  quantity: "quantity",
  size: "size",
  mounting: "mounting",
  shipTo: "shipping address",
};

function stableComparedValue(v: unknown): unknown {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map(stableComparedValue);
  if (v && typeof v === "object") {
    const rec = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(rec).sort()) out[k] = stableComparedValue(rec[k]);
    return out;
  }
  return v;
}

export function differingFieldsSentence(fields: string[]): string {
  return `The earlier order differs from this order in: ${fields.map((f) => COMPARE_FIELD_LABELS[f] ?? f).join(", ")}.`;
}

// The flow's captured intent for an email or reference, when one
// exists: the keyless placement's identity anchor (P-15).
async function readIntentForFlow(
  env: Env, intentRef: string | undefined, email: string | undefined,
): Promise<{ intentRef: string; organizationName?: string; email?: string } | null> {
  const parse = (raw: string | null): { intentRef: string; organizationName?: string; email?: string } | null => {
    if (!raw) return null;
    try {
      const rec = JSON.parse(raw) as Record<string, unknown>;
      const ref = typeof rec.intentRef === "string" ? rec.intentRef : "";
      if (!ref) return null;
      const name = typeof rec.organizationName === "string" ? rec.organizationName
        : typeof rec.orgName === "string" ? rec.orgName : undefined;
      const em = typeof rec.email === "string" ? rec.email.toLowerCase() : undefined;
      return { intentRef: ref, ...(name ? { organizationName: name } : {}), ...(em ? { email: em } : {}) };
    } catch { return null; }
  };
  if (intentRef) {
    const byRef = parse(await env.MCP_KEYS.get(`INTENT:${intentRef}`));
    if (byRef) return byRef;
  }
  if (email) {
    const indexedRef = await env.MCP_KEYS.get(`INTENTBYEMAIL:${await sha256Hex(email.toLowerCase())}`);
    if (indexedRef) return parse(await env.MCP_KEYS.get(`INTENT:${indexedRef}`));
  }
  return null;
}

async function toolGetRecap(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  // The recap binds to the contact email (and the captured intent,
  // when one exists) from the flow.
  const inputs = await validateOrderShape(ctx, args);
  const quote = quoteFor({
    qty: inputs.quantity as number,
    antiMetal: inputs.antiMetalCount as number | undefined,
    redirect: false,
  });
  const contactEmailBound = inputs.contactEmail as string;
  const intent = await readIntentForFlow(ctx.env, optString(args, "intentRef", 120), contactEmailBound);
  const orgNameBound = optString(args, "organizationName", 300) ?? optString(args, "church", 300)
    ?? intent?.organizationName;
  const bindingSeed = `keyless:${contactEmailBound ?? ""}`;
  const recapRef = `recap_${(await sha256Hex(`${bindingSeed}:${JSON.stringify(canonicalOrderInputs(inputs))}:${Date.now()}`)).slice(0, 24)}`;
  const record: RecapRecord = {
    recapRef,
    orgSlug: null,
    mode: laneFor(contactEmailBound, orgNameBound),
    inputs: canonicalOrderInputs(inputs),
    quoteGrandTotalCents: quote.grandTotalCents,
    createdAt: new Date().toISOString(),
    ...(contactEmailBound ? { contactEmail: contactEmailBound } : {}),
    ...(orgNameBound ? { organizationName: orgNameBound } : {}),
    ...(intent ? { intentRef: intent.intentRef } : {}),
  };
  await ctx.env.MCP_KEYS.put(`RECAP:${recapRef}`, JSON.stringify(record), { expirationTtl: RECAP_TTL });

  let artwork: Record<string, unknown> | null = null;
  let image: ToolResult["image"];
  const artworkRef = inputs.artworkRef as string | undefined;
  const recapShape = (inputs.size as string) === "100mm-square" ? "square" : "round";
  if (artworkRef) {
    const rec = await readArtworkRecord(ctx.env, artworkRef);
    if (rec) {
      artwork = { artworkRef, displayUrl: `https://tap.giving${artworkDisplayPath(artworkRef)}`, sha256: rec.sha256 };
      const stored = await ctx.env.MCP_ARTWORK.get(artworkBytesKey(artworkRef), "arrayBuffer");
      let onDisc: Uint8Array | null = null;
      if (stored) onDisc = await renderArtworkOnDisc(new Uint8Array(stored), rec.detectedType, recapShape, (inputs.mounting as string) === "screws");
      if (onDisc) {
        image = { data: bytesToBase64(onDisc), mimeType: "image/png" };
        artwork.preview = "on-disc render embedded with this recap";
      } else if (stored && rec.detectedType !== "svg" && rec.detectedType !== "pdf") {
        const u8 = new Uint8Array(stored);
        image = { data: bytesToBase64(u8), mimeType: DETECTED_MEDIA_TYPE[rec.detectedType] || rec.mediaType };
        artwork.preview = "submitted file embedded; the on-disc render was unavailable in this call";
      } else {
        artwork.renderNote = "The artwork could not be rendered to an image in this call; it is on record, and the final proof we email shows it on the disc.";
      }
    }
  }

  if (!image) image = productPhotoImages()[0];
  const quoteObj = quoteOutput(quote);
  const contactNameIn = optString(args, "contactName", 200);
  const contactPhoneIn = optString(args, "contactPhone", 60);
  const contactEmailOut = contactEmailBound as string;
  const orgDisplay = orgNameBound ?? "your organization";
  const givingUrlOut = (inputs.linkDestination as string | undefined) ?? (inputs.givingUrl as string | undefined);
  const structured: Record<string, unknown> = {
    recapRef,
    artwork,
    customer: {
      organization: orgNameBound ?? null,
      contactEmail: contactEmailOut,
      proofRecipientEmail: contactEmailOut,
      binding: "This recap binds to the contact email collected in the flow (and the captured intent, when one exists).",
      ...(contactNameIn ? { contactName: contactNameIn } : {}),
      ...(contactPhoneIn ? { contactPhone: contactPhoneIn } : {}),
    },
    quantity: inputs.quantity,
    size: inputs.size,
    mounting: inputs.mounting,
    shipTo: inputs.shipTo,
    destination: {
      linkDestination: givingUrlOut ?? null,
      note: givingUrlOut
        ? "Your discs start pointed at this page."
        : "No destination given: your discs ship pointed at your own Tap.Giving page (your free Redirect Dashboard), and you can set or change the destination anytime from the dashboard.",
    },
    cost: quoteObj,
    priceHold: {
      quotedOn: record.createdAt.slice(0, 10),
      note:
        "Prices are today's published prices. The first-order discount works like this: it applies to any first order " +
        "placed within 7 days of your quote; if you miss it, a fresh quote restarts it.",
    },
    sequence:
      "Placing the order at the final step (Email me my invoice and design proof) emails the invoice and the design proof to the contact email; production waits until the final proof is approved by email. " +
      "Nothing is printed before that approval.",
    tapGivingContact: { email: TEAM_EMAIL },
    notes: RECAP_NOTES,
    exits: [
      { value: "pay_now", label: "Pay now", presented: "first, the default path", meaning: "create_order places the order now; the invoice and the design proof are emailed to the contact at placement, and the person pays the hosted invoice right away." },
      { value: "lock_in", label: "I want to lock in this price", presented: "second", meaning: "the same create_order; the invoice and the design proof are emailed to the contact at placement, for the person to pay when they choose. The quoted total is the price protection." },
    ],
    gates: [GATES.designApproval, GATES.payment],
  };
  const shipTo = inputs.shipTo as Record<string, string>;
  const text = [
    `Recap ${recapRef}: ${inputs.quantity} discs, ${inputs.size}, mounting ${inputs.mounting}, for ${orgDisplay}.`,
    artwork ? `Artwork: your design on the disc is shown with this recap. File: https://tap.giving${artworkDisplayPath(artworkRef!)}` : "Artwork: none attached.",
    givingUrlOut
      ? `Tap destination: ${givingUrlOut}. Your discs start pointed at this page.`
      : "Tap destination: your own Tap.Giving page (your free Redirect Dashboard) until you set one; you can set or change it anytime from the dashboard.",
    `Contact: ${contactNameIn ? `${contactNameIn}, ` : ""}${contactEmailOut}${contactPhoneIn ? `, phone ${contactPhoneIn}` : ""}. The final proof is emailed to this address for approval.`,
    `Ship to: ${shipTo.name}, ${shipTo.street}, ${shipTo.city}, ${shipTo.state} ${shipTo.postalCode}, ${shipTo.country}. Phone: ${shipTo.phone}.`,
    `Cost: ${dollars(quote.grandTotalCents)} total. Shipping: Free. ${TAX_NOTE}`,
    `First-order discount, when it applies: if this is ${orgDisplay}'s first order, code WELCOME10 takes 10 percent off discs on the invoice emailed at placement, making the total ${dollars(quote.discountedTotalCents)}. It applies to any first order placed within 7 days of this quote (${record.createdAt.slice(0, 10)}); if the 7 days pass, a fresh quote restarts the window.`,
    ...RECAP_NOTES,
    "How payment and proof fit together: placing the order at the final step emails the invoice and the design proof to the contact; production waits until the final proof is approved by email. Nothing is printed before that approval.",
    "Two ways forward, and both place the same order: pay now (place it now and pay the hosted invoice when it arrives), or lock in this price (place it now; today's quoted total is what the invoice carries).",
    `Questions: the Tap.Giving team at ${TEAM_EMAIL}.`,
  ].join("\n");
  return { structured, text, image };
}

// ─── order records ──────────────────────────────────────────────────

export interface OrderRecord {
  orderRef: string;
  orgSlug: string;
  mode: "live" | "test";
  exit: "pay_now" | "lock_in";
  organizationName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  quantity: number;
  size: "100mm-round" | "100mm-square";
  mounting: "adhesive" | "screws";
  antiMetalCount?: number;
  shipTo: Record<string, string>;
  linkDestination?: string;
  artworkRef?: string;
  note?: string;
  recapRef: string;
  invreqKey: string | null;
  quote: Quote;
  // P-16: the order-email outcome, recorded on the order itself.
  orderEmail?: { sent: boolean; seat: string; messageRef?: string; error?: string; at: string };
  // P-15: present on keyless placements: the binding that replaced
  // the organization key.
  keylessBinding?: { contactEmail: string; intentRef?: string };
  invoice?: {
    invoiceId: string;
    invoiceNumber: string | null;
    status: string;
    hostedInvoiceUrl: string;
    totalCents: number;
    invoicePdf?: string;
    finalizedAt?: string;
    existing?: boolean;
    existingOrderRef?: string | null;
    existingDifferingFields?: string[];
  };
  // Final-step chain outcomes (step 11): the invoice mint attempt
  // when it failed, and the customer email outcome. A replay of
  // create_order re-attempts only the missing steps.
  invoiceAttempt?: { ok: boolean; error?: string; at: string };
  // The seat's typed hold (F22 shape): the mint answered
  // invoice_held because a foreign live invoice exists for the
  // customer, or this order's own invoice content diverged from the
  // order. A hold is a review state, not a mint failure: nothing was
  // minted, the customer email cannot fire, and the team is told
  // through notifyInvoiceHeld (its outcome recorded here too).
  invoiceHeld?: {
    reason: string;
    differingFields?: string[];
    existingInvoiceId?: string;
    existingStatus?: string;
    existingOrderRef?: string | null;
    existingTotalCents?: number;
    at: string;
    notify?: { sent: boolean; messageRef?: string; error?: string; at: string };
  };
  customerEmail?: { sent: boolean; messageRef?: string; error?: string; suppressed?: string; proofPending?: boolean; at: string };
  // The status capability (step 8): only the SHA-256 hash of the
  // status reference is stored; the plaintext is shown once, in the
  // create_order response and the customer email.
  statusRefHash?: string;
  createdAt: string;
}

export async function readOrderRecord(env: Env, orderRef: string): Promise<OrderRecord | null> {
  const raw = await env.MCP_KEYS.get(`ORDER:${orderRef}`);
  if (!raw) return null;
  try { return JSON.parse(raw) as OrderRecord; } catch { return null; }
}

export async function saveOrderRecord(env: Env, order: OrderRecord): Promise<void> {
  await env.MCP_KEYS.put(`ORDER:${order.orderRef}`, JSON.stringify(order));
}

// Shared shape validation for recap and create_order inputs. With a
// key (auth), the key's organization binds as before. Keyless
// (P-15), the binding is the flow's own data: the contact email is
// required and the artwork must be an unbound (keyless) submission.
async function validateOrderShape(ctx: Ctx, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const quantity = reqInt(args, "quantity");
  if (quantity < MIN_QTY) {
    throw invalidInput(belowMinimumMessage(quantity), {
      minimumQuantity: MIN_QTY,
      smallestOrderTotalCents: quoteFor({ qty: MIN_QTY }).grandTotalCents,
    });
  }
  if (quantity > MAX_QTY) {
    throw invalidInput(`Quantity ${quantity} exceeds the maximum (${MAX_QTY} discs). Contact the Tap.Giving team at ${TEAM_EMAIL} for an order this size.`);
  }
  const size = reqString(args, "size", 40);
  if (size !== "100mm-round" && size !== "100mm-square") {
    throw new ToolError("manual_exception",
      `Size "${size}" is not a built-in size. Built-ins are 100mm-round (4 inch round) and 100mm-square (4 inch square). ` +
      `Other sizes are handled by hand through the Tap.Giving team (${TEAM_EMAIL}), never silently substituted.`,
      { retryable: false });
  }
  const mounting = reqString(args, "mounting", 20);
  if (mounting !== "adhesive" && mounting !== "screws") {
    throw invalidInput(`mounting must be "adhesive" or "screws".`);
  }
  const antiMetalCount = optInt(args, "antiMetalCount");
  if (antiMetalCount !== undefined && antiMetalCount < 0) {
    throw invalidInput("antiMetalCount must be 0 or more; omit it when unknown.");
  }
  const shipToRaw = args.shipTo;
  if (!isRecord(shipToRaw)) throw invalidInput("shipTo is required: {name, street, city, state, postalCode, country, phone}.");
  const shipTo: Record<string, string> = {};
  for (const f of ["name", "street", "city", "state", "postalCode", "country", "phone"]) {
    shipTo[f] = reqString(shipToRaw, f, 300);
  }
  const contactEmail = optString(args, "contactEmail", 200)?.toLowerCase();
  if (!contactEmail) {
    throw invalidInput("contactEmail is required: a recap or order binds to the contact email collected in the flow. Capture it first with start_order_intent and use the same email here.");
  }
  if (!contactEmail.includes("@")) throw invalidInput("contactEmail must be an email address.");
  const linkDestination = screenDestination(optString(args, "linkDestination", 500) ?? optString(args, "givingUrl", 500), "linkDestination");
  const artworkRef = optString(args, "artworkRef", 120);
  if (artworkRef) {
    const rec = await readArtworkRecord(ctx.env, artworkRef);
    if (!rec) throw new ToolError("not_found", `artworkRef ${artworkRef} is not a submission this server holds (unclaimed submissions expire after 30 days).`);
    if (rec.orgSlug && rec.claimedByEmail !== contactEmail) {
      throw new ToolError("forbidden", "That artwork was submitted bound to an existing order under a different contact email. Submit the artwork again for a new order.", { retryable: false });
    }
  }
  void ctx;
  return {
    quantity, size, mounting,
    ...(antiMetalCount !== undefined ? { antiMetalCount } : {}),
    shipTo,
    ...(contactEmail ? { contactEmail } : {}),
    ...(linkDestination ? { linkDestination } : {}),
    ...(artworkRef ? { artworkRef } : {}),
  };
}

// ─── create_order ───────────────────────────────────────────────────

async function toolCreateOrder(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  // Identity rides on the flow's own data: the organization name,
  // the contact email, and the captured intent when one exists; the
  // slug is derived from the organization name. The lane is decided
  // by laneFor once the organization name is known (test lane:
  // DEV_ORDERS routing, no CRM adoption, TEST-marked team email,
  // test-key invoice inside the seat, customer email suppressed).
  let orgSlug: string;
  let mode: "live" | "test" = "live";
  let intentGuess: { intentRef: string; organizationName?: string; email?: string } | null = null;
  {
    const emailGuess = optString(args, "contactEmail", 200)?.toLowerCase();
    intentGuess = await readIntentForFlow(ctx.env, optString(args, "intentRef", 120), emailGuess);
    const orgNameGuess = optString(args, "organizationName", 300) ?? optString(args, "church", 300) ?? intentGuess?.organizationName;
    orgSlug = slugifyOrg(orgNameGuess ?? "") || slugifyOrg((emailGuess ?? "").split("@")[0] ?? "") || "keyless";
  }

  const idempotencyKey = reqString(args, "idempotencyKey", 200);
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw invalidInput("idempotencyKey must be 8 to 128 characters. Mint one per intended order and reuse it on every retry of that order.");
  }
  const idemHash = (await sha256Hex(idempotencyKey)).slice(0, 32);
  const payloadHash = await sha256Hex(JSON.stringify(canonicalOrderInputs(args as Record<string, unknown>)) + "|" + (args.exit ?? "") + "|" + (args.recapRef ?? ""));

  // Idempotency, checked BEFORE any downstream call (spec 2.5).
  const idemRaw = await ctx.env.MCP_KEYS.get(`IDEM:${orgSlug}:${idemHash}`);
  if (idemRaw) {
    const idem = JSON.parse(idemRaw) as { payloadHash: string; orderRef: string; payload: Record<string, unknown> };
    if (idem.payloadHash === payloadHash) {
      const order = await readOrderRecord(ctx.env, idem.orderRef);
      if (order) return await createOrderResult(ctx, order, true);
    }
    const differing = diffFields(canonicalOrderInputs(idem.payload ?? {}), canonicalOrderInputs(args));
    throw new ToolError("conflict",
      `This idempotencyKey was already used for a different order. The original order stands (${idem.orderRef}); ` +
      `the differing fields are: ${differing.length ? differing.join(", ") : "exit or recapRef"}. Mint a new idempotencyKey for a genuinely new order.`,
      { retryable: false, details: { existingOrderRef: idem.orderRef, differingFields: differing } });
  }

  const contactName = reqString(args, "contactName", 200);
  const contactEmail = reqString(args, "contactEmail", 200).toLowerCase();
  const contactPhone = reqString(args, "contactPhone", 60);
  const shapeInputs = await validateOrderShape(ctx, { ...args, contactEmail });
  const exitRaw = optString(args, "exit", 20) ?? "pay_now";
  if (exitRaw !== "pay_now" && exitRaw !== "lock_in") {
    throw invalidInput(`exit must be "pay_now" or "lock_in".`);
  }
  const exit = exitRaw as "pay_now" | "lock_in";
  const note = optString(args, "note", 480);
  const organizationName = optString(args, "organizationName", 300) ?? optString(args, "church", 300)
    ?? intentGuess?.organizationName
    ?? contactEmail;
  mode = laneFor(contactEmail, organizationName);
  // Intent binding: an intentRef named by the caller must be the
  // intent captured for this order's contact email.
  {
    const intentRefArg = optString(args, "intentRef", 120);
    if (intentRefArg) {
      if (!intentGuess || intentGuess.intentRef !== intentRefArg) {
        throw invalidInput(`intentRef ${intentRefArg} is not an intent this server holds. Capture the contact first with start_order_intent, or place the order without an intentRef.`);
      }
      if (intentGuess.email && intentGuess.email !== contactEmail) {
        throw new ToolError("forbidden", "That intent was captured for a different contact email. Place the order with the email the intent captured, or capture a fresh intent for this email.", { retryable: false });
      }
    }
  }

  // Recap binding: create_order carries the recapRef, and a recap
  // whose inputs differ from the order's is a conflict (spec 2.11).
  const recapRef = reqString(args, "recapRef", 80);
  const recapRaw = await ctx.env.MCP_KEYS.get(`RECAP:${recapRef}`);
  if (!recapRaw) {
    throw new ToolError("not_found", `recapRef ${recapRef} is not a recap this server holds. Call get_recap for these inputs first; the recap is the last thing before the exits.`);
  }
  const recap = JSON.parse(recapRaw) as RecapRecord;
  if (recap.orgSlug !== null && recap.orgSlug !== undefined) {
    throw new ToolError("forbidden", "That recap was made under an organization key, which this server no longer uses. Run a fresh recap.", { retryable: false });
  }
  if (!recap.contactEmail || recap.contactEmail !== contactEmail) {
    throw new ToolError("conflict",
      "That recap binds to a different contact email than this order. Re-run get_recap with the order's contact email, " +
      "so the recap the person saw and the order placed are the same.", { retryable: false });
  }
  const orderCanon = canonicalOrderInputs({ ...shapeInputs, contactEmail });
  const drift = diffFields(recap.inputs, orderCanon);
  if (drift.length) {
    throw new ToolError("conflict",
      `The order's inputs differ from the recap the person saw (${recapRef}). Differing fields: ${drift.join(", ")}. ` +
      `Re-run get_recap with the order's actual inputs so what the person approves and what the order records are the same object.`,
      { retryable: false, details: { differingFields: drift } });
  }

  // First-order discount eligibility (policy: the discount is
  // first-order only; round 2, F22). An earlier order for this
  // organization in this mode that already carries an invoice spends
  // the eligibility. Before this pass the flag was hardcoded true, so
  // any later order would have minted with the coupon too; the round 2
  // $675 figure itself came from the shared invoice (see
  // request_invoice), but the latent defect was real.
  let priorInvoicedOrder = false;
  {
    const listed = await ctx.env.MCP_KEYS.list({ prefix: `ORDER:mcp:${orgSlug}:`, limit: 1000 });
    for (const k of listed.keys) {
      const prior = await readOrderRecord(ctx.env, k.name.slice("ORDER:".length));
      if (prior && prior.mode === mode && prior.invoice) { priorInvoicedOrder = true; break; }
    }
  }
  const discountEligible = !priorInvoicedOrder;
  const quote = quoteFor({
    qty: shapeInputs.quantity as number,
    antiMetal: shapeInputs.antiMetalCount as number | undefined,
    redirect: false,
    discountEligible,
  });
  const orderRef = `mcp:${orgSlug}:${idemHash.slice(0, 16)}`;
  const shipTo = shapeInputs.shipTo as Record<string, string>;
  const size = shapeInputs.size as "100mm-round" | "100mm-square";
  // The destination: the order answer wins; otherwise the design's
  // own entered URL (the artwork record's designUrl) carries in, as
  // the recap confirmed it.
  let effectiveDestination = shapeInputs.linkDestination as string | undefined;
  if (!effectiveDestination && shapeInputs.artworkRef) {
    const artRec = await readArtworkRecord(ctx.env, shapeInputs.artworkRef as string);
    if (artRec?.designUrl) effectiveDestination = artRec.designUrl;
  }
  // The status capability: minted at placement, hash stored only.
  const statusRef = randomToken(32);
  const statusRefHash = await sha256Hex(statusRef);

  // The INVREQ payload, in the website invoice door's shape.
  const invreqBody: Record<string, unknown> = {
    source: "mcp",
    discountEligible,
    lead: {
      church: organizationName,
      email: contactEmail,
      name: contactName,
      phone: contactPhone,
      quantity: shapeInputs.quantity,
    },
    design: {
      layout: "custom",
      color: "",
      withHoles: shapeInputs.mounting === "screws",
      ...(shapeInputs.antiMetalCount !== undefined ? { antiMetal: shapeInputs.antiMetalCount } : {}),
      brandMode: "name",
      brandName: organizationName,
      ...(effectiveDestination ? { givingUrl: effectiveDestination } : {}),
    },
    shipTo,
    mcpOrderRef: orderRef,
    mcpExit: exit,
    ...((shapeInputs.artworkRef as string | undefined) ? { mcpArtworkRef: shapeInputs.artworkRef } : {}),
    note: [note, `MCP order ${orderRef}, exit ${exit}`].filter(Boolean).join(" "),
  };

  let invreqKey: string | null = null;
  if (mode === "live") {
    // Same door-hostname routing as start_order_intent: tap-order's
    // own workers.dev hostname, the same handler that serves
    // https://tap.giving/api/invoice-request.
    const res = await ctx.fetchFn("https://tap-order.shoook.workers.dev/api/invoice-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://tap.giving",
        "Referer": "https://tap.giving/finalize.html",
        "User-Agent": "tap-mcp/1.0 (+https://tap.giving/mcp)",
      },
      body: JSON.stringify(invreqBody),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new ToolError("internal", `The order door refused the request (HTTP ${res.status}): ${bodyText.slice(0, 200)}. Nothing was recorded downstream; retrying with the same idempotencyKey is safe.`);
    }
    invreqKey = "(written by POST /api/invoice-request; key carries the request timestamp and email)";
  } else {
    const requestedAt = new Date().toISOString();
    invreqKey = `INVREQ:${requestedAt}:${contactEmail}`;
    const record = { ...invreqBody, quote, requestedAt };
    await ctx.env.DEV_ORDERS.put(invreqKey, JSON.stringify(record), { expirationTtl: 30 * DAY });
  }

  const order: OrderRecord = {
    orderRef, orgSlug, mode, exit,
    organizationName, contactName, contactEmail, contactPhone,
    quantity: shapeInputs.quantity as number,
    size, mounting: shapeInputs.mounting as "adhesive" | "screws",
    ...(shapeInputs.antiMetalCount !== undefined ? { antiMetalCount: shapeInputs.antiMetalCount as number } : {}),
    shipTo,
    ...(effectiveDestination ? { linkDestination: effectiveDestination } : {}),
    ...((shapeInputs.artworkRef as string | undefined) ? { artworkRef: shapeInputs.artworkRef as string } : {}),
    ...(note ? { note } : {}),
    recapRef,
    invreqKey,
    quote,
    statusRefHash,
    createdAt: new Date().toISOString(),
    keylessBinding: {
      contactEmail,
      ...(intentGuess ? { intentRef: intentGuess.intentRef } : {}),
    },
  };
  await saveOrderRecord(ctx.env, order);
  await ctx.env.MCP_KEYS.put(`STATUS:${statusRefHash}`, orderRef);
  await ctx.env.MCP_KEYS.put(`IDEM:${orgSlug}:${idemHash}`, JSON.stringify({
    payloadHash, orderRef, payload: canonicalOrderInputs(args), createdAt: order.createdAt,
  }));

  // Claim the artwork and queue its seat record now that the order
  // identity exists (cold submissions queue at claim time).
  if (order.artworkRef) {
    const rec = await readArtworkRecord(ctx.env, order.artworkRef);
    if (rec && rec.status !== "claimed") {
      rec.status = "claimed";
      rec.orderRef = orderRef;
      rec.orgSlug = orgSlug;
      rec.claimedByEmail = contactEmail;
      await ctx.env.MCP_ARTWORK.put(artworkJsonKey(order.artworkRef), JSON.stringify(rec), { expirationTtl: ARTWORK_TTL });
      const seat = await callSeat(ctx.env, "recordArtworkSubmission", {
        artworkRef: order.artworkRef, sha256: rec.sha256, orderRef,
        orgSlug, contactEmail, church: organizationName, filename: rec.filename, mediaType: rec.mediaType,
        displayUrl: `https://tap.giving${artworkDisplayPath(order.artworkRef)}`,
      }, ctx.fetchFn);
      if (seat.ok) {
        rec.seatRecorded = true;
        await ctx.env.MCP_ARTWORK.put(artworkJsonKey(order.artworkRef), JSON.stringify(rec), { expirationTtl: ARTWORK_TTL });
      }
    }
  }

  return await createOrderResult(ctx, order, false, statusRef);
}

// P-16, effect 2: the full order emailed to Ryan through the
// business's own authenticated seat (tap-mail /api/mcp-invoke, op
// notifyOrderPlaced), which sends it to the same inboxes the
// business's order alerts use. The durable record is written first;
// the email is attempted second, its outcome is recorded on the
// order itself, and a failure is logged loudly and stated plainly
// in the response: placement never pretends completeness. An
// idempotent replay re-attempts a failed email and never re-sends a
// sent one.
const ORDER_EMAIL_SEAT = "tap-mail /api/mcp-invoke (notifyOrderPlaced)";

async function attemptOrderEmail(ctx: Ctx, order: OrderRecord): Promise<void> {
  const seat = await callSeat(ctx.env, "notifyOrderPlaced", {
    orderRef: order.orderRef,
    invreqKey: order.invreqKey,
    testMode: order.mode === "test",
    keyless: order.keylessBinding !== undefined,
    organizationName: order.organizationName,
    contactName: order.contactName,
    contactEmail: order.contactEmail,
    contactPhone: order.contactPhone,
    quantity: order.quantity,
    size: order.size,
    mounting: order.mounting,
    antiMetalCount: order.antiMetalCount ?? null,
    linkDestination: order.linkDestination ?? null,
    artworkRef: order.artworkRef ?? null,
    shipTo: order.shipTo,
    exit: order.exit,
    totals: {
      unitCents: order.quote.unitCents,
      discsSubtotalCents: order.quote.discSubtotalCents,
      shieldingCents: order.quote.addOnCents,
      grandTotalCents: order.quote.grandTotalCents,
      firstOrderTotalCents: order.quote.discountedTotalCents,
      discountEligible: order.quote.discountEligible,
    },
  }, ctx.fetchFn);
  if (seat.ok) {
    const ref = typeof seat.body.messageId === "string" ? seat.body.messageId
      : typeof seat.body.messageRef === "string" ? seat.body.messageRef : undefined;
    order.orderEmail = {
      sent: true, seat: ORDER_EMAIL_SEAT,
      ...(ref ? { messageRef: ref } : {}),
      at: new Date().toISOString(),
    };
  } else {
    const error = String(seat.body.error ?? `seat answered HTTP ${seat.status}`).slice(0, 200);
    console.error(`[create_order] ORDER EMAIL FAILED for ${order.orderRef} (record stands, invreq ${order.invreqKey}): ${error}`);
    order.orderEmail = { sent: false, seat: ORDER_EMAIL_SEAT, error, at: new Date().toISOString() };
  }
  await saveOrderRecord(ctx.env, order);
}

const INVOICE_SEAT = "tap-mail /api/mcp-invoke (mintOrderInvoice)";
const CUSTOMER_EMAIL_SEAT = "tap-mail /api/mcp-invoke (sendOrderInvoiceProof)";
const INVOICE_HELD_SEAT = "tap-mail /api/mcp-invoke (notifyInvoiceHeld)";

function orderTotals(order: OrderRecord): Record<string, unknown> {
  return {
    unitCents: order.quote.unitCents,
    discsSubtotalCents: order.quote.discSubtotalCents,
    shieldingCents: order.quote.addOnCents,
    grandTotalCents: order.quote.grandTotalCents,
    firstOrderTotalCents: order.quote.discountedTotalCents,
    discountEligible: order.quote.discountEligible,
  };
}

// Final-step chain, step 2: the invoice, minted and finalized inside
// the seat at exactly the quoted total. Three answers are possible.
// A minted invoice is recorded as before. A typed hold
// (invoice_held: a foreign live invoice exists for the customer, or
// this order's own invoice content diverged from the order) is
// recorded as a first-class review state, never as a mint failure,
// and the team notification is attempted right behind it. Any other
// non-invoice answer is a failure, recorded as before. A replay
// re-attempts only the missing steps and never re-mints a minted
// invoice.
async function attemptInvoiceMint(ctx: Ctx, order: OrderRecord): Promise<void> {
  const seat = await callSeat(ctx.env, "mintOrderInvoice", {
    orderRef: order.orderRef,
    mode: order.mode,
    testLane: order.mode === "test",
    organizationName: order.organizationName,
    contactName: order.contactName,
    contactEmail: order.contactEmail,
    contactPhone: order.contactPhone,
    quantity: order.quantity,
    size: order.size,
    mounting: order.mounting,
    antiMetalCount: order.antiMetalCount ?? null,
    linkDestination: order.linkDestination ?? null,
    artworkRef: order.artworkRef ?? null,
    shipTo: order.shipTo,
    exit: order.exit,
    totals: orderTotals(order),
  }, ctx.fetchFn);
  const inv = (seat.body.invoice ?? null) as Record<string, unknown> | null;
  if (seat.ok && inv && typeof inv.id === "string") {
    order.invoice = {
      invoiceId: inv.id,
      invoiceNumber: typeof inv.number === "string" ? inv.number : null,
      status: typeof inv.status === "string" ? inv.status : "open",
      hostedInvoiceUrl: String(inv.hostedInvoiceUrl ?? ""),
      totalCents: Number(inv.totalCents ?? 0),
      ...(typeof inv.invoicePdf === "string" ? { invoicePdf: inv.invoicePdf } : {}),
      ...(typeof inv.finalizedAt === "string" ? { finalizedAt: inv.finalizedAt } : {}),
      ...(inv.existing === true ? { existing: true } : {}),
    };
    order.invoiceAttempt = { ok: true, at: new Date().toISOString() };
  } else if (seat.body.invoice_held === true && isRecord(seat.body.hold)) {
    // The typed hold: nothing was minted, so order.invoice stays
    // unset and the customer email cannot fire. The hold is its own
    // recorded outcome; the team notification follows immediately.
    const hold = seat.body.hold;
    console.error(`[create_order] INVOICE HELD for ${order.orderRef} (reason ${String(hold.reason ?? "unknown")}); the team notification follows`);
    order.invoiceHeld = {
      reason: String(hold.reason ?? "unknown"),
      ...(Array.isArray(hold.differingFields) ? { differingFields: hold.differingFields.map((f) => String(f)) } : {}),
      ...(typeof hold.existingInvoiceId === "string" ? { existingInvoiceId: hold.existingInvoiceId } : {}),
      ...(typeof hold.existingStatus === "string" ? { existingStatus: hold.existingStatus } : {}),
      ...(typeof hold.existingOrderRef === "string" || hold.existingOrderRef === null ? { existingOrderRef: (hold.existingOrderRef as string | null) ?? null } : {}),
      ...(typeof hold.existingTotalCents === "number" ? { existingTotalCents: hold.existingTotalCents } : {}),
      at: new Date().toISOString(),
    };
    await saveOrderRecord(ctx.env, order);
    await attemptInvoiceHeldNotify(ctx, order);
    return;
  } else {
    const error = String(seat.body.error ?? `seat answered HTTP ${seat.status}`).slice(0, 200);
    console.error(`[create_order] INVOICE MINT FAILED for ${order.orderRef} (record and team email stand): ${error}`);
    order.invoiceAttempt = { ok: false, error, at: new Date().toISOString() };
  }
  await saveOrderRecord(ctx.env, order);
}

// The team notification for a held invoice: the seat's
// notifyInvoiceHeld op emails the team inboxes with the hold and the
// differing fields. Its outcome is recorded on the order's held
// record, like every other chain step: a failure is its own partial
// state, and an idempotent replay re-attempts a failed notification
// without duplicating a sent one.
async function attemptInvoiceHeldNotify(ctx: Ctx, order: OrderRecord): Promise<void> {
  if (!order.invoiceHeld || order.invoiceHeld.notify?.sent) return;
  const held = order.invoiceHeld;
  const seat = await callSeat(ctx.env, "notifyInvoiceHeld", {
    orderRef: order.orderRef,
    mode: order.mode,
    testLane: order.mode === "test",
    organizationName: order.organizationName,
    contactName: order.contactName,
    contactEmail: order.contactEmail,
    contactPhone: order.contactPhone,
    quantity: order.quantity,
    size: order.size,
    mounting: order.mounting,
    antiMetalCount: order.antiMetalCount ?? null,
    linkDestination: order.linkDestination ?? null,
    artworkRef: order.artworkRef ?? null,
    shipTo: order.shipTo,
    exit: order.exit,
    totals: orderTotals(order),
    hold: {
      reason: held.reason,
      ...(held.differingFields ? { differingFields: held.differingFields } : {}),
      ...(held.existingInvoiceId ? { existingInvoiceId: held.existingInvoiceId } : {}),
      ...(held.existingStatus ? { existingStatus: held.existingStatus } : {}),
      ...("existingOrderRef" in held ? { existingOrderRef: held.existingOrderRef ?? null } : {}),
      ...(held.existingTotalCents !== undefined ? { existingTotalCents: held.existingTotalCents } : {}),
    },
  }, ctx.fetchFn);
  if (seat.ok) {
    const ref = typeof seat.body.messageId === "string" ? seat.body.messageId
      : typeof seat.body.messageRef === "string" ? seat.body.messageRef : undefined;
    held.notify = { sent: true, ...(ref ? { messageRef: ref } : {}), at: new Date().toISOString() };
  } else {
    const error = String(seat.body.error ?? `seat answered HTTP ${seat.status}`).slice(0, 200);
    console.error(`[create_order] INVOICE HELD NOTIFICATION FAILED for ${order.orderRef} (the hold stands on the record): ${error}`);
    held.notify = { sent: false, error, at: new Date().toISOString() };
  }
  await saveOrderRecord(ctx.env, order);
}

// Final-step chain, step 3: the customer email carrying the invoice
// and the design proof. Test lane: suppressed by rule. No artwork:
// the invoice still mints, this email does NOT fire, the state is
// recorded as proof_pending, and the email fires later from the
// business side's proof-hold machinery once the proof is published.
async function attemptCustomerEmail(ctx: Ctx, order: OrderRecord, statusRefPlain?: string): Promise<void> {
  if (order.mode === "test") {
    order.customerEmail = { sent: false, suppressed: "test lane: customer email is never sent for a test placement", at: new Date().toISOString() };
    await saveOrderRecord(ctx.env, order);
    return;
  }
  if (!order.artworkRef) {
    order.customerEmail = { sent: false, proofPending: true, at: new Date().toISOString() };
    await saveOrderRecord(ctx.env, order);
    return;
  }
  if (!order.invoice) return;
  const seat = await callSeat(ctx.env, "sendOrderInvoiceProof", {
    orderRef: order.orderRef,
    organizationName: order.organizationName,
    contactName: order.contactName,
    contactEmail: order.contactEmail,
    artworkRef: order.artworkRef,
    proofUrl: `https://tap.giving/mcp/artwork/${order.artworkRef}.png`,
    ...(statusRefPlain ? { statusRef: statusRefPlain } : {}),
    invoice: {
      id: order.invoice.invoiceId,
      number: order.invoice.invoiceNumber,
      hostedInvoiceUrl: order.invoice.hostedInvoiceUrl,
      invoicePdf: order.invoice.invoicePdf ?? null,
      totalCents: order.invoice.totalCents,
    },
  }, ctx.fetchFn);
  if (seat.ok) {
    const ref = typeof seat.body.messageId === "string" ? seat.body.messageId
      : typeof seat.body.messageRef === "string" ? seat.body.messageRef : undefined;
    order.customerEmail = { sent: true, ...(ref ? { messageRef: ref } : {}), at: new Date().toISOString() };
  } else if (seat.body.proof_pending === true || seat.body.proofPending === true) {
    order.customerEmail = { sent: false, proofPending: true, at: new Date().toISOString() };
  } else {
    const error = String(seat.body.error ?? `seat answered HTTP ${seat.status}`).slice(0, 200);
    console.error(`[create_order] CUSTOMER EMAIL FAILED for ${order.orderRef} (invoice stands): ${error}`);
    order.customerEmail = { sent: false, error, at: new Date().toISOString() };
  }
  await saveOrderRecord(ctx.env, order);
}

async function createOrderResult(ctx: Ctx, order: OrderRecord, replayed: boolean, statusRefPlain?: string): Promise<ToolResult> {
  // The final-step chain, in order: record (already durable), Ryan
  // email, invoice, customer email. Each step's outcome is recorded
  // on the order; a replay re-attempts only the missing steps.
  if (!order.orderEmail?.sent) {
    await attemptOrderEmail(ctx, order);
  }
  if (!order.invoice && !order.invoiceHeld) {
    await attemptInvoiceMint(ctx, order);
  }
  if (order.invoiceHeld && !order.invoiceHeld.notify?.sent) {
    // A replay after a hold never re-mints; it re-attempts only a
    // notification that has not gone out.
    await attemptInvoiceHeldNotify(ctx, order);
  }
  if (!order.customerEmail && (order.invoice || order.invoiceHeld || order.mode === "test" || !order.artworkRef)) {
    // The terminal non-send states (test-lane suppression, and
    // proof_pending on a no-artwork order) are recorded even when
    // the mint failed, so the record always states why no customer
    // email went out; the send itself still requires the invoice.
    await attemptCustomerEmail(ctx, order, statusRefPlain);
  }
  const quoteObj = quoteOutput(order.quote);
  // Visual standard: the order's own artwork rides the response
  // where it renders; otherwise the labeled product photo.
  let image: ToolResult["image"];
  if (order.artworkRef) {
    const rec = await readArtworkRecord(ctx.env, order.artworkRef);
    if (rec) {
      const stored = await ctx.env.MCP_ARTWORK.get(artworkBytesKey(order.artworkRef), "arrayBuffer");
      if (stored) {
        const onDisc = await renderArtworkOnDisc(new Uint8Array(stored), rec.detectedType, order.size === "100mm-square" ? "square" : "round", order.mounting === "screws");
        if (onDisc) image = { data: bytesToBase64(onDisc), mimeType: "image/png" };
      }
    }
  }
  if (!image) image = productPhotoImages()[0];
  const emailLine = order.orderEmail?.sent
    ? `The full order has been emailed to the Tap.Giving team${order.mode === "test" ? " (marked TEST, to the team's alert inboxes only)" : ""}, so the follow-up starts from the complete order.`
    : "The order record stands, but the email carrying the full order to the Tap.Giving team failed to send; the failure is logged on the order, and the team can still follow up from the durable record.";
  const partialStates: string[] = [];
  if (!order.orderEmail?.sent) partialStates.push("team_email_failed: the order record stands and the failure is recorded on it; a replay with the same idempotencyKey re-attempts only this email");
  if (order.invoiceHeld) {
    const held = order.invoiceHeld;
    partialStates.push(`invoice_held: the order is placed, and its invoice is held for review by the Tap.Giving team (${held.reason === "content_divergence" ? "the existing invoice for this order no longer matches the order" : "another open invoice already exists for this customer"}${held.differingFields?.length ? `; differing fields: ${held.differingFields.join(", ")}` : ""}); nothing was minted, the team has been notified, and a person resolves the hold before any invoice or proof email goes out`);
    if (!held.notify?.sent) partialStates.push("invoice_held_notify_failed: the hold stands on the order record, but the team notification did not send; a replay with the same idempotencyKey re-attempts only the notification");
  } else if (!order.invoice) partialStates.push("invoice_pending: the invoice was not minted (the seat error is recorded on the order); a replay with the same idempotencyKey re-attempts only the mint");
  if (order.invoice && !order.customerEmail?.sent) {
    if (order.customerEmail?.proofPending) partialStates.push("proof_pending: no artwork is attached to this order, so the customer email has not fired; it fires from the business side once the proof is published");
    else if (order.customerEmail?.suppressed) partialStates.push("customer_email_suppressed: test lane placements never email the customer");
    else if (order.customerEmail) partialStates.push("customer_email_failed: the invoice stands and the failure is recorded on the order; a replay with the same idempotencyKey re-attempts only this email");
  }
  const structured: Record<string, unknown> = {
    orderRef: order.orderRef,
    ...(replayed ? { replayed: true, note: "This idempotencyKey already created this order; the original orderRef is returned and no second order was written." } : {}),
    ...(statusRefPlain
      ? { statusRef: statusRefPlain, statusRefNote: "Your status reference: shown once, here and in the customer email. Keep it with the order confirmation; it cannot be recovered if lost. get_order_status reads the order with it, and nothing else can." }
      : { statusRefNote: "The status reference was shown once at placement and cannot be recovered; it is not stored in recoverable form." }),
    invreqKey: order.invreqKey,
    quote: quoteObj,
    exit: order.exit,
    confirmation: confirmationText(order.contactEmail),
    orderEmail: order.orderEmail ?? { sent: false, seat: ORDER_EMAIL_SEAT },
    invoice: order.invoice
      ? { id: order.invoice.invoiceId, number: order.invoice.invoiceNumber, status: order.invoice.status, hostedInvoiceUrl: order.invoice.hostedInvoiceUrl, totalCents: order.invoice.totalCents, ...(order.invoice.finalizedAt ? { finalizedAt: order.invoice.finalizedAt } : {}) }
      : null,
    ...(order.invoiceHeld
      ? { invoiceHeld: { reason: order.invoiceHeld.reason, ...(order.invoiceHeld.differingFields ? { differingFields: order.invoiceHeld.differingFields } : {}), ...(order.invoiceHeld.existingTotalCents !== undefined ? { existingTotalCents: order.invoiceHeld.existingTotalCents } : {}), notified: order.invoiceHeld.notify?.sent === true } }
      : {}),
    customerEmail: order.customerEmail ?? { sent: false },
    ...(partialStates.length ? { partialStates } : {}),
    crmExpectation: order.mode === "test"
      ? "Test lane: this order record stays in the test lane and does NOT enter the production CRM or fulfillment. The order email is marked TEST and goes only to the team's alert inboxes. Only the contact capture in start_order_intent touches the real lead list."
      : "The business record appears within about an hour under the organization's name, at stage \"ready\", " +
        "through the same process that handles website invoice requests. Source is distinguishable as the MCP; nothing else differs.",
    nextStep: order.exit === "pay_now"
      ? "The order is placed and the invoice and design proof are on their way to the contact email. The person pays the hosted invoice when it arrives; production waits for the proof approval by email."
      : "The order is placed and the invoice and design proof are on their way to the contact email, for the person to pay when they choose. A person approves the final proof by email before anything is printed.",
  };
  const text = [
    `Order placed: ${order.orderRef}.`,
    confirmationText(order.contactEmail),
    `Total: ${dollars(order.quote.grandTotalCents)} for ${order.quantity} discs. Shipping: Free.`,
    emailLine,
    order.invoice
      ? `Invoice ${order.invoice.invoiceNumber ?? order.invoice.invoiceId}: ${dollars(order.invoice.totalCents)}, payable on its hosted page: ${order.invoice.hostedInvoiceUrl}`
      : order.invoiceHeld
        ? "Invoice: held for review. The order is placed, but its invoice is held until a person from Tap.Giving reviews it; nothing was minted, and the team has been notified of the hold."
        : "Invoice: not minted yet; the failure is recorded on the order and a replay re-attempts only the mint.",
    ...(statusRefPlain ? [`Status reference (shown once; it cannot be recovered): ${statusRefPlain}`] : []),
    ...(partialStates.length ? partialStates.map((p) => `Partial state: ${p}.`) : []),
    structured.nextStep as string,
  ].join("\n");
  return { structured, text, image };
}

// ─── get_order_status ───────────────────────────────────────────────

async function toolGetOrderStatus(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  // The capability read (step 8): the status reference is the only
  // credential. Only its SHA-256 hash is stored; an unknown
  // reference answers not_found, indistinguishable from any other
  // unknown reference, and there is no enumeration surface.
  const statusRef = optString(args, "statusRef", 200);
  if (!statusRef) {
    throw invalidInput("Give the statusRef create_order returned at placement. It is shown once, at placement and in the customer email, and cannot be recovered.");
  }
  const hash = await sha256Hex(statusRef);
  const orderRef = await ctx.env.MCP_KEYS.get(`STATUS:${hash}`);
  const order = orderRef ? await readOrderRecord(ctx.env, orderRef) : null;
  if (!order || order.statusRefHash !== hash) {
    throw new ToolError("not_found", "That status reference is not one this server knows.");
  }

  // Live invoice state from Stripe, when an invoice exists.
  let invoiceState: Record<string, unknown> | null = null;
  if (order.invoice) {
    invoiceState = {
      status: order.invoice.status,
      hostedInvoiceUrl: order.invoice.hostedInvoiceUrl,
      invoiceId: order.invoice.invoiceId,
      invoiceNumber: order.invoice.invoiceNumber,
      totalCents: order.invoice.totalCents,
    };
    try {
      const key = stripeKeyFor(ctx.env, order.mode);
      const inv = await stripeCall(key, "GET", `/invoices/${order.invoice.invoiceId}`, undefined, undefined, ctx.fetchFn);
      invoiceState = {
        status: inv.status ?? order.invoice.status, hostedInvoiceUrl: inv.hosted_invoice_url ?? order.invoice.hostedInvoiceUrl,
        invoiceId: inv.id ?? order.invoice.invoiceId, invoiceNumber: inv.number ?? order.invoice.invoiceNumber,
        totalCents: inv.total ?? order.invoice.totalCents,
      };
      if (inv.status !== order.invoice.status) {
        order.invoice.status = inv.status;
        await saveOrderRecord(ctx.env, order);
      }
    } catch { /* the recorded state stands when Stripe is unreachable */ }
  }

  // Business records through the invocation seat: the stage and the
  // fulfillment state only. The tightened exposure set returns no
  // CRM row, no shipping phone, and no internal record ids.
  const seat = await callSeat(ctx.env, "readOrderRecords", {
    orgSlug: order.orgSlug,
    contactEmail: order.contactEmail,
    ...(order.invoice?.invoiceNumber ? { invoiceNumber: order.invoice.invoiceNumber } : {}),
    ...(order.invoice?.invoiceId ? { invoiceId: order.invoice.invoiceId } : {}),
  }, ctx.fetchFn);

  let stage: string;
  let fulfillment: Record<string, unknown> | null = null;
  if (seat.ok && seat.body.found) {
    const crmRow = seat.body.crmRow as Record<string, unknown> | undefined;
    stage = String(crmRow?.status ?? "ready");
    const f = (seat.body.fulfillment as Record<string, unknown> | null) ?? null;
    if (f) {
      fulfillment = {
        status: f.status ?? null,
        ...(f.tracking ? { tracking: f.tracking } : {}),
        ...(f.carrier ? { carrier: f.carrier } : {}),
      };
    }
  } else {
    stage = "received";
  }

  const structured: Record<string, unknown> = {
    orderRef: order.orderRef,
    stage,
    ...(order.invoiceHeld
      ? { invoiceHeld: { reason: order.invoiceHeld.reason, ...(order.invoiceHeld.differingFields ? { differingFields: order.invoiceHeld.differingFields } : {}), note: "Your order is placed, and its invoice is held for review by the Tap.Giving team; a person resolves the hold before any invoice or proof email goes out." } }
      : {}),
    ...(stage === "received" ? { stageNote: "Your order is in and being prepared. The business records catch up within about an hour; that wait is normal, not a problem with your order." } : {}),
    dashboard: {
      tapAddress: `https://go.tap.giving/${order.orgSlug}`,
      loginUrl: "https://tap.giving/login",
      username: order.orgSlug,
      note: "Your discs open your Tap.Giving address above. Sign in to the Redirect Dashboard at the login URL with that address's name as the username; your password arrives by email with your shipping notice.",
    },
    fulfillment: fulfillment ?? { status: null, note: "No fulfillment record yet: fulfillment begins after payment and proof approval, both human steps." },
    invoice: invoiceState,
    design: order.artworkRef ? { artworkRef: order.artworkRef } : { state: "not-attached" },
    exit: order.exit,
    quantity: order.quantity,
    size: order.size,
    mounting: order.mounting,
  };
  let image: ToolResult["image"];
  if (order.artworkRef) {
    const rec = await readArtworkRecord(ctx.env, order.artworkRef);
    if (rec) {
      const stored = await ctx.env.MCP_ARTWORK.get(artworkBytesKey(order.artworkRef), "arrayBuffer");
      if (stored) {
        const onDisc = await renderArtworkOnDisc(new Uint8Array(stored), rec.detectedType, order.size === "100mm-square" ? "square" : "round", order.mounting === "screws");
        if (onDisc) {
          image = { data: bytesToBase64(onDisc), mimeType: "image/png" };
          (structured.design as Record<string, unknown>).imageLabel = "submitted artwork, shown on the disc (an on-disc preview render, not the proof)";
          (structured.design as Record<string, unknown>).proofNote = "The final proof is emailed to the contact for approval; no proof image is stored on this server.";
        }
      }
    }
  }
  if (!image) image = productPhotoImages()[0];
  const text = [
    `Order ${order.orderRef}: stage ${stage}.`,
    invoiceState ? `Invoice ${invoiceState.invoiceNumber ?? invoiceState.invoiceId}: ${invoiceState.status}. Pay it on its hosted page: ${invoiceState.hostedInvoiceUrl}` : order.invoiceHeld ? "Invoice: held for review. Your order is placed; a person from Tap.Giving resolves the hold before any invoice or proof email goes out." : "Invoice: not minted yet; the order record carries the mint state, and the team follows up from the record.",
    ...((structured.design as Record<string, unknown>).imageLabel ? ["The image with this answer is your submitted artwork on the disc (a preview render, not the proof). The final proof arrives by email for approval."] : ["The photo with this answer shows the disc in use: a phone tapping a disc on a chair back."]),
    fulfillment ? `Fulfillment: ${fulfillment.status}${fulfillment.tracking ? `, tracking ${fulfillment.tracking} (${fulfillment.carrier})` : ""}.` : "Fulfillment has not begun (it starts after payment and proof approval).",
    `Your discs open https://go.tap.giving/${order.orgSlug}. Redirect Dashboard: sign in at https://tap.giving/login with username ${order.orgSlug}; your password arrives by email with your shipping notice.`,
  ].join("\n");
  return { structured, text, image };
}

// ─── registry ───────────────────────────────────────────────────────

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, unknown>;
  run: (ctx: Ctx, args: Record<string, unknown>) => Promise<ToolResult>;
}

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export const TOOLS: ToolDef[] = [
  {
    name: "get_discovery",
    description:
      "Start here, with the design tool. One call orients a cold agent: the builder's introduction (NFC Tap Builder by Tap.Giving), what the tool does (print-ready NFC tap artwork proofs from the published spec and design directions, yours to take to any printer), the product in plain words, " +
      "the first choice (shape: round or square), the artwork spec summary, and the full capability list with the human gates. Ordering is the optional step after the design path. " +
      "Discovery states the access model up front: no account, key, or login at any point; order status is read with the status reference returned at placement. " +
      "The optional intent argument is echoed back as guidance; a disc count in it points at get_quote for the binding total at that count. " + GATES.payment,
    inputSchema: { type: "object", properties: { intent: { type: "string", description: "Optional free-text description of what the person wants (for example an organization type and a rough disc count). It is echoed back as guidance; a disc count in it points at get_quote for the binding total at that count." } } },
    annotations: READ,
    run: toolGetDiscovery,
  },
  {
    name: "get_quote",
    description:
      "The binding quote for a prospective order (also known as get_pricing): quantity, tier, list totals as the headline, and one payable first-order total with the first-order discount scope and its 7-day renewing window explained in plain words. " +
      "add-ons, free shipping as its own line, the exact grand total, and the turnaround (2 to 3 weeks from artwork approval). No tax line: " + TAX_NOTE + " " +
      "Quantities below the 100-disc minimum are refused by this tool itself. Call this when the person names a quantity and wants the exact price; for product facts without a quantity, call get_product instead. The next step after a quote is get_order_questions; the artwork path is get_artwork_spec and submit_artwork.",
    inputSchema: {
      type: "object",
      required: ["quantity"],
      properties: {
        quantity: { type: "integer", minimum: 1, description: "Discs wanted. Minimum 100, maximum 7000." },
        antiMetalCount: { type: "integer", minimum: 0, description: "How many discs go on metal surfaces and need the $1 shielding layer. Omit when unknown (unknown bills nothing). Counts above the quantity are clamped and the clamp is reported." },
      },
    },
    annotations: READ,
    run: toolGetQuote,
  },
  {
    name: "get_product",
    description:
      "The full product facts. Prices are stated in the order phase (get_order_questions, get_quote, get_recap), not here. Returns one block per topic: discs (the locked tap chip, 0.85 mm double-laminated matte waterproof PVC, the 100 mm (4 inch) round and square built-ins; every other size is a manual exception), mounting (options and the metal caveat), stands and badges (table stands and lanyard badges, from the team by email, not ordered through this server), shipping (2 to 3 weeks from artwork approval), samples (there is no sample program; the emailed proof stands in for it), and ordering (tax-exempt, payment, reorder, and design help), plus the Redirect Dashboard and the destination model: per-disc pointing, two destinations, dashboard sign-in timing, and phone compatibility with the printed-code fallback. " +
      "Pass the optional topic argument to return only one block. Call this for product facts alone; for a first orientation call get_discovery, and for the price at a quantity call get_quote.",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string", enum: [...PRODUCT_TOPICS], description: "Optional: return only this one product block (discs, stands, badges, mounting, shipping, samples, or ordering). Omit it to return every block." } },
    },
    annotations: READ,
    run: toolGetProduct,
  },
  {
    name: "get_artwork_spec",
    description:
      "The production artwork spec for the chosen shape: 106 mm artboard, cut, bleed, and safe-zone geometry as structured millimetre data plus plain guidelines, " +
      "the format wanted back (vector, SVG preferred), delivered example designs to react to (real organizations' finished discs, indexed in full with a bounded set shown inline), labeled explainer photos of discs in place, and the optional logo ask. The agent builds the artwork with its own tools; " +
      "this server has no design-generation tool. The artwork composed from this spec is the organization's own, vendor-neutral and print-ready to take to any printer. No key needed. Choose the shape first (the discovery call names it the first choice), then call this for that shape; call get_discovery instead when the person has not chosen yet, and submit_artwork once the artwork file exists. " +
      "The shape argument selects round or square geometry; chosenExampleRef carries the delivered example the person picked, from the examples this tool returns.",
    inputSchema: {
      type: "object",
      properties: {
        shape: { type: "string", enum: ["round", "square"], description: "The disc shape to return geometry for: round or square. Omit it to return both shapes." },
        chosenExampleRef: { type: "string", description: "The delivered example the person picked: its pick-list number for the chosen shape, any example id from the structured examples index, or the example's description words. It is carried with the spec as the design reference." },
      },
    },
    annotations: READ,
    run: toolGetArtworkSpec,
  },
  {
    name: "submit_artwork",
    description:
      "Send the finished artwork back and see it on the disc as a proof. The artwork stays the organization's own: print-ready and vendor-neutral, theirs to take to any printer; submitting it obliges no order. Intake is permissive by ruling: a real image is accepted in any format and rejected only on three sanity grounds " +
      "(malicious or masquerading content, over 5 MB decoded, or not decodable as the type it claims). Production fitness is judged later in the normal proof flow, never here. " +
      "No email is needed on the cold path. The optional designUrl argument records the destination the design was built for (mid-to-late design phase); the optional chosenExampleRef names the delivered example the design follows, and its reproduction data rides the answer beside the verify-against-example checklist. The file argument carries the artwork file (filename, mediaType, contentBase64); sha256 is the hex SHA-256 of those file bytes; shape optionally names the shape the artwork was designed for; orderRef optionally attaches the submission to an existing order; logo optionally carries the source logo the artwork was built from; note is free text for the team. Each call creates a separate submission: resubmitting the same file mints a new artworkRef rather than replacing the earlier one. Returns the artworkRef every later step carries, a displayUrl, and a preview of the person's own design composited on the disc (cut shape applied) for the renderable formats (SVG, PNG, JPEG, WebP, GIF); for a format this server cannot render here (for example PDF), the answer says so plainly and never promises a preview or an email at this stage. " +
      GATES.designApproval,
    inputSchema: {
      type: "object",
      required: ["file", "sha256"],
      properties: {
        file: {
          type: "object", description: "The artwork file itself: its filename, its media type, and its bytes as base64.", required: ["filename", "mediaType", "contentBase64"],
          properties: { filename: { type: "string" }, mediaType: { type: "string" }, contentBase64: { type: "string" } },
        },
        sha256: { type: "string", description: "Hex SHA-256 of the file bytes." },
        shape: { type: "string", enum: ["round", "square"], description: "Optional: the shape the artwork was designed for; the on-disc preview uses its cut. Omit it and the preview shows both shapes." },
        orderRef: { type: "string", description: "Optional: attach the submission to an order already created (the orderRef create_order returned)." },
        logo: {
          type: "object",
          properties: { filename: { type: "string" }, mediaType: { type: "string" }, contentBase64: { type: "string" } },
          description: "Optional source logo the artwork was built from; travels with the submission as source material.",
        },
        note: { type: "string", description: "Optional free-text note for the Tap.Giving team, carried with the submission." },
        designUrl: { type: "string", description: "Optional: the URL the disc should open, entered in the design phase. The design QR code is a labeled mock built from it; production encodes the disc's Redirect Dashboard link to this same destination, and the recap confirms it." },
        chosenExampleRef: { type: "string", description: "Optional: the delivered example this design follows (its pick-list number, an example id, or the example's description words); its reproduction data rides the answer." },
      },
    },
    annotations: WRITE,
    run: toolSubmitArtwork,
  },
  {
    name: "start_order_intent",
    description:
      "An optional step on the order path, not the start of the journey: capture a contact email through the same public capture endpoint the website's email-first door uses, " +
      "so follow-up rides the existing lead machinery. No key needed. An intent is a lead, not an order: it creates no invoice and reserves nothing. " +
      "Returns an intentRef, links an artworkRef when given, and says plainly what follow-up to expect. The email must be a real, reachable address: reserved domain endings (.example, .test, .invalid) and the example domains are refused, because no follow-up could ever reach them. " +
      "Placing an order needs no key. One intent per email: a repeat call with the same email returns the existing intentRef and creates no second lead. This call captures the contact only; create_order is the later call that sets up the order itself, and it needs no key either.",
    inputSchema: {
      type: "object",
      required: ["email"],
      properties: {
        email: { type: "string", description: "The contact email to capture; follow-up goes to this address." },
        organizationName: { type: "string", description: "Optional organization name." },
        quantityHint: { type: "integer", description: "Optional rough disc count the person mentioned; it shapes the follow-up and is not a binding quote." },
        artworkRef: { type: "string", description: "Optional: link an earlier submit_artwork reference to this intent." },
        sourceNote: { type: "string", description: "Optional free-text note about where this contact came from or what they asked about; it travels with the lead for the team." },
      },
    },
    annotations: WRITE,
    run: toolStartOrderIntent,
  },
  {
    name: "get_order_questions",
    description:
      "The order questions as structured data, returned in the exact order to ask them: the contact email first (captured through start_order_intent), then the organization name, the shipping address and phone, quantity, shape, the metal count, mounting with the picture assets, and the link destination as a confirmation of the destination carried from the design. The contact name and phone ride create_order. " +
      "Prices are first stated here, in the order phase: the price range and the no-fees line ride this answer. Call this when the person is ready to order; for a first orientation, call get_discovery.",
    inputSchema: { type: "object", properties: {} },
    annotations: READ,
    run: toolGetOrderQuestions,
  },
  {
    name: "get_recap",
    description:
      "The full recap, the last thing before the exits: it validates the same order inputs create_order will carry (quantity from 100 to 7000, one of the two built-in sizes, adhesive or screws mounting, a complete shipping address) and returns the submitted artwork (displayUrl plus image content where renderable), the quantity, the shipping address as entered, " +
      "the exact cost from get_quote, and both required notes. Returns a recapRef; create_order carries it, and an order whose inputs differ from the recap is refused as a conflict. No key needed.",
    inputSchema: {
      type: "object",
      required: ["quantity", "size", "mounting", "shipTo"],
      properties: {
        quantity: { type: "integer", description: "Discs in the order, 100 to 7000; priced from the published tiers." },
        size: { type: "string", enum: ["100mm-round", "100mm-square"], description: "The built-in size and shape: 100mm-round or 100mm-square." },
        mounting: { type: "string", enum: ["adhesive", "screws"], description: "How the discs mount: adhesive backing, or pre-drilled screw holes plus adhesive." },
        antiMetalCount: { type: "integer", description: "How many discs sit on metal surfaces and need the $1 shielding layer. Omit when unknown; an unknown count bills nothing." },
        shipTo: {
          type: "object", description: "The shipping address for the finished discs; every field is required, and the phone is its own field.", required: ["name", "street", "city", "state", "postalCode", "country", "phone"],
          properties: {
            name: { type: "string", description: "Recipient name or organization name at the shipping address." }, street: { type: "string", description: "Street address." }, city: { type: "string", description: "City." },
            state: { type: "string", description: "State or province." }, postalCode: { type: "string", description: "Postal or ZIP code." }, country: { type: "string", description: "Country." }, phone: { type: "string", description: "A phone number for the delivery address." },
          },
        },
        artworkRef: { type: "string", description: "Optional: the artwork reference submit_artwork returned, shown on the disc in the recap." },
        linkDestination: { type: "string", description: "Optional: the page a tap opens. Any http or https URL, changeable anytime; the Redirect Dashboard is the default." },
        contactEmail: { type: "string", description: "The order contact email; the final proof is emailed there, so it must be an address the organization owns." },
        contactName: { type: "string", description: "Optional display only: the contact person's name, echoed in the recap." },
        contactPhone: { type: "string", description: "Optional display only: the contact phone, echoed in the recap." },
      },
    },
    annotations: READ,
    run: toolGetRecap,
  },
  {
    name: "create_order",
    description:
      "The final step of the order path, labeled \"Email me my invoice and design proof.\" Set up an order through the same front door a website order takes (an INVREQ record the hourly adoption resolves into the CRM, indistinguishable downstream). " +
      "This is the lock-in write behind both recap exits; it carries the recapRef and a required idempotencyKey (a retry with the same key and payload returns the original orderRef; the same key with a different payload is a conflict naming the differing fields). " +
      "The 100-disc minimum is enforced here. Sizes other than the two built-ins return manual_exception. Returns the orderRef (the reference every later call uses), the exact quote, the chosen exit, and the next step. " +
      "Failure modes: a recap whose inputs differ from the order is refused as a conflict naming the differing fields; a reused idempotencyKey with a different payload is a conflict naming the original order. " +
      "Routing: start_order_intent is the earlier contact capture, and get_recap must run immediately before this call over the same inputs. Placing the order records it, emails the full order to the Tap.Giving team, creates the invoice at the quoted total, and emails the invoice and the design proof to the contact; the response carries each step's outcome, the settled confirmation text, and the order's status reference (shown once; it cannot be recovered). A replay with the same idempotencyKey re-attempts only the steps that did not complete. " + GATES.designApproval + " " + GATES.payment,
    inputSchema: {
      type: "object",
      required: ["contactName", "contactEmail", "contactPhone", "quantity", "size", "mounting", "shipTo", "recapRef", "idempotencyKey"],
      properties: {
        contactName: { type: "string", description: "The contact person's name for the order." },
        contactEmail: { type: "string", description: "The order contact email; the final proof is emailed there, so it must be an address the organization owns." },
        contactPhone: { type: "string", description: "A phone number that reaches the contact." },
        organizationName: { type: "string", description: "Organization name for the order." },
        quantity: { type: "integer", description: "Discs in the order, 100 to 7000." },
        size: { type: "string", description: "100mm-round or 100mm-square; anything else is a manual exception handled by hand through the Tap.Giving team." },
        mounting: { type: "string", enum: ["adhesive", "screws"], description: "How the discs mount: adhesive backing, or pre-drilled screw holes plus adhesive." },
        antiMetalCount: { type: "integer", description: "How many discs sit on metal surfaces and need the $1 shielding layer. Omit when unknown." },
        shipTo: {
          type: "object", description: "The shipping address for the finished discs; every field is required.", required: ["name", "street", "city", "state", "postalCode", "country", "phone"],
          properties: {
            name: { type: "string", description: "Recipient name or organization name at the shipping address." }, street: { type: "string", description: "Street address." }, city: { type: "string", description: "City." },
            state: { type: "string", description: "State or province." }, postalCode: { type: "string", description: "Postal or ZIP code." }, country: { type: "string", description: "Country." }, phone: { type: "string", description: "A phone number for the delivery address." },
          },
        },
        linkDestination: { type: "string", description: "Any http or https URL; optional, changeable anytime; the Redirect Dashboard is the default." },
        artworkRef: { type: "string", description: "The artwork reference submit_artwork returned for this order's design." },
        note: { type: "string", description: "Optional free-text note carried on the order for the team." },
        recapRef: { type: "string", description: "The reference get_recap returned for these same inputs; the order is refused if its inputs differ from that recap." },
        exit: { type: "string", enum: ["pay_now", "lock_in"], description: "The person's chosen exit, recorded on the order. Both exits write the same record shape." },
        idempotencyKey: { type: "string", description: "8 to 128 characters, minted per intended order, reused on retries." },
      },
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: toolCreateOrder,
  },
  {
    name: "get_order_status",
    description:
      "Where an order stands, read with the order's status reference: the capability create_order returned once at placement (also carried in the customer email). No account or login exists; the reference itself is the credential, and an unknown reference answers not_found. Returns the tightened exposure set: the stage, the fulfillment state with tracking when present, the invoice state with its hosted link, the quantity, shape, and mounting, the order's own artwork preview, and the Redirect Dashboard block. It never returns the full business record, a shipping phone, or internal record ids. " +
      "An order not yet adopted returns stage \"received\" with the adoption expectation, not an error. Call this to check an existing order; it never changes anything. Use get_recap before an order exists and get_order_questions to gather an order's inputs.",
    inputSchema: {
      type: "object",
      required: ["statusRef"],
      properties: { statusRef: { type: "string", description: "The status reference create_order returned at placement. Shown once; it cannot be recovered if lost." } },
    },
    annotations: READ,
    run: toolGetOrderStatus,
  },
];

export function toolByName(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

const WRITE_TOOLS = new Set(["submit_artwork", "start_order_intent", "create_order"]);
export { WRITE_TOOLS };

export async function runTool(
  env: Env, request: Request, name: string, args: Record<string, unknown>,
  // The default must wrap the global: a bare `fetch` reference loses
  // its receiver in the Workers runtime ("Illegal invocation") when
  // the caller passes it through as a value.
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<ToolResult> {
  const def = toolByName(name);
  if (!def) throw new ToolError("not_found", `Unknown tool: ${name}.`);
  // No keys anywhere: no credential is read, required, or honored on
  // any call. An Authorization header, if a client sends one, is
  // ignored identically.
  const ctx: Ctx = { env, request, fetchFn };
  return await def.run(ctx, args);
}
