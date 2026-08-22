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
import type {
  Color,
  Frame,
  Layer,
  Normal,
  Project,
  VariantFrame,
} from "@/types";

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

/* ══════════════════════════════════════════════════════════════════════════ */
/* The VARIANT path (wave W29g)                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ## Why this block exists
 *
 * W29b pinned `adjustColor`'s OBJECT path with 34 assertions and left the
 * VARIANT path with zero. `colorAdjustmentActions.ts:20` branches on
 * `layer.isVariant && getCurrentVariant() && getSelectedVariantLayer()` into a
 * completely separate implementation that shares no code with the object path,
 * and that half was the last unpinned pixel behaviour blocking the bridge
 * deletion. Everything below is OBSERVED behaviour (`MASTER.md` §10 rule 10),
 * captured against the CURRENT implementation before any migration.
 *
 * ## What the variant path ACTUALLY does — the headline
 *
 * The W29g brief warned that the variant all-frames path "replays one flat
 * `affectedPixels` list into every variant frame", which would write frame 1's
 * coordinates into frame 2 and silently destroy art. **That is not what it
 * does, and the tests below prove it.** The variant path builds a genuine
 * per-frame / per-layer `affectedPixelsByFrame` Map (`:27-67`) and consumes it
 * per-frame (`:241-244`), exactly like the object path. Disjoint coordinates
 * stay disjoint — see "no cross-frame coordinate bleed" below.
 *
 * ## The synthetic key is index addressing, and it is SOUND
 *
 * `:38` writes the key `` `variant-frame-${frameIdx}` `` and `:242` reads it
 * back with the same expression while mapping `v.frames.map((vf, frameIdx))`.
 * The key therefore matches no real `frame.id` — but no real id is ever
 * consulted on either side, so the two halves agree by construction. This is
 * positional addressing, not id addressing: `VariantFrame.id` exists but the
 * colour-adjustment path never reads it. Pinned below by giving the variant
 * frames ids that look nothing like the synthetic key and observing that the
 * recolour still lands.
 *
 * ## Two asymmetries with the object path, pinned as observed
 *
 * 1. **All-frames recolours EVERY layer of every variant frame**, whereas
 *    single-frame recolours ONLY `getSelectedVariantLayer()`. The object path's
 *    name-matching (`filter(l => l.name === layer.name)`) has no analogue here —
 *    the variant scan at `:40` iterates `variantFrame.layers` unconditionally.
 *    So the layer-name matching that governs the object path plays NO role on
 *    the variant path.
 * 2. **`getSelectedVariantLayer()` is hard-wired to `layers[0]`**
 *    (`helpers.ts:82-86`) — it ignores `selectedLayerId` entirely. Single-frame
 *    variant adjustment can therefore only ever edit the FIRST layer of the
 *    current variant frame.
 */

/** A distinctive normal vector, to prove normals survive a recolour. */
const NORMAL_5: Normal = { x: 5, y: 5, z: 250 };

/** A variant-editing project: host layer + a 3-frame variant, 2 layers each. */
function variantProject(
  frameIds: string[] = ["vframe-a", "vframe-b", "vframe-c"],
): Project {
  const base = tinyProject({
    layers: [
      mkLayer("host", 4, 4, {
        name: "Host",
        isVariant: true,
        variantGroupId: "vg-1",
        selectedVariantId: "v-1",
      }),
    ],
  });
  const vf = (id: string): VariantFrame => ({
    id,
    layers: [mkLayer(`${id}-l0`, 4, 4), mkLayer(`${id}-l1`, 4, 4)],
  });
  return {
    ...base,
    variants: [
      {
        id: "vg-1",
        name: "Group",
        variants: [
          {
            id: "v-1",
            name: "Variant 1",
            gridSize: { width: 4, height: 4 },
            frames: frameIds.map(vf),
            baseFrameOffsets: {},
          },
        ],
      },
    ],
  };
}

