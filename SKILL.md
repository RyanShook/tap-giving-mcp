---
name: nfc-tap-builder
description: Create print-ready NFC artwork proofs with correct vector art for an organization through the Tap.Giving MCP server (NFC Tap Builder by Tap.Giving) at https://tap.giving/mcp, free to take to any vendor, with no lock-in. Built for churches, nonprofits, restaurants, coffee shops, and local businesses. Use when someone wants print-ready NFC tap artwork, a design proof, the artwork spec, a pricing quote, or help with Tap.Giving discs. Discovery, quotes, product facts, and the artwork spec need nothing. Ordering custom discs through Tap.Giving is an optional next step. No key, login, or account exists anywhere in this server.
---

# NFC Tap Builder by Tap.Giving

Use this skill to help an organization create print-ready NFC artwork proofs through Tap.Giving's hosted MCP server. It is a tool first: the artwork it builds is print-ready, with correct vector art, and the organization can take it to any vendor, with no lock-in. Ordering custom discs through Tap.Giving is an optional next step. A tap disc is a durable disc a phone taps to open the organization's page instantly. When an organization does order, the server takes the order up to two human gates: a person approves the final proof by email, and a person pays a hosted invoice. The server moves no money itself and never takes payment.

Also searched as: tap discs, tap plates, tap tags, NFC tap discs.

## Connect

Website: https://tap.giving

Endpoint: `POST https://tap.giving/mcp` (MCP over Streamable HTTP, JSON-RPC 2.0, stateless). `GET https://tap.giving/mcp` returns a short self-description.

Paste-ready client config. Every tool works exactly as shown:

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

No key, login, or account exists anywhere in this server, at any step. Order status is read with the order's status reference, issued at placement and carried in the order's email; keep it, it cannot be recovered if lost.

## The journey

1. Call `get_discovery` first. It orients a cold start in one call: the product, the first choice (shape: round or square), the two-part flow (Part 1 design, Part 2 order), and the artwork summary. Part 1 carries no pricing at all.
2. In Part 2, call `get_quote` for the binding quote at an exact quantity, and `get_product` for full product facts.
3. Call `get_artwork_spec` for the production geometry of the chosen shape, build the artwork using the delivered examples in get_artwork_spec as references, and send it back with `submit_artwork`.
4. Part 2 opens with `start_order_intent`: call it with a contact email, first in Ryan's collection order (email, organization name, shipping address and phone, quantity, shape, mounting, link destination). It captures the email through the same public capture endpoint the website uses.
5. Call `get_order_questions` and ask its questions in the order given, then call `get_recap` to show the person the full order (artwork, quantity, shipping address, exact cost) before anything is locked in.
6. Call `create_order` with the recap reference: this is the final step, "Email me my invoice and design proof." The order is recorded in the CRM, the full order is emailed to the Tap.Giving team, a Stripe invoice is created and finalized at the quoted total, and the invoice plus the design proof are emailed to the customer. A person pays the hosted invoice when it arrives.
7. Call `get_order_status` with the order's status reference for where an order stands. (`register_webhook`'s retirement in v1 is proposed in the spec, pending settlement; delivery was never built.)

## Tools

Reads (nothing asked):

| Tool | What it does | Returns |
| --- | --- | --- |
| `get_discovery` | One-call orientation: product, shapes, the two-part flow, artwork summary, capabilities. Part 1 content only: no pricing. | `server`, `introduction`, `capabilities` |
| `get_quote` (alias `get_pricing`) | The binding quote at an exact quantity. Quantities under the 100-disc minimum are refused with the minimum stated. Maximum 7000. | `discUnitCents`, `discSubtotalCents`, `grandTotalCents`, `discount` (conditional line), `shippingLine`, `taxNote` |
| `get_product` | Full product facts: discs, stands, badges, mounting, shipping terms. | `discs`, `stands`, `badges`, `shipping` |
| `get_artwork_spec` | Production artwork geometry as structured millimetre data, plain guidelines, delivered example designs, and the optional logo ask. | geometry per shape, `guidelines`, `examples`, `logoAsk` |
| `get_order_questions` | The order questions as structured data, in Ryan's order: email first (captured by `start_order_intent`), then organization name, shipping address and phone, quantity (with the metal-surfaces count beside it), shape, mounting with picture options, and the link destination as a recap confirmation. The price range line is first stated at this Part 2 entry. | `questions` in order |
| `get_recap` | The full recap, the last thing before the final step: submitted artwork, quantity, shipping address as entered, the exact cost from `get_quote`, and both required notes. The recap binds to the order's contact email and the captured intent. | `recapRef`, `cost`, `shipTo`, `notes`, `exits` |

Writes:

| Tool | What it does | Returns |
| --- | --- | --- |
| `submit_artwork` | Sends finished artwork back under a permissive intake (see Artwork). Acceptance is not a production-fitness verdict. | `artworkRef`, `displayUrl`, `sha256`, `validation` |
| `start_order_intent` | Captures a contact email so a person at Tap.Giving has it. Part 2 opens here. | `captured`, `source`, `nextStep` |

