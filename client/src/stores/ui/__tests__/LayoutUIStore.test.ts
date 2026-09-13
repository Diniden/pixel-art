/**
 * LayoutUIStore — the per-device layout record and the project theme.
 *
 * The pure arrangement rules are pinned in `ui/layout/__tests__/railLayout`;
 * what is asserted HERE is everything the store adds on top: device keying,
 * the narrowing of untrusted persisted values, and the "absent until
 * changed" property the wire format depends on.
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { LayoutUIStore } from "@/stores/ui/LayoutUIStore";
import { DEFAULT_RAIL_LAYOUT } from "@/ui/layout/railLayout";

const tabletLayout = {
  left: { slot: "rightOuter", scale: "huge" },
  right: { slot: "leftOuter", scale: "compact" },
  bottom: { edge: "top", scale: "large" },
};

describe("LayoutUIStore — device keying", () => {
  it("starts empty, so nothing is persisted until the user acts", () => {
    const store = new LayoutUIStore("desktop");
    expect(store.hasStoredLayout).toBe(false);
    expect(store.toPersistedRailLayouts()).toBeUndefined();
    expect(store.theme).toBeNull();
    // With no entry, THIS device sees the historical arrangement.
    expect(store.layout).toEqual(DEFAULT_RAIL_LAYOUT);
  });

  it("reads the entry for ITS OWN device class and ignores the others", () => {
    const desktop = new LayoutUIStore("desktop");
    const tablet = new LayoutUIStore("tablet");

    runInAction(() => {
      desktop.hydrate({ railLayouts: { tablet: tabletLayout } });
      tablet.hydrate({ railLayouts: { tablet: tabletLayout } });
    });

    // The desktop has no entry of its own — it must NOT adopt the tablet's.
    expect(desktop.layout).toEqual(DEFAULT_RAIL_LAYOUT);
    expect(tablet.layout.left.slot).toBe("rightOuter");
    expect(tablet.layout.bottom.edge).toBe("top");
  });

  it("⭐ writing on one device leaves every other device's entry intact", () => {
    const store = new LayoutUIStore("desktop");
    runInAction(() => {
      store.hydrate({ railLayouts: { tablet: tabletLayout, phone: tabletLayout } });
      store.stepRail("left", 1);
    });

    const persisted = store.toPersistedRailLayouts()!;
    expect(Object.keys(persisted).sort()).toEqual([
      "desktop",
      "phone",
      "tablet",
    ]);
    expect(persisted.tablet).toEqual(tabletLayout);
    expect(persisted.desktop.left.slot).toBe("rightInner");
  });
});

describe("LayoutUIStore — narrowing untrusted persisted values", () => {
  it("falls back FIELD BY FIELD, keeping the valid parts of a bad record", () => {
    const store = new LayoutUIStore("desktop");
    runInAction(() =>
      store.hydrate({
        railLayouts: {
          desktop: {
            left: { slot: "rightInner", scale: "not-a-scale" },
            right: { slot: "somewhere-else", scale: "compact" },
            bottom: { edge: "sideways", scale: "huge" },
          },
        },
      }),
    );

    // The three valid values survive; the three invalid ones default.
    expect(store.layout.left.slot).toBe("rightInner");
    expect(store.layout.left.scale).toBe("regular");
    expect(store.layout.right.slot).toBe("rightOuter");
    expect(store.layout.right.scale).toBe("compact");
    expect(store.layout.bottom.edge).toBe("bottom");
    expect(store.layout.bottom.scale).toBe("huge");
  });

  it("⭐ repairs a record that puts BOTH rails in the same slot", () => {
    // Unreachable through `stepRail`, but a hand-edited or corrupt file can
    // express it — and it has no legal rendering.
    const store = new LayoutUIStore("desktop");
    runInAction(() =>
      store.hydrate({
        railLayouts: {
          desktop: {
            left: { slot: "leftOuter", scale: "regular" },
            right: { slot: "leftOuter", scale: "regular" },
          } as never,
        },
      }),
    );
    expect(store.layout.left.slot).not.toBe(store.layout.right.slot);
  });

  it("⭐ a layout saved BEFORE the toolbar existed still loads", () => {
    // Every `railLayouts` record written before 2026-08-28 has no `toolbar`
    // block at all. It must come back with the toolbar where it has always
    // been, not fail to narrow and lose the three panel rails with it.
    const store = new LayoutUIStore("desktop");
    runInAction(() =>
      store.hydrate({
        railLayouts: {
          desktop: {
            left: { slot: "rightInner", scale: "large" },
            right: { slot: "rightOuter", scale: "compact" },
            bottom: { edge: "top", scale: "huge" },
          },
        },
      }),
    );

    // The pre-existing arrangement survives untouched...
    expect(store.layout.left.slot).toBe("rightInner");
    expect(store.layout.bottom.edge).toBe("top");
    // ...and the new rail defaults rather than breaking.
    expect(store.layout.toolbar.edge).toBe("top");
    expect(store.layout.toolbar.scale).toBe("regular");
    // `spread` arrived later still, and defaults the same way.
    expect(store.layout.toolbar.spread).toBe(1);
  });

  it("⭐ falls back on a spread count this build does not support", () => {
    // A hand-edited or newer file could carry any number; 40 rows has no
    // sane rendering, so an unsupported value must return to one line.
    const store = new LayoutUIStore("desktop");
    runInAction(() =>
      store.hydrate({
        railLayouts: {
          desktop: {
            left: { slot: "leftOuter", scale: "regular" },
            right: { slot: "rightOuter", scale: "regular" },
            bottom: { edge: "bottom", scale: "regular" },
            toolbar: { edge: "top", scale: "regular", spread: 40 },
          },
        },
      }),
    );
    expect(store.layout.toolbar.spread).toBe(1);
  });

  it("round-trips a spread through persistence", () => {
    // ⚠️ Orientation pinned, and the key is composite (plan 09, task 10) —
    // a tablet stores under `tablet:<orientation>`. See
    // `orientationLayout.test.ts` for the keying itself.
    const store = new LayoutUIStore("tablet", "landscape");
    runInAction(() => store.stepToolbarSpread(1));

    const persisted = store.toPersistedRailLayouts()!;
    expect(persisted["tablet:landscape"].toolbar?.spread).toBe(2);

    const reloaded = new LayoutUIStore("tablet", "landscape");
    runInAction(() => reloaded.hydrate({ railLayouts: persisted }));
    expect(reloaded.layout.toolbar.spread).toBe(2);
  });

  it("round-trips a toolbar edge through persistence", () => {
    const store = new LayoutUIStore("tablet", "landscape");
    runInAction(() => store.setToolbarEdge("right"));

    const persisted = store.toPersistedRailLayouts()!;
    expect(persisted["tablet:landscape"].toolbar?.edge).toBe("right");

    const reloaded = new LayoutUIStore("tablet", "landscape");
    runInAction(() => reloaded.hydrate({ railLayouts: persisted }));
    expect(reloaded.layout.toolbar.edge).toBe("right");
  });

  it("falls back on an unknown toolbar edge", () => {
    const store = new LayoutUIStore("desktop");
    runInAction(() =>
      store.hydrate({
        railLayouts: {
          desktop: {
            left: { slot: "leftOuter", scale: "regular" },
            right: { slot: "rightOuter", scale: "regular" },
            bottom: { edge: "bottom", scale: "regular" },
            toolbar: { edge: "diagonal", scale: "regular" },
          },
        },
      }),
    );
    expect(store.layout.toolbar.edge).toBe("top");
  });

  it("survives a record missing whole rails", () => {
    const store = new LayoutUIStore("desktop");
    runInAction(() => store.hydrate({ railLayouts: { desktop: {} as never } }));
    expect(store.layout).toEqual(DEFAULT_RAIL_LAYOUT);
  });
});

describe("LayoutUIStore — theme", () => {
  it("accepts a known theme id and rejects an unknown one", () => {
    const store = new LayoutUIStore("desktop");
    runInAction(() => store.hydrate({ theme: "light-cozy" }));
    expect(store.theme).toBe("light-cozy");

    runInAction(() => store.hydrate({ theme: "chartreuse" }));
    expect(store.theme).toBeNull();
  });

  it("⭐ hydrating a project WITHOUT a theme clears the previous one", () => {
    // Otherwise switching projects would write project A's theme into
    // project B on its next autosave.
    const store = new LayoutUIStore("desktop");
    runInAction(() => store.setTheme("dark-cozy"));
    expect(store.theme).toBe("dark-cozy");

    runInAction(() => store.hydrate({}));
    expect(store.theme).toBeNull();
  });
});

describe("LayoutUIStore — layout mode is session-only", () => {
  it("toggles without ever touching the persisted record", () => {
    const store = new LayoutUIStore("desktop");
    expect(store.layoutMode).toBe(false);

    runInAction(() => store.toggleLayoutMode());
    expect(store.layoutMode).toBe(true);
    // Entering layout mode must not, by itself, dirty the project.
    expect(store.toPersistedRailLayouts()).toBeUndefined();

    runInAction(() => store.setLayoutMode(false));
    expect(store.layoutMode).toBe(false);
  });
});

/**
 * Layout presets (2026-08-30).
 *
 * The pure preset rules live in `ui/layout/__tests__/layoutPresets`; what is
 * asserted here is what the STORE adds: device keying, the round trip through
 * the persisted shape, and the narrowing of values a file may carry.
 */
