// The v1 tool surface (spec section 2): contracts, annotations, and
// implementations. Every result returns both MCP structured content
// and a plain-text rendering. Tool descriptions carry the gate
// sentences of section 4, so a client that never reads the spec still
// meets the boundaries in tools/list.

import {
  ARTWORK_GUIDELINES, ARTWORK_GEOMETRY, BENEFITS, ENDPOINT, GATES, KEY_REQUEST_LINE,
  LINK_DESTINATION_NOTE, MOUNTING_OPTIONS, PRODUCT, PRODUCT_TOPICS, RECAP_NOTES,
  DESTINATION_MODEL, DISCOUNT_WINDOW_MEANING, TEST_KEY_LINE, TURNAROUND,
  NO_FEES_LINE, TEAM_EMAIL,
  SERVER_DESCRIPTION, SERVER_NAME, POSITIONING_LINE, PRESENTATION_SYNONYMS, TAX_NOTE, PRICE_RANGE_LINE } from "./facts.ts";
import { PRICING_TIERS } from "./pricing.ts";
import { renderArtworkOnDisc, bytesToBase64, SCREW_HOLES } from "./preview.ts";
import phoneTapPhoto from "./product-assets/phone-tap.webp.ts";
import mountAdhesivePhoto from "./product-assets/mount-adhesive.webp.ts";
import mountScrewsPhoto from "./product-assets/mount-screws.webp.ts";
import { MAX_QTY, MIN_QTY, PRICE_SOURCE, quoteFor, tierForQuantity, type Quote } from "./pricing.ts";
import {
  ToolError, invalidInput, isRecord, optInt, optString, reqInt, reqString,
} from "./errors.ts";
import { authenticate, requireKey, sha256Hex, touchKey, type AuthedKey } from "./keys.ts";
import { DETECTED_MEDIA_TYPE, MAX_ARTWORK_BYTES, sniffArtwork } from "./sniff.ts";
import { callSeat } from "./seat.ts";
import { StripeCallError, mintInvoice, stripeCall } from "./stripe.ts";
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
  auth: AuthedKey | null;
  fetchFn: typeof fetch;
}

function orderNamespace(env: Env, mode: "live" | "test"): KVNamespace {
  return mode === "live" ? env.ORDERS : env.DEV_ORDERS;
}

function stripeKeyFor(env: Env, mode: "live" | "test"): string {
  const key = mode === "live" ? env.STRIPE_API_KEY_LIVE : env.STRIPE_API_KEY_TEST;
  if (!key) throw new ToolError("stripe_unavailable", "Stripe is not configured for this key's mode right now. Nothing was minted; it is safe to retry later.");
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
    turnaround: TURNAROUND,
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
    ...(cmp ? [cmp.line] : []),
    addOns ? `Add-ons:\n${addOns}` : "Add-ons: none.",
    `Shipping: Free`,
    `${q.taxNote}`,
    TURNAROUND,
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
  return {
    id: e.id, organization: e.organization, shape: e.shape,
    displayUrl: `https://tap.giving/mcp/examples/${e.id}.png`,
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
    sizes: "100 mm (4 inch), round or square. Every other size or shape is a manual exception handled by hand.",
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
  if (countMatch) {
    const n = parseInt(countMatch[1].replace(/,/g, ""), 10);
    if (n >= MIN_QTY && n <= MAX_QTY) {
      intentHeadline = `About ${n} discs: start with the shape choice, then get_artwork_spec to build the proof; call get_quote with ${n} for the binding total at that count.`;
      intentTextLine = `For ${n} discs: the binding total comes from get_quote at that exact count; the design path starts with the shape choice and get_artwork_spec.`;
    }
  }
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
      { step: "order, optional", tool: "get_quote", detail: "Only if you want discs from Tap.Giving: the binding quote at an exact quantity, then the order questions, the recap, and placing the order. A person from Tap.Giving follows up with the invoice." },
    ],
    pricing: {
      range: PRICE_RANGE_LINE,
      shipping: "Free on every order.",
      note: "Call get_quote for the binding quote at an exact quantity.",
    },
    artworkSpec: {
      summary: "106 mm (about 4.2 inch) square artboard; 100 mm (4 inch) cut (round or square); 3 mm (about 0.12 inch) bleed; vector artwork back (SVG preferred).",
      tool: "get_artwork_spec",
    },
    destination: DESTINATION_MODEL,
    turnaround: TURNAROUND,
    testKey: TEST_KEY_LINE,
    photos: productPhotoStructured(),
    capabilities: {
      readTools: ["get_discovery", "get_quote", "get_product", "get_artwork_spec", "get_order_questions", "get_recap"],
      keyedReadTools: ["get_order_status"],
      writeTools: ["submit_artwork", "start_order_intent", "create_order", "request_invoice", "register_webhook"],
      gates: [GATES.designApproval, GATES.payment, GATES.production],
      howToGetAKey: KEY_REQUEST_LINE,
      keyWait: "Placing an order needs no key: the whole placement run is keyless (the order questions, the recap, and placing the order), and a person from Tap.Giving follows up with the invoice. A key is optional and organization-bound: it enriches the order questions with the key's own organization block, and it governs order status (get_order_status) and webhook registration (register_webhook).",
      kickoff: "get_artwork_spec",
      benefits: BENEFITS,
      guarantee: "Covered by our 30-day money-back guarantee.",
    },
    ...(intentEcho ? { guidance: intentHeadline ?? `Noted intent: ${intentEcho}. Start with the shape choice, then get_artwork_spec.` } : {}),
  };
  const text = [
    `${SERVER_NAME}`,
    POSITIONING_LINE,
    ``,
    `What it is`,
    `A tap disc is a small physical disc a phone taps to open your page instantly. It carries a locked tap chip. It comes in one standardized 4-inch size (100 mm), in two shapes, and it is durable waterproof PVC.`,
    `The discs themselves are for organizations of every kind, designed by your own agent.`,
    DESTINATION_MODEL,
    ``,
    `How it works: the design path first`,
    `1. Start with the shape, round or square.`,
    `2. Get the artwork spec and the design directions for that shape from get_artwork_spec.`,
    `3. Build the artwork from a direction with your own tools, adding the organization's logo or name.`,
    `4. Submit the finished file with submit_artwork and see it on the disc as a proof. The artwork is yours from here: take it to any printer, or order the discs from Tap.Giving.`,
    `5. Optional, only if you want the discs made: get the binding quote from get_quote, answer the order questions, check the recap, and place the order. A person from Tap.Giving follows up with the invoice, and the final proof is emailed for a person's approval before anything is printed.`,
    ``,
    `Why Tap.Giving`,
    NO_FEES_LINE,
    ...BENEFITS.map((b) => `- ${b}`),
    ``,
    `Pricing`,
    `${PRICE_RANGE_LINE} Free shipping. ${TAX_NOTE} Every order is covered by our 30-day money-back guarantee. Production and delivery run 2 to 3 weeks from artwork approval.`,
    ``,
    `Gates`,
    `Design approval, payment, and production release stay human: a person approves the final proof by email. This server moves no money itself and issues no invoices: a person from Tap.Giving follows up with the invoice.`,
    `Placing an order needs no key: the whole placement run is keyless (the order questions, the recap, and placing the order), and a person from Tap.Giving follows up with the invoice. Order status is the one read that uses the organization key. ${KEY_REQUEST_LINE} ${TEST_KEY_LINE}`,
    ...(intentTextLine ? [intentTextLine] : []),
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
      sizes: p.sizes,
      sizePolicy: p.sizePolicy,
      mounting: p.mountingDetail,
      metalCaveat: p.metalCaveat,
      redirectDashboard: p.redirectDashboard,
      destination: DESTINATION_MODEL,
      worksWith: p.worksWith,
      guarantee: p.guarantee,
      priceRange: PRICE_RANGE_LINE,
    },
    photos: productPhotoStructured(),
    stands: { products: p.stands, ordering: "Stands come from the Tap.Giving team, not through this server: email hello@tap.giving to add them to an order. Discs are the orderable product here." },
    badges: { products: p.badges, ordering: "Badges come from the Tap.Giving team, not through this server: email hello@tap.giving to add them to an order. Discs are the orderable product here." },
    mounting: { options: MOUNTING_OPTIONS.map((o) => ({ value: o.value, text: o.text })), detail: p.mountingDetail, metalCaveat: p.metalCaveat },
    shipping: { cost: p.shipping.cost, terms: p.shipping.terms },
  };
  // Item 9: a topic answer carries the same structure as the
  // all-topics answer: the topic block under its topic name, beside
  // the server's photos and the destination model, not flattened
  // bare fields with the context blocks dropped.
  const structured = topic
    ? { topic, [topic]: full[topic], photos: productPhotoStructured(), ...(topic === "mounting" ? { mountingPhotos: mountingPhotoStructured() } : {}), destination: DESTINATION_MODEL }
    : full;
  const text = topic
    ? JSON.stringify(structured[topic as string], null, 2)
    : [
      `Tap discs: ${p.chipPlain}. ${p.material}.`,
      PRICE_RANGE_LINE,
      p.sizePolicy,
      p.mountingDetail,
      p.metalCaveat,
      p.redirectDashboard,
      DESTINATION_MODEL,
      p.worksWith,
      p.guarantee,
      `Table stands (70 x 100 mm, 120 x 140 mm) and lanyard badges (90 x 130 mm) come from the Tap.Giving team: email hello@tap.giving to add them to an order. Discs are the orderable product here.`,
      `${p.shipping.cost} ${p.shipping.terms}`,
      `The photo with this answer shows the disc in use: a phone tapping a disc on a chair back. The structured photos list the labeled photo set from the website library (settings, tap moments, product details, mounting): show them whenever the person wants to see the disc in place.`,
    ].join("\n");
  const images = topic === "mounting"
    ? [...productPhotoImages(), ...mountingPhotoImages()]
    : productPhotoImages();
  return { structured, text, images };
}

