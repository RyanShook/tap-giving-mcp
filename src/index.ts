// tap-mcp: the Tap.Giving MCP server, "NFC Tap Builder by Tap.Giving".
//
// MCP over Streamable HTTP, JSON-RPC 2.0, stateless per request.
// Implements initialize, tools/list, tools/call. Notifications are
// accepted and ignored. The endpoint is POST https://tap.giving/mcp;
// a plain GET on it returns the human-and-agent readable
// self-description, GET /mcp/artwork/<ref> serves stored submission
// bytes at a capability URL, GET /mcp/examples/<id>.png serves the
// delivered-proof examples (bytes in the MCP_ARTWORK KV namespace),
// and GET /mcp/photos/<id>.webp serves the labeled photo set.
//
// Spec: documentation/mcp-connector-surface-spec-2026-11-06.md in the
// business repo; the published copy is docs/spec.md in this repo.

import type { Env } from "./env.ts";
import { ENDPOINT, GATES, KEY_REQUEST_LINE, POSITIONING_LINE, REPO_URL, SERVER_DESCRIPTION, SERVER_NAME } from "./facts.ts";
import { PRODUCT_PHOTOS, TOOLS, artworkBytesKey, readArtworkRecord, runTool } from "./tools.ts";
import { buildTemplateSvg, renderArtworkFileToPng } from "./preview.ts";
import { ToolError, isRecord } from "./errors.ts";
import { DETECTED_MEDIA_TYPE } from "./sniff.ts";
import { EXAMPLES_INDEX } from "./examples-data.ts";
import { PHOTOS_INDEX } from "./photos-data.ts";

const PROTOCOL_VERSION = "2025-03-26";
const UNAUTH_LIMIT = 120; // per IP per 10 minutes on the keyless surface
const INTENT_LIMIT = 10; // per IP per hour, mirroring /api/lead's own cap

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function rateLimit(env: Env, request: Request, toolName: string | null): Promise<boolean> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const checks: Array<{ key: string; limit: number; windowMs: number }> = [
    { key: `RL:${ip}:${Math.floor(now / 600_000)}`, limit: UNAUTH_LIMIT, windowMs: 600_000 },
  ];
  if (toolName === "start_order_intent") {
    checks.push({ key: `RLI:${ip}:${Math.floor(now / 3_600_000)}`, limit: INTENT_LIMIT, windowMs: 3_600_000 });
  }
  for (const c of checks) {
    const raw = await env.MCP_KEYS.get(c.key);
    const count = raw ? parseInt(raw, 10) || 0 : 0;
    if (count >= c.limit) return false;
    if (!request.headers.get("Authorization")) {
      await env.MCP_KEYS.put(c.key, String(count + 1), { expirationTtl: Math.ceil(c.windowMs / 1000) + 60 });
    }
  }
  return true;
}

function selfDescription(): string {
  const toolLines = TOOLS.map((t) => `- ${t.name}: ${t.description.split(". ")[0]}.`).join("\n");
  return [
    `# ${SERVER_NAME}`,
    ``,
    POSITIONING_LINE,
    ``,
    SERVER_DESCRIPTION,
    ``,
    `Endpoint: POST ${ENDPOINT} (MCP over Streamable HTTP, JSON-RPC 2.0, stateless).`,
    `Repository: ${REPO_URL}`,
    ``,
    `## Connect`,
    `Paste-ready client config (the keyless read side works as-is):`,
    ``,
    `{`,
    `  "mcpServers": {`,
    `    "tap-giving": {`,
    `      "type": "http",`,
    `      "url": "${ENDPOINT}"`,
    `    }`,
    `  }`,
    `}`,
    ``,
    `Placing an order needs no key and no header. To present a key for the organization-bound surfaces (order status, webhook registration, and the order questions' organization block), add it to the same block: "headers": { "Authorization": "Bearer <key>" }.`,
    `Claude Code: claude mcp add --transport http tap-giving ${ENDPOINT}`,
    `Discovery, product facts, the artwork spec, and the order questions need no key; exact totals come from get_quote at the end. Placing an order needs no key: the whole placement run is keyless (the order questions, the recap, and placing the order), and a person from Tap.Giving follows up with the invoice. Order status is the one read that uses the organization's key.`,
    ``,
    `## Tools`,
    toolLines,
    ``,
    `## Auth`,
    `Keyless reads (get_discovery, get_quote, get_product, get_artwork_spec, get_order_questions, get_recap) need no key. Submitted artwork is fetchable at its capability URL (/mcp/artwork/<ref>, and the same address with .png on the end for the print render): a keyless capability read, where the artwork reference itself is the capability.`,
    `Placing an order needs no key: the recap and order setup run keyless, and a person from Tap.Giving follows up with the invoice. Order status is the read that needs the organization's key, and webhook registration is the write that needs it: Authorization: Bearer <redacted><orgslug>_<secret> Test keys look the same with tg_test_ in place of tg_live_: tg_test_<orgslug>_<secret>.`,
    KEY_REQUEST_LINE,
    `Evaluating this server? A test key runs the full journey, including placing a test order, with no real order and no charge. There is no self-serve signup: email hello@tap.giving and ask for a test key, and the team replies with one within one business day.`,
    `register_webhook is an optional developer tool; most organizations never need it. Order status is read with get_order_status.`,
    ``,
    `## Human gates`,
    ...Object.values(GATES).map((g) => `- ${g}`),
    ``,
    `This server moves no money itself and issues no invoices: a person from Tap.Giving follows up with the invoice.`,
  ].join("\n");
}

