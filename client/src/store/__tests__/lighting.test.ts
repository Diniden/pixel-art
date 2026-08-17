/**
 * Behaviour contract — `store/lightingActions.ts`.
 *
 * The flip invariant is the load-bearing part: `flipHorizontal ∘ flipHorizontal
 * = identity` is asserted on an **ASYMMETRIC** fixture. A symmetric one passes
 * trivially and proves nothing — see the guard test that fails the fixture
 * itself if it ever becomes symmetric.
 *
 * The eight setters that never auto-save are pinned in `autoSave.test.ts`; this
 * file covers their VALUE semantics (clamping, coupled writes) instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLUE,
  GREEN,
  HARNESSES,
  RED,
  layerOf,
  tinyProject,
  type StoreHarness,
} from "./storeContract";
import { createBuffer, hashBuffer } from "@test/canvasStub";
import type { Normal, PixelData, Project } from "@/types";

vi.mock("@/services/api", async () => (await import("./mockApi")).apiMockFactory());

/* ── an ASYMMETRIC fixture ───────────────────────────────────────────────── */

/**
 * A deliberately asymmetric 4×4: an L-shape whose colours, normals and heights
 * all differ under every reflection.
 *
 * ```
 *  R . . .        (0,0) red    normal {-30, -10, 200}  height 10
 *  B . . .        (0,1) blue   normal { 40,  20, 210}  height 20
 *  G G . .        (0,2) green  normal {-50,  30, 220}  height 30
 *  . . . .        (1,2) red    normal { 60, -40, 230}  height 40
 * ```
 */
function asymmetricProject(): Project {
  const cells: Array<[number, number, PixelData]> = [
    [
      0,
      0,
      { color: RED, normal: { x: -30, y: -10, z: 200 }, height: 10 },
    ],
    [
      0,
      1,
      { color: BLUE, normal: { x: 40, y: 20, z: 210 }, height: 20 },
    ],
    [
      0,
      2,
      { color: GREEN, normal: { x: -50, y: 30, z: 220 }, height: 30 },
    ],
    [
      1,
      2,
      { color: RED, normal: { x: 60, y: -40, z: 230 }, height: 40 },
    ],
  ];
  const p = tinyProject();
  const pixels = p.objects[0].frames[0].layers[0].pixels;
  for (const [x, y, pd] of cells) pixels[y][x] = pd;
  return p;
}

/** A content hash over colour + normal + height of the current layer. */
function layerHash(harness: StoreHarness): string {
  const layer = layerOf(harness.getProject())!;
  const h = layer.pixels.length;
  const w = layer.pixels[0].length;
  // Two rows of RGBA per pixel row: one for colour, one for normal+height.
  const buf = createBuffer(w, h * 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pd = layer.pixels[y][x];
      const c = (y * w + x) * 4;
      if (pd.color !== 0) {
        buf.data[c] = pd.color.r;
        buf.data[c + 1] = pd.color.g;
        buf.data[c + 2] = pd.color.b;
        buf.data[c + 3] = pd.color.a;
      }
      const n = ((h + y) * w + x) * 4;
      if (pd.normal !== 0) {
        buf.data[n] = pd.normal.x + 128;
        buf.data[n + 1] = pd.normal.y + 128;
        buf.data[n + 2] = pd.normal.z;
      }
      buf.data[n + 3] = pd.height;
    }
  }
  return hashBuffer(buf);
}

/** Colour+normal+height grid, transposed. Used for the H/V agreement test. */
function transposedCells(harness: StoreHarness): string {
  const layer = layerOf(harness.getProject())!;
  const h = layer.pixels.length;
  const w = layer.pixels[0].length;
  const out: unknown[] = [];
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const pd = layer.pixels[y][x];
      out.push([
        pd.color === 0 ? 0 : [pd.color.r, pd.color.g, pd.color.b, pd.color.a],
        // Swap the normal's x and y under transposition.
        pd.normal === 0 ? 0 : [pd.normal.y, pd.normal.x, pd.normal.z],
        pd.height,
      ]);
    }
  }
  return JSON.stringify(out);
}

function cells(harness: StoreHarness): string {
  const layer = layerOf(harness.getProject())!;
  const out: unknown[] = [];
  for (const row of layer.pixels) {
    for (const pd of row) {
      out.push([
        pd.color === 0 ? 0 : [pd.color.r, pd.color.g, pd.color.b, pd.color.a],
        pd.normal === 0 ? 0 : [pd.normal.x, pd.normal.y, pd.normal.z],
        pd.height,
      ]);
    }
  }
  return JSON.stringify(out);
}

