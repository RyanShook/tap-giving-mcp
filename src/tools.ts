// The v1 tool surface (spec section 2): contracts, annotations, and
// implementations. Every result returns both MCP structured content
// and a plain-text rendering. Tool descriptions carry the gate
// sentences of section 4, so a client that never reads the spec still
// meets the boundaries in tools/list.

import {
  ARTWORK_GUIDELINES, ARTWORK_GEOMETRY, BENEFITS, ENDPOINT, GATES, KEY_REQUEST_LINE,
  LINK_DESTINATION_NOTE, MOUNTING_OPTIONS, PRODUCT, PRODUCT_TOPICS, RECAP_NOTES,
  SERVER_DESCRIPTION, SERVER_NAME, PRESENTATION_SYNONYMS, TAX_NOTE,
} from "./facts.ts";
import { MAX_QTY, MIN_QTY, PRICE_SOURCE, quoteFor, tierForQuantity, type Quote } from "./pricing.ts";
import {
  ToolError, invalidInput, isRecord, optInt, optString, reqInt, reqString,
} from "./errors.ts";
import { authenticate, requireKey, sha256Hex, touchKey, type AuthedKey } from "./keys.ts";
import { DETECTED_MEDIA_TYPE, MAX_ARTWORK_BYTES, sniffArtwork } from "./sniff.ts";
import { callSeat } from "./seat.ts";
import { StripeCallError, mintInvoice, stripeCall } from "./stripe.ts";
import { EXAMPLES } from "./examples.ts";
import type { Env } from "./env.ts";

const DAY = 24 * 3600;
const ARTWORK_TTL = 30 * DAY;
const RECAP_TTL = 7 * DAY;

// ─── shared shapes ──────────────────────────────────────────────────

export interface ToolResult {
  structured: Record<string, unknown>;
  text: string;
  image?: { data: string; mimeType: string };
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
  return {
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
      description:
        "First-order discount: 10 percent off with code WELCOME10, inside a 7-day renewing window. " +
        "It is a conditional first-order line, not a price gate: the headline totals above are list totals, " +
        "and the discount applies at invoice time only when the order is the organization's first. " +
        `conditionalTotalCents (${dollars(quote.discountedTotalCents)}) is what the total becomes when that first-order discount applies.`,
    },
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
  return [
    `Quote for ${q.quantity} discs (${q.tier}): ${dollars(q.grandTotalCents as number)} total.`,
    `Discs: ${q.quantity} at ${dollars(q.unitCents as number)} list, ${dollars(q.discSubtotalCents as number)} list subtotal. First orders take 10 percent off with code WELCOME10 inside a 7-day renewing window: ${dollars(q.grandTotalWithFirstOrderDiscountCents as number)} when it applies.`,
    addOns ? `Add-ons:\n${addOns}` : "Add-ons: none.",
    `Shipping: Free`,
    `${q.taxNote}`,
    `Source: ${q.priceSource}`,
  ].join("\n");
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
  const examples = EXAMPLES
    .filter((e) => !shape || e.shape === shape)
    .map((e) => ({
      id: e.id,
      direction: e.direction,
      shape: e.shape,
      displayUrl: `${ENDPOINT.replace("/mcp", "")}/mcp/examples/${e.id}.png`,
    }));
  return {
    sizes: "100 mm (4 inch), round or square. Every other size or shape is a manual exception handled by hand.",
    canvasMm: g.canvasMm,
    bleedMm: g.bleedMm,
    ...(shape ? { geometry: shapes[shape] } : { geometry: shapes }),
    formatWanted: g.formatWanted,
    background: g.background,
    minimumLogoMm: g.minimumLogoMm,
    encoding: g.encoding,
    guidelines: ARTWORK_GUIDELINES,
    examples,
    examplesNote:
      "House template designs made for this purpose, generic Tap.Giving artwork, no customer artwork. " +
      "The person picks a direction they like; the chosen direction travels with the spec as chosenExampleRef and the agent builds the artwork with its own tools.",
    logoAsk: {
      field: "logo",
      optional: true,
      text: "Optional: the person may provide their organization's logo for the agent to build from. Name-only artwork is a standing shape, so this is never required. A provided logo travels with the artwork submission as source material.",
    },
  };
}

