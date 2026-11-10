# NFC Tap Builder by Tap.Giving: MCP v1 spec

## Landing note (2026-11-09): no keys anywhere, two-part flow, final-step invoice and proof chain

Ryan's rulings of 2026-11-09 (via the CEO dispatch chain, from the
no-keys design brief of the same day) supersede every earlier passage
in this spec that describes a keyed surface, a priced Part 1, or a
placement that mints no invoice. The marking rule for this amendment:
a dated banner at the top of each amended section, section titles
corrected in place where a title itself teaches the old path, live
sentences rewritten, and dated landing records left byte-untouched as
history under this note. Any sentence an agent could follow into a
keyed, priced-in-Part-1, or server-produces-the-PDF path is rewritten
or banner-marked; purely historical narrative stays.

The settled rulings, which are the live contract from this note on:

- NO KEYS AT ALL. No user-facing step requires or offers a key,
  login, or account, including order status and webhooks. A key is
  not even an option: a presented credential is ignored, never an
  error. Keys are removed from the server entirely (section 3 as
  amended): authentication, the keyed organization block on the order
  questions, the TEST MODE banner, key issuance tooling, and the live
  key records all retire. The MCP_KEYS namespace itself stays: it is
  a shared namespace (ORDER, IDEM, RECAP, INTENT, INTENTBYEMAIL,
  WEBHOOK, and the rate-limit counters), and with no keys the per-IP
  rate limit becomes universal.
- TWO PARTS. Part 1, DESIGN, is first and is the critical core: on
  connect the server hands over specs, dimensions, and design
  guidelines; the user sees numbered, described examples drawn only
  from real delivered artwork; the user's own agent reproduces the
  chosen direction with the user's logo and produces the finished
  artwork as a print-ready PDF. Part 1 collects no identity or
  contact data; the one design input is the destination URL, entered
  mid-to-late Part 1 so the agent can build the design's QR from it.
  Part 2, ORDER, is optional: instead of keeping the file, the user
  may order, collecting in Ryan's order (email first, then
  organization name, shipping address and phone, quantity, shape,
  mounting, link destination), and the final step is labeled exactly
  "Email me my invoice and design proof."
- THE FINAL-STEP CHAIN (P-16 superseded in its no-invoice clause).
  The final step completes the placement as before (the INVREQ record
  and the order email to Ryan stand), a Stripe invoice is created and
  FINALIZED at the quoted total through a new tap-mail invocation
  seat op (working name mintOrderInvoice, section 5.3 as amended),
  and a second seat op (working name sendOrderInvoiceProof) emails
  the customer the invoice (hosted link spelled out as a text link,
  plus the invoice PDF attached) and their artwork proof, the proof
  embedded inline AND attached. Order of operations: record first,
  Ryan's email second, invoice third, customer email fourth; each
  outcome is recorded on the order record and any failure surfaces as
  an explicit partial state, never silent success; replay re-attempts
  only the missing steps. An order placed without submitted artwork
  still mints its invoice at placement; its customer email waits in
  the explicit state proof_pending and fires from the existing
  HELDPROOF pipeline once the name-only design's prepared proof is
  published. The human gates stand: proof approval by email before
  production, payment by a person on the hosted invoice. Two build
  risks are named, not assumed away: the hourly INVREQ adoption must
  be verified to recognize a finalized MCP invoice as already
  invoiced (no second draft), and the invoice.finalized GA4 branch's
  origin resolution may degrade MCP invoices (UNVERIFIED whether it
  reads the mcp_order metadata marker); the GA4 leg itself stays
  dormant until Ryan's Stripe Dashboard step and nothing depends on
  it.
- ORDER STATUS WITHOUT A KEY: a capability reference. At placement
  the server mints statusRef (32 bytes of randomness, base64url);
  only its SHA-256 hash is stored (a STATUS:<hash> index on the
  order record). The plaintext exists only in the create_order
  response and in the customer's email, and the copy says it cannot
  be recovered if lost. The read is tightened: stage, invoice state
  including the hosted URL, fulfillment including tracking and
  carrier, quantity, exit, the order's own artwork preview image,
  and the Redirect Dashboard block; never the CRM row verbatim, the
  ship-to phone, internal seat or ledger identifiers, or any other
  order. Unknown references answer not_found with no distinction
  between malformed and nonexistent; there is no list and no
  slug-based lookup. The runner-up, email-based status, is the held
  fallback if capability custody fails cold users.
- PART 1 HAS ZERO PRICING REFERENCES. No range, no totals, no
  discount talk, no per-disc figures, no minimum or tier language,
  no anti-metal figure, no stands or badges price figures anywhere
  in a Part 1 response or discovery surface. The price range line
  and the no-fees line move to the Part 2 entry, get_order_questions;
  totals live only at get_quote. get_product is a Part 1 surface and
  carries no prices. get_discovery does not split: one discovery
  tool, Part 1 content only, price-free. This supersedes the
  2026-11-08 range-at-discovery ruling for the MCP flow only;
  Marketing-owned directory listings are outside this rule's scope.
- THE USER'S AGENT PRODUCES THE PDF. There is no PDF-producing path
  in the server and none is built. The print-ready PDF is an output
  standard the user's agent meets from this spec; submit_artwork's
  export returns the agent's own submitted file byte-identical, its
  PNG render, and the on-disc preview. The server stores and returns
  what the agent made; it authors nothing.
- TEMPLATES ARE REAL DELIVERED ARTWORK ONLY, and each example
  carries curated data (description, size, palette, layout,
  iconTreatment, logoSlot) so a pick by number or description text
  can be reproduced faithfully and verified against the example
  (P-13) with data beside the checklist. The supplier is never named
  in this repo or any public surface; the four occurrences that stood
  in this spec are replaced with "the production supplier" and "the
  production handoff".
- ENTIRELY VISUAL. Every tool response in both parts carries an
  honest image. The audit: discovery, product, artwork spec, order
  questions, and quote are unchanged; start_order_intent gains the
  labeled product photo; recap, create_order, and get_order_status
  fall back to the labeled product photo when no artwork render
  exists. One genuine exception, named: a submission the server
  cannot render (a PDF-only submission) answers with no image and
  says why. No generated renders; no customer design as anonymous
  set dressing; setting photos stay labeled as settings.
- THE EXPLAINER follows MCP best practice, not a website FAQ:
  Resources are the primary surface (tapgiving://explainer/<topic>:
  how-it-works, what-a-tap-disc-does, nfc-vs-qr, the-two-phases,
  after-you-order, materials-and-care), one Prompt on a new prompts
  surface (explain_where_i_am) assembles the current-step
  explanation, and nextStep fields point at the resource URIs.
  Content limits: continuity is absent (Ryan's ruled position is
  quiet, no public promise); loss and theft carry no replacement
  promise; durability copy stays within the verified material facts;
  the approval-workflow question has no sourced answer and is
  omitted, with the gap named in the landing record at the end of
  this document.

PROPOSALS, recorded here and in the sections named (each settled
by the CEO 2026-11-09, about 15:29 CT; the settlement record is in
the landing note at the end of this document): the identity-based test lane (a placement is test-lane when
the contact email's domain is on a hardcoded operator list,
initially mcptest.org, or the organization name carries the standing
TEST / DO NOT CONTACT markers; test-lane placements write DEV_ORDERS
records, skip CRM adoption, TEST-mark the order email to team
inboxes only, mint with the Stripe test key, and suppress the
customer email); the retirement of register_webhook in v1 (delivery
was never built and a live prefix list shows zero registrations;
the capability-bound design is the recorded v1.1 revival path); the
replacement protected string and confirmation text (section 3.1 as
amended); shapes promotion (the code and the 2026-11-01 policy hold
exactly two built-ins, 100 mm round and 100 mm square; the site
markets eight shapes; the example set holds 25 round, 2 square, and
zero rectangles, and per-example size is unrecorded until curation);
and the explainer wordings flagged in the landing record.

