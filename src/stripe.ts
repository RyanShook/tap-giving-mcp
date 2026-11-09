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
// buildMemo is the replication target: shape line per shape (discs,
// not plates), the managed-link line (NEVER the go.tap.giving URL
// itself: the shortener is internal plumbing and a finalized invoice
// cannot be edited), proof line, delivery line, tax line in
// invoice.ts's comma form. The anti-metal split line is the
// playbook's hand-built-invoice requirement.
export function buildMemo(opts: {
  shape: "round" | "square";
  mounting: "adhesive" | "screws";
  linkDestination?: string;
  antiMetalCount?: number; // known count only
}): string {
  const shapeLine = opts.shape === "square"
    ? "4\" square NFC tap discs with adhesive backing"
    : "4\" NFC tap discs with adhesive backing";
  const first = opts.mounting === "screws" ? shapeLine + " and pre-drilled screw holes" : shapeLine;
  const url = opts.linkDestination;
  const lockedLine = url
    ? (url.toLowerCase().includes("go.tap.giving")
      ? "Locked to a Tap.Giving managed link, re-pointable from your dashboard"
      : `Locked to ${url}`)
    : "Locked URL: TBD, pending customer confirmation";
  const lines = [
    first,
    lockedLine,
    "Editable design proof available immediately",
    "Delivery 2-3 weeks from artwork approval",
    "Tax exempt where applicable",
  ];
  if (opts.antiMetalCount && opts.antiMetalCount > 0) {
    lines.push(`${opts.antiMetalCount} discs with anti-metal backing for metal surfaces`);
  }
  return lines.join("\n");
}

export interface MintInput {
  stripeKey: string;
  orderRef: string;
  organizationName: string;
  email: string;
  qty: number;
  unitCents: number; // LIST tier price; the coupon does the discounting
  discountEligible: boolean;
  shape: "round" | "square";
  mounting: "adhesive" | "screws";
  linkDestination?: string;
  antiMetalCount?: number; // known count; undefined = unknown
  exit: "pay_now" | "lock_in";
}

export interface MintResult {
  invoiceId: string;
  invoiceNumber: string | null;
  status: string;
  hostedInvoiceUrl: string;
  totalCents: number;
  customerId: string;
  customerReused: boolean;
  existing: boolean;
  existingOrderRef: string | null;
}

export async function mintInvoice(
  input: MintInput,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<MintResult> {
  const key = input.stripeKey;
  const email = input.email;

  // Customer: reuse by email, else create; tax_exempt=exempt always.
  const found = await stripeCall(key, "GET", "/customers", { email, limit: 1 }, undefined, fetchFn);
  let customerId: string;
  let customerReused: boolean;
  if (found.data?.length) {
    customerId = found.data[0].id;
    customerReused = true;
    await stripeCall(key, "POST", `/customers/${customerId}`, { tax_exempt: "exempt" }, undefined, fetchFn);
  } else {
    const created = await stripeCall(key, "POST", "/customers",
      { name: input.organizationName || undefined, email, tax_exempt: "exempt" },
      `cf-cust:${email}`, fetchFn);
    customerId = created.id;
    customerReused = false;
  }

  // Duplicate guard, as a RETURN (spec 2.7): an existing open or draft
  // invoice for this customer is handed back flagged existing.
  const drafts = await stripeCall(key, "GET", "/invoices", { customer: customerId, status: "draft", limit: 10 }, undefined, fetchFn);
  const opens = await stripeCall(key, "GET", "/invoices", { customer: customerId, status: "open", limit: 10 }, undefined, fetchFn);
  const existingInv = [...(drafts.data ?? []), ...(opens.data ?? [])][0];
  if (existingInv) {
    let inv = existingInv;
    if (inv.status === "draft" && !inv.hosted_invoice_url) {
      // A draft has no hosted link until finalized; finalize it the
      // same way (auto_advance=false) so the handoff line is real.
      inv = await stripeCall(key, "POST", `/invoices/${inv.id}/finalize`, { auto_advance: false }, undefined, fetchFn);
    }
    return {
      invoiceId: inv.id,
      invoiceNumber: inv.number ?? null,
      status: inv.status,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      totalCents: inv.total ?? 0,
      customerId,
      customerReused,
      existing: true,
      existingOrderRef: (existingInv.metadata?.mcp_order_ref as string | undefined) ?? null,
    };
  }

  const memo = buildMemo({
    shape: input.shape,
    mounting: input.mounting,
    linkDestination: input.linkDestination,
    antiMetalCount: input.antiMetalCount,
  });
  const invBody: Record<string, unknown> = {
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: INVOICE_DAYS_UNTIL_DUE,
    description: memo,
    auto_advance: false,
    metadata: { mcp_order: "true", mcp_order_ref: input.orderRef, exit: input.exit },
  };
  if (input.discountEligible) invBody.discounts = { "0": { coupon: FIRST_ORDER_COUPON } };

  // Idempotency keys derive from the orderRef, invoice.ts's cf- style.
  const inv = await stripeCall(key, "POST", "/invoices", invBody,
    `cf-inv:${input.orderRef}`, fetchFn);

  await stripeCall(key, "POST", "/invoiceitems", {
    customer: customerId, currency: "usd", invoice: inv.id,
    description: "NFC Tap Discs", quantity: input.qty, unit_amount_decimal: input.unitCents,
  }, `cf-item:plates:${inv.id}`, fetchFn);

  if (input.antiMetalCount && input.antiMetalCount > 0) {
    await stripeCall(key, "POST", "/invoiceitems", {
      customer: customerId, currency: "usd", invoice: inv.id,
      description: "Metal-surface shielding layer", quantity: input.antiMetalCount,
      unit_amount_decimal: 100, discountable: false,
    }, `cf-item:antimetal:${inv.id}`, fetchFn);
  }

  await stripeCall(key, "POST", "/invoiceitems", {
    customer: customerId, currency: "usd", invoice: inv.id,
    description: "Shipping (free, included)", quantity: 1, unit_amount_decimal: 0, discountable: false,
  }, `cf-item:ship:${inv.id}`, fetchFn);

  const finalized = await stripeCall(key, "POST", `/invoices/${inv.id}/finalize`,
    { auto_advance: false }, undefined, fetchFn);

  return {
    invoiceId: finalized.id,
    invoiceNumber: finalized.number ?? null,
    status: finalized.status,
    hostedInvoiceUrl: finalized.hosted_invoice_url,
    totalCents: finalized.total ?? 0,
    customerId,
    customerReused,
    existing: false,
    existingOrderRef: null,
  };
}
