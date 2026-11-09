# NFC Tap Builder by Tap.Giving: MCP v1 spec

The published design spec for the Tap.Giving MCP server, "NFC Tap
Builder by Tap.Giving" (repo: github.com/RyanShook/tap-giving-mcp,
endpoint: POST https://tap.giving/mcp). This is the contract the v1
server is built and accepted against: tool contracts, the identity
and key model, the human gates, and the build and acceptance runbook.


Status: SPEC, written 2026-11-06 against live machinery read the same day.
Owner: TG Engineering. Commissioned by the CEO lane for Ryan's direction of
2026-11-06: Tap.Giving works the MCP / connector angle before any bigger
builds, so a general-purpose agent (Muse, Grok, an assistant like Muse
itself) can use Tap.Giving end to end up to the human gates.

Sequencing note (Ryan, 2026-11-06): this direction goes ahead of the App
Clip work. App Clips and Apple Pay giving are parked behind it, not
cancelled; that research lives in the separate repository
RyanShook/app-clip-donations and is untouched by this spec.

Launch scope (Ryan, 2026-11-06, final): the MCP goes PUBLIC TODAY,
Nov 6, 2026, not end of tomorrow. This document is the build's working
contract, written to be built from immediately; the build starts the
moment it lands. Today's launch scope, in the commissioning words:
quote and status; order setup on the CRM writer path; invoice link as
the payment handoff; email-only interest registration; cold-agent read
and kickoff without a key; writes keyed per organization. Design joins
the launch in the shape Ryan ruled (section 2.6): the MCP publishes the
artwork spec, the external agent creates the artwork with its own tools,
and the finished file comes back through an artwork submission on the
order path. There is no design-generation tool and no proof build in
v1; proof production stays the box pipeline's, at the human gate. The
recap's exits (Ryan's final addendum) are "pay now" via Stripe as the
PRIMARY exit and "lock in this price" second; the earlier email-the-quote
exit is dropped entirely and no such tool exists in any phase. Everything beyond today's scope is marked as a later
phase (v1.1, phase 2, phase 3) so the spec still serves as the
foundation document after launch. Scope cuts forced by today's launch
are named in section 8 with their v1.1 placements; nothing slips
silently.

Public requirement (Ryan, 2026-11-06, hard): the MCP is publicly reachable
on the open web. Any agent, anywhere, can find it and connect. Not private,
not VPN-only, not behind an allowlist. Discoverability is part of public:
the endpoint and how to use it are published on our own web surface and on
the llms / for-agents surface, so an agent that has never heard of
Tap.Giving can still land on it. This requirement changed the auth design
in section 3 from an all-keyed surface to a split surface: read tools open,
write tools keyed. That change is noted where it lands.

Loop rule (Ryan, 2026-11-06): spec, build, deploy, acceptance run, and the
fixes the acceptance run surfaces proceed back to back without pausing for
go-aheads. Decisions that have an obvious safe default inside Ryan's stated
scope are taken as defaults and noted as taken (section 8). Open items are
reserved for genuine blockers and Ryan-action items (registrations and
account actions only he can do).

