/**
 * The edge/fill colour split (2026-09-01).
 *
 * Two GLOBAL colour slots, not a shape-tool option: the tools that draw an
 * EDGE (pencil, line, a shape's outline) use `selectedColor`, and the tools
 * that flood an AREA (bucket, gaussian fill, a shape's interior) use
 * `fillColor`. A rectangle or ellipse in `"both"` mode uses each for the part
 * it names.
 *
 * ⚠️ THE INVARIANT THAT PROTECTS THE OWNER'S DATA: `fillColor` is TRI-STATE,
 * exactly like `eyedropperMode` and `borderRadius`. It stays `undefined` until
 * the user picks a fill colour, which keeps the key out of all 151 corpus
 * snapshots, and readers go through `fillColorOrSelected` so a project that
 * predates the split behaves exactly as it did — one colour in both roles.
 *
 * ⚠️ And the wire half is STRICTER than the other tri-state fields: both
 * codecs emit the key through a conditional SPREAD rather than as
 * `fillColor: undefined`, because "present but undefined" still counts as a
 * key to `Object.keys()` and to the corpus digest. Measured while building
 * this: the plain `: undefined` form changed all 11 corpus digests.
 * `persistedUIState.test.ts` and `migrations.test.ts` pin the wire half; this
 * pins the behaviour.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { ToolUIStore } from "@/stores/ui/ToolUIStore";
import type { Color } from "@/types";

const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };

function store(): ToolUIStore {
  return new ToolUIStore();
}

describe("fillColor — the tri-state field", () => {
  it("⭐ is undefined until the user picks one — no key for untouched projects", () => {
    // The whole reason the field is tri-state. See the header.
    expect(store().fillColor).toBeUndefined();
  });

  it("⭐ falls back to the EDGE colour — a pre-split project is unchanged", () => {
    const t = store();
    runInAction(() => t.setColor(RED));

    // No fill colour has ever been set, so both roles resolve to the one
    // colour — which is exactly how the app behaved before the split.
    expect(t.fillColor).toBeUndefined();
    expect(t.fillColorOrSelected).toEqual(RED);
  });

  it("stops following the edge colour once set", () => {
    const t = store();
    runInAction(() => t.setColor(RED));
    runInAction(() => t.setFillColor(BLUE));

    expect(t.fillColorOrSelected).toEqual(BLUE);

    // Changing the edge colour must NOT drag the fill colour with it — they
    // are independent slots once the user has expressed a preference.
    runInAction(() => t.setColor({ r: 1, g: 2, b: 3, a: 255 }));
    expect(t.fillColorOrSelected).toEqual(BLUE);
    expect(t.selectedColor).toEqual({ r: 1, g: 2, b: 3, a: 255 });
  });

  it("hydrates from a project that HAS the key", () => {
    const t = store();
    runInAction(() => t.hydrate({ selectedColor: RED, fillColor: BLUE }));

    expect(t.selectedColor).toEqual(RED);
    expect(t.fillColor).toEqual(BLUE);
  });

  it("⭐ hydrating a project WITHOUT the key leaves it undefined", () => {
    const t = store();
    runInAction(() => t.hydrate({ selectedColor: RED }));

    // Not `RED` — the field stays absent, so re-saving the project does not
    // gain a key. The fallback is what makes it read as RED.
    expect(t.fillColor).toBeUndefined();
    expect(t.fillColorOrSelected).toEqual(RED);
  });
});

describe("colorTarget — which slot the picker edits", () => {
  it("defaults to the edge slot", () => {
    expect(store().colorTarget).toBe("edge");
  });

  it("switches, and is independent of the colours themselves", () => {
    const t = store();
    runInAction(() => t.setColorTarget("fill"));
    expect(t.colorTarget).toBe("fill");

    runInAction(() => t.setColor(RED));
    runInAction(() => t.setFillColor(BLUE));
    expect(t.colorTarget).toBe("fill");

    runInAction(() => t.setColorTarget("edge"));
    expect(t.colorTarget).toBe("edge");
    // Switching tabs does not disturb either colour.
    expect(t.selectedColor).toEqual(RED);
    expect(t.fillColorOrSelected).toEqual(BLUE);
  });

  it("⭐ is NOT persisted — it is a panel's view state, not the artwork's", () => {
    // Asserted against the WIRE FORMAT itself rather than the store, because
    // the claim is about what reaches a saved project. `CompactUIState` is the
    // full list of persisted keys, and `colorTarget` must never appear in it.
    const source = readFileSync("src/types/codecs/compactTypes.ts", "utf8");
    const body = source.match(
      /export interface CompactUIState \{([\s\S]*?)\n\}/,
    );
    expect(body).not.toBeNull();
    const declared = [...body![1].matchAll(/^ {2}(\w+)\??:/gm)].map(
      (m) => m[1],
    );

    expect(declared).not.toContain("colorTarget");
    // ...while its sibling, which IS persisted, is there.
    expect(declared).toContain("fillColor");
  });
});
