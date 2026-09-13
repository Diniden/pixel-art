/**
 * AutoSaveController unit suite (REFRESH task 16).
 *
 * Drives the controller against a bare DomainStore + SessionStore with an
 * in-memory host and an INJECTED save function under fake timers — no
 * Zustand, no bridge, no network. The bridge-era integration (real Zustand
 * commits → bump → save) is covered by `store/__tests__/autoSave.test.ts`,
 * and the end-to-end zero-POST gate by `autoSaveGate.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeObservable, observable, runInAction } from "mobx";

import { ApiError } from "@/api";
import {
  DomainStore,
  type LoadState,
  type ProjectHost,
} from "@/stores/domain/DomainStore";
import {
  AutoSaveController,
  type AutoSaveDocument,
} from "@/stores/session/AutoSaveController";
import { SessionStore } from "@/stores/session/SessionStore";
import { tinyProject } from "@/store/__tests__/storeContract";
import type { CompactProject, Project } from "@/types";

interface Rig {
  domain: DomainStore;
  session: SessionStore;
  controller: AutoSaveController;
  save: ReturnType<typeof vi.fn>;
  setProject(p: Project | null): void;
  /** Simulate a completed load: gate opens, counters adopted as clean. */
  openGate(name?: string): void;
  /** Simulate one committed edit (what the bridge bump does). */
  edit(): void;
  dispose(): void;
}

function makeRig(
  saveImpl?: (project: CompactProject, name?: string) => Promise<unknown>,
): Rig {
  let current: Project | null = tinyProject();
  const host: ProjectHost = {
    getProject: () => current,
    installProject: (p) => {
      current = p;
    },
    replaceProject: (p) => {
      current = p;
    },
    snapshotToHistory: () => {},
  };
  const session = new SessionStore();
  const domain = new DomainStore({ session, host });
  // Task 23: `serialize()` now builds its payload from the MobX TREE plus the
  // hosted `uiState`, so a rig that swaps the hosted project must also adopt
  // it — exactly what the bridge's adoption seam does for the legacy Zustand
  // writers in the real app. Without this the rig would serialize an empty
  // tree, which is a defect in the harness, not in the store.
  runInAction(() => domain.adoptTree(current as Project));
  const save = vi.fn(
    saveImpl ?? (async () => ({ success: true, backupCreated: false })),
  );
  const controller = new AutoSaveController(domain, session, null, { save });
  return {
    domain,
    session,
    controller,
    save,
    setProject: (p) => {
      current = p;
      // Mirror the bridge's adoption seam (task 23) — see makeRig's comment.
      if (p) runInAction(() => domain.adoptTree(p));
    },
    openGate: (name = "unit") => {
      runInAction(() => {
        domain.projectName = name;
        domain.loadGeneration += 1;
        domain.loadState = "loaded";
      });
    },
    edit: () => domain.bumpDomainVersion(),
    dispose: () => controller.dispose(),
  };
}

let rig: Rig;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  rig?.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
});

/* ── THE GATE (R5) ───────────────────────────────────────────────────────── */

describe("the load-state gate — no save unless loadState === 'loaded'", () => {
  it("a FAILED load produces ZERO saves, even for a bumped version counter", () => {
    rig = makeRig();
    runInAction(() => {
      rig.domain.loadState = "failed";
    });
    // The strongest form of the guarantee: even if something bumps the edit
    // counter after a failed load, the trigger stays null and NOTHING fires.
    rig.edit();
    rig.edit();
    vi.advanceTimersByTime(60_000);
    expect(rig.save).not.toHaveBeenCalled();
    expect(rig.session.saveStatus).toBe("idle");
  });

  it("'idle' and 'loading' are equally shut (hydration guard)", () => {
    rig = makeRig();
    rig.edit(); // idle
    runInAction(() => {
      rig.domain.loadState = "loading";
    });
    rig.edit(); // loading (hydration writes happen in this state)
    vi.advanceTimersByTime(60_000);
    expect(rig.save).not.toHaveBeenCalled();
  });

  it("opening the gate is NOT an edit — a fresh load never saves by itself", () => {
    rig = makeRig();
    rig.openGate();
    vi.advanceTimersByTime(60_000);
    expect(rig.save).not.toHaveBeenCalled();
  });

  it("a failed load AFTER a healthy session shuts the gate again", () => {
    rig = makeRig();
    rig.openGate();
    rig.edit();
    vi.advanceTimersByTime(500);
    expect(rig.save).toHaveBeenCalledTimes(1);

    runInAction(() => {
      rig.domain.loadState = "failed";
    });
    rig.edit();
    vi.advanceTimersByTime(60_000);
    expect(rig.save).toHaveBeenCalledTimes(1); // nothing new
  });
});

