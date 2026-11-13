import { STATUS_RECOVERY_LINE, DASHBOARD_LOGIN_URL, DESTINATION_BEFORE_ARRIVAL_LINE } from "./facts.ts";

// The explainer surface (brief step 6): MCP resources, not a FAQ tool.
// Topics carry only sourced facts. NO-COPY omissions are deliberate:
// no continuity promise, no replacement promise on loss or theft, no
// approval-workflow answer (no sourced answer exists; the gap is
// named in after-you-order), and no QR-sticker value case (held out
// until a sourced wording exists).

export const EXPLAINER_URI_PREFIX = "tapgiving://explainer/";

export interface ExplainerTopic {
  slug: string;
  title: string;
  body: string;
}

export const EXPLAINER_TOPICS: ExplainerTopic[] = [
  {
    slug: "how-it-works",
    title: "How it works",
    body:
      "Two parts. Part 1 is design: work from the published artwork spec, look at real delivered examples, compose the artwork with your own tools, and submit the finished file to see it on the disc as a proof. The print-ready PDF is a file your own agent produces from the spec; the artwork is yours to take to any printer. Part 2, only if you want it, is ordering discs through Tap.Giving: answer the order questions, review the recap, and place the order at the final step, labeled \"Email me my invoice and design proof.\"",
  },
  {
    slug: "what-a-tap-disc-does",
    title: "What a tap disc does",
    body:
      "A visitor holds a phone near the disc and the page opens. NFC is the tap itself: no app is needed and nothing has to be installed. Tapping works on iPhone XS (2018) and later and most Android phones from about 2015, which read the disc automatically in the background. Every disc carries its own Tap.Giving address, so where a tap lands is set per disc, and it can be changed anytime in the Redirect Dashboard.",
  },
  {
    slug: "nfc-vs-qr",
    title: "NFC tap versus a printed QR code",
    body:
      "The tap is the primary door: hold a phone near the disc and the page opens, no app needed. A printed QR code appears on a disc only when the design carries one; it serves phones without NFC, or with NFC off, and lands on the same destination. A design with no printed code has the tap as its only door, and the design choice is yours at artwork time. In the design phase a QR code is a labeled mock built from the URL you enter; production encodes the disc's Redirect Dashboard link to that same destination.",
  },
  {
    slug: "the-two-phases",
    title: "The two phases: design, then order",
    body:
      "Phase one is design and collects nothing: no name, no email, no payment. Midway through design you may enter the URL the disc should open; it shapes the design (including the mock QR code) and is confirmed again at the recap if you order. Phase two is the order, only if you choose it: it opens with your contact email, then the organization name, the shipping address and phone, quantity, shape, mounting, and the link destination confirmation. Prices are stated in phase two: the price range and the no-fees line appear at the order questions, and totals appear at the quote and the recap.",
  },
  {
    slug: "after-you-order",
    title: "After you order",
    body:
      "Placing the order at the final step emails the invoice and the design proof to the contact email. Production waits for your proof approval by email, and the invoice is paid on its hosted page by card or ACH bank transfer; there is no check or purchase-order process. Production and delivery run 2 to 3 weeks from artwork approval, and there is no rush option. If discs are lost or damaged, the design and order history stay on the organization's orders, and a reorder uses the same design. One gap, stated plainly: how an internal approval chain inside your organization (for example a board approving while someone else pays) should be sequenced is not something this server documents; ask the Tap.Giving team at hello@tap.giving. Where a tap goes: your discs open your dashboard address. After they arrive, sign in to the Redirect Dashboard at " + DASHBOARD_LOGIN_URL + " (the username is your dashboard address's name, and the password arrives by email with your shipping notice) and re-point any disc anytime. " + DESTINATION_BEFORE_ARRIVAL_LINE + " Checking on your order: ask for its status with your status reference, the reference issued at placement. " + STATUS_RECOVERY_LINE + '",' 
  },
  {
    slug: "materials-and-care",
    title: "Materials and care",
    body:
      "The discs are 0.85 mm double-laminated matte waterproof PVC with a locked NTAG213 tap chip, built to be wiped down and spilled on. Every disc carries 3M adhesive backing as standard; pre-drilled screw holes (2 holes, 6 mm) are optional, discs with holes keep the adhesive too, and screws are not included. Discs do not work on metal surfaces without the anti-metal shielding layer, which is decided before printing because it cannot be added afterwards. We do not offer physical samples.",
  },
];

export function explainerResourceUri(slug: string): string {
  return EXPLAINER_URI_PREFIX + slug;
}

export function findExplainerTopic(uri: string): ExplainerTopic | null {
  if (!uri.startsWith(EXPLAINER_URI_PREFIX)) return null;
  const slug = uri.slice(EXPLAINER_URI_PREFIX.length);
  return EXPLAINER_TOPICS.find((t) => t.slug === slug) ?? null;
}