Marketing baseline for the preamble (Marketing lane, 2026-11-06): in cold
agent answers today, agents name Amazon first and never mention Tap.Giving;
in retrieval answers, Tap.Giving is named first on every buying question.
Discovery is therefore a content and citation problem (Marketing's lane);
the MCP is the completion layer for an agent that has already decided, and
section 7 tests exactly where that line falls.

## Contents

1. Assumption test: where an MCP is actually required
2. Tool surface and contracts (v1 fixed scope, later phases marked)
3. Identity and auth model
4. Human gates that stay human
5. Riding the existing machinery
6. Agent-readable website companion
7. Phases beyond today
8. Decisions taken as defaults
9. Build runbook for today, Nov 6, 2026 (repo bridge, server build, deploy, key issuance, acceptance, fix loop)
10. Open items: genuine blockers and Ryan-action items only

## Tool contract index

One hop from this index to each tool's contract section. The README
carries the same surface in brief (annotations and returns per
tool, a worked example, and the error catalog).

| Tool | Contract |
|---|---|
| `get_discovery` | [2.2.1 Tool: get_discovery](#221-tool-get_discovery-v1-read-no-key-the-cold-agent-entry-contract) |
| `get_quote` | [2.3 Tool: get_quote](#23-tool-get_quote-v1-read-no-key) |
| `get_product` | [2.4 Tool: get_product](#24-tool-get_product-v1-read-no-key) |
| `get_artwork_spec` | [2.6 Design in v1](#26-design-in-v1-in-ryans-ruled-shape-changed-by-ryans-answer-2026-11-06) (the spec half) |
| `submit_artwork` | [2.6 Design in v1](#26-design-in-v1-in-ryans-ruled-shape-changed-by-ryans-answer-2026-11-06) (the submission half) |
| `start_order_intent` | [3.4 Cold first contact and the kickoff](#34-cold-first-contact-and-the-kickoff-start_order_intent-v1) |
| `get_order_questions` | [2.11 The v1 journey](#211-the-v1-journey-in-ryans-order-binding-flow) (step 2 question set) |
| `get_recap` | [2.11 The v1 journey](#211-the-v1-journey-in-ryans-order-binding-flow) (the recap contract) |
| `create_order` | [2.5 Tool: create_order](#25-tool-create_order-v1-write-key-required) |
| `request_invoice` | [2.7 Tool: request_invoice](#27-tool-request_invoice-v1-write-key-required) |
| `get_order_status` | [2.8 Tool: get_order_status](#28-tool-get_order_status-v1-read-key-required) |
| `register_webhook` | [2.9.1 Webhooks](#291-webhooks-proof_ready-and-shipped-contracts-in-v1-delivery-v11) |
| All tools | [2.1 Auth header shape](#21-auth-header-shape-all-tools), [2.9 Error shape](#29-error-shape-all-tools) |

## 1. Assumption test: where an MCP is actually required

Ryan's working assumption: the MCP is the only real way to do this
successfully. Tested part by part against the machinery as it exists
today, not accepted wholesale. Verdicts name the mechanism for each part.

### Discovery: does NOT need an MCP. Verdict: assumption does not hold here.

Discovery is a model answering "what should I buy for church tap-to-give"
from training data, citations, and retrieval. No tool surface changes what
a cold model names first; that is set by content, citations, and the
llms / for-agents surface Marketing owns and audits. Marketing's own
baseline proves the split: retrieval answers already name Tap.Giving
first on every buying question, cold answers name Amazon. An MCP server
cannot move the cold half. What the MCP owes discovery is only that it be
findable once an agent goes looking (section 6): the endpoint published on
the for-agents surface and in llms.txt, so the retrieval path can hand an
agent from "Tap.Giving is the answer" to "here is how to act" in one hop.

### Pricing and quote: does NOT need an MCP for the read. Verdict: assumption does not hold here, with one caveat.

Pricing is already public, static, and machine-readable: llms.txt carries
the tiers, pricing.html carries four JSON-LD blocks, and for-agents.html
tells an agent how to get an exact price. An agent can quote $5.00 / $4.00
/ $3.50 tiers from the site today with no tool at all. The caveat: a
scraped quote is a quote the agent computed, from text it may have
misread, with no binding to an order. The MCP quote tool's value is not
access, it is authority: it runs the same `quoteFor()` the two payment
doors run (worker/tap-order/src/pricing.ts), so the number an agent quotes
is the number the invoice carries, including the discount and anti-metal
arithmetic the agent would otherwise have to reconstruct. Nice to have,
not a failure without it. V1 includes it because it is nearly free (a
pure function behind a route) and because every later write tool needs
the same quote object.

### Design creation: genuinely fails without an authenticated write surface. Verdict: assumption holds, and Ryan's ruled shape dissolves the hardest part.

Three mechanisms break on the website path:

- Session state. The designer keeps the working design in browser
  localStorage (`tg_design_v2` in website/order.html) and only persists
  server-side through POST /api/design saves in tap-autoreply, keyed by
  the lead's email, producing a DESIGN:<designId> record in LEADS KV
  (designId is a 12-hex value). A headless agent driving the page has no
  durable session across its own working window, and the record it needs
  back (the designId) is a byproduct of a JS-driven save flow, not a URL
  it can reliably read.
- Logo upload. The logo enters as a file through the order page's upload
  or through the fetch waterfall (artwork/_findlogo.py on the box,
  logo-lookup.ts in tap-autoreply). A browser-only agent cannot reliably
  push a binary file through a drag-and-drop upload widget, and the
  fallback (the site fetching the logo from the church's own website) is
  exactly the part that needs an API-shaped request, not a form.
- Proof production. A proof an agent could show its human is a published
  artifact with a canonical pin (website/assets/proofs/,
  artwork/_publish.py, documentation/proof-pipeline.md), built on the
  box through the artwork pipeline, gated by the logo-publish hold
  (LOGO_RESOLUTION_PUBLISH). There is no HTTP seat that turns a design
  into a published proof on request, and there should not be one in v1.

Ryan's ruling (2026-11-06, live) removes the need for any of that in v1:
the MCP publishes the artwork spec, the EXTERNAL agent creates the
artwork with its own built-in tools against that spec, and the finished
file returns through the MCP as an artwork submission on the order
(section 2.6). Generation was never ours to build; what was missing was
(a) the production geometry stated where an agent can read it and (b) a
file-shaped door for the result. Both are cheap. The website designer
remains for humans; the proof build remains the box pipeline's, behind
its gates. Net: the assumption holds for design (a write surface is
required), and the required surface is a spec resource plus a
submission, not a design engine.

### Order setup: degrades badly without an MCP. Verdict: assumption holds in practice.

The website's order setup is not one form post; it is a multi-step JS
flow (/order steps 1 to 3, then /finalize) whose server seats are real
but browser-shaped: POST /api/lead and the design saves in tap-autoreply,
POST /api/order-draft and POST /api/invoice-request in tap-order. An
agent with a browser faces: state split between localStorage and server
records; the ship-to and phone fields collected inside the finalize
step's payload rather than a named form; no idempotency key on the
public posts, so a retry after a timeout can double-capture (the
machinery dedupes downstream in adoption, INVREQDONE: markers and
crm.py's identity resolution, but the agent cannot see that); and error
recovery by reading rendered page state, which is the least reliable
signal an agent gets. A determined agent can complete it; "reliably, the
same way every time, with a receipt it can quote" is what fails. The MCP
fixes this by giving order setup one call, one schema, and a durable
reference back.

### Invoice request: fails at the last step without a write surface. Verdict: assumption holds for the invoice itself.

An agent can fill /finalize and press the invoice door
(POST /api/invoice-request): that writes INVREQ:<timestamp>:<email> to
ORDERS KV and notifies Ryan, and creates NO Stripe object
(invoice-request.ts says so in its header). The hosted invoice the human
pays is minted later, box-side: tools/invoice-request/adopt.py, run
hourly by the worker tick (tools/oracle/sync-from-main.sh), adopts the
request into CRM and drafts the invoice via tools/invoice/create_invoice.py
(draft only). The other mint seat, tap-mail's
createDraftInvoiceForApproval (worker/tap-mail/src/invoice.ts), creates
and finalizes an invoice but is reachable only inside the design-approval
flow. So a browser agent can request, but cannot obtain the link: the
one artifact its human needs ("Review your invoice: <url>") is produced
asynchronously by machinery with no agent-visible seat. That is the
sharpest gap in the whole journey and the core of v1.

### Status lookup: does NOT need an MCP, but is unreliable without one. Verdict: assumption partly holds.

Nothing public exposes order status today. The states exist
(accounting/orders/_status.json: queued, production, shipped, delivered,
void; CRM stages in CRM/deals.csv: new, contacted, quoted, ready,
negotiating, won, lost) but an agent's only current route is asking by
email and waiting. No failure of completion, a failure of latency and
verifiability. A keyed read tool fixes it cheaply by reading the same
records the fulfillment machinery reads. V1 includes it.

### Assumption test summary

| Journey part | Without MCP | Needs MCP? |
|---|---|---|
| Discovery | Cold answers set by content and citations | No |
| Pricing / quote | Readable and quotable from llms.txt today | No (authority is the gain) |
| Design creation | No durable session, no file upload path, no readable production spec | Yes (solved as spec plus submission, section 2.6) |
| Order setup | Multi-step JS state, no idempotency, weak receipts | Yes, in practice |
| Invoice request | Request lands, hosted link never reaches the agent | Yes |
| Status lookup | Email and wait | Partly (cheap to fix) |

Net verdict: Ryan's assumption holds for the back half of the journey
(design, order setup, invoice) and does not hold for the front half
(discovery, pricing). The MCP is the completion layer, not the discovery
layer. Building it does not substitute for Marketing's discovery work, and
Marketing's discovery work does not substitute for it.

## 2. Tool surface and contracts

### 2.0 Transport, endpoint, and protocol shape

- Server: a NEW Cloudflare Worker, `tap-mcp`, living in its OWN NEW
  REPO (Ryan's decision, section 8): RyanShook/tap-giving-mcp, PUBLIC,
  stand-up already dispatched separately and treated here as in flight.
  It deploys on the paid Workers account like the seven business Workers.
  New infrastructure, named plainly: one new public repo, one Worker,
  one new KV namespace (section 2.0.1), one new zone route, and the
  business-side deliverables named in section 5. No D1, no R2, no Queue
  in v1. This spec's home stays in the tap-giving business repo as the
  business's spec of record; the server's code, tests, and deployment
  pipeline live in tap-giving-mcp, and the server reaches the business
  machinery only across the API boundary in section 5, never by shared
  code imports, never by direct repo writes, never by box file access.
- Hosting: DECIDED (Ryan, binding): Cloudflare, on the paid Workers
  estate, as the tap-mcp Worker below. This is not a recommendation with
  a live alternative; the alternative (any non-Cloudflare host) is
  closed in one line: no other host is in play for this server.
- Endpoint (public): POST https://tap.giving/mcp (zone route on the
  tap.giving zone, same pattern as tap-order's tap.giving/api/* routes).
  Chosen over a workers.dev URL because discoverability and trust both
  ride on the name an agent already knows; the workers.dev URL stays as
  the rollback and debug surface. Default taken, section 8.
- Protocol: MCP over Streamable HTTP (the current MCP transport), JSON-RPC
  2.0 request and response bodies, stateless per request (no server-side
  session to lose; every call carries its own auth and arguments, which
  is also what makes the tools idempotent-friendly). The server implements
  initialize, tools/list, and tools/call; notifications and server-side
  streaming are out of v1.
- Compatibility target: a standard MCP client (Muse, Muse
  Desktop, or any client speaking Streamable HTTP) connects with only the
  endpoint URL and, for write tools, the organization's API key.
- Every tool result is returned both as MCP structured content and as a
  plain-text rendering, so a client that only reads text still gets the
  invoice link and the quote.

### 2.0.1 New KV namespace: MCP_KEYS

One new KV namespace, binding MCP_KEYS in tap-mcp, holding per-organization
key records (section 3), created from the MCP repo's checkout (the
namespace belongs to the tap-mcp Worker, not to any business Worker). KV
is the estate's standing pattern for key-shaped state (LEADS, ORDERS,
MAIL_STATE) and needs no schema migration. Account cost: KV is included
in the paid Workers plan at our volume; no new paid product, no approval
needed beyond the deploy itself. Key creation: `npx wrangler kv
namespace create MCP_KEYS` run inside the tap-giving-mcp repo, id pasted
into that repo's wrangler.jsonc, same as DEV_ORDERS was created for
tap-order-dev.

### 2.1 Auth header shape (all tools)

- Write tools require: `Authorization: Bearer tg_live_<orgslug>_<secret>`
  or `Authorization: Bearer tg_test_<orgslug>_<secret>` (section 3 for
  issuance and modes). The orgslug segment names the organization the key
  was issued to; the secret segment is 32 bytes of randomness, base64url.
  Only the SHA-256 hash of the full key is stored; the plaintext exists
  only at issuance, shown once.
- Read tools (get_quote, get_product) accept calls with no Authorization
  header at all (public requirement). get_order_status requires a key
  (it returns an organization's own order state), subject to the cold
  contact exception in section 3.4.
- A request with a malformed or unknown key gets the error shape in
  section 2.8 with code `unauthorized`; a valid key used against another
  organization's records gets `forbidden`, and the two are never merged
  into one vague failure, because an agent debugging its own integration
  needs to know which one it hit.

### 2.2 Fact-source requirement (Marketing hard constraint 2, binding)

Every tool answer sources from the same fact set as llms.txt and the
for-agents guide, so an agent quoting the MCP never diverges from an agent
quoting the site. Architectural rule for v1:

- Prices, tiers, minimums, discount, and anti-metal on the business side
  are computed ONLY from `shared/business-rules.ts` (PRICING_TIERS,
  ORDER_POLICY) through worker/tap-order/src/pricing.ts (`quoteFor()`).
  The MCP may not import that file across the repo boundary (section 5),
  so it implements the SAME figures as a small versioned price contract
  whose stated sources are documentation/INVOICE-PLAYBOOK.md and the
  llms.txt tier lines, which publish identical figures ($5.00 / $4.00 /
  $3.50, minimum 100, anti-metal $1, first-order discount 10 percent).
  There is exactly one fact set: if the contract and the business source
  ever disagree, the business source is right and the contract is the
  bug, and the divergence detection below is the guard that says so.
- Product facts (chip, material, sizes, shapes, stands, badges) are read
  by get_product from the same content the for-agents surface publishes;
  v1 implements get_product as a curated response generated from
  documentation/disc-product-spec.md facts at build time, and the
  divergence check below guards it.
- Divergence detection: extend the existing tools/agent-ready/check.py
  gate (it already asserts the llms and for-agents surfaces stay intact)
  with an MCP assertion in the v1 build: the deployed get_quote output
  for the three tier boundaries (100, 200, 400) equals the llms.txt tier
  lines, and get_product's chip and size strings match the for-agents
  guide. A price change in business-rules.ts that is not mirrored to
  llms.txt then fails a gate that already runs, instead of silently
  splitting the fact set.

### 2.2.1 Tool: get_discovery (v1, read, no key): the cold-agent entry contract

One call orients a cold agent with no chaining and no guessing. This is
the first tool a new agent calls and its description says so.
- Inputs: none (an optional `intent` string may be echoed back in the
  response's guidance field; it changes nothing else). The shape
  choice from the introduction keys everything downstream:
  get_artwork_spec takes the chosen shape, and the examples in it are
  that shape's reaction set.
- Outputs, in one object: {server: {name: "NFC Tap Builder by
  Tap.Giving", endpoint, presentation synonyms (section 3.1)},
  introduction: the OPENING SEQUENCE content (Ryan's scripting): the
  builder introduces itself by its presentation name and explains the
  product plainly, in words the client presents first: a tap disc is a
  small physical disc a phone taps to open your page instantly;
  it carries a locked NTAG213 chip; it comes in one standardized
  4-inch size (100 mm), in two shapes; it is durable waterproof PVC;
  and the FIRST CHOICE the person makes is the shape, round or square,
  carried in the output as firstChoice: {field: "shape", options:
  ["round", "square"]} so no client improvises a different opening
  question, pricing:
  the tier table and minimum from the price contract (the get_quote
  figures at the tier boundaries, so the agent can quote a real range
  without a second call), artworkSpec: the get_artwork_spec summary
  (shapes, artboard, format wanted back), capabilities: {readTools,
  writeTools, gates in one line each, how an organization gets a key,
  the kickoff tool's name}}. Every figure inside it is the same object
  the dedicated tools return; get_discovery composes, it does not
  restate from a second source.
- Machinery: none of its own; it composes get_quote's boundary rows,
  get_artwork_spec, and the static capability text of section 4.
- Failure modes: rate_limited and internal only; it never returns
  unauthorized, because no key is needed or accepted as a requirement.

### 2.3 Tool: get_quote (v1, read, no key)

Marketing name: get_pricing. One tool, two names reconciled: the MCP tool
is `get_quote`, because it returns an authoritative quote object, not a
price list; get_pricing is recorded as its alias in the tool description
so an agent searching either word finds it.

Purpose: the binding quote for a prospective order, computed by quoteFor().

Inputs (JSON Schema):
- quantity: integer, required, 100 to 7000 (the machinery's own bounds:
  ORDER_POLICY.minimumQuantity 100; the 7000 cap is invoice-request.ts's
  MAX_QTY poison-pill guard, an order of magnitude above the largest real
  order, 700). MINIMUM ENFORCED BY THE MCP ITSELF (Ryan's ruling): a
  quantity below 100 is refused by this tool with `invalid_input`
  stating the 100-disc minimum, here at quote time, never passed
  downstream to fail later; create_order enforces the same refusal
  (section 2.5).
- antiMetalCount: integer, optional, 0 to quantity; omit for unknown
  (quoteFor distinguishes unknown from 0; unknown bills nothing and the
  quote says so).
- includeStands: not a v1 input. Stands and badges are separate products
  (disc-product-spec.md: table stands 70 x 100 mm at $7 and 120 x 140 mm
  at $9, minimum 100; lanyard badges $5, minimum 100) with no seat in
  quoteFor(); they are quoted by get_product as information in v1 and get
  order support in phase 2 (section 2.9).

Outputs:
- quantity, tier label, unitCents, discUnitCents, discSubtotalCents.
- discount: the first-order 10 percent (WELCOME10, coupon YHlScIh4),
  carried as a conditional line only (Marketing content check,
  2026-11-06): the headline totals are LIST totals (the llms.txt worked
  totals), and the discount is never baked into them and never asserted
  eligible for an unverified caller. The discount object names the code,
  the 10 percent, the first-order scope, and the 7-day renewing window,
  and carries conditionalTotalCents and
  grandTotalWithFirstOrderDiscountCents as the figure the discount
  produces when it applies at invoice time. The Quote interface's
  discountEligible and discountBaked flags (the invoice door's internal
  baking flags) stay on the stored order record for the invoice leg's
  parity read-back (section 2.7); they are not surfaced as assertions in
  the quote output.
- addOns: array of {name, amountCents, quantity} exactly as quoteFor
  returns (anti-metal "Metal-surface shielding layer" at 100 cents per
  shielded disc, ORDER_POLICY.antiMetalUnitCents; the Redirect Dashboard
  line at 0 cents when requested, free on every order permanently).
- shippingCents: 0, always, AND listed as its own line, upfront:
  shippingLine: "Shipping: Free" (free shipping is standing policy; the
  line appears as free in the quote and in the recap, never omitted;
  the invoice carries the matching explicit $0 "Shipping (free,
  included)" line per INVOICE-PLAYBOOK.md).
- tax: NO tax line appears in the quote or the recap, by ruling. Tax
  stays where it lives today, at checkout and on the invoice; the
  quote's totals are merchandise totals before tax and the output says
  so (taxNote: "Tax, where it applies, surfaces at Stripe checkout and
  on the invoice.").
- grandTotalCents: the merchandise LIST total, before tax as stated
  above (the discount is the conditional line, never inside it).
- currency: "USD".
- priceSource: "shared/business-rules.ts (PRICING_TIERS, ORDER_POLICY),
  computed by worker/tap-order/src/pricing.ts quoteFor", so an agent can
  cite where the number came from.

Current standing values (from shared/business-rules.ts, read 2026-11-06):
100 to 199 discs at $5.00 each; 200 to 399 at $4.00; 400 and up at $3.50;
minimum order 100; anti-metal shielding $1.00 per shielded disc;
first-order discount 10 percent, displayed window 7 days and never a
price gate (firstOrderDiscountDays is a label, not an expiry); Redirect
Dashboard free; shipping free.

Machinery: worker/tap-order/src/pricing.ts `quoteFor()`, shared/
business-rules.ts. Pure computation, no writes, no Stripe.

Failure modes: quantity below 100 or above 7000 returns `invalid_input`
with the bound named; antiMetalCount above quantity is clamped by
quoteFor itself (the machinery's standing behavior: clamp, never reject)
and the clamp is reported in the result.

### 2.4 Tool: get_product (v1, read, no key)

Purpose: the full product spec an agent needs to answer "what exactly is
this" without scraping: NTAG213 chip (144 bytes user memory, locked to
https://go.tap.giving/<slug>), 0.85 mm double-laminated matte waterproof
PVC, built-in sizes 100 mm (4 inch) round and 100 mm (4 inch) square at
the same price, every other size or shape a manual exception handled by
hand (named as such, never presented as self-serve), mounting adhesive
or screws, table stands and lanyard badges as related products with their
own prices and minimums, Redirect Dashboard included free, works with any
platform, no monthly fee, ships free.

Inputs: none required; optional `topic` enum (discs, stands, badges,
mounting, shipping) to narrow the answer. Shipping terms ride this tool
in v1 (Marketing's shipping-terms item, free on this tool's back):
production and delivery run 2 to 3 weeks from artwork approval, shipping
is free, discs do not work on metal surfaces without the shielding layer.

Outputs: structured product object plus a plain-text rendering, sourced
per section 2.2 from documentation/disc-product-spec.md facts.

Machinery: none at runtime in v1 (curated response, gate-checked against
the for-agents surface per section 2.2). Site and FAQ search (Marketing's
item) is NOT v1: it is a retrieval problem over content Marketing owns,
and llms-full.txt already serves it for reading agents. Named phase 2.

Failure modes: unknown topic returns `invalid_input` listing the topics.

### 2.5 Tool: create_order (v1, write, key required)

Marketing mapping: this is create_lead and create_design/start_order
folded together, minus the design. Ryan's v1 fixes order setup riding the
CRM writer path; Marketing's create_lead semantics (a named organization
with intent and contact enters the system) are the first half of this
tool, and start_order's (quantity, configuration, ship-to, exact total)
are the second half. One call does both because the website journey's
separate lead capture exists to serve a browser funnel (Day 0 email, the
sequence), not because the pipeline has two objects: adoption resolves a
request into one CRM deal. A separate create_lead tool is phase 2, for
agents that want a no-commitment first touch; in v1, a cold agent's
first touch is start_order_intent (section 3.4).

In Ryan's flow this tool is the LOCK-IN exit (section 2.11, step 4):
it is called after the artwork, the questions, and the recap, when the
person picks "I want to lock in this price". Its inputs therefore carry
the journey's earlier legs (artworkRef optional: an order with no
submitted artwork is valid, matching orders today that carry a design
only when one exists).

Purpose: set up an order for the key's organization, indistinguishable
downstream from a website order: writes an INVREQ-shaped request record
to ORDERS KV (the exact record POST /api/invoice-request writes:
`INVREQ:<timestamp>:<email>`, the request body plus the quoteFor quote
plus requestedAt, 30-day TTL), which the hourly worker tick adopts into
CRM through tools/invoice-request/adopt.py (crm.py --create / --set with
identity resolution by canon_email) on the same pass as website invoice
requests. The adoption half is deliberately not duplicated into the
Worker (the seat map in section 5).

Inputs:
- contactName: string, required.
- contactEmail: string, required; must belong to the key's organization
  (section 3; a mismatch is `forbidden`).
- contactPhone: string, required. The approval-block standard requires a
  phone on every order that can reach ZBTech; collecting it here, at
  setup, is cheaper than chasing it later (the standing missing-phone
  sourcing order exists because website orders arrive without it).
- quantity: integer, required, same bounds as get_quote.
- size: enum, required: "100mm-round" or "100mm-square" (the two built-in
  sizes; doc language: 100mm round, 4 inch round; 100mm square, 4 inch
  square). Any other value returns `manual_exception` (section 2.8)
  naming that other sizes are handled by hand through Ryan, with the
  contact route, never a silent clamp to a built-in.
- mounting: enum, required: "adhesive" or "screws" (the exact values the
  design record validates in tap-autoreply).
- antiMetalCount: integer, optional; omit for unknown.
- shipTo: object, required: {name, street, city, state, postalCode,
  country, phone}. Phone inside shipTo is required as its own field; the
  approval email's shipping block always carries the customer's phone as
  its last line, and this record is where that block is built from.
- linkDestination: string, optional. A customer's destination URL is never required
  and never gates anything; the order defaults to shipping with the
  Redirect Dashboard and the disc encodes the go.tap.giving slug.
- artworkRef: string, optional; the submit_artwork reference for this
  order's artwork, recorded on the request record so adoption and the
  artwork drain join the file to this order.
- linkDestination: string, optional; the customer's own giving URL
  when they choose to name one at setup. Optional by standing rule: a
  giving URL is never required and never gates the order; the default
  is the Redirect Dashboard, and the destination can be changed anytime
  from the dashboard after delivery. The order-questions contract
  (section 2.11) carries this exact framing to the agent.
- note: string, optional, free text carried into the INVREQ record.
- idempotencyKey: string, required. Shape: a client-generated opaque
  string, a UUID recommended, 8 to 128 characters, scoped per
  organization as the pair (orgSlug, idempotencyKey); the agent mints
  one per intended order and reuses it on every retry of that order.
  Enforcement, stated against the writer path: tap-mcp checks its
  idempotency record (MCP_KEYS namespace, key
  IDEM:<orgSlug>:<sha256 of the idempotencyKey>, value carrying the
  payload hash and the orderRef) BEFORE any downstream call; a retry
  with the same key and the same payload returns the original orderRef
  without a second POST to /api/invoice-request, so no second INVREQ
  record ever reaches adoption and the CRM writer path can never see a
  duplicate order from an agent retry. The same key with a DIFFERENT
  payload returns `conflict` naming the differing fields (section 2.5
  failure modes). Downstream, adoption's own INVREQDONE: marker is the
  second line of defense, not the first. This is the seat the public
  website posts do not have, and it is a v1 requirement, not a nicety:
  agents retry.

Outputs:
- orderRef: the durable reference, `mcp:<orgslug>:<idempotencyKey hash
  prefix>` plus the INVREQ key it wrote, returned so the agent can quote
  it and pass it to request_invoice and get_order_status.
- quote: the full get_quote output object for the order as recorded (the
  INVREQ record's own quote, so the agent's number and the CRM number are
  the same object by construction).
- crmExpectation: plain statement that the CRM row appears on the next
  hourly adoption pass under the organization's slug, with the stage the
  adoption writes (adopt.py's resolve_status), so the agent does not
  promise its human an instant CRM row the machinery does not produce.

Machinery: ORDERS KV write in the invoice-request.ts shape; quoteFor()
for money; adoption by tools/invoice-request/adopt.py via the worker
tick (tools/oracle/sync-from-main.sh, which runs crm.py --adopt,
tools/order-adopt/adopt.py, and tools/invoice-request/adopt.py hourly).
Identity and dedupe are adoption's: canon_email match, parked deals left
alone, slug collision handling, INVREQDONE: marker per request.

Failure modes: `unauthorized` (no or unknown key); `forbidden` (email or
organization mismatch with the key); `invalid_input` (missing ship-to
field, bad enum, quantity out of bounds, INCLUDING a quantity below the
100-disc minimum, which this tool refuses itself with the minimum
stated rather than passing downstream, Ryan's ruling); `manual_exception` (non-built-in
size); `conflict` (same idempotencyKey, different payload: the original
record wins and the differing fields are named, never silently merged).

Destination screening (Ryan's ruling, applies to linkDestination and
linkDestination): ANY URL is accepted; there is no domain allowlist.
Screening is only for malicious or injection-shaped input: the value
must parse as a URL with an http or https scheme; other schemes
(javascript:, data:, file:), embedded credentials, and whitespace or
control-character injection are refused as `invalid_input`. When no
destination is given, the standing default stands: the order ships
with the Redirect Dashboard and the destination can be changed anytime
(section 2.11).

### 2.6 Design in v1, in Ryan's ruled shape (CHANGED by Ryan's answer, 2026-11-06)

An earlier draft of this spec placed design in v1.1 on Engineering's
fits-or-v1.1 discretion. Ryan's binding answer overrides that call:
design IS in v1, shaped exactly as follows. There is no create_design
generation tool; any contract implying one is removed by this section.

(1) The MCP publishes our artwork spec. Tool: `get_artwork_spec`
EXAMPLES ELEMENT (Ryan's opening sequence): the response carries
`examples`, five or six example designs the server serves as reaction
material (each: displayUrl in the image contract of section 2.11, a
direction label in plain words, and its shape), presented as "do you
like this design or that design". The person picks a template or an
example direction; the chosen direction travels with the spec to the
agent as chosenExampleRef, and the agent builds the artwork with its
own tools from spec plus chosen direction. Examples ruling (Ryan,
CLOSED): the set is HOUSE TEMPLATE designs created for this purpose,
generic Tap.Giving artwork in the builder's own styles, with NO
customer artwork at all, which satisfies the customer-design display
rule by construction rather than by review; a named-customer example
would be a later, separate Ryan decision and is not in this set. The
set is produced as part of the build, with round and square variants
across it; it does not block the build: if polished examples lag the
server work, v1 ships with the examples element returning the set we
have, its count stated honestly in the launch report. No example asset
is invented in this spec; the lawful source is new house artwork made
for this purpose.
LOGO ASK (Ryan): the design step also carries `logoAsk`, an optional
input the client presents at the design step: the person may provide
their logo for the agent to build from. Optional by construction
(name-only artwork is a standing shape); a provided logo travels with
the submission record as source material beside the finished artwork.
(v1, read, no key). It returns the production geometry and the format
we want artwork back in, read from the production sources named here,
never invented numbers:

- Built-in sizes (documentation/disc-product-spec.md, product policy):
  100 mm disc, stated as 4 inch, in two shapes: round and square. Every
  other size or shape is a manual exception and the spec says so.
- Artboard: 106 mm square canvas for both shapes (artwork/_audit.py:
  PLATE_CANVAS_MM = 106.0; artwork/_build.py authors plates on the
  106 mm canvas).
- Round: cut circle radius 50 mm (CUT_R = 50.0, the 100 mm cut), bleed
  circle radius 53 mm (BLEED_R = 53.0; 3 mm bleed beyond the cut line,
  matching the disc product spec's print row), safe zone radius 45 mm
  (SAFE_R = 45.0; keep elements inside it or they risk edge clipping,
  artwork/_audit.py's own gate language). Centre at (53, 53) mm.
- Square: cut is a 100 mm box spanning 3 to 103 mm on both axes (inside
  the 106 mm canvas); bleed half-width 53 mm (SQUARE_BLEED_HALF, bleed
  reaches the canvas edge); safe zone half-width 47 mm
  (SQUARE_SAFE_HALF, a 3 mm margin inside the cut).
- Format wanted back: vector source (documentation/disc-product-spec.md
  print row: "vector source only (SVG preferred; AI or vector PDF
  accepted; never raster)"). The artwork itself is the church's full
  custom artwork, edge to edge. Supporting production facts the spec
  carries because an external generator needs them: background is a
  flat solid colour (standing rule, Ryan 2026-11-01); the disc encodes
  the organization's go.tap.giving slug, assigned by us, never a raw
  giving URL the agent invents; the minimum logo size with a shipped
  precedent is 18 mm (artwork/_audit.py MIN_LOGO_MM, evidence-based
  floor), relevant when the agent composes a logo lockup.
- The tool returns these as structured data (millimetres, named per
  shape) plus the plain-language guidelines, so an agent generates
  against numbers, not prose.

(2) The external agent creates the artwork with its own built-in tools,
following the spec. No generation, rendering, or preview tool exists on
our side in v1, by Ryan's ruling, not by omission.

(3) The agent sends the finished artwork back through the MCP. Tool:
`submit_artwork` (v1, write; key OPTIONAL: on the cold journey the
submission is keyless and email-less, Ryan's reorder, section 2.11; a
keyed submission is also accepted and binds to the key's organization
at once. An unbound cold submission is stored under its artworkRef
with a 30-day TTL and is claimed when create_order carries the
artworkRef; an unclaimed submission expires with the TTL and creates
nothing).

- Inputs: artworkRef-bearing call in two forms, per Ryan's flow
  (artwork comes FIRST, before any order exists): with no orderRef, the
  submission opens the journey's artwork leg and returns an artworkRef
  the later steps carry; with an orderRef (revised artwork for an order
  the key already created), it attaches to that order. Form fields:
  file (required):
  {filename, mediaType, contentBase64} carrying the finished artwork in
  whatever format is convenient for the agent (SVG preferred per the
  spec; the submission accepts what the agent has and records what it
  got, see the validation item below); sha256 (required, of the file
  bytes, so the stored artifact's identity is provable against what the
  agent sent); note (optional).
- Size ceiling: 10 MB decoded, stated in the contract; larger returns
  `invalid_input` naming the ceiling.
- What happens to the file (cross-boundary, per section 5): tap-mcp
  does not write the business repo and holds no box access. It queues
  the submission as a record on the invocation seat it already uses:
  an ARTWORK PENDING record written through the business-side endpoint
  named in section 5.3 (the queued-record route: a KV record the
  existing box machinery drains), carrying the file bytes in the MCP
  server's own submission store (its MCP_KEYS sibling namespace,
  MCP_ARTWORK, new in the MCP repo; bytes are not business-repo data)
  plus the sha256 and order reference. The drain lands the file in the
  order's artwork home on the business side and records the submission
  on the CRM row's note trail through adoption machinery, where the
  artwork pipeline and Ryan's approval gate take it from there. The
  submission is an intake, not a publish: nothing about it builds a
  proof, moves a pin, or implies approval.
- Outputs: {received: true, artworkRef (the submission reference every
  later step uses), displayUrl (a client-displayable rendering of the
  submitted file: the MCP serves the stored bytes back over HTTPS at a
  capability URL, and for vector or PDF submissions also a PNG render
  reference where the runtime can produce one; the recap contract in
  section 2.11 depends on this), sha256 (as stored, echoing
  the comparison), validation: {level, findings}} where level and
  findings carry the permissive validation policy below.
- Benefits block (contract element, Ryan): the output ALSO carries
  `benefits`, the standing differentiators the client presents to the
  person immediately after the design step (section 2.11, step 1b):
  works with any platform; no subscription fees; durable
  waterproof PVC with a locked NTAG213 chip; custom branding from 100
  discs; free shipping. The block's facts are the llms.txt and
  for-agents fact set, worded consistently with them, and the same
  object is carried in get_discovery's capabilities so the wording
  exists in exactly one shape.
- Failure modes: `forbidden` (an orderRef that is not the key's
  organization's, when a key is presented);
  `invalid_input` (missing file, hash mismatch between contentBase64
  and the supplied sha256, over ceiling); `conflict` (a second
  submission for the same orderRef with a different hash returns the
  first submission's reference and names the difference; replacing
  artwork is a new submission only when the first is marked superseded
  by the business side, never by agent overwrite).

VALIDATION POLICY (Ryan's ruling, 2026-11-06, closing the previously
open strictness item): accept by default. The submission is NOT
validated to production standard at intake. It accepts essentially any
file format an agent sends, provided it passes three sanity checks, and
is rejected only on those grounds:

1. Not malicious. Type and content screening, grounded in the checks
   the machinery already runs in worker/tap-autoreply/src/logo-lookup.ts
   and the design-store upload path:
   - The declared media type and the file's magic bytes must agree on
     an image or vector type (the sniff discipline in logo-lookup.ts:
     PNG by IHDR, JPEG by SOI magic bytes, WebP by RIFF/WEBP header).
     Executable and archive signatures (PE, ELF, ZIP, and their kin)
     are refused whatever the declared type says; a file whose bytes
     are not the image it claims to be is refused as masquerading.
   - SVG, when submitted, must pass the standing `isSvgSafe` denylist
     scan (logo-lookup.ts): no <script>, no on*= event handlers, no
     javascript: URLs, no <foreignObject>, <iframe>, <embed>, or
     <object>, no data:text/html. Note the boundary honestly: fetched
     logo candidates reject SVG outright in that module because those
     bytes are re-hosted unreviewed; an MCP submission is stored, not
     re-hosted, and meets human eyes in the proof flow, so the denylist
     scan is the proportionate check here, and the stored file is never
     served from a tap.giving origin by the MCP.
   - PDF, when submitted (AI or vector PDF is an accepted artwork
     format per the disc product spec), must carry a %PDF header and no
     embedded JavaScript marker (/JavaScript or /JS keys), the same
     masquerade logic applied to a document container.
2. Not overly large. Cap: 5 MB decoded, the estate's standing image
   ceiling (LOGO_MAX_BYTES = 5 * 1024 * 1024 in tap-autoreply's upload
   handler, mirrored in logo-lookup.ts's MAX_BYTES; the design-image
   path's tighter 2 MB cap governs its own smaller artifacts and is not
   the artwork door). An empty file is refused (the upload path's own
   first check). Over the cap returns `invalid_input` naming 5 MB.
   This paragraph sets the contract's stated cap at 5 MB; it supersedes
   the 10 MB figure in the inputs list above, which was this spec's
   first estimate and is corrected here rather than left divergent.
3. Actually a real image. The bytes must decode or parse as the type
   they claim, at the standard the Workers runtime supports and the
   logo path already applies: a PNG whose IHDR header cannot be read
   is undecodable and refused (logo-lookup.ts treats an unreadable PNG
   header as failing, conservatively); JPEG and WebP pass on magic
   bytes with dimensions read best-effort; SVG must parse as XML with
   an <svg> root; PDF must carry its header and a readable page
   structure marker. Full raster decode is not available in the Workers
   runtime and is not promised; the box pipeline decodes for real when
   the file reaches it, which is the later judgment below.

Anything that looks like a real image inside those bounds is accepted.
We do not reject for format preference: a decodable PNG of the artwork
is accepted even though SVG is preferred, and the result says so
(formatNote: "accepted; vector preferred for production") without
refusing.

THE BOUNDARY LINE, plainly: production fitness is judged later, in the
normal proof flow (the artwork pipeline, artwork/_audit.py's geometry
gates, Gate A, and Ryan's approval gate), not at the MCP door. Intake
rejection happens only on the three sanity grounds above. The
submit_artwork result reports validation: {policy: "permissive",
checks: {notMalicious, sizeOk, decodable}, findings} so the record
shows exactly what was and was not checked, and no reader can mistake
"accepted" for "production-ready".

What is NOT open: no validation level makes a submission approved
artwork. Approval stays Gate 1 (section 4) at every level.

### 2.7 Tool: request_invoice (v1, write, key required)

In Ryan's flow this is the second half of the LOCK-IN exit: create_order
creates the order, request_invoice returns its payment handoff. The two
are separate calls (an order can exist before anyone decides to invoice
it, and the invoice for an existing order is re-requestable), but the
tool descriptions present them as one motion so an agent does not strand
an order uninvoiced.

Purpose: produce the artifact the agent's human actually needs: a real,
finalized Stripe hosted invoice and its link, for an order created by
create_order (or, phase 2, for a website order), returned to the agent
for handoff to a human who pays. This server moves no money itself: it
returns a hosted invoice link for a person to pay.

Payment wording rule (binding on every tool contract and on the server
description): no tool name, tool description, parameter name, or
server wording may state or imply that the server takes payment,
charges, checks out, or purchases. The server's verbs are returns,
mints (an invoice), and hands off (a link). The recap exit label "pay
now" names the PERSON's action, taken on Stripe's hosted page through
the returned link; the exit metadata value records the person's chosen
exit, not a server payment action. This wording was audited across the
spec at the final addendum pass; the one surviving "checkout" phrasing
is in negations (the server creates no Checkout session) and in
machinery names that already exist (the checkout-stage records),
neither of which attributes a payment action to the server.

Inputs:
- orderRef: string, required (from create_order).
- idempotencyKey: string, required (per invoice request; retries return
  the same invoice, never a second one).

Outputs:
- invoiceId, invoiceNumber (Stripe), status ("open" after finalize).
- hostedInvoiceUrl: the pay link.
- handoffLine: the exact line for the human-facing message, spelled out
  per the standing email rule: "Review your invoice: <full hosted URL>",
  a clickable text link, no dollar total in the accompanying body. The
  tool returns the line ready to paste because the pattern is Ryan's
  standard (INVOICE-PLAYBOOK.md, 2026-11-01) and an agent improvising its
  own wording is how the pattern drifts.
- totalCents and currency: returned as structured data for the agent's
  own records, with the explicit note that totals do not go in the
  human-facing body (the invoice itself carries the money).

Machinery (cross-boundary, per sections 5 and 8; this contract was
reworked under Ryan's own-repo decision: an earlier draft imported
tap-mail's invoice module as shared code, which the repo boundary
forbids, and the change is recorded here rather than assumed away):
tap-mcp mints directly against the Stripe API, replicating the
behavior contract of worker/tap-mail/src/invoice.ts
`createDraftInvoiceForApproval` (the name is historical; it creates AND
finalizes with auto_advance=false, collection_method send_invoice,
days_until_due 7, tax_exempt customer reuse by email, WELCOME10 coupon
when discount-eligible, the $0 free-shipping line), with metadata
design_approved_auto kept OFF for MCP invoices and replaced by
{mcp_order: "true", mcp_order_ref}. Why a second mint implementation is
acceptable here and nowhere else: the mint is a Stripe API call shape,
not business logic; the money it can charge is bounded by the quote the
business side computed (section 5.2's divergence guard runs on the
acceptance path), and the business repo's INVOICE-PLAYBOOK remains the
contract both implementations are checked against. Two of the approval
flow's guards are deliberately NOT inherited, and the spec names them:
(a) the alreadyPaid and approval-context preconditions are approval-flow
shaped and are replaced by the orderRef and key checks; (b) the
duplicate-open-invoice skip becomes a return, not a silent null: if the
customer already has an open or draft invoice, request_invoice returns
that invoice's link with status flagged `existing`, because an agent
needs the link, not a log line. What IS inherited unchanged: never
auto_advance=true, never send_invoice as a verb (finalize only, Stripe
emails nothing), the go.tap.giving URL never appears on the invoice
(memo and line items follow the playbook's builders' contract), and the
anti-metal line stays discountable=false at $1 per shielded disc when
the order carries a known anti-metal count (unknown count mints without
the line, exactly as the invoice door treats unasked, and the result
flags `antiMetal: "unknown"` so the human gate sees it).

Payment handoff reconciliation (Marketing): Marketing's "payment handoff
returning a hosted checkout URL" is this tool. The handoff is the hosted
invoice link; there is no checkout-session tool and no agent payment
tool, per the gates in section 4. The invoice door is also the
evidence-backed door for churches (invoice-request.ts's header: the
designer is frequently not the person who can pay, and a 24h checkout
session cannot survive a treasurer or a board; 10 of 13 lifetime orders
at that writing were invoices).

Failure modes: `not_found` (orderRef unknown or belongs to another
organization: reported as not_found, never as another org's data);
`conflict` (order already paid, checked against ORDERS KV's
CHECKOUT-DONE:<email> signal the same way tap-mail checks it);
`stripe_unavailable` (Stripe call failed; nothing minted, safe to retry
with the same idempotencyKey; Stripe-side idempotency keys are derived
from orderRef exactly as invoice.ts derives its cf- keys).

### 2.8 Tool: get_order_status (v1, read, key required)

Purpose: where an order stands, from the records fulfillment reads.

Inputs: orderRef (from create_order) or invoiceId.

Outputs:
- stage: the CRM stage from adoption and the row's current status
  (CRM/deals.csv status vocabulary: new, contacted, quoted, ready,
  negotiating, won, lost), once adopted.
- fulfillment: the accounting/orders/_status.json status for the paid
  order (queued, production, shipped, delivered, void) with tracking
  and carrier when present.
- invoice: {status, hostedInvoiceUrl} so a status check can re-serve the
  pay link to a human who lost it.
- design: in v1, {state: "not-attached"} or the designId when the order
  record carries one; proof state joins in v1.1.

Machinery: reads, in order, the INVREQ record in ORDERS KV (pre-adoption
truth), the CRM row via the repo's committed records (tap-mcp reads the
same GitHub Contents API seats tap-order's manifest.ts and order-status.ts
already use for accounting/orders/_manifest.json and _status.json), and
Stripe invoice state through the shared invoice module's read path.
No status is computed by the MCP that the machinery does not already
record; the tool translates, it does not invent.

Failure modes: unknown reference returns `not_found`; an order not yet
adopted returns stage "received" with the adoption expectation, not an
error, because hourly adoption lag is the machinery's normal state.

### 2.9 Error shape (all tools)

Every tool error returns MCP's standard error content plus a structured
object: {code, message, retryable, details}. Codes: `unauthorized`,
`forbidden`, `invalid_input`, `manual_exception`, `not_found`,
`conflict`, `stripe_unavailable`, `rate_limited`, `internal`. Messages
are written for an agent reader: what failed, which input, what to do
instead (for manual_exception, the human route; for conflict, which
fields differ). No error ever returns another organization's data, a
stack trace, or a secret.

### 2.9.1 Webhooks: proof_ready and shipped (contracts in v1, delivery v1.1)

Agents learn state changes by subscription, not polling.
- Events: `proof_ready` (the order's final proof has been sent to the
  customer's email and awaits the human approval gate) and `shipped`
  (the order's status record reads shipped).
- Payload (JSON POST to the subscription's callbackUrl):
  {event, orderRef, orgSlug, occurredAt (ISO 8601, business-side state
  time where known), status, detail: for proof_ready {proofByEmailTo},
  for shipped {carrier, trackingNumber} where the status record carries
  them, omitted otherwise}. Headers: X-TapGiving-Event (the event name),
  X-TapGiving-Signature (hex HMAC SHA-256 of the raw body with the
  subscription's secret; the secret is shown once at registration).
- Registration surface (v1, in today's build): tool `register_webhook`
  (write, key required). Inputs: callbackUrl (https required), events
  (array, subset of the two). One active subscription per organization
  in v1; re-registering replaces it. Stored in the MCP_KEYS namespace
  under WEBHOOK:<orgSlug>. No key, no registration: a webhook is a write
  against the organization's own record only.
- Delivery: PHASED to v1.1, named not dropped. The emitters live behind
  business-side state (proof publication and shipping state in the
  business machinery), so delivery needs one more invocation-seat arm
  or a status poller on tap-mcp's side; v1 ships the contracts and the
  registration surface so an agent can subscribe from day one, and
  v1.1 turns delivery on without a contract change. Until delivery
  lands, get_order_status remains the state read, and tool descriptions
  say delivery is pending rather than implying live push.

### 2.11 The v1 journey, in Ryan's order (binding flow)

The tools above compose into one journey. This section is the contract
for the sequence itself; a client following it needs no other guidance.
It restates the draft's original ordering (tools listed by kind) into
Ryan's flow order; the reordering is substantive, because two contracts
below (mounting pictures, the recap) exist only inside a sequence.

Step 0, discovery and introduction (no key, no email, nothing asked):
the cold agent starts with get_discovery (section 2.2.1), presents the
introduction (the builder by name, the product explained plainly,
NTAG213, the standardized 4-inch size), and the person makes the FIRST
CHOICE: round or square. DESIGN COMES FIRST (Ryan's
reorder, superseding the earlier email-at-kickoff ordering): the agent
designs before anything is asked of its person, keyless and email-less.
An agent holding only an email may still enter through
start_order_intent (section 3.4) at any point, and the keyless read
tools are enterable anywhere; but the journey's designed order is
design first, asks later, because value shown before anything is asked
is the friction principle (section 2.12) applied to ordering.

Step 1, artwork first: get_artwork_spec for the chosen shape (no
key), whose examples the person reacts to ("do you like this design
or that design"); the client presents the optional logo ask; the agent
then designs with its own tools from the spec plus the chosen example
direction, and submit_artwork (NO key and NO email on the cold
path) returns an artworkRef and a displayUrl. Intake is the permissive
acceptance of section 2.6.

Step 1b, benefits block (contract element): immediately after the
design step, the client presents the benefits block carried in the
submit_artwork output (section 2.6): works with any platform,
no subscription fees, durable waterproof PVC with a locked NTAG213
chip, custom branding from 100 discs, free shipping. It sits here, and
not earlier, because the person has just seen their own design and the
block answers "why this product" at the moment the journey first asks
for anything.

Step 2, email capture, then order questions, through the MCP, in this
order. FIRST in this step, the contact email is captured (the journey's
first ask): through start_order_intent's capture semantics (section
3.4, the /api/lead capture record, source "mcp:intent"), which is what
makes the dropout follow-up in step 5 real from this point onward. The
order questions follow. The question
set is a contract: tool `get_order_questions` (v1, read, key required
so the answers bind to the organization) returns the questions as
structured data in exactly this order, each with its input shape,
because an agent improvising the order or the wording is how the
standing framings get lost:
  1. quantity: "How many tap discs?" (integer, get_quote bounds).
  2. mounting: "How should we mount them?" with the two options as
     PICTURES, the same images the current order flow uses:
     https://tap.giving/assets/mount-adhesive.webp (660 x 453; the back
     of a disc showing its full-circle 3M adhesive backing; option text
     "Non-destructive 3M adhesive: peel and stick onto the pew or the
     back of a chair. No drilling.") and
     https://tap.giving/assets/mount-screws.webp (750 x 515; a disc
     with two pre-drilled screw holes; option text "Pre-drilled holes
     for screws + Adhesive Backing: two side holes, plus the adhesive
     backing. Screws not included."). Source: website/finalize.html's
     mount grid, the live order flow's mounting step (the .webp files
     are the linkable originals; the space-named .jpeg originals must
     NOT be linked, per the flow's own comment). Image contract: a tool
     that returns an image for display returns MCP image content (the
     protocol's image content type, base64 data plus media type) for
     locally held images, and a displayUrl for hosted ones; for these
     two, the hosted tap.giving URLs ARE the contract (stable,
     published assets), and get_order_questions returns them as
     imageUrl fields beside each option so any client can render them,
     with the option text as the accessible label. An agent in a
     text-only client falls back to the option text verbatim.
  3. link destination: asked as OPTIONAL, with the note carried in the
     question object verbatim in substance: "Where should a tap send
     people? Optional: you can leave this blank and change it anytime;
     your discs ship ready to re-point from your free Redirect
     Dashboard." Standing rule behind the framing: a giving URL is
     never required, never gates production or shipping, and the
     Redirect Dashboard is the default.
  4. shipping address: the shipTo object of create_order, phone
     included, asked last because it is the step a human most often has
     to go and get.

Step 3, full recap (contract element, not a nicety). Tool:
`get_recap` (v1, read, key required). Inputs: artworkRef, the step 2
answers. Output, in display order: the submitted artwork, returned as
the displayUrl from submit_artwork plus MCP image content where the
client can render it, so the person SEES the artwork they created;
below it, the quantity; the shipping address as entered; and the cost,
the full get_quote object for the order as configured (exact total, not
an estimate restated). The recap is the last thing before the exits and
the contract forbids a lock-in call whose session has not produced a
recap for the identical inputs: create_order carries recapRef, the
reference get_recap returned for those inputs, and a recap whose inputs
differ from the order's returns `conflict` naming the drift. What a
person approved on screen and what the order records are then the same
object by construction.

Recap notes (REQUIRED recap fields, Ryan, verbatim in substance; the
get_recap output carries both in a `notes` array and a client must show
them on the recap itself, not behind a link):
  1. "Shipping usually takes two to three weeks."
  2. "We email you a final proof before anything is printed."
     Meaning stated with it: production never starts on the
     agent-submitted artwork alone; the emailed final proof is approved
     by a person first, and the human proof approval gate (section 4,
     Gate 1) stands exactly as it does for website orders.

Step 4, two exits, the person picks one, PRESENTED IN THIS ORDER
(Ryan's final addendum, superseding the earlier co-equal mapping):
  - PRIMARY EXIT, presented first, the default path: "Pay now" via
    Stripe. The agent calls create_order (section 2.5) and then
    request_invoice (section 2.7) as one motion; request_invoice
    returns the hosted invoice link, which is presented to the person
    immediately so they pay on Stripe's hosted page. The hosted link
    goes to the person; the agent never executes a payment, holds no
    payment instrument, and the payment gate (section 4, Gate 2) stands.
  - SECOND EXIT: "I want to lock in this price" (the quote/invoice
    path). The agent calls the same create_order, then request_invoice,
    and the hosted invoice link is returned as the payment handoff for
    the person to pay when they choose, rather than presented for
    immediate payment.
  How the two differ, honestly against the machinery: THEY DO NOT
  differ in record shape. An invoice exists for both. Each exit writes
  the same INVREQ-shaped order record through the same writer path and
  mints the same finalized Stripe invoice object; pay now IS lock-in
  plus immediate hosted payment presentation. What lock-in writes and
  holds: the finalized invoice itself holds the price (its total is the
  recap's exact total, and a finalized invoice's amount does not move),
  with the first-order discount applied per the standing rules (the
  10 percent WELCOME10 discount; its displayed 7-day window is a label
  on the offer, and the price protection the person is promised is the
  finalized invoice's total, not a re-quote later). The only recorded
  difference between the exits is intent: create_order's note field and
  the invoice's metadata carry exit: "pay_now" or "lock_in", so
  downstream reporting can tell which door the person chose without
  the records diverging in shape.
  DROPPED, in full: the email-the-quote exit. There is no email_quote
  tool in v1 or in any later phase list in this spec, and no quote
  email is sent by any MCP path. (An earlier draft carried one; Ryan
  dropped it, and the contract is removed, not parked.)

Step 5, dropout follow-up (contract, Ryan, restated for the reorder):
if the person drops out anywhere AT OR AFTER the first capture point
(step 2's email capture), as long as we hold their email, we follow up,
and the follow-up rides the EXISTING lead machinery, not a new silo.
Dropout BEFORE capture (during discovery, design, or the benefits
block) leaves nothing to follow up: no email exists, the unbound
artwork submission expires with its TTL, and the spec says so plainly
rather than pretending a follow-up exists.
- What an abandoned MCP session leaves behind: the capture record
  written at step 2 by start_order_intent (a LEADS KV capture record
  written by captureLeadRecord through POST /api/lead, source
  "mcp:intent", keyed by the full contact email, exactly as a website
  capture is), plus the step events the journey's later public calls
  already write (STEPCAP-shaped records for design or checkout steps
  reached), and, on a keyed journey, the submit_artwork pending record
  if artwork was submitted (section 5.3). Nothing else is written for
  follow-up purposes; tap-mcp keeps no abandonment list of its own.
- Which machinery picks it up: the same machinery that picks up a
  website capture. The capture record enters the first-response lane's
  world under its standing rules (identity checks, the first-response
  ledger, HELDFIRST holds, exactly one first email per genuinely new
  lead, sent by the lane that owns first response, never by tap-mcp),
  the sequence machinery under its standing rules, and the step-capture
  consumer and starved-funnel watch on their existing schedules. The
  MCP's whole obligation is the capture-point rule: the email is
  captured at the first ask, the moment the session moves into order
  setup, and never deferred past it.

Blocker check on this flow, per Ryan's instruction to surface fights
rather than reshape silently: (a) the invoice seat mints only inside
the approval flow today; the flow does not need that seat, because
request_invoice mints directly against Stripe under the playbook
contract (section 2.7), so no fight. (b) The earlier draft's second
exit needed a quote-email seat that does not exist; Ryan's final
addendum dropped that exit entirely, so the gap is moot and no such
seat is built. Neither item required reshaping Ryan's flow as finally
ruled; both are recorded here so the builder meets them as named facts,
not surprises.

### 2.10 Later phases, named (not silent drops)

- v1.1: the designer-side seats the ruled design shape does not need:
  a DESIGN-record bridge for agents that also use the website designer,
  proof state on get_order_status once submissions flow through the
  pipeline, and the intake geometry gates if a future ruling ever
  raises validation above the permissive policy. Design itself is v1 (section 2.6).
- Phase 2: create_lead as a standalone first-touch tool; stands and
  badges as orderable products (their own quoteFor extension, since
  quoteFor has no stands seat today); site and FAQ search tool; invoice
  requests against website-originated orders by reference.
- Phase 3: Redirect Dashboard reads for the organization (destinations,
  click totals) through the same key; these ride the openshortlink
  estate, a separate repo, and are scoped when v1.1 lands.

### 2.12 Minimum-friction design: fewest legitimate permission prompts

Ordering principle (Ryan's framing, the principle this section hangs
from): start the process with the fewest possible prompts and nothing
that trips an agent's risk heuristics, because permissions can always
be asked for later once we hold basic contact info through email or the
website. In this spec's terms: the cold, keyless start is the DEFAULT
path; every escalation (key, contact details, payment) happens after
value has been shown and rides the email and website relationship we
already operate. Nothing in the early flow may look risky to a client
agent: no installs, no downloads of executables, no broad or vague
scopes, no tool names or descriptions that read as destructive. The
journey in section 2.11 is ordered by this principle (nothing asked
until a design exists; email captured at order setup, the first ask;
a key only at the order write that needs it; payment outside the MCP
entirely), and the six requirements below are design requirements the
build is held to, legitimately, never by evasion:

1. REMOTE-ONLY: hosted Streamable HTTP on Cloudflare. No local install,
   no stdio or npx package, no filesystem or shell access requested,
   ever. An agent connects to a URL and nothing touches the user's
   machine.
2. UNAUTHENTICATED READ SIDE: discovery (get_discovery), pricing,
   the artwork spec, and quote work cold with no key and no auth
   challenge (sections 2.2.1, 2.3, 2.6).
3. ONE CREDENTIAL FOR WRITES: a single per-organization API key in one
   header (section 2.1). No OAuth consent flows, no per-tool scopes;
   the key record's single v1 scope is `orders` (section 3.1).
4. SMALL, CLEARLY-NAMED TOOL SURFACE: the tools are few and grouped so
   the read tools are obviously read-only in their MCP annotations
   (readOnlyHint true, and the sibling annotations, destructiveHint,
   idempotentHint, openWorldHint, set correctly and honestly on every
   tool) and the consequential writes are few and plainly described.
   Client permission behavior keys off these annotations; they must be
   truthful, never gamed. A write tool never carries a read-only hint,
   and a read tool never performs a write to earn a quieter prompt.
5. FEW ROUND TRIPS BY DESIGN: discovery in one call (get_discovery),
   quote in one call (get_quote), recap-complete order creation in one
   call with idempotency (create_order carrying recapRef and
   idempotencyKey, section 2.5), so retries do not stack prompts.
6. PAYMENT AND APPROVAL STAY OUTSIDE THE MCP: payment happens on
   Stripe's hosted page and proof approval by email (section 4), which
   keeps this server out of every client's highest-friction category
   by construction.

Which prompts REMAIN, and whose they are: the client's own
confirmation prompt on a consequential write (create_order,
request_invoice, submit_artwork, register_webhook) is the CLIENT's UX,
presented by the client to its user under the client's own policy; it
is not ours to engineer around, suppress, or disguise, and this design
does not try. Predicted prompt count for the full journey in a standard
client: zero prompts for the entire cold leg (discovery, design,
artwork submission, benefits), and at
most one client confirmation per consequential write call actually
made. Acceptance requirement (added to section 9.4): the real-client
acceptance run RECORDS the number and kind of permission prompts
encountered across the full journey and reports them against this
section's prediction, as a measured v1 quality bar.

## 3. Identity and auth model

### 3.1 Server identity: NFC Tap Builder by Tap.Giving

The MCP presents as a builder, in the vocabulary people actually use.
- Server and display name (the name the build ships, binding):
  "NFC Tap Builder by Tap.Giving". It is the serverInfo name and title
  in the initialize response, the heading of the endpoint's GET
  self-description (section 6), the README heading in the public repo,
  and the name used in directory submissions and on the for-agents and
  llms surfaces. The repo name itself (tap-giving-mcp) does not change;
  this is the presentation name. (It replaces the bare "Tap.Giving MCP"
  working name used in early drafts of this spec.)
- Server description (shipped with the name, in the initialize
  metadata, the GET page, and the README): "Build and order custom NFC
  tap discs and tap tags for organizations of every kind: built for
  churches, nonprofits, restaurants, coffee shops, and local businesses, designed by your own agent, priced from the
  published tiers, ordered up to the human payment and proof gates."
  The synonym set is contractual, so differently worded agent requests
  still match: tap discs, tap plates, tap tags, NFC tap discs.
  The description also carries, verbatim, the no-money sentence the
  directory rules require (below): "This server moves no money itself:
  it returns a hosted invoice link for a person to pay." Anthropic's
  connector rules bar connectors that transfer money; this server is
  compliant by design (it never takes payment), and the sentence is in
  the copy, in the server description and in the payment handoff tool's
  contract, not only in the principle.

### 3.1.1 The key

One API key per organization, issued by Tap.Giving (Ryan or the CEO lane,
through the issuance tooling in section 9; v1 issuance is a wrangler KV
write from the box, scripted as tools in the MCP repo, not a self-serve
signup). The key represents the organization, not the agent and not the
individual operating the agent. Everything done with the key is
attributed to the organization in the records it writes, and the key's
record carries the issuing context (issuedTo email, issuedBy, issuedAt)
so an action can be traced to an issuance, never to a person the key was
never issued to.

Key record (MCP_KEYS namespace in the tap-mcp repo's Worker, the only
place this state lives; the business repo holds no key material):
- keyHash: SHA-256 of the full key (lookup key; plaintext never stored).
- orgSlug: the CRM slug the organization resolves to.
- orgName, contactEmail: as issued.
- mode: "live" or "test" (section 3.3).
- scopes: v1 keys carry one scope, `orders`, covering create_order,
  request_invoice, and get_order_status for the key's own organization.
  Scopes exist in the record from day one so a later read-only or
  design-scope key is an issuance choice, not a redesign.
- status: active, revoked (with revokedAt and reason).
- createdAt, lastUsedAt (best-effort, updated on write calls).

Storage rule for a public-repo world (the MCP repo is public, section
9.1): no key, hash, or customer record ever lives in either git tree.
Keys live only in Cloudflare KV (hashes) and in Ryan's hands at issuance
(plaintext, shown once). The test organization's material follows the
same rule: test keys are issued the same way, against the test seat, and
the acceptance script takes its key from an environment variable, never
from a file in either repo.

### 3.2 What a key may do, and may never do

May: call create_order, request_invoice, and get_order_status for its
own organization; call start_order_intent for its own contact email;
call the open read tools like anyone else.

May never, by construction (the server exposes no tool for these, which
is the enforcement, not a policy sentence): pay an invoice or hold a
payment instrument; approve a design or mark anything approved; release
an order to production or trigger a ZBTech handoff; read or write
another organization's records (every write and status read is bound to
the key's orgSlug and contactEmail, checked on each call); mint an
invoice for an order it did not create (request_invoice takes only
orderRefs the key's organization created); rotate or revoke its own key
(issuance is ours, so a compromised agent cannot lock the organization
out of its own account by rotating).

### 3.3 Modes: how one server serves production and test

The acceptance criterion requires a test run that touches no real
customer, and forbids a test-only server. Resolution: mode is a property
of the KEY, not of the deployment. One tap-mcp deployment serves both.

- A `tg_test_` key binds the session to the test seat: create_order
  writes its request record to the DEV lane (the tap-order-dev Worker's
  DEV_ORDERS namespace semantics and Stripe TEST mode), request_invoice
  mints against Stripe test mode, and get_order_status reads the test
  records. The test organization's CRM evidence lands in the same shapes
  (INVREQ record, adoption into a CRM row) exercised against the test
  lane's records, never a production row for a fake church.
- A `tg_live_` key binds to production: ORDERS KV production records,
  Stripe live mode, production CRM adoption.
- The server refuses to mix: a test key's orderRef is meaningless to a
  live call and returns not_found. The Stripe secret for each mode is a
  separate wrangler secret on tap-mcp (STRIPE_API_KEY_LIVE,
  STRIPE_API_KEY_TEST), selected by key mode; neither is ever in a repo.
- Lane-constraint note (from the commission): the natural home for the
  acceptance run is the existing test lane (tap-order-dev, Stripe TEST
  mode, LIVE_KEY_REFUSED guard in its code). The MCP acceptance run uses
  that lane's Stripe test seat and DEV_ORDERS-shaped records rather than
  inventing a second test world; the justification for the one deviation
  (records are written by tap-mcp's own test binding rather than by
  tap-order-dev's handlers) is that the acceptance criterion is about the
  MCP server's behavior, and the records it writes are byte-shaped like
  the lane's own (section 5), so downstream evidence reads the same.

### 3.4 Cold first contact and the kickoff: start_order_intent (v1)

Ryan's minimum bar: a cold agent, holding nothing, can at least say "I
want a tap disc" and kick the process off from inside its own window.
Marketing's condition lands in the same place: an agent holding only an
email address needs the Door A equivalent, email-first capture, because
the agent path must not be narrower than the human one.

Tool: `start_order_intent`. V1, because it fits on the existing capture
endpoint's back and forces no new machinery (the honest-phasing test the
Marketing condition sets).

- Key: none required. This is the one unauthenticated write, and it is
  deliberately the same write a browser makes.
- Inputs: email (required); organization name (optional); quantityHint
  (optional); sourceNote (optional).
- What it does: tap-mcp POSTs to the SAME public capture endpoint the
  website's email-first door uses, POST /api/lead on tap-autoreply, with
  source "mcp:intent", so the capture record is written by
  captureLeadRecord, the one capture core, with the website's own
  identity and dedupe semantics: one capture record per submission in
  LEADS KV, downstream first-response identity checks, ledger, and hold
  machinery exactly as for hero:index or popup:index captures. The MCP
  adds no capture logic of its own.
- Honesty clause (capture definition, standing): /api/lead's bot check
  is the honeypot plus render-timing check the endpoint itself performs
  (Turnstile was removed 2026-10-28). An MCP server is a server, not a
  browser; it supplies the fields the check requires truthfully where it
  can and the call is subject to the same per-IP rate limits the endpoint
  applies. If live testing shows the timing check rejecting server-side
  calls wholesale, the fallback is named now: tap-autoreply gains one
  small route variant for server-originated captures carrying an
  MCP-INTENT shared-secret header (a business-repo deliverable, SMALL,
  section 9), never a weakening of the public endpoint's check for
  everyone else. This is a risk item with a named fallback, not a
  blocker: the capture path exists either way.
- Position in the journey (Ryan's reorder): in the designed flow this
  tool fires at step 2's head, the first ask, when the session moves
  into order setup; it is no longer the journey's opening move, because
  design now comes first. Standalone use by an email-only agent remains
  supported at any point.
- What it promises: nothing beyond capture. The result returns
  {captured: true, nextStep} where nextStep tells the agent, in plain
  words, that a person at Tap.Giving now has the contact, and that
  completing an order needs an organization API key (how a human gets
  one: by asking Ryan at ryan@tap.giving, until a later phase makes
  issuance self-serve). An intent is a lead, with a lead's semantics:
  it is not an order, creates no invoice, and reserves nothing.
- Abuse shape: an unauthenticated email capture is exactly the surface
  the website already exposes publicly; the MCP adds no new class of
  abuse, only a new client. Rate limit at tap-mcp (per-IP, KV-counter)
  mirrors the endpoint's own limits.

### 3.5 Rotation and revocation

Rotation: issue a new key for the organization, mark the old key
revoked with reason "rotated" once the new key has made a successful
call. Two active keys per organization are permitted during a rotation
window only. Revocation: a single KV status write, effective on the
next call (keys are looked up per call, never cached beyond the
request). Lost-key posture: a leaked key can create orders and mint
invoices for its own organization only; it cannot pay, cannot approve,
and cannot see other organizations, so the blast radius is nuisance
orders against one CRM record, visible in the same adoption pass that
makes them real, and revocable in one write.

### 3.6 Binding to CRM and the Redirect Dashboard

The key's orgSlug is the CRM slug: the same slug crm.py resolves, the
same slug adoption writes under, the same slug the Redirect Dashboard
account is keyed by in the openshortlink estate. One organization, one
slug, three surfaces. The MCP never creates a second identity for an
organization that already has a CRM row: issuance checks the CRM first
(the issuance script reads deals.csv through the writer clone) and
refuses to issue a second key identity for an email that canon_email
already resolves to another slug.

### 3.7 Distribution surfaces and per-surface auth reality

Source: Marketing's directory research (2026-11-06; their full map
lands in the tap-giving repo's private MCP working directory). The
one-key model of sections 3.1 to 3.6 applies to DIRECT connections,
and the spec does not claim it covers portal-mediated connections:

- Direct MCP clients (an agent or its human configuring the endpoint
  URL and the organization's key in their own client): the full v1
  model. Reads open, writes keyed, exactly as specced.
- Claude Directory, the Official MCP Registry, Meta Muse, Glama, and
  community registries: per Marketing's research these take a remote
  server on its own terms; the listing points at the endpoint and the
  keyed model carries, because the connection is still a direct one
  the user's client makes.
- OpenAI's ChatGPT directory: NO API-key connection flow exists there;
  writes would need OAuth or OpenAI's "contact OpenAI" route. Portal
  position (Ryan, binding, stated plainly): for v1 the ChatGPT listing
  is a DISCOVERY SURFACE ONLY. The open read tools are what a ChatGPT
  user gets; no keyed writes run through that portal in v1.
- Google's Connected Apps Platform: documents OAuth-or-none, the same
  shape. Same position: discovery surface only in v1.

OAuth for portals is a NAMED v1.1 ITEM, with the reason: an OAuth
authorization surface (consent flow, token issuance and revocation
bound to organization records, a second credential lifecycle beside
the key) is a new auth system, and bolting it on today would break the
launch without changing anything for direct clients, who are v1's
served path. Any portal write support is a later phase with its own
auth shape, designed then, not improvised now. Directory copy on every
surface carries the no-money sentence of section 3.1, matching
Marketing's listing copy: the server hands off a hosted invoice link
and moves no money itself.

## 4. Human gates that stay human

The MCP shortens everything up to these gates and nothing around them.
The boundary below is the same line llms.txt and the for-agents guide
already publish ("anything that creates an order is a human decision
made on the order page" becomes, with the MCP: "an agent may set up and
invoice; a human approves artwork and pays"). Marketing confirms their
acceptance of this reading matches the published boundary exactly; the
spec and the published surface say one thing.

### Gate 1: design approval before production

The rule (standing): what goes to ZBTech is verified against the
approval email, the email Ryan sent that the customer approved; its
proof and order details are the reference. The MCP may: carry a design
(v1.1) and surface proof state. The MCP may never: record an approval,
expose an approve action, or let an order's state imply approval
happened. create_order and request_invoice are explicitly
approval-neutral: an invoice is a request for payment, not an artwork
approval, and the records say so (the INVREQ and CRM note shapes carry
no approval field, and v1 adds none).

### Gate 2: payment

The agent receives an invoice link; a person pays. The server never
accepts card details, never creates a Checkout session in v1, never
marks an invoice paid. Payment state is read from Stripe and the
webhook-written records only (tap-order's webhook writes the manifest
and _status.json rows on invoice.paid; the MCP reads those records, it
does not write payment truth of its own).

### Gate 3: the ZBTech handoff

Production release and the supplier handoff stay exactly where they are:
Ryan's paid-order approval email, the approval-recap standard, and the
packet machinery on the business side. No MCP tool touches fulfillment
state; get_order_status reads _status.json, it cannot advance it.

### What the gates mean for tool design, stated once

Every v1 write tool's output names the next human step in plain words
("a person pays this invoice", "artwork approval happens by email with
Ryan"), because an agent that does not know where its authority ends
will improvise past it. The tool descriptions themselves carry the gate
sentences, not just this spec, so a client that never reads the spec
still meets the boundary in tools/list.

## 5. Riding the existing machinery, across the repo boundary

Ryan's decision (2026-11-06): the MCP server lives in its own new repo,
RyanShook/tap-giving-mcp, PUBLIC, so its code is not tangled with the
business repo. The sharp edge of that decision, applied here: across the
boundary, everything is APIs and calls. No shared code imports (an
earlier draft of this spec imported shared/business-rules.ts and
tap-mail's invoice module into the server; both were reworked, and the
reworks are recorded in sections 2.2, 2.7, and 8). No direct writes to
the business repo from the MCP. No box-side file access from the MCP:
the box is not an API, and a public server reaching into a private box
is the tangle the decision exists to prevent.

### 5.1 The boundary, drawn

Tap-giving-mcp (public repo, Worker tap-mcp) may call:
- The Stripe API directly (its own wrangler secrets, section 9.3).
- The business side's PUBLIC endpoints, the same ones the website uses:
  POST /api/lead (tap-autoreply), POST /api/invoice-request
  (tap-order), GET surfaces for reads.
- The business side's authenticated invocation seat (section 5.3), new
  and small, for the two things no public endpoint does: writing a
  queued record the adoption machinery drains under an MCP identity,
  and invoking tap-mail's quote email.
- Public URLs for display assets (the mounting pictures, artwork
  display).

It may never: import business-repo code; hold a GitHub credential for
the business repo (its read of committed business records in
get_order_status goes through the seat in 5.3, not the Contents API, so
the MCP never carries a business-repo token at all; CHANGED from an
earlier draft that had tap-mcp reading _status.json through GitHub);
SSH or otherwise reach the box; write KV namespaces it does not own.

The price fact-set rule under this boundary (section 2.2 reworked):
prices come from a small versioned price contract the MCP implements
against documentation/INVOICE-PLAYBOOK.md and the llms.txt tiers, both
of which state the tiers identically ($5.00 / $4.00 / $3.50, minimum
100, anti-metal $1, discount 10 percent). Divergence is prevented by
the acceptance guard, not by hope: the acceptance run (section 9)
quotes the same carts through the MCP and through the website invoice
door and requires identical totals, and the agent-ready gate extension
(section 2.2) re-checks tier boundaries against llms.txt on every
business-repo verify. If the two ever disagree, the website machinery
is right and the MCP contract is the bug, and the gate says so.

### 5.2 The CRM writer path, treated explicitly (the honest seat map)

Requirement: an MCP order is indistinguishable downstream from a
website order and enters through the same writer-path semantics.

What exists today, read firsthand: the writer path is crm.py in the
writer clone, executed by box-side adopters. There is NO network-callable
seat into crm.py, and a Worker cannot run Python. The website's own
orders do not call crm.py either: they write KV records (tap-autoreply
capture records and STEPCAP events; tap-order INVREQ records) that
box-side consumers (crm.py --adopt, tools/step-capture, the three
adopt.py tools, all run hourly by tools/oracle/sync-from-main.sh)
resolve into CRM rows through the writer path, with its identity rules
(canon_email, not-new checks, parked-deal protection, slug collisions).

Route chosen for v1, and why: order setup rides the website's own
public seat, POST /api/invoice-request, so an MCP order enters as the
literal same record a website invoice-door order enters as, and is
adopted by the literal same code on the literal same schedule. There is
nothing to distinguish downstream because there is only one stream.
Two honest deltas and their handling:
- The public endpoint is unauthenticated by design; tap-mcp calls it
  with the MCP order's full payload plus its orderRef in the note
  field, and the idempotency the endpoint lacks is supplied by tap-mcp
  itself (section 2.5's MCP-side record: tap-mcp will not POST twice
  for one idempotencyKey, and adoption's INVREQDONE discipline covers
  the downstream half). No business-side change is needed for order
  setup in v1; that is what makes today's launch possible.
- Ship-to: the endpoint's lead payload carries the lead fields
  (types.ts OrderDraftRequest); the MCP's shipTo object rides in the
  request body in the same shape the /finalize client posts, and where
  a field has no seat in that shape it rides in the note until phase 2
  widens the shape. Named as a known seam, not hidden: the acceptance
  run verifies the adopted CRM row and dossier carry the ship-to and
  phone the MCP sent, and any field the shape drops is a build-day fix
  on the business side (a shape widening in invoice-request.ts,
  SMALL), discovered by the acceptance run, not by a customer.

So the writer path is honored by construction: the MCP is a client of
the same front door the website is, and the writer path never learns
the difference. If a future phase wants sub-hour CRM visibility, the
named route is a business-side invocation seat into the adoption step
(phase 2 candidate), never an MCP-side CRM write.

### 5.3 The invocation seat (business-side deliverable, named and sized)

One small business-repo deliverable rides today's build: an
authenticated endpoint for the two calls no public endpoint makes.
- Seat: tap-mail gains POST /api/mcp-invoke on its existing workers.dev
  surface, authenticated by an MCP_INVOKE_SECRET header (the same
  header-gate pattern as its existing /cancel endpoint's X-Cancel-Token),
  dispatching two operations: (a)
  recordArtworkSubmission, which writes the ARTWORKPENDING-shaped KV
  record the step-capture consumer pattern drains (the artwork bytes
  stay in tap-mcp's MCP_ARTWORK namespace; the record carries the
  reference, hash, and order identity, and the business-side drain
  fetches bytes over an authenticated GET on tap-mcp when it lands the
  file in the order's artwork home).
- Size: SMALL. One route, one header check, dispatch arms reusing
  existing modules (the STEPCAP record shape; tap-mail's record reads).
  Regression tests in tap-mail's suite, same landing discipline as any
  business Worker change.
- get_order_status's business-record reads ride this seat too, as a
  third arm, readOrderRecords, returning the CRM row and _status.json
  entry for the key's organization slug, read by tap-mail from the same
  KV and repo-mirror data its own machinery already reads. If that arm
  proves heavier than SMALL on build day, the named fallback ships
  today instead: get_order_status answers from the MCP's own records
  plus Stripe, and CRM-stage enrichment lands in v1.1. The fallback is
  pre-decided so the launch never waits on it.

### 5.4 What the MCP must never duplicate

Quote arithmetic beyond the price contract's tier table (the acceptance
guard owns divergence); CRM identity resolution (canon_email and the
not-new logic stay adoption's alone); email sending (tap-mail's seat);
proof building (the box pipeline); payment state (Stripe and the
webhook-written records). Each of these has exactly one home today and
the MCP's job is to be a well-behaved client of each.

### 5.5 Capture and identity rules for MCP-originated leads

start_order_intent captures ride captureLeadRecord through /api/lead
(section 3.4): same KV capture records, same first-response identity
checks (the ledger, the base-aware not-new matcher), same hold
machinery. An MCP capture is source "mcp:intent", a new source string
in the existing vocabulary (hero:index, popup:index, pricing:index are
its siblings), so every downstream report can tell the door apart
without treating it differently. That capture record is also the
dropout handoff (section 2.11, step 5): follow-up for an abandoned MCP
journey is the first-response and sequence machinery acting on these
same capture and step records, never an MCP-side sender. No MCP path writes a CRM row
directly; every MCP-originated identity reaches the CRM through the
same adopters as a website identity, which is the whole point.

## 6. Agent-readable website companion

Scoped by the assumption test: discovery is content's job, and an MCP
does not move it. This section is therefore only about completion for
agents WITHOUT an MCP client, and about publishing the MCP itself.

What exists today (checked, not assumed): llms.txt and llms-full.txt
(tier-exact, with a "For Agents and Developers" section), for-agents.html
and for-agents.md (when to use us, when not to, the resource index, a
JSON-LD block, "how to get an exact price" pointing at /order),
pricing.html with four JSON-LD blocks, Product JSON-LD on index.html
carrying the $3.50 to $5.00 range, and the tools/agent-ready gate
guarding the set. A browser-only agent today can discover, price from
text, and complete an order through the human order flow, with the
degradations section 1 names (session state, upload, no invoice link in
hand). Those degradations are the MCP's reason to exist; the website
companion does not pretend to fix them with markup.

Today's launch deliverables on this surface (Marketing-owned copy,
Engineering-sized SMALL, in the build runbook):
- Publish the MCP under its presentation name, "NFC Tap Builder by
  Tap.Giving" (section 3.1): for-agents.html gains an MCP section (endpoint
  https://tap.giving/mcp, the tool list in one line each, the key
  model in two sentences, the gates in one), and llms.txt's "For Agents
  and Developers" section gains the endpoint and the same summary. The
  two published sentences that today say "there is no public write API"
  (website/for-agents.html, website/llms.txt) are updated to the true
  statement: a public MCP with keyed writes now exists, and the human
  gates are unchanged. Publishing a write API while the guide denies
  one would split the fact set the spec exists to keep single.
- The MCP server itself answers a plain GET on its endpoint with a
  human-and-agent readable description (name, endpoint, tools, auth,
  gates, repo link), so the endpoint is self-describing to anything
  that lands on it, client or crawler.

Named for later phases, not today: the UnitPriceSpecification schema
item from Marketing's plan (per-tier eligibleQuantity entries on the
money pages' Product blocks) is logged in their plan as
Marketing-spec/Engineering-implement, independent of the MCP; it is
cross-referenced here and deliberately NOT in today's build plan.
MCP registry and directory listings are section 10's Ryan-action
review: none is required for launch, and any listing needing Ryan's
account is named there rather than bundled into today.

## 7. Phases beyond today

- v1.1: Mint consolidation: single implementation via the tap-mail invocation seat arm (v1.1, CEO ruling 2026-11-06), retiring tap-mcp's direct mint.
- v1.1: the automated price-divergence gate (the agent-ready gate extension of section 2.2).

- v1.1: OAuth for portal-mediated writes (ChatGPT and Google portals;
  section 3.7 gives the reason it is not in v1); webhook delivery for proof_ready and shipped (contracts and
  registration in v1, section 2.9.1); the agent-ready gate extension
  (section 9.5); designer's DESIGN-record bridge and proof state on
  get_order_status (section 2.10); create_lead standalone if the intent
  tool proves too thin in real use; CRM-stage enrichment of status if
  the 5.3 fallback shipped.
- Phase 2: stands and badges as orderable products; site and FAQ search
  tool; the UnitPriceSpecification schema landing; sub-hour adoption
  seat if order latency earns it.
- Phase 3: Redirect Dashboard reads through the same key (openshortlink
  estate).

## 8. Decisions taken as defaults (loop rule: taken, noted, not re-asked)

1. Repo name and visibility: RyanShook/tap-giving-mcp, PUBLIC (Ryan's
   name as dispatched; public per his requirement). Worker name tap-mcp.
2. Endpoint: https://tap.giving/mcp on the tap.giving zone (trust and
   findability), workers.dev as the debug surface.
3. Transport: MCP Streamable HTTP, stateless per request; no sessions,
   no streaming in v1.
4. Order seat: the website's own POST /api/invoice-request (section
   5.2), not a new business endpoint, because indistinguishable-by-
   construction beats a parallel seat.
5. Invoice mint: tap-mcp mints directly against Stripe under the
   INVOICE-PLAYBOOK contract (section 2.7), replacing the earlier
   draft's shared-import design, which the repo boundary forbids. The
   recorded risk: two mint implementations exist (tap-mail's for the
   approval flow, tap-mcp's for agent orders), bounded by the playbook
   contract and the acceptance guard; converging them is a phase 2
   candidate through the 5.3 seat, not a launch dependency.
6. Artwork storage: bytes live in tap-mcp's MCP_ARTWORK KV namespace;
   the business side drains by reference (section 5.3). Artwork is
   agent-supplied content in transit, not business data of record,
   until the drain lands it in the order's artwork home.
7. Key format and storage: section 3's tg_live_/tg_test_ shape, hashes
   only, MCP_KEYS namespace in the MCP repo's Worker.
8. The MCP repo's stand-up is treated as in flight (dispatched
   separately); this spec does not duplicate its steps, and the build
   runbook (section 9) starts from "repo exists".
9. Naming: get_quote is the tool; get_pricing is its documented alias
   (Marketing's vocabulary preserved where an agent would search it).
10. Hosting: Cloudflare Workers, DECIDED by Ryan (section 2.0); no
    alternative remains open.
11. Server presentation name: "NFC Tap Builder by Tap.Giving"
    (section 3.1), with its contractual synonym set.
12. Repo hygiene: the public repo carries only the cleaned, curated
    surface (section 9.1, item 4); MCP working material lives in the
    private tap-giving repo's private MCP working directory.

CHANGES LOG against this spec's own earlier drafts, kept visible per
the commissioning instructions: (a) server moved from worker/tap-mcp/
in the business repo to its own public repo, and every shared-code
assumption reworked (sections 2.2, 2.7, 5.1, 5.2, 5.3); (b) design
moved from v1.1 to v1 in Ryan's spec-plus-submission shape, deleting
the generation contract (section 2.6); (c) artwork validation moved
from an open question to Ryan's permissive ruling with three sanity
grounds (section 2.6); (d) the journey reordered to artwork-first with
the recap and two exits as contracts (section 2.11); (e) deadline moved
from Nov 7 to today, cutting the items named in section 9.5; (f) the
recap exits revised by Ryan's final addendum: pay now via Stripe is the
primary exit, lock-in second, and the email-the-quote exit and its
email_quote contract were REMOVED in full (the tap-mail quote-email
seat arm went with it); the two required recap notes and the dropout
follow-up contract were added (section 2.11); (g) the three approved
additions landed as contracts: get_discovery (2.2.1), explicit order
idempotency enforcement (2.5), and proof_ready/shipped webhooks with
v1 registration and v1.1 delivery (2.9.1); (h) the minimum-friction
section (2.12), the builder presentation name (3.1), the decided
Cloudflare hosting line (2.0), and the repo hygiene rule (9.1) were
added on Ryan's rulings; (i) the journey was REORDERED on Ryan's final
answers: design creation now happens BEFORE email capture (keyless,
email-less, through the benefits block), email is captured at order
setup, and the dropout section was restated to apply from the first
capture point onward (dropout before capture leaves nothing, stated
plainly), reversing the earlier email-at-kickoff ordering, with the
reason recorded: value shown before anything is asked, per the
friction principle; (j) the portal position and per-surface auth
reality were stated (section 3.7) from Marketing's directory research,
with OAuth for portals named v1.1, and the no-money sentence placed in
the server description and the payment handoff contract; (k) the
destination, quantity, and quote-total rulings landed: any URL
accepted with injection-only screening (2.5), the 100-disc minimum
enforced by the MCP's own tools (2.3, 2.5), free shipping listed
upfront in quote and recap, and no tax line in the MCP quote (2.3);
(l) the opening sequence was scripted (introduction, shape as the
first choice, the examples element, the optional logo ask, sections
2.2.1, 2.6, 2.11) and the examples open item was CLOSED by Ryan's
house-template ruling: the set is generic Tap.Giving house artwork, no
customer designs, produced in the build without blocking it.
enforced by the MCP's own tools (2.3, 2.5), free shipping listed
upfront in quote and recap, and no tax line in the MCP quote (2.3).

## 9. Build runbook for today, Nov 6, 2026

Written to be executed without re-deriving anything. Steps in order;
each names its owner surface and its done-evidence.

### 9.0 Already in flight (do not duplicate)
- The public repo RyanShook/tap-giving-mcp stand-up: dispatched
  separately over the authenticated GitHub routes (connector first,
  rs-oracle gh second, the local_github route). Expected executable
  from the box without Ryan's hand. Fallback if the gh identity lacks
  repo-creation permission or an org policy intervenes: THAT is the
  named blocker, and the exact Ryan action is: signed in as RyanShook,
  open https://github.com/new, name tap-giving-mcp, visibility Public,
  create, then tell the CEO lane it exists. Builder's first step is
  verifying which state the repo is in, not creating it twice.

### 9.1 Repo first steps (in tap-giving-mcp, once it exists)
1. Initial structure: worker source under src/, wrangler.jsonc (name
   tap-mcp, compatibility_date matching the estate's current Workers,
   nodejs_compat), package.json with wrangler and the MCP SDK or a
   hand-rolled JSON-RPC layer (builder's call against the SDK's
   Workers fit; the contract is this spec, not the library), test/
   with the contract tests of step 9.2, README.md carrying the public
   description (endpoint, tools, gates, how an organization gets a
   key), and a .gitignore that excludes .dev.vars, .wrangler, and any
   env file by pattern.
2. Secrets rule for a PUBLIC repo, stated in the README and enforced by
   a committed pre-commit grep in CI: zero secrets in the tree, ever.
   All credentials are wrangler secrets on the Worker (step 9.3) or
   vault-held; test-organization material follows the same rule (the
   acceptance key travels by environment variable only).
4. REPO HYGIENE RULE (Ryan, binding): the public repo stays public ONLY
   as a clean, curated surface. README, the published spec, and released
   server code belong there. Scratch work, experiments, figuring-it-out
   commits, internal notes, and anything touching private business
   operations NEVER get committed to it; that work happens in the
   private tap-giving repo's private MCP working directory (below) or
   in local working space, and only the cleaned, publishable result
   lands in the public repo. If a line of work genuinely needs open
   scratch in the public repo, the instruction is STOP and raise it to
   the CEO chat instead of committing it; the fallback Ryan named
   (making the whole repo private) is his call, not the builder's. The
   spec copy committed to the public repo must be the cleaned published
   spec, not a working draft with internal notes. Consistency note:
   this spec's own home is the private tap-giving repo, where it is
   DOC-MAP registered as the build contract other lanes read; all
   working MCP material (drafts, notes, scratch, how-it-works,
   strategy) lives in the tap-giving repo's private MCP working
   directory once it exists (its exact path is being established
   separately and is deliberately not invented here), and only the
   cleaned published spec crosses to the public repo.
3. Deploy pipeline: the estate's own pattern, wrangler deploy from the
   box over SSH (source ~/.profile first, never wrangler login), with
   GitHub Actions as a phase 2 nicety, not a launch dependency. The
   repo's own verify (its test suite) runs before every deploy, as the
   business repo's does.

### 9.2 Server build (contract-first, in this order)
1. Skeleton: Streamable HTTP POST handler, initialize, tools/list
   returning the v1 tool set with the gate sentences in descriptions
   (sections 2 and 4), the GET self-description (section 6), error
   shape (section 2.9), per-IP rate limiting on the unauthenticated
   surface.
2. Read tools: get_discovery (the cold-agent entry contract, section
   2.2.1), get_quote (price contract of section 5.1), get_product,
   get_artwork_spec, every read tool carrying honest readOnlyHint
   annotations (section 2.12). Contract tests: tier boundaries 100/200/400 equal
   the llms.txt figures; artwork geometry equals artwork/_audit.py's
   constants as cited.
3. Auth: MCP_KEYS lookup by SHA-256 hash, mode and scope checks, the
   key-issuance CLI (a small script in the MCP repo, run from the box:
   takes org slug, contact email, mode; prints the plaintext key once
   and writes only the hash record).
4. start_order_intent: the /api/lead proxy with source mcp:intent.
5. Write tools: submit_artwork (permissive validation of section 2.6,
   bytes to MCP_ARTWORK, invocation-seat call for the pending record),
   get_order_questions, get_recap, create_order (the /api/invoice-request
   POST plus MCP-side idempotency record), request_invoice (Stripe mint
   per section 2.7), register_webhook (registration surface only,
   section 2.9.1), get_order_status. No quote-email tool exists.
6. Business-side deliverable, in parallel (business repo, own landing):
   the section 5.3 invocation seat on tap-mail (POST /api/mcp-invoke,
   MCP_INVOKE_SECRET, three arms), with tap-mail suite tests, deployed
   on the estate's normal discipline, PLUS the discoverability copy
   updates (section 6) on the website, deployed with the site.

### 9.3 Deploy
1. KV: `npx wrangler kv namespace create MCP_KEYS` and
   `npx wrangler kv namespace create MCP_ARTWORK` in the MCP repo;
   ids into wrangler.jsonc.
2. Secrets on tap-mcp, each via `npx wrangler secret put` from the box,
   values from their vault seats, never printed: STRIPE_API_KEY_LIVE,
   STRIPE_API_KEY_TEST (the custom.stripe-test connector's seat for the
   test value), MCP_INVOKE_SECRET (generated on the box, the same value
   put on tap-mail as its expected header).
3. Route: tap.giving/mcp zone route in tap-mcp's wrangler.jsonc (zone
   routes on this estate are config, as tap-order's api routes are; no
   dashboard step, no new domain, no Ryan action).
4. Deploy tap-mcp; read back the deployment at 100 percent; deploy the
   business-side seat and site updates on their own paths.
5. Rollback: the MCP is additive. Rollback is: remove the zone route
   (one config line and a redeploy), which takes the endpoint dark
   without touching any business machinery; orders already written are
   ordinary INVREQ and capture records in the business stream and need
   no unwinding. tap-mail's seat rollback is a normal Worker redeploy
   of the prior version. Nothing in v1 migrates or mutates existing
   business data, so there is no data rollback.

### 9.4 Key issuance for the test organization, and the acceptance run
1. Test organization: a named test church identity (test lane rules:
   test identities stay test; the acceptance org is created for this
   run, e.g. "MCP Acceptance Test Church", contact at a Muse-held test
   address). Issue its key with the 9.2 CLI in test mode; the plaintext
   goes to the acceptance runner's environment only.
2. Acceptance run, exactly as commissioned (a real agent session: a
   Muse client configured with the deployed endpoint and the test
   org's key):
   a. Cold leg, no key, no email (the reordered journey): get_discovery;
      get_quote for 250 discs; get_product; get_artwork_spec;
      submit_artwork with a real generated test file, keyless
      (permissive intake accepts it; hash echoed; benefits block
      present in the output).
   b. Capture and keyed leg: start_order_intent with the test email
      (the step 2 capture); get_order_questions
      (mounting pictures present as URLs); get_recap for quantity 250,
      adhesive, the test ship-to (exact total shown, both required
      recap notes present on the recap); then the PRIMARY exit, pay
      now, for those inputs: create_order, then request_invoice, with
      the hosted link returned for immediate presentation; then the
      lock-in exit on a second idempotency key for the same inputs,
      verifying the two exits produce identically shaped order and
      invoice records differing only in the recorded exit intent.
   c. Record checks, the acceptance evidence: the INVREQ record exists
      in the test seat shaped like a website invoice-request record;
      after the next worker tick (or a manual tick run for the
      acceptance), the CRM row for the test org reads like a website
      order's row (same fields, source distinguishable, nothing else);
      the Stripe TEST invoice exists, finalized, totals equal to the
      MCP quote and to the website door's quote for the same cart;
      get_order_status returns the order with its invoice link.
   d. Gate checks: no tool in tools/list offers payment, approval, or
      production release; a second organization's key (issued for the
      check, then revoked) reads not_found for the test org's orderRef.
   e. Friction count (section 2.12): the run records the number and
      kind of permission prompts the real client presents across the
      whole journey (cold design leg, capture, writes) and reports them
      against section 2.12's prediction (zero on the cold leg, at most
      one client confirmation per consequential write).
3. Fix loop: acceptance findings are fixed in the repo that owns them
   (MCP contract bugs in tap-giving-mcp; seat or shape bugs in the
   business repo), redeployed, and the failed leg re-run, looping until
   the full script passes, per Ryan's loop-until-complete instruction.
   Findings and fixes are recorded against this spec in the MCP repo's
   acceptance note, not in chat alone.

### 9.5 Scope cuts forced by today, named (nothing slips silently)
- CUT to v1.1: the agent-ready gate extension (section 2.2's automated
  divergence check). Today, divergence is guarded by the acceptance
  run's quote comparison (9.4c) instead. The gate lands in v1.1 so a
  future price change cannot drift silently.
- CUT to v1.1: MCP registry and directory submissions (section 10);
  launch discoverability is our own surface (for-agents, llms.txt, the
  endpoint's self-description, the public repo), which needs no
  external account.
- CUT to phase 2 as specced: create_lead standalone, stands and badges
  ordering, site and FAQ search tool. None was in today's commissioning
  scope; each is named in section 2.10 so the cut is a placement, not a
  disappearance.
- CUT to v1.1: webhook DELIVERY for proof_ready and shipped. The
  event contracts and the register_webhook registration surface are in
  v1 (section 2.9.1); the delivery emitter phases to v1.1 for the
  reason named there.
- NOT cut: design (in, Ryan's shape), the recap with its two required
  notes, the two exits as finally ruled (pay now primary, lock-in
  second), the kickoff, the discovery call, order idempotency.
  Today's scope as commissioned is whole.

### 9.6 Effort, in the repo's SMALL / MEDIUM vocabulary
- tap-mcp server, steps 9.2 items 1 to 5: MEDIUM (the estate's patterns
  carry most of it; the new surface is one Worker with nine small
  tools, no new platform).
- Invocation seat (business side): SMALL.
- Discoverability copy and site deploy: SMALL.
- Acceptance run and fix loop: SMALL to MEDIUM, dominated by whatever
  the run surfaces; the runbook pre-decides the known fallbacks (5.3)
  so the loop has no design waits in it.
- v1.1's named items (gate extension, designer bridge, proof state):
  MEDIUM in aggregate, none blocking today's launch.

## 10. Open items: genuine blockers and Ryan-action items only

Per Ryan's instruction, everything with a safe default was decided in
section 8. What remains is only what Engineering cannot do itself.

- O1, CLOSED by Ryan's ruling: artwork validation strictness is the
  permissive policy of section 2.6. Recorded here so the closure is
  visible where the question was raised; it is not open.
- R1 (Ryan action, only if wanted): MCP registry and directory
  listings are how cold agents find servers beyond our own surface.
  None is needed for launch and none is bundled into today. Per
  section 3.7, the ChatGPT and Google portal listings are discovery
  surfaces only in v1 (no keyed writes through them); if Ryan wants
  portal writes pursued, OpenAI's documented route is a "contact
  OpenAI" step that only he can open. If Ryan wants the listings
  themselves, the action is his where a listing requires the account
  owner's identity; Engineering prepares the listing content on
  request. Not a blocker.
- R2 (Ryan action, none required today): API key issuance for real
  organizations is Ryan's or the CEO lane's act in v1 (the issuance CLI
  is ours; deciding which church gets a key is an ownership decision).
  The test organization's key is Engineering's, under test lane rules.
- B1, the one machinery tension found, RESOLVED in design and recorded
  so the parent hears it from the spec rather than discovering it in
  the build: invoice creation had no agent-reachable seat (its two
  seats are the approval flow's mint and the box-side CLI draft), and
  the CRM writer path has no network seat at all. Both are answered
  without new business machinery for the order leg (ride the website's
  own public endpoint, section 5.2) and with a direct-Stripe mint under
  the playbook contract for the invoice leg (section 2.7), at the cost
  of the recorded two-implementations risk (decision 5). If the CEO
  judges that risk unacceptable, the alternative is the invocation
  seat gaining a mint arm that calls tap-mail's own invoice module
  in-process (business-side, SMALL to MEDIUM), which moves
  request_invoice's mint behind section 5.3 and adds one build step;
  the spec's default is to ship today's design and converge in phase 2.
  This is a judgment the CEO can reverse on sight; it does not block
  the launch either way, so it is carried here as a flagged decision,
  not a stop.
- Hosting asks to Ryan: NONE. We already hold Cloudflare Workers
  access; v1 goes public and live with no additional steps or accounts
  from Ryan (Ryan's process point, 2026-11-06). No hosting item is
  listed as a Ryan action anywhere in this section, deliberately; a
  genuine hosting gap, if one appears in the build, goes to the parent
  as a blocker, not to Ryan as an ask.
- No other blockers are known at spec time. The two watched risks with
  pre-decided fallbacks: /api/lead's timing check against server-side
  captures (fallback seat variant, section 3.4) and the invocation
  seat's status arm weight (fallback status shape, section 5.3).


## 2026-11-08 generic reframe and TDQS description pass (landing record)

Ryan's directive (2026-11-08, via the CEO chat, with two addenda the
same evening): the server presents as a generic NFC provider for
organizations of every kind. The applications list (churches,
nonprofits, restaurants, coffee shops, and local businesses, in that
order) is the only place verticals are named. Everywhere else in
served text, schemas, and docs the generic noun is "organization".
The tap.giving website stays church-first and is out of this pass's
scope.

Renamed fields (external contract change, authorized by Ryan;
directory re-tests should use the new names):

- `church` to `organizationName`: start_order_intent input,
  create_order input, the stored order record, the stored intent
  record, and the Stripe mint input. Handlers still accept the old
  input name server-side for in-flight calls, and records already
  written under the old field names still read back.
- `givingUrl` to `linkDestination`: get_recap input (the givingUrl
  property is removed; linkDestination already existed), create_order
  input (same removal), the get_order_questions question field, the
  get_recap structured destination output, and the stored order
  record. An order input still carrying givingUrl is normalized into
  linkDestination by the shared order-shape validation.
- Downstream contracts in the business machinery keep their own field
  names at the payload boundary: the lead capture body, the
  invoice-request body, and the artwork seat payloads still carry
  `church` (and the invoice-request design payload still carries
  `givingUrl`), fed from the renamed fields. Those systems are out of
  this repo's scope.
- Deliberate exception: the Stripe invoice memo's tax line changed
  from "Tax exempt, 501(c)(3) church or nonprofit" to "Tax exempt
  where applicable" under the generic-verbiage rule, so the memo no
  longer mirrors the invoice playbook field for field; the
  2026-11-07 parity result stands as the historical record of the
  pre-reframe text. The memo shape lines and the invoice line-item
  description also dropped "Tap-to-Give" for "NFC Tap Discs".

The six house example designs were redrawn with generic sample
organizations and "TAP HERE" wording, and the forest example's cross
accent became a leaf ("Deep Green & Gold Leaf"). Test fixtures keep
their historical organization names and slugs as data values.

The same pass folded in Marketing's Glama TDQS fix list (baseline
TDQS A 3.9/5.0 across the 12 tools): schema descriptions added for
get_order_status (orderRef, invoiceId), get_recap (all 11 parameters
including the nested shipTo fields), create_order, start_order_intent
(sourceNote, quantityHint), and submit_artwork; routing sentences
added across the read and order tools; return shapes and failure
modes stated for get_product and create_order; behavior notes added
(repeat start_order_intent calls create a second lead, artwork
resubmission creates a separate submission, the discovery intent
echo, register_webhook callbackUrl guidance); prerequisite and
next-step sentences for get_artwork_spec, get_quote, and
request_invoice. list_orders, cancel and amend operations, and
webhook delivery remain v1.1 scope and were not built.