/* ── debounce & coalescing ───────────────────────────────────────────────── */

describe("the `pending` status — what turns the header's dot ORANGE", () => {
  it("⭐ goes pending on the FIRST edit, before the debounce elapses", () => {
    // The dot must turn orange the moment there are unsaved changes, not
    // when the request finally leaves — the whole point is to warn the user
    // BEFORE they close the tab.
    rig = makeRig();
    rig.openGate();
    expect(rig.session.saveStatus).toBe("idle");

    rig.edit();
    expect(rig.session.saveStatus).toBe("pending");
    expect(rig.save).not.toHaveBeenCalled();
  });

  it("stays pending through the debounce and the in-flight save", async () => {
    rig = makeRig();
    rig.openGate();
    rig.edit();
    vi.advanceTimersByTime(499);
    expect(rig.session.saveStatus).toBe("pending");
  });

  it("⭐ reaches `saved` once the write completes — orange then green", async () => {
    rig = makeRig();
    rig.openGate();
    rig.edit();
    expect(rig.session.saveStatus).toBe("pending"); // orange
    vi.advanceTimersByTime(500);
    // Still not on disk while the transport is in flight, so still orange
    // to the user — `saving` and `pending` share the busy tone.
    expect(rig.session.saveStatus).toBe("saving");
    await vi.advanceTimersByTimeAsync(0);

    expect(rig.save).toHaveBeenCalledTimes(1);
    expect(rig.session.saveStatus).toBe("saved"); // green
  });

  it("does NOT go pending when the gate is shut", () => {
    // A suspended save or a failed load must not show orange forever: there
    // is nothing scheduled, so there is nothing to warn about.
    rig = makeRig();
    rig.openGate();
    rig.session.setSaveSuspended(true);
    rig.edit();
    expect(rig.session.saveStatus).toBe("idle");
  });
});

describe("debounce", () => {
  it("10 edits inside the window → exactly one save", () => {
    rig = makeRig();
    rig.openGate();
    for (let i = 0; i < 10; i++) {
      rig.edit();
      vi.advanceTimersByTime(49);
    }
    expect(rig.save).not.toHaveBeenCalled(); // each edit RESET the window
    vi.advanceTimersByTime(500);
    expect(rig.save).toHaveBeenCalledTimes(1);
  });

  it("coalesces to the LATEST payload", () => {
    rig = makeRig();
    rig.openGate();
    const projectA = tinyProject();
    const projectB = tinyProject();
    projectB.objects[0].name = "LATEST";
    rig.setProject(projectA);
    rig.edit();
    rig.setProject(projectB);
    rig.edit();
    vi.advanceTimersByTime(500);
    expect(rig.save).toHaveBeenCalledTimes(1);
    const sent = rig.save.mock.calls[0][0] as CompactProject;
    expect(sent.objects[0].name).toBe("LATEST");
  });

  it("passes projectName; omits it when the store has none", () => {
    rig = makeRig();
    rig.openGate("My Project");
    rig.edit();
    vi.advanceTimersByTime(500);
    expect(rig.save.mock.calls[0][1]).toBe("My Project");
  });

  it("the pixelVersion placeholder is wired into the trigger", () => {
    rig = makeRig();
    rig.openGate();
    rig.domain.bumpPixelVersion();
    vi.advanceTimersByTime(500);
    expect(rig.save).toHaveBeenCalledTimes(1);
  });
});

/* ── version counters ────────────────────────────────────────────────────── */

