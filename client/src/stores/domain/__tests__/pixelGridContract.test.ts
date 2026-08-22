/**
 * R2 — THE PIXEL GRID CONTRACT (REFRESH task 23).
 *
 * The single largest performance risk in the whole refresh. The owner's real
 * project holds **300,249 `PixelData` cells**, each
 * `{color: Pixel|0, normal: Normal|0, height: number}`. MobX's default
 * `observable` is DEEP, so one wrong annotation on `DomainStore.objects`
 * builds roughly a million proxies — and the symptom is "MobX is slow", not
 * "someone annotated a field wrong".
 *
 * This suite is the automated half of the R2 gate:
 *
 *   1. every grid reachable from the tree is still a RAW array after adoption
 *      (`observableShallow`/`observableRef` held);
 *   2. the grid is the very same object that went in — never cloned;
 *   3. `palettes` IS deep, deliberately, so the annotation table is pinned in
 *      both directions rather than only the safe one;
 *   4. THE PERFORMANCE GATE: a 100-pixel drag stays under 16 ms/frame.
 *
 * (4) is a real measurement, not an assertion of intent: it builds a
 * realistically-sized grid, drives 100 sequential pixel writes through the
 * store the way a drag does, and reports the worst single frame. If the tree
 * were ever deep-observed this fails immediately and dramatically — which is
 * exactly the point.
 */
import { describe, expect, it } from "vitest";
import { isObservable, isObservableArray, observable, runInAction } from "mobx";

import { DomainStore, type ProjectHost } from "@/stores/domain/DomainStore";
import { SessionStore } from "@/stores/session/SessionStore";
import { assertGridsAreRaw, collectGrids } from "@/stores/domain/gridSafety";
import { createEmptyPixelGrid } from "@/types";
import type {
  Layer,
  PixelData,
  PixelObject,
  Project,
  VariantGroup,
} from "@/types";

/* ── fixtures ────────────────────────────────────────────────────────────── */

function makeDomain(): DomainStore {
  let current: Project | null = null;
  const host: ProjectHost = {
    getProject: () => current,
    installProject: (p) => {
      current = p;
    },
    replaceProject: (p) => {
      current = p;
    },
    snapshotToHistory: () => {},
  };
  return new DomainStore({ session: new SessionStore(), host });
}

function layer(id: string, w: number, h: number): Layer {
  return { id, name: id, pixels: createEmptyPixelGrid(w, h), visible: true };
}

function projectWith(w: number, h: number, layers = 1): Project {
  const object: PixelObject = {
    id: "obj-1",
    name: "Object",
    gridSize: { width: w, height: h },
    frames: [
      {
        id: "frame-1",
        name: "Frame",
        layers: Array.from({ length: layers }, (_, i) =>
          layer(`layer-${i}`, w, h),
        ),
      },
    ],
  };
  const variants: VariantGroup[] = [
    {
      id: "vg-1",
      name: "Group",
      variants: [
        {
          id: "v-1",
          name: "Variant",
          gridSize: { width: w, height: h },
          frames: [{ id: "vf-1", layers: [layer("vl-1", w, h)] }],
          baseFrameOffsets: {},
        },
      ],
    },
  ];
  return {
    version: "1.1.0",
    objects: [object],
    palettes: [
      { id: "pal-1", name: "P", colors: [{ r: 1, g: 2, b: 3, a: 4 }] },
    ],
    variants,
    uiState: {} as Project["uiState"],
  };
}

/* ── 1-3: the annotation table, pinned in BOTH directions ────────────────── */

