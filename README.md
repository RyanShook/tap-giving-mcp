# NFC Tap Builder by Tap.Giving

Welcome. This is the public home of Tap.Giving's MCP server, "NFC Tap
Builder by Tap.Giving". A design tool first: this server helps you create print-ready NFC tap artwork proofs. Work from its published spec and design directions, compose the artwork with your own tools, and submit the finished file to see it on the disc as a proof. The artwork is yours: print-ready, vendor-neutral, yours to take to any printer. Ordering discs through Tap.Giving is an optional next step, only if you want it. The discs it designs for are custom
NFC tap discs, tap plates, and tap tags. No subscriptions and no
ongoing fees: one-time pricing per order, and the Redirect Dashboard
is included free, permanently.

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

## Connect

Paste-ready client config. The keyless read side works exactly as
shown, with no auth header:

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

Placing an order needs no key and no header. To present a key for
the organization-bound surfaces (order status, webhook registration,
and the order questions' organization block), add it as a header on
the same block:

```json
{
  "mcpServers": {
    "tap-giving": {
      "type": "http",
      "url": "https://tap.giving/mcp",
      "headers": { "Authorization": "Bearer <key>" }
    }
  }
}
```

Claude Code, one line:

```sh
claude mcp add --transport http tap-giving https://tap.giving/mcp
```

Discovery, product facts, the artwork spec, and the
order questions need no key; exact totals come from get_quote at the
end. Placing an order needs no key either; order status and webhook
registration are the surfaces that use one. The live `GET https://tap.giving/mcp` self-description
carries this same connect guidance.

## What the server does

A design tool first: this server helps you create print-ready NFC tap artwork proofs. Work from its published spec and design directions, compose the artwork with your own tools, and submit the finished file to see it on the disc as a proof. The artwork is yours: print-ready, vendor-neutral, yours to take to any printer. Ordering discs through Tap.Giving is an optional next step, only if you want it.

The discs themselves are custom NFC tap discs, tap plates, and tap
tags for organizations of every kind: built for churches, nonprofits, restaurants, coffee shops, and local businesses,
designed by your own agent.

The read side is open and needs no key: an agent can discover the
product, see the per-disc price range, read the artwork spec with house
example designs, and submit artwork for validation before any contact
exists. Exact pricing is quoted only at the quote step. Placing an
order needs no key; order status is the read that uses one (see below).

This server moves no money itself and issues no invoices:
a person from Tap.Giving follows up with the invoice. Payment, design approval, and production release
stay human gates: no tool takes payment, approves a design, or
releases an order to production.

## Tools

| Tool | Key | What it does | Annotations | Returns |
|---|---|---|---|---|
| `get_discovery` | no | One-call orientation: the product, the two shapes, the price range, the artwork summary, the tool list, and how an organization gets a key. | readOnlyHint: true, idempotentHint: true | `server`, `introduction.product`, `pricing` (range, shipping, the get_quote pointer), `capabilities` (benefits, gates, key route) |
| `get_quote` (alias `get_pricing`) | no | An exact quote from the published tiers; below 100 discs is refused with the minimum stated. | readOnlyHint: true, idempotentHint: true | `discUnitCents`, `discSubtotalCents`, `grandTotalCents`, `discount.conditionalTotalCents`, `shippingLine`, `taxNote` |
| `get_product` | no | Product facts: discs, stands, badges, mounting, and shipping terms. | readOnlyHint: true, idempotentHint: true | `discs` (chip, sizes, mounting, metalCaveat, redirectDashboard), `stands`, `badges`, `shipping` |
| `get_artwork_spec` | no | The production artwork geometry in structured form, with the house example directions shown inline as images and the optional logo ask. | readOnlyHint: true, idempotentHint: true | geometry per shape, `guidelines`, `examples` (id, direction, displayUrl) plus the example images, `logoAsk` |
| `submit_artwork` | optional | Accepts artwork under a permissive intake (three sanity grounds only); that it was accepted is not a production-fitness verdict. | readOnlyHint: false | `artworkRef`, `displayUrl`, `sha256`, `validation`, `benefits` |
| `start_order_intent` | no | Captures an email contact so a person at Tap.Giving has it. | readOnlyHint: false | `captured`, `source`, `nextStep` |
| `get_order_questions` | no | The order questions in order: quantity, mounting with pictures, optional link destination, shipping address. | readOnlyHint: true, idempotentHint: true | `questions` in order (quantity, mounting with picture options, linkDestination, shipTo) |
| `get_recap` | no | The order in display order (artwork, quantity, ship-to, exact total) with the two required notes, returning a recap reference. | readOnlyHint: true, idempotentHint: true | `recapRef`, `cost` (the get_quote object), `shipTo`, `notes`, `exits` |
| `create_order` | no | Locks an order in behind both exits (pay now, or lock in this price); idempotent on the caller's idempotency key. A person from Tap.Giving follows up with the invoice. | readOnlyHint: false, idempotentHint: true | `orderRef`, `quote`, `exit`, `nextStep` |
| `request_invoice` | yes | For orders already placed through this server: returns the order's invoice link (or the customer's existing open one) for the person who pays. Placing an order does not use this tool; a person from Tap.Giving follows up with the invoice. | readOnlyHint: false, idempotentHint: true | `invoiceId`, `invoiceNumber`, `hostedInvoiceUrl`, `handoffLine`, `totalCents` |
| `get_order_status` | yes | Order stage, invoice state, and fulfillment read from the records of truth. | readOnlyHint: true, idempotentHint: true | `stage`, `invoice` (status, hostedInvoiceUrl), fulfillment with tracking when present |
| `register_webhook` | yes | Registers one callback per organization for proof_ready and shipped (registration in v1; delivery is v1.1). | readOnlyHint: false | `subscriptionSecret` (shown once), `payloadContract`, `delivery` status |