describe("the version counters", () => {
  it("bumpDomainVersion / bumpPixelVersion increment their counters", () => {
    rig = makeRig();
    expect(rig.domain.domainVersion).toBe(0);
    expect(rig.domain.pixelVersion).toBe(0);
    rig.domain.bumpDomainVersion();
    rig.domain.bumpPixelVersion();
    rig.domain.bumpPixelVersion();
    expect(rig.domain.domainVersion).toBe(1);
    expect(rig.domain.pixelVersion).toBe(2);
  });
});

/* ── the THIRD counter (W29d) ────────────────────────────────────────────── */

/**
 * `persistedUIVersion` — the counter task 16 said would "join with the UIStore
 * task", which task 24 BUILT but never wired into the trigger tuple.
 *
 * ⚠️ MEASURED W29d, before the fix: a UI-only write bumped
 * `UIStore.persistedUIVersion` from 1 to 2 and produced **zero** saves. Nothing
 * caught it because every UI setting ALSO went through a legacy Zustand setter
 * that called `updateProjectAndSave` — so the counter was dead weight and the
 * first setting whose ownership flipped to MobX would have silently stopped
 * persisting. `setAiServiceUrl` was blocked squarely on this.
 *
 * The source is OPTIONAL, so both shapes are pinned here: without it the
 * trigger keeps its exact task-16 behaviour, and with it a UI-only change
 * saves.
 */