Placing an order (the final step):

| Tool | What it does | Returns |
| --- | --- | --- |
| `create_order` | The final step, "Email me my invoice and design proof.": places the order through the same front door a website order takes; the order is recorded in the CRM, the full order is emailed to the Tap.Giving team, a Stripe invoice is created and finalized at the quoted total, and the invoice plus the design proof are emailed to the customer. Idempotent on the caller's idempotency key. Exits: pay now, or lock in this price. | `orderRef`, `statusRef`, `quote`, `exit`, `confirmation`, `orderEmail`, `invoice`, `customerEmail`, `nextStep` |

Status:

| Tool | What it does | Returns |
| --- | --- | --- |
| `get_order_status` | Where an order stands, read with the order's `statusRef` (a capability issued at placement; only its hash is stored): stage, invoice state including the hosted link, fulfillment state with tracking when present, quantity, and the order's own artwork preview. | `stage`, `invoice`, fulfillment |
| `register_webhook` | Registers (or replaces) one webhook subscription for proof_ready and shipped events. Registration exists in v1; delivery is v1.1. Retirement in v1 is proposed in the spec, pending settlement. | `subscriptionSecret` (shown once), `payloadContract`, `delivery` |

Every tool declares `destructiveHint: false` and `openWorldHint: false`; the read-only tools also declare `readOnlyHint: true`. `create_order` is safe to retry after a network failure with the same idempotency key; a retry never re-sends an order email that already went out.

## Pricing facts

These facts belong to the quote step and after it. Part 1 surfaces (discovery, the GET self-description, the first presentation of the server, the artwork spec, product facts) carry NO pricing references at all (Ryan, 2026-11-09). The per-disc range is first stated at the Part 2 entry, the order questions: Price range of $3.50 - $5.00 per disc depending on quantity.

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

- Geometry (from `get_artwork_spec`): 106 mm artboard, 100 mm cut for the round or square shape, 3 mm bleed, safe zone as returned by the tool. The finished deliverable is a print-ready PDF, produced by your own tools from the spec (the server never builds or returns a PDF); submit vector source (SVG preferred) for the on-disc proof.
- Intake is accept-by-default, with a 5 MB cap on the submitted file. Artwork is refused only on three sanity grounds: malicious content, a file type that masquerades as an image, over the size cap, or bytes that do not decode as a real image.
- Acceptance is not a production-fitness verdict. Production fitness is judged later in the proof flow, and a person approves the final proof by email before production.

## No keys

There are no keys. No user-facing step in this server requires or offers a key, login, or account, including placing an order and reading its status. Connect with the endpoint URL alone. Order status is read with the order's status reference, a capability issued at placement and carried in the order's email; only its hash is stored, and it cannot be recovered if lost.

## Human gates

- Design approval stays human: a person approves the final proof by email before production. No tool on this server records or implies an approval.
- Payment stays human: This server moves no money itself, and payment happens on the hosted invoice. When an order is placed, Tap.Giving emails the invoice and the design proof; a person pays the invoice when it arrives.
- Production release and the supplier handoff stay human: no tool releases an order to production or touches fulfillment state.

Do not tell a person their design is approved, their payment was taken by the server, or their order has shipped unless `get_order_status` says so.

## Errors

Every tool error returns MCP's standard error content plus a structured object `{code, message, retryable, details}`. No error returns another organization's data, a stack trace, or a secret.

| Code | Meaning | Retryable | Next action |
| --- | --- | --- | --- |
| `unauthorized` | Retired 2026-11-09: no credential exists in this server, and no tool returns this code. | no | Nothing to fix: connect with the endpoint URL alone. |
| `forbidden` | Retired 2026-11-09: no credential exists in this server, and no tool returns this code. Records bound to another order read as `not_found`. | no | Nothing to fix: use the reference the flow issued. |
| `invalid_input` | An input failed validation; the message names it. Includes quantities under the 100-disc minimum. | no | Correct the named input and resend. Do not retry a smaller quantity. |
| `manual_exception` | The request needs a person, for example a size other than the two built-ins. | no | Take the human route the message names: Ryan at ryan@tap.giving. |
| `not_found` | The named record does not exist for the reference presented. Another order's records read as not_found. | no | Check the reference. |
| `conflict` | State conflict: an idempotency key reused with a different payload, order inputs that differ from the recap, or an already paid order path. `details` names the differing fields. | no | Reconcile against the details. For a genuinely new order, re-run `get_recap` and use a fresh idempotency key. |
| `stripe_unavailable` | Stripe did not complete the invoice call. | yes | Retry with the same idempotency key; a retry cannot double-mint. |
| `rate_limited` | Too many calls right now. | yes | Wait, then retry. On `start_order_intent` the contact is not captured until a call succeeds. |
| `internal` | Something failed on the server side. | yes | Retry. If it persists, reach Ryan at ryan@tap.giving with the message. |

The distinction agents most often get wrong: `not_found` is what an unknown or unbound reference returns on every path; there are no credential errors to confuse it with.
