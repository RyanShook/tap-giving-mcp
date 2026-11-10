// tap-mcp: the Tap.Giving MCP server, "NFC Tap Builder by Tap.Giving".
//
// MCP over Streamable HTTP, JSON-RPC 2.0, stateless per request.
// Implements initialize, tools/list, tools/call. Notifications are
// accepted and ignored. The endpoint is POST https://tap.giving/mcp;
// a plain GET on it returns the human-and-agent readable
// self-description, GET /mcp/artwork/<ref> serves stored submission
// bytes at a capability URL, GET /mcp/examples/<id>.png serves the
// delivered-proof examples (bytes in the MCP_ARTWORK KV namespace),
// and GET /mcp/photos/<id>.webp serves the labeled photo set,
// and GET /mcp/server-card serves this server's SEP-2127
// server card (src/server-card.ts).
//
// Spec: documentation/mcp-connector-surface-spec-2026-11-06.md in the
// business repo; the published copy is docs/spec.md in this repo.

import type { Env } from "./env.ts";
import { ENDPOINT, GATES, POSITIONING_LINE, PROTECTED_STRING, REPO_URL, SERVER_DESCRIPTION, SERVER_NAME } from "./facts.ts";
import { EXPLAINER_TOPICS, explainerResourceUri, findExplainerTopic } from "./explainer.ts";
import { PRODUCT_PHOTOS, TOOLS, artworkBytesKey, readArtworkRecord, runTool } from "./tools.ts";
import { buildTemplateSvg, renderArtworkFileToPng } from "./preview.ts";
import { buildServerCard } from "./server-card.ts";
import { ToolError, isRecord } from "./errors.ts";
import { DETECTED_MEDIA_TYPE } from "./sniff.ts";
import { EXAMPLES_INDEX } from "./examples-data.ts";
import { PHOTOS_INDEX } from "./photos-data.ts";

