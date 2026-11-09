// The direct Stripe mint (spec section 2.7): tap-mcp mints directly
// against the Stripe API, replicating the behavior contract of
// worker/tap-mail/src/invoice.ts createDraftInvoiceForApproval, under
// documentation/INVOICE-PLAYBOOK.md, with the spec's named deltas:
//   - metadata is {mcp_order: "true", mcp_order_ref, exit} and the
//     approval flow's design_approved_auto marker stays OFF;
//   - the duplicate open-or-draft invoice guard RETURNS the existing
//     invoice flagged `existing` instead of skipping silently;
//   - the anti-metal line is added when the order carries a known
//     count ("Metal-surface shielding layer", $1 per shielded disc,
//     discountable=false, exactly as the playbook's hand-added line),
//     and the memo carries the split line as the playbook requires
//     for hand-built invoices;
//   - the memo's shape line gains the pre-drilled screw holes suffix
//     when the order's mounting is screws (create_invoice.py's
//     SCREW_HOLES_SUFFIX rule: holes ship WITH the adhesive);
//   - Stripe idempotency keys derive from the orderRef in the same
//     cf- style invoice.ts derives its keys, so a retry of the same
//     request_invoice replays instead of double-minting.
// Inherited unchanged: collection_method send_invoice, days_until_due
// 7, tax_exempt=exempt customer reuse by email, the first-order coupon
// when discount-eligible, the $0 free-shipping line, finalize with
// auto_advance=false, and the SEND endpoint is never called (Stripe
// emails nothing on finalize with auto_advance false).

const STRIPE_API = "https://api.stripe.com/v1";
export const FIRST_ORDER_COUPON = "YHlScIh4";
export const INVOICE_DAYS_UNTIL_DUE = 7;

function flatten(data: Record<string, unknown>, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      out.push(...flatten(v as Record<string, unknown>, key));
    } else if (typeof v === "boolean") {
      out.push([key, v ? "true" : "false"]);
    } else {
      out.push([key, String(v)]);
    }
  }
  return out;
}

export class StripeCallError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function stripeCall(
  key: string,
  method: "GET" | "POST",
  path: string,
  data?: Record<string, unknown>,
  idempotencyKey?: string,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<any> {
  let url = `${STRIPE_API}${path}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  let body: string | undefined;
  if (data) {
    const qs = new URLSearchParams(flatten(data)).toString();
    if (method === "GET") url = `${url}?${qs}`;
    else {
      body = qs;
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
  }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  let res: Response;
  try {
    res = await fetchFn(url, { method, headers, body });
  } catch (e) {
    throw new StripeCallError(0, `network error: ${(e as Error).message}`);
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || JSON.stringify(json).slice(0, 400);
    throw new StripeCallError(res.status, `Stripe ${method} ${path} failed (${res.status}): ${msg}`);
  }
  return json;
}

// The memo, per the playbook's builder contract. invoice.ts's

// P-16 (2026-11-08): the invoice mint path (buildMemo, mintInvoice)
// was removed with the request_invoice tool. Placement never mints
// an invoice: create_order records the order and emails it to the
// Tap.Giving team, and a person follows up with the actual invoice.
// stripeCall above remains for get_order_status's live reads of
// invoices that already exist.
