/**
 * canvasStub — a dependency-free, deterministic software rasteriser for tests.
 *
 * ## Why this exists
 *
 * jsdom has **no canvas implementation**: `canvas.getContext("2d")` returns
 * `null` and every drawing call throws. This project deliberately installs no
 * canvas backend (`canvas` / `@napi-rs/canvas` are native deps and are not in
 * the verified dependency matrix), and visual regression via a hosted service
 * or a browser runner was evaluated and rejected (MASTER.md §9.10).
 *
 * The substitute is **pixel hashing**: a renderer draws into a buffer, the test
 * hashes the resulting bytes, and the hash is the regression assertion. Two
 * refactors that produce the same pixels produce the same hash.
 *
 * ## The two supported strategies
 *
 * 1. **Preferred — buffer in, buffer out.** A pure renderer takes and returns an
 *    `ImageData`-like `{ data, width, height }`. Use {@link createBuffer} +
 *    {@link hashBuffer}. No context involved, works in the `unit` (node)
 *    project, and is exact by construction.
 *
 * 2. **Fallback — render through a stub context.** For renderers that genuinely
 *    take a `CanvasRenderingContext2D`, {@link createStubContext} returns an
 *    object that rasterises the *pixel-exact* subset of the 2D API into a
 *    backing buffer you can then hash. See the support table below — this is a
 *    real rasteriser for rectangles and image data, and a **no-op recorder**
 *    for anti-aliased paths, gradients and text.
 *
 * ## What `createStubContext` actually rasterises (read this before relying on it)
 *
 * | API | Behaviour |
 * | --- | --- |
 * | `fillRect`, `clearRect`, `strokeRect` | **Rasterised**, pixel-exact, integer-snapped |
 * | `putImageData` (incl. dirty-rect args) | **Rasterised**, exact |
 * | `getImageData`, `createImageData` | **Real**, returns plain buffers |
 * | `drawImage` from a stub canvas/buffer source | **Rasterised**, nearest-neighbour |
 * | `fillStyle` / `strokeStyle` | Parsed for `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `transparent`, and ~16 basic colour keywords. An unparseable value throws, so a typo is a test failure and not a silent black rectangle. |
 * | `globalAlpha` | Applied during composite |
 * | `save` / `restore` / `translate` | **Honoured** (translate is integer translation only) |
 * | `beginPath`/`moveTo`/`lineTo`/`arc`/`stroke`/`fill`/`setLineDash` | **Recorded, NOT rasterised.** Calls are appended to `ctx.calls` for structural assertions; they leave the pixel buffer untouched. |
 * | `createLinearGradient` / `createRadialGradient` | Returns an inert stub; using one as a fill style rasterises **nothing** |
 * | `font` / `fillText` / `shadow*` | Recorded, not rasterised |
 * | `scale`, `rotate`, `setTransform`, `clip`, `globalCompositeOperation` | **Not supported.** Recorded only; geometry is ignored. |
 *
 * **The limit that matters for tasks 30 and 33:** a renderer whose output is
 * built from `fillRect` / `putImageData` / `drawImage` (checkerboards, frame
 * overlays, pixel grids, thumbnail composites) **can** be hashed through this
 * stub. A renderer whose output is strokes and arcs (marching ants, the lasso
 * outline, the origin cross) **cannot** — its buffer stays blank and the hash
 * is meaningless. For those, assert on `ctx.calls` instead, or fall back to
 * manual review. `hashContext` throws on a wholly-untouched buffer precisely so
 * this failure mode cannot pass silently.
 */

/** A minimal structural stand-in for the DOM `ImageData` type. */
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Buffers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Allocate an RGBA pixel buffer of `width × height`, zero-filled (fully
 * transparent black), exactly as a fresh canvas starts.
 *
 * `fill` optionally pre-paints every pixel with an `[r, g, b, a]` tuple.
 */
export function createBuffer(
  width: number,
  height: number,
  fill?: readonly [number, number, number, number],
): PixelBuffer {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(
      `createBuffer: width/height must be integers, got ${width}×${height}`,
    );
  }
  if (width <= 0 || height <= 0) {
    throw new Error(
      `createBuffer: width/height must be positive, got ${width}×${height}`,
    );
  }
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
    }
  }
  return { data, width, height };
}

/** Deep-copy a buffer, so a mutating renderer cannot corrupt a fixture. */
export function cloneBuffer(buf: PixelBuffer): PixelBuffer {
  return {
    data: new Uint8ClampedArray(buf.data),
    width: buf.width,
    height: buf.height,
  };
}