Annotations are the server's own declarations, read from the live
`tools/list`: every tool also declares `destructiveHint: false` and
`openWorldHint: false`. A client can auto-approve the read-only
tools, ask its person before the writes, and retry `create_order`
and `request_invoice` after a network failure with the same
idempotency key.

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
  "pricing": {
    "range": "Price range of $3.50 - $5.00 per disc depending on quantity.",
    "shipping": "Free on every order.",
    "note": "Call get_quote for the binding quote at an exact quantity."
  },
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
      "get_order_questions"
    ],
    "keyedReadTools": [
      "get_recap",
      "get_order_status"
    ],
    "writeTools": [
      "submit_artwork",
      "start_order_intent",
      "create_order",
      "request_invoice",
      "register_webhook"
    ],
    "gates": [
      "Design approval stays human: a person approves the final proof by email before production. No tool on this server records or implies an approval.",
      "Payment stays human: This server moves no money itself and issues no invoices: a person from Tap.Giving follows up with the invoice. A person pays the invoice when it arrives.",
      "Production release and the supplier handoff stay human: no tool on this server releases an order to production or touches fulfillment state."
    ],
    "howToGetAKey": "Placing an order never requires a key: discovery, product facts, the artwork spec, the order questions, the recap, order setup, and the invoice link all run keyless. An organization API key is optional: it enriches the order questions with the key's own organization block, and it governs order status and webhook registration. Keys are issued by the Tap.Giving team: email hello@tap.giving from the address you want associated with the organization, say which organization the key is for, and the team replies with the key within one business day. Keys look like tg_live_<orgslug>_<secret>; test keys look like tg_test_<orgslug>_<secret>.",
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

Pricing
Price range of $3.50 - $5.00 per disc depending on quantity. Free shipping. Tax, where it applies, is calculated on the invoice. Every order is covered by our 30-day money-back guarantee. Production and delivery run 2 to 3 weeks from artwork approval.

