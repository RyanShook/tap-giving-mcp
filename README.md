# NFC Tap Builder by Tap.Giving

Welcome. This is the public home of Tap.Giving's MCP server, "NFC Tap
Builder by Tap.Giving". A design tool first: this server helps you create print-ready NFC tap artwork proofs. Work from its published spec and design directions, compose the artwork with your own tools, and submit the finished file to see it on the disc as a proof. The artwork is yours: print-ready, vendor-neutral, yours to take to any printer. Ordering discs through Tap.Giving is an optional next step, only if you want it. The discs it designs for are custom
NFC tap discs, tap plates, and tap tags. The Redirect Dashboard is
included with every order.

- **Website:** [https://tap.giving](https://tap.giving)
- **Endpoint:** `POST https://tap.giving/mcp` (MCP over Streamable
  HTTP, JSON-RPC 2.0, stateless). `GET https://tap.giving/mcp`
  returns a short self-description for people and agents.
- **Agent index:** [https://tap.giving/llms.txt](https://tap.giving/llms.txt),
  the site's llms.txt, names this server and links back to this repo.
- **Spec:** the published design and tool contracts live in
  [docs/spec.md](docs/spec.md). The server is built and accepted:
  every acceptance leg passed, including the field-for-field invoice
  parity check against Stripe test mode on 2026-11-07.
- **This repo stays clean:** README, the published spec, and the
  released server code. Working notes and anything touching private
  business operations live elsewhere by design.

## Connect (no key anywhere)

Any MCP client connects with this block alone:

```json
{
  "mcpServers": {
    "tap-giving": {
      "type": "http",
      "url": "https://tap.giving/mcp"
    }
  }
}
```

No key, login, or account exists anywhere in this server, for any
tool, order status included. Order status is read with the order's
status reference, issued at placement and carried in the order's
email; keep it, it cannot be recovered if lost.

Claude Code, one line:

```sh
claude mcp add --transport http tap-giving https://tap.giving/mcp
```

Discovery, product facts, the artwork spec, and the
order questions ask nothing; exact totals come from get_quote in
Part 2, at the end. Part 1 (design) carries no pricing at all. The live `GET https://tap.giving/mcp` self-description
carries this same connect guidance.

## What the server does

A design tool first: this server helps you create print-ready NFC tap artwork proofs. Work from its published spec and design directions, compose the artwork with your own tools, and submit the finished file to see it on the disc as a proof. The artwork is yours: print-ready, vendor-neutral, yours to take to any printer. Ordering discs through Tap.Giving is an optional next step, only if you want it.

The discs themselves are custom NFC tap discs, tap plates, and tap
tags for organizations of every kind: built for churches, nonprofits, restaurants, coffee shops, and local businesses,
designed by your own agent.

Nothing in this server needs a key, a login, or an account: an agent
can discover the product, read the artwork spec with delivered example
designs, and submit artwork for validation before any contact exists.
Part 1 (design) carries no pricing at all; exact pricing is quoted only
at the quote step, in Part 2.

This server moves no money itself, and payment happens on the hosted
invoice: when an order is placed, the invoice and the design proof are
emailed to the customer (the final step's exact label is "Email me my
invoice and design proof."). Payment, design approval, and production
release stay human gates: no tool takes payment, approves a design, or
releases an order to production.

## Tools

| Tool | What it does | Annotations | Returns |
|---|---|---|---|
| `get_discovery` | One-call orientation: the product, the two shapes, the two-part flow (Part 1 design, Part 2 order), the artwork summary, and the tool list. Part 1 content only: no pricing, no credential of any kind. | readOnlyHint: true, idempotentHint: true | `server`, `introduction.product`, `capabilities` |
| `get_quote` (alias `get_pricing`) | Part 2: an exact quote from the published tiers; below 100 discs is refused with the minimum stated. | readOnlyHint: true, idempotentHint: true | `discUnitCents`, `discSubtotalCents`, `grandTotalCents`, and the discount-eligibility sentence |
| `get_product` | Full product facts: sizes, materials, mounting, turnaround, anti-metal facts, related products. Part 1 surface: no prices. | readOnlyHint: true, idempotentHint: true | product facts with images |
| `get_artwork_spec` | The design spec as machine-followable data: geometry, bleed, safe zones, the numbered delivered-artwork examples with their reproduction data, the P-13 verify-against-example data, and the print-ready PDF output standard (the user's agent produces the PDF; the server never builds or returns one). | readOnlyHint: true, idempotentHint: true | spec data with images |
| `get_order_questions` | Part 2 entry: the order questions in Ryan's order (email first via the intent capture, then organization name, shipping address and phone, quantity, shape, mounting, and the link destination as a recap confirmation). The price range line is first stated here. | readOnlyHint: true, idempotentHint: true | the question set as structured data, with images |
| `get_recap` | The pre-order recap: the artwork, the answers, and the exact total, bound to the captured intent's email. | readOnlyHint: true, idempotentHint: true | recap block with the artwork image |
| `start_order_intent` | Captures the contact email (Part 2 opens here) and returns the plain next step: no key, no login, no account is needed to complete an order. | readOnlyHint: false, idempotentHint: true | `{captured, nextStep}` |
| `submit_artwork` | Submits the agent's finished artwork file for the on-disc proof; returns the export block (the submitted file byte-identical, a PNG render, the on-disc preview). | readOnlyHint: false, idempotentHint: true | artwork reference, validation, export block with images |
| `create_order` | The final step, "Email me my invoice and design proof.": places the order (recorded in the CRM, the full order emailed to the Tap.Giving team), a Stripe invoice is created and finalized at the quoted total, and the invoice plus the design proof are emailed to the customer. | readOnlyHint: false, idempotentHint: true | order reference, `statusRef`, step outcomes |
| `get_order_status` | Where an order stands, read with the order's `statusRef` (a capability issued at placement; only its hash is stored): stage, invoice state, fulfillment and tracking, quantity, and the order's own artwork preview. | readOnlyHint: true, idempotentHint: true | status block with image |
| `register_webhook` | One callback per organization for proof_ready and shipped. Registration exists in v1; delivery is v1.1. Retirement in v1 is proposed in the spec, pending settlement. | readOnlyHint: false, idempotentHint: true | subscription block |

## Worked example

One full pass through the journey, captured from the live server on
2026-11-07 with test organizations, in test mode throughout (the
orders and invoice below are test records). Every field name and
value shown is exactly what the server returned; long values are
shortened only where marked. Each result returns both the
structured content and a plain-text rendering, and both are shown.

### 1. get_discovery (no key)

Request:

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_discovery", "arguments": {}}}
```

Response, structured content (abbreviated):

```json
{
  "server": {
    "name": "NFC Tap Builder by Tap.Giving",
    "endpoint": "https://tap.giving/mcp",
    "synonyms": [
      "tap discs",
      "tap plates",
      "tap tags",
      "NFC tap discs"
    ]
  },
  "introduction": {
    "builder": "NFC Tap Builder by Tap.Giving",
    "positioning": "A design tool first: this server helps you create print-ready NFC tap artwork proofs. Work from its published spec and design directions, compose the artwork with your own tools, and submit the finished file to see it on the disc as a proof. The artwork is yours: print-ready, vendor-neutral, yours to take to any printer. Ordering discs through Tap.Giving is an optional next step, only if you want it.",
    "product": "A tap disc is a small physical disc a phone taps to open your page instantly. It carries a locked tap chip. It comes in one standardized 4-inch size (100 mm), in two shapes, and it is durable waterproof PVC.",
    "firstChoice": {
      "field": "shape",
      "options": [
        "round",
        "square"
      ]
    }
  },
  "journey": [
    {
      "step": "artwork spec",
      "tool": "get_artwork_spec",
      "detail": "The production geometry and the house design directions for the chosen shape."
    },
    {
      "step": "build the artwork",
      "tool": "get_artwork_spec",
      "detail": "Compose the artwork from a design direction with your own tools."
    },
    {
      "step": "submit and proof",
      "tool": "submit_artwork",
      "detail": "Submit the finished file and see it on the disc as a proof. The artwork is yours to take to any printer."
    },
    {
      "step": "order, optional",
      "tool": "get_quote",
      "detail": "Only if you want discs from Tap.Giving: the binding quote at an exact quantity, then the order questions, order setup, and the hosted invoice."
    }
  ],
  "artworkSpec": {
    "summary": "106 mm (about 4.2 inch) square artboard; 100 mm (4 inch) cut (round or square); 3 mm (about 0.12 inch) bleed; vector artwork back (SVG preferred).",
    "tool": "get_artwork_spec"
  },
  "photos": [
    {
      "id": "phone-tap",
      "alt": "A phone tapping a Tap.Giving disc on a chair back, opening the organization's page",
      "mimeType": "image/webp",
      "displayUrl": "https://tap.giving/mcp/photos/phone-tap.webp"
    }
  ],
  "capabilities": {
    "readTools": [
      "get_discovery",
      "get_quote",
      "get_product",
      "get_artwork_spec",
      "get_order_questions",
      "get_recap"
    ],
    "writeTools": [
      "submit_artwork",
      "start_order_intent",
      "create_order",
      "register_webhook"
    ],
    "gates": [
      "Design approval stays human: a person approves the final proof by email before production. No tool on this server records or implies an approval.",
      "Payment stays human: This server moves no money itself, and a person pays the hosted invoice when it arrives.",
      "Production release and the supplier handoff stay human: no tool on this server releases an order to production or touches fulfillment state."
    ],
    "keys": "There are no keys. No user-facing step in this server requires or offers a key, login, or account, including placing an order and reading its status."",
    "kickoff": "get_artwork_spec",
    "benefits": [
      "Works with any platform",
      "No subscription fees",
      "Durable waterproof PVC with a locked tap chip",
      "Custom branding on every design",
      "Free shipping",
      "Covered by our 30-day money-back guarantee"
    ],
    "guarantee": "Covered by our 30-day money-back guarantee."
  }
}
```

Response, text rendering (complete):

```text
NFC Tap Builder by Tap.Giving
A design tool first: this server helps you create print-ready NFC tap artwork proofs. Work from its published spec and design directions, compose the artwork with your own tools, and submit the finished file to see it on the disc as a proof. The artwork is yours: print-ready, vendor-neutral, yours to take to any printer. Ordering discs through Tap.Giving is an optional next step, only if you want it.

What it is
A tap disc is a small physical disc a phone taps to open your page instantly. It carries a locked tap chip. It comes in one standardized 4-inch size (100 mm), in two shapes, and it is durable waterproof PVC.
The discs themselves are for organizations of every kind, designed by your own agent.
Every disc carries its own Tap.Giving address, so where a tap lands is set per disc. An order starts with one destination for the whole set, the page you give at order setup. To run two destinations, for example counter discs opening your menu and door discs opening your review profile, split the set afterwards in the free Redirect Dashboard: re-point any single disc, or any group of discs, in seconds, and re-point them again anytime. Your dashboard sign-in works from order setup: the address is go.tap.giving/<your-organization-slug>, the username is that slug, and the password arrives by email with the shipping notice, before your discs arrive. Tapping needs no app: iPhone XS (2018) and later and most Android phones from about 2015 read the disc automatically in the background. Where a design carries a printed QR code (your artwork includes one, or the Tap.Giving address line on the design), a phone without NFC, or with NFC off, scans that code and lands on the same destination; a design with no printed code has the tap as its only door, and the design choice is yours at artwork time.

How it works: the design path first
1. Start with the shape, round or square.
2. Get the artwork spec and the design directions for that shape from get_artwork_spec.
3. Build the artwork from a direction with your own tools, adding the organization's logo or name.
4. Submit the finished file with submit_artwork and see it on the disc as a proof. The artwork is yours from here: take it to any printer, or order the discs from Tap.Giving.
5. Optional, only if you want the discs made: get the binding quote from get_quote, answer the order questions, and set the order up. The final proof is emailed for a person's approval before anything is printed, and a person pays the hosted invoice.

Why Tap.Giving
No subscriptions and no ongoing fees: one-time pricing per order, and the Redirect Dashboard is included free, permanently.
- Works with any platform
- No subscription fees
- Durable waterproof PVC with a locked tap chip
- Custom branding on every design
- Free shipping
- Covered by our 30-day money-back guarantee

Gates
Design approval, payment, and production release stay human: a person approves the final proof by email. This server moves no money itself, and a person pays the hosted invoice when it arrives.
There are no keys: no user-facing step in this server requires or offers a key, login, or account, including placing an order and reading its status (status is read with the order's status reference, issued at placement). Part 1 (design) carries no pricing; pricing is stated only in Part 2, at the order questions, with totals at the quote step.
(This worked example was captured 2026-11-07 and is amended here to the 2026-11-09 model: the retired key fields and the Part 1 pricing block are removed, and the invoice sentence carries the no-money-movement truth without the superseded clause. These surfaces await the CEO-settled replacement string.)
The photo with this answer shows the disc in use: a phone tapping a disc on a chair back. The structured photos list the labeled photo set from the website library.
```


### 2. get_quote at 250 (no key)

Request:

```json
{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_quote", "arguments": {"quantity": 250}}}
```

Response, structured content:

```json
{
  "quantity": 250,
  "tier": "200-399 discs",
  "unitCents": 400,
  "discUnitCents": 400,
  "discSubtotalCents": 100000,
  "discount": {
    "code": "WELCOME10",
    "percentOff": 10,
    "scope": "first order",
    "window": "7-day renewing window",
    "appliedInHeadlineTotals": false,
    "conditionalTotalCents": 90000
  },
  "addOns": [],
  "addOnCents": 0,
  "shippingCents": 0,
  "shippingLine": "Shipping: Free",
  "taxNote": "Tax, where it applies, is calculated on the invoice.",
  "grandTotalCents": 100000,
  "grandTotalWithFirstOrderDiscountCents": 90000,
  "currency": "USD"
}
```

Response, text rendering:

```text
Quote for 250 discs (200-399 discs): $1,000.00 total.
Discs: 250 at $4.00 list, $1,000.00 list subtotal. First orders take 10 percent off with code WELCOME10 inside a 7-day renewing window: $900.00 when it applies.
Add-ons: none.
Shipping: Free
Tax, where it applies, is calculated on the invoice.
```

The headline total is the list total, $1,000.00. The first-order
discount is a conditional line only: $900.00 when it applies, never
baked into the headline.

### 3. submit_artwork (no key, no email)

A 1-pixel PNG stands in for the agent-built artwork file here; the
sha256 is the real hash of those bytes. This call was made with no
credential: none exists in this server.

Request:

```json
{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "submit_artwork", "arguments": {"file": {"filename": "worked-example.png", "mediaType": "image/png", "contentBase64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}, "sha256": "c414cd0e204de974f73753c7e28d7638e7b3691bb8b1a2bab6b25bb7fed7ce77"}}}
```

Response, structured content:

```json
{
  "received": true,
  "artworkRef": "art_fc94d730591f03bab798edfe",
  "displayUrl": "https://tap.giving/mcp/artwork/art_fc94d730591f03bab798edfe",
  "sha256": "c414cd0e204de974f73753c7e28d7638e7b3691bb8b1a2bab6b25bb7fed7ce77",
  "validation": {"policy": "permissive", "checks": {"notMalicious": true, "sizeOk": true, "decodable": true}, "findings": ["accepted; vector preferred for production"]},
  "benefits": ["Works with any platform", "No subscription fees", "Durable waterproof PVC with a locked tap chip", "Custom branding from 100 discs", "Free shipping", "Covered by our 30-day money-back guarantee"],
  "preview": {"kind": "on-disc", "shapes": ["round", "square"], "note": "Your design on the disc, cut shape applied. This preview render is the design check at this stage; nothing is emailed at the artwork stage, because no contact is captured yet. The emailed final proof belongs to the order stage, after order setup."},
  "nextStep": "Show the person their design on the disc (the preview image), then capture the contact email at order setup (start_order_intent) and ask the order questions (get_order_questions)."
}
```

The result also carries the submitted design composited on the disc
back as image content blocks, one per shape when no shape was given,
and its text rendering opens with the test-mode banner, then:
"Artwork received: art_fc94d730591f03bab798edfe
(worked-example.png, png, 70 bytes)."

### 4. create_order (no key, idempotency key)

Between artwork and order, `get_recap` returns a recapRef for the
exact inputs the person saw (its cost object is the get_quote
object above); `create_order` carries that recapRef. The recap for
this pass was `recap_f562143ce62c3282468a7670`, with the contact
email among its inputs.

Request:

```json
{"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "create_order", "arguments": {"contactName": "MCP Acceptance", "contactEmail": "mcp-acceptance@example.com", "contactPhone": "+17135550199", "organizationName": "MCP Acceptance Test Organization", "quantity": 250, "size": "100mm-round", "mounting": "adhesive", "artworkRef": "art_2ce8de191f7035de811e224b", "recapRef": "recap_f562143ce62c3282468a7670", "exit": "pay_now", "idempotencyKey": "worked-example-2026-11-07-01", "shipTo": {"name": "MCP Acceptance Test Organization", "street": "100 Test Way", "city": "Spring", "state": "TX", "postalCode": "77380", "country": "US", "phone": "+17135550199"}}}}
```

Response, structured content (abbreviated; the full quote object
from step 2 rides as `quote`):

```json
{
  "orderRef": "mcp:mcp-acceptance-test-church:93f3ebe22527b0b7",
  "invreqKey": "INVREQ:2026-11-07T21:45:50.340Z:mcp-acceptance@example.com",
  "exit": "pay_now",
  "quote": {"quantity": 250, "tier": "200-399 discs", "grandTotalCents": 100000},
  "nextStep": "The order is placed. A person from Tap.Giving follows up with the invoice for this order; the person pays it when it arrives."
}
```

A retry with the same idempotency key and the same payload returns
this same orderRef; the same key with a different payload is a
conflict naming the differing fields.

### 5. The final step: "Email me my invoice and design proof."

Placing the order in step 4 fires the final step, labeled exactly
"Email me my invoice and design proof.": the order is recorded in
the CRM (the `invreqKey` in the step 4 response), the full order is
emailed to the Tap.Giving team (the response's `orderEmail` confirms
the send), a Stripe invoice is created and finalized at the quoted
total, and the invoice plus the design proof are emailed to the
customer, the proof embedded in the email and attached. (This
supersedes the 2026-11-08 P-16 flow, under which placement minted
no invoice; Ryan's ruling of 2026-11-09 governs.)

Reading the order back afterwards is `get_order_status` with the
order's `statusRef` from the step 4 response (a capability, not a
key; only its hash is stored).

## Errors

Every tool error returns MCP's standard error content (a text block
reading `code: message`) plus a structured object:
`{code, message, retryable, details}`. The `details` object carries
what an agent needs to act, for example the differing fields on a
conflict. No error ever returns another organization's data, a stack
trace, or a secret.

| Code | Meaning | Retryable | Next action |
|---|---|---|---|
| `unauthorized` | Retired 2026-11-09: no credential exists in this server, and no tool returns this code. | no | Nothing to fix: connect with the endpoint URL alone. |
| `forbidden` | Retired 2026-11-09: no credential exists in this server, and no tool returns this code. Records bound to another order read as `not_found`. | no | Nothing to fix: use the reference the flow issued. |
| `invalid_input` | An input failed validation: missing, malformed, or out of range. The message names the input. | no | Correct the named input and resend. One case to know: `get_quote` and `create_order` refuse quantities under the 100-disc minimum and state it; do not retry with a smaller quantity. |
| `manual_exception` | The request needs a person, for example a size other than the two built-ins (100 mm round, 100 mm square). | no | Take the human route the message names: Ryan at ryan@tap.giving. |
| `not_found` | The named record does not exist for the reference presented: an unknown status reference, orderRef, or invoiceId. Another order's records read as not_found, never as their data. | no | Check the reference. Do not retry expecting another order's record to appear. |
| `conflict` | The request conflicts with recorded state: an idempotency key reused with a different payload, order inputs that differ from the recap, or an order path that is already paid. `details` names the differing fields where that is the cause. | no | Reconcile against the details. For a genuinely new order, re-run `get_recap` on the real inputs and use a fresh idempotency key. |
| `stripe_unavailable` | Stripe did not complete the invoice call. | yes | Retry with the same idempotency key; Stripe's own keys replay safely, so a retry cannot double-mint. |
| `rate_limited` | Too many calls right now, at this server or at the capture endpoint. | yes | Wait, then retry. On `start_order_intent` the contact is not captured until a call succeeds. |
| `internal` | Something failed on our side; the message says what, and names the human route when one applies. | yes | Retry. If it persists, reach Ryan at ryan@tap.giving with the message. |

The distinction agents most often get wrong: `not_found` is what an unknown or unbound reference returns on every read path; there are no credential errors to confuse it with (the credential codes are retired, above).

This catalog is current as of 2026-11-07, when the live-mode
invoice refusal (`invoice_parity_pending`) was lifted after the
field-for-field parity check passed; that code no longer exists in
the server.

## No keys

There are no keys. No user-facing step in this server requires or
offers a key, login, or account, including placing an order and
reading its status. Connect with the endpoint URL alone. Order
status is read with the order's status reference, a capability
issued at placement and carried in the order's email; only its hash
is stored, and it cannot be recovered if lost.

A registry record for this server lives in this repo as
[`server.json`](server.json), in the official MCP Registry format:
the namespace-tied name, a short description, the server version,
and the remote endpoint. The record is created and validated;
publishing it to the registry is a separate step, so the server is
not listed yet.

## Development

```sh
npm install
npm test          # contract tests against the published fact set
npm run typecheck
npx wrangler dev  # local run
```

Secrets (Stripe keys per mode, the invocation-seat secret) are set
with `wrangler secret put` and are never committed.
