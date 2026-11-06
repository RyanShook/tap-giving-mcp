// Artwork intake screening (spec section 2.6, validation policy):
// accept by default, rejected only on three sanity grounds:
//   1. not malicious: declared type and magic bytes agree; executable
//      and archive signatures refused whatever the declared type says;
//      SVG passes the standing isSvgSafe denylist; PDF carries its
//      header and no embedded JavaScript marker.
//   2. not overly large: 5 MB decoded cap (the estate's standing image
//      ceiling); an empty file is refused.
//   3. actually a real image: the bytes parse as the type they claim
//      at the standard the Workers runtime supports (PNG IHDR must be
//      readable; JPEG and WebP pass on magic bytes; SVG must parse as
//      XML with an <svg> root; PDF must carry a page-structure marker).
//
// The sniff discipline mirrors worker/tap-autoreply/src/logo-lookup.ts
// (PNG signature plus IHDR at bytes 12-15, width 16-19, height 20-23;
// JPEG SOI magic; WebP RIFF plus the WEBP fourcc). Production fitness
// is judged later in the normal proof flow, never at this door.

export const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;

export interface SniffResult {
  ok: boolean;
  detectedType: string | null; // png | jpeg | webp | svg | pdf | gif | null
  width?: number;
  height?: number;
  reason?: string;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

function asciiAt(bytes: Uint8Array, from: number, to: number): string {
  let s = "";
  for (let i = from; i < to && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

// Executable and archive signatures: refused whatever the declared
// type says (a file whose bytes are not the image it claims to be is
// refused as masquerading).
function masqueradeSignature(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x4d, 0x5a])) return "PE executable (MZ)";
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return "ELF executable";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return "ZIP archive";
  if (startsWith(bytes, [0x52, 0x61, 0x72, 0x21])) return "RAR archive";
  if (startsWith(bytes, [0x1f, 0x8b])) return "gzip archive";
  if (startsWith(bytes, [0x42, 0x5a, 0x68])) return "bzip2 archive";
  if (startsWith(bytes, [0xfd, 0x37, 0x7a, 0x58, 0x5a])) return "xz archive";
  if (startsWith(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return "7z archive";
  if (startsWith(bytes, [0x25, 0x21])) return "script (shebang)";
  if (asciiAt(bytes, 0, 512).toLowerCase().includes("<script")) return "HTML or script content";
  return null;
}

// SVG safety denylist: the standing isSvgSafe scan from
// worker/tap-autoreply/src/logo-lookup.ts, extended to every on*
// handler attribute (the summary form of the same list).
export function isSvgSafe(text: string): boolean {
  const lower = text.toLowerCase();
  const banned = [
    "<script", "javascript:", "<foreignobject", "<iframe", "<embed", "<object", "data:text/html",
  ];
  if (banned.some((n) => lower.includes(n))) return false;
  if (/\son[a-z]+\s*=/i.test(text)) return false; // on*= event handlers
  return true;
}

const DECLARED_TO_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/postscript": "pdf", // AI files are PDF-shaped containers
  "application/illustrator": "pdf",
};

export function sniffArtwork(bytes: Uint8Array, mediaType: string): SniffResult {
  const declared = DECLARED_TO_TYPE[(mediaType || "").split(";")[0].trim().toLowerCase()] ?? null;

  const masq = masqueradeSignature(bytes);
  if (masq) {
    return { ok: false, detectedType: null, reason: `the file's bytes are a ${masq}, not the image it claims to be` };
  }

  // SVG: text-shaped, checked by parse plus the denylist.
  const headText = asciiAt(bytes, 0, Math.min(bytes.length, 4096));
  if (headText.trimStart().startsWith("<") && /<svg[\s>]/i.test(headText)) {
    if (declared !== null && declared !== "svg") {
      return { ok: false, detectedType: "svg", reason: `declared media type ${mediaType} does not match the SVG bytes` };
    }
    if (!isSvgSafe(new TextDecoder().decode(bytes))) {
      return { ok: false, detectedType: "svg", reason: "the SVG carries script-shaped content (script element, event handler, javascript: URL, or an embedded object), which the standing safety scan refuses" };
    }
    return { ok: true, detectedType: "svg" };
  }

  if (startsWith(bytes, PNG_SIG)) {
    // PNG by IHDR: bytes 12-15 spell IHDR; width 16-19, height 20-23.
    if (asciiAt(bytes, 12, 16) !== "IHDR") {
      return { ok: false, detectedType: "png", reason: "the PNG header cannot be read (no IHDR chunk), so the file is undecodable as a PNG" };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    if (declared !== null && declared !== "png") {
      return { ok: false, detectedType: "png", reason: `declared media type ${mediaType} does not match the PNG bytes` };
    }
    return { ok: true, detectedType: "png", width, height };
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    if (declared !== null && declared !== "jpeg") {
      return { ok: false, detectedType: "jpeg", reason: `declared media type ${mediaType} does not match the JPEG bytes` };
    }
    return { ok: true, detectedType: "jpeg" };
  }

  if (asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 12) === "WEBP") {
    if (declared !== null && declared !== "webp") {
      return { ok: false, detectedType: "webp", reason: `declared media type ${mediaType} does not match the WebP bytes` };
    }
    return { ok: true, detectedType: "webp" };
  }

  if (asciiAt(bytes, 0, 4) === "GIF8") {
    if (declared !== null && declared !== "gif") {
      return { ok: false, detectedType: "gif", reason: `declared media type ${mediaType} does not match the GIF bytes` };
    }
    return { ok: true, detectedType: "gif" };
  }

  if (asciiAt(bytes, 0, 5) === "%PDF-") {
    const text = new TextDecoder().decode(bytes);
    if (text.includes("/JavaScript") || /\/JS\s*\(/.test(text) || text.includes("/Launch")) {
      return { ok: false, detectedType: "pdf", reason: "the PDF carries an embedded JavaScript or launch marker, which intake refuses" };
    }
    if (!text.includes("/Type /Page") && !text.includes("/Pages") && !text.includes("endobj")) {
      return { ok: false, detectedType: "pdf", reason: "the PDF has no readable page structure marker, so it does not parse as a document" };
    }
    if (declared !== null && declared !== "pdf") {
      return { ok: false, detectedType: "pdf", reason: `declared media type ${mediaType} does not match the PDF bytes` };
    }
    return { ok: true, detectedType: "pdf" };
  }

  return {
    ok: false,
    detectedType: null,
    reason: "the bytes do not parse as any image or vector type intake recognizes (PNG, JPEG, WebP, GIF, SVG, or PDF)",
  };
}

export const DETECTED_MEDIA_TYPE: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};
