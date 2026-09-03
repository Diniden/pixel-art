/**
 * Pose tool — the WebGL lifecycle owner.
 *
 * `PoseEngine` is the one place in the app that creates a WebGL context. It
 * owns a `WebGLRenderer`, a scene with a key light and an ambient fill, a
 * camera, and an offscreen render target; it renders on demand and hands back
 * a plain RGBA `Uint8Array`. It knows nothing about meshes (task 06), the
 * camera presets (task 06), React, or the overlay canvas (tasks 04/08).
 *
 * ## The 1:1 render-target contract (MASTER D5) — this IS the pixelation
 *
 * The render target is created at **exactly `cellWidth × cellHeight`**: one
 * texel per art pixel, the same dimensions every other canvas in the stack
 * uses. Magnification is handled entirely by the existing CSS transform on
 * `.canvas__layout` plus `image-rendering: pixelated`.
 *
 * Consequently:
 *
 * - the renderer is created with `antialias: false`;
 * - the target's texture uses `NearestFilter` for BOTH `minFilter` and
 *   `magFilter`;
 * - `setPixelRatio(1)` — a HiDPI ratio would silently allocate a larger
 *   drawing buffer and reintroduce the downsample this design exists to avoid;
 * - nothing here ever renders large and downsamples, and nothing ever blits
 *   with a scaling `drawImage`.
 *
 * Any of `antialias: true`, a `LinearFilter`, or a scaling blit defeats the
 * whole feature — the reference would arrive smooth and anti-aliased instead
 * of aliased to the artwork's own grid.
 *
 * ## ⚠️ Readback origin: WebGL is bottom-left, `ImageData` is top-left
 *
 * `readRenderTargetPixels` fills the buffer starting at the BOTTOM-left texel,
 * while `ImageData` (and therefore `putImageData` and the pixel grid) starts
 * at the TOP-left. The rows must be flipped before the buffer becomes pixels
 * or the model renders upside down — the single most likely bug in this
 * module. `render()` does the flip; the flip itself is exported as the pure
 * {@link flipRowsInPlace} so tasks 06/08 can rely on it and it can be
 * unit-tested with no GL context.
 *
 * ## Transparent clear
 *
 * The target clears to alpha 0 so the artwork shows through everywhere the
 * model is not. The renderer is created with `alpha: true` and
 * `setClearColor(0x000000, 0)`; `setBackgroundTransparent()` re-asserts it.
 *
 * ## ⚠️ Disposal obligation
 *
 * WebGL contexts are a scarce browser resource and three does not garbage
 * collect GPU memory. Every renderer, render target, geometry and material
 * created here must be released:
 *
 * - `resize()` disposes the render target it replaces;
 * - `setObject3D()` / `clearObject3D()` dispose the outgoing root's geometries
 *   and materials;
 * - `dispose()` releases the render target, the current object, and the
 *   renderer itself (plus `forceContextLoss()`, which actually frees the
 *   context rather than waiting for GC).
 *
 * The caller MUST call `dispose()` on unmount. Churning undisposed contexts on
 * repeated tool switches crashes the tab (MASTER risk register).
 *
 * ## Purity and lazy loading
 *
 * No store, no MobX, no React, no API, no `services/` (MASTER D15). three is
 * ~600 kB minified and is loaded through a **dynamic** `import("three")`
 * resolved once and cached, so it stays out of the main bundle until the pose
 * tool is first used (MASTER D2). There is deliberately **no module-level
 * runtime import of three anywhere in `src/`** — the type-only import below is
 * erased at build time and pulls in nothing.
 *
 * ## Testing
 *
 * jsdom has no WebGL, so nothing that constructs a renderer can be unit-tested
 * (MASTER risk register). The pure parts — {@link flipRowsInPlace} and the
 * helpers in `poseTypes.ts` — are tested in the node lane; the GL lifecycle is
 * covered by task 08's manual checks.
 */
