// The SEP-2127 server card this server serves about itself at
// GET /mcp/server-card. The well-known seat
// (https://tap.giving/.well-known/mcp/server-card.json, served by
// the site Worker from the business repo) publishes the same
// card. The two seats cannot share a module: separate repos,
// separate Workers, and no build step joins them (and this repo
// is the public one, so it cannot import the business repo's
// file at deploy time). So this card is DERIVED from this
// server's own canonical sources instead of copied: the tool
// list is the live TOOLS registry that tools/list serves, the
// endpoint, repository, and title are the facts module's
// constants, and the protocol version is the one initialize
// negotiates, passed in by src/index.ts, its owner. The card
// therefore cannot drift from the server it describes. What has
// no runtime source in this server is card metadata (the
// registry name, the card description, the schema URL, the
// website and guide URLs, the version string): those are the
// constants below, and the tests pin them, the version and name
// against server.json, where a second source exists. The access
// statement is the facts module's settled sentence, the same
// wording the well-known card serves verbatim.

import { ACCESS_STATEMENT, ENDPOINT, REPO_URL, SERVER_NAME } from "./facts.ts";
import { TOOLS } from "./tools.ts";

export const SERVER_CARD_SCHEMA_URL =
  "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json";
export const SERVER_CARD_NAME = "io.github.ryanshook/tap-giving-mcp";
export const SERVER_VERSION = "1.0.0";
export const SERVER_CARD_DESCRIPTION =
  "Design and order custom NFC tap discs for organizations of every kind.";
export const SERVER_WEBSITE_URL = "https://tap.giving/";
export const AGENTS_GUIDE_URL = "https://tap.giving/for-agents.html";

export function buildServerCard(protocolVersion: string): Record<string, unknown> {
  return {
    $schema: SERVER_CARD_SCHEMA_URL,
    name: SERVER_CARD_NAME,
    version: SERVER_VERSION,
    title: SERVER_NAME,
    description: SERVER_CARD_DESCRIPTION,
    websiteUrl: SERVER_WEBSITE_URL,
    repository: { url: REPO_URL, source: "github" },
    remotes: [
      {
        type: "streamable-http",
        url: ENDPOINT,
        supportedProtocolVersions: [protocolVersion],
      },
    ],
    "io.github.ryanshook/access": {
      statement: ACCESS_STATEMENT,
      guide: AGENTS_GUIDE_URL,
    },
    "io.github.ryanshook/tools": TOOLS.map((t) => t.name),
  };
}