Gates
Design approval, payment, and production release stay human: a person approves the final proof by email. This server moves no money itself and issues no invoices: a person from Tap.Giving follows up with the invoice.
Placing an order needs no key: the whole placement run is keyless (the order questions, the recap, and placing the order), and a person from Tap.Giving follows up with the invoice. Order status is the one read that uses the organization key. Placing an order never requires a key: discovery, product facts, the artwork spec, the order questions, the recap, order setup, and the invoice link all run keyless. An organization API key is optional: it enriches the order questions with the key's own organization block, and it governs order status and webhook registration. Keys are issued by the Tap.Giving team: email hello@tap.giving from the address you want associated with the organization, say which organization the key is for, and the team replies with the key within one business day. Keys look like tg_live_<orgslug>_<secret>; test keys look like tg_test_<orgslug>_<secret>. Evaluating the server? A test key runs the full journey, including placing a test order, with no real order and no charge. There is no self-serve signup: email hello@tap.giving and ask for a test key, and the team replies with one (a tg_test_<orgslug>_<secret> key) within one business day.
The photo with this answer shows the disc in use: a phone tapping a disc on a chair back.
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

### 3. submit_artwork (keyed)

A 1-pixel PNG stands in for the agent-built artwork file here; the
sha256 is the real hash of those bytes. This call was made with the
first-user test organization's key.

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

### 5. request_invoice (keyed, idempotency key)

Steps 1 to 4 above are the acceptance organization's pass. This step
replays the reused-invoice case against the first-user test
organization, whose second order was placed while its first order's
invoice was still open, so the server returns that invoice instead
of minting a second one.

Request:

```json
{"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "request_invoice", "arguments": {"orderRef": "mcp:coo-first-user:e897269bd8c9f078", "idempotencyKey": "worked-example-invoice-refresh-2026-11-07"}}}
```

Response, structured content:

```json
{
  "orderRef": "mcp:coo-first-user:e897269bd8c9f078",
  "invoiceId": "in_1UZHUIKIjbVAoCpTX1AMZjyQ",
  "invoiceNumber": "RCMDIGOQ-0001",
  "status": "open",
  "hostedInvoiceUrl": "https://invoice.stripe.com/i/acct_1SWS4YKIjbVAoCpT/test_YWNjdF8xU1dTNFlLSWpiVkFvQ3BULF9WYVNQdVU1dlRBdFQ2VWRLTVpmZ0RoS0tWZ3lBZ05XLDE4NDYzMzEwMA0200ZqkGjMGe?s=ap",
  "handoffLine": "Review your invoice: https://invoice.stripe.com/i/acct_1SWS4YKIjbVAoCpT/test_YWNjdF8xU1dTNFlLSWpiVkFvQ3BULF9WYVNQdVU1dlRBdFQ2VWRLTVpmZ0RoS0tWZ3lBZ05XLDE4NDYzMzEwMA0200ZqkGjMGe?s=ap",
  "totalCents": 67500,
  "currency": "USD",
  "totalNote": "Totals are structured data for the agent's records; the human-facing handoff line carries no dollar total, the invoice itself carries the money.",
  "existing": true,
  "note": "This customer already had an open or draft invoice; that invoice's link is returned, flagged existing, rather than stacking a second one.",
  "existingFromOrderRef": "mcp:coo-first-user:fddf6e881efb4c5e",
  "replayed": true,
  "antiMetal": "unknown",
  "antiMetalNote": "No anti-metal count was recorded for this order, so the invoice carries no shielding line. If some discs go on metal surfaces, the count must be settled with the person before printing; it cannot be added afterwards.",
  "nextStep": "Hand the handoffLine to the person. A person pays on Stripe's hosted page; this server moves no money itself. Artwork approval happens separately, by email, before production."
}
```

Response, text rendering:

```text
TEST MODE: this call uses a test key, so no real order is placed and no charge is made.
Invoice RCMDIGOQ-0001 is open.
This is not a new invoice for this order: invoice RCMDIGOQ-0001 was already open from order mcp:coo-first-user:fddf6e881efb4c5e (150 discs, $675.00 total), so this order (mcp:coo-first-user:e897269bd8c9f078) is not invoiced separately. Pay that invoice if it is the order you mean; if you need a separate invoice for this order, contact the Tap.Giving team at hello@tap.giving.
Review your invoice: https://invoice.stripe.com/i/acct_1SWS4YKIjbVAoCpT/test_YWNjdF8xU1dTNFlLSWpiVkFvQ3BULF9WYVNQdVU1dlRBdFQ2VWRLTVpmZ0RoS0tWZ3lBZ05XLDE4NDYzMzEwMA0200ZqkGjMGe?s=ap
Total on the invoice: $675.00. A person pays it on Stripe's hosted page.
```

