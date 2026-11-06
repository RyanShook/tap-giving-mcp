// The business side's authenticated invocation seat (spec section
// 5.3): tap-mail's POST /api/mcp-invoke, gated by the
// X-Mcp-Invoke-Secret header against this Worker's MCP_INVOKE_SECRET
// (the same value is set on both Workers from the box). tap-mcp calls
// it for the two things no public endpoint does: recording an artwork
// submission for the adoption machinery to drain, and reading an
// organization's order records for get_order_status.
//
// Seat failures never break a tool whose own write already landed:
// callers treat a failed recordArtworkSubmission as a queued retry
// fact on the MCP's own record (recorded: false), and
// readOrderRecords has the spec's pre-decided fallback (the MCP's own
// records plus Stripe) when the seat is unavailable.

export interface SeatEnv {
  MCP_INVOKE_SECRET?: string;
  MCP_INVOKE_URL?: string; // override for tests; default below
}

// tap-mail's workers.dev surface (the same base the box's
// sequence-cancel client uses for its gated routes).
const DEFAULT_INVOKE_URL = "https://tap-mail.shoook.workers.dev/api/mcp-invoke";

export async function callSeat(
  env: SeatEnv,
  op: string,
  input: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  if (!env.MCP_INVOKE_SECRET) return { ok: false, status: 0, body: { error: "seat secret not configured" } };
  const url = env.MCP_INVOKE_URL || DEFAULT_INVOKE_URL;
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mcp-Invoke-Secret": env.MCP_INVOKE_SECRET,
      },
      body: JSON.stringify({ op, input }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && body.ok === true, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { error: (e as Error).message } };
  }
}
