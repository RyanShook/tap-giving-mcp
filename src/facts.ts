// The published fact set (spec sections 2.2, 2.4, 2.6): every answer
// this server gives sources from the same facts llms.txt and the
// for-agents guide publish, curated at build time from
// documentation/disc-product-spec.md and documentation/INVOICE-PLAYBOOK.md
// in the business repo. The contract tests pin the load-bearing
// strings (chip, sizes, tier figures) so a drift here fails loudly.

export const SERVER_NAME = "NFC Tap Builder by Tap.Giving";
export const SERVER_TITLE = "NFC Tap Builder by Tap.Giving";

// The positioning lead (Ryan, 2026-11-08): this server is a tool
// first. It creates print-ready NFC tap artwork proofs from the
// published spec and the house design directions; the artwork is
// the organization's own, vendor-neutral, to print anywhere.
// Ordering discs through Tap.Giving is the optional second step.
// The sentence states only what the tools do today: the server
// publishes the spec and directions, the calling agent composes
// the artwork with its own tools, submit_artwork takes the
// finished file in, the on-disc preview shows it back, and the
// emailed final proof belongs to the order stage.
export const POSITIONING_LINE =
  "A design tool first: this server helps you create print-ready NFC tap artwork proofs. " +
  "Work from its published spec and design directions, compose the artwork with your own tools, " +
  "and submit the finished file to see it on the disc as a proof. The artwork is yours: print-ready, " +
  "vendor-neutral, yours to take to any printer. Ordering discs through Tap.Giving is an optional " +
  "next step, only if you want it.";
// The no-fees lead line: stated once here, used in the server
// description and as the lead line of get_discovery's Why section.
// Facts: no subscription fees (BENEFITS), and the Redirect Dashboard
// is included free on every order, permanently (PRODUCT).
export const NO_FEES_LINE =
  "No subscriptions and no ongoing fees: one-time pricing per order, and the Redirect Dashboard is included free, permanently.";

export const APPLICATIONS_LIST = "churches, nonprofits, restaurants, coffee shops, and local businesses";
export const SERVER_DESCRIPTION =
  POSITIONING_LINE + " " +
  "The discs themselves are custom NFC tap discs and tap tags for organizations of every kind: " +
  "built for " + APPLICATIONS_LIST + ", designed by your own agent. " + NO_FEES_LINE + " " +
  "Ordering is optional and stays behind the human payment and proof gates. This server moves no money itself and issues no invoices: a person from Tap.Giving follows up with the invoice.";
export const PRESENTATION_SYNONYMS = ["tap discs", "tap plates", "tap tags", "NFC tap discs"];
export const ENDPOINT = "https://tap.giving/mcp";
export const REPO_URL = "https://github.com/RyanShook/tap-giving-mcp";
// How a person gets a key (F2): a role and an address, never a first
// name, plus the turnaround and what to say. hello@tap.giving is the
// published contact address (it is on the website's own emails).
export const TEAM_EMAIL = "hello@tap.giving";

// The test seat, stated plainly (item 3): a Registry evaluator or an
// agent developer can hold a test key and run the whole keyed journey
// with no real order and no charge. There is no self-serve issuance;
// asking the team by email is the route.
export const TEST_KEY_LINE =
  "Evaluating the server? A test key runs the full journey, including placing a test order, with no real order and no charge. " +
  "There is no self-serve signup: email hello@tap.giving and ask for a test key, and the team replies " +
  "with one (a tg_test_<orgslug>_<secret> key) within one business day.";
export const KEY_REQUEST_LINE =
  "Placing an order never requires a key: discovery, product facts, the artwork spec, the order questions, " +
  "the recap, and order setup all run keyless. An organization API key is optional: " +
  "it enriches the order questions with the key's own organization block, and it governs order status and " +
  "webhook registration. Keys are issued by the Tap.Giving team: email hello@tap.giving from the address " +
  "you want associated with the organization, say which organization the key is for, and the team replies " +
  "with the key within one business day. Keys look like tg_live_<orgslug>_<secret>; test keys look like " +
  "tg_test_<orgslug>_<secret>.";

