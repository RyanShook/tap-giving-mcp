// tap-mcp's bindings. KV: MCP_KEYS (key records, idempotency,
// recaps, webhooks, rate counters; this server's own namespace),
// MCP_ARTWORK (submitted artwork bytes; this server's own namespace),
// ORDERS (the business side's production namespace, live mode),
// DEV_ORDERS (the test lane's namespace, test mode). Secrets are
// wrangler secrets, never vars, never in the repo.

export interface Env {
  MCP_KEYS: KVNamespace;
  MCP_ARTWORK: KVNamespace;
  ORDERS: KVNamespace;
  DEV_ORDERS: KVNamespace;
  STRIPE_API_KEY_LIVE?: string;
  STRIPE_API_KEY_TEST?: string;
  MCP_INVOKE_SECRET?: string;
  MCP_INVOKE_URL?: string;
}
