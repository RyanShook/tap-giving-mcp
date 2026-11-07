# NFC Tap Builder by Tap.Giving

Welcome. This is the public home of Tap.Giving's MCP server, "NFC Tap
Builder by Tap.Giving": the connector that lets an AI agent help a
church or nonprofit design and order custom NFC tap discs, tap
plates, and tap tags end to end, from first discovery to a hosted
invoice link a person pays.

- **Endpoint:** `POST https://tap.giving/mcp` (MCP over Streamable
  HTTP, JSON-RPC 2.0, stateless). `GET https://tap.giving/mcp`
  returns a short self-description for people and agents.
- **Spec:** the published design and tool contracts live in
  [docs/spec.md](docs/spec.md). The server is built and accepted:
  every acceptance leg passed, including the field-for-field invoice
  parity check against Stripe test mode on 2026-11-07.
- **This repo stays clean:** README, the published spec, and the
  released server code. Working notes and anything touching private
  business operations live elsewhere by design.

## What the server does

Build and order custom NFC tap discs, tap plates, and tap tags for
churches and nonprofits: NFC tap to give, designed by your own agent,
priced from the published tiers, ordered up to the human payment and
proof gates.

The read side is open and needs no key: an agent can discover the
product, see the published pricing, read the artwork spec with house
example designs, and submit artwork for validation before any contact
exists. Writing an order needs an organization API key (see below).

This server moves no money itself: it returns a hosted invoice link
for a person to pay. Payment, design approval, and production release
stay human gates: no tool takes payment, approves a design, or
releases an order to production.

## Tools

| Tool | Key | What it does |
|---|---|---|
| `get_discovery` | no | One-call orientation: the product, the two shapes, the tier prices, the artwork summary, the tool list, and how an organization gets a key. |
| `get_quote` (alias `get_pricing`) | no | An exact quote from the published tiers; below 100 discs is refused with the minimum stated. |
| `get_product` | no | Product facts: discs, stands, badges, mounting, and shipping terms. |
| `get_artwork_spec` | no | The production artwork geometry in structured form, with the house example set and the optional logo ask. |
| `submit_artwork` | optional | Accepts artwork under a permissive intake (three sanity grounds only); that it was accepted is not a production-fitness verdict. |
| `start_order_intent` | no | Captures an email contact so a person at Tap.Giving has it, and names the key step for ordering. |
| `get_order_questions` | yes | The order questions in order: quantity, mounting with pictures, optional link destination, shipping address. |
| `get_recap` | yes | The order in display order (artwork, quantity, ship-to, exact total) with the two required notes, returning a recap reference. |
| `create_order` | yes | Locks an order in behind both exits (pay now, or lock in this price); idempotent on the caller's key. |
| `request_invoice` | yes | Mints the order's invoice and returns the hosted link for the person who pays. |
| `get_order_status` | yes | Order stage, invoice state, and fulfillment read from the records of truth. |
| `register_webhook` | yes | Registers one callback per organization for proof_ready and shipped (registration in v1; delivery is v1.1). |

## Keys

An organization key looks like `tg_live_<orgslug>_<secret>` (or
`tg_test_...` for the test lane) and is sent as
`Authorization: Bearer <key>`. Only the SHA-256 hash of a key is
stored. A key's mode binds its seat: test keys write test records and
mint test invoices; live keys serve production. Real organizations
get a key by asking Ryan at ryan@tap.giving.

## Development

```sh
npm install
npm test          # contract tests against the published fact set
npm run typecheck
npx wrangler dev  # local run
```

Secrets (Stripe keys per mode, the invocation-seat secret) are set
with `wrangler secret put` and are never committed.