/** Read one pixel as `[r, g, b, a]`. Out-of-bounds reads throw. */
export function getPixel(
  buf: PixelBuffer,
  x: number,
  y: number,
): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) {
    throw new Error(
      `getPixel: (${x}, ${y}) is outside ${buf.width}×${buf.height}`,
    );
  }
  const i = (y * buf.width + x) * 4;
  return [buf.data[i], buf.data[i + 1], buf.data[i + 2], buf.data[i + 3]];
}

/** Write one pixel (no blending — a straight overwrite). */
export function setPixel(
  buf: PixelBuffer,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): void {
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) return;
  const i = (y * buf.width + x) * 4;
  buf.data[i] = rgba[0];
  buf.data[i + 1] = rgba[1];
  buf.data[i + 2] = rgba[2];
  buf.data[i + 3] = rgba[3];
}

/**
 * Structural equality of two buffers. Cheaper to read in a failure message than
 * two hashes, so prefer it when you have both sides in hand.
 */
export function buffersEqual(a: PixelBuffer, b: PixelBuffer): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  if (a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) return false;
  }
  return true;
}

/**
 * Index of the first differing byte, or `-1` if identical. Use it to turn a
 * hash mismatch into an actionable `(x, y, channel)` in a failure message.
 */
export function firstDifference(a: PixelBuffer, b: PixelBuffer): number {
  const n = Math.min(a.data.length, b.data.length);
  for (let i = 0; i < n; i++) {
    if (a.data[i] !== b.data[i]) return i;
  }
  return a.data.length === b.data.length ? -1 : n;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Hashing                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * A stable, dependency-free 32-bit FNV-1a hash of a buffer's pixels, returned
 * as 8 lowercase hex digits prefixed by the dimensions — e.g. `"16x16:1a2b3c4d"`.
 *
 * The dimension prefix is deliberate: two differently-shaped buffers that
 * happen to collide in 32 bits still produce different strings, and a failure
 * message tells you the size changed without a second assertion.
 *
 * Stability guarantees (these are what make it usable as a golden value):
 * - depends only on `width`, `height` and the RGBA bytes, in raster order;
 * - no platform, endianness, locale or Node-version dependence;
 * - identical for a `PixelBuffer` and a real `ImageData` holding the same bytes.
 *
 * It is a *content* hash, not a *perceptual* one: a one-bit change flips it.
 * That is the point — this is a regression tripwire, not a similarity metric.
 */
export function hashBuffer(buf: PixelBuffer): string {
  const { data, width, height } = buf;
  let h = FNV_OFFSET_BASIS;
  // Fold the dimensions in first so shape is part of the digest.
  for (const dim of [width, height]) {
    for (let s = 0; s < 32; s += 8) {
      h ^= (dim >>> s) & 0xff;
      h = Math.imul(h, FNV_PRIME);
    }
  }
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, FNV_PRIME);
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return `${width}x${height}:${hex}`;
}

/** `true` if every byte of the buffer is zero (nothing was ever drawn). */
export function isBlank(buf: PixelBuffer): boolean {
  for (let i = 0; i < buf.data.length; i++) {
    if (buf.data[i] !== 0) return false;
  }
  return true;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Colour parsing                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

type RGBA = [number, number, number, number];

const NAMED_COLORS: Record<string, RGBA> = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 255],
  white: [255, 255, 255, 255],
  red: [255, 0, 0, 255],
  green: [0, 128, 0, 255],
  lime: [0, 255, 0, 255],
  blue: [0, 0, 255, 255],
  yellow: [255, 255, 0, 255],
  cyan: [0, 255, 255, 255],
  aqua: [0, 255, 255, 255],
  magenta: [255, 0, 255, 255],
  fuchsia: [255, 0, 255, 255],
  gray: [128, 128, 128, 255],
  grey: [128, 128, 128, 255],
  silver: [192, 192, 192, 255],
  orange: [255, 165, 0, 255],
};

/**
 * Parse the CSS colour subset this stub supports into `[r, g, b, a]`.
 *
 * Throws on anything unsupported rather than defaulting to black — a silently
 * mis-parsed colour would produce a plausible-looking but wrong hash, which is
 * the worst possible outcome for a regression tripwire.
 */