async function toolGetDiscovery(_ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const boundaries = [100, 200, 400].map((qty) => {
    const tier = tierForQuantity(qty);
    return { quantity: qty, tier: tier.label, unitCents: tier.unitCents, unitPrice: dollars(tier.unitCents) };
  });
  const structured: Record<string, unknown> = {
    server: { name: SERVER_NAME, endpoint: ENDPOINT, synonyms: PRESENTATION_SYNONYMS },
    introduction: {
      builder: SERVER_NAME,
      product:
        "A tap disc is a small physical disc a phone taps to open your giving page instantly. " +
        "It carries a locked NTAG213 chip. It comes in one standardized 4-inch size (100 mm), in two shapes, " +
        "and it is durable waterproof PVC.",
      firstChoice: { field: "shape", options: ["round", "square"] },
    },
    pricing: {
      tiers: boundaries,
      minimumQuantity: MIN_QTY,
      discount: "10 percent off the first order with code WELCOME10, inside a 7-day renewing window; a conditional first-order line, never a price gate. Quotes headline list totals.",
      shipping: "Free on every order.",
      note: "Call get_quote for the binding quote at an exact quantity.",
    },
    artworkSpec: {
      summary: "106 mm square artboard; 100 mm cut (round or square); 3 mm bleed; vector artwork back (SVG preferred).",
      tool: "get_artwork_spec",
    },
    capabilities: {
      readTools: ["get_discovery", "get_quote", "get_product", "get_artwork_spec", "get_order_questions", "get_recap", "get_order_status"],
      writeTools: ["submit_artwork", "start_order_intent", "create_order", "request_invoice", "register_webhook"],
      gates: [GATES.designApproval, GATES.payment, GATES.production],
      howToGetAKey: KEY_REQUEST_LINE,
      kickoff: "start_order_intent",
      benefits: BENEFITS,
      guarantee: "Covered by our 30-day money-back guarantee.",
    },
    ...(typeof args.intent === "string" && args.intent ? { guidance: `Noted intent: ${args.intent.slice(0, 200)}. Start with the shape choice, then get_artwork_spec.` } : {}),
  };
  const text = [
    `${SERVER_NAME}: ${SERVER_DESCRIPTION}`,
    `First choice: the shape, round or square.`,
    `Pricing: 100-199 discs at $5.00 each, 200-399 at $4.00, 400+ at $3.50. Minimum order 100. Free shipping. First orders take 10 percent off with code WELCOME10 inside a 7-day renewing window; quotes headline list totals. Every order is covered by our 30-day money-back guarantee.`,
    `Writes need an organization API key. ${KEY_REQUEST_LINE}`,
    `Gates: a person approves the final proof by email, and a person pays the hosted invoice. This server moves no money itself.`,
  ].join("\n");
  return { structured, text };
}

async function toolGetQuote(_ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const quantity = reqInt(args, "quantity");
  if (quantity < MIN_QTY) {
    throw invalidInput(`The minimum order is ${MIN_QTY} discs. Quantity ${quantity} is below the minimum; orders under 100 are not available.`);
  }
  if (quantity > MAX_QTY) {
    throw invalidInput(`Quantity ${quantity} exceeds the maximum this server quotes (${MAX_QTY} discs). For an order this size, contact Ryan at ryan@tap.giving directly.`);
  }
  const antiMetalCount = optInt(args, "antiMetalCount");
  if (antiMetalCount !== undefined && antiMetalCount < 0) {
    throw invalidInput("antiMetalCount must be 0 or more; omit it entirely when the count is unknown.");
  }
  const quote = quoteFor({ qty: quantity, antiMetal: antiMetalCount, redirect: false });
  const structured = quoteOutput(quote);
  return { structured, text: quoteText(structured) };
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
      worksWith: p.worksWith,
      guarantee: p.guarantee,
    },
    stands: { products: p.stands, ordering: "Stands are quoted here as information in v1; ordering stands rides a later phase. Discs are the orderable product today." },
    badges: { products: p.badges, ordering: "Badges are quoted here as information in v1; ordering badges rides a later phase." },
    mounting: { options: MOUNTING_OPTIONS.map((o) => ({ value: o.value, text: o.text })), detail: p.mountingDetail, metalCaveat: p.metalCaveat },
    shipping: { cost: p.shipping.cost, terms: p.shipping.terms },
  };
  const structured = topic ? { topic, ...(full[topic] as Record<string, unknown>) } : full;
  const text = topic
    ? JSON.stringify(structured, null, 2)
    : [
      `Tap discs: ${p.chipDetail}. ${p.material}.`,
      p.sizePolicy,
      p.mountingDetail,
      p.metalCaveat,
      p.redirectDashboard,
      p.worksWith,
      p.guarantee,
      `Table stands: 70 x 100 mm at $7, 120 x 140 mm at $9, minimum 100. Lanyard badges: 90 x 130 mm at $5, minimum 100.`,
      `${p.shipping.cost} ${p.shipping.terms}`,
    ].join("\n");
  return { structured, text };
}

