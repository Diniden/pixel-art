/**
 * Rail layouts saved PER ORIENTATION (plan 09, task 10).
 *
 * ## The defect this closes
 *
 * The user reported that "our ipad layouts needs to save the layout for
 * landscape and portrait." An iPad had exactly ONE saved arrangement shared
 * between the two, because `railLayouts` was keyed by device class alone —
 * so arranging the rails in landscape destroyed the portrait arrangement and
 * vice versa. The key is now `` `${deviceClass}:${orientation}` `` for
 * tablets and phones.
 *
 * ## ⚠️ THE INVARIANT THAT PROTECTS THE OWNER'S DATA
 *
 * `railLayouts` is one of the two owner-approved wire-format EXTENSIONS
 * documented at `UIStore.ts:539-547`, and it is safe for exactly one reason:
 *
 *   "neither key is emitted until the user changes something. `railLayouts`
 *   is `{}` … on an untouched project, so `toPersistedRailLayouts()` …
 *   yields `undefined` and `assign` writes nothing. The corpus digests are
 *   unchanged BECAUSE of that."
 *
 * This task adds NO new wire key — `railLayouts` has always been
 * `{ [key: string]: … }`, so only the map's keys get richer. But the
 * untouched-emits-nothing property is what stands between 151 of the owner's
 * real project snapshots and a silent rewrite on their next save, and it is
 * newly reachable: a key computed eagerly at construction, or a hydrate that
 * rewrote legacy keys into composite ones, would both break it. **The
 * emits-nothing case below is the single most important test in this file.**
 *
 * ⚠️ MEASURED, and it corrects a belief stated twice in `MASTER.md`: the
 * `corpus golden digests` suite does NOT catch an unconditional key here. It
 * hashes the snapshots as they sit on disk and never re-serializes them
 * through `toPersistedUIState()` with a mutated store. The two things that
 * DO catch it are this file's emits-nothing case and
 * `persistedUIState.test.ts`. A green corpus run is not evidence of wire
 * safety.
 *
 * ## And the getter fallback IS the migration
 *
 * There is no migration code and none is needed. A project saved before this
 * change carries a bare `"tablet"` key; `get layout()` falls back to it when
 * the composite key is absent, so the saved arrangement appears in BOTH
 * orientations until the user arranges one. Resolving it in the getter
 * rather than by rewriting the map on hydrate is deliberate (R11) — a
 * rewrite would change an untouched project's key set the moment it loaded,
 * and its next autosave would write a layout the owner never edited.
 *
 * ## Where the other half lives
 *
 * `detectOrientation`, `detectDeviceClass` and the orientation LISTENER are
 * pinned in `orientationLayout.dom.test.ts` — they need a `window`, and this
 * lane runs in node. The split follows `ReferenceUIStore.dom.test.ts`, which
 * is separated from its unit sibling for the same reason.
 *
 * Conventions follow the sibling suites `eraserBrush.test.ts` (the
 * emits-nothing shape) and `LayoutUIStore.test.ts` (device keying).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInAction } from "mobx";

import { LayoutUIStore } from "@/stores/ui/LayoutUIStore";
import { SelectionMirror } from "@/stores/SelectionMirror";
import { SessionStore } from "@/stores/session/SessionStore";
import { UIStore } from "@/stores/ui/UIStore";
import { layoutKey } from "@/ui/layout/deviceClass";
import { DEFAULT_RAIL_LAYOUT } from "@/ui/layout/railLayout";

/** A layout that is recognisably NOT the default, in every field. */
const legacyLayout = {
  left: { slot: "rightOuter", scale: "huge" },
  right: { slot: "leftOuter", scale: "compact" },
  bottom: { edge: "top", scale: "large" },
};

/**
 * A store pinned to one class and orientation. Both are passed explicitly
 * for the same reason `persistedUIState.test.ts` pins the device class: the
 * environment would otherwise answer, and these assertions are about the
 * KEYING, not about detection.
 */