function rpcError(id: unknown, code: number, message: string, data?: unknown): Response {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } });
}

function toolErrorResult(id: unknown, err: ToolError): Response {
  return json({
    jsonrpc: "2.0",
    id,
    result: {
      content: [
        { type: "text", text: `${err.code}: ${err.message}` },
      ],
      structuredContent: { error: err.structured() },
      isError: true,
    },
  });
}

async function handleRpc(env: Env, request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error: the body must be a JSON-RPC 2.0 request.");
  }
  if (Array.isArray(body)) {
    return rpcError(null, -32600, "Batch requests are not supported in v1; send one JSON-RPC request per POST.");
  }
  if (!isRecord(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(isRecord(body) ? body.id : null, -32600, "Invalid request: a JSON-RPC 2.0 object with a method is required.");
  }
  const id = body.id;
  const method = body.method;

  if (method.startsWith("notifications/")) {
    return new Response(null, { status: 202 });
  }
  if (method === "ping") return json({ jsonrpc: "2.0", id, result: {} });

  if (method === "initialize") {
    const params = isRecord(body.params) ? body.params : {};
    const clientVersion = typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION;
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: clientVersion,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, title: SERVER_NAME, version: "1.0.0" },
        instructions: SERVER_DESCRIPTION,
      },
    });
  }

  if (method === "tools/list") {
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
        })),
      },
    });
  }

  if (method === "tools/call") {
    const params = isRecord(body.params) ? body.params : {};
    const name = typeof params.name === "string" ? params.name : "";
    const args = isRecord(params.arguments) ? params.arguments : {};
    const def = TOOLS.find((t) => t.name === name);
    if (!def) return toolErrorResult(id, new ToolError("not_found", `Unknown tool: ${name}.`));
    if (!(await rateLimit(env, request, name))) {
      return toolErrorResult(id, new ToolError("rate_limited", "Rate limit reached for this caller. Wait and retry."));
    }
    try {
      const result = await runTool(env, request, name, args);
      const content: Array<Record<string, unknown>> = [{ type: "text", text: result.text }];
      if (result.image) {
        content.push({ type: "image", data: result.image.data, mimeType: result.image.mimeType });
      }
      if (result.images) {
        for (const img of result.images) {
          content.push({ type: "image", data: img.data, mimeType: img.mimeType });
        }
      }
      return json({
        jsonrpc: "2.0",
        id,
        result: { content, structuredContent: result.structured, isError: false },
      });
    } catch (e) {
      if (e instanceof ToolError) return toolErrorResult(id, e);
      console.error(`tools/call ${name} failed:`, (e as Error).stack || (e as Error).message);
      return toolErrorResult(id, new ToolError("internal", "An internal error occurred. Nothing about this call was recorded as completed; retrying is safe for idempotent tools."));
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}. This server implements initialize, tools/list, and tools/call.`);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(bin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/mcp" || url.pathname === "/") {
      if (request.method === "GET") {
        return new Response(selfDescription(), {
          status: 200,
          headers: { "Content-Type": "text/markdown; charset=utf-8" },
        });
      }
      if (request.method === "POST") return handleRpc(env, request);
      return new Response("Method not allowed. POST JSON-RPC to this endpoint; GET returns its description.", { status: 405 });
    }

    // Delivered-proof examples, served for display. Bytes live in
    // the MCP_ARTWORK KV namespace (EXAMPLE:<id>), uploaded from the
    // delivered proof files by tools/build-assets.mjs; the metadata
    // index is src/examples-data.ts. Unknown ids, including the six
    // retired house templates, return 404.
    const exMatch = /^\/mcp\/examples\/([a-z0-9-]+)\.png$/.exec(url.pathname);
    if (exMatch && (request.method === "GET" || request.method === "HEAD")) {
      if (!EXAMPLES_INDEX.some((e) => e.id === exMatch[1])) return new Response("not found", { status: 404 });
      const buf = await env.MCP_ARTWORK.get(`EXAMPLE:${exMatch[1]}`, "arrayBuffer");
      if (!buf) return new Response("not found", { status: 404 });
      const bytes = new Uint8Array(buf);
      const headers = { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", "Content-Length": String(bytes.length) };
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      return new Response(bytes as unknown as BodyInit, { status: 200, headers });
    }


    // The artwork template, with guide layers (F12).
    const tplMatch = /^\/mcp\/templates\/disc-template-(round|square)\.svg$/.exec(url.pathname);
    if (tplMatch && (request.method === "GET" || request.method === "HEAD")) {
      const svg = buildTemplateSvg(tplMatch[1] as "round" | "square");
      const headers = { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400", "Content-Length": String(new TextEncoder().encode(svg).length) };
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      return new Response(svg, { status: 200, headers });
    }

    // Product photos, served for display (the same bytes the tools
    // return inline).
    const photoMatch = /^\/mcp\/photos\/([a-z0-9-]+)\.webp$/.exec(url.pathname);
    if (photoMatch && (request.method === "GET" || request.method === "HEAD")) {
      const photo = PRODUCT_PHOTOS.find((x) => x.id === photoMatch[1]);
      if (!photo) {
        // The labeled photo set beyond the embedded phone-tap photo is
        // served from the MCP_ARTWORK KV namespace (PHOTO:<id>).
        if (!PHOTOS_INDEX.some((p) => p.id === photoMatch[1])) return new Response("not found", { status: 404 });
        const buf = await env.MCP_ARTWORK.get(`PHOTO:${photoMatch[1]}`, "arrayBuffer");
        if (!buf) return new Response("not found", { status: 404 });
        const kvBytes = new Uint8Array(buf);
        const kvHeaders = { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400", "Content-Length": String(kvBytes.length) };
        if (request.method === "HEAD") return new Response(null, { status: 200, headers: kvHeaders });
        return new Response(kvBytes as unknown as BodyInit, { status: 200, headers: kvHeaders });
      }
      const bytes = Uint8Array.from(atob(photo.data), (c) => c.charCodeAt(0));
      const headers = { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400", "Content-Length": String(bytes.length) };
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      return new Response(bytes as unknown as BodyInit, { status: 200, headers });
    }

    // P-12: the print render of a submission: a full-resolution PNG
    // rendered FROM THE SUBMITTED FILE (never from the on-disc
    // preview composite), at the same capability URL with .png on
    // the end. Formats with no honest render here (PDF) answer 415
    // and say so; the file itself stays fetchable at the base URL.
    const pngMatch = /^\/mcp\/artwork\/(art_[a-z0-9]+)\.png$/.exec(url.pathname);
    if (pngMatch && (request.method === "GET" || request.method === "HEAD")) {
      const ref = pngMatch[1];
      const record = await readArtworkRecord(env, ref);
      if (!record) return new Response("not found", { status: 404 });
      const stored = await env.MCP_ARTWORK.get(artworkBytesKey(ref), "arrayBuffer");
      if (!stored) return new Response("not found", { status: 404 });
      const png = await renderArtworkFileToPng(new Uint8Array(stored), record.detectedType, record.width, record.height);
      if (!png) {
        return new Response("This submitted file cannot be rendered to a PNG here; the file itself is served at the same address without the .png ending.", { status: 415 });
      }
      const headers = { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600", "Content-Length": String(png.length), "X-Content-Type-Options": "nosniff" };
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      return new Response(png as unknown as BodyInit, { status: 200, headers });
    }

    // Stored submission bytes at a capability URL. The artworkRef is
    // the capability (unguessable, hash-derived); the bytes are never
    // served from a tap.giving origin AS A PAGE: the response is a
    // download-typed image/document with script execution sandboxed
    // off, per the intake boundary in spec 2.6.
    const artMatch = /^\/mcp\/artwork\/(art_[a-z0-9]+)$/.exec(url.pathname);
    if (artMatch && request.method === "GET") {
      const ref = artMatch[1];
      const record = await readArtworkRecord(env, ref);
      if (!record) return new Response("not found", { status: 404 });
      const bytes = await env.MCP_ARTWORK.get(artworkBytesKey(ref), "arrayBuffer");
      if (!bytes) return new Response("not found", { status: 404 });
      const contentType = DETECTED_MEDIA_TYPE[record.detectedType] || record.mediaType;
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${record.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
          "Content-Security-Policy": "sandbox",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    return new Response("not found", { status: 404 });
  },
};