const PROTOCOL_VERSION = "2025-03-26";
const UNAUTH_LIMIT = 120; // per IP per 10 minutes, universal: there are no credentials to bypass it
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
    await env.MCP_KEYS.put(c.key, String(count + 1), { expirationTtl: Math.ceil(c.windowMs / 1000) + 60 });
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
    `Paste-ready client config:`,
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
    `Claude Code: claude mcp add --transport http tap-giving ${ENDPOINT}`,
    `No account, key, or login at any point: connect and use every tool as-is. Nothing needs a header, and a header, if a client sends one anyway, is ignored. The design phase states no prices; prices are first stated at the order questions, and exact totals come from get_quote and the recap.`,
    ``,
    `## Tools`,
    toolLines,
    ``,
    `## Explainer`,
    `Resources (tapgiving://explainer/<topic>) explain how it works and where you are: how-it-works, what-a-tap-disc-does, nfc-vs-qr, the-two-phases, after-you-order, materials-and-care. The prompt explain_where_i_am answers a stuck user with the step they are on.`,
    ``,
    `## Access`,
    `There are no credentials on this server. Submitted artwork is fetchable at its capability URL (/mcp/artwork/<ref>, and the same address with .png on the end for the print render): the artwork reference itself is the capability, within 30 days of submission. Order status is read with get_order_status and the order's status reference, shown once at placement and carried in the customer email; it cannot be recovered if lost.`,
    ``,
    `## Human gates`,
    ...Object.values(GATES).map((g) => `- ${g}`),
    ``,
    PROTECTED_STRING,
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
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: SERVER_NAME, title: SERVER_NAME, version: "1.0.0" },
        instructions: SERVER_DESCRIPTION,
      },
    });
  }

  if (method === "resources/list") {
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        resources: EXPLAINER_TOPICS.map((t) => ({
          uri: explainerResourceUri(t.slug),
          name: t.title,
          description: `Explainer: ${t.title}.`,
          mimeType: "text/plain",
        })),
      },
    });
  }

  if (method === "resources/read") {
    const params = isRecord(body.params) ? body.params : {};
    const uri = typeof params.uri === "string" ? params.uri : "";
    const topic = findExplainerTopic(uri);
    if (!topic) return rpcError(id, -32602, `Unknown resource: ${uri}. Resources live under tapgiving://explainer/<topic>.`);
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        contents: [{ uri, mimeType: "text/plain", text: `# ${topic.title}\n\n${topic.body}` }],
      },
    });
  }

  if (method === "prompts/list") {
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        prompts: [{
          name: "explain_where_i_am",
          description: "For a stuck user: name the step they are on in the two-phase journey (design, then the optional order), what this step needs, and the one next action. Point at the explainer resources for the fuller walk-through.",
          arguments: [{ name: "step", required: false, description: "Optional: the tool or step the user is stuck on (for example get_artwork_spec, submit_artwork, get_recap, create_order, get_order_status)." }],
        }],
      },
    });
  }

  if (method === "prompts/get") {
    const params = isRecord(body.params) ? body.params : {};
    const name = typeof params.name === "string" ? params.name : "";
    if (name !== "explain_where_i_am") return rpcError(id, -32602, `Unknown prompt: ${name}.`);
    const args = isRecord(params.arguments) ? params.arguments : {};
    const step = typeof args.step === "string" ? args.step : "";
    const where = step
      ? `The user is stuck at: ${step}. Locate that step in the journey below, say what it needs, and give the one next action.`
      : "The user is stuck and has not named a step. Ask which step they are on, or orient them from the journey below.";
    const text = [
      "You are explaining the NFC Tap Builder journey to a stuck user, in plain words, one step at a time.",
      where,
      "The journey has two phases. Phase one is design and collects nothing: get_discovery orients, get_artwork_spec returns the spec and the delivered examples, the user's own agent composes the artwork and produces the print-ready PDF, and submit_artwork returns the on-disc proof. Keeping the file is a complete outcome.",
      "Phase two is the optional order: start_order_intent captures the contact email first, get_order_questions lists the order questions (prices are first stated here), get_quote gives the exact total, get_recap checks the whole order, and create_order is the final step, labeled \"Email me my invoice and design proof.\", which emails the invoice and the design proof to the contact.",
      "After placement, get_order_status reads the order with the status reference shown once at placement.",
      "For the fuller walk-through, read the explainer resources: " + EXPLAINER_TOPICS.map((t) => explainerResourceUri(t.slug)).join(", ") + ".",
    ].join("\n");
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        description: "Where the user is in the two-phase journey, and the one next action.",
        messages: [{ role: "user", content: { type: "text", text } }],
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
      const content: Array<Record<string, unknown>> = [];
      if (result.blocks) {
        // The tool composed the exact content (get_examples: each
        // label directly above its image); serve it in that order.
        for (const b of result.blocks) {
          content.push(b.type === "text" ? { type: "text", text: b.text } : { type: "image", data: b.data, mimeType: b.mimeType });
        }
      } else {
        content.push({ type: "text", text: result.text });
        if (result.image) {
          content.push({ type: "image", data: result.image.data, mimeType: result.image.mimeType });
        }
        if (result.images) {
          for (const img of result.images) {
            content.push({ type: "image", data: img.data, mimeType: img.mimeType });
          }
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

  return rpcError(id, -32601, `Method not found: ${method}. This server implements initialize, tools/list, tools/call, resources/list, resources/read, prompts/list, and prompts/get.`);
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

    // The SEP-2127 server card, served by the server itself (the
    // well-known seat on the site Worker publishes the same card;
    // see src/server-card.ts for how the two stay in agreement).
    if (url.pathname === "/mcp/server-card" && (request.method === "GET" || request.method === "HEAD")) {
      const body = JSON.stringify(buildServerCard(PROTOCOL_VERSION));
      const headers = {
        "Content-Type": "application/mcp-server-card+json",
        "Cache-Control": "public, max-age=86400",
        "Content-Length": String(new TextEncoder().encode(body).length),
        "X-Content-Type-Options": "nosniff",
      };
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      return new Response(body, { status: 200, headers });
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
