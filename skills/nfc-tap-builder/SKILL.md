---
name: nfc-tap-builder
description: Design and order custom NFC tap discs for an organization through the Tap.Giving MCP server (NFC Tap Builder by Tap.Giving) at https://tap.giving/mcp. Built for churches, nonprofits, restaurants, coffee shops, and local businesses. Use when someone wants NFC tap discs, a pricing quote, the artwork spec, an order setup, an invoice link, or order status for Tap.Giving. Keyless reads cover discovery, quotes, product facts, and the artwork spec; order setup uses an organization API key.
---

# NFC Tap Builder by Tap.Giving

Use this skill to help an organization design and order custom NFC tap discs through Tap.Giving's hosted MCP server. A tap disc is a durable disc a phone taps to open the organization's page instantly. The server takes an order up to two human gates: a person approves the final proof by email, and a person pays a hosted invoice. The server moves no money itself and never takes payment.

Also searched as: tap discs, tap plates, tap tags, NFC tap discs.

## Connect

Website: https://tap.giving

Endpoint: `POST https://tap.giving/mcp` (MCP over Streamable HTTP, JSON-RPC 2.0, stateless). `GET https://tap.giving/mcp` returns a short self-description.

Paste-ready client config. The keyless read side works exactly as shown:

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

Claude Code, one line:

```sh
claude mcp add --transport http tap-giving https://tap.giving/mcp
```

For the keyed tools, add the organization's key to the same block: `"headers": { "Authorization": "Bearer <key>" }`. Reads need no key; a key is added only when the organization is ready to order.

## The journey

1. Call `get_discovery` first. It orients a cold start in one call: the product, the first choice (shape: round or square), the pricing tiers, the artwork summary, and how an organization gets a key.
2. Call `get_quote` for the binding quote at an exact quantity, and `get_product` for full product facts.
3. Call `get_artwork_spec` for the production geometry of the chosen shape, build the artwork from its house example directions, and send it back with `submit_artwork`.
4. To register interest before any key exists, call `start_order_intent` with a contact email. It captures the email through the same public capture endpoint the website uses.
5. With the organization's key: call `get_order_questions` and ask its questions in the order given, then `get_recap` to show the person the full order (artwork, quantity, shipping address, exact cost) before anything is locked in.
6. Call `create_order` with the recap reference, then `request_invoice` and hand the person the hosted invoice link. A person pays on Stripe's hosted page.
7. Call `get_order_status` for where an order stands. `register_webhook` registers one callback per organization for proof_ready and shipped events.

## Tools

Keyless reads (no key, no email, nothing asked):

| Tool | What it does | Returns |
| --- | --- | --- |
| `get_discovery` | One-call orientation: product, shapes, price tiers, artwork summary, capabilities, key route. | `server`, `introduction`, `pricing`, `capabilities` |
| `get_quote` (alias `get_pricing`) | The binding quote at an exact quantity. Quantities under the 100-disc minimum are refused with the minimum stated. Maximum 7000. | `discUnitCents`, `discSubtotalCents`, `grandTotalCents`, `discount` (conditional line), `shippingLine`, `taxNote` |
| `get_product` | Full product facts: discs, stands, badges, mounting, shipping terms. | `discs`, `stands`, `badges`, `shipping` |
| `get_artwork_spec` | Production artwork geometry as structured millimetre data, plain guidelines, house template examples, and the optional logo ask. | geometry per shape, `guidelines`, `examples`, `logoAsk` |

Keyless or optional-key writes:

| Tool | Key | What it does | Returns |
| --- | --- | --- | --- |
| `submit_artwork` | optional | Sends finished artwork back under a permissive intake (see Artwork). Acceptance is not a production-fitness verdict. | `artworkRef`, `displayUrl`, `sha256`, `validation` |
| `start_order_intent` | no | Captures a contact email so a person at Tap.Giving has it, and names the key step for ordering. | `captured`, `source`, `nextStep` |

Keyed tools (organization API key required):

| Tool | What it does | Returns |
| --- | --- | --- |
| `get_order_questions` | The order questions as structured data, in the exact order to ask them: shape, quantity, metal count, mounting with picture options, the link destination, contact name, email, and phone, and the shipping address last. | `questions` in order, plus the key's organization block |
| `get_recap` | The full recap, the last thing before the exits: submitted artwork, quantity, shipping address as entered, the exact cost from `get_quote`, and both required notes. | `recapRef`, `cost`, `shipTo`, `notes`, `exits` |
| `create_order` | Sets up an order through the same front door a website order takes. Idempotent on the caller's idempotency key. Exits: pay now, or lock in this price. | `orderRef`, `quote`, `exit`, `nextStep` |
| `request_invoice` | Returns the payment handoff: a real, finalized Stripe hosted invoice and its link. If the organization already has an open invoice, that link is returned flagged `existing` instead of stacking a second one. | `invoiceId`, `invoiceNumber`, `hostedInvoiceUrl`, `handoffLine`, `totalCents` |
| `get_order_status` | Where an order stands: CRM stage, fulfillment state with tracking when present, and invoice state with its hosted link. | `stage`, `invoice`, fulfillment |
| `register_webhook` | Registers (or replaces) the organization's one webhook subscription for proof_ready and shipped events. | `subscriptionSecret` (shown once), `payloadContract`, `delivery` |