// The standing differentiators (llms.txt and for-agents fact set),
// carried in submit_artwork's output and in get_discovery so the
// wording exists in exactly one shape (spec section 2.6).
export const BENEFITS: string[] = [
  "Works with any platform",
  "No subscription fees",
  "Durable waterproof PVC with a locked tap chip",
  "Custom branding on every design",
  "Free shipping",
  "Covered by our 30-day money-back guarantee",
];

export const PRODUCT = {
  chip: "NTAG213",
  chipDetail: "NTAG213 chip, locked to your organization's Tap.Giving address, assigned by Tap.Giving",
  chipPlain: "a locked tap chip, set to your organization's Tap.Giving address, assigned by Tap.Giving",
  material: "0.85 mm double-laminated matte waterproof PVC",
  sizes: [
    { size: "100mm-round", label: "100 mm (4 inch) round", shape: "round" },
    { size: "100mm-square", label: "100 mm (4 inch) square", shape: "square" },
  ],
  sizePolicy:
    "Built-in sizes are 100 mm (4 inch) round and 100 mm (4 inch) square at the same price. " +
    "Every other size or shape is a manual exception handled by hand through the Tap.Giving team (hello@tap.giving), never self-serve.",
  mounting: ["adhesive", "screws"],
  mountingDetail:
    "Every disc carries 3M adhesive backing as standard. Pre-drilled screw holes (2 holes, 6 mm) are optional at no extra cost, and discs with holes keep the adhesive too.",
  metalCaveat:
    "Discs do not work on metal surfaces without the anti-metal shielding layer: a ferrite layer at $1.00 per shielded disc, decided before printing because it cannot be added afterwards.",
  redirectDashboard:
    "The Redirect Dashboard is included free on every order, permanently: re-point where a tap lands anytime (change where any disc points in seconds), and see tap counts.",
  guarantee: "Covered by our 30-day money-back guarantee.",
  worksWith: "Works with any platform. No subscription fees.",
  stands: [
    { name: "Table stand, small", size: "70 x 100 mm", priceCents: 700 },
    { name: "Table stand, large", size: "120 x 140 mm", priceCents: 900 },
  ],
  badges: [
    { name: "Lanyard badge", size: "90 x 130 mm", priceCents: 500 },
  ],
  shipping: {
    cost: "Free shipping on every order.",
    terms: "Production and delivery run 2 to 3 weeks from artwork approval.",
  },
} as const;

export const PRODUCT_TOPICS = ["discs", "stands", "badges", "mounting", "shipping", "samples", "ordering"] as const;
export type ProductTopic = (typeof PRODUCT_TOPICS)[number];

// Production geometry (spec section 2.6), read from the production
// sources: artwork/_audit.py constants (PLATE_CANVAS_MM 106.0,
// CUT_R 50.0, BLEED_R 53.0, SAFE_R 45.0, SQUARE_BLEED_HALF 53.0,
// SQUARE_SAFE_HALF 47.0, MIN_LOGO_MM 18.0) and the print row of
// documentation/disc-product-spec.md.
export const ARTWORK_GEOMETRY = {
  canvasMm: 106,
  bleedMm: 3,
  round: {
    shape: "round",
    cutDiameterMm: 100,
    cutRadiusMm: 50,
    bleedRadiusMm: 53,
    safeRadiusMm: 45,
    centreMm: { x: 53, y: 53 },
  },
  square: {
    shape: "square",
    cutSizeMm: 100,
    cutBoxMm: { from: 3, to: 103 },
    bleedHalfWidthMm: 53,
    safeHalfWidthMm: 47,
  },
  formatWanted:
    "Artwork is created as vector where the agent can (SVG preferred; AI or vector PDF accepted), " +
    "and intake accepts any real image up to 5 MB (5,242,880 bytes decoded): raster images are accepted at intake, " +
    "and production fitness is judged later in the normal proof flow, never at intake.",
  background: "Flat solid colour background (a standing production rule).",
  minimumLogoMm: 18,
  encoding:
    "The disc encodes the organization's Tap.Giving address, assigned by Tap.Giving; never invent a raw destination URL for the artwork.",
  screwHoles: {
    count: 2,
    diameterMm: 6,
    centreOffsetMm: 43.25,
    centresMm: [
      { x: 9.75, y: 53 },
      { x: 96.25, y: 53 },
    ],
    note:
      "Two pre-drilled holes, 6 mm across, centered 43.25 mm either side of the disc center on the horizontal " +
      "midline (centers at (9.75, 53) and (96.25, 53) mm on the artboard). Drilled only when screws mounting " +
      "is chosen; discs with holes keep the adhesive backing too.",
  },
} as const;

