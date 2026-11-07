// On-disc preview rendering (first-user round 1, F13/F16): the
// customer's own submitted artwork composited AS the disc, clipped
// into the cut shape (round circle or square, per the order's shape),
// so the caller sees their disc, not a bare file. SVG is rasterized
// in the Worker with resvg (WASM); raster submissions are composited
// through the same wrapper (the source embedded in an SVG <image> and
// clipped by the cut path). Rasterization is best-effort: any failure
// returns null and the caller falls back to the submitted bytes.
//
// The wrapper's canvas is exactly the cut region of the 106 mm
// artboard (viewBox 3 3 100 100): the bleed margin is never shown,
// because the disc is the 100 mm piece.

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ""));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export type DiscShape = "round" | "square";

function cutShapeSvg(shape: DiscShape, id: string): string {
  return shape === "round"
    ? `<clipPath id="${id}"><circle cx="53" cy="53" r="50"/></clipPath>`
    : `<clipPath id="${id}"><rect x="3" y="3" width="100" height="100"/></clipPath>`;
}

function cutOutlineSvg(shape: DiscShape): string {
  // A hairline at the cut edge so the disc reads as an object on any
  // chat background, including white artwork on a white client.
  return shape === "round"
    ? `<circle cx="53" cy="53" r="49.8" fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="0.45"/>`
    : `<rect x="3.2" y="3.2" width="99.6" height="99.6" fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="0.45"/>`;
}

/** Pull the inner content and viewBox out of a submitted SVG document. */
export function extractSvgInner(svgText: string): { viewBox: string; inner: string } | null {
  const open = /<svg\b([^>]*)>/i.exec(svgText);
  if (!open) return null;
  const closeIdx = svgText.toLowerCase().lastIndexOf("</svg>");
  if (closeIdx < 0) return null;
  const attrs = open[1];
  const vb = /viewBox\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
  let viewBox = vb;
  if (!viewBox) {
    const w = /width\s*=\s*"([\d.]+)/i.exec(attrs)?.[1];
    const h = /height\s*=\s*"([\d.]+)/i.exec(attrs)?.[1];
    if (w && h) viewBox = `0 0 ${w} ${h}`;
  }
  if (!viewBox) return null;
  const inner = svgText.slice(open.index + open[0].length, closeIdx);
  return { viewBox, inner };
}

/**
 * The disc composite as an SVG document: the submitted artwork laid
 * on the full 106 mm artboard (meet-fit, as the agent designed it),
 * clipped to the cut shape, on a transparent ground outside the cut.
 */
export function buildDiscSvg(opts: {
  shape: DiscShape;
  svgInner?: { viewBox: string; inner: string };
  imageDataUrl?: string;
  holes?: boolean;
}): string {
  const placed = opts.imageDataUrl
    ? `<image href="${opts.imageDataUrl}" x="0" y="0" width="106" height="106" preserveAspectRatio="xMidYMid meet"/>`
    : `<svg x="0" y="0" width="106" height="106" viewBox="${opts.svgInner!.viewBox}" preserveAspectRatio="xMidYMid meet">${opts.svgInner!.inner}</svg>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="424" height="424" viewBox="3 3 100 100">`,
    `<defs>${cutShapeSvg(opts.shape, "cut")}</defs>`,
    `<g clip-path="url(#cut)">${placed}</g>`,
    cutOutlineSvg(opts.shape),
    ...(opts.holes ? [`<g>${SCREW_HOLES.centresMm.map((c) => `<circle cx="${c.x}" cy="${c.y}" r="3" fill="rgba(255,255,255,0.92)" stroke="rgba(0,0,0,0.55)" stroke-width="0.4"/>`).join("")}</g>`] : []),
    `</svg>`,
  ].join("");
}

// ─── rasterizer (resvg WASM, lazily initialized) ────────────────────

type RasterizerFn = (svgText: string) => Promise<Uint8Array | null>;
let testRasterizer: RasterizerFn | null = null;

/** Test seam, following the seat's MCP_INVOKE_URL override pattern. */
export function setRasterizerForTests(fn: RasterizerFn | null): void {
  testRasterizer = fn;
}

let resvgReady: Promise<boolean> | null = null;

async function initResvg(): Promise<boolean> {
  if (!resvgReady) {
    resvgReady = (async () => {
      try {
        const mod = await import("@resvg/resvg-wasm");
        // The .wasm and .ttf imports resolve through wrangler's module
        // rules (CompiledWasm / Data) in the deployed Worker; under
        // the node test runner they throw and the preview degrades.
        const wasm = (await import("./assets/resvg.wasm")).default as WebAssembly.Module;
        const sans = (await import("./assets/DejaVuSans.ttf")).default as ArrayBuffer;
        const sansBold = (await import("./assets/DejaVuSans-Bold.ttf")).default as ArrayBuffer;
        const serif = (await import("./assets/DejaVuSerif.ttf")).default as ArrayBuffer;
        // resvg-wasm accepts ArrayBuffer | Uint8Array buffers, but its
        // option parsing reads .buffer off each entry; a standalone
        // ArrayBuffer has no such property and the constructor throws
        // the buffer itself. Uint8Array view wrappers are the safe
        // shape (verified against resvg-wasm 2.6.2).
        fontBuffers = [new Uint8Array(sans), new Uint8Array(sansBold), new Uint8Array(serif)];
        await mod.initWasm(wasm);
        resvgModule = mod;
        return true;
      } catch (e) {
        return false;
      }
    })();
  }
  return resvgReady;
}