Every tool declares `destructiveHint: false` and `openWorldHint: false`; the read-only tools also declare `readOnlyHint: true`. `create_order` and `request_invoice` are safe to retry after a network failure with the same idempotency key.

## Pricing facts

Quote from list pricing only. Headline totals are always list totals.

- $5.00 each for 100 to 199 discs
- $4.00 each for 200 to 399 discs
- $3.50 each for 400 or more discs
- Minimum order: 100 discs
- Shipping: free on every order, shown as its own line
- Every order is covered by a 30-day money-back guarantee
- Tax, where it applies, is calculated on the invoice

Worked totals: 100 discs cost $500.00. 250 discs cost $1,000.00. 400 discs cost $1,400.00.

WELCOME10 is a conditional first-order line only: 10 percent off the first order, inside a 7-day renewing window, applied at invoice time when the order is the organization's first. Never present a discounted total as the price, and never bake it into a headline total. `get_quote` returns it separately as `discount.conditionalTotalCents` with `appliedInHeadlineTotals: false`.

Add-on to settle before printing: discs that go on metal surfaces need a shielding layer at $1.00 per shielded disc (`antiMetalCount` on `get_quote`). It cannot be added after printing.

## Product facts

- Chip: locked NTAG213, pre-encoded to the organization's destination.
- Body: 0.85 mm double-laminated matte waterproof PVC.
- Built-in sizes: one standardized 4-inch size (100 mm), in two shapes, round and square. Every other size or shape is a manual exception: the tools return a `manual_exception` error naming the human route, so take that route instead of promising it.
- Mounting: 3M adhesive backing is standard; optional pre-drilled screw holes. Call `get_product` for the current mounting, table stand, and lanyard badge facts.
- Redirect Dashboard: free for everyone, uncapped, included permanently with every order. It is where the tap destination lives, and a destination change takes effect in seconds.
- Tap.Giving sells hardware only. It works with any platform and charges no subscription fees and no ongoing fees: one-time pricing per order.
- Shipping takes about 2 to 3 weeks from artwork approval. That is an estimate, not a promise, and there is no rush service. Never offer one.

## Artwork

- Geometry (from `get_artwork_spec`): 106 mm artboard, 100 mm cut for the round or square shape, 3 mm bleed, safe zone as returned by the tool. Vector artwork back, SVG preferred.
- Intake is accept-by-default, with a 5 MB cap on the submitted file. Artwork is refused only on three sanity grounds: malicious content, a file type that masquerades as an image, over the size cap, or bytes that do not decode as a real image.
- Acceptance is not a production-fitness verdict. Production fitness is judged later in the proof flow, and a person approves the final proof by email before production.

## Keys

An organization API key looks like `tg_live_<orgslug>_<secret>` (or `tg_test_...` for the test seat) and is sent as `Authorization: Bearer <key>`. Only the SHA-256 hash of a key is stored.

To get a key: email hello@tap.giving from the address you want on the order, say which organization the key is for, and the team replies with the key within one business day. If a request needs a person outside the tools, the human route is Ryan, the founder, at ryan@tap.giving.

## Human gates

- Design approval stays human: a person approves the final proof by email before production. No tool on this server records or implies an approval.
- Payment stays human: this server moves no money itself. It returns a hosted invoice link and a person pays on Stripe's hosted page.
- Production release and the supplier handoff stay human: no tool releases an order to production or touches fulfillment state.

Do not tell a person their design is approved, their payment was taken by the server, or their order has shipped unless `get_order_status` says so.

## Errors

Every tool error returns MCP's standard error content plus a structured object `{code, message, retryable, details}`. No error returns another organization's data, a stack trace, or a secret.

| Code | Meaning | Retryable | Next action |
| --- | --- | --- | --- |
| `unauthorized` | The key is malformed, unknown, or revoked. | no | Fix the key and its `Authorization: Bearer <key>` header. Read tools need no key at all. |
| `forbidden` | The key is valid, but the named record belongs to another organization. | no | Do not retry. Use the owning organization's key, or start fresh under your own. |
| `invalid_input` | An input failed validation; the message names it. Includes quantities under the 100-disc minimum. | no | Correct the named input and resend. Do not retry a smaller quantity. |
| `manual_exception` | The request needs a person, for example a size other than the two built-ins. | no | Take the human route the message names: Ryan at ryan@tap.giving. |
| `not_found` | The named record does not exist for this key's organization. Another organization's records read as not_found. | no | Check the reference. |
| `conflict` | State conflict: an idempotency key reused with a different payload, order inputs that differ from the recap, or an already paid order path. `details` names the differing fields. | no | Reconcile against the details. For a genuinely new order, re-run `get_recap` and use a fresh idempotency key. |
| `stripe_unavailable` | Stripe did not complete the invoice call. | yes | Retry with the same idempotency key; a retry cannot double-mint. |
| `rate_limited` | Too many calls right now. | yes | Wait, then retry. On `start_order_intent` the contact is not captured until a call succeeds. |
| `internal` | Something failed on the server side. | yes | Retry. If it persists, reach Ryan at ryan@tap.giving with the message. |

The distinction agents most often get wrong: `unauthorized` is about the key itself, while `forbidden` means the key is fine and the record is not yours.