export const ARTWORK_GUIDELINES: string[] = [
  "Design edge to edge on the 106 mm square artboard; the cut is the inner 100 mm shape.",
  "Keep important elements inside the safe zone so nothing risks edge clipping.",
  "If you choose screws, keep the two 6 mm hole areas clear: the holes are drilled on the left and right midline, so frames and borders should not cross those spots.",
  "Vector artwork is preferred back (SVG preferred, AI or vector PDF accepted), but intake accepts any real image up to 5 MB (5,242,880 bytes decoded); production fitness is judged later in the normal proof flow.",
  "Use a flat solid colour background.",
  "A logo in a lockup should be at least 18 mm at final size (the smallest size with a shipped precedent).",
  "Production fitness is judged later in the normal proof flow; intake accepts any real image that passes the sanity checks.",
];

// The mounting picture assets from the live order flow
// (website/finalize.html's mount grid). The hosted URLs are the
// contract; the space-named .jpeg originals must never be linked.
export const MOUNTING_OPTIONS = [
  {
    value: "adhesive",
    label: "Adhesive backing",
    imageUrl: "https://tap.giving/assets/mount-adhesive.webp",
    imageWidth: 660,
    imageHeight: 453,
    text: "Non-destructive 3M adhesive: peel and stick onto a seat back, table, or counter. No drilling.",
  },
  {
    value: "screws",
    label: "Pre-drilled holes for screws + adhesive backing",
    imageUrl: "https://tap.giving/assets/mount-screws.webp",
    imageWidth: 750,
    imageHeight: 515,
    text: "Pre-drilled holes for screws + Adhesive Backing: two side holes, plus the adhesive backing. Screws not included.",
  },
] as const;

// The destination model, stated once (item 4): pointing is per disc
// at the record level (the shipped dashboard's own copy says it can
// change where any disc points), the whole set starts at one
// destination, and two destinations work by splitting the set in the
// dashboard. The printed-code fallback is stated conditionally on the
// design carrying a code, and Dashboard login timing follows the
// status answer's own contract (password by email with the shipping
// notice).
export const DESTINATION_MODEL =
  "Every disc carries its own Tap.Giving address, so where a tap lands is set per disc. An order " +
  "starts with one destination for the whole set, the page you give at order setup. To run two " +
  "destinations, for example counter discs opening your menu and door discs opening your review " +
  "profile, split the set afterwards in the free Redirect Dashboard: re-point any single disc, or " +
  "any group of discs, in seconds, and re-point them again anytime. Your dashboard sign-in works " +
  "from order setup: the address is go.tap.giving/<your-organization-slug>, the username is that " +
  "slug, and the password arrives by email with the shipping notice, before your discs arrive. " +
  "Tapping needs no app: iPhone XS (2018) and later and most Android phones from about 2015 read " +
  "the disc automatically in the background. Where a design carries a printed QR code (your " +
  "artwork includes one, or the Tap.Giving address line on the design), a phone without NFC, or " +
  "with NFC off, scans that code and lands on the same destination; a design with no printed code " +
  "has the tap as its only door, and the design choice is yours at artwork time.";

// The production turnaround, one canonical wording (item 8): the
// product shipping terms and the recap notes already state it; this
// constant carries it into discovery and quotes too.
export const TURNAROUND = "Production and delivery run 2 to 3 weeks from artwork approval.";

export const LINK_DESTINATION_NOTE =
  "Where should a tap send people? Give the page URL and your discs start pointed there. " +
  "Leaving it blank is fine too, and a tap is never left going nowhere: your discs ship pointed at your " +
  "own Tap.Giving page (your free Redirect Dashboard), and you can set or change the destination anytime " +
  "from the dashboard.";

export const RECAP_NOTES: string[] = [
  "Shipping usually takes two to three weeks from artwork approval.",
  "We email you a final proof before anything is printed.",
];

export const TAX_NOTE = "Tax, where it applies, is calculated on the invoice.";