async function toolGetArtworkSpec(_ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const shape = optString(args, "shape", 20);
  if (shape !== undefined && shape !== "round" && shape !== "square") {
    throw invalidInput(`shape must be "round" or "square".`);
  }
  const chosenExampleRef = optString(args, "chosenExampleRef", 80);
  const structured = artworkSpecObject(shape);
  if (chosenExampleRef) structured.chosenExampleRef = chosenExampleRef;
  const text = [
    `Artwork spec: 106 mm square artboard for both shapes.`,
    `Round: cut radius 50 mm, bleed radius 53 mm, safe radius 45 mm, centre (53, 53) mm.`,
    `Square: cut is a 100 mm box spanning 3 to 103 mm; bleed half-width 53 mm; safe half-width 47 mm.`,
    ARTWORK_GEOMETRY.formatWanted,
    ARTWORK_GEOMETRY.background,
    `Examples: ${(structured.examples as Array<{ direction: string }>).map((e) => e.direction).join("; ")}.`,
  ].join("\n");
  return { structured, text };
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
        orgSlug: order.orgSlug, contactEmail: order.contactEmail, church: order.church,
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

  const structured: Record<string, unknown> = {
    received: true,
    artworkRef,
    displayUrl: `https://tap.giving${artworkDisplayPath(artworkRef)}`,
    sha256: declaredSha,
    validation: { policy: "permissive", checks, findings },
    benefits: BENEFITS,
    nextStep: "Show the benefits, then capture the contact email at order setup (start_order_intent) and ask the order questions (get_order_questions).",
  };
  const text = [
    `Artwork received: ${artworkRef} (${filename}, ${detectedType}, ${bytes.length} bytes).`,
    `SHA-256 as stored: ${declaredSha}.`,
    findings.length ? findings.join(" ") : "Accepted under the permissive intake policy.",
    `Why Tap.Giving: ${BENEFITS.join("; ")}.`,
  ].join("\n");
  const image = detectedType !== "svg" && detectedType !== "pdf"
    ? { data: contentBase64.replace(/\s/g, ""), mimeType: DETECTED_MEDIA_TYPE[detectedType] }
    : undefined;
  return { structured, text, image };
}

// ─── intent capture ─────────────────────────────────────────────────

const INTENT_SOURCE = "mcp:intent";

async function toolStartOrderIntent(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const email = reqString(args, "email", 200).toLowerCase();
  if (!email.includes("@")) throw invalidInput("email must be an email address.");
  const church = optString(args, "church", 300);
  const quantityHint = optInt(args, "quantityHint");
  const sourceNote = optString(args, "sourceNote", 300);

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
      ...(church ? { church } : {}),
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
    throw new ToolError("internal", `The capture endpoint refused the contact (HTTP ${res.status}: ${bodyText.slice(0, 120) || "no body"}). Nothing was captured; retry, or reach Ryan at ryan@tap.giving.`, {
      details: { status: res.status, body: bodyText.slice(0, 200) },
    });
  }
  const structured: Record<string, unknown> = {
    captured: true,
    source: INTENT_SOURCE,
    nextStep:
      "A person at Tap.Giving now has the contact, and follow-up rides the same lead machinery as a website capture. " +
      "Completing an order needs an organization API key, issued by Tap.Giving: the person asks Ryan at ryan@tap.giving. " +
      "An intent is a lead, not an order: it creates no invoice and reserves nothing.",
  };
  return {
    structured,
    text: `Captured. A person at Tap.Giving now has ${email}. Completing an order needs an organization API key (ask Ryan at ryan@tap.giving).`,
  };
}

// ─── order questions and recap ──────────────────────────────────────

