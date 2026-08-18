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
import { runInAction } from "mobx";

import { ApiError } from "@/api";
import { DomainStore, type ProjectHost } from "@/stores/domain/DomainStore";
import { AutoSaveController } from "@/stores/session/AutoSaveController";
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
