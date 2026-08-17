/**
 * SessionStore unit tests (task 14).
 *
 * Pure MobX — no React, no Zustand, no network. Each test constructs its own
 * `ApplicationStore`; there is deliberately no module-level singleton to
 * share, and one test asserts exactly that.
 */
import { describe, expect, it, vi } from "vitest";
import { isObservable, reaction } from "mobx";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { MAX_COLOR_HISTORY } from "@/store/storeTypes";
import type { LayerClipboard } from "@/store/storeTypes";
import type { Color } from "@/types";

const color = (r: number): Color => ({ r, g: 0, b: 0, a: 255 });

function makeApp() {
  return new ApplicationStore({ autoSaveEnabled: false });
}

describe("ApplicationStore construction", () => {
  it("takes an options object and fills defaults", () => {
    const app = new ApplicationStore({});
    expect(app.options.autoSaveEnabled).toBe(true);
    expect(app.options.historyBudgetBytes).toBe(64 * 1024 * 1024);
    expect(app.options.api).toBeNull();

    const tuned = new ApplicationStore({
      autoSaveEnabled: false,
      historyBudgetBytes: 1024,
    });
    expect(tuned.options.autoSaveEnabled).toBe(false);
    expect(tuned.options.historyBudgetBytes).toBe(1024);
  });

  it("two instances are fully independent — no module singleton", () => {
    const a = makeApp();
    const b = makeApp();
    a.session.setSaveStatus("saving");
    a.session.setLayerClipboard({ type: "layer", layerFrames: [] });
    expect(b.session.saveStatus).toBe("idle");
    expect(b.session.layerClipboard).toBeNull();
  });
});

describe("MobX strict mode (configure.ts)", () => {
  it("configure() ran: enforceActions is 'always'", async () => {
    makeApp(); // importing ApplicationStore pulls in ./configure
    const { _getGlobalState } = await import("mobx");
    expect(_getGlobalState().enforceActions).toBe("always");
  });

  it("enforceActions 'always': an unwrapped observable write WARNS (mobx 7)", () => {
    // ⚠️ MEASURED against mobx@7.0.0: `checkIfStateModificationsAreAllowed`
    // emits a DEV-ONLY `console.warn`, it does NOT throw — the task spec's
    // "an unwrapped write throws" described mobx 6. The bridge still wraps
    // every write in `runInAction`, which is correct under both.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = makeApp();
    app.session.saveStatus = "saving";
    expect(
      warn.mock.calls.some((args) =>
        String(args[0]).includes("strict-mode is enabled"),
      ),
    ).toBe(true);
    warn.mockRestore();
  });

  it("writes inside declared actions succeed", () => {
    const app = makeApp();
    app.session.setSaveStatus("saving");
    expect(app.session.saveStatus).toBe("saving");
  });
});

describe("SessionStore defaults — the five tenants", () => {
  it("starts idle, unconfigured and empty", () => {
    const s = makeApp().session;
    expect(s.saveStatus).toBe("idle");
    expect(s.lastSaveError).toBeNull();
    expect(s.saveSuspended).toBe(false);
    expect(s.aiServiceUrl).toBeNull();
    expect(s.aiConnection).toBe("unknown");
    expect(s.layerClipboard).toBeNull();
    expect(s.timelineCellClipboard).toBeNull();
    expect(s.colorHistory).toEqual([]);
  });
});

describe("computeds", () => {
  it("isSaving tracks saveStatus", () => {
    const s = makeApp().session;
    const seen: boolean[] = [];
    const dispose = reaction(
      () => s.isSaving,
      (v) => seen.push(v),
      { fireImmediately: true },
    );
    s.setSaveStatus("saving");
    s.setSaveStatus("saved");
    dispose();
    expect(seen).toEqual([false, true, false]);
  });

  it("canPaste tracks layerClipboard", () => {
    const s = makeApp().session;
    const seen: boolean[] = [];
    const dispose = reaction(
      () => s.canPaste,
      (v) => seen.push(v),
      { fireImmediately: true },
    );
    s.setLayerClipboard({ type: "layer", layerFrames: [] });
    s.setLayerClipboard(null);
    dispose();
    expect(seen).toEqual([false, true, false]);
  });
});

describe("clipboards are observable.ref — MobX never sees inside a grid", () => {
  it("the stored clipboard is the SAME reference, not a proxy", () => {
    const s = makeApp().session;
    const clipboard: LayerClipboard = {
      type: "layer",
      layerFrames: [
        {
          name: "L1",
          visible: true,
          pixels: [[{ color: 0, normal: 0, height: 0 }]],
        },
      ],
    };
    s.setLayerClipboard(clipboard);
    // Reference-identical: nothing was cloned or wrapped.
    expect(s.layerClipboard).toBe(clipboard);
    // Not proxied: `observable.ref` leaves the value untouched.
    expect(isObservable(s.layerClipboard)).toBe(false);
    // And the pixel grid inside is still the exact same plain array.
    expect(s.layerClipboard!.layerFrames![0].pixels).toBe(
      clipboard.layerFrames![0].pixels,
    );
  });
});

describe("colorHistory — Zustand addToColorHistory semantics, verbatim", () => {
  it("prepends newest first", () => {
    const s = makeApp().session;
    s.addToColorHistory(color(1));
    s.addToColorHistory(color(2));
    expect(s.colorHistory.map((c) => c.r)).toEqual([2, 1]);
  });

  it("caps at MAX_COLOR_HISTORY", () => {
    const s = makeApp().session;
    for (let i = 0; i < MAX_COLOR_HISTORY + 5; i++) {
      s.addToColorHistory(color(i));
    }
    expect(s.colorHistory).toHaveLength(MAX_COLOR_HISTORY);
    // Newest survive, oldest evicted.
    expect(s.colorHistory[0].r).toBe(MAX_COLOR_HISTORY + 4);
  });

  it("an existing colour MOVES to the front instead of duplicating", () => {
    const s = makeApp().session;
    s.addToColorHistory(color(1));
    s.addToColorHistory(color(2));
    s.addToColorHistory(color(1));
    expect(s.colorHistory.map((c) => c.r)).toEqual([1, 2]);
    expect(s.colorHistory).toHaveLength(2);
  });
});

describe("R14 — nothing resets the session by construction", () => {
  it("SessionStore exposes no reset/clear method that could drop the clipboards", () => {
    const s = makeApp().session;
    const methodNames = Object.getOwnPropertyNames(
      Object.getPrototypeOf(s),
    ).filter((n) => typeof (s as unknown as Record<string, unknown>)[n] === "function");
    // The contract: no method whose name suggests wholesale clearing exists.
    // (Setting a clipboard to null explicitly is fine; a project-switch hook
    // that clears session state is not.)
    expect(methodNames.filter((n) => /^(reset|clear|onProjectSwitch)/i.test(n))).toEqual([]);
  });
});