let resvgModule: { Resvg: new (svg: string, opts?: Record<string, unknown>) => { render(): { asPng(): Uint8Array } } } | null = null;
let fontBuffers: Uint8Array[] = [];

/** Rasterize an SVG document to PNG at 424 px wide. Null on any failure. */
export async function renderSvgToPng(svgText: string): Promise<Uint8Array | null> {
  if (testRasterizer) return testRasterizer(svgText);
  if (!(await initResvg()) || !resvgModule) return null;
  try {
    const r = new resvgModule.Resvg(svgText, {
      fitTo: { mode: "width", value: 424 },
      font: {
        fontBuffers,
        defaultFontFamily: "DejaVu Sans",
        sansSerifFamily: "DejaVu Sans",
        serifFamily: "DejaVu Serif",
      },
    });
    return r.render().asPng();
  } catch (e) {
    return null;
  }
}

/**
 * The on-disc render of a submission: the customer's artwork
 * composited into the cut shape and rendered to PNG. Returns null
 * when the format cannot be rendered here (PDF) or the rasterizer
 * fails; callers then fall back to the submitted bytes and say so.
 */
export async function renderArtworkOnDisc(
  bytes: Uint8Array,
  detectedType: string,
  shape: DiscShape,
  holes = false,
): Promise<Uint8Array | null> {
  try {
    if (detectedType === "svg") {
      const text = new TextDecoder().decode(bytes);
      const inner = extractSvgInner(text);
      if (!inner) return null;
      return await renderSvgToPng(buildDiscSvg({ shape, svgInner: inner, holes }));
    }
    if (detectedType === "png" || detectedType === "jpeg" || detectedType === "webp" || detectedType === "gif") {
      const mime = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" }[detectedType];
      const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;
      return await renderSvgToPng(buildDiscSvg({ shape, imageDataUrl: dataUrl, holes }));
    }
    return null;
  } catch {
    return null;
  }
}

// ─── artwork template (F12) ─────────────────────────────────────────
// The downloadable template: one SVG with the guide layers a designer
// (or an agent) draws against: bleed, cut, safe, and the screw holes.
// Hole geometry is production geometry, from
// documentation/disc-product-spec.md: 2 holes, 6 mm diameter, centers
// 43.25 mm from the disc center on the horizontal midline, so on the
// 106 mm artboard (centre 53,53) the centers are (9.75, 53) and
// (96.25, 53). Holes are drilled only when screws mounting is chosen.

export const SCREW_HOLES = {
  count: 2,
  diameterMm: 6,
  centreOffsetMm: 43.25,
  centresMm: [
    { x: 9.75, y: 53 },
    { x: 96.25, y: 53 },
  ],
  note:
    "Two pre-drilled holes, 6 mm across, centered 43.25 mm either side of the disc center on the horizontal midline. " +
    "Holes are drilled only when screws mounting is chosen, and discs with holes keep the adhesive backing too.",
} as const;

export function buildTemplateSvg(shape: DiscShape): string {
  const cut = shape === "round"
    ? `<circle cx="53" cy="53" r="50" fill="none" stroke="#e11d48" stroke-width="0.5"/>`
    : `<rect x="3" y="3" width="100" height="100" fill="none" stroke="#e11d48" stroke-width="0.5"/>`;
  const safe = shape === "round"
    ? `<circle cx="53" cy="53" r="45" fill="none" stroke="#2563eb" stroke-width="0.4" stroke-dasharray="2.5 1.8"/>`
    : `<rect x="6" y="6" width="94" height="94" fill="none" stroke="#2563eb" stroke-width="0.4" stroke-dasharray="2.5 1.8"/>`;
  const bleed = shape === "round"
    ? `<circle cx="53" cy="53" r="53" fill="none" stroke="#9ca3af" stroke-width="0.4" stroke-dasharray="1 1.4"/>`
    : `<rect x="0.2" y="0.2" width="105.6" height="105.6" fill="none" stroke="#9ca3af" stroke-width="0.4" stroke-dasharray="1 1.4"/>`;
  const holes = SCREW_HOLES.centresMm
    .map((c) => `<circle cx="${c.x}" cy="${c.y}" r="3" fill="none" stroke="#f59e0b" stroke-width="0.45"/><circle cx="${c.x}" cy="${c.y}" r="0.5" fill="#f59e0b"/>`)
    .join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="106mm" height="106mm" viewBox="0 0 106 106">`,
    `<title>Tap.Giving tap disc artwork template, ${shape}</title>`,
    `<desc>Guide layers on the 106 mm artboard. Bleed: art runs to the outermost guide. Cut: the disc's edge (100 mm). Safe: keep important elements inside. Screw holes: two 6 mm holes centered at (9.75, 53) and (96.25, 53) mm, drilled only when screws mounting is chosen. Delete the guide layers before submitting.</desc>`,
    `<g id="bleed-guide">${bleed}</g>`,
    `<g id="cut-guide">${cut}</g>`,
    `<g id="safe-guide">${safe}</g>`,
    `<g id="screw-hole-guides">${holes}</g>`,
    `</svg>`,
  ].join("");
}