The first-user organization already had this open test invoice from
its first order, so the server returned it flagged `existing` and
named the order it belongs to in `existingFromOrderRef`, instead of
stacking a second one; for an organization with no open invoice,
the same call mints and returns the new invoice in the same shape,
without the flag. The invoice total is $675.00 because the
first-order WELCOME10 discount applied at invoice time; the quote's
headline stayed the list total for its quantity. The handoff is the
link: a person pays it, this server takes no payment.
## Errors

Every tool error returns MCP's standard error content (a text block
reading `code: message`) plus a structured object:
`{code, message, retryable, details}`. The `details` object carries
what an agent needs to act, for example the differing fields on a
conflict. No error ever returns another organization's data, a stack
trace, or a secret.

| Code | Meaning | Retryable | Next action |
|---|---|---|---|
| `unauthorized` | The key is malformed, unknown, or revoked. | no | Fix the key: check the `Authorization: Bearer <key>` header and that the key is current and active. Discovery, pricing, product facts, the artwork spec, and the order questions need no key at all. |
| `forbidden` | The key is valid, but the record named belongs to another organization (an order, recap, or artwork submitted under a different key). | no | Do not retry. Use the owning organization's key, or start fresh under your own. |
| `invalid_input` | An input failed validation: missing, malformed, or out of range. The message names the input. | no | Correct the named input and resend. One case to know: `get_quote` and `create_order` refuse quantities under the 100-disc minimum and state it; do not retry with a smaller quantity. |
| `manual_exception` | The request needs a person, for example a size other than the two built-ins (100 mm round, 100 mm square). | no | Take the human route the message names: Ryan at ryan@tap.giving. |
| `not_found` | The named record does not exist for this key's organization: an unknown tool, orderRef, or invoiceId. Another organization's records read as not_found, never as their data. | no | Check the reference. Do not retry expecting another organization's record to appear. |
| `conflict` | The request conflicts with recorded state: an idempotency key reused with a different payload, order inputs that differ from the recap, or an order path that is already paid. `details` names the differing fields where that is the cause. | no | Reconcile against the details. For a genuinely new order, re-run `get_recap` on the real inputs and use a fresh idempotency key. |
| `stripe_unavailable` | Stripe did not complete the invoice call. | yes | Retry with the same idempotency key; Stripe's own keys replay safely, so a retry cannot double-mint. |
| `rate_limited` | Too many calls right now, at this server or at the capture endpoint. | yes | Wait, then retry. On `start_order_intent` the contact is not captured until a call succeeds. |
| `internal` | Something failed on our side; the message says what, and names the human route when one applies. | yes | Retry. If it persists, reach Ryan at ryan@tap.giving with the message. |

The two distinctions agents most often get wrong: `unauthorized`
is about the key itself (malformed or unknown, fix the key), while
`forbidden` means the key is fine and the record is not yours (do
not retry). And `not_found` is what a cross-organization orderRef
returns on the read paths; `forbidden` is what the attach paths
return when a named order, recap, or artwork belongs to another
organization.

This catalog is current as of 2026-11-07, when the live-mode
invoice refusal (`invoice_parity_pending`) was lifted after the
field-for-field parity check passed; that code no longer exists in
the server.

## Keys

An organization key looks like `tg_live_<orgslug>_<secret>`; a test
key looks like `tg_test_<orgslug>_<secret>`. Keys are sent as
`Authorization: Bearer <key>`. Only the SHA-256 hash of a key is
stored. A key's mode binds its seat: test keys write test records and
mint test invoices; live keys serve production. Real organizations
get a key by emailing hello@tap.giving; the team replies with the key
within one business day. Evaluating the server? A test key runs the
full keyed journey with no real order and no charge. There is no
self-serve signup: email hello@tap.giving and ask for a test key, and
the team replies with one within one business day.

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
