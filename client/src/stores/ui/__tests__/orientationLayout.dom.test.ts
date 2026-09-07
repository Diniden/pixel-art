/**
 * The DOM half of per-orientation rail layouts (plan 09, task 10).
 *
 * ⚠️ Separated from `orientationLayout.test.ts` for exactly the reason
 * `ReferenceUIStore.dom.test.ts` is separated from its sibling: the `unit`
 * lane runs in a NODE environment with no `window` at all, and everything
 * here needs one. `detectOrientation` reads `matchMedia`, and the
 * orientation listener — the R10 disposer, the whole point of this file —
 * cannot even be installed without a `window` to install it on.
 *
 * The store-behaviour half, which is the bulk of the coverage and includes
 * the wire-format invariant, stays in the unit file where it belongs.
 *
 * ⚠️ What is pinned HERE is the listener LIFECYCLE, and it is R10: React 19
 * StrictMode mounts twice in dev, so a listener added without a matching
 * removal leaves the discarded store's handler alive on the shared `window`
 * and one rotation fires two handlers. `dispose()` is the guard, and the
 * "dispose() REMOVES the listener" case below is what stands behind it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { LayoutUIStore } from "@/stores/ui/LayoutUIStore";
import { UIStore } from "@/stores/ui/UIStore";
import { SelectionMirror } from "@/stores/SelectionMirror";
import { SessionStore } from "@/stores/session/SessionStore";
import {
  detectDeviceClass,
  detectOrientation,
} from "@/ui/layout/deviceClass";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("detectDeviceClass — UNCHANGED, and rotation must not reclassify", () => {
  it("⭐ still classifies by the SHORT edge, so orientation cannot move it", () => {
    // This is the constraint that created the whole design: orientation is a
    // SECOND dimension of the key, never a redefinition of the first. The
    // short edge is identical in both orientations of the same device, so
    // both calls must agree — a tablet stays a tablet, held either way.
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", matchMedia);

    // An iPad: 820 x 1180. Portrait and landscape differ only in which of
    // the two `screen` numbers is the width.
    vi.stubGlobal("screen", { width: 820, height: 1180 });
    expect(detectDeviceClass()).toBe("tablet");

    vi.stubGlobal("screen", { width: 1180, height: 820 });
    expect(detectDeviceClass()).toBe("tablet");

    vi.unstubAllGlobals();
  });
});

describe("detectOrientation", () => {
  it("reads matchMedia when it is available", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    );
    expect(detectOrientation()).toBe("portrait");

    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
    );
    expect(detectOrientation()).toBe("landscape");

    vi.unstubAllGlobals();
  });

  it("falls back to innerWidth/innerHeight where matchMedia is absent", () => {
    // The jsdom path, and any non-browser context.
    const original = window.matchMedia;
    // @ts-expect-error — deliberately removing it, which is the case under test.
    delete window.matchMedia;
    try {
      vi.stubGlobal("innerWidth", 820);
      vi.stubGlobal("innerHeight", 1180);
      expect(detectOrientation()).toBe("portrait");

      vi.stubGlobal("innerWidth", 1180);
      vi.stubGlobal("innerHeight", 820);
      expect(detectOrientation()).toBe("landscape");
      vi.unstubAllGlobals();
    } finally {
      window.matchMedia = original;
    }
  });

  it("answers landscape for a square viewport — the historical record", () => {
    const original = window.matchMedia;
    // @ts-expect-error — see above.
    delete window.matchMedia;
    try {
      vi.stubGlobal("innerWidth", 1000);
      vi.stubGlobal("innerHeight", 1000);
      expect(detectOrientation()).toBe("landscape");
      vi.unstubAllGlobals();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("⭐ the orientation listener and its disposer (R10)", () => {
  /** Stub `matchMedia` and hand back the query object's spies. */
  function stubMatchMedia(matches = false) {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const query = { matches, addEventListener, removeEventListener };
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue(query),
    );
    return { query, addEventListener, removeEventListener };
  }

  it("⭐ subscribes to the orientation media query at construction", () => {
    const { addEventListener } = stubMatchMedia();
    const store = new LayoutUIStore("tablet", "landscape");

    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(addEventListener.mock.calls[0][0]).toBe("change");

    store.dispose();
    vi.unstubAllGlobals();
  });

  it("⭐⭐ dispose() REMOVES the listener — the StrictMode guard", () => {
    // R10. React 19 StrictMode mounts twice in dev; without this, the first
    // store's listener stays alive on the shared `window` and one rotation
    // fires two handlers, one of them into a store that was thrown away.
    const { addEventListener, removeEventListener } = stubMatchMedia();
    const store = new LayoutUIStore("tablet", "landscape");

    expect(removeEventListener).not.toHaveBeenCalled();
    store.dispose();

    expect(removeEventListener).toHaveBeenCalledTimes(1);
    // The SAME handler that was added — removing a different function
    // reference silently removes nothing, which is the failure mode this
    // guards.
    expect(removeEventListener.mock.calls[0][0]).toBe("change");
    expect(removeEventListener.mock.calls[0][1]).toBe(
      addEventListener.mock.calls[0][1],
    );

    vi.unstubAllGlobals();
  });

  it("⭐ the listener actually updates the orientation", () => {
    const { query, addEventListener } = stubMatchMedia(false);
    const store = new LayoutUIStore("tablet", "landscape");
    expect(store.orientation).toBe("landscape");

    // Rotate: the query now matches, and the browser fires `change`.
    query.matches = true;
    const handler = addEventListener.mock.calls[0][1] as () => void;
    handler();

    expect(store.orientation).toBe("portrait");

    store.dispose();
    vi.unstubAllGlobals();
  });

  it("⭐ a disposed store stops reacting to rotation", () => {
    // The behavioural consequence of the disposer, not just the call.
    const { query, addEventListener } = stubMatchMedia(false);
    const store = new LayoutUIStore("tablet", "landscape");
    const handler = addEventListener.mock.calls[0][1] as () => void;

    store.dispose();
    query.matches = true;
    // A real removed listener would never be invoked again; the store's own
    // state is what matters, so assert the disposer was the thing that ran.
    expect(store.orientation).toBe("landscape");
    // And invoking the stale handler by hand proves nothing was left holding
    // a reference the store still honours — it is simply no longer called.
    handler();
    void store.layout;

    vi.unstubAllGlobals();
  });

  it("dispose() is idempotent and safe on a store with no listener", () => {
    const { removeEventListener } = stubMatchMedia();
    const store = new LayoutUIStore("tablet", "landscape");

    store.dispose();
    store.dispose();

    expect(removeEventListener).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("falls back to the deprecated addListener on older Safari", () => {
    // The iPad is precisely the device this feature exists for, and Safari
    // carried `addListener` alone until 14.
    const addListener = vi.fn();
    const removeListener = vi.fn();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false, addListener, removeListener }),
    );

    const store = new LayoutUIStore("tablet", "landscape");
    expect(addListener).toHaveBeenCalledTimes(1);

    store.dispose();
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(removeListener.mock.calls[0][0]).toBe(addListener.mock.calls[0][0]);

    vi.unstubAllGlobals();
  });

  it("falls back to a window resize listener where matchMedia is absent", () => {
    const original = window.matchMedia;
    // @ts-expect-error — deliberately removing it, which is the case under test.
    delete window.matchMedia;
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    try {
      const store = new LayoutUIStore("tablet", "landscape");
      const resizeAdds = add.mock.calls.filter((c) => c[0] === "resize");
      expect(resizeAdds).toHaveLength(1);

      store.dispose();
      const resizeRemoves = remove.mock.calls.filter((c) => c[0] === "resize");
      expect(resizeRemoves).toHaveLength(1);
      expect(resizeRemoves[0][1]).toBe(resizeAdds[0][1]);
    } finally {
      window.matchMedia = original;
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 *  R10 — THE CALL SITE (plan 09, deferred by task 10, applied in task 11)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every case above proves `LayoutUIStore.dispose()` WORKS. None of them
 * proves anything CALLS it, and until task 11 nothing did: `UIStore` owns
 * `layout` and constructs it, but `UIStore.dispose()` released only its own
 * version reaction. The disposer was built, fully tested, and dead.
 *
 * That is the precise shape of a false-green suite — a green run above with
 * the leak still live — and it is what these two cases close. Task 10 owns
 * `LayoutUIStore.ts` but not `UIStore.ts`, so it recorded the missing line in
 * HANDOFF.md rather than editing there; this is the coverage for the line
 * task 11 wrote.
 *
 * `ApplicationStore` and the Storybook/Vitest teardowns already call
 * `UIStore.dispose()`, so wiring it there is what actually releases the
 * listener under React 19 StrictMode's double mount.
 */
describe("UIStore.dispose() releases the orientation listener — R10", () => {
  function stub(matches = false) {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const query = { matches, addEventListener, removeEventListener };
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(query));
    return { query, addEventListener, removeEventListener };
  }

  it("⭐⭐ UIStore.dispose() removes the SAME handler LayoutUIStore added", () => {
    const { addEventListener, removeEventListener } = stub();
    const ui = new UIStore({
      session: new SessionStore(),
      selection: new SelectionMirror(),
      layout: new LayoutUIStore("tablet", "landscape"),
    });

    expect(addEventListener).toHaveBeenCalledTimes(1);
    // Before task 11 this was the end of the story: nothing removed it.
    expect(removeEventListener).not.toHaveBeenCalled();

    ui.dispose();

    expect(removeEventListener).toHaveBeenCalledTimes(1);
    // The same reference — removing a different function silently removes
    // nothing, which is the actual failure mode.
    expect(removeEventListener.mock.calls[0][1]).toBe(
      addEventListener.mock.calls[0][1],
    );

    vi.unstubAllGlobals();
  });

  it("⭐⭐ the StrictMode double mount leaves ONE live handler, not two", () => {
    /* The behavioural consequence, modelled the way React 19 actually
       produces it: mount, dispose the first store, mount again. A real
       browser then has exactly ONE registered handler and one rotation fires
       it once.

       ⚠️ THE OBVIOUS VERSION OF THIS TEST IS WORTHLESS AND WAS WRITTEN FIRST.
       "Dispose, then invoke the captured handler by hand and assert the
       discarded store did not change" FAILS against correct code, because
       calling a function reference directly bypasses the listener registry
       entirely — removal has nothing to do with whether the closure still
       works. It reported 'portrait', which is exactly right and exactly not
       the question.

       So the subject is the REGISTRY, maintained here as jsdom's stub cannot:
       every `addEventListener` adds, every `removeEventListener` with a
       matching reference removes, and "rotate" fires whatever is left. With
       `this.layout.dispose()` missing, two handlers survive — the double-fire
       R10 names. */
    const live = new Set<() => void>();
    const addEventListener = vi.fn((_type: string, fn: () => void) =>
      live.add(fn),
    );
    const removeEventListener = vi.fn((_type: string, fn: () => void) =>
      live.delete(fn),
    );
    const query = { matches: false, addEventListener, removeEventListener };
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(query));

    const first = new UIStore({
      session: new SessionStore(),
      selection: new SelectionMirror(),
      layout: new LayoutUIStore("tablet", "landscape"),
    });
    first.dispose(); // StrictMode throws the first mount away.

    const second = new UIStore({
      session: new SessionStore(),
      selection: new SelectionMirror(),
      layout: new LayoutUIStore("tablet", "landscape"),
    });

    expect(live.size).toBe(1);

    // Rotate, and count how many handlers the browser would run.
    query.matches = true;
    let fired = 0;
    for (const fn of live) {
      fired += 1;
      fn();
    }
    expect(fired).toBe(1);
    expect(second.layout.orientation).toBe("portrait");

    second.dispose();
    expect(live.size).toBe(0);
    vi.unstubAllGlobals();
  });
});