describe("persistedUIVersion joins the trigger (W29d)", () => {
  /** A minimal stand-in for `UIStore`'s counter. */
  function uiSource(): { persistedUIVersion: number } {
    return observable({ persistedUIVersion: 0 });
  }

  function rigWithUI(ui: { persistedUIVersion: number }) {
    let current: Project | null = tinyProject();
    const host: ProjectHost = {
      getProject: () => current,
      installProject: (p) => {
        current = p;
      },
      replaceProject: (p) => {
        current = p;
      },
      snapshotToHistory: () => {},
    };
    const session = new SessionStore();
    const domain = new DomainStore({ session, host });
    runInAction(() => domain.adoptTree(current as Project));
    const save = vi.fn(async () => ({ success: true, backupCreated: false }));
    const controller = new AutoSaveController(
      domain,
      session,
      null,
      { save },
      ui,
    );
    runInAction(() => {
      domain.projectName = "unit";
      domain.loadGeneration += 1;
      domain.loadState = "loaded";
    });
    return { controller, save, dispose: () => controller.dispose() };
  }

  it("a UI-ONLY change schedules a save when the source is injected", async () => {
    const ui = uiSource();
    const r = rigWithUI(ui);
    expect(r.save).not.toHaveBeenCalled();

    // No domain edit, no pixel edit — only the UI counter moves.
    runInAction(() => {
      ui.persistedUIVersion += 1;
    });
    await vi.advanceTimersByTimeAsync(AutoSaveController.DEBOUNCE_MS);
    expect(r.save).toHaveBeenCalledTimes(1);
    r.dispose();
  });

  it("coalesces rapid UI changes into ONE save, like the other two counters", async () => {
    const ui = uiSource();
    const r = rigWithUI(ui);
    for (let i = 0; i < 10; i++) {
      runInAction(() => {
        ui.persistedUIVersion += 1;
      });
    }
    await vi.advanceTimersByTimeAsync(AutoSaveController.DEBOUNCE_MS);
    expect(r.save).toHaveBeenCalledTimes(1);
    r.dispose();
  });

  it("does not re-save when nothing has moved since the last save", async () => {
    const ui = uiSource();
    const r = rigWithUI(ui);
    runInAction(() => {
      ui.persistedUIVersion += 1;
    });
    await vi.advanceTimersByTimeAsync(AutoSaveController.DEBOUNCE_MS);
    expect(r.save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(r.save).toHaveBeenCalledTimes(1);
    r.dispose();
  });

  it("WITHOUT a source the trigger is unchanged — a domain edit still saves", async () => {
    rig = makeRig();
    rig.openGate();
    rig.edit();
    await vi.advanceTimersByTimeAsync(AutoSaveController.DEBOUNCE_MS);
    expect(rig.save).toHaveBeenCalledTimes(1);
  });
});

/* ── suspension ──────────────────────────────────────────────────────────── */

describe("saveSuspended", () => {
  it("clears a pending debounce and defers the edit until released", () => {
    rig = makeRig();
    rig.openGate();
    rig.edit();
    rig.session.setSaveSuspended(true);
    vi.advanceTimersByTime(10_000);
    expect(rig.save).not.toHaveBeenCalled();

    rig.session.setSaveSuspended(false);
    vi.advanceTimersByTime(500);
    expect(rig.save).toHaveBeenCalledTimes(1);
  });

  it("a fresh loadGeneration during suspension discards the stale edit", () => {
    rig = makeRig();
    rig.openGate();
    rig.edit(); // pending against the OLD project
    rig.session.setSaveSuspended(true);
    rig.openGate("other"); // switch-like: new generation adopted as clean
    rig.session.setSaveSuspended(false);
    vi.advanceTimersByTime(10_000);
    expect(rig.save).not.toHaveBeenCalled();
  });
});

/* ── retry, backoff, the attempt cap ─────────────────────────────────────── */

describe("failure handling", () => {
  it("backs off 500·2ⁿ ms and STOPS after 6 attempts with saveStatus 'error'", async () => {
    const failure = new ApiError({
      kind: "server",
      path: "/project",
      status: 500,
      serverMessage: "disk exploded",
    });
    rig = makeRig(async () => {
      throw failure;
    });
    rig.openGate();
    rig.edit();

    // Debounce → attempt 1.
    await vi.advanceTimersByTimeAsync(500);
    expect(rig.save).toHaveBeenCalledTimes(1);
    expect(rig.session.saveStatus).toBe("saving"); // retrying, not yet error

    // Backoff ladder: 500, 1000, 2000, 4000, 8000 → attempts 2..6.
    for (const [i, delay] of [500, 1000, 2000, 4000, 8000].entries()) {
      await vi.advanceTimersByTimeAsync(delay);
      expect(rig.save).toHaveBeenCalledTimes(i + 2);
    }

    // Attempt 6 failed → terminal error, message surfaced, retries STOP.
    expect(rig.session.saveStatus).toBe("error");
    expect(rig.session.lastSaveError?.serverMessage).toBe("disk exploded");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(rig.save).toHaveBeenCalledTimes(6); // bounded — no 2 Hz loop
  });

  it("a NEW edit after the terminal error re-opens a fresh attempt budget", async () => {
    let failing = true;
    rig = makeRig(async () => {
      if (failing) throw new Error("down");
      return { success: true };
    });
    rig.openGate();
    rig.edit();
    await vi.advanceTimersByTimeAsync(500 + 500 + 1000 + 2000 + 4000 + 8000);
    expect(rig.session.saveStatus).toBe("error");
    expect(rig.save).toHaveBeenCalledTimes(6);

    failing = false;
    rig.edit();
    await vi.advanceTimersByTimeAsync(500);
    expect(rig.save).toHaveBeenCalledTimes(7);
    expect(rig.session.saveStatus).toBe("saved");
  });

  it("a failure recovered on retry clears lastSaveError", async () => {
    let calls = 0;
    rig = makeRig(async () => {
      calls += 1;
      if (calls === 1) throw new Error("blip");
      return { success: true };
    });
    rig.openGate();
    rig.edit();
    await vi.advanceTimersByTimeAsync(500); // fails
    await vi.advanceTimersByTimeAsync(500); // first backoff → succeeds
    expect(rig.session.saveStatus).toBe("saved");
    expect(rig.session.lastSaveError).toBeNull();
  });
});

/* ── re-entrancy ─────────────────────────────────────────────────────────── */

describe("re-entrancy", () => {
  it("a save scheduled mid-flight fires exactly ONCE afterwards", async () => {
    let release!: () => void;
    let resolved = 0;
    rig = makeRig(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolved += 1;
            resolve({ success: true });
          };
        }),
    );
    rig.openGate();
    rig.edit();
    await vi.advanceTimersByTimeAsync(500);
    expect(rig.save).toHaveBeenCalledTimes(1); // in flight, unresolved

    // Three more edits while the first save is in flight…
    rig.edit();
    rig.edit();
    rig.edit();
    await vi.advanceTimersByTimeAsync(500);
    expect(rig.save).toHaveBeenCalledTimes(1); // still just the one

    // …release the first: the dirty flag replays exactly once.
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.save).toHaveBeenCalledTimes(2);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rig.save).toHaveBeenCalledTimes(2); // once, not once-per-edit
  });
});