async function toolGetOrderQuestions(ctx: Ctx, _args: Record<string, unknown>): Promise<ToolResult> {
  requireKey(ctx.auth);
  const structured: Record<string, unknown> = {
    questions: [
      {
        order: 1, field: "quantity", question: "How many tap discs?",
        input: { type: "integer", minimum: MIN_QTY, maximum: MAX_QTY },
        note: `The minimum order is ${MIN_QTY} discs, enforced by get_quote and create_order.`,
      },
      {
        order: 2, field: "mounting", question: "How should we mount them?",
        input: { type: "enum", values: MOUNTING_OPTIONS.map((o) => o.value) },
        options: MOUNTING_OPTIONS.map((o) => ({
          value: o.value, label: o.label, imageUrl: o.imageUrl, text: o.text,
        })),
      },
      {
        order: 3, field: "linkDestination", question: "Where should a tap send people?",
        optional: true,
        note: LINK_DESTINATION_NOTE,
        input: { type: "url", schemes: ["http", "https"] },
      },
      {
        order: 4, field: "shipTo", question: "Where should we ship them?",
        input: {
          type: "object",
          fields: ["name", "street", "city", "state", "postalCode", "country", "phone"],
          note: "Phone is its own required field: the approval email's shipping block always carries the customer's phone as its last line.",
        },
      },
    ],
    emailFirst: "Capture the contact email first in this step (start_order_intent), before the questions: the journey's first ask.",
  };
  const text = [
    "Order questions, in order:",
    `1. Quantity: "How many tap discs?" (minimum ${MIN_QTY}).`,
    "2. Mounting: \"How should we mount them?\" Adhesive: https://tap.giving/assets/mount-adhesive.webp. Screws: https://tap.giving/assets/mount-screws.webp.",
    `3. Link destination (optional): ${LINK_DESTINATION_NOTE}`,
    "4. Shipping address, phone included, asked last.",
  ].join("\n");
  return { structured, text };
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
  const keys = ["quantity", "size", "mounting", "antiMetalCount", "shipTo", "artworkRef", "linkDestination", "givingUrl", "contactEmail"];
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
  if (artworkRef) {
    const rec = await readArtworkRecord(ctx.env, artworkRef);
    if (rec) {
      artwork = { artworkRef, displayUrl: `https://tap.giving${artworkDisplayPath(artworkRef)}`, sha256: rec.sha256 };
      if (rec.detectedType !== "svg" && rec.detectedType !== "pdf") {
        const bytes = await ctx.env.MCP_ARTWORK.get(artworkBytesKey(artworkRef), "arrayBuffer");
        if (bytes) {
          const u8 = new Uint8Array(bytes);
          let bin = "";
          for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode(...u8.subarray(i, i + 32768));
          image = { data: btoa(bin), mimeType: DETECTED_MEDIA_TYPE[rec.detectedType] || rec.mediaType };
        }
      } else {
        artwork.renderNote = rec.detectedType === "svg"
          ? "The submitted artwork is a vector file; this runtime cannot rasterize it, so the recap carries its displayUrl instead of an embedded render."
          : "The submitted artwork is a PDF; the recap carries its displayUrl instead of an embedded render.";
      }
    }
  }

  const quoteObj = quoteOutput(quote);
  const structured: Record<string, unknown> = {
    recapRef,
    artwork,
    quantity: inputs.quantity,
    size: inputs.size,
    mounting: inputs.mounting,
    shipTo: inputs.shipTo,
    cost: quoteObj,
    notes: RECAP_NOTES,
    exits: [
      { value: "pay_now", label: "Pay now", presented: "first, the default path", meaning: "create_order then request_invoice, and the hosted invoice link is presented to the person immediately so they pay on Stripe's hosted page." },
      { value: "lock_in", label: "I want to lock in this price", presented: "second", meaning: "the same create_order and request_invoice; the hosted invoice link is returned as the payment handoff for the person to pay when they choose. The finalized invoice's total is the price protection." },
    ],
    gates: [GATES.designApproval, GATES.payment],
  };
  const shipTo = inputs.shipTo as Record<string, string>;
  const text = [
    `Recap ${recapRef}: ${inputs.quantity} discs, ${inputs.size}, mounting ${inputs.mounting}.`,
    artwork ? `Artwork: https://tap.giving${artworkDisplayPath(artworkRef!)}` : "Artwork: none attached.",
    `Ship to: ${shipTo.name}, ${shipTo.street}, ${shipTo.city}, ${shipTo.state} ${shipTo.postalCode}, ${shipTo.country}. Phone: ${shipTo.phone}.`,
    `Cost: ${dollars(quote.grandTotalCents)} total. Shipping: Free. ${TAX_NOTE}`,
    ...RECAP_NOTES,
    "Exits: pay now (primary), or lock in this price. A person pays the hosted invoice; a person approves the final proof by email before any order is placed.",
  ].join("\n");
  return { structured, text, image };
}

