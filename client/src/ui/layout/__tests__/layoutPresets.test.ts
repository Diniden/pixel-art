/**
 * layoutPresets — the ready-made arrangements offered in layout mode.
 *
 * The properties worth pinning are the ones a careless edit to the preset
 * tables would silently break: that every preset is a LEGAL layout (the
 * thumbnail and `AppShell` both assume it), that the two device classes get
 * genuinely different shortlists, and that applying one is wholesale except
 * for the Other Hand positions it must never touch.
 */
import { describe, it, expect } from "vitest";
import {
  PRESETS_BY_DEVICE,
  applyPreset,
  customPresetId,
  isPresetActive,
  presetsForDevice,
  type LayoutPreset,
} from "../layoutPresets";
import {
  DEFAULT_RAIL_LAYOUT,
  RAIL_SCALES,
  SIDE_SLOTS,
  TOOLBAR_EDGES,
  TOOLBAR_SPREADS,
  railsOnSide,
  type RailLayout,
} from "../railLayout";
import { DEVICE_CLASSES } from "../deviceClass";

const everyPreset = (): LayoutPreset[] =>
  DEVICE_CLASSES.flatMap((device) => PRESETS_BY_DEVICE[device]);

describe("layoutPresets — every built-in is a LEGAL arrangement", () => {
  it("never puts both rails in the same slot", () => {
    // The one arrangement with no on-screen representation: one rail would be
    // drawn twice or not at all. `stepRail` cannot produce it; a hand-written
    // preset table can, which is why this is checked here.
    for (const preset of everyPreset()) {
      expect(preset.layout.left.slot).not.toBe(preset.layout.right.slot);
    }
  });

  it("uses only values the model and the CSS actually know", () => {
    // A scale or edge outside these sets produces a modifier class with no
    // rule behind it — an arrangement that silently renders as the default.
    for (const preset of everyPreset()) {
      const l = preset.layout;
      expect(SIDE_SLOTS).toContain(l.left.slot);
      expect(SIDE_SLOTS).toContain(l.right.slot);
      expect(RAIL_SCALES).toContain(l.left.scale);
      expect(RAIL_SCALES).toContain(l.right.scale);
      expect(RAIL_SCALES).toContain(l.bottom.scale);
      expect(["top", "bottom"]).toContain(l.bottom.edge);
      expect(TOOLBAR_EDGES).toContain(l.toolbar.edge);
      expect(TOOLBAR_SPREADS).toContain(l.toolbar.spread);
    }
  });

  it("always renders both rails — `railsOnSide` accounts for exactly two", () => {
    // What `AppShell` and the thumbnail both consume. A preset whose rails
    // both vanished from the two sides would render an empty shell.
    for (const preset of everyPreset()) {
      const placed = [
        ...railsOnSide(preset.layout, "left"),
        ...railsOnSide(preset.layout, "right"),
      ];
      expect(placed.sort()).toEqual(["left", "right"]);
    }
  });

  it("carries no Other Hand positions — a preset has no opinion on them", () => {
    for (const preset of everyPreset()) {
      expect(preset.layout.otherHand).toEqual({});
    }
  });

  it("gives each device class unique preset ids", () => {
    // The picker keys its cards by id; a duplicate would drop a card.
    for (const device of DEVICE_CLASSES) {
      const ids = PRESETS_BY_DEVICE[device].map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("layoutPresets — the shortlists differ by device", () => {
  it("offers a DIFFERENT set to a tablet than to a desktop", () => {
    // The owner's requirement in one assertion: the two devices do not want
    // the same arrangements. If this ever passes trivially, the split has
    // been collapsed and the feature has quietly regressed.
    const desktop = presetsForDevice("desktop").map((p) => p.id);
    const tablet = presetsForDevice("tablet").map((p) => p.id);
    expect(desktop).not.toEqual(tablet);
  });

  it("gives a phone the tablet's grips, not the desktop's", () => {
    expect(presetsForDevice("phone")).toBe(presetsForDevice("tablet"));
  });

  it("⭐ stacks the TOOLBAR on the same side as the rails, for both stacks", () => {
    // The owner's rule for the two stack presets (2026-08-30): "Left Stack"
    // and "Right Stack" mean EVERYTHING on that side, toolbar included. A
    // preset that moved the rails but left the toolbar on top would put the
    // one control the user is trying to clear right back over the canvas.
    const desktop = presetsForDevice("desktop");
    const stacks: [string, "left" | "right"][] = [
      ["left-stack", "left"],
      // ⚠️ The id is still `wide-canvas`; only its NAME became "Right Stack",
      // because ids are what a tick and a card key are matched on.
      ["wide-canvas", "right"],
    ];

    for (const [id, side] of stacks) {
      const preset = desktop.find((p) => p.id === id)!;
      expect(preset.layout.toolbar.edge).toBe(side);
      // Both rails on that side too — otherwise it is not a stack.
      expect(railsOnSide(preset.layout, side)).toHaveLength(2);
      expect(
        railsOnSide(preset.layout, side === "left" ? "right" : "left"),
      ).toHaveLength(0);
    }
  });

  it("names the right-hand stack 'Right Stack' while keeping its id stable", () => {
    // Renaming the id would silently un-tick the card for anyone already
    // sitting on that arrangement — the name is the only half users see.
    const preset = presetsForDevice("desktop").find(
      (p) => p.id === "wide-canvas",
    )!;
    expect(preset.name).toBe("Right Stack");
  });

  it("offers `Classic` on every device — untouched on a desktop", () => {
    // ⚠️ THIS TEST HAS NARROWED TWICE, and the reason is worth stating: the
    // tablet rules (compact rails, then Tools left-most) are deliberate
    // departures from the historical arrangement, so `Classic` on a tablet is
    // NOT the desktop's `Classic` and asserting otherwise would be asserting
    // the rules do not work.
    //
    // What survives on every device is the SHAPE of the arrangement — one
    // rail on each side of the canvas, timeline below, toolbar on top — which
    // is what the name promises. Which rail lands on which side is the
    // Tools-left rule's business and is pinned by its own test below.
    const d = DEFAULT_RAIL_LAYOUT;
    for (const device of DEVICE_CLASSES) {
      const classic = presetsForDevice(device).find((p) => p.id === "classic")!;
      expect(railsOnSide(classic.layout, "left")).toHaveLength(1);
      expect(railsOnSide(classic.layout, "right")).toHaveLength(1);
      expect(classic.layout.bottom.edge).toBe(d.bottom.edge);
      expect(classic.layout.toolbar).toEqual(d.toolbar);
    }
    // On a DESKTOP it is still byte-identical — no tablet rule may leak into
    // the arrangement a laptop has always rendered.
    expect(
      presetsForDevice("desktop").find((p) => p.id === "classic")!.layout,
    ).toEqual(d);
  });

  it("⭐ sizes EVERY tablet preset's THREE panel rails at scale step 1 of 4", () => {
    // The owner's rule (2026-08-30). On an iPad every rail is charged against
    // the canvas — the side rails take width, the timeline takes height — and
    // the screen has far less of both than a laptop, so the smallest of the
    // four steps is the tablet DEFAULT whatever else a preset does.
    //
    // Asserted over the WHOLE list rather than preset by preset: that is what
    // makes it a rule a newly-added preset cannot forget.
    expect(RAIL_SCALES[0]).toBe("compact"); // step 1 of 4, per the overlay
    for (const device of ["tablet", "phone"] as const) {
      const presets = presetsForDevice(device);
      expect(presets.length).toBeGreaterThan(0);
      for (const preset of presets) {
        expect(preset.layout.left.scale).toBe("compact");
        expect(preset.layout.right.scale).toBe("compact");
        expect(preset.layout.bottom.scale).toBe("compact");
      }
    }
  });

  it("⭐ puts the TOOLS rail left-most on every tablet preset but Right Hand", () => {
    // The owner's rule (2026-08-30).
    //
    // ⚠️ The rail named `right` CARRIES the Tools; `left` carries Objects &
    // Layers. The names are identities, not positions — so "Tools left-most"
    // is `right.slot` coming BEFORE `left.slot` in screen order, which reads
    // backwards and is exactly why the rule is a named function.
    for (const device of ["tablet", "phone"] as const) {
      for (const preset of presetsForDevice(device)) {
        if (preset.id === "right-hand") continue;
        const tools = SIDE_SLOTS.indexOf(preset.layout.right.slot);
        const layers = SIDE_SLOTS.indexOf(preset.layout.left.slot);
        expect(tools, `${preset.name}: tools should precede layers`).toBeLessThan(
          layers,
        );
      }
    }
  });

  it("⭐ exempts Right Hand — it exists to put everything under that thumb", () => {
    // Forcing its Tools rail left would defeat the one thing it is for.
    const rightHand = presetsForDevice("tablet").find(
      (p) => p.id === "right-hand",
    )!;
    expect(railsOnSide(rightHand.layout, "right")).toHaveLength(2);
    // Tools is the OUTER of the two — furthest right, nearest the thumb.
    expect(SIDE_SLOTS.indexOf(rightHand.layout.right.slot)).toBeGreaterThan(
      SIDE_SLOTS.indexOf(rightHand.layout.left.slot),
    );
  });

  it("SWAPS the two rails rather than assigning slots outright", () => {
    // The swap is what keeps every preset legal: the pair of slots a preset
    // described is preserved exactly, with only the occupants traded. An
    // outright assignment could land both rails in one slot, which has no
    // on-screen representation at all.
    for (const preset of presetsForDevice("tablet")) {
      expect(preset.layout.left.slot).not.toBe(preset.layout.right.slot);
    }
    // `Max Canvas` keeps BOTH rails on the right — the rule reordered them
    // there rather than dragging one across the canvas.
    const maxCanvas = presetsForDevice("tablet").find(
      (p) => p.id === "max-canvas",
    )!;
    expect(railsOnSide(maxCanvas.layout, "right")).toHaveLength(2);
  });

  it("does NOT apply the Tools-left rule to the desktop list", () => {
    // Desktop `Classic` keeps the historical order: layers left, tools right.
    const classic = presetsForDevice("desktop").find(
      (p) => p.id === "classic",
    )!;
    expect(SIDE_SLOTS.indexOf(classic.layout.right.slot)).toBeGreaterThan(
      SIDE_SLOTS.indexOf(classic.layout.left.slot),
    );
  });

  it("leaves the tablet TOOLBAR out of the sizing rule", () => {
    // Not an oversight: the toolbar does not resize at all (owner,
    // 2026-08-28) — its overlay offers `spread` instead of a scale pair. What
    // distinguishes the tablet presets from each other is where it docks and
    // how many rows it takes, and the rule must not flatten that.
    const toolbars = presetsForDevice("tablet").map((p) => p.layout.toolbar);
    expect(new Set(toolbars.map((t) => t.edge)).size).toBeGreaterThan(1);
    expect(new Set(toolbars.map((t) => t.spread)).size).toBeGreaterThan(1);
  });

  it("does NOT apply the tablet rule to the desktop list", () => {
    // A desktop has room for wide rails; `Big Controls` exists to use it.
    const desktop = presetsForDevice("desktop");
    expect(desktop.some((p) => p.layout.left.scale !== "compact")).toBe(true);
  });

  it("falls back to the desktop list for an unknown class", () => {
    const unknown = "watch" as Parameters<typeof presetsForDevice>[0];
    expect(presetsForDevice(unknown)).toBe(presetsForDevice("desktop"));
  });
});

describe("applyPreset", () => {
  const preset = presetsForDevice("desktop").find(
    (p) => p.id === "wide-canvas",
  )!;

  it("replaces the whole arrangement, not just the fields that differ", () => {
    const current: RailLayout = {
      ...DEFAULT_RAIL_LAYOUT,
      bottom: { edge: "top", scale: "huge" },
      toolbar: { edge: "right", scale: "regular", spread: 3 },
    };
    const next = applyPreset(current, preset);

    // Every field comes from the preset — a leftover `top` edge or a spread
    // of 3 would mean the card showed one thing and produced another.
    expect(next.bottom).toEqual(preset.layout.bottom);
    expect(next.toolbar).toEqual(preset.layout.toolbar);
    expect(next.left).toEqual(preset.layout.left);
    expect(next.right).toEqual(preset.layout.right);
  });

  it("⭐ CARRIES OVER the Other Hand positions — the one exception", () => {
    // Hard-won thumb positions, orthogonal to where a rail sits. Wiping them
    // because the user tried a different arrangement would be destructive.
    const current: RailLayout = {
      ...DEFAULT_RAIL_LAYOUT,
      otherHand: { color: { positions: { hue: { x: 10, y: 20 } } } },
    };
    expect(applyPreset(current, preset).otherHand).toEqual(current.otherHand);
  });

  it("is idempotent — applying twice is applying once", () => {
    const once = applyPreset(DEFAULT_RAIL_LAYOUT, preset);
    expect(applyPreset(once, preset)).toEqual(once);
  });
});

describe("isPresetActive", () => {
  const classic = presetsForDevice("desktop")[0];

  it("recognises the arrangement a preset produces", () => {
    expect(isPresetActive(applyPreset(DEFAULT_RAIL_LAYOUT, classic), classic))
      .toBe(true);
  });

  it("ignores Other Hand positions — they are not part of a preset", () => {
    // Otherwise moving one thumb slider would un-tick the layout card, which
    // has nothing to do with it.
    const withThumbs: RailLayout = {
      ...DEFAULT_RAIL_LAYOUT,
      otherHand: { color: { positions: { hue: { x: 1, y: 2 } } } },
    };
    expect(isPresetActive(withThumbs, classic)).toBe(true);
  });

  it("goes false as soon as any rail actually differs", () => {
    const moved: RailLayout = {
      ...DEFAULT_RAIL_LAYOUT,
      bottom: { edge: "top", scale: "regular" },
    };
    expect(isPresetActive(moved, classic)).toBe(false);
  });
});

describe("customPresetId", () => {
  it("never collides with a built-in id", () => {
    const built = presetsForDevice("desktop");
    expect(built.map((p) => p.id)).not.toContain(customPresetId(built));
  });

  it("skips an id already taken by an existing custom preset", () => {
    const existing: LayoutPreset[] = [
      { id: "custom-1", name: "a", description: "", layout: DEFAULT_RAIL_LAYOUT },
    ];
    expect(customPresetId(existing)).not.toBe("custom-1");
  });
});
