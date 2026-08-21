/**
 * Behaviour contract — `store/colorAdjustmentActions.ts` (wave W29b).
 *
 * ## Why this file exists
 *
 * `adjustColor` is the last genuinely two-implementation pixel action, and
 * until this file it had **zero coverage of its all-frames mode** in either
 * implementation. `history.test.ts:439` pins only WHEN it records history (the
 * "5th trackHistory semantic"); `drawing.test.ts:526` uses it only to observe
 * that a cleared layer leaves it nothing to do. Nothing anywhere passed
 * `allFrames: true`.
 *
 * That made the mode unmigratable: the REFRESH ledger's task-38 investigation
 * recorded it as "a NO-OP" on the MobX side and warned that wiring it would
 * move unpinned behaviour on the owner's real artwork. Per `MASTER.md` §10
 * rule 10, this file pins **OBSERVED** behaviour first, so the migration has
 * something to be checked against. Several of the observations below are
 * surprising, and two are arguably defects — they are pinned AS THEY ARE, with
 * the surprise documented, never as the behaviour someone would prefer.
 *
 * ## The four semantics pinned here
 *
 * 1. **Two disjoint payloads.** `startColorAdjustment` writes `affectedPixels`
 *    (a flat `{x,y}[]`) in single-frame mode and `affectedPixelsByFrame` (a
 *    `Map<frameId, Map<layerId, {x,y}[]>>`) in all-frames mode — and in
 *    all-frames mode `affectedPixels` is deliberately left `[]`
 *    (`colorAdjustmentActions.ts:158`, commented "Not used in all-frames
 *    mode"). The all-frames WRITE path reads only the Map
 *    (`:340-341`), so the empty flat list is not a no-op — it is simply the
 *    unused half of a tagged union. A migration that flattens the Map into
 *    the flat list would write frame 2..N's COORDINATES onto frame 1.
 *
 * 2. **Layer matching is BY NAME, not by id.** `:119-121` selects
 *    `frame.layers.filter(l => l.name === layer.name)`. Ids are per-frame and
 *    do not correspond across frames, so name is the only cross-frame identity
 *    the model has. Consequences pinned below: SEVERAL same-named layers in one
 *    frame are all recoloured, and a RENAMED layer is skipped entirely.
 *
 * 3. **The selection snapshot is taken at START, not at APPLY.** The Map is
 *    computed once by `startColorAdjustment` and replayed verbatim by every
 *    later `adjustColor`. So `adjustColor` does NOT re-match the current
 *    colour — it recolours whatever was found when the mode opened. That is
 *    what makes slider-dragging work (each frame recolours the SAME cells),
 *    and it is why the second of two chained adjustments still hits.
 *
 * 4. **Both modes write `uiState.selectedColor`** — `:197` on start and
 *    `:278/332/386/434` on apply. This is the UI field `PixelStore` must not
 *    touch, and it is half of why `PixelStore.adjustColor` was left unwired.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  BLUE,
  GREEN,
  HARNESSES,
  RED,
  colorAt,
  mkLayer,
  tinyProject,
  type StoreHarness,
} from "./storeContract";
import type { Frame, Layer, Normal, Project } from "@/types";

/**
 * 3 frames, each with a layer named `"Body"` plus a differently-named
 * companion. Ids are deliberately DISTINCT per frame (`body-f1`, `body-f2`, …)
 * so that any implementation matching on id instead of name fails loudly.
 */
function multiFrameProject(): Project {
  const mk = (id: string, name: string): Layer => ({
    ...mkLayer(id),
    name,
  });
  const frames: Frame[] = [
    {
      id: "frame-1",
      name: "Frame 1",
      layers: [mk("body-f1", "Body"), mk("hair-f1", "Hair")],
    },
    {
      id: "frame-2",
      name: "Frame 2",
      layers: [mk("body-f2", "Body"), mk("hair-f2", "Hair")],
    },
    {
      id: "frame-3",
      name: "Frame 3",
      layers: [mk("body-f3", "Body"), mk("hair-f3", "Hair")],
    },
  ];
  return tinyProject({ frames });
}

