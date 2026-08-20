/**
 * CanvasInteractionStore — the three TRANSIENT gesture fields (task 32).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE ANNOTATION IS THE TEST (R2)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `previewPixels` is rewritten on EVERY mousemove while a shape tool drags —
 * an ellipse over a 64x64 area is hundreds of `{x, y}` records, several times
 * a second. Under a deep `observable` MobX would build a proxy per array AND
 * per element and tear them all down on the next move. That does not produce a
 * WRONG ANSWER anywhere, which is precisely why it needs a test: it presents
 * as "MobX is slow" and gets misdiagnosed for a week.
 *
 * `isObservableProp` cannot distinguish `observable` from `observableRef`, so
 * these tests assert the OBSERVABLE CONSEQUENCE instead: under `observableRef`
 * the contained array and its elements are raw objects, not proxies, and
 * reactions fire on IDENTITY change only.
 *
 * The store also must never enter history and never trigger a save. Task 08
 * pins the legacy half of that (`store/__tests__/drawing.test.ts:509`); this
 * file pins the structural half — the store holds no reference through which
 * it could.
 */
import { describe, expect, it, vi } from "vitest";
import { isObservable, isObservableProp, autorun, runInAction } from "mobx";
import { CanvasInteractionStore } from "../CanvasInteractionStore";

describe("CanvasInteractionStore — the observableRef contract", () => {
  it("previewPixels is observable AS A REF: the array itself is NOT a proxy", () => {
    const s = new CanvasInteractionStore();
    const raw = [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ];
    runInAction(() => s.setPreviewPixels(raw));

    // The PROPERTY is observable...
    expect(isObservableProp(s, "previewPixels")).toBe(true);
    // ...but its VALUE is the raw array, untouched. Under a deep `observable`
    // this would be a MobX proxy and `isObservable` would be true.
    expect(isObservable(s.previewPixels)).toBe(false);
    expect(s.previewPixels).toBe(raw);
    // And no element was proxied either — the per-frame allocation storm.
    expect(isObservable(s.previewPixels[0])).toBe(false);
    expect(s.previewPixels[0]).toBe(raw[0]);
  });

  it("drawStartPoint is observableRef too — a Point replaced wholesale", () => {
    const s = new CanvasInteractionStore();
    const p = { x: 4, y: 7 };
    runInAction(() => s.startDrawing(p));
    expect(isObservableProp(s, "drawStartPoint")).toBe(true);
    expect(isObservable(s.drawStartPoint)).toBe(false);
    expect(s.drawStartPoint).toBe(p);
  });

  it("reacts on array IDENTITY, which is the signal a redraw wants", () => {
    const s = new CanvasInteractionStore();
    const seen: number[] = [];
    const dispose = autorun(() => seen.push(s.previewPixels.length));
    expect(seen).toEqual([0]);

    runInAction(() => s.setPreviewPixels([{ x: 1, y: 1 }]));
    expect(seen).toEqual([0, 1]);

    // A NEW array of the same length still fires: identity changed, and the
    // canvas must repaint. Every writer replaces wholesale.
    runInAction(() => s.setPreviewPixels([{ x: 9, y: 9 }]));
    expect(seen).toEqual([0, 1, 1]);
    dispose();
  });

  it("never mutates an array in place — clear allocates a fresh one", () => {
    const s = new CanvasInteractionStore();
    const first = [{ x: 1, y: 1 }];
    runInAction(() => s.setPreviewPixels(first));
    runInAction(() => s.clearPreviewPixels());
    expect(s.previewPixels).toHaveLength(0);
    // `first` is untouched: `clearPreviewPixels` did NOT do `length = 0`.
    expect(first).toHaveLength(1);
    expect(s.previewPixels).not.toBe(first);
  });
});

describe("CanvasInteractionStore — the gesture lifecycle", () => {
  it("startDrawing opens the gesture and records the anchor", () => {
    const s = new CanvasInteractionStore();
    expect(s.isDrawing).toBe(false);
    runInAction(() => s.startDrawing({ x: 3, y: 5 }));
    expect(s.isDrawing).toBe(true);
    expect(s.drawStartPoint).toEqual({ x: 3, y: 5 });
  });

  it("updateDrawing moves the anchor without closing the gesture", () => {
    const s = new CanvasInteractionStore();
    runInAction(() => s.startDrawing({ x: 1, y: 1 }));
    runInAction(() => s.updateDrawing({ x: 2, y: 2 }));
    expect(s.isDrawing).toBe(true);
    expect(s.drawStartPoint).toEqual({ x: 2, y: 2 });
  });

  it("endDrawing resets ALL THREE fields together", () => {
    // Verbatim from the legacy `drawingActions.ts:70-72`, which reset the
    // preview in the same `set()` — a gesture that ended with a stale preview
    // would leave phantom pixels on the canvas.
    const s = new CanvasInteractionStore();
    runInAction(() => {
      s.startDrawing({ x: 1, y: 1 });
      s.setPreviewPixels([{ x: 2, y: 2 }]);
    });
    runInAction(() => s.endDrawing());
    expect(s.isDrawing).toBe(false);
    expect(s.drawStartPoint).toBeNull();
    expect(s.previewPixels).toEqual([]);
  });

  it("holds no history and no save reference — structurally, not by discipline", () => {
    const s = new CanvasInteractionStore();
    // Nothing on the instance can reach a HistoryStore or an AutoSaveController.
    const names = Object.getOwnPropertyNames(s);
    expect(names.sort()).toEqual(
      ["drawStartPoint", "isDrawing", "previewPixels"].sort(),
    );
  });

  it("a 200-move drag allocates no proxies at all", () => {
    // The hot path, at the rate it really runs.
    const s = new CanvasInteractionStore();
    const spy = vi.fn();
    const dispose = autorun(() => spy(s.previewPixels));
    for (let i = 0; i < 200; i++) {
      const frame = Array.from({ length: 64 }, (_, k) => ({ x: k, y: i }));
      runInAction(() => s.setPreviewPixels(frame));
      expect(isObservable(s.previewPixels)).toBe(false);
    }
    // 1 initial + 200 identity changes.
    expect(spy).toHaveBeenCalledTimes(201);
    dispose();
  });
});
