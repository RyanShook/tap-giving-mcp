// Key issuance CLI (spec sections 3.1.1, 9.2 item 3).
//
//   node --experimental-strip-types tools/issue-key.ts issue \
//     --slug <orgslug> --email <contact> --mode <live|test> \
//     [--name "<Org Name>"] [--issued-to <email>] [--issued-by <who>] \
//     [--crm-csv <path to deals.csv>] [--force-new-slug]
//
//   ... revoke --slug <orgslug> [--reason rotated]
//   ... list
//
// Prints the plaintext key ONCE (issuance only). Only the SHA-256 hash
// record is written to MCP_KEYS. CRM check (spec 3.6): with --crm-csv,
// the script refuses a second key identity for an email that the CRM
// already resolves to another slug (canon_email semantics mirrored
// from the business repo's crm.py: lowercase, drop the +tag, drop dots
// in a Gmail local part), and refuses to issue for a slug the CRM
// carries under a different contact.
//
// Runs from the box against the deployed namespace via the wrangler
// CLI (all KV operations pass --remote). The plaintext key is never
// written to a file by this script.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { sha256Hex, randomToken, type KeyRecord } from "../src/keys.ts";

const NAMESPACE_ID = process.env.MCP_KEYS_NAMESPACE_ID || "";
if (!NAMESPACE_ID) {
  console.error("Set MCP_KEYS_NAMESPACE_ID to the MCP_KEYS namespace id from wrangler.jsonc.");
  process.exit(2);
}

function kvGet(key: string): string | null {
  try {
    const out = execFileSync("npx", ["wrangler", "kv", "key", "get", key, "--namespace-id", NAMESPACE_ID, "--remote"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.trim() || null;
  } catch {
    return null;
  }
}
function kvPut(key: string, value: string): void {
  execFileSync("npx", ["wrangler", "kv", "key", "put", key, value, "--namespace-id", NAMESPACE_ID, "--remote"], { stdio: "inherit" });
}
function kvList(prefix: string): string[] {
  const out = execFileSync("npx", ["wrangler", "kv", "key", "list", "--namespace-id", NAMESPACE_ID, "--remote", "--prefix", prefix], { encoding: "utf8" });
  const data = JSON.parse(out || "[]");
  const rows = Array.isArray(data) ? data : data.keys || [];
  return rows.map((k: { name: string }) => k.name);
}

function canonEmail(addr: string): string {
  let a = (addr || "").trim().toLowerCase();
  if (!a.includes("@")) return a;
  const at = a.indexOf("@");
  let local = a.slice(0, at).split("+")[0];
  const domain = a.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

// Minimal RFC4180 reader for the two columns the check needs.
function parseDealsContacts(csv: string): Array<{ slug: string; contacts: string[] }> {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQ) {
      if (ch === '"') { if (csv[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"' && field === "") inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const iSlug = header.indexOf("slug"), iContacts = header.indexOf("contacts");
  return rows.slice(1).filter((r) => (r[iSlug] || "").trim()).map((r) => ({
    slug: r[iSlug].trim(),
    contacts: (r[iContacts] || "").split(/[,;]/).map((c) => canonEmail(c)).filter((c) => c.includes("@")),
  }));
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const cmd = process.argv[2];

if (cmd === "issue") {
  const slug = arg("slug");
  const email = arg("email");
  const mode = arg("mode");
  if (!slug || !email || (mode !== "live" && mode !== "test")) {
    console.error("issue needs --slug, --email, --mode live|test");
    process.exit(2);
  }
  // process.exit is typed as returning void here, so narrow
  // explicitly instead of relying on control-flow analysis.
  const orgSlug = slug as string;
  const contactEmail = email as string;
  const keyMode = mode as "live" | "test";
  const orgName = arg("name") || orgSlug;
  const crmCsv = arg("crm-csv");
  if (crmCsv) {
    const deals = parseDealsContacts(readFileSync(crmCsv, "utf8"));
    const canon = canonEmail(contactEmail);
    for (const d of deals) {
      if (d.contacts.includes(canon) && d.slug !== orgSlug) {
        console.error(`REFUSED: the CRM resolves ${contactEmail} to slug "${d.slug}", not "${orgSlug}". One organization, one key identity (spec 3.6).`);
        process.exit(3);
      }
      if (d.slug === orgSlug && d.contacts.length && !d.contacts.includes(canon) && !flag("force-new-slug")) {
        console.error(`REFUSED: the CRM carries slug "${orgSlug}" under different contacts (${d.contacts.join(", ")}). Pass --force-new-slug only when this is a genuinely different organization.`);
        process.exit(3);
      }
    }
  } else {
    console.error("WARNING: no --crm-csv given; the spec 3.6 CRM identity check was skipped.");
  }
  // Rotation window: at most two active keys per org (spec 3.5).
  const existing = kvList("KEYHASH:")
    .map((k) => kvGet(k))
    .filter((v): v is string => !!v)
    .map((v) => JSON.parse(v) as KeyRecord)
    .filter((r) => r.orgSlug === orgSlug && r.mode === keyMode && r.status === "active");
  if (existing.length >= 2) {
    console.error(`REFUSED: ${orgSlug} already has two active ${keyMode} keys (the rotation maximum). Revoke one first.`);
    process.exit(3);
  }
  const secret = randomToken(32);
  const key = `tg_${keyMode}_${orgSlug}_${secret}`;
  const keyHash = await sha256Hex(key);
  const now = new Date().toISOString();
  const record: KeyRecord = {
    orgSlug: orgSlug,
    orgName,
    contactEmail: contactEmail.toLowerCase(),
    mode: keyMode,
    scopes: ["orders"],
    status: "active",
    createdAt: now,
    issuedTo: arg("issued-to") || contactEmail,
    issuedBy: arg("issued-by") || "engineering-cli",
    issuedAt: now,
  };
  kvPut(`KEYHASH:${keyHash}`, JSON.stringify(record));
  console.log("KEY ISSUED (shown once, store it in the client's configuration, never in a repo):");
  console.log(key);
  console.log(`org: ${orgSlug} (${orgName}), contact ${contactEmail.toLowerCase()}, mode ${keyMode}, scopes orders`);
} else if (cmd === "revoke") {
  const slug = arg("slug");
  const reason = arg("reason") || "revoked";
  if (!slug) { console.error("revoke needs --slug"); process.exit(2); }
  let n = 0;
  for (const k of kvList("KEYHASH:")) {
    const raw = kvGet(k);
    if (!raw) continue;
    const rec = JSON.parse(raw) as KeyRecord;
    if (rec.orgSlug === slug && rec.status === "active" && (!arg("mode") || rec.mode === arg("mode"))) {
      rec.status = "revoked";
      rec.revokedAt = new Date().toISOString();
      rec.revokedReason = reason;
      kvPut(k, JSON.stringify(rec));
      n++;
    }
  }
  console.log(`revoked ${n} active key(s) for ${slug} (reason: ${reason}); effective on the next call.`);
} else if (cmd === "list") {
  for (const k of kvList("KEYHASH:")) {
    const raw = kvGet(k);
    if (!raw) continue;
    const rec = JSON.parse(raw) as KeyRecord;
    console.log(`${rec.orgSlug}\t${rec.mode}\t${rec.status}\t${rec.contactEmail}\tissued ${rec.issuedAt} by ${rec.issuedBy}`);
  }
} else {
  console.error("usage: issue-key.ts issue|revoke|list ...");
  process.exit(2);
}