export function parseColor(value: string): RGBA {
  const raw = value.trim().toLowerCase();

  const named = NAMED_COLORS[raw];
  if (named) return [...named];

  if (raw.startsWith("#")) {
    const hex = raw.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const nybble = (c: string) => parseInt(c + c, 16);
      return [
        nybble(hex[0]),
        nybble(hex[1]),
        nybble(hex[2]),
        hex.length === 4 ? nybble(hex[3]) : 255,
      ];
    }
    if (hex.length === 6 || hex.length === 8) {
      const byte = (i: number) => parseInt(hex.slice(i, i + 2), 16);
      return [byte(0), byte(2), byte(4), hex.length === 8 ? byte(6) : 255];
    }
    throw new Error(`canvasStub.parseColor: unsupported hex colour "${value}"`);
  }

  const fn = /^rgba?\(([^)]*)\)$/.exec(raw);
  if (fn) {
    const parts = fn[1]
      .split(/[,/\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length !== 3 && parts.length !== 4) {
      throw new Error(
        `canvasStub.parseColor: unsupported rgb()/rgba() colour "${value}"`,
      );
    }
    const channel = (p: string) =>
      p.endsWith("%")
        ? Math.round((parseFloat(p) / 100) * 255)
        : Math.round(parseFloat(p));
    const alpha =
      parts.length === 4
        ? Math.round(
            (parts[3].endsWith("%")
              ? parseFloat(parts[3]) / 100
              : parseFloat(parts[3])) * 255,
          )
        : 255;
    const rgba: RGBA = [
      channel(parts[0]),
      channel(parts[1]),
      channel(parts[2]),
      alpha,
    ];
    if (rgba.some((c) => Number.isNaN(c))) {
      throw new Error(`canvasStub.parseColor: unparseable colour "${value}"`);
    }
    return rgba;
  }

  throw new Error(
    `canvasStub.parseColor: unsupported colour "${value}". ` +
      `Supported: #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), and basic keywords. ` +
      `Extend NAMED_COLORS in canvasStub.ts if you need another keyword.`,
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* The stub 2D context                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

/** One recorded call on a stub context, for structural assertions. */
export interface RecordedCall {
  method: string;
  args: unknown[];
}

interface CtxState {
  fillStyle: string;
  strokeStyle: string;
  globalAlpha: number;
  lineWidth: number;
  offsetX: number;
  offsetY: number;
}

/** An inert gradient object — accepted as a style, rasterises nothing. */
export interface StubGradient {
  readonly __stubGradient: true;
  stops: { offset: number; color: string }[];
  addColorStop(offset: number, color: string): void;
}

export interface StubContext {
  /** The backing pixel buffer. Hash this. */
  readonly buffer: PixelBuffer;
  /** Every call made on this context, in order — including unrasterised ones. */
  readonly calls: RecordedCall[];
  readonly canvas: { width: number; height: number };

  fillStyle: string | StubGradient;
  strokeStyle: string | StubGradient;
  globalAlpha: number;
  lineWidth: number;
  lineDashOffset: number;
  imageSmoothingEnabled: boolean;
  font: string;
  shadowColor: string;
  shadowBlur: number;
  globalCompositeOperation: string;

  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  createImageData(w: number, h: number): PixelBuffer;
  getImageData(x: number, y: number, w: number, h: number): PixelBuffer;
  putImageData(
    img: PixelBuffer,
    dx: number,
    dy: number,
    dirtyX?: number,
    dirtyY?: number,
    dirtyW?: number,
    dirtyH?: number,
  ): void;
  drawImage(source: unknown, ...args: number[]): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(...args: number[]): void;
  rect(x: number, y: number, w: number, h: number): void;
  stroke(): void;
  fill(): void;
  setLineDash(segments: number[]): void;
  getLineDash(): number[];
  fillText(text: string, x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;
  setTransform(...args: number[]): void;
  clip(): void;
  createLinearGradient(...args: number[]): StubGradient;
  createRadialGradient(...args: number[]): StubGradient;
}

/** A stub canvas element, enough for `drawImage(otherCanvas, …)`. */
export interface StubCanvas {
  width: number;
  height: number;
  getContext(id: string): StubContext | null;
}

function isPixelBuffer(v: unknown): v is PixelBuffer {
  return (
    typeof v === "object" &&
    v !== null &&
    "data" in v &&
    "width" in v &&
    "height" in v
  );
}

/**
 * Create a stub `CanvasRenderingContext2D` backed by a real pixel buffer.
 *
 * Read the support table at the top of this file before trusting a hash taken
 * from one of these: rectangles and image data are exact, paths and text are
 * recorded but draw nothing.
 */
export function createStubContext(width: number, height: number): StubContext {
  const buffer = createBuffer(width, height);
  const calls: RecordedCall[] = [];
  const stack: CtxState[] = [];
  let dash: number[] = [];

  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
  };

  /** Source-over composite of one RGBA sample onto the buffer. */
  const composite = (x: number, y: number, rgba: RGBA, alpha: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const srcA = (rgba[3] / 255) * alpha;
    if (srcA <= 0) return;
    const i = (y * width + x) * 4;
    if (srcA >= 1) {
      buffer.data[i] = rgba[0];
      buffer.data[i + 1] = rgba[1];
      buffer.data[i + 2] = rgba[2];
      buffer.data[i + 3] = 255;
      return;
    }
    const dstA = buffer.data[i + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) {
      buffer.data[i] = 0;
      buffer.data[i + 1] = 0;
      buffer.data[i + 2] = 0;
      buffer.data[i + 3] = 0;
      return;
    }
    for (let c = 0; c < 3; c++) {
      buffer.data[i + c] = Math.round(
        (rgba[c] * srcA + buffer.data[i + c] * dstA * (1 - srcA)) / outA,
      );
    }
    buffer.data[i + 3] = Math.round(outA * 255);
  };

  /** Integer-snap a rect the way a pixel-art renderer expects. */
  const snap = (x: number, y: number, w: number, h: number) => {
    const x0 = Math.round(x + ctx.__offsetX);
    const y0 = Math.round(y + ctx.__offsetY);
    return { x0, y0, x1: x0 + Math.round(w), y1: y0 + Math.round(h) };
  };

  const styleOf = (style: string | StubGradient): RGBA | null => {
    if (typeof style !== "string") return null; // gradients rasterise nothing
    return parseColor(style);
  };

  const ctx = {
    buffer,
    calls,
    canvas: { width, height },

    // Mutable state
    fillStyle: "#000000" as string | StubGradient,
    strokeStyle: "#000000" as string | StubGradient,
    globalAlpha: 1,
    lineWidth: 1,
    lineDashOffset: 0,
    imageSmoothingEnabled: true,
    font: "10px sans-serif",
    shadowColor: "rgba(0, 0, 0, 0)",
    shadowBlur: 0,
    globalCompositeOperation: "source-over",

    // Translation is tracked outside the public surface.
    __offsetX: 0,
    __offsetY: 0,

    /* ── Rasterised ─────────────────────────────────────────────────────── */

    fillRect(x: number, y: number, w: number, h: number) {
      record("fillRect", x, y, w, h);
      const rgba = styleOf(ctx.fillStyle);
      if (!rgba) return;
      const { x0, y0, x1, y1 } = snap(x, y, w, h);
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          composite(px, py, rgba, ctx.globalAlpha);
        }
      }
    },

    clearRect(x: number, y: number, w: number, h: number) {
      record("clearRect", x, y, w, h);
      const { x0, y0, x1, y1 } = snap(x, y, w, h);
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          const i = (py * width + px) * 4;
          buffer.data[i] = 0;
          buffer.data[i + 1] = 0;
          buffer.data[i + 2] = 0;
          buffer.data[i + 3] = 0;
        }
      }
    },

    /**
     * A 1px-per-unit inset-free outline. Real canvas strokes straddle the path
     * by `lineWidth / 2` with anti-aliasing; this draws crisp integer bands of
     * `Math.max(1, Math.round(lineWidth))` INSIDE the rect. Good enough for
     * pixel-grid and selection-box regressions, NOT a faithful stroke model.
     */
    strokeRect(x: number, y: number, w: number, h: number) {
      record("strokeRect", x, y, w, h);
      const rgba = styleOf(ctx.strokeStyle);
      if (!rgba) return;
      const { x0, y0, x1, y1 } = snap(x, y, w, h);
      const t = Math.max(1, Math.round(ctx.lineWidth));
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const onEdge =
            px < x0 + t || px >= x1 - t || py < y0 + t || py >= y1 - t;
          if (onEdge) composite(px, py, rgba, ctx.globalAlpha);
        }
      }
    },

    createImageData(w: number, h: number): PixelBuffer {
      record("createImageData", w, h);
      return createBuffer(w, h);
    },

    getImageData(x: number, y: number, w: number, h: number): PixelBuffer {
      record("getImageData", x, y, w, h);
      const out = createBuffer(w, h);
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const sx = x + px;
          const sy = y + py;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          const si = (sy * width + sx) * 4;
          const di = (py * w + px) * 4;
          out.data[di] = buffer.data[si];
          out.data[di + 1] = buffer.data[si + 1];
          out.data[di + 2] = buffer.data[si + 2];
          out.data[di + 3] = buffer.data[si + 3];
        }
      }
      return out;
    },

    /** Exact per-spec semantics: overwrites, ignores globalAlpha and transform. */
    putImageData(
      img: PixelBuffer,
      dx: number,
      dy: number,
      dirtyX = 0,
      dirtyY = 0,
      dirtyW = img.width,
      dirtyH = img.height,
    ) {
      record("putImageData", img.width, img.height, dx, dy);
      for (let py = dirtyY; py < dirtyY + dirtyH; py++) {
        for (let px = dirtyX; px < dirtyX + dirtyW; px++) {
          if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
          const tx = dx + px;
          const ty = dy + py;
          if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
          const si = (py * img.width + px) * 4;
          const di = (ty * width + tx) * 4;
          buffer.data[di] = img.data[si];
          buffer.data[di + 1] = img.data[si + 1];
          buffer.data[di + 2] = img.data[si + 2];
          buffer.data[di + 3] = img.data[si + 3];
        }
      }
    },

    /**
     * Nearest-neighbour blit from another StubCanvas / StubContext / PixelBuffer.
     * Supports the 3-, 5- and 9-argument forms. Sources this stub cannot read
     * (a real `HTMLImageElement`, a `Blob` URL) are recorded and skipped.
     */
    drawImage(source: unknown, ...args: number[]) {
      record("drawImage", args);
      let src: PixelBuffer | null = null;
      if (isPixelBuffer(source)) {
        src = source;
      } else if (
        typeof source === "object" &&
        source !== null &&
        "buffer" in source &&
        isPixelBuffer((source as { buffer: unknown }).buffer)
      ) {
        src = (source as { buffer: PixelBuffer }).buffer;
      } else if (
        typeof source === "object" &&
        source !== null &&
        "getContext" in source
      ) {
        const sc = (source as StubCanvas).getContext("2d");
        if (sc) src = sc.buffer;
      }
      if (!src) return;

      let sx = 0;
      let sy = 0;
      let sw = src.width;
      let sh = src.height;
      let dx: number;
      let dy: number;
      let dw: number;
      let dh: number;

      if (args.length >= 8) {
        [sx, sy, sw, sh, dx, dy, dw, dh] = args as [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
        ];
      } else if (args.length >= 4) {
        [dx, dy, dw, dh] = args as [number, number, number, number];
      } else {
        [dx, dy] = args as [number, number];
        dw = src.width;
        dh = src.height;
      }

      const ox = Math.round(dx + ctx.__offsetX);
      const oy = Math.round(dy + ctx.__offsetY);
      const ow = Math.round(dw);
      const oh = Math.round(dh);
      if (ow <= 0 || oh <= 0) return;

      for (let py = 0; py < oh; py++) {
        for (let px = 0; px < ow; px++) {
          const u = Math.min(sw - 1, Math.floor((px / ow) * sw)) + sx;
          const v = Math.min(sh - 1, Math.floor((py / oh) * sh)) + sy;
          if (u < 0 || v < 0 || u >= src.width || v >= src.height) continue;
          const si = (v * src.width + u) * 4;
          composite(
            ox + px,
            oy + py,
            [
              src.data[si],
              src.data[si + 1],
              src.data[si + 2],
              src.data[si + 3],
            ],
            ctx.globalAlpha,
          );
        }
      }
    },

    save() {
      record("save");
      stack.push({
        fillStyle:
          typeof ctx.fillStyle === "string" ? ctx.fillStyle : "#000000",
        strokeStyle:
          typeof ctx.strokeStyle === "string" ? ctx.strokeStyle : "#000000",
        globalAlpha: ctx.globalAlpha,
        lineWidth: ctx.lineWidth,
        offsetX: ctx.__offsetX,
        offsetY: ctx.__offsetY,
      });
    },

    restore() {
      record("restore");
      const s = stack.pop();
      if (!s) return;
      ctx.fillStyle = s.fillStyle;
      ctx.strokeStyle = s.strokeStyle;
      ctx.globalAlpha = s.globalAlpha;
      ctx.lineWidth = s.lineWidth;
      ctx.__offsetX = s.offsetX;
      ctx.__offsetY = s.offsetY;
    },

    /** Integer translation only. Fractional offsets are rounded at draw time. */
    translate(x: number, y: number) {
      record("translate", x, y);
      ctx.__offsetX += x;
      ctx.__offsetY += y;
    },

    /* ── Recorded but NOT rasterised ────────────────────────────────────── */

    beginPath() {
      record("beginPath");
    },
    closePath() {
      record("closePath");
    },
    moveTo(x: number, y: number) {
      record("moveTo", x, y);
    },
    lineTo(x: number, y: number) {
      record("lineTo", x, y);
    },
    arc(...args: number[]) {
      record("arc", ...args);
    },
    rect(x: number, y: number, w: number, h: number) {
      record("rect", x, y, w, h);
    },
    stroke() {
      record("stroke");
    },
    fill() {
      record("fill");
    },
    setLineDash(segments: number[]) {
      record("setLineDash", segments);
      dash = [...segments];
    },
    getLineDash() {
      return [...dash];
    },
    fillText(text: string, x: number, y: number) {
      record("fillText", text, x, y);
    },
    scale(x: number, y: number) {
      record("scale", x, y);
    },
    rotate(angle: number) {
      record("rotate", angle);
    },
    setTransform(...args: number[]) {
      record("setTransform", ...args);
    },
    clip() {
      record("clip");
    },
    createLinearGradient(...args: number[]): StubGradient {
      record("createLinearGradient", ...args);
      return makeGradient();
    },
    createRadialGradient(...args: number[]): StubGradient {
      record("createRadialGradient", ...args);
      return makeGradient();
    },
  };

  return ctx as unknown as StubContext;
}

