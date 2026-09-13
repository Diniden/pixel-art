/**
 * LayoutUIStore — Other Hand Mode (2026-08-28).
 *
 * Three things are pinned here:
 *
 *  1. ⭐ the wire format: `otherHand` is ABSENT from the persisted record
 *     until something is arranged, and a record without it round-trips
 *     byte-identically — a layout saved before the feature must not grow a
 *     key on its next save;
 *  2. the tablet gate: `enterOtherHand` is a no-op on any other device;
 *  3. narrowing: a malformed position is dropped without losing the rest.
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";
import { LayoutUIStore } from "../LayoutUIStore";
import type { PersistedRailLayout } from "../../../types";

const legacyLayout: PersistedRailLayout = {
  left: { slot: "leftOuter", scale: "regular" },
  right: { slot: "rightOuter", scale: "large" },
  bottom: { edge: "bottom", scale: "regular" },
  toolbar: { edge: "top", scale: "regular", spread: 1 },
};

describe("the tablet gate", () => {
  it("⭐ only a tablet may enter the mode", () => {
    for (const device of ["desktop", "phone"] as const) {
      const store = new LayoutUIStore(device);
      expect(store.otherHandAvailable).toBe(false);
      runInAction(() => store.enterOtherHand("tool"));
      expect(store.otherHandSection).toBeNull();
      expect(store.otherHandActive).toBe(false);
    }
    const tablet = new LayoutUIStore("tablet");
    expect(tablet.otherHandAvailable).toBe(true);
    runInAction(() => tablet.enterOtherHand("color"));
    expect(tablet.otherHandSection).toBe("color");
    expect(tablet.otherHandActive).toBe(true);
    runInAction(() => tablet.exitOtherHand());
    expect(tablet.otherHandActive).toBe(false);
  });

  it("the active section is session state — never in the persisted record", () => {
    const store = new LayoutUIStore("tablet");
    runInAction(() => store.enterOtherHand("color"));
    expect(store.toPersistedRailLayouts()).toBeUndefined();
  });
});

describe("⭐ the wire format", () => {
  it("a layout saved before the feature round-trips without gaining a key", () => {
    const store = new LayoutUIStore("tablet");
    runInAction(() => store.hydrate({ railLayouts: { tablet: legacyLayout } }));
    // Touch something unrelated so the record is re-written by the store.
    runInAction(() => store.scaleRail("left", 1));
    const persisted = store.toPersistedRailLayouts()!.tablet;
    expect("otherHand" in persisted).toBe(false);
    expect(Object.keys(persisted).sort()).toEqual(
      Object.keys(legacyLayout).sort(),
    );
  });

  it("emits `otherHand` once something is arranged, and reads it back", () => {
    // ⚠️ Orientation pinned, and the key is composite (plan 09, task 10): a
    // tablet stores under `tablet:<orientation>` so portrait and landscape
    // hold separate arrangements. See `orientationLayout.test.ts`.
    const store = new LayoutUIStore("tablet", "landscape");
    runInAction(() => {
      store.setOtherHandWidgetPosition("tool:pixel", "size", { x: 60, y: 10 });
      store.setOtherHandColorModel("color", "rgb");
      store.setOtherHandIncludeAlpha("color", true);
    });
    const persisted = store.toPersistedRailLayouts()!["tablet:landscape"];
    expect(persisted.otherHand).toEqual({
      "tool:pixel": { positions: { size: { x: 60, y: 10 } } },
      color: { positions: {}, colorModel: "rgb", includeAlpha: true },
    });

    const reloaded = new LayoutUIStore("tablet", "landscape");
    runInAction(() =>
      reloaded.hydrate({ railLayouts: { "tablet:landscape": persisted } }),
    );
    expect(reloaded.otherHandLayoutFor("tool:pixel").positions.size).toEqual({
      x: 60,
      y: 10,
    });
    expect(reloaded.otherHandLayoutFor("color").colorModel).toBe("rgb");
    expect(reloaded.otherHandLayoutFor("color").includeAlpha).toBe(true);
    // An unarranged section is defaulted, never `undefined`.
    expect(reloaded.otherHandLayoutFor("light")).toEqual({ positions: {} });
  });

  it("narrows field-by-field: a bad position or model is dropped, the rest kept", () => {
    const store = new LayoutUIStore("tablet");
    runInAction(() =>
      store.hydrate({
        railLayouts: {
          tablet: {
            ...legacyLayout,
            otherHand: {
              color: {
                positions: {
                  h: { x: 10, y: 20 },
                  // Written by a hand edit or a future build.
                  s: { x: "ten", y: 20 } as unknown as { x: number; y: number },
                },
                colorModel: "cmyk",
                includeAlpha: true,
              },
              broken: null as unknown as { positions: Record<string, never> },
            },
          },
        },
      }),
    );
    expect(store.layout.otherHand).toEqual({
      color: { positions: { h: { x: 10, y: 20 } }, includeAlpha: true },
    });
  });

  it("other devices' records are untouched by a tablet arranging its rail", () => {
    const store = new LayoutUIStore("tablet", "landscape");
    runInAction(() => {
      store.hydrate({ railLayouts: { desktop: legacyLayout } });
      store.setOtherHandWidgetPosition("color", "h", { x: 1, y: 1 });
    });
    const persisted = store.toPersistedRailLayouts()!;
    expect(persisted.desktop).toEqual(legacyLayout);
    expect(
      persisted["tablet:landscape"].otherHand?.color.positions.h,
    ).toEqual({
      x: 1,
      y: 1,
    });
  });
});