// Resolve the caller's example choice: an example id from the full
// delivered set for the shape, or a pick-list number within the shown
// inline subset. An unknown value is refused, naming what is valid,
// never silently echoed.
function resolveChosenExample(
  ref: string,
  shape?: string,
): DeliveredExample {
  const all = examplesForShape(shape);
  const byId = all.find((e) => e.id === ref);
  if (byId) return byId;
  if (/^\d+$/.test(ref)) {
    const inline = all.slice(0, INLINE_EXAMPLE_LIMIT);
    const n = parseInt(ref, 10);
    if (n >= 1 && n <= inline.length) return inline[n - 1];
  }
  throw invalidInput(
    `chosenExampleRef "${ref}" is not one of the delivered examples${shape ? ` for the ${shape} shape` : ""}. ` +
    `Pick by number from the shown list (${all.slice(0, INLINE_EXAMPLE_LIMIT).map((e, i) => `${i + 1}. ${e.organization} (${e.id})`).join("; ")}) or pass any example id from the structured examples index.`,
    { validExampleIds: all.map((e) => e.id) },
  );
}

async function toolGetArtworkSpec(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const shape = optString(args, "shape", 20);
  if (shape !== undefined && shape !== "round" && shape !== "square") {
    throw invalidInput(`shape must be "round" or "square".`);
  }
  const chosenExampleRef = optString(args, "chosenExampleRef", 80);
  const chosen = chosenExampleRef ? resolveChosenExample(chosenExampleRef, shape) : undefined;
  const structured = artworkSpecObject(shape);
  if (chosenExampleRef && chosen) {
    structured.chosenExampleRef = chosenExampleRef;
    structured.chosenExample = {
      id: chosen.id, organization: chosen.organization, shape: chosen.shape,
      displayUrl: `https://tap.giving/mcp/examples/${chosen.id}.png`,
    };
  }
  // The structured index carries the FULL delivered set for the shape.
  // Inline images stay bounded: the first INLINE_EXAMPLE_LIMIT examples
  // for the shape (or the single chosen one), then the two mounting
  // photos. The numbered pick list covers the inline subset, in the
  // same order as the image blocks that follow the text.
  const allForShape = examplesForShape(shape);
  const inlineSubset = allForShape.slice(0, INLINE_EXAMPLE_LIMIT);
  const pickList = inlineSubset.map((e, i) =>
    `${i + 1}. ${e.organization} (${e.shape}): the design delivered to ${e.organization}, at https://tap.giving/mcp/examples/${e.id}.png.`);
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
          `Delivered examples: ${allForShape.length} real ${shapeWord} designs that Tap.Giving produced and delivered to organizations. The full set is in the structured examples index with a display URL for each; the first ${inlineSubset.length} ride along in the images that follow, then the two mounting photos.`,
          ...pickList,
          `Tell me the number of an example from the list above, or pass any example id from the structured index as chosenExampleRef. Then compose original artwork for the organization you are working with, using the example as a reference, and submit it with submit_artwork. An example is a real organization's delivered design: it is never shipped to a different organization as-is.`,
          `The artwork you compose is yours: print-ready and vendor-neutral, yours to take to any printer. Nothing in this spec or the proof obliges an order from Tap.Giving.`,
        ]),
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
  logoDataUrl?: string;
  createdAt: string;
  seatRecorded: boolean;
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

  // Order binding checks, when an order or a key is in play.
  let orgSlug: string | null = ctx.auth?.record.orgSlug ?? null;
  if (orderRef) {
    const order = await readOrderRecord(ctx.env, orderRef);
    if (!order) throw new ToolError("not_found", `orderRef ${orderRef} is not an order this server knows.`);
    if (ctx.auth && order.orgSlug !== ctx.auth.record.orgSlug) {
      throw new ToolError("forbidden", "That order belongs to a different organization than this key.");
    }
    if (!ctx.auth && order.orgSlug !== orgSlug && orgSlug !== null) {
      throw new ToolError("forbidden", "That order belongs to an organization; attach artwork to it with that organization's key.");
    }
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
      "The design is the person's to keep from here: the submitted file is theirs, print-ready and vendor-neutral, to take to any printer. " +
      "Nothing is emailed at this stage: the emailed final proof belongs to the order stage, after order setup. " +
      "If they want the discs made by Tap.Giving (optional), the order path runs keyless end to end: capture the contact email (start_order_intent), ask the order questions (get_order_questions), show the recap (get_recap), and place the order (create_order). A person from Tap.Giving then follows up with the invoice. No key is needed at any step of placing the order.",
  };
  const text = [
    `Artwork received: ${artworkRef} (${filename}, ${detectedType}, ${bytes.length} bytes).`,
    findings.length ? findings.join(" ") : "Accepted under the permissive intake policy.",
    previewKind === "on-disc"
      ? (shapeArg
          ? `Here is your design on the ${shapeArg} disc, in the images that follow; this preview is the design check at this stage.`
          : `Here is your design on the disc, shown on both shapes in the images that follow; the shape chosen at order setup settles which one is printed. This preview is the design check at this stage.`)
      : previewKind === "submitted-file"
        ? `The on-disc render was unavailable in this call, so your submitted file is shown as-is. Nothing is emailed at this stage: no contact is captured yet.`
        : `Your file is on record; it could not be rendered to an image here. Nothing is emailed at this stage: no contact is captured yet.`,
    ...(fontNote ? [fontNote] : []),
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
    if (ctx.auth && artworkRec.orgSlug && artworkRec.orgSlug !== ctx.auth.record.orgSlug) {
      throw new ToolError("forbidden", "That artwork was submitted under a different organization.", { retryable: false });
    }
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
        if (ctx.auth && !artworkRec.orgSlug) artworkRec.orgSlug = ctx.auth.record.orgSlug;
        await ctx.env.MCP_ARTWORK.put(artworkJsonKey(artworkRef), JSON.stringify(artworkRec), { expirationTtl: ARTWORK_TTL });
        existing.artworkRef = artworkRef;
        await ctx.env.MCP_KEYS.put(`INTENT:${indexedRef}`, JSON.stringify(existing), { expirationTtl: 30 * DAY });
      }
      const keyedExisting = !!ctx.auth;
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
          nextStep: keyedExisting
            ? "Placing the order needs no key: get_order_questions, then get_recap, then create_order; a person from Tap.Giving follows up with the invoice. " +
              " An intent is a lead, not an order: it creates no invoice and reserves nothing."
            : "Placing the order needs no key: get_order_questions, then get_recap, then create_order; a person from Tap.Giving follows up with the invoice. " +
              " An intent is a lead, not an order: it creates no invoice and reserves nothing.",
        },
        text:
          `Already captured as ${indexedRef}: this email already has an intent, so no second lead was created and the Tap.Giving team will follow up with ${email} by email, usually within one business day.` +
          (existing.artworkRef ? ` Your artwork (${existing.artworkRef as string}) is linked to this intent.` : "") +
          (ctx.auth?.record.mode === "test"
            ? "\nTest-key note: this contact capture is real. The email was recorded in Tap.Giving's lead list through the same capture the website uses, and the team may follow up. Test mode covers orders and invoices, not this capture."
            : ""),
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
    orgSlug: ctx.auth?.record.orgSlug ?? null,
    createdAt: new Date().toISOString(),
  }), { expirationTtl: 30 * DAY });
  if (artworkRec && artworkRef) {
    artworkRec.intentRef = intentRef;
    if (ctx.auth && !artworkRec.orgSlug) artworkRec.orgSlug = ctx.auth.record.orgSlug;
    await ctx.env.MCP_ARTWORK.put(artworkJsonKey(artworkRef), JSON.stringify(artworkRec), { expirationTtl: ARTWORK_TTL });
  }

  const keyed = !!ctx.auth;
  const structured: Record<string, unknown> = {
    captured: true,
    intentRef,
    source: INTENT_SOURCE,
    ...(artworkRef ? { artworkRef, artworkLinked: true } : {}),
    followUp:
      "The Tap.Giving team follows up by email, usually within one business day. The contact was recorded through " +
      "the same capture the website uses, so the follow-up is the ordinary first email, not a sales list.",
    nextStep: keyed
      ? "Placing the order needs no key: get_order_questions, then get_recap, then create_order; a person from Tap.Giving follows up with the invoice. " +
              " An intent is a lead, not an order: it creates no invoice and reserves nothing."
      : "Placing the order needs no key: get_order_questions, then get_recap, then create_order; a person from Tap.Giving follows up with the invoice. " +
              " An intent is a lead, not an order: it creates no invoice and reserves nothing.",
  };
  const baseText = keyed
    ? `Captured as ${intentRef}. The Tap.Giving team will also follow up with ${email} by email, usually within one business day. Placing the order needs no key: order questions, recap, then create_order.${artworkRef ? ` Your artwork (${artworkRef}) is linked to this intent.` : ""}`
    : `Captured as ${intentRef}. The Tap.Giving team will follow up with ${email} by email, usually within one business day. Placing the order needs no key: order questions, recap, then create_order, and a person from Tap.Giving follows up with the invoice.${artworkRef ? ` Your artwork (${artworkRef}) is linked to this intent.` : ""}`;
  return {
    structured,
    // Test isolation, stated plainly (round 2 operational note): the
    // capture rides the production lead machinery in every mode, and
    // the response says so instead of letting the TEST MODE banner
    // imply otherwise. Test mode covers orders and invoices.
    text: ctx.auth?.record.mode === "test"
      ? `${baseText}\nTest-key note: this contact capture is real. The email was recorded in Tap.Giving's lead list through the same capture the website uses, and the team may follow up. Test mode covers orders and invoices, not this capture.`
      : baseText,
  };
}