/** Paint one cell of a variant frame's layer directly in the FIXTURE. */
function paintVariant(
  project: Project,
  frameIdx: number,
  layerIdx: number,
  x: number,
  y: number,
  color: Color,
  normal: Normal | 0 = 0,
  height = 1,
): void {
  project.variants![0].variants[0].frames[frameIdx].layers[layerIdx].pixels[y][
    x
  ] = { color, normal, height };
}

/** Colour at (x,y) of variant frame `f`, variant layer `l`. */
const vAt = (
  project: Project | null,
  f: number,
  l: number,
  x: number,
  y: number,
): Color | 0 =>
  project!.variants![0].variants[0].frames[f].layers[l].pixels[y][x].color;

describe.each(HARNESSES)(
  "%s — colour adjustment (variant)",
  (_name, makeHarness) => {
    let harness: StoreHarness;

    beforeEach(() => {
      harness = makeHarness();
    });

    /** Load a variant project after applying `paint` to the fixture. */
    const loadPainted = (paint: (p: Project) => void, ids?: string[]): void => {
      const p = variantProject(ids);
      paint(p);
      harness.load(p);
    };

    /* ══ the branch actually engages ═════════════════════════════════════════ */

    it("resolves the variant context — the variant branch is reachable", () => {
      loadPainted(() => {});

      expect(harness.dispatch("getCurrentVariant")).not.toBeNull();
      // Hard-wired to layers[0]; `selectedLayerId` plays no part.
      expect(harness.dispatch("getSelectedVariantLayer")?.id).toBe(
        "vframe-a-l0",
      );
    });

    /* ══ allFrames: false ════════════════════════════════════════════════════ */

    describe("variant + allFrames: false", () => {
      it("recolours the CURRENT variant frame's first layer", () => {
        loadPainted((p) => paintVariant(p, 0, 0, 1, 1, RED));
        harness.dispatch("startColorAdjustment", RED, false);
        harness.dispatch("adjustColor", BLUE, false);

        expect(vAt(harness.getProject(), 0, 0, 1, 1)).toEqual(BLUE);
      });

      it("leaves OTHER variant frames untouched", () => {
        loadPainted((p) => {
          paintVariant(p, 0, 0, 1, 1, RED);
          paintVariant(p, 1, 0, 1, 1, RED);
        });
        harness.dispatch("startColorAdjustment", RED, false);
        harness.dispatch("adjustColor", BLUE, false);

        expect(vAt(harness.getProject(), 0, 0, 1, 1)).toEqual(BLUE);
        expect(vAt(harness.getProject(), 1, 0, 1, 1)).toEqual(RED);
      });

      it("SURPRISE: leaves the SECOND layer of the same frame untouched", () => {
        // `getSelectedVariantLayer()` is `layers[0]`, and the single-frame write
        // filters on `vl.id !== variantLayer.id` (`:304`). All-frames does NOT —
        // see the contrasting pin below.
        loadPainted((p) => {
          paintVariant(p, 0, 0, 1, 1, RED);
          paintVariant(p, 0, 1, 2, 2, RED);
        });
        harness.dispatch("startColorAdjustment", RED, false);
        harness.dispatch("adjustColor", GREEN, false);

        expect(vAt(harness.getProject(), 0, 0, 1, 1)).toEqual(GREEN);
        expect(vAt(harness.getProject(), 0, 1, 2, 2)).toEqual(RED);
      });

      it("only touches cells that MATCHED the original colour", () => {
        loadPainted((p) => {
          paintVariant(p, 0, 0, 1, 1, RED);
          paintVariant(p, 0, 0, 2, 2, GREEN);
        });
        harness.dispatch("startColorAdjustment", RED, false);
        harness.dispatch("adjustColor", BLUE, false);

        expect(vAt(harness.getProject(), 0, 0, 2, 2)).toEqual(GREEN);
      });

      it("preserves each cell's normal and height", () => {
        loadPainted((p) => paintVariant(p, 0, 0, 1, 1, RED, NORMAL_5, 9));
        harness.dispatch("startColorAdjustment", RED, false);
        harness.dispatch("adjustColor", BLUE, false);

        const px =
          harness.getProject()!.variants![0].variants[0].frames[0].layers[0]
            .pixels[1][1];
        expect(px.normal).toEqual(NORMAL_5);
        expect(px.height).toBe(9);
      });
    });

    /* ══ allFrames: true — the headline ══════════════════════════════════════ */

    describe("variant + allFrames: true", () => {
      it("recolours the matching pixel in EVERY variant frame", () => {
        loadPainted((p) => {
          paintVariant(p, 0, 0, 1, 1, RED);
          paintVariant(p, 1, 0, 1, 1, RED);
          paintVariant(p, 2, 0, 1, 1, RED);
        });
        harness.dispatch("startColorAdjustment", RED, true);
        harness.dispatch("adjustColor", BLUE, false);

        expect(vAt(harness.getProject(), 0, 0, 1, 1)).toEqual(BLUE);
        expect(vAt(harness.getProject(), 1, 0, 1, 1)).toEqual(BLUE);
        expect(vAt(harness.getProject(), 2, 0, 1, 1)).toEqual(BLUE);
      });

      it("writes each frame's OWN coordinates — NO cross-frame bleed", () => {
        // THE headline pin. RED lives at (1,1) in frame 0 and at (3,3) in frame 1
        // ONLY. A flat-list replay would write both coordinates into both frames.
        // It does not: the per-frame Map keeps them disjoint.
        loadPainted((p) => {
          paintVariant(p, 0, 0, 1, 1, RED);
          paintVariant(p, 1, 0, 3, 3, RED);
        });
        harness.dispatch("startColorAdjustment", RED, true);
        harness.dispatch("adjustColor", BLUE, false);
        const g = harness.getProject();

        expect(vAt(g, 0, 0, 1, 1)).toEqual(BLUE);
        expect(vAt(g, 1, 0, 3, 3)).toEqual(BLUE);
        // The cells that were EMPTY stay empty — no silent data loss.
        expect(vAt(g, 0, 0, 3, 3)).toBe(0);
        expect(vAt(g, 1, 0, 1, 1)).toBe(0);
      });

      it("SURPRISE: recolours EVERY layer of a variant frame, not just layers[0]", () => {
        // The contrast with the single-frame pin above: `:40` scans
        // `variantFrame.layers` unconditionally, with no name or id filter.
        loadPainted((p) => {
          paintVariant(p, 0, 0, 1, 1, RED);
          paintVariant(p, 0, 1, 2, 2, RED);
        });
        harness.dispatch("startColorAdjustment", RED, true);
        harness.dispatch("adjustColor", GREEN, false);

        expect(vAt(harness.getProject(), 0, 0, 1, 1)).toEqual(GREEN);
        expect(vAt(harness.getProject(), 0, 1, 2, 2)).toEqual(GREEN);
      });

      it("addresses variant frames BY INDEX — real frame ids are never read", () => {
        // The synthetic key `variant-frame-${i}` matches no real id, and that is
        // harmless because both the write (`:38`) and the read (`:242`) derive it
        // from the array index. Ids here are deliberately unrecognisable.
        loadPainted(
          (p) => paintVariant(p, 2, 0, 0, 0, RED),
          ["zzz", "yyy", "xxx"],
        );
        harness.dispatch("startColorAdjustment", RED, true);
        harness.dispatch("adjustColor", BLUE, false);

        expect(vAt(harness.getProject(), 2, 0, 0, 0)).toEqual(BLUE);
      });

      it("preserves normal and height across frames", () => {
        loadPainted((p) => paintVariant(p, 1, 0, 2, 2, RED, NORMAL_5, 9));
        harness.dispatch("startColorAdjustment", RED, true);
        harness.dispatch("adjustColor", BLUE, false);

        const px =
          harness.getProject()!.variants![0].variants[0].frames[1].layers[0]
            .pixels[2][2];
        expect(px.normal).toEqual(NORMAL_5);
        expect(px.height).toBe(9);
      });

      it("is a no-op when NO pixel matches the chosen colour", () => {
        loadPainted((p) => paintVariant(p, 0, 0, 1, 1, RED));
        harness.dispatch("startColorAdjustment", GREEN, true);
        harness.dispatch("adjustColor", BLUE, false);

        expect(vAt(harness.getProject(), 0, 0, 1, 1)).toEqual(RED);
      });
    });

    /* ══ snapshot-at-start, shared with the object path ══════════════════════ */

    describe("variant snapshot-at-start", () => {
      it("SURPRISE: pixels painted AFTER start are not picked up", () => {
        loadPainted((p) => paintVariant(p, 0, 0, 1, 1, RED));
        harness.dispatch("startColorAdjustment", RED, false);
        harness.dispatch("setPixel", 3, 0, RED);
        harness.dispatch("adjustColor", BLUE, false);
        const g = harness.getProject();

        expect(vAt(g, 0, 0, 1, 1)).toEqual(BLUE);
        expect(vAt(g, 0, 0, 3, 0)).toEqual(RED);
      });

      it("the affected set is replayed verbatim — a chained adjust still hits", () => {
        // This is what makes slider-dragging work: the second adjustColor does
        // NOT re-match the current colour, it replays the START snapshot.
        const teal: Color = { r: 1, g: 2, b: 3, a: 255 };
        loadPainted((p) => paintVariant(p, 0, 0, 1, 1, RED));
        harness.dispatch("startColorAdjustment", RED, true);
        harness.dispatch("adjustColor", BLUE, false);
        harness.dispatch("adjustColor", teal, false);

        expect(vAt(harness.getProject(), 0, 0, 1, 1)).toEqual(teal);
      });
    });

    /* ══ uiState.selectedColor — written on the variant path too ═════════════ */

    describe("variant uiState.selectedColor", () => {
      it("startColorAdjustment writes the ORIGINAL colour", () => {
        loadPainted((p) => paintVariant(p, 0, 0, 1, 1, RED));
        harness.dispatch("setColor", GREEN);
        harness.dispatch("startColorAdjustment", RED, true);

        expect(harness.getUiState().selectedColor).toEqual(RED);
      });

      it("adjustColor writes the NEW colour (single-frame)", () => {
        loadPainted((p) => paintVariant(p, 0, 0, 1, 1, RED));
        harness.dispatch("startColorAdjustment", RED, false);
        harness.dispatch("adjustColor", BLUE, false);

        expect(harness.getUiState().selectedColor).toEqual(BLUE);
      });

      it("adjustColor writes the NEW colour (all-frames)", () => {
        loadPainted((p) => paintVariant(p, 0, 0, 1, 1, RED));
        harness.dispatch("startColorAdjustment", RED, true);
        harness.dispatch("adjustColor", BLUE, false);

        expect(harness.getUiState().selectedColor).toEqual(BLUE);
      });
    });

    /* ══ history: ONE entry per adjustColor, both modes ══════════════════════ */

    describe("variant history", () => {
      it("records exactly ONE entry for an all-frames adjust", () => {
        loadPainted((p) => {
          paintVariant(p, 0, 0, 1, 1, RED);
          paintVariant(p, 1, 0, 3, 3, RED);
        });
        harness.dispatch("startColorAdjustment", RED, true);
        harness.dispatch("adjustColor", BLUE, true);

        expect(harness.getHistoryLength()).toBe(1);
      });

      it("records NOTHING when trackHistory is false", () => {
        loadPainted((p) => paintVariant(p, 0, 0, 1, 1, RED));
        harness.dispatch("startColorAdjustment", RED, true);
        harness.dispatch("adjustColor", BLUE, false);

        expect(harness.getHistoryLength()).toBe(0);
      });
    });
  },
);