// ─── order records ──────────────────────────────────────────────────

export interface OrderRecord {
  orderRef: string;
  orgSlug: string;
  mode: "live" | "test";
  exit: "pay_now" | "lock_in";
  church: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  quantity: number;
  size: "100mm-round" | "100mm-square";
  mounting: "adhesive" | "screws";
  antiMetalCount?: number;
  shipTo: Record<string, string>;
  givingUrl?: string;
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
    throw invalidInput(`The minimum order is ${MIN_QTY} discs. Quantity ${quantity} is below the minimum; this tool refuses it here rather than passing it downstream.`);
  }
  if (quantity > MAX_QTY) {
    throw invalidInput(`Quantity ${quantity} exceeds the maximum (${MAX_QTY} discs). Contact Ryan at ryan@tap.giving for an order this size.`);
  }
  const size = reqString(args, "size", 40);
  if (size !== "100mm-round" && size !== "100mm-square") {
    throw new ToolError("manual_exception",
      `Size "${size}" is not a built-in size. Built-ins are 100mm-round (4 inch round) and 100mm-square (4 inch square). ` +
      `Other sizes are handled by hand through Ryan at ryan@tap.giving, never silently substituted.`,
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
      "contactEmail does not belong to this key's organization. Orders are set up only for the organization the key was issued to.",
      { retryable: false });
  }
  const linkDestination = screenDestination(optString(args, "linkDestination", 500), "linkDestination");
  const givingUrl = screenDestination(optString(args, "givingUrl", 500), "givingUrl");
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
    ...(givingUrl ? { givingUrl } : {}),
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
  const church = optString(args, "church", 300) ?? auth.record.orgName;

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

  const quote = quoteFor({
    qty: shapeInputs.quantity as number,
    antiMetal: shapeInputs.antiMetalCount as number | undefined,
    redirect: false,
  });
  const orderRef = `mcp:${orgSlug}:${idemHash.slice(0, 16)}`;
  const shipTo = shapeInputs.shipTo as Record<string, string>;
  const size = shapeInputs.size as "100mm-round" | "100mm-square";

  // The INVREQ payload, in the website invoice door's shape.
  const invreqBody: Record<string, unknown> = {
    source: "mcp",
    discountEligible: true,
    lead: {
      church,
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
      brandName: church,
      ...(((shapeInputs.linkDestination as string | undefined) ?? (shapeInputs.givingUrl as string | undefined))
        ? { givingUrl: (shapeInputs.linkDestination as string | undefined) ?? (shapeInputs.givingUrl as string | undefined) }
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
    church, contactName, contactEmail, contactPhone,
    quantity: shapeInputs.quantity as number,
    size, mounting: shapeInputs.mounting as "adhesive" | "screws",
    ...(shapeInputs.antiMetalCount !== undefined ? { antiMetalCount: shapeInputs.antiMetalCount as number } : {}),
    shipTo,
    ...((shapeInputs.givingUrl as string | undefined) ? { givingUrl: shapeInputs.givingUrl as string } : {}),
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
        orgSlug, contactEmail, church, filename: rec.filename, mediaType: rec.mediaType,
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
    crmExpectation:
      "The CRM row appears on the next hourly adoption pass under the organization's slug, at stage \"ready\", " +
      "through the same adoption that processes website invoice requests. Source is distinguishable as the MCP; nothing else differs.",
    nextStep: order.exit === "pay_now"
      ? "Call request_invoice for this orderRef now and present the hosted invoice link to the person immediately; a person pays it on Stripe's hosted page."
      : "Call request_invoice for this orderRef; the hosted invoice link is the payment handoff for the person to pay when they choose. A person approves the final proof by email before any order is placed.",
  };
  const text = [
    `Order set up: ${order.orderRef}.`,
    `Total: ${dollars(order.quote.grandTotalCents)} for ${order.quantity} discs. Shipping: Free.`,
    structured.crmExpectation as string,
    structured.nextStep as string,
  ].join("\n");
  return { structured, text };
}

// ─── request_invoice ────────────────────────────────────────────────

async function toolRequestInvoice(ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const auth = requireKey(ctx.auth);
  // Parity gate (CEO ruling, 2026-11-06): the B1 field-for-field
  // invoice parity guard binds the live path too. Until acceptance
  // leg (f) passes against test mode, a live-mode key cannot mint
  // here: the invoice shape a live key would mint is one no test has
  // ever compared. The refusal sits at the entry, before any order
  // read or Stripe call, keyed on the authenticated org's mode.
  // create_order and its exits are untouched (they ride the proven
  // /api/invoice-request path), and test-mode behavior is unchanged.
  if (auth.record.mode === "live") {
    throw new ToolError(
      "invoice_parity_pending",
      "Invoice minting for live keys is refused until the field-for-field invoice parity check passes. Nothing was minted. create_order and its pay-now and lock-in exits are unaffected.",
      { retryable: false },
    );
  }
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
    return invoiceResult(order, order.invoice, true);
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
      church: order.church,
      email: order.contactEmail,
      qty: order.quantity,
      unitCents: order.quote.unitCents,
      discountEligible: order.quote.discountEligible,
      shape: order.size === "100mm-square" ? "square" : "round",
      mounting: order.mounting,
      linkDestination: order.linkDestination ?? order.givingUrl,
      antiMetalCount: order.antiMetalCount,
      exit: order.exit,
    }, ctx.fetchFn);
  } catch (e) {
    if (e instanceof StripeCallError) {
      throw new ToolError("stripe_unavailable", `Stripe did not complete the invoice request (${e.message}). Nothing was minted by this call beyond what Stripe's idempotency keys replay; retry with the same idempotencyKey.`);
    }
    throw e;
  }

  order.invoice = {
    invoiceId: minted.invoiceId,
    invoiceNumber: minted.invoiceNumber,
    status: minted.status,
    hostedInvoiceUrl: minted.hostedInvoiceUrl,
    totalCents: minted.totalCents,
    ...(minted.existing ? { existing: true } : {}),
  };
  await saveOrderRecord(ctx.env, order);
  await touchKey(ctx.env.MCP_KEYS, auth);
  return invoiceResult(order, order.invoice, false);
}