// Persona round 1 (2026-11-08): the answers the cold-user loop
// found missing, each stated only as far as the verified record
// goes (landing record in docs/spec.md).
export const SAMPLES_LINE =
  "Samples: we do not offer physical samples, free or paid. Instead, see the finished examples and photos " +
  "in this server, and when you order, a proof of your own design is emailed for approval before anything " +
  "is printed. The order itself is covered by the 30-day money-back guarantee.";
export const SAMPLES_GUIDANCE_LINE =
  "Samples: we do not offer physical samples, free or paid. The finished examples and photos here show the " +
  "real thing, your own design is proofed by email before printing, and the order is covered by the 30-day " +
  "money-back guarantee.";
export const TAX_EXEMPT_LINE =
  "Tax-exempt organizations: say so when you order. Your tax-exempt state is recorded on the order, and " +
  "tax is calculated on the invoice where it applies.";
export const TAX_EXEMPT_GUIDANCE_LINE =
  "Tax-exempt: say so when you order and the tax-exempt state is recorded on your order; tax is calculated " +
  "on the invoice where it applies.";
export const PAYMENT_GUIDANCE_LINE =
  "Payment: this server takes no payment. A person from Tap.Giving follows up with the invoice after the " +
  "order is placed, and invoices are paid by card or ACH bank transfer.";
export const PLAIN_NFC_LINE =
  "NFC is the tap itself: a visitor holds a phone near the disc and the page opens. No app is needed, and " +
  "nothing has to be installed.";
export const QR_CONDITIONAL_LINE =
  "A scannable QR code appears on a disc only when the design carries a printed code; the tap works either way.";
export const VERSUS_PRINTED_CODES_LINE =
  "Against a printed code on a sticker: a sticker's code is fixed the day it is printed, and stickers peel, " +
  "fade, and tear. These discs are durable waterproof PVC, the tap chip inside is locked to your address, " +
  "and every disc can be re-pointed in the Redirect Dashboard when your page moves.";
export const DURABILITY_LINE =
  "The discs are waterproof PVC, built to be wiped down and spilled on.";
export const MOUNTING_SURFACE_GUIDE = [
  "Adhesive backing: for smooth surfaces where a no-holes fixing is wanted.",
  "Screws through the pre-drilled holes: for a permanent fixing that does not rely on adhesive. Screws are not included.",
];
// P-13: the verify-against-example instruction (an instruction to
// the calling agent, carried by get_artwork_spec and submit_artwork,
// in text and as a structured field).
export const VERIFY_AGAINST_EXAMPLE = {
  instruction:
    "Before you consider the design done, compare the rendered art against the example direction you chose, " +
    "item by item, and revise the artwork and submit again if it diverges on any item.",
  checklist: ["layout", "palette", "icon treatment", "type hierarchy", "safe zones", "flat solid background"],
};
export const VERIFY_AGAINST_EXAMPLE_TEXT =
  "Verify against your example before you call the design done: compare the rendered art with the direction " +
  "you chose, item by item (layout, palette, icon treatment, type hierarchy, safe zones, flat solid " +
  "background). If it diverges on any item, revise the artwork and submit again.";

// The 7-day renewing window in plain words (item 6): the window runs
// from the quote, and a fresh quote renews it. The recap's priceHold
// note states the same terms to keyed callers.
export const DISCOUNT_WINDOW_MEANING =
  "The 7-day renewing window means: the first-order discount applies to a first order placed " +
  "within 7 days of this quote. If the 7 days pass unused, ask for a fresh quote and the window " +
  "starts again; the discount is never lost for good, and it never applies to a second order.";

// The opening surfaces' pricing lead (Ryan, 2026-11-07, extended
// 2026-11-08): the range line only, in discovery text AND
// structured content, the GET self-description, and the
// initialize instructions. The tier breakdown, the minimum, and
// the first-order discount live at the quote step and after it,
// never on an opening surface.
export const PRICE_RANGE_LINE = "Price range of $3.50 - $5.00 per disc depending on quantity.";

export const GATES = {
  designApproval:
    "Design approval stays human: a person approves the final proof by email before production. No tool on this server records or implies an approval.",
  payment:
    "Payment stays human: This server moves no money itself and issues no invoices: a person from Tap.Giving follows up with the invoice. A person pays the invoice when it arrives.",
  production:
    "Production release and the supplier handoff stay human: no tool on this server releases an order to production or touches fulfillment state.",
};