/* ── status lifecycle ────────────────────────────────────────────────────── */

describe("saveStatus lifecycle", () => {
  it("cycles saving → saved → idle with the 2 s delay", async () => {
    rig = makeRig();
    rig.openGate();
    rig.edit();
    vi.advanceTimersByTime(500);
    expect(rig.session.saveStatus).toBe("saving"); // transport not yet settled
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.session.saveStatus).toBe("saved");
    await vi.advanceTimersByTimeAsync(1999);
    expect(rig.session.saveStatus).toBe("saved");
    await vi.advanceTimersByTimeAsync(1);
    expect(rig.session.saveStatus).toBe("idle");
  });
});

/* ── disposal ────────────────────────────────────────────────────────────── */

describe("dispose", () => {
  it("stops the reaction and drops any pending debounce", () => {
    rig = makeRig();
    rig.openGate();
    rig.edit();
    rig.controller.dispose();
    vi.advanceTimersByTime(10_000);
    expect(rig.save).not.toHaveBeenCalled();
  });
});

/* ── generic document (brush-studio 05) ─────────────────────────────────── */

/**
 * The controller is generic over `AutoSaveDocument<TDoc>` so task 11 can run
 * a SECOND instance over the brush store. Everything below is proven against
 * a document that is NOT a `DomainStore`: the same gate, debounce and status
 * writes, with the injected transport receiving the document's own payload
 * and its `saveName`.
 */
describe("generic document", () => {
  interface HelloDoc {
    hello: string;
  }

  /** A minimal MobX document — the four observable counters and a payload. */
  class FakeBrushDocument implements AutoSaveDocument<HelloDoc> {
    loadState: LoadState;
    loadGeneration = 1;
    domainVersion = 0;
    pixelVersion = 0;
    saveName = "brush-name";
    hello = "world";

    constructor(loadState: LoadState) {
      this.loadState = loadState;
      makeObservable(this, {
        loadState: observable,
        loadGeneration: observable,
        domainVersion: observable,
        pixelVersion: observable,
        saveName: observable,
      });
    }

    serialize(): HelloDoc | null {
      return { hello: this.hello };
    }
  }

  function genericRig(loadState: LoadState = "loaded") {
    const doc = new FakeBrushDocument(loadState);
    const session = new SessionStore();
    const save = vi.fn(async (payload: HelloDoc, name?: string) => ({
      hello: payload.hello,
      name,
    }));
    const controller = new AutoSaveController<HelloDoc>(doc, session, null, {
      save,
    });
    return {
      doc,
      session,
      save,
      controller,
      dispose: () => controller.dispose(),
    };
  }

  it("saves a non-DomainStore document with its own payload and saveName", async () => {
    const r = genericRig();
    expect(r.save).not.toHaveBeenCalled();

    runInAction(() => {
      r.doc.pixelVersion += 1;
    });
    expect(r.session.saveStatus).toBe("pending"); // same status writes
    vi.advanceTimersByTime(AutoSaveController.DEBOUNCE_MS);
    expect(r.save).toHaveBeenCalledTimes(1);
    expect(r.save).toHaveBeenCalledWith({ hello: "world" }, "brush-name");

    await vi.advanceTimersByTimeAsync(0);
    expect(r.session.saveStatus).toBe("saved");
    r.dispose();
  });

  it("a `loading` document never saves, however the counters move", () => {
    const r = genericRig("loading");
    runInAction(() => {
      r.doc.pixelVersion += 1;
      r.doc.domainVersion += 1;
    });
    vi.advanceTimersByTime(60_000);
    expect(r.save).not.toHaveBeenCalled();
    expect(r.session.saveStatus).toBe("idle");
    r.dispose();
  });

  it("an empty saveName is passed as undefined, like an unnamed project", () => {
    const r = genericRig();
    runInAction(() => {
      r.doc.saveName = "";
      r.doc.domainVersion += 1;
    });
    vi.advanceTimersByTime(AutoSaveController.DEBOUNCE_MS);
    expect(r.save).toHaveBeenCalledWith({ hello: "world" }, undefined);
    r.dispose();
  });
});