OPEN QUESTION, carried not resolved: the phase-one design QR is
built by the agent from the URL the user enters, while production
encoding is locked (Ryan, 2026-11-01) to the go.tap.giving redirect
slug for that destination, changeable anytime in the Redirect
Dashboard, with raw encoding only as a per-order client-specified
exception. Whether the design QR is a labeled mock of the entered
URL (the design brief's recommendation A), a redirect-style
placeholder, or the raw-encoding exception is PENDING CEO
SETTLEMENT; this spec states the mechanics and asserts none of the
three.


## Landing note (2026-11-08): examples are delivered proofs; labeled photo set added

Ryan's ruling of 2026-11-08 supersedes every earlier passage in this
spec that describes the examples as house templates or generic sample
artwork (the examples passages in 2.6, the ruling record in 4.1, the
acceptance summary in 6.3, and the Nov 6 build runbook among them):
"check out website assets and only use assets from there. Delete all
existing /examples and put all existing delivered proofs into
/examples instead (compress if needed)."

What shipped the same day:

- The six house examples (ex-navy-round, ex-forest-round,
  ex-slate-round, ex-cream-square, ex-burgundy-square, ex-sand-square)
  are deleted: source SVGs, generated modules, and the generator that
  built them. Their URLs return 404.
- /mcp/examples/<org-slug>.png now serves one proof per DELIVERED
  organization: 27 organizations, 25 round and 2 square. Delivered
  was determined from the business records, not the proofs folder:
  accounting/orders/_manifest.json (41 paid orders) joined to
  accounting/orders/_status.json (36 shipped or delivered entries)
  and CRM/deals.csv (36 unique won organizations) gives 32 unique
  organizations at shipped or delivered stage. Of those, 27 have a
  proof asset in website/assets/proofs/; five (Christ Community
  Church, Encounter Church, Endurance Church, Glory City Church,
  Unionville Alliance Church) have none and so have no example.
  Where an organization had several proof files, the CRM deals
  record's proof pointer names the delivered design; duplicate and
  option files collapsed (14 extra files collapsed, byte-identical
  copies first). One SVG-only proof (Lakewood Park Baptist Church)
  was rendered to PNG. The folder's other proof files are lead
  proofs for organizations that never ordered, in-production or
  queued orders, a voided phantom order, test entries, and
  email-derived working files: none is an example. The manifest is
  tools/delivered-examples.json, with its evidence per organization.
- Serving: proofs are resized to at most 424x424 PNG and uploaded to
  the MCP_ARTWORK KV namespace as EXAMPLE:<id> by
  tools/build-assets.mjs (npm run assets, then a wrangler kv bulk
  put). No image bytes enter the Worker bundle; the committed index
  (src/examples-data.ts) is metadata only. The same build produces
  the photo set below.
- get_artwork_spec returns the full delivered set for the requested
  shape in structuredContent.examples (id, organization, shape,
  displayUrl), inlines the first 6 example images for the shape plus
  the two mounting photos, and accepts any set id as
  chosenExampleRef (a number picks from the shown subset). Copy is
  honest: an example is a real organization's delivered design and is
  never shipped to a different organization as-is.
- Photos: 23 labeled photos from website/assets/ (outside proofs/)
  are served at /mcp/photos/<id>.webp from the same KV namespace
  (PHOTO:<id>), returned by get_discovery and get_product in
  structuredContent with category, title, alt and use labels, and by
  get_artwork_spec as an explainer subset (mounted and in-place
  photos plus the mounting images). Labeling follows the business
  repo's documentation/visual-assets.md: real installation photos
  stay unnamed (naming permission pending), stock scenes carry the
  Tap.Giving sample design and are labeled as setting images, staged
  scenes are labeled Tap.Giving product photography, and the one
  close-up whose design is legible names the organization printed
  on it (Woodlands Church). pews3 is barred and not included;
  neither is any asset whose legible real customer design cannot be
  labeled accurately. The stock pew scene (stock-church-pew-disc) is also excluded: Ryan ordered it deleted from the website assets and every surface the same day. The manifest is tools/photos.json.

The published design spec for the Tap.Giving MCP server, "NFC Tap
Builder by Tap.Giving" (repo: github.com/RyanShook/tap-giving-mcp,
endpoint: POST https://tap.giving/mcp). This is the contract the v1
server is built and accepted against: tool contracts, the identity
and key model, the human gates, and the build and acceptance runbook.


Status: SPEC, written 2026-11-06 against live machinery read the same day.
Positioning (Ryan, 2026-11-08): this server is a design tool first: it helps agents and users create print-ready NFC tap artwork proofs from its published spec and design directions, art the organization owns and can take to any vendor. Ordering discs through Tap.Giving is the optional next step after the design path, and pricing is presented only in Part 2 of the flow: Part 1 (design) carries no pricing references at all, and totals appear only at the quote step (Ryan, 2026-11-09; the 2026-11-08 range-up-front presentation is superseded for the MCP flow, and Marketing-owned directory listings are outside that rule). The full rulings and what changed are recorded in the landing note at the end of this document (2026-11-08 pricing presentation, positioning, and flow).

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
and kickoff without a key; writes keyed per organization. (Amended
2026-11-09: the keyed-writes model is retired in full; no key exists
anywhere in the flow, section 3 as amended.) Design joins
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
write tools keyed. That change is noted where it lands. (Amended
2026-11-09: the split surface is itself superseded; no tool is
keyed, and the landing note at the top of this spec governs.)

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
3. Identity model (no credentials; amended 2026-11-09)
4. Human gates that stay human
5. Riding the existing machinery
6. Agent-readable website companion
7. Phases beyond today
8. Decisions taken as defaults
9. Build runbook for today, Nov 6, 2026 (repo bridge, server build, deploy, key issuance, acceptance, fix loop) (historical)
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
| `create_order` | [2.5 Tool: create_order](#25-tool-create_order-v1-write-no-credential-the-final-step) |
| `request_invoice` (RETIRED 2026-11-08, P-16; see the Persona Loop Round 1 landing record) | [2.7 Tool: request_invoice](#27-tool-request_invoice-v1-write-key-required) |
| `get_order_status` | [2.8 Tool: get_order_status](#28-tool-get_order_status-v1-read-capability-reference-no-credential) |
| `register_webhook` (retired in v1, settled 2026-11-09) | [2.9.1 Webhooks](#291-webhooks-proof_ready-and-shipped-contracts-in-v1-delivery-v11) |
| All tools | [2.1 No credentials](#21-no-credentials-retired-2026-11-09-the-auth-header-shape), [2.9 Error shape](#29-error-shape-all-tools) |

## 1. Assumption test: where an MCP is actually required

(Amended 2026-11-09: this section's auth verdicts predate the no-keys ruling. Where a verdict below argues for an authenticated or keyed surface, the 2026-11-09 landing note at the top of this spec governs and the keyed path is retired; the mechanism verdicts stand.)

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
  session to lose; every call carries its own arguments, which
  is also what makes the tools idempotent-friendly). The server implements
  initialize, tools/list, and tools/call; notifications and server-side
  streaming are out of v1.
- Compatibility target: a standard MCP client (Muse, Muse
  Desktop, or any client speaking Streamable HTTP) connects with only the
  endpoint URL. (Amended 2026-11-09: no key, login, or account exists
  anywhere in this server, for any tool.)
- Every tool result is returned both as MCP structured content and as a
  plain-text rendering, so a client that only reads text still gets the
  invoice link and the quote.

### 2.0.1 KV namespace: MCP_KEYS (amended 2026-11-09: shared namespace, no key records)

One new KV namespace, binding MCP_KEYS in tap-mcp, holding the server's
order, idempotency, recap, intent, and rate-limit records (ORDER, IDEM,
RECAP, INTENT, INTENTBYEMAIL, WEBHOOK, RL/RLI), created from the MCP repo's checkout (the
namespace belongs to the tap-mcp Worker, not to any business Worker). KV
is the estate's standing pattern for key-shaped state (LEADS, ORDERS,
MAIL_STATE) and needs no schema migration. Account cost: KV is included
in the paid Workers plan at our volume; no new paid product, no approval
needed beyond the deploy itself. Namespace creation: `npx wrangler kv
namespace create MCP_KEYS` run inside the tap-giving-mcp repo, id pasted
into that repo's wrangler.jsonc, same as DEV_ORDERS was created for
tap-order-dev. (Amended 2026-11-09: the namespace is never deleted and
never held key material as its purpose; the per-organization key records
that once lived in it retire with the key model, and only those records
and the key logic retire.)

### 2.1 No credentials (RETIRED 2026-11-09: the auth header shape)

Amended 2026-11-09: this section is retired. The replacement contract
below is live; the earlier text of this section stands in this file's
git history and in the retired model recorded at section 3.1.1.

Replacement contract (live): no key, login, or account exists anywhere
in this server. Every tool, reads and writes alike, is called with the
endpoint URL alone. No Authorization header is required, offered, or
consulted: a presented credential is ignored identically, never an
error, and changes nothing (no organization block, no mode, no banner).
The only capabilities in the system are references the flow itself
issues: the artwork reference (section 2.6) and the status reference
minted at placement (section 2.8), each stored as a hash only. Per-IP
rate limiting applies to every call, with no credential bypass.

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
  question, NO pricing content of any kind (amended 2026-11-09: Part 1
  carries zero pricing references; the price range line and the
  structured pricing block live at the Part 2 entry,
  get_order_questions, section 2.11, and totals live only at
  get_quote), artworkSpec: the get_artwork_spec summary
  (shapes, artboard, format wanted back), capabilities: {tools (one
  list, no credential split), gates in one line each, the statement
  that no key, login, or account exists anywhere in this server,
  the kickoff tool's name}}. Every figure inside it is the same object
  the dedicated tools return; get_discovery composes, it does not
  restate from a second source.
- Machinery: none of its own; it composes get_quote's boundary rows,
  get_artwork_spec, and the static capability text of section 4.
- Failure modes: rate_limited and internal only; it never returns a
  credential error, because no credential exists in this server.

### 2.3 Tool: get_quote (v1, read, no key)

(Amended 2026-11-09: get_quote is a Part 2 tool. Its totals live here and at the recap, nowhere in Part 1. The sub-100 guidance of the persona pass (P-9) is Part 2, quote-step content: it fires only inside the order path, and the discount-eligibility plain-words sentence stays on this tool in both channels.)

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

(Amended 2026-11-09: get_product is a Part 1 surface and is price-free. It returns no price range, no stands or badges price figures, and no anti-metal figure; the functional anti-metal facts (shielding is decided before printing and cannot be added afterwards) stay, and the figure lives in Part 2 at get_order_questions and get_quote. The Redirect Dashboard's existence is described here without fee language.)

Purpose: the full product spec an agent needs to answer "what exactly is
this" without scraping: NTAG213 chip (144 bytes user memory, locked to
https://go.tap.giving/<slug>), 0.85 mm double-laminated matte waterproof
PVC, built-in sizes 100 mm (4 inch) round and 100 mm (4 inch) square, every
other size or shape a manual exception handled by hand (named as such,
never presented as self-serve), mounting adhesive or screws, table
stands and lanyard badges as related products (their
facts and sizes; their prices and minimums are Part 2 content), Redirect Dashboard included with every order, works with any
platform, ships free.

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

### 2.5 Tool: create_order (v1, write, no credential: the final step)

(Amended 2026-11-09: this tool's completion action is the journey's final step, labeled exactly "Email me my invoice and design proof." The settled chain: placement completes as this section describes (INVREQ record, the durable order record, the artwork claimed, and the existing notifyOrderPlaced seat call emailing Ryan the order recap, unchanged); then a new tap-mail seat op (working name mintOrderInvoice, section 5.3 as amended) creates and FINALIZES a Stripe invoice at the quoted total under the parity contract recorded in section 2.7; then a second seat op (working name sendOrderInvoiceProof) emails the customer the invoice and the design proof, embedded inline and attached (an order without submitted artwork mints its invoice and waits in the explicit proof_pending state for its email). Each step's outcome is recorded on the order record; replay re-attempts only the missing steps. The response also carries the statusRef capability of section 2.8. The phase-two field order is Ryan's (section 2.11): email first, then organization name, shipping address and phone, quantity, shape, mounting, link destination. Test-lane routing for this tool is a PROPOSAL, pending CEO settlement, recorded in section 3.3 as amended; until settlement, a placement is a real placement. Earlier text below is amended where it names the old credential model.)

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

In Ryan's flow this tool is the final step of Part 2 (section 2.11):
it is called after the artwork, the questions, and the recap, when the
person picks the step labeled "Email me my invoice and design proof."
(The exits recorded on the order, pay now or lock in this price, stand
as before.) Its inputs therefore carry
the journey's earlier legs (artworkRef optional: an order with no
submitted artwork is valid, matching orders today that carry a design
only when one exists).

Purpose: set up an order for the organization named in the Part 2 answers, indistinguishable
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
- contactEmail: string, required; must equal the email captured by
  start_order_intent and bound at get_recap (section 3 as amended); a
  mismatch is `conflict` naming the differing fields.
- contactPhone: string, required. The approval-block standard requires a
  phone on every order that can reach the production supplier; collecting it here, at
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
  it. Order status is read with the statusRef capability (section 2.8);
  the invoice arrives through the final-step chain above, not a tool call.
- statusRef: the capability for get_order_status, minted at placement;
  only its hash is stored (section 2.8).
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

Failure modes: `invalid_input` (missing ship-to
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
for this purpose. (Superseded 2026-11-08 by the delivered-proofs landing note at the top of this spec.) (Amended further 2026-11-09: the templates are the delivered proofs themselves. Each example carries curated fields in tools/delivered-examples.json and the generated index: description (short, authored from the actual delivered proof, never generated or invented; an example whose description cannot be verified is flagged UNVERIFIED in the data change's landing record), size, palette (hex values with roles: background, foreground, accent), layout (zone map in words and relative coordinates), iconTreatment, and logoSlot (position, max width and height in mm, clear space in mm; the logo sits directly on the disc background, never on a white chip or badge). The pick list is numbered across the FULL per-shape set in stable index order, in the line format "<n>. <description>, <shape>, <size>: the design delivered to <organization>, at <url>"; the inline image subset stays bounded for payload sanity, but numbering and text resolution cover the whole set. A pick resolves through chosenExampleRef as a number or an id; free-text description matching is the agent's reading of the list, not a server parser, and no client should expect the server to fuzzy-match prose. get_artwork_spec returns the reproduction data for the chosen example, and submit_artwork's verify-against-example block (P-13) repeats it beside the checklist, so verification compares data to data.)
LOGO ASK (Ryan): the design step also carries `logoAsk`, an optional
input the client presents at the design step: the person may provide
their logo for the agent to build from. Optional by construction
(name-only artwork is a standing shape); a provided logo travels with
the submission record as source material beside the finished artwork.
(Amended 2026-11-09: the agent pulls the logo itself from the website
the user provides or confirms; no fetch is ever made against a guessed
domain. The pull follows the website stack's logo-lookup priority: the
site's own published logo and icon assets first (apple-touch-icon,
favicon link tags, header logo), then the site's own published social
links; accept the best valid real logo file at any size; never a
monogram, globe, or placeholder. Direct upload through submit_artwork's
logo argument is the fallback. The business side's server logo-fetch
seat is NOT the Part 1 seat: it fires a capture-on-entry step-capture
event, which collides with Part 1 collecting nothing. No server-side
logo swap or compositing exists or is built; the swapped result is the
agent's render, submitted through submit_artwork and the P-13 path.)
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
  accepted; never raster)"). (Amended 2026-11-09, the output standard:
  the finished deliverable of Part 1 is a print-ready PDF the USER'S
  AGENT produces from this spec: page geometry equal to the 106 mm
  artboard with bleed, vector preserved, fonts outlined or embedded,
  one disc per page. The server never builds or returns a PDF;
  submit_artwork's export returns the agent's own submitted file
  byte-identical, a full-resolution PNG render, and the on-disc
  preview, fetchable under the artwork reference with no order, email,
  or credential. Palette hexes in the example data are the sRGB values
  of the delivered artwork as rendered; the agent composes in the same
  values. QR rules for the agent's design: a printed QR sits on a white
  background, never colored, 2 mm rounded corners allowed; reference
  sizes 44 x 44 mm QR-forward and 30 mm split; error correction M
  minimum and a quiet zone of 4 modules, set deliberately here (they
  were stated nowhere in either repo's design docs). Plain-language
  glossary the spec carries for no-designer users: the artboard is the
  full page the artwork is built on; the bleed is the margin of
  background color extending past the cut line so no white edge can
  show; the safe zone is the inner area every important element must
  stay inside.) The artwork itself is the church's full
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
following the spec, and renders the print-ready PDF itself (the output
standard above). No generation, rendering, or preview tool exists on
our side in v1, by Ryan's ruling, not by omission.

(3) The agent sends the finished artwork back through the MCP. Tool:
`submit_artwork` (v1, write; no credential exists: the submission is
email-less on the design path, Ryan's reorder, section 2.11; it binds
to an organization only when an order claims its artworkRef. An unbound cold submission is stored under its artworkRef
with a 30-day TTL and is claimed when create_order carries the
artworkRef; an unclaimed submission expires with the TTL and creates
nothing).

- designUrl: string, optional (Part 1 design input, amended
  2026-11-09): the destination URL the user enters mid-to-late Part 1
  so the agent can build the design's QR from it; stored on the
  artwork record, and carried into the order as the recap's link
  destination confirmation. What production encodes for that URL is
  the open question recorded in the 2026-11-09 landing note; this
  contract asserts none of the options.
- Inputs: artworkRef-bearing call in two forms, per Ryan's flow
  (artwork comes FIRST, before any order exists): with no orderRef, the
  submission opens the journey's artwork leg and returns an artworkRef
  the later steps carry; with an orderRef (revised artwork for an order
  already created in this flow), it attaches to that order. Form fields:
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
- Failure modes: `not_found` (an orderRef that does not exist or is
  not bound to this submission's order);
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

### 2.7 Tool: request_invoice (RETIRED; historical heading, see the amendment above)

RETIRED 2026-11-08 (P-16): this tool no longer exists. Placement records the order and emails it to the team; a person follows up with the actual invoice. This section is kept as the historical record of the retired design; the Persona Loop Round 1 landing record at the end of this spec carries the current contract.

(Amended 2026-11-09: the mint returns, not as this tool. Under Ryan's 2026-11-09 ruling, which supersedes P-16's no-invoice clause, the final step of Part 2 (sections 2.5 and 2.11 as amended) creates and finalizes the invoice at the quoted total through a new tap-mail invocation-seat op (section 5.3 as amended), and a second seat op sends the customer email carrying the invoice and the proof. The parity contract recorded in this retired section (the invoice module's create-and-finalize behavior, the metadata, the full order recap on the line items, the anti-metal line discountable=false, the duplicate-open-invoice guard) is the seat op's spec source. This section remains history.)

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

### 2.8 Tool: get_order_status (v1, read, capability reference, no credential)

Amended 2026-11-09: status is read with a capability reference, not a
credential. At placement, create_order mints statusRef (32 bytes of
randomness, base64url); the order record stores only its SHA-256 hash,
with a STATUS:<hash> index to the order. The plaintext exists only in
the create_order response and in the customer's final-step email, and
the copy says plainly: keep this reference, it is the only way to check
this order, it cannot be recovered if lost. One reference reads exactly
one order. The read returns stage, invoice state including
hostedInvoiceUrl, fulfillment including tracking and carrier, quantity,
exit, the order's own artwork preview image, and the Redirect Dashboard
block. It never returns the CRM row verbatim, the ship-to phone, any
internal seat or ledger identifier, or any other order. Unknown
references answer not_found with no distinction between malformed and
nonexistent; there is no list and no slug-based lookup; the universal
per-IP rate limit applies. The Stripe invoice read and the seat
readOrderRecords call stay, bound internally by the order record's own
organization slug and contact email, not by any credential.

Purpose: where an order stands, from the records fulfillment reads.

Inputs (amended): statusRef (from create_order or the customer's
email). The orderRef and invoiceId inputs below are history.

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
object: {code, message, retryable, details}. Codes (amended 2026-11-09):
`invalid_input`, `manual_exception`, `not_found`,
`conflict`, `stripe_unavailable`, `rate_limited`, `internal`. The
credential codes once listed here are retired from the live contract:
no tool throws them, because no credential exists in this server. Messages
are written for an agent reader: what failed, which input, what to do
instead (for manual_exception, the human route; for conflict, which
fields differ). No error ever returns another organization's data, a
stack trace, or a secret.

### 2.9.1 Webhooks: proof_ready and shipped (PROPOSAL, PENDING CEO SETTLEMENT: retire in v1)

(Amended 2026-11-09, SETTLED by the CEO 2026-11-09: register_webhook leaves the published tool set in v1. The facts: registration stored one subscription per organization with a secret shown once; delivery was never built, so no push has ever fired; and a live prefix list on 2026-11-09 returned zero WEBHOOK records, so retiring the tool orphans nothing. The recorded v1.1 revival path is capability-bound registration: the statusRef of section 2.8 authorizes one webhook per order, if delivery is ever built. The text below is the historical registration contract, not a live offer.)

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

### 2.11 The v1 journey: Part 1 DESIGN, Part 2 ORDER (binding flow, amended 2026-11-09)

Amended 2026-11-09: this section is rewritten wholesale as the
two-part structure. The pre-amendment journey text below this
replacement contract is superseded history, banner-marked at its
start; its old question list and its Step 4 (built on the retired
request_invoice) are superseded text and no agent should follow them.

PART 1, DESIGN (the critical core; collects nothing):

- Step 1, discovery and design entry: the cold agent starts with
  get_discovery (section 2.2.1, Part 1 content only, price-free),
  presents the introduction, and the person makes the first choice:
  shape, round or square. get_artwork_spec is the design entry
  point: specs, dimensions, and design guidelines as
  machine-followable data (geometry per shape, bleed, safe zones,
  colors, file requirements, QR rules, the plain-language glossary),
  and the numbered, described examples drawn only from real
  delivered artwork (section 2.6 as amended). The user picks by
  number or by description text.
- Step 2, reproduction: the user's own agent pulls the user's logo
  from the website the user provides or confirms (section 2.6 as
  amended), reproduces the chosen direction with the user's logo,
  colors, and branding, built to spec, verifies the result against
  the example (P-13, data beside the checklist), and shows the new
  proof. Mid-to-late Part 1, the user enters their destination URL
  as design input (designUrl on the artwork record) so the QR for
  their URL is built into the design; no organization name and no
  email are collected in Part 1, and design state rides on the
  artwork reference alone.
- Step 3, the deliverable: the agent renders the finished artwork
  as a print-ready PDF from the spec (the output standard of
  section 2.6). Part 1 ends there for a design-only user: no order,
  no email, no credential, nothing collected beyond the design URL.
  submit_artwork is the proof and preview step (and the optional
  order binding), never the deliverable's source. The explainer
  surfaces of the 2026-11-09 landing note answer "what step am I
  on" and "how does this work" throughout both parts.

PART 2, ORDER (optional; the user chooses it instead of keeping
only the file):

- Step 4, collection, in Ryan's confirmed order: email first
  (start_order_intent captures it; Part 2 opens here), then
  organization name, then shipping address and phone, then
  quantity, then shape, then mounting, then the link destination.
  The question set (get_order_questions) is reordered to this
  sequence, and the deltas against the set it replaces are called
  out, every one: (i) email sat 7th of 9 inside the old set and was
  "first" only via the separate intent capture; the set now follows
  the intent capture in Ryan's sequence; (ii) no organizationName
  question existed at all (create_order took it as an argument with
  fallbacks); one is added, second; (iii) shipTo was LAST (9th);
  shipping address and phone are now third; (iv) quantity and size
  sat 2nd and 1st; they are now fifth and sixth; (v) antiMetalCount
  (3rd in the old set) appears nowhere in Ryan's list: it stays a
  quote and order input, repositioned adjacent to quantity and
  labeled as the metal-surfaces question, not deleted, because the
  quote cannot price without it; (vi) contactName and contactPhone
  were separate questions while Ryan's list folds phone into
  "shipping address and phone", and shipTo also carries its own
  required phone: one contact phone is collected with the shipping
  block and defaults into shipTo.phone, collected once, used twice;
  (vii) linkDestination leaves the collection set: the destination
  entered in Part 1 appears only as a recap confirmation ("the
  destination carried from your design"), and for artwork-less
  orders the order answer is the fallback. The price range line and
  the no-fees line are first stated at this Part 2 entry
  (get_order_questions); totals appear only at get_quote and the
  recap.
- Step 5, recap: get_recap shows the artwork, the answers, and the
  exact total (the recap contract below, in the superseded text's
  Step 3, stands in substance: display order, both required notes,
  and the rule that a lock-in call whose recap inputs differ returns
  conflict naming the drift).
- Step 6, the final step, labeled exactly: "Email me my invoice
  and design proof." The click completes the chain of section 2.5
  as amended: placement recorded and emailed to Ryan, the Stripe
  invoice created and finalized at the quoted total, and the
  customer email carrying the invoice and the design proof,
  embedded inline and attached. The two exits (pay now, lock in
  this price) are recorded intent on the same record shape, as
  before. Dropout follow-up stands as written below: it applies
  from the first capture point (Part 2's email capture) onward, and
  Part 1 leaves nothing to follow up, by design.

Superseded journey text (pre-2026-11-09) follows, as history:


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
set is a contract: tool `get_order_questions` (v1, read;
the question set is static and public, and (amended 2026-11-09) the
reordered set of section 2.11 is what it returns; no organization
block exists, because no credential exists) returns the questions as
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
  reached), and the submit_artwork pending record
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
  click totals) through capability references; these ride the openshortlink
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
no credential at any point (amended 2026-11-09); payment outside the MCP
entirely), and the six requirements below are design requirements the
build is held to, legitimately, never by evasion:

1. REMOTE-ONLY: hosted Streamable HTTP on Cloudflare. No local install,
   no stdio or npx package, no filesystem or shell access requested,
   ever. An agent connects to a URL and nothing touches the user's
   machine.
2. UNAUTHENTICATED READ SIDE: discovery (get_discovery), pricing,
   the artwork spec, and quote work cold with no credential and no
   auth challenge (sections 2.2.1, 2.3, 2.6).
3. ZERO CREDENTIALS, EVERYWHERE (amended 2026-11-09, replacing the
   one-credential requirement): no key, login, or account exists at
   any step, for any tool, including order status (a capability
   reference, section 2.8) and webhooks (section 2.9.1). No OAuth
   consent flows, no per-tool scopes, no headers to configure.
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

## 3. Identity model (no credentials)

(Amended 2026-11-09: this section is rewritten as identity-without-credentials. Identity in the amended model comes only from what the user supplies in Part 2 (the intent email, the organization name answer, the order answers) and from the capability references the flow issues (the artwork reference, the statusRef). Sections 3.1.1, 3.2, 3.3, 3.5, 3.6, and 3.7 carry their own dated banners; text under those banners is history, not contract.)

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
  directory rules require (below). (Amended 2026-11-09: the
  "issues no invoices" clause of the sentence settled 2026-11-08 is
  superseded by Ryan's 2026-11-09 ruling, because the final-step
  chain now issues the invoice. A replacement was proposed and is
  SETTLED by the CEO 2026-11-09: "This server moves no money itself:
  when an order is placed, Tap.Giving emails the invoice and the
  design proof, and a person pays the hosted invoice." A confirmation
  text replacement is likewise SETTLED: "Your order is placed, and
  your invoice and design proof are on their way to <contactEmail>.
  A person from Tap.Giving follows up from there; production waits
  for your proof approval, and the invoice is paid on its hosted
  page." Surfaces carry the settled string verbatim, and no surface
  improvises a variant of the protected string.) Anthropic's
  connector rules bar connectors that transfer money; this server is
  compliant by design (it never takes payment), and the sentence is in
  the copy, in the server description and in the payment handoff tool's
  contract, not only in the principle.

### 3.1.1 The key (RETIRED 2026-11-09)

(Amended 2026-11-09: retired in full. No key is issued, accepted, or stored as a credential anywhere in this server; the issuance tooling retires, and the live key records are deleted after the no-keys deploy. The text below is the historical record of the retired model.)

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

### 3.2 What a key may do, and may never do (amended 2026-11-09: read as the capability model)

(Amended 2026-11-09: there is no key. Read this section as the capability model: the artwork reference and the statusRef are the only capabilities, each bound to its own record. The may-never list below stands unchanged in substance, enforced by the absence of tools, exactly as it was.)

May: call create_order, request_invoice, and get_order_status for its
own organization; call start_order_intent for its own contact email;
call the open read tools like anyone else.

May never, by construction (the server exposes no tool for these, which
is the enforcement, not a policy sentence): pay an invoice or hold a
payment instrument; approve a design or mark anything approved; release
an order to production or trigger a production-supplier handoff; read or write
another organization's records (every write and status read is bound to
the key's orgSlug and contactEmail, checked on each call); mint an
invoice for an order it did not create (the final-step mint takes only
the order the placement itself created); rotate or revoke its own key
(issuance is ours, so a compromised agent cannot lock the organization
out of its own account by rotating).

### 3.3 Modes: how one server serves production and test (amended 2026-11-09: key modes superseded; test lane SETTLED 2026-11-09)

(Amended 2026-11-09: mode is no longer a property of a key, because no key exists; the key-mode text below, including the in-place 2026-11-07 amendment scoping test isolation to order records and CRM adoption with the shared start_order_intent capture as the settled design, is banner-marked superseded by the following, SETTLED by the CEO 2026-11-09: an identity-based test lane, server-side, never offered to users in any copy. A placement is test-lane when the contact email's domain is on a hardcoded operator list (initially mcptest.org) OR the organization name carries the standing synthetic marker pattern (TEST / DO NOT CONTACT). Test-lane behavior reuses the existing test plumbing: the order record goes to DEV_ORDERS instead of the live INVREQ door, no CRM adoption, the order email to Ryan TEST-marked to team inboxes only, the invoice minted with the Stripe test key, and the customer email suppressed. This preserves every isolation property the test key provided, keyed off identity data the flow already collects. The runner-up (no test lane; every verification placement is real and cleaned up afterward) was rejected in the design brief: a finalized real invoice cannot be deleted, only voided, and a real placement needs the full gated cleanup. The lane is in force from the 2026-11-09 build.)

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
  completing an order needs no key, no login, and no account: the
  agent continues with the order questions, the recap, and the final
  step of section 2.11 (corrected 2026-11-09; the earlier copy
  promising a key was wrong even before the no-keys ruling). An intent is a lead, with a lead's semantics:
  it is not an order, creates no invoice, and reserves nothing.
- Abuse shape: an unauthenticated email capture is exactly the surface
  the website already exposes publicly; the MCP adds no new class of
  abuse, only a new client. Rate limit at tap-mcp (per-IP, KV-counter)
  mirrors the endpoint's own limits.

### 3.5 Rotation and revocation (RETIRED 2026-11-09)

(Amended 2026-11-09: retired with the key model. Capability references are hash-stored and single-record; there is no credential lifecycle to rotate or revoke. The text below is history.)

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

The organization's slug is the CRM slug: the same slug crm.py resolves, the
same slug adoption writes under, the same slug the Redirect Dashboard
account is keyed by in the openshortlink estate. One organization, one
slug, three surfaces. The slug derives from the intent, then the order
answers, then the email local part (amended 2026-11-09; there is no
issuance). The MCP never creates a second identity for an
organization that already has a CRM row: identity resolution checks the CRM first
(adoption reads deals.csv through the writer clone), and an email that canon_email
already resolves to another slug binds to that slug, never a second identity.

### 3.7 Distribution surfaces and per-surface auth reality

Source: Marketing's directory research (2026-11-06; their full map
lands in the tap-giving repo's private MCP working directory). (Amended 2026-11-09: the no-keys model applies to every connection,
direct and portal-mediated alike; portals need no auth story. The
per-surface text below is amended where it names the retired model.)
The
one-key model of sections 3.1 to 3.6 applies to DIRECT connections,
and the spec does not claim it covers portal-mediated connections:

- Direct MCP clients (an agent or its human configuring the endpoint
  URL alone in their own client): the full v1
  model. Every tool open on the endpoint URL, exactly as specced.
- Claude Directory, the Official MCP Registry, Meta Muse, Glama, and
  community registries: per Marketing's research these take a remote
  server on its own terms; the listing points at the endpoint and the
  no-keys model carries (amended 2026-11-09), because the connection
  is still a direct one the user's client makes.
- OpenAI's ChatGPT directory: NO API-key connection flow exists there;
  writes would need OAuth or OpenAI's "contact OpenAI" route. Portal
  position (Ryan, binding, stated plainly): for v1 the ChatGPT listing
  was a DISCOVERY SURFACE ONLY under the keyed model. (Amended
  2026-11-09: closed by the no-keys ruling; the full flow, writes
  included, runs through any portal on the endpoint URL alone.)
- Google's Connected Apps Platform: documents OAuth-or-none, the same
  shape. Same position: discovery surface only in v1.

OAuth for portals was a NAMED v1.1 ITEM (closed 2026-11-09 by the
no-keys ruling: portals need no auth story), with the reason: an OAuth
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

The rule (standing): what goes to the production supplier is verified against the
approval email, the email Ryan sent that the customer approved; its
proof and order details are the reference. The MCP may: carry a design
(v1.1) and surface proof state. The MCP may never: record an approval,
expose an approve action, or let an order's state imply approval
happened. create_order (the final step, "Email me my invoice and
design proof.") is explicitly
approval-neutral: an invoice is a request for payment, not an artwork
approval, and the records say so (the INVREQ and CRM note shapes carry
no approval field, and v1 adds none). (Amended 2026-11-09: the
final-step chain mints and emails the invoice at placement under
Ryan's ruling; Gate 1 stands exactly as before, and production still
waits for the emailed proof's approval.)

### Gate 2: payment

The agent receives an invoice link; a person pays. The server never
accepts card details, never creates a Checkout session in v1, never
marks an invoice paid. Payment state is read from Stripe and the
webhook-written records only (tap-order's webhook writes the manifest
and _status.json rows on invoice.paid; the MCP reads those records, it
does not write payment truth of its own).

### Gate 3: the production handoff

Production release and the production supplier handoff stay exactly where they are:
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
  and small, for the things no public endpoint does: writing a
  queued record the adoption machinery drains under an MCP identity,
  the order notification, and (amended 2026-11-09) the final-step
  invoice mint and the final-step customer email. (The seat is an
  internal server-to-server surface; its shared secret is machinery,
  not a user credential, and no user ever sees or holds it.)
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
- (Amended 2026-11-09: the seat was specced at two operations and
  shipped three (recordArtworkSubmission, the order notification
  notifyOrderPlaced, and the status read readOrderRecords); the
  final-step chain makes five, adding (d) mintOrderInvoice, wrapping
  tap-mail's own invoice module in-process under the parity contract
  recorded in section 2.7, creating and finalizing at the quoted
  total and returning the invoice block for the order record, and
  (e) sendOrderInvoiceProof, sending the customer email of section
  2.5 as amended through tap-mail's own send path. The build must
  verify, not assume, that the hourly INVREQ adoption recognizes a
  finalized MCP invoice as already invoiced and marks its record
  done accordingly, so no second, draft invoice is ever created.)
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
the MCP's job is to be a well-behaved client of each. (Amended
2026-11-09: invoice minting joins this list. Exactly one mint home:
tap-mail's invoice module, reached through the seat of section 5.3;
tap-mcp never mints directly.)

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
  https://tap.giving/mcp, the tool list in one line each, the no-keys
  model in two sentences, the gates in one), and llms.txt's "For Agents
  and Developers" section gains the endpoint and the same summary. The
  two published sentences that today say "there is no public write API"
  (website/for-agents.html, website/llms.txt) are updated to the true
  statement: a public MCP with credential-free writes now exists, and the human
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

- v1.1: Mint consolidation: single implementation via the tap-mail invocation seat arm (v1.1, CEO ruling 2026-11-06), retiring tap-mcp's direct mint. (Amended 2026-11-09: REALIZED by the final-step ruling; the mint lives in the seat as mintOrderInvoice, section 5.3 as amended, and tap-mcp's direct mint, already removed under P-16, does not return.)
- v1.1: the automated price-divergence gate (the agent-ready gate extension of section 2.2).

- v1.1: OAuth for portal-mediated writes (CLOSED 2026-11-09 by the
  no-keys ruling: portals need no auth story; section 3.7 as amended); webhook delivery for proof_ready and shipped (registration
  retired in v1 under the pending proposal of section 2.9.1; the
  capability-bound design is the revival path if delivery is built); the agent-ready gate extension
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
5. Invoice mint: (amended 2026-11-09) the mint lives in tap-mail's
   invoice module, reached through the invocation seat (section 5.3
   as amended), under the parity contract recorded in section 2.7.
   The earlier default (tap-mcp mints directly against Stripe) and
   its recorded two-implementations risk are retired: the seat arm
   the B1 item below always named as the alternative is the design,
   and exactly one mint implementation exists.
6. Artwork storage: bytes live in tap-mcp's MCP_ARTWORK KV namespace;
   the business side drains by reference (section 5.3). Artwork is
   agent-supplied content in transit, not business data of record,
   until the drain lands it in the order's artwork home.
7. Key format and storage: (RETIRED 2026-11-09) no keys exist. The
   only stored capabilities are hash-only references (the artwork
   reference, the statusRef) in the shared MCP_KEYS namespace.
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
customer designs, produced in the build without blocking it. (Superseded 2026-11-08 by the delivered-proofs landing note at the top of this spec.)
enforced by the MCP's own tools (2.3, 2.5), free shipping listed
upfront in quote and recap, and no tax line in the MCP quote (2.3).

## 9. Build runbook for today, Nov 6, 2026

(Amended 2026-11-09: this runbook is the Nov 6 launch record and is history. Its key-issuance steps (9.2 item 3, 9.4) describe the retired model and are covered by the landing note at the top of this spec; the no-keys build follows the implementation outline in the 2026-11-09 landing record at the end of this document.)

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
- R2 (CLOSED 2026-11-09 by the no-keys ruling): key issuance no
  longer exists. No organization needs, receives, or is refused a
  key; there is no issuance act for Ryan, the CEO lane, or
  Engineering. The historical text of this item is superseded in
  full.
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
  not a stop. (Resolved 2026-11-09: Ryan's final-step ruling takes
  the seat-arm alternative. The mint lives in tap-mail's invoice
  module through the invocation seat, section 5.3 as amended; the
  two-implementations risk is retired with it.)
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

## 2026-11-08 F3 discovery honesty (landing record)

Two CEO rulings in sequence govern the keyless/keyed classification,
and this note records both, in the order they were made.

First ruling (2026-11-08, 22:00 CT): on the Design chat's keyless
exercise, which found get_discovery presenting get_order_questions
in a way that read as keyless while the tool itself refused keyless
calls, the CEO ruled that the tools stay KEYED and the discovery
copy is what changes. get_order_status and get_recap expose
order-specific data, so a keyless read would let anyone query any
order by reference; get_order_questions stayed keyed with them for
one consistent rule. The fix commissioned was copy only: split the
reads honestly into keyless and keyed sets on every surface, and
add a regression test asserting the published classification
matches actual key enforcement for every tool.

Amendment (2026-11-08, 22:01 CT, on the MCP cold-user test):
get_order_questions becomes KEYLESS. It reveals no organization
data; it is only the question set, and walling it was the single
worst cold-user friction, because the server itself directs users
to it right before the wall. get_order_status and get_recap stay
keyed, unchanged.

As landed: the classification is keyless reads get_discovery,
get_quote, get_product, get_artwork_spec, get_order_questions;
keyed reads get_recap, get_order_status; writes keyed as before
(submit_artwork and start_order_intent keep their optional-key and
keyless shapes). The one enforcement change is get_order_questions:
without a key it returns the static question set only (fields,
options, mounting and size choices), with NO organization block;
with a key it also returns the whoami block, and the contact-email
question and its note name the key's address only on keyed calls.
get_discovery's structured capabilities move get_order_questions
from keyedReadTools to readTools, and the GET self-description, the
initialize server description's companion copy, the key-request
line, the unauthorized error text, the tools/list descriptions,
the README, and the SKILL.md copies all state the same split; no
surface claims the reads as a class need no key. The regression
guard is test/discovery-key-honesty.test.ts: it probes every one
of the 12 tools without a key against in-memory fakes, asserts the
empirical split equals the published split exactly, asserts the
keyless order-questions answer carries no organization data while
the keyed answer carries the whoami block, and asserts the repo
docs carry the same classification. F3 is closed by this landing.

## 2026-11-08 pricing presentation, positioning, and flow (landing record)

Three rulings from Ryan, relayed by the CEO on 2026-11-08, landed
together as one copy state.

Pricing presentation (2026-11-08, about 23:38 CT): at the start,
the MCP lists ONLY the per-disc range, "Price range of $3.50 -
$5.00 per disc depending on quantity." Minimums, tier breakdowns,
discounts, and totals appear only at the very end, the quote step.
Applied to get_discovery (text and structured: the tiers array,
minimumQuantity, and the discount string come out; structured
pricing keeps the range line, free shipping, and the get_quote
pointer), the GET self-description and the initialize
instructions (the range line is the only pricing statement allowed
pre-quote), and get_product (no disc pricing beyond the range, and
no minimum stated anywhere, including the stands' minimum fields;
stand and badge product prices stay). The F27 intent headline no
longer quotes worked totals; it points at get_quote. get_quote and
everything after it keep the full detail unchanged: the tiers, the
100-disc minimum and its enforcement, the discount scope, and the
first-order payable total. This supersedes the 2026-11-07
settlement that kept tiers and minimumQuantity in discovery's
structured content; section 2.2.1's discovery contract is amended
accordingly in place above. Guard: test/pricing-presentation.test.ts
deep-scans the opening surfaces and the product payload for tier
structures, minimum statements, and discount mentions, and asserts
the quote step keeps its full detail.

Positioning (2026-11-08, about 23:39 CT, sharpened about 23:40
CT): the server is a tool first. It helps agents and users build
print-ready NFC tap designs, correct vector art, that they can
take to ANY vendor; there is no lock-in, and ordering through
Tap.Giving is the easy optional next step when they want it. On
every opening surface the LEAD identity is the tool that creates
print-ready NFC tap artwork proofs, proofs named in the lead; the
vendor-neutral point sits with the tool lead; ordering appears
only after, last and light, never in the lead sentence. The
canonical positioning sentence lives in src/facts.ts as
POSITIONING_LINE and leads the server description, the GET
self-description, the initialize instructions, and discovery's
text and structured introduction. get_artwork_spec and
submit_artwork carry the same point at the artwork moment: the
artwork composed from the spec is the organization's own,
print-ready and vendor-neutral. Honesty boundary, binding: the
server publishes the spec and design directions, the calling agent
composes the artwork with its own tools, submit_artwork takes the
finished file in and shows it back on the disc, and an emailed
proof follows only at the order stage; no copy claims the server
generates, renders, or exports finished proof files.

Flow (2026-11-08, about 23:40 CT): discovery's journey and
how-it-works walk the design and proof path first (artwork spec,
examples and build, artwork submission, proof), with the ordering
steps after and framed optional; the structured journey array and
capabilities.kickoff (now get_artwork_spec, previously
start_order_intent) carry the same order. The keyless tools'
nextStep guidance points toward proof creation before ordering;
submit_artwork's nextStep presents the proof path first and the
order path as the optional continuation, keeping its key-honesty
facts. No tool behavior, enforcement, key classification, or
payload contract changed beyond presentation order and nextStep
guidance; the protected verbatim strings (the range line, the
no-money line, the no-fees line) are byte-identical.

P-15 and P-16 addendum (Ryan rulings via the Cold-User Test chat,
2026-11-08, about 23:52 and 23:53 CT; CEO reword settled about
23:54 CT): placing an order never requires a key, and this server
does not mint invoices as part of placing an order. Placing an
order records it in the CRM and emails the full order to Ryan; he
personally follows up with the actual invoice. Consequences
landed in this pass: every key statement on the opening and
journey surfaces is scoped to what keys still govern (order
status, webhook registration, and the order questions' optional
organization block), discovery's published capabilities present
get_recap among the keyless reads with get_order_status as the one
keyed read (enforcement follows in the persona pass, which owns
the keyless placement build and the KEYED_WRITE_TOOLS
reclassification; the copy leads enforcement by that accepted
sequence), the placement path everywhere reads questions, recap,
place the order, then a person from Tap.Giving follows up with
the invoice, and the protected no-money sentence is replaced on
every surface with the settled wording: "This server moves no
money itself and issues no invoices: a person from Tap.Giving
follows up with the invoice." The other two protected strings are
unchanged. The visual standard (Ryan, 2026-11-08, about 23:52 CT)
also lands here: the server is visually driven and shows images at
every step where an honest image exists; get_quote now carries the
product photo, and the get_product mounting topic carries the
mounting photos alongside the product photo. No generated renders:
only existing verified assets or renders of the organization's own
submitted artwork.

## Persona Loop Round 1 landing record (2026-11-08, enforcement pass)

This pass closes the Cold-User Test chat's Persona Loop Round 1
findings P-1 to P-16 against the live server. It landed on top of
the pricing, positioning, and flow pass (commit 2546cb2) and the
examples/photos swap (commit 4467a6e, delivered-proof examples and
labeled photos, which this base contains). Suite at landing: 75
tests, all passing, including the re-pinned key-honesty guard.

Items, as landed:

- P-1 Samples: discovery (structured `samples` and text) and
  get_product (a `samples` topic) state there is no physical sample
  program, free or paid; the alternatives named are the delivered
  examples and photos in this server, the emailed proof of the
  buyer's own design before production, and the 30-day money-back
  guarantee on the order.
- P-2 Deadlines: get_quote carries a delivery-framing line beside
  the totals (production and delivery run 2 to 3 weeks from artwork
  approval, anchored on approving today). Discovery guidance
  computes a stated deadline against that window: inside 14 days it
  cannot be met; 14 to 20 days is at risk and turns on approval
  timing; no rush option exists and none is implied.
- P-3 Tax-exempt: guidance and the get_product ordering topic
  carry the verified facts only: say so when ordering, the
  tax-exempt state is recorded on the order, tax is calculated on
  the invoice where it applies.
- P-4 Guidance question map: a deterministic map over recognizable
  phrasings answers, before the next step: samples, tax-exempt,
  metal surfaces, app (none needed), destination changes (anytime,
  Redirect Dashboard), reorder (design stays on file), design help
  and no logo, payment (hosted invoice in the follow-up, card or
  ACH bank transfer), deadline, and under-minimum. One test per
  entry.
- P-5 Metal trap: get_quote warns whenever the anti-metal count is
  absent or zero that metal surfaces need the shielding layer and
  that it is decided before printing and cannot be added afterwards.
- P-6 Mounting photos: the get_product mounting topic carries the
  two mounting explainer photos plus the product photo (landed with
  the earlier passes; verified in this pass's tests).
- P-8 Surfaces: mounting copy carries the verified contrast only:
  adhesive for smooth surfaces where a no-holes fixing is wanted;
  screws through pre-drilled holes for a permanent fixing that does
  not rely on adhesive; screws are not included.
- P-9 Minimum early: see the pricing-rule exceptions below.
- P-10 Product prose: every get_product topic renders prose in the
  text channel; structured content is unchanged.
- P-11 Plain language: discovery carries a plain-language block:
  NFC in plain words (tap a phone, no app), and the key story as
  re-ruled by P-15 below.
- P-12 Print-ready export: submit_artwork's response carries an
  export block: the PRINT FILE (the submitted file itself, at the
  artwork capability URL) and a PRINT RENDER (PNG) at the same URL
  plus ".png", a full-resolution render derived from the submitted
  file, never from the preview composite; the response labels the
  ON-DISC PREVIEW as the mock composite it is. "Print-ready" means
  the artwork as submitted at full submitted resolution; nothing is
  validated, traced, or converted, and a raster exports as that
  raster. The export fetch is a keyless capability read and is
  published as such in discovery's capabilities.
- P-13 Verify-against-example: get_artwork_spec and submit_artwork
  carry the checklist (layout, palette, icon treatment, type
  hierarchy, safe zones, flat solid background) as an instruction
  to the calling agent, in text and as the structured
  `verifyAgainstExample` field, pinned by tests on both tools.
- P-14(a) The complete path: discovery's journey and numbered path
  present the whole road in order: design and proof path, quote,
  questions, recap, place the order, then the human follow-up
  (proof approval by email, then the invoice). Parts (b) and (c)
  are superseded by P-16 below.
- Objection layer: the DIY printed-code comparison (verified facts
  only: durable waterproof PVC, locked chip, per-disc re-pointing,
  no app) in product and guidance material; the QR-conditional
  stated plainly (a scannable QR appears only when the design
  carries a printed code; the tap works either way); screws not
  included in the mounting prose; the name-only path named in the
  artwork spec; the first-order discount's eligibility stated in
  plain words at the quote step only (the first order spends it;
  quoting does not; a fresh quote restarts the 7-day window).

Pricing-rule exceptions, named as such: the pricing presentation
rule (per-disc range only on opening surfaces; minimums, tiers,
discounts, and totals only at get_quote and after) has exactly two
guidance exceptions in this pass. (i) P-9: when the intent states a
quantity under 100, discovery guidance says plainly and early that
the smallest order is 100 discs, with the spread-the-extras
framing; guidance is intent-responsive, not opening copy. (ii)
P-2b: the deadline verdicts state the 2 to 3 week window against
the caller's own date; the window is a delivery fact, not a price.
No other addition puts a price, total, tier, or minimum statement
on discovery, GET, initialize, or get_product; the pricing guard
deep-scans those surfaces and stays green.

CEO-flagged unknowns (no copy written for any of these; flagged to
the CEO in this round): what tax-exempt documentation a buyer must
provide and whether the flag removes tax from the invoice; whether
the adhesive is safe on finished wood; check and purchase-order
payment (no such process exists in the record, and none is
mentioned anywhere); continuity, escrow, or wind-down commitments
for the redirect service; and any replacement, loss, or theft
policy. Product copy carries the verified material facts
(waterproof PVC, wipeable) and nothing beyond them.

### P-15 landing section: keyless placement (Ryan ruling, 2026-11-08)

Ruling: "Placing an order should never require a key."

Enforcement: get_recap and create_order no longer call requireKey.
A presented key keeps its exact prior behavior (whoami enrichment,
organization binding, TEST MODE semantics). Keyless is additive.

Classification as published and as enforced (the re-pinned guard,
test/discovery-key-honesty.test.ts, probes all 11 tools keyless):

- Keyless reads: get_discovery, get_quote, get_product,
  get_artwork_spec, get_order_questions, get_recap.
- Keyed read: get_order_status (unchanged).
- Writes: submit_artwork (key-optional), start_order_intent
  (keyless), create_order (key-optional; keyless under this
  ruling), register_webhook (keyed, unchanged).

Identity binding, keyless: the order binds to the flow's own data.
The recap record binds by the contact email collected in the flow;
create_order requires the recap to be the keyless recap for the
same contact email, derives the organization slug from the
organization name (the intent's, then the call's), falling back to
the email's local part, and stores a keylessBinding (contact email
and intent reference) on the order. A caller-named intentRef is
validated: the intent must exist and its captured email must equal
the order's contact email. Artwork submitted under an organization
key cannot be placed keyless (submit it again without the key, or
place with the key); the recapRef requirement, the recap drift
check, and create_order idempotency are preserved exactly.

Test-mode answer: a keyless placement has no mode, so it is a real
(live) placement, bounded by the human proof and payment gates,
exactly like intent capture, which is already real in every mode;
test isolation is scoped to order records and CRM adoption (the
Spec 3.3 amendment), and a keyless placement's records are live
records by design. A placement made WITH a test key stays in the
test lane exactly as before (DEV_ORDERS INVREQ record; no live
door call). Under P-16 the order email for a test-key placement is
visibly marked TEST (subject and first body line) and goes only to
the team's own alert inboxes.

Abuse bounds: intent capture's reserved-domain refusal and
per-email dedupe; the recap-then-order sequence with the recap
bound to the order's contact email; the intentRef email-match
validation above; rate limits at the capture door; and the human
gates (proof approval by email; the invoice follow-up) before
anything is produced or paid.

Scope call: get_order_status and register_webhook stay keyed in
this pass (the ruling named placement only). The tension is
recorded: a keyless placer cannot read their own order status
until a key is issued by email. Options for a later ruling: a
capability-style status reference minted at order time, or
email-based status.

Guard note: test/discovery-key-honesty.test.ts now pins this P-15
contract empirically (published classification equals keyless
enforcement for all 11 tools), replacing the earlier pin; the
guard's structure and its pre-fix failure discipline are unchanged.

### P-16 landing section: record plus email, no server invoices (Ryan ruling, 2026-11-08)

Ruling: "It should literally just email me the order and record it
in the CRM, then it's my job to follow up with the actual invoice."

Placement is exactly two effects. (1) The CRM record: create_order's
existing POST to the website's own invoice-request door, writing
the same INVREQ record the website writes (test mode: the
DEV_ORDERS INVREQ write), unchanged, idempotency and recapRef
requirement preserved. (2) NEW: the full order emailed to the team.
Investigation found the existing door notification insufficient:
the tap-order handler's notify call carries only a subset (no
contact name, shape or size, mounting, destination URL, artwork
reference, or shipping address), so the email step was built:
create_order calls the tap-mail invocation seat (POST
/api/mcp-invoke, the server's existing authenticated seat) with a
new op, notifyOrderPlaced, after the record write is durable. The
seat composes a plain-text, recap-style email carrying the whole
order: organization, contact name, contact email, contact phone,
quantity, shape and size, mounting, anti-metal count, destination
URL, artwork reference, shipping address with phone, and the
quoted totals as quoted (discs, shielding, first-order total),
plus the order reference and CRM record reference. Recipients: the
business's own order-alert addresses (Ryan's inbox and the
duplicate alert inbox, from the machinery's exported recipient
constants in worker/tap-mail). The subject carries no dollar
amount. The seat op landed in the business repo (commit fec7e3dc)
and the tap-mail Worker deployed (version 841f4ba0) BEFORE this
pass deployed tap-mcp.

Confirmation shape: create_order's response confirms both effects:
the record reference and `orderEmail` (sent, seat, and the seat's
message reference), under the plain confirmation "Your order is
placed, and a person from Tap.Giving will follow up with your
invoice."

Email-failure behavior: partial success, decided and tested. The
record is durable first, the email second; if the email fails, the
placement stands, the failure is logged loudly in the server logs,
recorded on the order record, and stated plainly in the response;
an idempotent replay re-attempts a failed email and never re-sends
a sent one.

request_invoice: REMOVED. No legitimate non-placement caller could
be named; its only story was placement, which this ruling ends.
Fallout handled in the same pass: the tool registry (11 tools),
the honesty guard's classification, discovery capabilities and
journey, README, both SKILL.md copies, this spec, and the contract
test's tool-set pin. The Stripe mint path on tap-mcp (mintInvoice
and its memo builder) is removed with it; Stripe reads remain for
get_order_status's display of invoices that already exist.
F22 disposition: the mint-time reused-invoice comparison is
deleted with the mint; the eligibility rule it fed survives
(create_order's discount scan still treats an order carrying an
invoice as having spent first-order eligibility), and the stored
comparison fields on historical order records are still read, and
named in plain text, by get_order_status. Nothing recomputes them.

Test-mode treatment of both effects: a test-key placement writes
the DEV_ORDERS INVREQ record (never the live door) and sends the
order email marked TEST to the team's alert inboxes only. A
keyless placement has no test lane (see the P-15 test-mode answer).

Protected-string confirmation: the CEO reword settled 2026-11-08
is in force on every surface after this landing: "This server
moves no money itself and issues no invoices: a person from
Tap.Giving follows up with the invoice." The retired invoice-link wording has zero occurrences on the
shipped surfaces (src, README, both SKILL.md copies, package.json,
plugin.json, server.json) after this landing; it survives only in
the honesty guards absence-pin constant and in section 2.7s
historical record of the retired tool, both deliberate. The other
two protected strings are byte-identical to before.

### Visual standard: per-tool image map after this landing

- get_discovery: yes. The labeled photo set in structured content
  plus the phone-tap product photo inline.
- get_quote: yes. The product photo.
- get_product: yes. The labeled photos; the mounting topic adds
  both mounting explainer photos.
- get_artwork_spec: yes. The delivered-proof examples, the mounting
  photos, and the explainer photo set.
- submit_artwork: yes. The submission's own on-disc preview.
- start_order_intent: none. No honest image exists for an email
  capture.
- get_order_questions: yes. Mounting option images in the question
  set.
- get_recap: yes. The order's own artwork rendered on the disc.
- create_order: yes. The order's artwork render, where the order
  carries artwork.
- get_order_status: yes, where the order carries artwork: the
  submitted artwork shown on the disc, labeled as submitted artwork
  and not the proof; where the order carries none, no image, and
  the text states the proof arrives by email.
- register_webhook: none. No honest image exists for a callback
  registration.

No generated renders anywhere: only verified existing assets, the
delivered-proof examples, labeled website photos, or renders of
the organization's own submitted artwork. A preview composite is
never labeled a proof or a print file (the P-12 discipline).

## 2026-11-09 Persona Loop Round 2 residual: quote eligibility line in the text channel

The round 2 re-run found the P-5 eligibility sentence ("the first-order discount belongs to an organization's first order. Getting a quote does not use it up...") present in get_quote's structured discountEligibility field but absent from its text channel, which is the channel the personas read. quoteText now renders the same discountEligibility line, and the persona-round test pins both channels. No other behavior changed.

## 2026-11-09 no-keys, two-part flow, and final-step chain (landing record)

Ryan's rulings of 2026-11-09, landed in this spec the same day as a
spec amendment (no code changed by this record; the build follows
the design brief's implementation outline, spec first). What
changed, by section: the landing note at the top of this document
(new); the preamble positioning and launch-scope lines; section 1
banner; 2.0 and 2.0.1 (endpoint URL only; the shared namespace);
2.1 (retired, replaced by the no-credentials contract); 2.2.1
(price-free discovery, one tool list); 2.3 and 2.4 (Part 2 totals;
Part 1 product facts price-free); 2.5 (retitled; the final-step
chain; Ryan's phase-two field order); 2.6 (delivered-artwork
templates with the curated data fields, the website logo pull,
P-13 with data, the agent-produces-PDF output standard, the QR
rules and glossary, designUrl); 2.7 (banner: the mint returns via
the seat; the parity contract here is its spec source); 2.8
(retitled; the capability reference); 2.9 (credential codes
retired); 2.9.1 (webhook retirement, settled 2026-11-09); 2.10 (capability
references); 2.11 (rewritten wholesale: Part 1 DESIGN, Part 2
ORDER, the collection-order deltas called out one by one, the
final step's exact label); 2.12 (zero-credential requirement);
section 3 (rewritten as identity-without-credentials; 3.1.1 and
3.5 retired; 3.3's test-isolation amendment banner-marked and the
test lane recorded as settled 2026-11-09; 3.4's key promise corrected);
section 4 (Gate 3 renamed to the production handoff; Gate 1
updated for the final-step chain); 5.1, 5.3, 5.4 (the seat at five
operations; the adoption-collision verification; invoice minting's
single home); section 6 (the no-keys model in the published
summary); section 7 (mint consolidation realized; the OAuth item
closed); section 8 items 5 and 7; section 10 (R2 closed; B1
resolved by the seat arm); section 9 banner (history).

Settled by the rulings and written as contract above: no keys
anywhere; the two-part structure; Part 1 collecting nothing but
the design URL; delivered-artwork templates only; zero pricing in
Part 1; the agent as the PDF's producer; Ryan's collection order;
the final-step chain with P-16 superseded in its no-invoice clause;
the capability-reference status read; the supplier never named in
this repo.

Recorded as PROPOSALS at the spec pass, and SETTLED by the CEO
2026-11-09 (about 15:29 CT), all seven, now contract: the
identity-based test lane as designed (landing note; section 3.3);
the retirement of register_webhook in v1 with the capability-bound
v1.1 path (section 2.9.1); the replacement protected string and
confirmation text verbatim (section 3.1); shapes promotion in the
design spec and example system (the marketed set: 100/75/50 mm
round and square, the 85.5 x 54 mm credit-card rectangle, the
140 x 104 mm rectangle sign; the order path stays at the two
built-ins, and pick-list examples come only from real delivered
artwork: the example set holds 25 round and 2 square, zero
rectangles, because the Highlands credit-card proof's delivered
leg did not verify firsthand, so no rectangle example ships);
the finalized-at-placement risk accepted at Ryan's direction;
the explainer wordings settled as: the reorder fact stated plainly
with no replacement implication, and the QR-sticker value case
HELD OUT of the explainer entirely until a sourced wording exists
(the approval-workflow question has no sourced answer anywhere
and the explainer omits it, the gap named here). Per-example size
in the curated example data rests on the production proof
geometry (the 106 mm artboard is the 100 mm plate). The settled
protected string, verbatim, on one line for the guards: "This server moves no money itself: when an order is placed, Tap.Giving emails the invoice and the design proof, and a person pays the hosted invoice." The settled confirmation text, verbatim: "Your order is placed, and your invoice and design proof are on their way to <contactEmail>. A person from Tap.Giving follows up from there; production waits for your proof approval, and the invoice is paid on its hosted page." 

Resolved 2026-11-09: the phase-one design QR and production
encoding question is settled by CEO approval of recommendation A
(a labeled mock built from the entered URL, with production
encoding the Redirect Dashboard link to that destination,
changeable anytime); surfaces assert it as written in section 2.11
and the artwork spec.

Contradictions with the design brief found while landing this
amendment: none in the brief's facts. Two notes for the record:
the brief's census found the old protected string once in this
spec, inside the P-16 landing record; it also stands in section
3.1's settled-sentence parenthetical, amended above, and the
brief's nine-live-key-records count and the server code remain the
build's concern, not this spec pass's.


Landing note (2026-11-09, Goal 1 cold-run fix pass): the cold run
against the deployed build scored 7 of 9, with two FAILs, both
fixed here. (1) The pick list printed global index positions while
the resolver read per-shape positions, so printed numbers 14 and
above selected a different example than the label promised. One
numbering now: per shape, sequential from 1, printed in the list,
carried as the structured pick field, and read by the resolver; a
guard test picks every printed number and verifies the labeled
example returns. (2) Picks by description text returned
invalid_input; the resolver now accepts an exact normalized
description match or a unique prefix or substring match, and an
ambiguous fragment refuses naming the candidates. (3) The ferrite
per-disc charge sentence and the zero-price claims (at the same
price, at no extra cost, Free shipping, No subscription fees, free
Redirect Dashboard, the 30-day money-back guarantee) are out of
every phase-one surface (CEO ruling, Ryan's spec: phase 1 carries
ZERO pricing references, full stop); each stays available at the
phase-two order questions, and the pricing guard fails on the
whole pattern class in phase one. Section 2.6's benefits-block
contract element moves with them: the phase-one block is the
three functional differentiators, and the full set rides the
order questions.

Landing note (2026-11-09, conditional confirmation fix): the
end-to-end user run against the live build (test-lane identity
e2e-20261109@e2echecktest.org, order
mcp:test-mcp-e2e-do-not-contact:57ec265bf7b559a2) found one
defect, copy-level. In the invoice_pending partial state the
create_order response contradicted itself: the settled
confirmation sentence ("Your order is placed, and your invoice
and design proof are on their way to <email>. ...") appeared in
the same response as "Invoice: not minted yet" and the
invoice_pending partial-state line. The settled confirmation is
now conditional on the chain's outcome. It stays byte-identical
on the success path (invoice minted, and the customer email
sent, or suppressed by the test lane's standing rule, where
placement completes without one). Every partial state carries
its own plain-words confirmation instead, in the structured
confirmation field, the response text, and the closing
next-step line: invoice_pending states the invoice step did not
complete and the follow-up runs from the order record;
invoice_held states the hold and its resolution (a failed team
notification keeps the same held wording); proof_pending states
the invoice is issued and the invoice and proof email is sent
once the design proof is published; customer_email_failed
states the send failure behind a standing invoice. No partial
confirmation claims an invoice or a proof email is on its way.
Regression tests pin both branches: the settled sentence
verbatim for success, and each partial wording with no
on-their-way claim anywhere in its response. get_order_status
was read and needed no change: its invoice line already states
the recorded mint state ("Invoice: not minted yet; the order
record carries the mint state, and the team follows up from the
record."). Chain behavior is unchanged: mint, email, record,
and replay semantics are untouched; this is presentation only.