function invoiceResult(order: OrderRecord, invoice: NonNullable<OrderRecord["invoice"]>, replayed: boolean): ToolResult {
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
    ...(replayed ? { replayed: true } : {}),
    ...(order.antiMetalCount === undefined ? { antiMetal: "unknown", antiMetalNote: "No anti-metal count was recorded for this order, so the invoice carries no shielding line. If some discs go on metal surfaces, the count must be settled with the person before printing; it cannot be added afterwards." } : {}),
    nextStep: "Hand the handoffLine to the person. A person pays on Stripe's hosted page; this server moves no money itself. Artwork approval happens separately, by email, before production.",
  };
  const text = [
    `Invoice ${invoice.invoiceNumber ?? invoice.invoiceId} is ${invoice.status}.`,
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
    ...(stage === "received" ? { stageNote: "The order record is written; the CRM row appears on the next hourly adoption pass. Hourly adoption lag is the machinery's normal state, not an error." } : {}),
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
    fulfillment ? `Fulfillment: ${fulfillment.status}${fulfillment.tracking ? `, tracking ${fulfillment.tracking} (${fulfillment.carrier})` : ""}.` : "Fulfillment has not begun (it starts after payment and proof approval).",
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
      "Start here. One call orients a cold agent: the builder's introduction (NFC Tap Builder by Tap.Giving), the product in plain words, " +
      "the first choice (shape: round or square), the pricing tiers, the artwork spec summary, and the full capability list with the human gates. " +
      "No key, no email, nothing asked. " + GATES.payment,
    inputSchema: { type: "object", properties: { intent: { type: "string", description: "Optional free-text intent, echoed back as guidance." } } },
    annotations: READ,
    run: toolGetDiscovery,
  },
  {
    name: "get_quote",
    description:
      "The binding quote for a prospective order (also known as get_pricing): quantity, tier, list totals as the headline, the first-order 10 percent discount (code WELCOME10, 7-day renewing window) shown as a conditional line, " +
      "add-ons, free shipping as its own line, and the exact grand total. No tax line: tax surfaces at Stripe checkout and on the invoice. " +
      "Quantities below the 100-disc minimum are refused by this tool itself. No key needed.",
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
      "The full product facts: NTAG213 chip locked to the organization's go.tap.giving slug, 0.85 mm double-laminated matte waterproof PVC, " +
      "100 mm (4 inch) round and square built-ins (every other size is a manual exception), mounting, the metal caveat, table stands and lanyard badges, " +
      "the free Redirect Dashboard, and shipping terms (free; 2 to 3 weeks from artwork approval). No key needed.",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string", enum: [...PRODUCT_TOPICS], description: "Optional: narrow to one topic." } },
    },
    annotations: READ,
    run: toolGetProduct,
  },
  {
    name: "get_artwork_spec",
    description:
      "The production artwork spec for the chosen shape: 106 mm artboard, cut, bleed, and safe-zone geometry as structured millimetre data plus plain guidelines, " +
      "the format wanted back (vector, SVG preferred), house template examples to react to, and the optional logo ask. The agent builds the artwork with its own tools; " +
      "this server has no design-generation tool. No key needed.",
    inputSchema: {
      type: "object",
      properties: {
        shape: { type: "string", enum: ["round", "square"] },
        chosenExampleRef: { type: "string", description: "The example direction the person picked, carried with the spec." },
      },
    },
    annotations: READ,
    run: toolGetArtworkSpec,
  },
  {
    name: "submit_artwork",
    description:
      "Send the finished artwork back. Intake is permissive by ruling: a real image is accepted in any format and rejected only on three sanity grounds " +
      "(malicious or masquerading content, over 5 MB decoded, or not decodable as the type it claims). Production fitness is judged later in the normal proof flow, never here. " +
      "No key and no email are needed on the cold path; a keyed submission binds to the key's organization. Returns the artworkRef every later step carries, a displayUrl, and the benefits block to present right after the design step. " +
      GATES.designApproval,
    inputSchema: {
      type: "object",
      required: ["file", "sha256"],
      properties: {
        file: {
          type: "object", required: ["filename", "mediaType", "contentBase64"],
          properties: { filename: { type: "string" }, mediaType: { type: "string" }, contentBase64: { type: "string" } },
        },
        sha256: { type: "string", description: "Hex SHA-256 of the file bytes." },
        orderRef: { type: "string", description: "Optional: attach to an order this key's organization already created." },
        logo: {
          type: "object",
          properties: { filename: { type: "string" }, mediaType: { type: "string" }, contentBase64: { type: "string" } },
          description: "Optional source logo the artwork was built from; travels with the submission as source material.",
        },
        note: { type: "string" },
      },
    },
    annotations: WRITE,
    run: toolSubmitArtwork,
  },
  {
    name: "start_order_intent",
    description:
      "The kickoff and the journey's first ask: capture a contact email through the same public capture endpoint the website's email-first door uses, " +
      "so follow-up rides the existing lead machinery. No key needed. An intent is a lead, not an order: it creates no invoice and reserves nothing. " +
      "Completing an order needs an organization API key (ask Ryan at ryan@tap.giving).",
    inputSchema: {
      type: "object",
      required: ["email"],
      properties: {
        email: { type: "string" },
        church: { type: "string", description: "Optional organization name." },
        quantityHint: { type: "integer" },
        sourceNote: { type: "string" },
      },
    },
    annotations: WRITE,
    run: toolStartOrderIntent,
  },
  {
    name: "get_order_questions",
    description:
      "The order questions as structured data, in the exact order to ask them: quantity (100 minimum), mounting WITH the picture assets from the live order flow, " +
      "the optional link destination with its standing framing, and the shipping address (phone included) last. The contact email is captured first in this step, via start_order_intent. Key required.",
    inputSchema: { type: "object", properties: {} },
    annotations: READ,
    run: toolGetOrderQuestions,
  },
  {
    name: "get_recap",
    description:
      "The full recap, the last thing before the exits: the submitted artwork (displayUrl plus image content where renderable), the quantity, the shipping address as entered, " +
      "the exact cost from get_quote, and both required notes. Returns a recapRef; create_order carries it, and an order whose inputs differ from the recap is refused as a conflict. Key required.",
    inputSchema: {
      type: "object",
      required: ["quantity", "size", "mounting", "shipTo"],
      properties: {
        quantity: { type: "integer" },
        size: { type: "string", enum: ["100mm-round", "100mm-square"] },
        mounting: { type: "string", enum: ["adhesive", "screws"] },
        antiMetalCount: { type: "integer" },
        shipTo: {
          type: "object", required: ["name", "street", "city", "state", "postalCode", "country", "phone"],
          properties: {
            name: { type: "string" }, street: { type: "string" }, city: { type: "string" },
            state: { type: "string" }, postalCode: { type: "string" }, country: { type: "string" }, phone: { type: "string" },
          },
        },
        artworkRef: { type: "string" },
        linkDestination: { type: "string" },
        givingUrl: { type: "string" },
        contactEmail: { type: "string" },
      },
    },
    annotations: READ,
    run: toolGetRecap,
  },
  {
    name: "create_order",
    description:
      "Set up an order for the key's organization through the same front door a website order takes (an INVREQ record the hourly adoption resolves into the CRM, indistinguishable downstream). " +
      "This is the lock-in write behind both recap exits; it carries the recapRef and a required idempotencyKey (a retry with the same key and payload returns the original orderRef; the same key with a different payload is a conflict naming the differing fields). " +
      "The 100-disc minimum is enforced here. Sizes other than the two built-ins return manual_exception. " + GATES.designApproval + " " + GATES.payment,
    inputSchema: {
      type: "object",
      required: ["contactName", "contactEmail", "contactPhone", "quantity", "size", "mounting", "shipTo", "recapRef", "idempotencyKey"],
      properties: {
        contactName: { type: "string" },
        contactEmail: { type: "string", description: "Must belong to the key's organization." },
        contactPhone: { type: "string" },
        church: { type: "string", description: "Organization name; defaults to the key's organization name." },
        quantity: { type: "integer" },
        size: { type: "string", description: "100mm-round or 100mm-square; anything else is a manual exception handled by hand through Ryan." },
        mounting: { type: "string", enum: ["adhesive", "screws"] },
        antiMetalCount: { type: "integer" },
        shipTo: {
          type: "object", required: ["name", "street", "city", "state", "postalCode", "country", "phone"],
          properties: {
            name: { type: "string" }, street: { type: "string" }, city: { type: "string" },
            state: { type: "string" }, postalCode: { type: "string" }, country: { type: "string" }, phone: { type: "string" },
          },
        },
        givingUrl: { type: "string" },
        linkDestination: { type: "string", description: "Any http or https URL; optional, changeable anytime; the Redirect Dashboard is the default." },
        artworkRef: { type: "string" },
        note: { type: "string" },
        recapRef: { type: "string" },
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
      "Return the payment handoff for an order this key's organization created: a real, finalized Stripe hosted invoice and its link, minted under the invoice playbook " +
      "(send_invoice collection, 7 days to due, first-order coupon when eligible, the free shipping line, finalized with auto_advance=false so Stripe emails nothing). " +
      "If the customer already has an open or draft invoice, that invoice's link is returned flagged existing. " +
      "Live-mode keys are refused with invoice_parity_pending until the field-for-field invoice parity check passes. " +
      "This server moves no money itself: it returns a hosted invoice link for a person to pay.",
    inputSchema: {
      type: "object",
      required: ["orderRef", "idempotencyKey"],
      properties: {
        orderRef: { type: "string" },
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
      "An order not yet adopted returns stage \"received\" with the adoption expectation, not an error. Key required; only the key's own organization's orders.",
    inputSchema: {
      type: "object",
      properties: { orderRef: { type: "string" }, invoiceId: { type: "string" } },
    },
    annotations: READ,
    run: toolGetOrderStatus,
  },
  {
    name: "register_webhook",
    description:
      "Register (or replace) the organization's one webhook subscription for proof_ready and shipped events. The subscription secret is shown once, here. " +
      "Registration is live in v1; delivery is pending and lands in v1.1, so until then get_order_status is the state read. Nothing about registration implies live push. Key required.",
    inputSchema: {
      type: "object",
      required: ["callbackUrl", "events"],
      properties: {
        callbackUrl: { type: "string", description: "https URL." },
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
  return def.run(ctx, args);
}
