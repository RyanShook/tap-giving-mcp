// The published fact set (spec sections 2.2, 2.4, 2.6): every answer
// this server gives sources from the same facts llms.txt and the
// for-agents guide publish, curated at build time from
// documentation/disc-product-spec.md and documentation/INVOICE-PLAYBOOK.md
// in the business repo. The contract tests pin the load-bearing
// strings (chip, sizes, tier figures) so a drift here fails loudly.

export const SERVER_NAME = "NFC Tap Builder by Tap.Giving";
export const SERVER_TITLE = "NFC Tap Builder by Tap.Giving";
// The no-fees lead line: stated once here, used in the server
// description and as the lead line of get_discovery's Why section.
// Facts: no subscription fees (BENEFITS), and the Redirect Dashboard
// is included free on every order, permanently (PRODUCT).
export const NO_FEES_LINE =
  "No subscriptions and no ongoing fees: one-time pricing per order, and the Redirect Dashboard is included free, permanently.";

export const SERVER_DESCRIPTION =
  "Build and order custom NFC tap discs and tap tags for churches and nonprofits: " +
  "NFC tap to give, designed by your own agent, priced from the published tiers, ordered up to the " +
  "human payment and proof gates. " + NO_FEES_LINE + " This server moves no money itself: it returns a hosted invoice " +
  "link for a person to pay.";
export const PRESENTATION_SYNONYMS = ["tap discs", "tap plates", "tap tags", "NFC tap to give"];
export const ENDPOINT = "https://tap.giving/mcp";
export const REPO_URL = "https://github.com/RyanShook/tap-giving-mcp";
export const KEY_REQUEST_LINE =
  "An organization API key is issued by Tap.Giving: ask Ryan at ryan@tap.giving. " +
  "Read tools need no key; order setup, invoice requests, and order status need the organization's key.";

// The standing differentiators (llms.txt and for-agents fact set),
// carried in submit_artwork's output and in get_discovery so the
// wording exists in exactly one shape (spec section 2.6).
export const BENEFITS: string[] = [
  "Works with any giving platform",
  "No subscription fees",
  "Durable waterproof PVC with a locked NTAG213 chip",
  "Custom branding from 100 discs",
  "Free shipping",
  "Covered by our 30-day money-back guarantee",
];

export const PRODUCT = {
  chip: "NTAG213",
  chipDetail: "NTAG213 chip (144 bytes user memory), locked to https://go.tap.giving/<slug>, assigned by Tap.Giving",
  material: "0.85 mm double-laminated matte waterproof PVC",
  sizes: [
    { size: "100mm-round", label: "100 mm (4 inch) round", shape: "round" },
    { size: "100mm-square", label: "100 mm (4 inch) square", shape: "square" },
  ],
  sizePolicy:
    "Built-in sizes are 100 mm (4 inch) round and 100 mm (4 inch) square at the same price. " +
    "Every other size or shape is a manual exception handled by hand through Ryan at ryan@tap.giving, never self-serve.",
  mounting: ["adhesive", "screws"],
  mountingDetail:
    "Every disc carries 3M adhesive backing as standard. Pre-drilled screw holes (2 holes, 6 mm) are optional at no extra cost, and discs with holes keep the adhesive too.",
  metalCaveat:
    "Discs do not work on metal surfaces without the anti-metal shielding layer: a ferrite layer at $1.00 per shielded disc, decided before printing because it cannot be added afterwards.",
  redirectDashboard:
    "The Redirect Dashboard is included free on every order, permanently: re-point where a tap lands anytime (change where any disc points in seconds), and see tap counts.",
  guarantee: "Covered by our 30-day money-back guarantee.",
  worksWith: "Works with any giving platform. No subscription fees.",
  stands: [
    { name: "Table stand, small", size: "70 x 100 mm", priceCents: 700, minimum: 100 },
    { name: "Table stand, large", size: "120 x 140 mm", priceCents: 900, minimum: 100 },
  ],
  badges: [
    { name: "Lanyard badge", size: "90 x 130 mm", priceCents: 500, minimum: 100 },
  ],
  shipping: {
    cost: "Free shipping on every order.",
    terms: "Production and delivery run 2 to 3 weeks from artwork approval.",
  },
} as const;

export const PRODUCT_TOPICS = ["discs", "stands", "badges", "mounting", "shipping"] as const;
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
    "The disc encodes the organization's go.tap.giving slug, assigned by Tap.Giving; never invent a raw giving URL for the artwork.",
} as const;

export const ARTWORK_GUIDELINES: string[] = [
  "Design edge to edge on the 106 mm square artboard; the cut is the inner 100 mm shape.",
  "Keep important elements inside the safe zone so nothing risks edge clipping.",
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
    text: "Non-destructive 3M adhesive: peel and stick onto the pew or the back of a chair. No drilling.",
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

export const LINK_DESTINATION_NOTE =
  "Where should a tap send people? Optional: you can leave this blank and change it anytime; " +
  "your discs ship ready to re-point from your free Redirect Dashboard.";

export const RECAP_NOTES: string[] = [
  "Shipping usually takes two to three weeks.",
  "We send a final proof via email before any order is placed.",
];

export const TAX_NOTE = "Tax, where it applies, is calculated on the invoice.";

export const GATES = {
  designApproval:
    "Design approval stays human: a person approves the final proof by email before production. No tool on this server records or implies an approval.",
  payment:
    "Payment stays human: this server moves no money itself. It returns a hosted invoice link and a person pays on Stripe's hosted page.",
  production:
    "Production release and the supplier handoff stay human: no tool on this server releases an order to production or touches fulfillment state.",
};
