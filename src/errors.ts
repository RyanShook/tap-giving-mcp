// The one error shape (spec section 2.9): MCP's standard error content
// plus a structured object {code, message, retryable, details}. No
// error ever returns another organization's data, a stack trace, or a
// secret.

export type McpErrorCode =
  | "forbidden"
  | "invalid_input"
  | "manual_exception"
  | "not_found"
  | "conflict"
  | "stripe_unavailable"
  | "rate_limited"
  | "internal";

export class ToolError extends Error {
  code: McpErrorCode;
  retryable: boolean;
  details?: Record<string, unknown>;
  constructor(code: McpErrorCode, message: string, opts?: { retryable?: boolean; details?: Record<string, unknown> }) {
    super(message);
    this.code = code;
    this.retryable = opts?.retryable ?? (code === "rate_limited" || code === "stripe_unavailable" || code === "internal");
    this.details = opts?.details;
  }
  structured(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function invalidInput(message: string, details?: Record<string, unknown>): ToolError {
  return new ToolError("invalid_input", message, { retryable: false, details });
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function reqString(args: Record<string, unknown>, field: string, max = 1000): string {
  const v = args[field];
  if (typeof v !== "string" || !v.trim()) {
    throw invalidInput(`Missing or empty required input: ${field}.`);
  }
  return v.trim().slice(0, max);
}

export function optString(args: Record<string, unknown>, field: string, max = 1000): string | undefined {
  const v = args[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw invalidInput(`Input ${field} must be text.`);
  const s = v.trim().slice(0, max);
  return s || undefined;
}

export function reqInt(args: Record<string, unknown>, field: string): number {
  const v = args[field];
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw invalidInput(`Input ${field} must be a whole number.`);
  }
  return v;
}

export function optInt(args: Record<string, unknown>, field: string): number | undefined {
  const v = args[field];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw invalidInput(`Input ${field} must be a whole number.`);
  }
  return v;
}