import type {
  AmbientLight,
  Camera,
  Color as ThreeColor,
  DirectionalLight,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";

/**
 * The camera types this engine will render with.
 *
 * ⚠️ Widened from `PerspectiveCamera` by pose-tool task 08, under the
 * coordinator's authorised scope extension of 2026-09-03. MASTER D14 makes
 * FOUR of the five camera presets orthographic, and `OrthographicCamera` is
 * not assignable to `PerspectiveCamera` in `@types/three` — so the original
 * signature could not express the feature the presets describe.
 *
 * A union rather than the bare `Camera` base class: `resize()` below narrows
 * on `isPerspectiveCamera` to refresh the aspect ratio, and the union is what
 * makes that discriminant visible to the compiler. `Camera` is still imported
 * so the intent — "any three camera would render" — stays legible; only the
 * two the presets actually produce are accepted.
 */
export type PoseEngineCamera = PerspectiveCamera | OrthographicCamera;

/**
 * Compile-time assertion that the union really is a `Camera`, so a future
 * widening cannot admit something the renderer would reject. `AssertCamera` is
 * `never` if it ever stops holding, and a `never` type parameter is a `tsc`
 * error at the `satisfies` below. Both are erased at build time.
 */
type AssertCamera<T extends Camera> = T;
export type PoseEngineCameraIsCamera = AssertCamera<PoseEngineCamera>;
import type { PoseColor, PoseVector } from "@/ui/canvas/pose/poseTypes";

/** The three module namespace, as returned by the dynamic import. */
type ThreeModule = typeof import("three");

/**
 * The single in-flight/settled `import("three")`.
 *
 * Module-level so repeated `PoseEngine.create()` calls (StrictMode's double
 * invocation, or a tool toggled on and off) share one network fetch and one
 * module instance. Kept as the promise rather than the resolved namespace so
 * two concurrent creates await the same request instead of racing two.
 */
let threePromise: Promise<ThreeModule> | null = null;

/**
 * Resolve the three namespace, fetching the chunk on first call.
 *
 * ⚠️ The specifier must stay a bare, statically-analysable `"three"` string —
 * Vite needs to see it to emit the separate chunk. A computed specifier would
 * defeat the code split and drag three into the main bundle.
 */
export function loadThree(): Promise<ThreeModule> {
  threePromise ??= import("three");
  return threePromise;
}

/** Default key-light direction, if the caller never sets one. */
const DEFAULT_LIGHT_DIRECTION: PoseVector = { x: -0.5, y: 0.7, z: 1 };

/** How much of the lighting is flat fill, so unlit faces are not pure black. */
const AMBIENT_INTENSITY = 0.55;

/** Key-light strength. Paired with the ambient above to keep facets readable. */
const KEY_INTENSITY = 1.15;

/**
 * Flip `buf`'s rows top-to-bottom, in place, and return it.
 *
 * `buf` is RGBA — `width * height * 4` bytes, 4 bytes per texel — laid out row
 * by row. This converts between WebGL's bottom-left readback origin and the
 * top-left origin that `ImageData` and the pixel grid use (see the header).
 *
 * Only `floor(height / 2)` row pairs are swapped, so an odd height leaves its
 * middle row untouched — which is correct: the middle row of an odd-height
 * image is its own mirror.
 *
 * Returns the SAME array it was given (the swap is in place); the return value
 * exists so calls can be chained, not to signal a copy. A buffer whose length
 * does not match `width * height * 4`, or a non-positive dimension, is
 * returned unchanged rather than throwing — a partially swapped buffer would
 * be worse than an unswapped one, and the caller has nothing useful to do with
 * an exception mid-frame.
 */
export function flipRowsInPlace(
  buf: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (width <= 0 || height <= 0) return buf;
  const stride = width * 4;
  if (buf.length !== stride * height) return buf;

  const row = new Uint8Array(stride);
  for (let top = 0, bottom = height - 1; top < bottom; top++, bottom--) {
    const topStart = top * stride;
    const bottomStart = bottom * stride;
    row.set(buf.subarray(topStart, topStart + stride));
    buf.copyWithin(topStart, bottomStart, bottomStart + stride);
    buf.set(row, bottomStart);
  }
  return buf;
}

/**
 * Owns the WebGL renderer, scene, camera and offscreen render target for the
 * pose overlay. Construct with the async {@link PoseEngine.create}; the
 * constructor is private because three must be loaded first.
 */
export class PoseEngine {
  /** The three namespace this instance was built from. */
  private readonly three: ThreeModule;

  private readonly renderer: WebGLRenderer;

  private readonly scene: Scene;

  /**
   * A placeholder perspective camera. Task 06 owns the presets, framing and
   * auto-fit; this exists only so the engine can render something at all.
   *
   * Typed as the {@link PoseEngineCamera} union because task 08 installs an
   * `OrthographicCamera` for four of the five presets (D14).
   */
  private camera: PoseEngineCamera;

  private readonly keyLight: DirectionalLight;

  private readonly ambient: AmbientLight;

  /** Allocated by `resize()`. `null` until the first call. */
  private target: WebGLRenderTarget | null = null;

  private targetWidth = 0;

  private targetHeight = 0;

  /** The one root object the scene holds, if any. */
  private root: Object3D | null = null;

  /** Reused across frames so a pointer-rate render allocates nothing. */
  private readback: Uint8Array = new Uint8Array(0);

  private disposed = false;

  private constructor(three: ThreeModule) {
    this.three = three;

    // `alpha: true` + a zero-alpha clear is what lets the artwork show through
    // everywhere the model is not. `antialias: false` is contractual (D5):
    // MSAA would blend silhouette texels and soften the pixel edges.
    this.renderer = new three.WebGLRenderer({
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    // ⚠️ Never `window.devicePixelRatio` here — see the header. The target is
    // 1:1 with the art grid and a >1 ratio would silently supersample it.
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new three.Scene();
    // A null background (rather than a colour) leaves the clear alpha at 0.
    this.scene.background = null;

    this.ambient = new three.AmbientLight(0xffffff, AMBIENT_INTENSITY);
    this.scene.add(this.ambient);

    this.keyLight = new three.DirectionalLight(0xffffff, KEY_INTENSITY);
    this.keyLight.position.set(
      DEFAULT_LIGHT_DIRECTION.x,
      DEFAULT_LIGHT_DIRECTION.y,
      DEFAULT_LIGHT_DIRECTION.z,
    );
    this.keyLight.target.position.set(0, 0, 0);
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    // Placeholder only — task 06 replaces the framing entirely.
    this.camera = new three.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * Build an engine, lazily fetching the three chunk on the first call of the
   * session. Rejects if the chunk cannot be loaded or if WebGL is unavailable
   * (the `WebGLRenderer` constructor throws) — the caller should treat that as
   * "the pose tool cannot run here", not as a crash.
   */
  static async create(): Promise<PoseEngine> {
    const three = await loadThree();
    return new PoseEngine(three);
  }

  /** `true` once {@link dispose} has run. Every other method is then a no-op. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Current render-target size, `{ width: 0, height: 0 }` before the first resize. */
  get size(): { width: number; height: number } {
    return { width: this.targetWidth, height: this.targetHeight };
  }

  /**
   * Allocate the offscreen target at **exactly** `width × height` — one texel
   * per art pixel (D5). Call this whenever `cellWidth`/`cellHeight` change;
   * resize notifies through `domainVersion`, not `pixelVersion`.
   *
   * Idempotent: a call with the size already in force does nothing, so it is
   * safe to invoke from a render path on every frame. Any previous target is
   * disposed before the new one is allocated. Non-positive or non-finite
   * dimensions are ignored — there is no sensible zero-area target and
   * allocating one would make `render()` return an empty frame for the rest of
   * the session.
   */
  resize(width: number, height: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;

    const w = Math.floor(width);
    const h = Math.floor(height);
    if (w <= 0 || h <= 0) return;
    if (this.target && this.targetWidth === w && this.targetHeight === h) return;

    this.target?.dispose();

    // NearestFilter on BOTH filters is contractual (D5). LinearFilter here is
    // the classic way to accidentally blur a 1:1 pixel-art target.
    this.target = new this.three.WebGLRenderTarget(w, h, {
      minFilter: this.three.NearestFilter,
      magFilter: this.three.NearestFilter,
      format: this.three.RGBAFormat,
      type: this.three.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0, // no MSAA — same reason as `antialias: false`
    });

    this.targetWidth = w;
    this.targetHeight = h;
    this.renderer.setSize(w, h, false);

    const needed = w * h * 4;
    if (this.readback.length !== needed) this.readback = new Uint8Array(needed);

    // ⚠️ `"isPerspectiveCamera" in camera`, not a property read. Both classes
    // declare their own flag as the literal `true`, so neither flag exists on
    // the other member of the union and a direct read does not compile. The
    // `in` check is the discriminant TypeScript can actually narrow on.
    const camera = this.camera;
    if ("isPerspectiveCamera" in camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  /**
   * Aim the key light along `direction` (from the light toward the origin) and
   * tint it with `color`.
   *
   * `direction` need not be unit length — three only reads the light's
   * position relative to its target — but a zero vector would leave the light
   * coincident with its target and produce an undefined direction, so it is
   * ignored. `color`'s alpha is not used: a light has no opacity.
   */
  setLight(direction: PoseVector, color: PoseColor): void {
    if (this.disposed) return;

    const { x, y, z } = direction;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      if (x !== 0 || y !== 0 || z !== 0) {
        this.keyLight.position.set(x, y, z);
        this.keyLight.target.position.set(0, 0, 0);
        this.keyLight.target.updateMatrixWorld();
      }
    }
    applyColor(this.keyLight.color, color);
    applyColor(this.ambient.color, color);
  }

  /**
   * Re-assert the transparent clear: the target clears to alpha 0 so the
   * artwork shows through everywhere the model is not.
   *
   * The constructor already does this; the method exists because a caller that
   * has poked at the renderer (or a future task that adds a second pass with
   * its own clear colour) needs a way back to the contract without
   * reconstructing the engine.
   */
  setBackgroundTransparent(): void {
    if (this.disposed) return;
    this.scene.background = null;
    this.renderer.setClearColor(0x000000, 0);
  }

  /**
   * Install `obj` as the scene's single root, disposing whatever it replaces.
   *
   * The engine holds exactly one root: task 06 supplies the meshes and swaps
   * them through here, and the engine takes ownership — the outgoing object's
   * geometries and materials are disposed, so the caller must not keep using
   * an object it has handed over.
   */
  setObject3D(obj: Object3D): void {
    if (this.disposed) return;
    if (this.root === obj) return;
    this.clearObject3D();
    this.root = obj;
    this.scene.add(obj);
  }

  /**
   * Remove and dispose the current root, if any. Safe to call when there is
   * none.
   */
  clearObject3D(): void {
    if (!this.root) return;
    this.scene.remove(this.root);
    disposeObject3D(this.root);
    this.root = null;
  }

  /**
   * Replace the placeholder camera (task 06 owns the real ones).
   *
   * Accepts either projection — see {@link PoseEngineCamera}. The engine does
   * NOT take ownership: a camera holds no GPU resource, so there is nothing to
   * dispose and `dispose()` deliberately leaves it alone.
   */
  setCamera(camera: PoseEngineCamera): void {
    if (this.disposed) return;
    this.camera = camera;
  }

  /** The camera currently used for rendering. */
  getCamera(): PoseEngineCamera {
    return this.camera;
  }

  /**
   * Render one frame into the target and read it back as **top-left-origin**
   * RGBA — `width * height * 4` bytes, ready for `ImageData`.
   *
   * The rows are flipped for you (see the header): WebGL reads back
   * bottom-left first, `ImageData` starts top-left.
   *
   * ⚠️ The returned array is a buffer the engine REUSES on the next `render()`
   * so a pointer-rate repaint allocates nothing. Copy it if you need to keep
   * it past the current frame. Returns an empty array if the engine is
   * disposed or `resize()` has not run yet.
   */
  render(): Uint8Array {
    if (this.disposed || !this.target) return new Uint8Array(0);

    const w = this.targetWidth;
    const h = this.targetHeight;

    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, w, h, this.readback);
    // Back to the default framebuffer so nothing else inherits our target.
    this.renderer.setRenderTarget(null);

    return flipRowsInPlace(this.readback, w, h);
  }

  /**
   * Release every GPU resource this engine created: the render target, the
   * current root object's geometries and materials, and the renderer itself.
   *
   * `forceContextLoss()` is called after `renderer.dispose()` where available
   * — `dispose()` alone releases three's own bookkeeping but leaves the
   * context alive until GC, and browsers cap simultaneous contexts (~16), so a
   * tool toggled repeatedly would eventually fail to create one.
   *
   * Idempotent. Every other method becomes a no-op afterwards.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.clearObject3D();

    this.target?.dispose();
    this.target = null;
    this.targetWidth = 0;
    this.targetHeight = 0;
    this.readback = new Uint8Array(0);

    this.renderer.setRenderTarget(null);
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

/**
 * Write `color`'s 0–255 components into a three `Color`'s 0–1 channels.
 *
 * `setRGB` with three's default (`SRGBColorSpace` working space aside) treats
 * the values as being in the renderer's working space, which is what we want:
 * the palette colours the user picked are sRGB bytes.
 */
function applyColor(dest: ThreeColor, color: PoseColor): void {
  dest.setRGB(clamp01(color.r / 255), clamp01(color.g / 255), clamp01(color.b / 255));
}

/** `value` clamped to `[0, 1]`; `NaN` becomes 0 rather than propagating. */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Depth-first dispose of every geometry and material under `obj`.
 *
 * Materials may be a single instance or an array (multi-material meshes — the
 * mannequin has 2 slots, MASTER D3), and both forms must be walked. Textures
 * hanging off a material are NOT disposed here: three's own loaders cache
 * them, and a shared texture disposed by one mesh would break the next.
 */
function disposeObject3D(obj: Object3D): void {
  obj.traverse((node) => {
    const holder = node as Object3D & {
      geometry?: { dispose?: () => void };
      material?: { dispose?: () => void } | { dispose?: () => void }[];
    };
    holder.geometry?.dispose?.();
    const material = holder.material;
    if (Array.isArray(material)) {
      for (const m of material) m?.dispose?.();
    } else {
      material?.dispose?.();
    }
  });
}