function tablet(orientation: "portrait" | "landscape"): LayoutUIStore {
  return new LayoutUIStore("tablet", orientation);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("layoutKey — the second dimension, and the desktop exception", () => {
  it("⭐ composes class and orientation for a tablet", () => {
    expect(layoutKey("tablet", "portrait")).toBe("tablet:portrait");
    expect(layoutKey("tablet", "landscape")).toBe("tablet:landscape");
  });

  it("composes them for a phone too", () => {
    expect(layoutKey("phone", "portrait")).toBe("phone:portrait");
    expect(layoutKey("phone", "landscape")).toBe("phone:landscape");
  });

  it("⭐ leaves DESKTOP keyed by class alone, in BOTH orientations", () => {
    // The deliberate asymmetry. A desktop window is freely resizable and
    // "portrait" means nothing there — dragging a window taller than it is
    // wide must not swap the user's whole layout. It also means no desktop
    // user's already-saved layout moves to a new key.
    expect(layoutKey("desktop", "portrait")).toBe("desktop");
    expect(layoutKey("desktop", "landscape")).toBe("desktop");
  });
});

describe("⭐⭐ THE WIRE-FORMAT INVARIANT — an untouched store emits NOTHING", () => {
  it("⭐⭐ toPersistedRailLayouts() is undefined for an untouched tablet", () => {
    // THE test of this file. A key computed eagerly, or a hydrate that
    // rewrote legacy keys, would seed the map here and add `railLayouts` to
    // all 151 of the owner's real snapshots on their next save.
    const store = tablet("portrait");

    expect(store.railLayouts).toEqual({});
    expect(store.hasStoredLayout).toBe(false);
    expect(store.toPersistedRailLayouts()).toBeUndefined();
    // ...and it still reads as the historical arrangement.
    expect(store.layout).toEqual(DEFAULT_RAIL_LAYOUT);
  });

  it("⭐⭐ an untouched UIStore emits NO railLayouts key at all", () => {
    // The `in` form, not a truthiness or `undefined` check: "present but
    // undefined" still counts as a key to `Object.keys()` and therefore to
    // the corpus digest — measured while adding `fillColor`, where the plain
    // `: undefined` form changed all 11 digests.
    const ui = new UIStore({
      session: new SessionStore(),
      selection: new SelectionMirror(),
      layout: tablet("portrait"),
    });

    const persisted = ui.toPersistedUIState();
    expect("railLayouts" in persisted).toBe(false);
    expect(Object.keys(persisted)).not.toContain("railLayouts");
  });

  it("⭐⭐ merely ROTATING an untouched store still emits nothing", () => {
    // The subtle half, and the one this task newly makes reachable: it is
    // not enough that the map starts empty — rotation must not write to it
    // either. A user who picks up the iPad, rotates it, and saves must not
    // gain a key they never asked for.
    const ui = new UIStore({
      session: new SessionStore(),
      selection: new SelectionMirror(),
      layout: tablet("portrait"),
    });

    runInAction(() => ui.layout.setOrientation("landscape"));
    runInAction(() => ui.layout.setOrientation("portrait"));

    expect(ui.layout.railLayouts).toEqual({});
    expect("railLayouts" in ui.toPersistedUIState()).toBe(false);
  });

  it("⭐ reading `layout` in both orientations writes nothing", () => {
    // The getter is where the legacy fallback lives, so it is the place a
    // careless implementation would be tempted to memoise into the map.
    const store = tablet("portrait");
    void store.layout;
    runInAction(() => store.setOrientation("landscape"));
    void store.layout;

    expect(store.toPersistedRailLayouts()).toBeUndefined();
  });

  it("⭐ hydrating a LEGACY map does not rewrite it (R11)", () => {
    // Mutating on load is the tempting migration and the wrong one: an
    // untouched project's key set would change the moment it loaded, and its
    // next autosave would write a different set into a file whose layout the
    // owner never edited. The map must come back out exactly as it went in.
    const store = tablet("portrait");
    runInAction(() => store.hydrate({ railLayouts: { tablet: legacyLayout } }));

    // Read it in both orientations — still no rewrite.
    void store.layout;
    runInAction(() => store.setOrientation("landscape"));
    void store.layout;

    expect(Object.keys(store.toPersistedRailLayouts()!)).toEqual(["tablet"]);
    expect(store.toPersistedRailLayouts()!.tablet).toEqual(legacyLayout);
  });
});

describe("two orientations, two arrangements", () => {
  it("⭐ writing in portrait stores under the composite key", () => {
    const store = tablet("portrait");
    runInAction(() => store.stepRail("left", 1));

    const persisted = store.toPersistedRailLayouts()!;
    expect(Object.keys(persisted)).toEqual(["tablet:portrait"]);
  });

  it("⭐ arranging in portrait, then rotating, yields the LANDSCAPE layout", () => {
    // The user's actual complaint, as a test.
    const store = tablet("portrait");
    runInAction(() => store.stepRail("left", 1));
    const portrait = store.layout;
    expect(portrait.left.slot).toBe("rightInner");

    runInAction(() => store.setOrientation("landscape"));

    // Landscape has no arrangement of its own yet, so it reads as the
    // default — NOT as the portrait arrangement.
    expect(store.layout).toEqual(DEFAULT_RAIL_LAYOUT);
  });

  it("⭐ and rotating BACK returns the portrait one, unchanged", () => {
    const store = tablet("portrait");
    runInAction(() => store.stepRail("left", 1));
    const portrait = store.layout;

    runInAction(() => store.setOrientation("landscape"));
    runInAction(() => store.scaleRail("bottom", 1));
    runInAction(() => store.setOrientation("portrait"));

    expect(store.layout).toEqual(portrait);
  });

  it("⭐ each orientation keeps its own record — both survive together", () => {
    const store = tablet("portrait");
    runInAction(() => store.stepRail("left", 1));
    runInAction(() => store.setOrientation("landscape"));
    runInAction(() => store.flipBottomEdge());

    const persisted = store.toPersistedRailLayouts()!;
    expect(Object.keys(persisted).sort()).toEqual([
      "tablet:landscape",
      "tablet:portrait",
    ]);
    expect(persisted["tablet:portrait"].left.slot).toBe("rightInner");
    expect(persisted["tablet:landscape"].bottom.edge).toBe("top");
  });

  it("rotating back and forth repeatedly causes no drift", () => {
    const store = tablet("portrait");
    runInAction(() => store.stepRail("left", 1));
    const portrait = store.layout;
    runInAction(() => store.setOrientation("landscape"));
    runInAction(() => store.scaleRail("bottom", 1));
    const landscape = store.layout;

    for (let i = 0; i < 5; i++) {
      runInAction(() => store.setOrientation("portrait"));
      expect(store.layout).toEqual(portrait);
      runInAction(() => store.setOrientation("landscape"));
      expect(store.layout).toEqual(landscape);
    }
  });

  it("a tablet's records never touch a phone's, or a desktop's", () => {
    const store = tablet("portrait");
    runInAction(() =>
      store.hydrate({
        railLayouts: { desktop: legacyLayout, "phone:portrait": legacyLayout },
      }),
    );
    runInAction(() => store.stepRail("left", 1));

    const persisted = store.toPersistedRailLayouts()!;
    expect(Object.keys(persisted).sort()).toEqual([
      "desktop",
      "phone:portrait",
      "tablet:portrait",
    ]);
    expect(persisted.desktop).toEqual(legacyLayout);
    expect(persisted["phone:portrait"]).toEqual(legacyLayout);
  });
});

describe("the legacy fallback — the migration, resolved in the GETTER", () => {
  it("⭐ a legacy `{ tablet: … }` map resolves in BOTH orientations", () => {
    const store = tablet("portrait");
    runInAction(() => store.hydrate({ railLayouts: { tablet: legacyLayout } }));

    expect(store.layout.left.slot).toBe("rightOuter");
    expect(store.layout.bottom.edge).toBe("top");

    runInAction(() => store.setOrientation("landscape"));
    expect(store.layout.left.slot).toBe("rightOuter");
    expect(store.layout.bottom.edge).toBe("top");
  });

  it("⭐ once landscape is edited, PORTRAIT is still the legacy layout", () => {
    // The half that makes the migration lazy rather than destructive: the
    // legacy key stays in place as the other orientation's answer.
    const store = tablet("landscape");
    runInAction(() => store.hydrate({ railLayouts: { tablet: legacyLayout } }));
    runInAction(() => store.flipBottomEdge());

    // Landscape now has its own record.
    expect(store.layout.bottom.edge).toBe("bottom");

    runInAction(() => store.setOrientation("portrait"));
    expect(store.layout.left.slot).toBe("rightOuter");
    expect(store.layout.bottom.edge).toBe("top");

    // And the legacy key survives in the persisted map, beside the new one.
    expect(Object.keys(store.toPersistedRailLayouts()!).sort()).toEqual([
      "tablet",
      "tablet:landscape",
    ]);
  });

  it("⭐ the composite key WINS over the legacy one when both exist", () => {
    const store = tablet("portrait");
    runInAction(() =>
      store.hydrate({
        railLayouts: {
          tablet: legacyLayout,
          "tablet:portrait": {
            left: { slot: "leftOuter", scale: "compact" },
            right: { slot: "rightOuter", scale: "compact" },
            bottom: { edge: "bottom", scale: "compact" },
          },
        },
      }),
    );

    expect(store.layout.left.slot).toBe("leftOuter");
    expect(store.layout.left.scale).toBe("compact");
  });

  it("a phone's legacy layout migrates the same way", () => {
    const store = new LayoutUIStore("phone", "portrait");
    runInAction(() => store.hydrate({ railLayouts: { phone: legacyLayout } }));

    expect(store.layout.left.slot).toBe("rightOuter");
    runInAction(() => store.setOrientation("landscape"));
    expect(store.layout.left.slot).toBe("rightOuter");
  });
});

describe("desktop is not orientation-keyed", () => {
  it("⭐ resizing tall does NOT swap a desktop's layout", () => {
    // Manual check 6, as a test. `layoutKey` returns the bare class for
    // desktop, so the orientation field may track the window all it likes.
    const store = new LayoutUIStore("desktop", "landscape");
    runInAction(() => store.stepRail("left", 1));
    const before = store.layout;

    runInAction(() => store.setOrientation("portrait"));

    expect(store.layout).toEqual(before);
    expect(Object.keys(store.toPersistedRailLayouts()!)).toEqual(["desktop"]);
  });

  it("⭐ a desktop's existing saved layout keeps its exact key", () => {
    // No desktop user's saved layout moves — the whole reason for the
    // exception.
    const store = new LayoutUIStore("desktop", "portrait");
    runInAction(() =>
      store.hydrate({ railLayouts: { desktop: legacyLayout } }),
    );

    expect(store.layout.left.slot).toBe("rightOuter");
    runInAction(() => store.scaleRail("bottom", 1));
    expect(Object.keys(store.toPersistedRailLayouts()!)).toEqual(["desktop"]);
  });
});

describe("layoutPresets stay keyed by DEVICE CLASS alone (locked decision)", () => {
  it("⭐ a preset saved in portrait is offered in landscape too", () => {
    // Deliberate, and recorded: a preset is a user-NAMED arrangement they
    // may want in either orientation, unlike the live layout which is a
    // record of how they last had this particular screen shape arranged.
    const store = tablet("portrait");
    runInAction(() => store.saveCurrentAsPreset("Thumb grip"));

    expect(Object.keys(store.toPersistedLayoutPresets()!)).toEqual(["tablet"]);

    runInAction(() => store.setOrientation("landscape"));
    expect(
      store.availablePresets.some((preset) => preset.name === "Thumb grip"),
    ).toBe(true);
  });

  it("and an untouched store still emits no presets key", () => {
    expect(tablet("portrait").toPersistedLayoutPresets()).toBeUndefined();
  });
});

describe("MobX reactivity — the layout recomputes on rotation", () => {
  it("⭐ `layout` is a live computed off `orientation`", () => {
    // Without this, a rotation would update the field and leave the rails
    // rendering the other orientation's arrangement until something else
    // happened to invalidate the view.
    const store = tablet("portrait");
    runInAction(() => store.stepRail("left", 1));
    runInAction(() => store.setOrientation("landscape"));
    runInAction(() => store.flipBottomEdge());

    runInAction(() => store.setOrientation("portrait"));
    expect(store.layout.left.slot).toBe("rightInner");
    expect(store.layout.bottom.edge).toBe("bottom");

    runInAction(() => store.setOrientation("landscape"));
    expect(store.layout.left.slot).toBe(DEFAULT_RAIL_LAYOUT.left.slot);
    expect(store.layout.bottom.edge).toBe("top");
  });

  it("an idempotent setOrientation is a no-op", () => {
    const store = tablet("portrait");
    runInAction(() => store.setOrientation("portrait"));
    expect(store.orientation).toBe("portrait");
  });
});