describe.each(HARNESSES)("%s — lighting", (_name, makeHarness) => {
  let harness: StoreHarness;

  beforeEach(() => {
    harness = makeHarness();
    harness.reset();
    harness.load(asymmetricProject());
  });

  afterEach(() => {
    harness.dispatch("endStroke");
    harness.reset();
  });

  /* ══ THE FLIP INVARIANTS ═══════════════════════════════════════════════ */

  describe("flipHorizontal / flipVertical", () => {
    it("GUARD: the fixture really is asymmetric under BOTH reflections", () => {
      // Without this guard the identity tests below would pass vacuously.
      const before = cells(harness);
      harness.dispatch("flipHorizontal");
      expect(cells(harness)).not.toBe(before);

      harness.load(asymmetricProject());
      harness.dispatch("flipVertical");
      expect(cells(harness)).not.toBe(before);
    });

    it("flipHorizontal ∘ flipHorizontal === identity", () => {
      const before = layerHash(harness);
      harness.dispatch("flipHorizontal");
      expect(layerHash(harness)).not.toBe(before);
      harness.dispatch("flipHorizontal");
      expect(layerHash(harness)).toBe(before);
    });

    it("flipVertical ∘ flipVertical === identity", () => {
      const before = layerHash(harness);
      harness.dispatch("flipVertical");
      expect(layerHash(harness)).not.toBe(before);
      harness.dispatch("flipVertical");
      expect(layerHash(harness)).toBe(before);
    });

    it("flipHorizontal moves a pixel to (width-1-x, y)", () => {
      harness.dispatch("flipHorizontal");
      const px = layerOf(harness.getProject())!.pixels;
      // (0,0) -> (3,0)
      expect(px[0][3].color).toEqual(RED);
      expect(px[0][0].color).toBe(0);
      // (1,2) -> (2,2)
      expect(px[2][2].color).toEqual(RED);
    });

    it("flipVertical moves a pixel to (x, height-1-y)", () => {
      harness.dispatch("flipVertical");
      const px = layerOf(harness.getProject())!.pixels;
      // (0,0) -> (0,3)
      expect(px[3][0].color).toEqual(RED);
      // (0,2) -> (0,1)
      expect(px[1][0].color).toEqual(GREEN);
    });

    it("flipHorizontal NEGATES the normal's x and leaves y and z alone", () => {
      harness.dispatch("flipHorizontal");
      const px = layerOf(harness.getProject())!.pixels;
      expect(px[0][3].normal).toEqual({ x: 30, y: -10, z: 200 });
      expect(px[1][3].normal).toEqual({ x: -40, y: 20, z: 210 });
    });

    it("flipVertical NEGATES the normal's y and leaves x and z alone", () => {
      harness.dispatch("flipVertical");
      const px = layerOf(harness.getProject())!.pixels;
      expect(px[3][0].normal).toEqual({ x: -30, y: 10, z: 200 });
    });

    it("HEIGHT rides along unchanged under both flips", () => {
      harness.dispatch("flipHorizontal");
      expect(layerOf(harness.getProject())!.pixels[0][3].height).toBe(10);
      harness.dispatch("flipVertical");
      expect(layerOf(harness.getProject())!.pixels[3][3].height).toBe(10);
    });

    it("H and V AGREE modulo transpose: transpose∘flipH === flipV∘transpose", () => {
      // With T the transpose, H the horizontal flip and V the vertical flip, the
      // standard identity on a SQUARE grid is `T∘H = V∘T`. Written out:
      //   T(H(p))[y][x] = H(p)[x][y] = p[x][w-1-y]
      //   V(T(p))[y][x] = T(p)[h-1-y][x] = p[x][h-1-y]
      // …which agree exactly when w === h. `transposedCells` also swaps each
      // normal's x and y, the same correction the transposition applies to the
      // vector, so the two sides are directly comparable.
      harness.dispatch("flipHorizontal");
      const transposeAfterH = transposedCells(harness);

      harness.load(asymmetricProject());
      const transposeFirst = transposedCells(harness);
      // Apply V to the ALREADY-TRANSPOSED data by hand, since the store can only
      // flip the live layer. Load the transposed grid back in and flip it.
      const t = JSON.parse(transposeFirst) as Array<
        [number[] | 0, number[] | 0, number]
      >;
      const p = tinyProject();
      const px = p.objects[0].frames[0].layers[0].pixels;
      for (let i = 0; i < t.length; i++) {
        const [c, n, h] = t[i];
        const y = Math.floor(i / 4);
        const x = i % 4;
        px[y][x] = {
          color: c === 0 ? 0 : { r: c[0], g: c[1], b: c[2], a: c[3] },
          normal: n === 0 ? 0 : { x: n[0], y: n[1], z: n[2] },
          height: h,
        };
      }
      harness.load(p);
      harness.dispatch("flipVertical");

      expect(cells(harness)).toBe(transposeAfterH);
    });

    it("both flips TRACK history — one entry each", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("flipHorizontal");
      expect(harness.getHistoryLength()).toBe(before + 1);
      harness.dispatch("flipVertical");
      expect(harness.getHistoryLength()).toBe(before + 2);
    });

    it("one undo reverts a flip exactly", () => {
      const before = layerHash(harness);
      harness.dispatch("flipHorizontal");
      harness.dispatch("undo");
      expect(layerHash(harness)).toBe(before);
    });

    it("OBSERVED: flipping REBUILDS the grid, so a sparse row becomes dense", () => {
      // Both flips allocate a fresh `height × width` grid of explicit empty
      // PixelData (lightingActions.ts:793-801) rather than remapping in place.
      // A hole in the source therefore materialises as {color:0,normal:0,
      // height:0} rather than staying `undefined`.
      const p = asymmetricProject();
      delete (p.objects[0].frames[0].layers[0].pixels[3] as unknown as unknown[])[3];
      harness.load(p);
      harness.dispatch("flipHorizontal");
      expect(layerOf(harness.getProject())!.pixels[3][0]).toEqual({
        color: 0,
        normal: 0,
        height: 0,
      });
    });

    it("does nothing when no project is loaded", () => {
      harness.reset();
      expect(() => harness.dispatch("flipHorizontal")).not.toThrow();
      expect(() => harness.dispatch("flipVertical")).not.toThrow();
    });
  });

  /* ══ NORMALS FROM A KNOWN HEIGHT FIELD ═════════════════════════════════ */

  describe("computeNormalsForAllFrames", () => {
    it("hash tripwire — a solid 4×4 at a fixed angle/smoothing/radius", () => {
      const p = tinyProject();
      const px = p.objects[0].frames[0].layers[0].pixels;
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++)
          px[y][x] = { color: RED, normal: 0, height: 0 };
      harness.load(p);

      harness.dispatch("computeNormalsForAllFrames", {
        startAngle: 90,
        smoothing: 1.0,
        radius: 3.0,
      });

      expect(layerHash(harness)).toBe("4x8:c04af9bd");
    });

    it("writes normals ONLY where a colour exists", () => {
      harness.dispatch("computeNormalsForAllFrames", {
        startAngle: 90,
        smoothing: 1.0,
        radius: 3.0,
      });
      const px = layerOf(harness.getProject())!.pixels;
      // (3,3) is empty in the asymmetric fixture and stays normal-free.
      expect(px[3][3].color).toBe(0);
      expect(px[3][3].normal).toBe(0);
      // (0,0) is coloured and gains a normal.
      expect(px[0][0].normal).not.toBe(0);
    });

    it("PRESERVES colour and height while replacing normals", () => {
      harness.dispatch("computeNormalsForAllFrames", {
        startAngle: 90,
        smoothing: 1.0,
        radius: 3.0,
      });
      const px = layerOf(harness.getProject())!.pixels;
      expect(px[0][0].color).toEqual(RED);
      expect(px[0][0].height).toBe(10);
    });

    it("is DETERMINISTIC — the same params produce the same grid", () => {
      const params = { startAngle: 45, smoothing: 0.7, radius: 2.5 };
      harness.dispatch("computeNormalsForAllFrames", params);
      const first = layerHash(harness);

      harness.load(asymmetricProject());
      harness.dispatch("computeNormalsForAllFrames", params);
      expect(layerHash(harness)).toBe(first);
    });

    it("TRACKS history", () => {
      const before = harness.getHistoryLength();
      harness.dispatch("computeNormalsForAllFrames", {
        startAngle: 90,
        smoothing: 1,
        radius: 3,
      });
      expect(harness.getHistoryLength()).toBe(before + 1);
    });
  });

  /* ══ THE 8 RAW SETTERS — value semantics ═══════════════════════════════ */

  describe("the 8 raw lighting setters (value semantics)", () => {
    it("setStudioMode ALSO rewrites selectedTool — a coupled write", () => {
      harness.dispatch("setStudioMode", "lighting");
      expect(harness.getUiState().studioMode).toBe("lighting");
      expect(harness.getUiState().selectedTool).toBe("normal-pencil");

      harness.dispatch("setStudioMode", "pixel");
      expect(harness.getUiState().studioMode).toBe("pixel");
      expect(harness.getUiState().selectedTool).toBe("pixel");
    });

    it("setHeightBrushValue CLAMPS to 0..255 and ROUNDS", () => {
      harness.dispatch("setHeightBrushValue", -50);
      expect(harness.getUiState().heightBrushValue).toBe(0);

      harness.dispatch("setHeightBrushValue", 9999);
      expect(harness.getUiState().heightBrushValue).toBe(255);

      harness.dispatch("setHeightBrushValue", 127.6);
      expect(harness.getUiState().heightBrushValue).toBe(128);
    });

    it("setHeightScale CLAMPS to 1..500 and does NOT round", () => {
      harness.dispatch("setHeightScale", 0);
      expect(harness.getUiState().heightScale).toBe(1);

      harness.dispatch("setHeightScale", 9999);
      expect(harness.getUiState().heightScale).toBe(500);

      // OBSERVED: unlike setHeightBrushValue there is no Math.round here.
      harness.dispatch("setHeightScale", 123.45);
      expect(harness.getUiState().heightScale).toBe(123.45);
    });

    it("the remaining setters write their value through verbatim", () => {
      const normal: Normal = { x: 11, y: 22, z: 33 };
      harness.dispatch("setSelectedNormal", normal);
      expect(harness.getUiState().selectedNormal).toEqual(normal);

      harness.dispatch("setLightDirection", { x: -1, y: -2, z: 3 });
      expect(harness.getUiState().lightDirection).toEqual({
        x: -1,
        y: -2,
        z: 3,
      });

      harness.dispatch("setLightColor", RED);
      expect(harness.getUiState().lightColor).toEqual(RED);

      harness.dispatch("setAmbientColor", BLUE);
      expect(harness.getUiState().ambientColor).toEqual(BLUE);

      harness.dispatch("setLightingDataLayerEditMode", "height");
      expect(harness.getUiState().lightingDataLayerEditMode).toBe("height");
    });

    it("all 8 are NO-OPS when no project is loaded", () => {
      harness.reset();
      expect(() => {
        harness.dispatch("setStudioMode", "lighting");
        harness.dispatch("setLightingDataLayerEditMode", "height");
        harness.dispatch("setSelectedNormal", { x: 0, y: 0, z: 255 });
        harness.dispatch("setLightDirection", { x: 0, y: 0, z: 255 });
        harness.dispatch("setLightColor", RED);
        harness.dispatch("setAmbientColor", BLUE);
        harness.dispatch("setHeightBrushValue", 5);
        harness.dispatch("setHeightScale", 5);
      }).not.toThrow();
      expect(harness.getProject()).toBeNull();
    });
  });

  /* ── the normal/height pixel writers ───────────────────────────────────── */

  describe("setNormalPixel / setNormalPixels / setHeightPixels", () => {
    beforeEach(() => harness.load(asymmetricProject()));

    it("setNormalPixel replaces one normal and leaves colour and height alone", () => {
      harness.dispatch("setNormalPixel", 0, 0, { x: 7, y: 8, z: 9 });
      const pd = layerOf(harness.getProject())!.pixels[0][0];
      expect(pd.normal).toEqual({ x: 7, y: 8, z: 9 });
      expect(pd.color).toEqual(RED);
      expect(pd.height).toBe(10);
    });

    it("setNormalPixel with 0 clears the normal", () => {
      harness.dispatch("setNormalPixel", 0, 0, 0);
      expect(layerOf(harness.getProject())!.pixels[0][0].normal).toBe(0);
    });

    it("setNormalPixels writes a batch", () => {
      harness.dispatch("setNormalPixels", [
        { x: 0, y: 0, normal: { x: 1, y: 1, z: 1 } },
        { x: 0, y: 1, normal: { x: 2, y: 2, z: 2 } },
      ]);
      const px = layerOf(harness.getProject())!.pixels;
      expect(px[0][0].normal).toEqual({ x: 1, y: 1, z: 1 });
      expect(px[1][0].normal).toEqual({ x: 2, y: 2, z: 2 });
    });

    it("setHeightPixels writes heights and leaves colour and normal alone", () => {
      harness.dispatch("setHeightPixels", [{ x: 0, y: 0, height: 200 }]);
      const pd = layerOf(harness.getProject())!.pixels[0][0];
      expect(pd.height).toBe(200);
      expect(pd.color).toEqual(RED);
      expect(pd.normal).toEqual({ x: -30, y: -10, z: 200 });
    });

    it("all three TRACK history", () => {
      const start = harness.getHistoryLength();
      harness.dispatch("setNormalPixel", 0, 0, { x: 1, y: 1, z: 1 });
      harness.dispatch("setNormalPixels", [
        { x: 0, y: 1, normal: { x: 2, y: 2, z: 2 } },
      ]);
      harness.dispatch("setHeightPixels", [{ x: 0, y: 2, height: 99 }]);
      expect(harness.getHistoryLength()).toBe(start + 3);
    });
  });
});