function makeGradient(): StubGradient {
  const stops: { offset: number; color: string }[] = [];
  return {
    __stubGradient: true,
    stops,
    addColorStop(offset: number, color: string) {
      stops.push({ offset, color });
    },
  };
}

/**
 * Create a stub canvas element whose `getContext("2d")` returns a stub context.
 *
 * Use it when the code under test reaches for `canvas.getContext("2d")` itself
 * rather than accepting a context. `getContext` for any id other than `"2d"`
 * returns `null`, matching the browser.
 */
export function createStubCanvas(width: number, height: number): StubCanvas {
  const ctx = createStubContext(width, height);
  return {
    width,
    height,
    getContext(id: string) {
      return id === "2d" ? ctx : null;
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* The render-and-hash helper                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Render a fixture through a stub context and return the hash of the pixels it
 * produced. This is the one-liner tasks 30 and 33 use to prove a renderer
 * refactor changed nothing.
 *
 * ```ts
 * const before = renderToHash(64, 64, (ctx) => drawCheckerboard(ctx, 64, 64, 8));
 * // …refactor…
 * expect(renderToHash(64, 64, (ctx) => drawCheckerboard(ctx, 64, 64, 8))).toBe(before);
 * ```
 *
 * **Throws if the renderer left the buffer completely blank.** A stroke-only
 * renderer (marching ants, lasso outline, origin cross) rasterises nothing
 * through this stub, and a hash of an all-zero buffer would be a green test
 * that proves nothing. Pass `{ allowBlank: true }` only when a blank result is
 * the assertion, and use `ctx.calls` for stroke-based renderers instead.
 */
export function renderToHash(
  width: number,
  height: number,
  render: (ctx: StubContext) => void,
  options: { allowBlank?: boolean } = {},
): string {
  const ctx = createStubContext(width, height);
  render(ctx);
  if (!options.allowBlank && isBlank(ctx.buffer)) {
    throw new Error(
      `renderToHash: the renderer left a ${width}×${height} buffer entirely ` +
        `blank. canvasStub does not rasterise paths, gradients or text — if ` +
        `this renderer draws with stroke()/arc()/fill(), assert on ctx.calls ` +
        `instead. Pass { allowBlank: true } if blank really is the expectation.`,
    );
  }
  return hashBuffer(ctx.buffer);
}

/**
 * The buffer-in/buffer-out counterpart of {@link renderToHash} — the *preferred*
 * strategy, since it involves no context emulation at all and runs in the fast
 * `unit` project.
 */
export function renderBufferToHash(
  width: number,
  height: number,
  render: (buf: PixelBuffer) => PixelBuffer | void,
): string {
  const buf = createBuffer(width, height);
  const out = render(buf);
  return hashBuffer(out ?? buf);
}
