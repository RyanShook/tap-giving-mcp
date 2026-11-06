# Tap.Giving MCP Server

This is the public MCP (Model Context Protocol) server for [Tap.Giving](https://tap.giving). It lets AI agents work with Tap.Giving directly from inside their own window: get pricing and quotes, set up an order, request an invoice, and check order status.

Tap.Giving makes custom NFC tap discs for churches and nonprofits. A visitor taps a phone on a disc and lands on the organization's giving page. This server exposes the ordering pipeline behind those discs to agents acting for an organization.

## What v1 will do

The first version covers the core journey, nothing more:

- **Pricing and quote**: the standing per-disc tiers, sizes, mounting options, and shipping, quoted exactly.
- **Order setup**: organization identity, quantity, size, mounting, and ship-to, entered through the same pipeline a website order takes, into the same records a website order creates.
- **Invoice request**: a real Stripe hosted invoice for the order, with the invoice link returned to the agent.
- **Order status lookup**: where an order stands, from first capture through delivery.

Design and proof creation is planned as v1.1, after v1 is live.

## The human gates stay human

This server prepares work and requests invoices. It does not finish the steps that belong to people:

- It never takes payment. An invoice request returns a hosted invoice link; a person pays it.
- It never approves a design. A person reviews and approves every proof before production.
- It never releases anything to production. Production and supplier handoff stay behind human approval.

## Access

The server will be publicly reachable on the open web: any agent, anywhere, can find it and connect. Read tools (pricing, product facts, status shape) are open. Write actions (order setup, invoice request) use an API key issued to the organization the agent acts for, and the key scopes what that agent can do.

## Status

Spec and tool contracts land today, Friday November 6, 2026. V1 goes live by end of Saturday, November 7, 2026.

SPEC PENDING: the full spec and tool contracts are being finalized today and will be committed to this repo as they land.
