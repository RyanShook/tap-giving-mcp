// Bundler-only module shapes: the .wasm and .ttf imports resolve
// through wrangler's module rules in the deployed Worker. The node
// test runner never resolves them (the preview loader catches the
// failure and degrades), so these declarations exist for tsc only.
declare module "*.wasm" {
  const mod: WebAssembly.Module;
  export default mod;
}
declare module "*.ttf" {
  const buf: ArrayBuffer;
  export default buf;
}
declare module "@resvg/resvg-wasm" {
  export function initWasm(input: WebAssembly.Module | BufferSource): Promise<void>;
  export class Resvg {
    constructor(svg: string, opts?: Record<string, unknown>);
    render(): { asPng(): Uint8Array; width: number; height: number };
  }
}