describe("R2 — the observable kinds on DomainStore's tree", () => {
  it("objects is a SHALLOW observable array — elements are never proxied", () => {
    const domain = makeDomain();
    const project = projectWith(8, 8);
    runInAction(() => domain.adoptTree(project));

    // the array itself IS observable (add/remove/reorder propagates)…
    expect(isObservableArray(domain.objects as unknown as unknown[])).toBe(
      true,
    );
    // …but nothing below it is.
    expect(isObservable(domain.objects[0])).toBe(false);
    expect(isObservable(domain.objects[0].frames[0])).toBe(false);
    expect(isObservable(domain.objects[0].frames[0].layers[0])).toBe(false);
  });

  it("variants is SHALLOW too — VariantFrame.layers[].pixels stays raw", () => {
    const domain = makeDomain();
    runInAction(() => domain.adoptTree(projectWith(8, 8)));
    expect(isObservableArray(domain.variants as unknown as unknown[])).toBe(
      true,
    );
    expect(isObservable(domain.variants[0])).toBe(false);
  });

  it("EVERY pixel grid in the tree is still a RAW array", () => {
    const domain = makeDomain();
    runInAction(() => domain.adoptTree(projectWith(16, 16, 3)));

    const grids = collectGrids(domain.objects, domain.variants);
    // 3 object layers + 1 variant layer
    expect(grids).toHaveLength(4);
    for (const { grid } of grids) {
      expect(isObservableArray(grid as unknown as unknown[])).toBe(false);
      expect(isObservableArray(grid[0] as unknown as unknown[])).toBe(false);
      expect(isObservable(grid[0][0])).toBe(false);
    }
    // and the dedicated assertion agrees
    expect(() =>
      assertGridsAreRaw(domain.objects, domain.variants),
    ).not.toThrow();
  });

  it("grids are adopted BY REFERENCE — never cloned", () => {
    const domain = makeDomain();
    const project = projectWith(8, 8);
    const original = project.objects[0].frames[0].layers[0].pixels;
    runInAction(() => domain.adoptTree(project));
    expect(domain.objects[0].frames[0].layers[0].pixels).toBe(original);
  });

  it("referenceImage is a REF — the base64 payload is never proxied", () => {
    const domain = makeDomain();
    const image = {
      imageBase64: "data:image/png;base64,AAAA",
      selectionBox: { startX: 0, startY: 0, endX: 1, endY: 1 },
    };
    runInAction(() => domain.setReferenceImage(image));
    expect(domain.referenceImage).toBe(image);
    expect(isObservable(domain.referenceImage)).toBe(false);
  });

  it("palettes IS deep — the one deliberate exception", () => {
    // Pinned in the POSITIVE direction too: if a later task "optimises" this
    // to shallow, PaletteManager silently loses per-swatch granularity.
    const domain = makeDomain();
    runInAction(() => domain.adoptTree(projectWith(4, 4)));
    expect(isObservable(domain.palettes[0])).toBe(true);
  });

  it("assertGridsAreRaw THROWS when a grid has been made observable", () => {
    // The guard must be able to fail, or it proves nothing (the same
    // reasoning as the corpus `corpusFiles()` guard).
    const project = projectWith(4, 4);
    const poisoned = structuredClone(project);
    poisoned.objects[0].frames[0].layers[0].pixels = observable(
      poisoned.objects[0].frames[0].layers[0].pixels,
    );
    expect(() => assertGridsAreRaw(poisoned.objects, [])).toThrow(
      /R2 VIOLATION/,
    );
  });
});

/* ── 4: THE PERFORMANCE GATE ─────────────────────────────────────────────── */

describe("R2 GATE — a 100-pixel drag stays under 16 ms/frame", () => {
  it("measures the worst frame of a 100-pixel drag", () => {
    // A realistic canvas: 256×256 = 65,536 cells per layer, 4 layers →
    // 262,144 cells, close to the owner's measured 300,249. If the tree were
    // deep-observed, ADOPTION alone would build ~1M proxies and this test
    // would time out rather than merely fail.
    const WIDTH = 256;
    const HEIGHT = 256;
    const LAYERS = 4;
    const DRAG_LENGTH = 100;
    const BUDGET_MS = 16;

    const domain = makeDomain();
    const project = projectWith(WIDTH, HEIGHT, LAYERS);

    const adoptStart = performance.now();
    runInAction(() => domain.adoptTree(project));
    const adoptMs = performance.now() - adoptStart;

    const grid = domain.objects[0].frames[0].layers[0].pixels;
    expect(grid).toHaveLength(HEIGHT);

    // The drag: 100 sequential pixel writes, each followed by the version
    // bump every write path ends with. This is the shape `PixelStore` will
    // have in task 26 — mutate the raw grid in place, then bump.
    const frames: number[] = [];
    for (let i = 0; i < DRAG_LENGTH; i++) {
      const t0 = performance.now();
      const cell: PixelData = {
        color: { r: i, g: i, b: i, a: 255 },
        normal: 0,
        height: 0,
      };
      grid[i % HEIGHT][i % WIDTH] = cell;
      runInAction(() => domain.bumpPixelVersion());
      frames.push(performance.now() - t0);
    }

    const worst = Math.max(...frames);
    const total = frames.reduce((a, b) => a + b, 0);

    // Reported so the number lands in the wave's output, not just the assert.
    console.log(
      `[R2 GATE] ${WIDTH}x${HEIGHT}x${LAYERS} = ${(
        WIDTH *
        HEIGHT *
        LAYERS
      ).toLocaleString()} cells | adopt ${adoptMs.toFixed(3)} ms | ` +
        `${DRAG_LENGTH}-pixel drag: worst frame ${worst.toFixed(
          4,
        )} ms, total ${total.toFixed(3)} ms, mean ${(
          total / DRAG_LENGTH
        ).toFixed(4)} ms (budget ${BUDGET_MS} ms/frame)`,
    );

    expect(worst).toBeLessThan(BUDGET_MS);
    // The grids must STILL be raw after the drag.
    expect(() =>
      assertGridsAreRaw(domain.objects, domain.variants),
    ).not.toThrow();
  });

  it("pixelVersion is what observers track — never the grid", () => {
    const domain = makeDomain();
    runInAction(() => domain.adoptTree(projectWith(32, 32)));
    const before = domain.pixelVersion;
    runInAction(() => domain.bumpPixelVersion());
    expect(domain.pixelVersion).toBe(before + 1);
  });
});
