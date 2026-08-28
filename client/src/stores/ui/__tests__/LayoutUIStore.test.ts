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
    const store = new LayoutUIStore("tablet");
    runInAction(() => store.stepToolbarSpread(1));

    const persisted = store.toPersistedRailLayouts()!;
    expect(persisted.tablet.toolbar?.spread).toBe(2);

    const reloaded = new LayoutUIStore("tablet");
    runInAction(() => reloaded.hydrate({ railLayouts: persisted }));
    expect(reloaded.layout.toolbar.spread).toBe(2);
  });

  it("round-trips a toolbar edge through persistence", () => {
    const store = new LayoutUIStore("tablet");
    runInAction(() => store.setToolbarEdge("right"));

    const persisted = store.toPersistedRailLayouts()!;
    expect(persisted.tablet.toolbar?.edge).toBe("right");

    const reloaded = new LayoutUIStore("tablet");
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