// ─── order questions and recap ──────────────────────────────────────

async function toolGetOrderQuestions(ctx: Ctx, _args: Record<string, unknown>): Promise<ToolResult> {
  // Keyless since the 2026-11-08 F3 amendment: the question set is
  // static and public. With a key the answer also carries the whoami
  // block (F4, F15): the key's own organization and the contact
  // email orders must use. Without a key there is NO organization
  // block at all, and the contact-email question states the binding
  // rule without naming any organization's address.
  const auth = ctx.auth;
  const structured: Record<string, unknown> = {
    ...(auth
      ? {
          organization: {
            name: auth.record.orgName,
            contactEmail: auth.record.contactEmail,
            note: "This key belongs to this organization. The order's contact email must be the organization's contact email shown here.",
          },
        }
      : {
          keylessNote:
            "You are asking without an organization key, so no organization is bound yet. Placing the order needs no key; the order is bound by its contact email, so the contact email on the order must be one the organization owns.",
        }),
    questions: [
      {
        order: 1, field: "size", question: "Round or square?",
        input: { type: "enum", values: ["100mm-round", "100mm-square"] },
        note: "The two built-in sizes, both 100 mm (4 inch) at the same price.",
      },
      {
        order: 2, field: "quantity", question: "How many tap discs?",
        input: { type: "integer", minimum: MIN_QTY, maximum: MAX_QTY },
        note: `The minimum order is ${MIN_QTY} discs, enforced by get_quote and create_order.`,
      },
      {
        order: 3, field: "antiMetalCount", question: "How many discs will sit on metal surfaces?",
        optional: true,
        input: { type: "integer", minimum: 0 },
        note: "Discs on metal need the anti-metal shielding layer at $1.00 per shielded disc, decided before printing. Omit the count when it is unknown; an unknown count bills nothing.",
      },
      {
        order: 4, field: "mounting", question: "How should we mount them?",
        input: { type: "enum", values: MOUNTING_OPTIONS.map((o) => o.value) },
        options: MOUNTING_OPTIONS.map((o) => ({
          value: o.value, label: o.label, imageUrl: o.imageUrl, text: o.text,
        })),
      },
      {
        order: 5, field: "linkDestination", question: "Where should a tap send people?",
        optional: true,
        note: LINK_DESTINATION_NOTE +
          " get_recap and create_order accept this as linkDestination: the page a tap opens.",
        input: { type: "url", schemes: ["http", "https"] },
      },
      {
        order: 6, field: "contactName", question: "Who is the contact for this order?",
        input: { type: "text" },
      },
      {
        order: 7, field: "contactEmail", question: "What email should the proof and order emails go to?",
        input: { type: "email" },
        note: auth
          ? `Must be the organization's contact email for this key: ${auth.record.contactEmail}. The final proof is emailed to this address.`
          : "Must be the contact email of the organization whose key places the order. The final proof is emailed to this address.",
      },
      {
        order: 8, field: "contactPhone", question: "What phone number reaches the contact?",
        input: { type: "phone" },
      },
      {
        order: 9, field: "shipTo", question: "Where should we ship them?",
        input: {
          type: "object",
          fields: ["name", "street", "city", "state", "postalCode", "country", "phone"],
          note: "Phone is its own required field: the approval email's shipping block always carries the customer's phone as its last line.",
        },
      },
    ],
    alsoRequiredAtCreateOrder: {
      recapRef: "Comes from get_recap over these same answers; run the recap before create_order.",
      idempotencyKey: "Mint one per intended order (8 to 128 characters) and reuse it on retries.",
      artworkRef: "Optional but expected: the reference from submit_artwork.",
    },
    emailFirst: "Capture the contact email first in this step (start_order_intent), before the questions: the journey's first ask.",
  };
  const text = [
    auth
      ? `This key belongs to ${auth.record.orgName}; the contact email for orders is ${auth.record.contactEmail}.`
      : "No key on this call, so no organization is bound yet; when the order is placed, its contact email must be the contact email of the organization whose key places it.",
    "Order questions, in order (every field create_order needs):",
    "1. Shape and size: round or square, both 100 mm (4 inch).",
    `2. Quantity: "How many tap discs?" (minimum ${MIN_QTY}).`,
    "3. Metal surfaces: how many discs sit on metal? Those need the $1.00 shielding layer; omit the count when unknown.",
    '4. Mounting: "How should we mount them?" The two photos with this answer show the options: adhesive backing, and pre-drilled holes for screws (screws not included).',
    `5. Link destination (optional): ${LINK_DESTINATION_NOTE} get_recap and create_order accept it as linkDestination.`,
    "6. Contact name.",
    auth
      ? `7. Contact email: must be ${auth.record.contactEmail}, the address on this key's organization. The final proof is emailed there.`
      : "7. Contact email: must be the contact email of the organization whose key places the order. The final proof is emailed there.",
    "8. Contact phone.",
    "9. Shipping address, phone included, asked last.",
    "Then run get_recap over the answers; keep the recap reference it returns, because placing the order uses it.",
  ].join("\n");
  return { structured, text, images: mountingPhotoImages() };
}