describe("LayoutUIStore — layout presets", () => {
  it("offers this device's built-ins, and a tablet's differ from a desktop's", () => {
    const desktop = new LayoutUIStore("desktop").availablePresets;
    const tablet = new LayoutUIStore("tablet").availablePresets;

    expect(desktop.length).toBeGreaterThan(0);
    expect(desktop.map((p) => p.id)).not.toEqual(tablet.map((p) => p.id));
    // Nothing is saved yet, so nothing is deletable.
    expect(desktop.some((p) => p.custom)).toBe(false);
  });

  it("marks the matching preset as active, and only one of them", () => {
    const store = new LayoutUIStore("desktop");
    // A fresh store IS the historical arrangement, which is `classic`.
    expect(store.activePresetId).toBe("classic");

    const wide = store.availablePresets.find((p) => p.id === "wide-canvas")!;
    runInAction(() => store.applyLayoutPreset(wide));
    expect(store.activePresetId).toBe("wide-canvas");
    expect(store.layout).toEqual({ ...wide.layout, otherHand: {} });
  });

  it("goes inactive once the user nudges a rail by hand", () => {
    const store = new LayoutUIStore("desktop");
    runInAction(() => store.scaleRail("left", 1));
    expect(store.activePresetId).toBeNull();
  });

  it("saves the CURRENT arrangement, and the saved copy does not follow later edits", () => {
    // The snapshot property: a preset records how things were when saved.
    const store = new LayoutUIStore("desktop");
    runInAction(() => {
      store.flipBottomEdge();
      store.saveCurrentAsPreset("Top strip");
      // ...and now change the live layout out from under it.
      store.scaleRail("left", 1);
    });

    const saved = store.availablePresets.find((p) => p.custom)!;
    expect(saved.name).toBe("Top strip");
    expect(saved.layout.bottom.edge).toBe("top");
    expect(saved.layout.left.scale).toBe("regular");
    expect(store.layout.left.scale).toBe("large");
  });

  it("keeps a saved preset out of the OTHER device's list", () => {
    const store = new LayoutUIStore("tablet");
    runInAction(() => store.saveCurrentAsPreset("Thumb grip"));

    const persisted = store.toPersistedLayoutPresets()!;
    expect(Object.keys(persisted)).toEqual(["tablet"]);

    // A desktop store hydrated from the same project sees none of it.
    const desktop = new LayoutUIStore("desktop");
    runInAction(() => desktop.hydrate({ layoutPresets: persisted }));
    expect(desktop.availablePresets.some((p) => p.custom)).toBe(false);
  });

  it("refuses a blank name — an unnamed card is unidentifiable", () => {
    const store = new LayoutUIStore("desktop");
    runInAction(() => store.saveCurrentAsPreset("   "));
    expect(store.toPersistedLayoutPresets()).toBeUndefined();
  });

  it("deletes a saved preset and leaves the built-ins alone", () => {
    const store = new LayoutUIStore("desktop");
    runInAction(() => store.saveCurrentAsPreset("Mine"));
    const saved = store.availablePresets.find((p) => p.custom)!;

    runInAction(() => store.deleteLayoutPreset(saved.id));
    expect(store.availablePresets.some((p) => p.custom)).toBe(false);

    // A built-in id is not in the persisted list, so deleting one is a
    // harmless no-op rather than something that corrupts the shortlist.
    const before = store.availablePresets.length;
    runInAction(() => store.deleteLayoutPreset("classic"));
    expect(store.availablePresets).toHaveLength(before);
  });

  it("is ABSENT from the persisted record until something is saved", () => {
    // The corpus-protecting property, at the store level.
    const store = new LayoutUIStore("desktop");
    expect(store.toPersistedLayoutPresets()).toBeUndefined();
    runInAction(() => store.applyLayoutPreset(store.availablePresets[1]));
    // Applying is not saving — it moves rails, it does not add a card.
    expect(store.toPersistedLayoutPresets()).toBeUndefined();
  });

  it("narrows a hydrated preset, defaulting fields it does not recognise", () => {
    const store = new LayoutUIStore("desktop");
    runInAction(() =>
      store.hydrate({
        layoutPresets: {
          desktop: [
            {
              id: "custom-1",
              name: "From a newer build",
              layout: {
                left: { slot: "nonsense", scale: "gigantic" },
                right: { slot: "rightOuter", scale: "large" },
                bottom: { edge: "top", scale: "compact" },
              },
            },
            // Unusable in a keyed list — dropped rather than rendered.
            { name: "no id" },
          ] as never,
        },
      }),
    );

    const saved = store.availablePresets.filter((p) => p.custom);
    expect(saved).toHaveLength(1);
    // The bad fields fell back; the good ones survived.
    expect(saved[0].layout.left.slot).toBe(DEFAULT_RAIL_LAYOUT.left.slot);
    expect(saved[0].layout.left.scale).toBe(DEFAULT_RAIL_LAYOUT.left.scale);
    expect(saved[0].layout.right.scale).toBe("large");
    expect(saved[0].layout.bottom.edge).toBe("top");
  });

  it("applying a preset preserves the Other Hand positions", () => {
    const store = new LayoutUIStore("tablet");
    runInAction(() => {
      store.setOtherHandWidgetPosition("color", "hue", { x: 25, y: 60 });
      store.applyLayoutPreset(store.availablePresets[1]);
    });
    expect(store.layout.otherHand.color.positions.hue).toEqual({
      x: 25,
      y: 60,
    });
  });
});
