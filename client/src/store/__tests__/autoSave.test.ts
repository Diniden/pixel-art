/**
 * Behaviour contract — auto-save scheduling, the save-status lifecycle, and the
 * defects task 14 fixed.
 *
 * REWIRED BY TASK 16 (the seam changed, the behaviour contract did not):
 * auto-save no longer lives in the Zustand store — `updateProjectAndSave` only
 * commits, the bridge bumps `DomainStore.domainVersion` per commit, and
 * `AutoSaveController`'s reaction owns debounce/save/status. Each test
 * therefore wires the full bridge-era stack via `wireAutoSave()` and observes
 * the transport at the NEW seam: `projectApi.save` (which now receives the
 * COMPACT payload — the same bytes the old facade produced).
 *
 * ONE further assertion flipped by task 17, authorised by its spec and SETTLED
 * BY OWNER DECISION (2026-08-16), marked `FLIPPED (task 17)` below: undo no
 * longer triggers an immediate save. `HistoryStore.isReplaying` suppresses the
 * bridge's `domainVersion` bump and the auto-save trigger for the duration of
 * the replay, so the NEXT real edit saves instead.
 *
 * Three assertions flipped, each authorised by the task 16 spec and marked
 * `FLIPPED (task 16)` below:
 *  1. `cancelPendingSave()` is gone — suspension DEFERS a pending edit instead
 *     of silently discarding it (rename keeps the edit, under the new name).
 *  2. A failed save no longer self-heals invisibly at 2 Hz forever — retry is
 *     debounced backoff with an attempt cap (the cap itself is pinned in
 *     `stores/session/__tests__/autoSaveController.test.ts`).
 *  3. The save-status writer is `SessionStore` (mirrored to Zustand by the
 *     bridge), not a module-level callback slot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLUE,
  HARNESSES,
  RED,
  cloneProject,
  tinyProject,
  wireAutoSave,
  type StoreHarness,
  type WiredApp,
} from "./storeContract";
import { MAX_HISTORY } from "@/store/storeTypes";
import { projectApi } from "@/api";
import { compactToProject, projectToCompact } from "@/types";
import { useEditorStore } from "@/store";

const spyOnSave = () => vi.spyOn(projectApi, "save");

describe.each(HARNESSES)("%s — auto-save", (_name, makeHarness) => {
  let harness: StoreHarness;
  let wired: WiredApp;
  let save: ReturnType<typeof spyOnSave>;

  beforeEach(() => {
    vi.useFakeTimers();
    save = spyOnSave();
    save.mockResolvedValue({ success: true, backupCreated: false });
    harness = makeHarness();
    harness.reset();
    // Install the project BEFORE the gate opens: hydration must never count
    // as an edit (the controller adopts the counters as its clean baseline
    // when `loadGeneration` bumps).
    harness.load(tinyProject());
    wired = wireAutoSave();
    wired.openGate("test");
    save.mockClear();
  });

  afterEach(() => {
    wired.dispose();
    harness.dispatch("endStroke");
    harness.reset();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /* ── the 500 ms debounce (AutoSaveController.DEBOUNCE_MS) ──────────────── */

  describe("debounce", () => {
    it("does NOT save synchronously — the 500 ms timer must elapse", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      expect(save).not.toHaveBeenCalled();

      vi.advanceTimersByTime(499);
      expect(save).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("COALESCES N rapid edits into exactly ONE save", () => {
      for (let i = 0; i < 12; i++) {
        harness.dispatch("setPixel", i % 4, Math.floor(i / 4), {
          r: i * 10,
          g: 0,
          b: 0,
          a: 255,
        });
        vi.advanceTimersByTime(50); // well inside the window
      }
      expect(save).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("saves the LATEST project, not the first one queued", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      harness.dispatch("setPixel", 1, 1, BLUE);
      vi.advanceTimersByTime(500);

      expect(save).toHaveBeenCalledTimes(1);
      // The seam now carries the COMPACT wire format; decode to assert.
      const saved = compactToProject(save.mock.calls[0][0]);
      expect(saved.objects[0].frames[0].layers[0].pixels[1][1].color).toEqual(
        BLUE,
      );
    });

    it("edits SEPARATED by more than the window produce separate saves", async () => {
      harness.dispatch("setPixel", 0, 0, RED);
      // `advanceTimersByTimeAsync`, not the sync form: the controller awaits
      // the transport and only releases its in-flight slot afterwards.
      await vi.advanceTimersByTimeAsync(500);
      expect(save).toHaveBeenCalledTimes(1);

      harness.dispatch("setPixel", 1, 1, BLUE);
      await vi.advanceTimersByTimeAsync(500);
      expect(save).toHaveBeenCalledTimes(2);
    });

    it("a save scheduled while one is IN FLIGHT is deferred, not dropped", () => {
      // The controller holds a single in-flight promise; a save requested
      // mid-flight sets the dirty flag and runs once afterwards. Advancing
      // timers synchronously never lets the in-flight promise settle, so the
      // second request is still queued here.
      harness.dispatch("setPixel", 0, 0, RED);
      vi.advanceTimersByTime(500);
      expect(save).toHaveBeenCalledTimes(1);

      harness.dispatch("setPixel", 1, 1, BLUE);
      vi.advanceTimersByTime(500);
      // Still 1: the first save has not resolved, so the second is deferred.
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("passes the current project NAME through to the API", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      vi.advanceTimersByTime(500);
      expect(save.mock.calls[0][1]).toBe(harness.getProjectName());
    });

    it("FLIPPED (task 16): suspension DEFERS a pending edit instead of discarding it", () => {
      // The old `cancelPendingSave()` dropped the queued project outright —
      // the edit was silently lost. Suspension (what the DomainStore flows
      // now set) closes the gate for its duration and the edit saves when it
      // lifts. Strictly less data loss; pinned as the new contract.
      harness.dispatch("setPixel", 0, 0, RED);
      wired.app.session.setSaveSuspended(true);
      vi.advanceTimersByTime(2000);
      expect(save).not.toHaveBeenCalled(); // gate shut: nothing fires

      wired.app.session.setSaveSuspended(false);
      vi.advanceTimersByTime(500);
      expect(save).toHaveBeenCalledTimes(1); // the edit survived the suspend
    });

    it("a whole 50-pixel stroke still coalesces to ONE save", () => {
      harness.dispatch("beginStroke");
      for (let i = 0; i < 50; i++) {
        harness.dispatch("setPixel", i % 4, Math.floor(i / 4) % 4, {
          r: i * 5,
          g: 0,
          b: 0,
          a: 255,
        });
      }
      harness.dispatch("endStroke");
      vi.advanceTimersByTime(500);
      expect(save).toHaveBeenCalledTimes(1);
      expect(harness.getHistoryLength()).toBe(1);
    });
  });

  /* ── every mutating action schedules exactly one save ──────────────────── */

  describe("every mutating action schedules a save", () => {
    const expectsOneSave = (name: string, run: () => void) => {
      it(`${name} schedules exactly one save`, async () => {
        save.mockClear();
        run();
        await vi.advanceTimersByTimeAsync(500);
        expect(save).toHaveBeenCalledTimes(1);
      });
    };

    expectsOneSave("setPixel", () => harness.dispatch("setPixel", 0, 0, RED));
    expectsOneSave("setPixels", () =>
      harness.dispatch("setPixels", [{ x: 1, y: 1, color: BLUE }]),
    );
    expectsOneSave("addLayer", () => harness.dispatch("addLayer", "L2"));
    expectsOneSave("addFrame", () => harness.dispatch("addFrame", "F2"));
    expectsOneSave("setTool", () => harness.dispatch("setTool", "eraser"));
    expectsOneSave("setBrushSize", () => harness.dispatch("setBrushSize", 3));
    expectsOneSave("addPalette", () => harness.dispatch("addPalette", "P2"));
    expectsOneSave("selectLayer", () =>
      harness.dispatch("selectLayer", "layer-1"),
    );

    it("a NO-OP setPixel schedules NO save", () => {
      // The same-colour early return happens BEFORE updateProjectAndSave.
      save.mockClear();
      harness.dispatch("setPixel", 0, 0, 0); // already empty
      vi.advanceTimersByTime(500);
      expect(save).not.toHaveBeenCalled();
    });

    it("saveCurrentStateToHistory does NOT schedule a save (history only)", () => {
      save.mockClear();
      harness.dispatch("saveCurrentStateToHistory");
      vi.advanceTimersByTime(500);
      expect(save).not.toHaveBeenCalled();
      expect(harness.getHistoryLength()).toBe(1);
    });

    it("FLIPPED (task 17): undo schedules NO save — the NEXT real edit does (owner decision 2026-08-16)", async () => {
      // The old stack saved on undo (projectActions.ts:224 called
      // scheduleAutoSave), which made "did the undo persist?" untestable — a
      // replay-triggered save is indistinguishable from an edit-triggered
      // one. Under HistoryStore, `isReplaying` gates both the bridge's
      // domainVersion bump and the auto-save trigger, so the replay commit
      // never counts as an edit.
      harness.dispatch("setPixel", 0, 0, RED);
      await vi.advanceTimersByTimeAsync(500);
      save.mockClear();

      harness.dispatch("undo");
      await vi.advanceTimersByTimeAsync(2000);
      expect(save).not.toHaveBeenCalled();

      // The next REAL edit saves normally.
      harness.dispatch("setPixel", 1, 1, RED);
      await vi.advanceTimersByTimeAsync(500);
      expect(save).toHaveBeenCalledTimes(1);
    });
  });

  /* ── the save-status lifecycle (SessionStore.markSaved) ────────────────── */

  describe("save-status lifecycle", () => {
    it("goes saving -> saved -> idle with a 2 s timeout", async () => {
      expect(harness.getSaveStatus()).toBe("idle");

      harness.dispatch("setPixel", 0, 0, RED);
      await vi.advanceTimersByTimeAsync(500);

      // The controller awaits the transport then marks saved.
      expect(harness.getSaveStatus()).toBe("saved");

      await vi.advanceTimersByTimeAsync(1999);
      expect(harness.getSaveStatus()).toBe("saved");

      await vi.advanceTimersByTimeAsync(1);
      expect(harness.getSaveStatus()).toBe("idle");
    });

    it("FLIPPED (task 16): a failing save retries with BACKOFF, not at 2 Hz forever", async () => {
      // The old loop re-queued instantly on every failure (status flickered
      // 'error' and self-healed invisibly). The controller keeps status
      // 'saving' while a bounded retry chain runs: 500 ms × 2ⁿ, max 6
      // attempts, THEN 'error' (cap pinned in the controller suite).
      let rejected = false;
      save.mockImplementation(async () => {
        if (!rejected) {
          rejected = true;
          throw new Error("network down");
        }
        return { success: true, backupCreated: false };
      });

      harness.dispatch("setPixel", 0, 0, RED);
      await vi.advanceTimersByTimeAsync(500);
      expect(rejected).toBe(true);
      expect(save).toHaveBeenCalledTimes(1);
      // First failure: still retrying, not yet an error.
      expect(harness.getSaveStatus()).toBe("saving");

      // First backoff step is 500 ms; the retry succeeds.
      await vi.advanceTimersByTimeAsync(500);
      expect(save).toHaveBeenCalledTimes(2);
      expect(harness.getSaveStatus()).toBe("saved");
    });

    it("a NEW save while status is 'saved' cancels the pending idle reset", async () => {
      harness.dispatch("setPixel", 0, 0, RED);
      await vi.advanceTimersByTimeAsync(500);
      expect(harness.getSaveStatus()).toBe("saved");

      await vi.advanceTimersByTimeAsync(1000);
      harness.dispatch("setPixel", 1, 1, BLUE);
      await vi.advanceTimersByTimeAsync(500);
      expect(harness.getSaveStatus()).toBe("saved");

      // The FIRST timer fires here but the guard `if (still saved)` holds, so
      // it flips to idle even though a second save just completed. OBSERVED
      // behaviour carried over verbatim into SessionStore.markSaved — the
      // timeouts are GUARDED, not cancelled.
      await vi.advanceTimersByTimeAsync(1000);
      expect(harness.getSaveStatus()).toBe("idle");
    });
  });

  /* ══ FIXED (task 14, defect 1) — the 8 lighting setters auto-save ══ */

  describe("the 8 lighting setters auto-save (fixed by task 14)", () => {
    // WAS BUG, FIXED BY TASK 14: the 8 setters wrote `project` via a raw
    // `set({ project: {...} })` and scheduled NO save. They now route through
    // `updateProjectAndSave` — and under task 16 the fix is STRUCTURAL: any
    // committed project reference bumps `domainVersion`, so no setter can
    // opt out of saving again.
    const setters: Array<[string, unknown[]]> = [
      ["setStudioMode", ["lighting"]],
      ["setLightingDataLayerEditMode", ["height"]],
      ["setSelectedNormal", [{ x: 10, y: 20, z: 200 }]],
      ["setLightDirection", [{ x: -10, y: -20, z: 200 }]],
      ["setLightColor", [{ r: 1, g: 2, b: 3, a: 255 }]],
      ["setAmbientColor", [{ r: 4, g: 5, b: 6, a: 255 }]],
      ["setHeightBrushValue", [77]],
      ["setHeightScale", [55]],
    ];

    it.each(setters)(
      "FIXED: %s mutates the project AND schedules exactly one save",
      (name, args) => {
        save.mockClear();
        const before = JSON.stringify(harness.getUiState());

        harness.dispatch(name as never, ...(args as never[]));

        // The project DID change…
        expect(JSON.stringify(harness.getUiState())).not.toBe(before);
        // …and exactly one save was scheduled through the debounce.
        vi.advanceTimersByTime(499);
        expect(save).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(save).toHaveBeenCalledTimes(1);
      },
    );

    it("DELIBERATE: none of the 8 track history (trackHistory = false)", () => {
      const before = harness.getHistoryLength();
      for (const [name, args] of setters) {
        harness.dispatch(name as never, ...(args as never[]));
      }
      expect(harness.getHistoryLength()).toBe(before);
    });

    it("by CONTRAST, a lighting action that goes through updateProjectAndSave DOES save", () => {
      save.mockClear();
      harness.dispatch("setHeightPixels", [{ x: 0, y: 0, height: 100 }]);
      vi.advanceTimersByTime(500);
      expect(save).toHaveBeenCalledTimes(1);
    });
  });

  /* ══ the renameCurrentProject race (fixed by task 14, hardened by 16) ══ */

  describe("the renameCurrentProject race", () => {
    it("FLIPPED (task 16): nothing lands under the OLD name — and the edit SURVIVES under the new one", async () => {
      // Task 14 fixed the race by cancelling the pending save — the edit was
      // DROPPED. Task 16's suspension covers rename structurally (the flow
      // sets `saveSuspended` for its duration) and the deferred edit saves
      // under the NEW name once the rename completes. The defect being
      // guarded — a write to the pre-rename file — stays impossible.
      const originalName = harness.getProjectName();
      save.mockClear();
      vi.spyOn(projectApi, "rename").mockResolvedValue(undefined);
      vi.spyOn(projectApi, "list").mockResolvedValue([originalName, "renamed"]);

      // Queue a save against the current name…
      harness.dispatch("setPixel", 0, 0, RED);
      // …then rename before the debounce elapses.
      await harness.dispatch("renameCurrentProject", "renamed");
      expect(harness.getProjectName()).toBe("renamed");

      await vi.advanceTimersByTimeAsync(500);

      // THE INVARIANT: no write ever reaches the pre-rename file.
      expect(save.mock.calls.filter((c) => c[1] === originalName)).toHaveLength(
        0,
      );
      // NEW: the queued edit is deferred, not discarded — one save, new name.
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][1]).toBe("renamed");
    });

    it("switchToProject cancels the pending save outright (fresh-load baseline)", async () => {
      save.mockClear();
      vi.spyOn(projectApi, "switchTo").mockResolvedValue(undefined);
      vi.spyOn(projectApi, "get").mockResolvedValue(
        projectToCompact(tinyProject()),
      );

      harness.dispatch("setPixel", 0, 0, RED);
      await harness.dispatch("switchToProject", "other");
      await vi.advanceTimersByTimeAsync(500);

      // The pre-switch edit belonged to the REPLACED project; the fresh
      // install adopts a clean baseline, so nothing is saved — exactly the
      // old `cancelPendingSave()` outcome.
      expect(save).not.toHaveBeenCalled();
    });
  });

  /* ══ FIXED (task 14, defect 2) — the AI modal's history commit ═════════ */

  describe("the AIInterpolateModal history commit (fixed by task 14)", () => {
    it("FIXED: the modal's commit path caps projectHistory at MAX_HISTORY", () => {
      for (let i = 0; i < MAX_HISTORY + 5; i++) {
        const newProject = cloneProject(useEditorStore.getState().project!);
        harness.dispatch("updateProjectAndSave", () => newProject, true);
      }

      expect(harness.getHistoryLength()).toBe(MAX_HISTORY);
      expect(harness.getHistoryIndex()).toBe(MAX_HISTORY - 1);
    });

    it("FIXED: the modal's commit path schedules a save through the store", () => {
      save.mockClear();
      const newProject = cloneProject(useEditorStore.getState().project!);
      harness.dispatch("updateProjectAndSave", () => newProject, true);
      vi.advanceTimersByTime(500);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("by CONTRAST, the store's own path caps at MAX_HISTORY", () => {
      for (let i = 0; i < MAX_HISTORY + 5; i++) {
        harness.dispatch("setPixel", i % 4, Math.floor(i / 4) % 4, {
          r: i % 256,
          g: (i * 7) % 256,
          b: 0,
          a: 255,
        });
      }
      expect(harness.getHistoryLength()).toBe(MAX_HISTORY);
    });
  });
});