export interface RecapRecord {
  recapRef: string;
  orgSlug: string;
  mode: "live" | "test";
  inputs: Record<string, unknown>;
  quoteGrandTotalCents: number;
  createdAt: string;
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

// Field names returned are the order-record field names; values are
// normalized (object keys sorted recursively, strings trimmed) so a
// re-serialized identical shipTo does not false-positive.
export function invoiceDifferingFields(
  prior: Pick<OrderRecord, "artworkRef" | "quantity" | "size" | "mounting" | "shipTo">,
  current: Pick<OrderRecord, "artworkRef" | "quantity" | "size" | "mounting" | "shipTo">,
): string[] {
  const pick = (o: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const k of INVOICE_COMPARE_FIELDS) if (o[k] !== undefined) out[k] = stableComparedValue(o[k]);
    return out;
  };
  return diffFields(pick(prior as Record<string, unknown>), pick(current as Record<string, unknown>));
}

export function differingFieldsSentence(fields: string[]): string {
  return `The earlier order differs from this order in: ${fields.map((f) => COMPARE_FIELD_LABELS[f] ?? f).join(", ")}.`;
}

async function toolGetRecap(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const auth = requireKey(ctx.auth);
  const inputs = await validateOrderShape(ctx, args, auth);
  const quote = quoteFor({
    qty: inputs.quantity as number,
    antiMetal: inputs.antiMetalCount as number | undefined,
    redirect: false,
  });
  const recapRef = `recap_${(await sha256Hex(`${auth.record.orgSlug}:${JSON.stringify(canonicalOrderInputs(inputs))}:${Date.now()}`)).slice(0, 24)}`;
  const record: RecapRecord = {
    recapRef,
    orgSlug: auth.record.orgSlug,
    mode: auth.record.mode,
    inputs: canonicalOrderInputs(inputs),
    quoteGrandTotalCents: quote.grandTotalCents,
    createdAt: new Date().toISOString(),
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

  const quoteObj = quoteOutput(quote);
  const contactNameIn = optString(args, "contactName", 200);
  const contactPhoneIn = optString(args, "contactPhone", 60);
  const contactEmailOut = (inputs.contactEmail as string | undefined) ?? auth.record.contactEmail;
  const givingUrlOut = (inputs.linkDestination as string | undefined) ?? (inputs.givingUrl as string | undefined);
  const structured: Record<string, unknown> = {
    recapRef,
    artwork,
    customer: {
      organization: auth.record.orgName,
      contactEmail: contactEmailOut,
      proofRecipientEmail: contactEmailOut,
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
      "A person from Tap.Giving follows up with the invoice after the order is placed; production waits until the final proof is approved by email. " +
      "Nothing is printed before that approval.",
    tapGivingContact: { email: TEAM_EMAIL },
    notes: RECAP_NOTES,
    exits: [
      { value: "pay_now", label: "Pay now", presented: "first, the default path", meaning: "create_order places the order now, and a person from Tap.Giving follows up with the invoice so the person can pay right away." },
      { value: "lock_in", label: "I want to lock in this price", presented: "second", meaning: "the same create_order; a person from Tap.Giving follows up with the invoice for the person to pay when they choose. The quoted total is the price protection." },
    ],
    gates: [GATES.designApproval, GATES.payment],
  };
  const shipTo = inputs.shipTo as Record<string, string>;
  const text = [
    `Recap ${recapRef}: ${inputs.quantity} discs, ${inputs.size}, mounting ${inputs.mounting}, for ${auth.record.orgName}.`,
    artwork ? `Artwork: your design on the disc is shown with this recap. File: https://tap.giving${artworkDisplayPath(artworkRef!)}` : "Artwork: none attached.",
    givingUrlOut
      ? `Tap destination: ${givingUrlOut}. Your discs start pointed at this page.`
      : "Tap destination: your own Tap.Giving page (your free Redirect Dashboard) until you set one; you can set or change it anytime from the dashboard.",
    `Contact: ${contactNameIn ? `${contactNameIn}, ` : ""}${contactEmailOut}${contactPhoneIn ? `, phone ${contactPhoneIn}` : ""}. The final proof is emailed to this address for approval.`,
    `Ship to: ${shipTo.name}, ${shipTo.street}, ${shipTo.city}, ${shipTo.state} ${shipTo.postalCode}, ${shipTo.country}. Phone: ${shipTo.phone}.`,
    `Cost: ${dollars(quote.grandTotalCents)} total. Shipping: Free. ${TAX_NOTE}`,
    `First-order discount, when it applies: if this is ${auth.record.orgName}'s first order, code WELCOME10 takes 10 percent off at invoice time, making the total ${dollars(quote.discountedTotalCents)}. It applies to any first order placed within 7 days of this quote (${record.createdAt.slice(0, 10)}); if the 7 days pass, a fresh quote restarts the window.`,
    ...RECAP_NOTES,
    "How payment and proof fit together: you can pay the invoice now; production waits until the final proof is approved by email. Nothing is printed before that approval.",
    "Two ways forward, and both set up the same order and the same invoice: pay now (the invoice link comes now, to pay right away), or lock in this price (the same invoice link, to pay when ready; the finalized invoice holds today's total).",
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
  invoice?: {
    invoiceId: string;
    invoiceNumber: string | null;
    status: string;
    hostedInvoiceUrl: string;
    totalCents: number;
    existing?: boolean;
    existingOrderRef?: string | null;
    existingDifferingFields?: string[];
  };
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

// Shared shape validation for recap and create_order inputs.
async function validateOrderShape(ctx: Ctx, args: Record<string, unknown>, auth: AuthedKey): Promise<Record<string, unknown>> {
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
  if (contactEmail && contactEmail !== auth.record.contactEmail.toLowerCase()) {
    throw new ToolError("forbidden",
      `contactEmail does not belong to this key's organization. This key belongs to ${auth.record.orgName}, ` +
      `and its contact email is ${auth.record.contactEmail}. Use that email here, or ask the Tap.Giving team ` +
      `(${TEAM_EMAIL}) for a key for your own organization.`,
      { retryable: false, details: { orgName: auth.record.orgName, contactEmail: auth.record.contactEmail } });
  }
  const linkDestination = screenDestination(optString(args, "linkDestination", 500) ?? optString(args, "givingUrl", 500), "linkDestination");
  const artworkRef = optString(args, "artworkRef", 120);
  if (artworkRef) {
    const rec = await readArtworkRecord(ctx.env, artworkRef);
    if (!rec) throw new ToolError("not_found", `artworkRef ${artworkRef} is not a submission this server holds (unclaimed submissions expire after 30 days).`);
    if (rec.orgSlug && rec.orgSlug !== auth.record.orgSlug) {
      throw new ToolError("forbidden", "That artwork was submitted under a different organization.", { retryable: false });
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
  const auth = requireKey(ctx.auth);
  const orgSlug = auth.record.orgSlug;
  const mode = auth.record.mode;

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
      if (order) return createOrderResult(order, true);
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
  const shapeInputs = await validateOrderShape(ctx, { ...args, contactEmail }, auth);
  const exitRaw = optString(args, "exit", 20) ?? "pay_now";
  if (exitRaw !== "pay_now" && exitRaw !== "lock_in") {
    throw invalidInput(`exit must be "pay_now" or "lock_in".`);
  }
  const exit = exitRaw as "pay_now" | "lock_in";
  const note = optString(args, "note", 480);
  const organizationName = optString(args, "organizationName", 300) ?? optString(args, "church", 300) ?? auth.record.orgName;

  // Recap binding: create_order carries the recapRef, and a recap
  // whose inputs differ from the order's is a conflict (spec 2.11).
  const recapRef = reqString(args, "recapRef", 80);
  const recapRaw = await ctx.env.MCP_KEYS.get(`RECAP:${recapRef}`);
  if (!recapRaw) {
    throw new ToolError("not_found", `recapRef ${recapRef} is not a recap this server holds. Call get_recap for these inputs first; the recap is the last thing before the exits.`);
  }
  const recap = JSON.parse(recapRaw) as RecapRecord;
  if (recap.orgSlug !== orgSlug) {
    throw new ToolError("forbidden", "That recap belongs to a different organization than this key.", { retryable: false });
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
      ...(((shapeInputs.linkDestination as string | undefined) ?? (shapeInputs.givingUrl as string | undefined))
        ? { givingUrl: shapeInputs.linkDestination as string }
        : {}),
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
    ...((shapeInputs.linkDestination as string | undefined) ? { linkDestination: shapeInputs.linkDestination as string } : {}),
    ...((shapeInputs.artworkRef as string | undefined) ? { artworkRef: shapeInputs.artworkRef as string } : {}),
    ...(note ? { note } : {}),
    recapRef,
    invreqKey,
    quote,
    createdAt: new Date().toISOString(),
  };
  await saveOrderRecord(ctx.env, order);
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

  await touchKey(ctx.env.MCP_KEYS, auth);
  return createOrderResult(order, false);
}

function createOrderResult(order: OrderRecord, replayed: boolean): ToolResult {
  const quoteObj = quoteOutput(order.quote);
  const structured: Record<string, unknown> = {
    orderRef: order.orderRef,
    ...(replayed ? { replayed: true, note: "This idempotencyKey already created this order; the original orderRef is returned and no second order was written." } : {}),
    invreqKey: order.invreqKey,
    quote: quoteObj,
    exit: order.exit,
    crmExpectation: order.mode === "test"
      ? "Test mode: this order record stays in the test lane and does NOT enter the production CRM or fulfillment. Only the contact capture in start_order_intent touches the real lead list."
      : "The business record appears within about an hour under the organization's name, at stage \"ready\", " +
        "through the same process that handles website invoice requests. Source is distinguishable as the MCP; nothing else differs.",
    nextStep: order.exit === "pay_now"
      ? "The order is placed. A person from Tap.Giving follows up with the invoice for this order; the person pays it when it arrives."
      : "The order is placed. A person from Tap.Giving follows up with the invoice for this order, for the person to pay when they choose. A person approves the final proof by email before anything is printed.",
  };
  const text = [
    `Order set up: ${order.orderRef}.`,
    `Total: ${dollars(order.quote.grandTotalCents)} for ${order.quantity} discs. Shipping: Free.`,
    `Your order is in. The final proof comes by email to ${order.contactEmail}; production waits for that approval, and nothing else is needed from you now.`,
    structured.nextStep as string,
  ].join("\n");
  return { structured, text };
}

// ─── request_invoice ────────────────────────────────────────────────

async function toolRequestInvoice(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const auth = requireKey(ctx.auth);
  const orderRef = reqString(args, "orderRef", 160);
  reqString(args, "idempotencyKey", 200); // required by contract; retries replay through Stripe's own keys
  const order = await readOrderRecord(ctx.env, orderRef);
  if (!order || order.mode !== auth.record.mode) {
    throw new ToolError("not_found", `orderRef ${orderRef} is not an order this key's organization created.`);
  }
  if (order.orgSlug !== auth.record.orgSlug) {
    throw new ToolError("not_found", `orderRef ${orderRef} is not an order this key's organization created.`);
  }

  // Already minted for this order: return the same invoice.
  if (order.invoice) {
    const prior = order.invoice.existing && order.invoice.existingOrderRef && order.invoice.existingOrderRef !== orderRef
      ? await readOrderRecord(ctx.env, order.invoice.existingOrderRef)
      : null;
    return invoiceResult(order, order.invoice, true, prior ? { orderRef: prior.orderRef, quantity: prior.quantity } : null);
  }

  // Paid check (spec 2.7): the CHECKOUT-DONE signal in ORDERS.
  const done = await ctx.env.ORDERS.get(`CHECKOUT-DONE:${order.contactEmail}`);
  if (done) {
    throw new ToolError("conflict", "This organization's contact already completed a checkout for this order path; the order is already paid. No invoice was minted.", { retryable: false });
  }

  const key = stripeKeyFor(ctx.env, auth.record.mode);
  let minted;
  try {
    minted = await mintInvoice({
      stripeKey: key,
      orderRef,
      organizationName: order.organizationName ?? (order as unknown as Record<string, unknown>).church as string,
      email: order.contactEmail,
      qty: order.quantity,
      unitCents: order.quote.unitCents,
      discountEligible: order.quote.discountEligible,
      shape: order.size === "100mm-square" ? "square" : "round",
      mounting: order.mounting,
      linkDestination: order.linkDestination ?? (order as unknown as Record<string, unknown>).givingUrl as string | undefined,
      antiMetalCount: order.antiMetalCount,
      exit: order.exit,
    }, ctx.fetchFn);
  } catch (e) {
    if (e instanceof StripeCallError) {
      throw new ToolError("stripe_unavailable", `Stripe did not complete the invoice request (${e.message}). Nothing was minted by this call beyond what Stripe's idempotency keys replay; retry with the same idempotencyKey.`);
    }
    throw e;
  }

  const priorRecord = minted.existing && minted.existingOrderRef && minted.existingOrderRef !== orderRef
    ? await readOrderRecord(ctx.env, minted.existingOrderRef)
    : null;
  // F22 content comparison, computed ONCE here at mint and stored on
  // the order's invoice object, so status and replays report the
  // mint-time diff and never recompute against a prior record that
  // may have changed since.
  const differingFields = priorRecord ? invoiceDifferingFields(priorRecord, order) : null;
  order.invoice = {
    invoiceId: minted.invoiceId,
    invoiceNumber: minted.invoiceNumber,
    status: minted.status,
    hostedInvoiceUrl: minted.hostedInvoiceUrl,
    totalCents: minted.totalCents,
    ...(minted.existing ? { existing: true } : {}),
    ...(minted.existing && minted.existingOrderRef ? { existingOrderRef: minted.existingOrderRef } : {}),
    ...(differingFields ? { existingDifferingFields: differingFields } : {}),
  };
  await saveOrderRecord(ctx.env, order);
  await touchKey(ctx.env.MCP_KEYS, auth);
  return invoiceResult(order, order.invoice, false, priorRecord ? { orderRef: priorRecord.orderRef, quantity: priorRecord.quantity } : null);
}

function invoiceResult(order: OrderRecord, invoice: NonNullable<OrderRecord["invoice"]>, replayed: boolean, prior: { orderRef: string; quantity: number } | null = null): ToolResult {
  const structured: Record<string, unknown> = {
    orderRef: order.orderRef,
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    hostedInvoiceUrl: invoice.hostedInvoiceUrl,
    handoffLine: `Review your invoice: ${invoice.hostedInvoiceUrl}`,
    totalCents: invoice.totalCents,
    currency: "USD",
    totalNote: "Totals are structured data for the agent's records; the human-facing handoff line carries no dollar total, the invoice itself carries the money.",
    ...(invoice.existing ? { existing: true, note: "This customer already had an open or draft invoice; that invoice's link is returned, flagged existing, rather than stacking a second one." } : {}),
    ...(prior ? { existingFromOrderRef: prior.orderRef } : {}),
    ...(prior && invoice.existingDifferingFields ? { existingDifferingFields: invoice.existingDifferingFields } : {}),
    ...(replayed ? { replayed: true } : {}),
    ...(order.antiMetalCount === undefined ? { antiMetal: "unknown", antiMetalNote: "No anti-metal count was recorded for this order, so the invoice carries no shielding line. If some discs go on metal surfaces, the count must be settled with the person before printing; it cannot be added afterwards." } : {}),
    nextStep: "Hand the handoffLine to the person. A person pays on Stripe's hosted page; this server moves no money itself. Artwork approval happens separately, by email, before production.",
  };
  const text = [
    `Invoice ${invoice.invoiceNumber ?? invoice.invoiceId} is ${invoice.status}.`,
    ...(prior ? [`This is not a new invoice for this order: invoice ${invoice.invoiceNumber ?? invoice.invoiceId} was already open from order ${prior.orderRef} (${prior.quantity} discs, ${dollars(invoice.totalCents)} total), so this order (${order.orderRef}) is not invoiced separately. Pay that invoice if it is the order you mean; if you need a separate invoice for this order, contact the Tap.Giving team at ${TEAM_EMAIL}.`] : []),
    ...(prior && invoice.existingDifferingFields?.length ? [differingFieldsSentence(invoice.existingDifferingFields)] : []),
    `Review your invoice: ${invoice.hostedInvoiceUrl}`,
    `Total on the invoice: ${dollars(invoice.totalCents)}. A person pays it on Stripe's hosted page.`,
  ].join("\n");
  return { structured, text };
}

// ─── get_order_status ───────────────────────────────────────────────

async function toolGetOrderStatus(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const auth = requireKey(ctx.auth);
  const orderRef = optString(args, "orderRef", 160);
  const invoiceId = optString(args, "invoiceId", 80);
  let order: OrderRecord | null = null;
  if (orderRef) {
    order = await readOrderRecord(ctx.env, orderRef);
    if (!order || order.orgSlug !== auth.record.orgSlug || order.mode !== auth.record.mode) {
      throw new ToolError("not_found", `orderRef ${orderRef} is not an order this key's organization created.`);
    }
  } else if (invoiceId) {
    // Resolve an invoice id to this org's order through Stripe, then
    // the MCP's own order records.
    const key = stripeKeyFor(ctx.env, auth.record.mode);
    let inv: any;
    try {
      inv = await stripeCall(key, "GET", `/invoices/${invoiceId}`, undefined, undefined, ctx.fetchFn);
    } catch {
      throw new ToolError("not_found", `invoiceId ${invoiceId} is not an invoice this server can read for this key's mode.`);
    }
    const ref = inv?.metadata?.mcp_order_ref as string | undefined;
    if (ref) {
      const byRef = await readOrderRecord(ctx.env, ref);
      if (byRef && byRef.orgSlug === auth.record.orgSlug) order = byRef;
    }
    if (!order) {
      const structured: Record<string, unknown> = {
        invoice: { id: invoiceId, status: inv.status, hostedInvoiceUrl: inv.hosted_invoice_url ?? null, totalCents: inv.total ?? null },
        note: "This invoice was not created through this server for this organization, so no order record joins it here.",
      };
      return { structured, text: `Invoice ${invoiceId}: status ${inv.status}.` };
    }
  } else {
    throw invalidInput("Give orderRef or invoiceId.");
  }

  // Live invoice state from Stripe, when an invoice exists.
  let invoiceState: Record<string, unknown> | null = null;
  if (order.invoice) {
    invoiceState = {
      status: order.invoice.status,
      hostedInvoiceUrl: order.invoice.hostedInvoiceUrl,
      invoiceId: order.invoice.invoiceId,
      invoiceNumber: order.invoice.invoiceNumber,
    };
    try {
      const key = stripeKeyFor(ctx.env, auth.record.mode);
      const inv = await stripeCall(key, "GET", `/invoices/${order.invoice.invoiceId}`, undefined, undefined, ctx.fetchFn);
      invoiceState = {
        status: inv.status, hostedInvoiceUrl: inv.hosted_invoice_url ?? order.invoice.hostedInvoiceUrl,
        invoiceId: inv.id, invoiceNumber: inv.number ?? order.invoice.invoiceNumber,
      };
      if (inv.status !== order.invoice.status) {
        order.invoice.status = inv.status;
        await saveOrderRecord(ctx.env, order);
      }
    } catch { /* the recorded state stands when Stripe is unreachable */ }
  }

  // Business records through the invocation seat (CRM row,
  // fulfillment). The pre-decided fallback (spec 5.3): on any seat
  // failure, answer from the MCP's own records plus Stripe.
  const seat = await callSeat(ctx.env, "readOrderRecords", {
    orgSlug: order.orgSlug,
    contactEmail: order.contactEmail,
    ...(order.invoice?.invoiceNumber ? { invoiceNumber: order.invoice.invoiceNumber } : {}),
    ...(order.invoice?.invoiceId ? { invoiceId: order.invoice.invoiceId } : {}),
  }, ctx.fetchFn);

  let stage: string;
  let fulfillment: Record<string, unknown> | null = null;
  let crmRow: Record<string, unknown> | null = null;
  if (seat.ok && seat.body.found) {
    crmRow = seat.body.crmRow as Record<string, unknown>;
    stage = String(crmRow.status ?? "ready");
    fulfillment = (seat.body.fulfillment as Record<string, unknown> | null) ?? null;
  } else {
    stage = "received";
  }

  const structured: Record<string, unknown> = {
    orderRef: order.orderRef,
    stage,
    ...(stage === "received" ? { stageNote: "Your order is in and being prepared. The business records catch up within about an hour; that wait is normal, not a problem with your order." } : {}),
    dashboard: {
      tapAddress: `https://go.tap.giving/${order.orgSlug}`,
      loginUrl: "https://tap.giving/login",
      username: order.orgSlug,
      note: "Your discs open your Tap.Giving address above. Sign in to the Redirect Dashboard at the login URL with that address's name as the username; your password arrives by email with your shipping notice.",
    },
    ...(crmRow ? { crm: crmRow } : {}),
    fulfillment: fulfillment ?? { status: null, note: "No fulfillment record yet: fulfillment begins after payment and proof approval, both human steps." },
    invoice: invoiceState,
    design: order.artworkRef ? { artworkRef: order.artworkRef } : { state: "not-attached" },
    exit: order.exit,
    quantity: order.quantity,
  };
  const text = [
    `Order ${order.orderRef}: stage ${stage}.`,
    invoiceState ? `Invoice ${invoiceState.invoiceNumber ?? invoiceState.invoiceId}: ${invoiceState.status}. ${invoiceState.hostedInvoiceUrl}` : "No invoice yet.",
    ...(order.invoice?.existing && order.invoice.existingOrderRef && order.invoice.existingOrderRef !== order.orderRef ? [`Note: invoice ${order.invoice.invoiceNumber ?? order.invoice.invoiceId} was already open from order ${order.invoice.existingOrderRef}; this order is not invoiced separately.${order.invoice.existingDifferingFields?.length ? ` ${differingFieldsSentence(order.invoice.existingDifferingFields)}` : ""}`] : []),
    ...(invoiceState ? ["Both links open the same invoice: Stripe refreshes the invoice's web address between visits, so the link here and the link request_invoice returned can differ while opening the identical invoice."] : []),
    fulfillment ? `Fulfillment: ${fulfillment.status}${fulfillment.tracking ? `, tracking ${fulfillment.tracking} (${fulfillment.carrier})` : ""}.` : "Fulfillment has not begun (it starts after payment and proof approval).",
    `Your discs open https://go.tap.giving/${order.orgSlug}. Redirect Dashboard: sign in at https://tap.giving/login with username ${order.orgSlug}; your password arrives by email with your shipping notice.`,
  ].join("\n");
  return { structured, text };
}

// ─── register_webhook ───────────────────────────────────────────────

async function toolRegisterWebhook(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const auth = requireKey(ctx.auth);
  const callbackUrl = reqString(args, "callbackUrl", 500);
  let url: URL;
  try { url = new URL(callbackUrl); } catch { throw invalidInput("callbackUrl must be a valid URL."); }
  if (url.protocol !== "https:") throw invalidInput("callbackUrl must be https.");
  const eventsRaw = args.events;
  if (!Array.isArray(eventsRaw) || eventsRaw.length === 0) {
    throw invalidInput("events must be a non-empty array, a subset of: proof_ready, shipped.");
  }
  const events = eventsRaw.map((e) => String(e));
  for (const e of events) {
    if (e !== "proof_ready" && e !== "shipped") {
      throw invalidInput(`Unknown event "${e}". Events: proof_ready, shipped.`);
    }
  }
  const secret = `whsec_${(await sha256Hex(`${auth.record.orgSlug}:${Date.now()}:${Math.random()}`)).slice(0, 40)}`;
  const subscription = {
    orgSlug: auth.record.orgSlug,
    callbackUrl,
    events,
    secret,
    createdAt: new Date().toISOString(),
    delivery: "pending",
  };
  await ctx.env.MCP_KEYS.put(`WEBHOOK:${auth.record.orgSlug}`, JSON.stringify(subscription));
  await touchKey(ctx.env.MCP_KEYS, auth);
  const structured: Record<string, unknown> = {
    registered: true,
    callbackUrl,
    events,
    subscriptionSecret: secret,
    secretNote: "Shown once, here. Verify deliveries with it: X-TapGiving-Signature is the hex HMAC SHA-256 of the raw body under this secret.",
    payloadContract: {
      body: "{event, orderRef, orgSlug, occurredAt, status, detail}",
      headers: ["X-TapGiving-Event", "X-TapGiving-Signature"],
      detail: "proof_ready carries {proofByEmailTo}; shipped carries {carrier, trackingNumber} where the status record has them.",
    },
    delivery: "pending",
    deliveryNote:
      "Registration is live in v1; DELIVERY is pending (named v1.1): the emitters live behind business-side state, so no push fires yet. " +
      "Until delivery lands, get_order_status is the state read. Nothing about this registration implies live push.",
  };
  const text = [
    `Webhook registered for ${auth.record.orgSlug}: ${events.join(", ")} to ${callbackUrl}.`,
    `Subscription secret (shown once): ${secret}`,
    "Delivery is pending in v1 (it lands in v1.1); use get_order_status for state until then.",
  ].join("\n");
  return { structured, text };
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
      "the first choice (shape: round or square), the artwork spec summary, the per-disc price range, and the full capability list with the human gates. Ordering is the optional step after the design path. " +
      "and get_order_questions when the questions are next (it needs no key). Discovery states the key scope up front: placing an order never requires a key; a key is optional and organization-bound, for order status and webhook registration. " +
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
      "Quantities below the 100-disc minimum are refused by this tool itself. No key needed. Call this when the person names a quantity and wants the exact price; for product facts without a quantity, call get_product instead. The next step after a quote is get_artwork_spec for the artwork, then start_order_intent.",
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
      "The full product facts, with no key needed. Disc pricing here is the per-disc range only; exact totals live in get_quote. Returns one block per topic: discs (the locked tap chip, 0.85 mm double-laminated matte waterproof PVC, the 100 mm (4 inch) round and square built-ins; every other size is a manual exception), mounting (options and the metal caveat), stands and badges (table stands and lanyard badges, from the team by email, not ordered through this server), and shipping (free; 2 to 3 weeks from artwork approval), plus the free Redirect Dashboard and the destination model: per-disc pointing, two destinations, dashboard sign-in timing, and phone compatibility with the printed-code fallback. " +
      "Pass the optional topic argument to return only one block. Call this for product facts alone; for a first orientation call get_discovery, and for the price at a quantity call get_quote.",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string", enum: [...PRODUCT_TOPICS], description: "Optional: return only this one product block (discs, stands, badges, mounting, or shipping). Omit it to return every block." } },
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
        chosenExampleRef: { type: "string", description: "The delivered example the person picked: any example id from the structured examples index, or its pick-list number within the shown subset for the chosen shape. It is carried with the spec as the design reference." },
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
      "No key and no email are needed on the cold path; a keyed submission binds to the key's organization. The file argument carries the artwork file (filename, mediaType, contentBase64); sha256 is the hex SHA-256 of those file bytes; shape optionally names the shape the artwork was designed for; orderRef optionally attaches the submission to an existing order; logo optionally carries the source logo the artwork was built from; note is free text for the team. Each call creates a separate submission: resubmitting the same file mints a new artworkRef rather than replacing the earlier one. Returns the artworkRef every later step carries, a displayUrl, and a preview of the person's own design composited on the disc (cut shape applied) for the renderable formats (SVG, PNG, JPEG, WebP, GIF); for a format this server cannot render here (for example PDF), the answer says so plainly and never promises a preview or an email at this stage. " +
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
        orderRef: { type: "string", description: "Optional: attach the submission to an order this key's organization already created (the orderRef create_order returned)." },
        logo: {
          type: "object",
          properties: { filename: { type: "string" }, mediaType: { type: "string" }, contentBase64: { type: "string" } },
          description: "Optional source logo the artwork was built from; travels with the submission as source material.",
        },
        note: { type: "string", description: "Optional free-text note for the Tap.Giving team, carried with the submission." },
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
      "The order questions as structured data, returned in the exact order to ask them. The questions cover every field create_order requires: shape, quantity, metal count, and mounting with the picture assets. Then the link destination. Then contact name, email, and phone. The shipping address comes last. " +
      "When the call carries a key, the result also returns the key's own organization block: the organization name and the contact email orders must use; without a key, no organization block is returned. The journey captures the contact email before this step, through start_order_intent. No key needed. Call this when the person is ready to order; for a first orientation, call get_discovery.",
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
      "Set up an order through the same front door a website order takes (an INVREQ record the hourly adoption resolves into the CRM, indistinguishable downstream). No key needed. " +
      "This is the lock-in write behind both recap exits; it carries the recapRef and a required idempotencyKey (a retry with the same key and payload returns the original orderRef; the same key with a different payload is a conflict naming the differing fields). " +
      "The 100-disc minimum is enforced here. Sizes other than the two built-ins return manual_exception. Returns the orderRef (the reference every later call uses), the exact quote, the chosen exit, and the next step. " +
      "Failure modes: a recap whose inputs differ from the order is refused as a conflict naming the differing fields; a reused idempotencyKey with a different payload is a conflict naming the original order. " +
      "Routing: start_order_intent is the earlier keyless contact capture, get_recap must run immediately before this call over the same inputs, and request_invoice follows it. " + GATES.designApproval + " " + GATES.payment,
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
        exit: { type: "string", enum: ["pay_now", "lock_in"], description: "The person's chosen exit, recorded on the order and the invoice metadata. Both exits write the same record shape." },
        idempotencyKey: { type: "string", description: "8 to 128 characters, minted per intended order, reused on retries." },
      },
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: toolCreateOrder,
  },
  {
    name: "request_invoice",
    description:
      "For orders already placed through this server: call create_order first, because this tool needs that call's orderRef (the mcp: reference in its result). No key needed. It returns that order's finalized Stripe hosted invoice and its link, minted under the invoice playbook " +
      "(send_invoice collection, 7 days to due, first-order coupon when eligible, the free shipping line, finalized with auto_advance=false so Stripe emails nothing). " +
      "If the customer already has an open or draft invoice, that invoice's link is returned flagged existing. " +
      "The minted invoice shape passed the field-for-field parity check against Stripe test mode on 2026-11-07. " +
      "This server moves no money itself and issues no invoices: a person from Tap.Giving follows up with the invoice.",
    inputSchema: {
      type: "object",
      required: ["orderRef", "idempotencyKey"],
      properties: {
        orderRef: { type: "string", description: "The order reference create_order returned (it begins with mcp:); the invoice is minted for that order." },
        idempotencyKey: { type: "string", description: "Per invoice request; retries return the same invoice." },
      },
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: toolRequestInvoice,
  },
  {
    name: "get_order_status",
    description:
      "Where an order stands, from the records fulfillment reads: the CRM stage, the fulfillment state with tracking when present, and the invoice state with its hosted link. " +
      "An order not yet adopted returns stage \"received\" with the adoption expectation, not an error. Key required; only the key's own organization's orders. " +
      "Give exactly one identifier: orderRef (the reference create_order returned; the usual key for an order) or invoiceId (the Stripe invoice id request_invoice returned; use it when the invoice is what you hold). " +
      "Call this to check an existing order; it never changes anything. Use get_recap before an order exists, get_order_questions to gather an order's inputs, and request_invoice to mint or fetch the payment link.",
    inputSchema: {
      type: "object",
      properties: { orderRef: { type: "string", description: "The order reference create_order returned (begins with mcp:). The usual identifier; give this or invoiceId, not both." }, invoiceId: { type: "string", description: "The Stripe invoice id request_invoice returned. Use it when the invoice is the identifier you hold." } },
    },
    annotations: READ,
    run: toolGetOrderStatus,
  },
  {
    name: "register_webhook",
    description:
      "Developer tool, optional: register (or replace) the organization's one webhook subscription for proof_ready and shipped events. Most organizations never need this; order status is read with get_order_status. The subscription secret is shown once, here. " +
      "Registration is live in v1; delivery is pending and lands in v1.1, so until then get_order_status is the state read. Nothing about registration implies live push. Key required.",
    inputSchema: {
      type: "object",
      required: ["callbackUrl", "events"],
      properties: {
        callbackUrl: { type: "string", description: "The https URL deliveries will POST to. It must be publicly reachable (no localhost or private addresses) and answer with a 2xx status; verify deliveries with the subscription secret shown once in the result (deliveries are signed with it). Failed deliveries are retried with backoff." },
        events: { type: "array", items: { type: "string", enum: ["proof_ready", "shipped"] } },
      },
    },
    annotations: WRITE,
    run: toolRegisterWebhook,
  },
];

export function toolByName(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

const WRITE_TOOLS = new Set(["submit_artwork", "start_order_intent", "create_order", "request_invoice", "register_webhook"]);
const KEYED_READ_TOOLS = new Set(["get_recap", "get_order_status"]);
const KEYED_WRITE_TOOLS = new Set(["create_order", "request_invoice", "register_webhook"]);
export const TEST_MODE_LINE = "TEST MODE: this call uses a test key, so no real order is placed and no charge is made.";

export async function runTool(
  env: Env, request: Request, name: string, args: Record<string, unknown>,
  // The default must wrap the global: a bare `fetch` reference loses
  // its receiver in the Workers runtime ("Illegal invocation") when
  // the caller passes it through as a value.
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<ToolResult> {
  const def = toolByName(name);
  if (!def) throw new ToolError("not_found", `Unknown tool: ${name}.`);
  const auth = await authenticate(env.MCP_KEYS, request);
  const ctx: Ctx = { env, request, auth, fetchFn };
  const result = await def.run(ctx, args);
  // With a test key, every write's text opens by saying so (F19), so a
  // first user can never mistake a test order for a real one.
  if (auth && auth.record.mode === "test" && (KEYED_WRITE_TOOLS.has(name) || KEYED_READ_TOOLS.has(name))) {
    result.text = `${TEST_MODE_LINE}\n${result.text}`;
  }
  return result;
}