/** Colour at (x,y) of layer `layerIndex` in frame `frameIndex`. */
const at = (
  project: Project | null,
  frameIndex: number,
  layerIndex: number,
  x: number,
  y: number,
) => colorAt(project, x, y, layerIndex, frameIndex);

/**
 * Paint one cell of every "Body" layer across all three frames RED, without
 * going through the colour-adjustment path. `setPixel` only ever writes the
 * CURRENT layer of the CURRENT frame, so this walks the selection.
 */
function paintBodyRedEverywhere(harness: StoreHarness): void {
  for (const frameId of ["frame-1", "frame-2", "frame-3"]) {
    harness.dispatch("selectFrame", frameId);
    const layerId = `body-${frameId.replace("frame-", "f")}`;
    harness.dispatch("selectLayer", layerId);
    harness.dispatch("setPixel", 1, 1, RED);
  }
  harness.dispatch("selectFrame", "frame-1");
  harness.dispatch("selectLayer", "body-f1");
}

describe.each(HARNESSES)("%s — colour adjustment", (_name, makeHarness) => {
  let harness: StoreHarness;

  beforeEach(() => {
    harness = makeHarness();
    harness.reset();
    harness.load(multiFrameProject());
  });

  /* ══ single-frame mode — the WORKING path the migration must not regress ══ */

  describe("allFrames: false", () => {
    beforeEach(() => {
      paintBodyRedEverywhere(harness);
    });

    it("recolours matching pixels in the CURRENT layer only", () => {
      harness.dispatch("startColorAdjustment", RED, false);
      harness.dispatch("adjustColor", BLUE, false);

      expect(at(harness.getProject(), 0, 0, 1, 1)).toEqual(BLUE);
    });

    it("leaves the SAME-NAMED layer in other frames untouched", () => {
      harness.dispatch("startColorAdjustment", RED, false);
      harness.dispatch("adjustColor", BLUE, false);

      // This is the whole difference between the two modes.
      expect(at(harness.getProject(), 1, 0, 1, 1)).toEqual(RED);
      expect(at(harness.getProject(), 2, 0, 1, 1)).toEqual(RED);
    });

    it("only touches cells that MATCHED the original colour", () => {
      harness.dispatch("setPixel", 2, 2, GREEN);
      harness.dispatch("startColorAdjustment", RED, false);
      harness.dispatch("adjustColor", BLUE, false);

      expect(at(harness.getProject(), 0, 0, 1, 1)).toEqual(BLUE);
      expect(at(harness.getProject(), 0, 0, 2, 2)).toEqual(GREEN);
    });

    it("preserves each cell's normal and height", () => {
      // `:264-268` re-reads the existing cell and carries `normal`/`height`
      // over, so a colour adjustment never destroys lighting data.
      const NORMAL: Normal = { x: 32, y: -32, z: 200 };
      harness.dispatch("setNormalPixel", 1, 1, NORMAL);
      harness.dispatch("startColorAdjustment", RED, false);
      harness.dispatch("adjustColor", BLUE, false);

      const project = harness.getProject();
      const cell = project?.objects[0].frames[0].layers[0].pixels[1][1];
      expect(cell?.color).toEqual(BLUE);
      expect(cell?.normal).toEqual(NORMAL);
    });
  });

  /* ══ all-frames mode — THE UNPINNED BEHAVIOUR ════════════════════════════ */

  describe("allFrames: true", () => {
    beforeEach(() => {
      paintBodyRedEverywhere(harness);
    });

    it("recolours the matching pixel in EVERY frame's same-named layer", () => {
      harness.dispatch("startColorAdjustment", RED, true);
      harness.dispatch("adjustColor", BLUE, false);

      expect(at(harness.getProject(), 0, 0, 1, 1)).toEqual(BLUE);
      expect(at(harness.getProject(), 1, 0, 1, 1)).toEqual(BLUE);
      expect(at(harness.getProject(), 2, 0, 1, 1)).toEqual(BLUE);
    });

    it("writes each frame's OWN coordinates — no cross-frame coordinate bleed", () => {
      // THE defect a naive flatten would introduce. Each frame's Body layer
      // gets RED at a DIFFERENT coordinate; all-frames must recolour (0,0) in
      // frame 1, (2,2) in frame 2 and (3,3) in frame 3 — never the union.
      harness.dispatch("selectFrame", "frame-1");
      harness.dispatch("selectLayer", "body-f1");
      harness.dispatch("setPixel", 0, 0, RED);
      harness.dispatch("selectFrame", "frame-2");
      harness.dispatch("selectLayer", "body-f2");
      harness.dispatch("setPixel", 2, 2, RED);
      harness.dispatch("selectFrame", "frame-3");
      harness.dispatch("selectLayer", "body-f3");
      harness.dispatch("setPixel", 3, 3, RED);
      harness.dispatch("selectFrame", "frame-1");
      harness.dispatch("selectLayer", "body-f1");

      harness.dispatch("startColorAdjustment", RED, true);
      harness.dispatch("adjustColor", BLUE, false);

      const project = harness.getProject();
      // Every RED cell became BLUE, in its own frame.
      expect(at(project, 0, 0, 0, 0)).toEqual(BLUE);
      expect(at(project, 1, 0, 2, 2)).toEqual(BLUE);
      expect(at(project, 2, 0, 3, 3)).toEqual(BLUE);
      // ...and the coordinates belonging to OTHER frames stayed empty here.
      expect(at(project, 0, 0, 3, 3)).toBe(0);
      expect(at(project, 1, 0, 0, 0)).toBe(0);
      expect(at(project, 2, 0, 2, 2)).toBe(0);
    });

    it("does NOT touch a differently-named layer, even in the current frame", () => {
      harness.dispatch("selectLayer", "hair-f1");
      harness.dispatch("setPixel", 1, 1, RED);
      harness.dispatch("selectLayer", "body-f1");

      harness.dispatch("startColorAdjustment", RED, true);
      harness.dispatch("adjustColor", BLUE, false);

      expect(at(harness.getProject(), 0, 0, 1, 1)).toEqual(BLUE);
      // "Hair" never matches the current layer's name "Body".
      expect(at(harness.getProject(), 0, 1, 1, 1)).toEqual(RED);
    });

    /* ── the two surprising consequences of NAME matching ────────────────── */

    it("SURPRISE: recolours EVERY same-named layer in a frame, not just one", () => {
      // Layer names are not unique. A frame carrying two layers both called
      // "Body" has BOTH recoloured, because `:119` is a `filter`, not a `find`.
      const project = multiFrameProject();
      project.objects[0].frames[0].layers.push({
        ...mkLayer("body-f1-dup"),
        name: "Body",
      });
      harness.reset();
      harness.load(project);
      paintBodyRedEverywhere(harness);
      harness.dispatch("selectLayer", "body-f1-dup");
      harness.dispatch("setPixel", 1, 1, RED);
      harness.dispatch("selectLayer", "body-f1");

      harness.dispatch("startColorAdjustment", RED, true);
      harness.dispatch("adjustColor", BLUE, false);

      expect(at(harness.getProject(), 0, 0, 1, 1)).toEqual(BLUE);
      // The duplicate — index 2, after body-f1 and hair-f1 — is hit too.
      expect(at(harness.getProject(), 0, 2, 1, 1)).toEqual(BLUE);
    });

    it("SURPRISE: a RENAMED layer is silently skipped by all-frames", () => {
      // Renaming frame 2's "Body" breaks the only cross-frame identity the
      // model has, so its pixels are left behind with no warning.
      paintBodyRedEverywhere(harness);
      harness.dispatch("selectFrame", "frame-2");
      harness.dispatch("renameLayer", "body-f2", "Torso");
      harness.dispatch("selectFrame", "frame-1");
      harness.dispatch("selectLayer", "body-f1");

      harness.dispatch("startColorAdjustment", RED, true);
      harness.dispatch("adjustColor", BLUE, false);

      expect(at(harness.getProject(), 0, 0, 1, 1)).toEqual(BLUE);
      expect(at(harness.getProject(), 2, 0, 1, 1)).toEqual(BLUE);
      // Frame 2 is stranded on the old colour.
      expect(at(harness.getProject(), 1, 0, 1, 1)).toEqual(RED);
    });

    it("SURPRISE: the affected set is snapshotted at START and replayed verbatim", () => {
      // `adjustColor` never re-matches the CURRENT colour, so a second call
      // recolours the same cells again rather than finding nothing to do.
      harness.dispatch("startColorAdjustment", RED, true);
      harness.dispatch("adjustColor", BLUE, false);
      harness.dispatch("adjustColor", GREEN, false);

      expect(at(harness.getProject(), 0, 0, 1, 1)).toEqual(GREEN);
      expect(at(harness.getProject(), 1, 0, 1, 1)).toEqual(GREEN);
      expect(at(harness.getProject(), 2, 0, 1, 1)).toEqual(GREEN);
    });

    it("SURPRISE: pixels painted AFTER start are not picked up", () => {
      harness.dispatch("startColorAdjustment", RED, true);
      harness.dispatch("setPixel", 3, 0, RED);
      harness.dispatch("adjustColor", BLUE, false);

      expect(at(harness.getProject(), 0, 0, 1, 1)).toEqual(BLUE);
      // Painted after the snapshot — the Map does not know about it.
      expect(at(harness.getProject(), 0, 0, 3, 0)).toEqual(RED);
    });

    it("is a no-op when NO pixel matches the chosen colour", () => {
      harness.dispatch("startColorAdjustment", GREEN, true);
      harness.dispatch("adjustColor", BLUE, false);

      expect(at(harness.getProject(), 0, 0, 1, 1)).toEqual(RED);
      expect(at(harness.getProject(), 1, 0, 1, 1)).toEqual(RED);
    });
  });

  /* ══ the uiState.selectedColor write — both modes ════════════════════════ */

  describe("uiState.selectedColor", () => {
    beforeEach(() => {
      paintBodyRedEverywhere(harness);
    });

    it("startColorAdjustment writes the ORIGINAL colour to selectedColor", () => {
      harness.dispatch("setColor", GREEN);
      harness.dispatch("startColorAdjustment", RED, false);

      expect(harness.getUiState().selectedColor).toEqual(RED);
    });

    it("adjustColor writes the NEW colour to selectedColor (single-frame)", () => {
      harness.dispatch("startColorAdjustment", RED, false);
      harness.dispatch("adjustColor", BLUE, false);

      expect(harness.getUiState().selectedColor).toEqual(BLUE);
    });

    it("adjustColor writes the NEW colour to selectedColor (all-frames)", () => {
      harness.dispatch("startColorAdjustment", RED, true);
      harness.dispatch("adjustColor", BLUE, false);

      expect(harness.getUiState().selectedColor).toEqual(BLUE);
    });
  });

  /* ══ the lifecycle guard ═════════════════════════════════════════════════ */

  describe("lifecycle", () => {
    it("adjustColor without a prior startColorAdjustment is a no-op", () => {
      paintBodyRedEverywhere(harness);
      harness.dispatch("clearColorAdjustment");
      harness.dispatch("adjustColor", BLUE, false);

      expect(at(harness.getProject(), 0, 0, 1, 1)).toEqual(RED);
    });

    it("clearColorAdjustment ends the session — later adjustColor does nothing", () => {
      paintBodyRedEverywhere(harness);
      harness.dispatch("startColorAdjustment", RED, true);
      harness.dispatch("clearColorAdjustment");
      harness.dispatch("adjustColor", BLUE, false);

      expect(at(harness.getProject(), 0, 0, 1, 1)).toEqual(RED);
      expect(at(harness.getProject(), 1, 0, 1, 1)).toEqual(RED);
    });
  });
});
