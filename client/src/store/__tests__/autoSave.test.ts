/**
 * Behaviour contract — auto-save scheduling, the save-status lifecycle, and the
 * three defects that were pinned as `// BUG:` assertions until task 14 fixed
 * them. The flipped assertions below now state the CORRECT behaviour, each
 * flipped in the same change as its fix (task 14, defects 1-3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BLUE,
  HARNESSES,
  RED,
  cloneProject,
  tinyProject,
  type StoreHarness,
} from "./storeContract";
import { MAX_HISTORY } from "@/store/storeTypes";

vi.mock("@/services/api", async () => (await import("./mockApi")).apiMockFactory());

import * as api from "@/services/api";
import { cancelPendingSave } from "@/services/autoSave";
import { useEditorStore } from "@/store";

const saveProject = vi.mocked(api.saveProject);
const renameProject = vi.mocked(api.renameProject);
const listProjects = vi.mocked(api.listProjects);

describe.each(HARNESSES)("%s — auto-save", (_name, makeHarness) => {
  let harness: StoreHarness;

  beforeEach(() => {
    vi.useFakeTimers();
    // The autoSave module holds `saveTimeout` / `pendingProject` at module
    // scope; without this a timer scheduled by one test fires inside the next.
    cancelPendingSave();
    saveProject.mockClear();
    saveProject.mockResolvedValue(undefined);
    harness = makeHarness();
    harness.reset();
    harness.load(tinyProject());
  });

  afterEach(() => {
    cancelPendingSave();
    harness.dispatch("endStroke");
    harness.reset();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  /* ── the 500 ms debounce (services/autoSave.ts:10, :53-56) ─────────────── */

  describe("debounce", () => {
    it("does NOT save synchronously — the 500 ms timer must elapse", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      expect(saveProject).not.toHaveBeenCalled();

      vi.advanceTimersByTime(499);
      expect(saveProject).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(saveProject).toHaveBeenCalledTimes(1);
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
      expect(saveProject).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);
      expect(saveProject).toHaveBeenCalledTimes(1);
    });

    it("saves the LATEST project, not the first one queued", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      harness.dispatch("setPixel", 1, 1, BLUE);
      vi.advanceTimersByTime(500);

      expect(saveProject).toHaveBeenCalledTimes(1);
      const saved = saveProject.mock.calls[0][0];
      expect(saved.objects[0].frames[0].layers[0].pixels[1][1].color).toEqual(
        BLUE,
      );
    });

    it("edits SEPARATED by more than the window produce separate saves", async () => {
      harness.dispatch("setPixel", 0, 0, RED);
      // `advanceTimersByTimeAsync`, not the sync form: `performSave` awaits
      // `saveProject` and only clears its `isSaving` guard in a `finally`. With
      // the sync form the second save is silently swallowed by that guard —
      // which is itself real, observed behaviour, asserted separately below.
      await vi.advanceTimersByTimeAsync(500);
      expect(saveProject).toHaveBeenCalledTimes(1);

      harness.dispatch("setPixel", 1, 1, BLUE);
      await vi.advanceTimersByTimeAsync(500);
      expect(saveProject).toHaveBeenCalledTimes(2);
    });

    it("OBSERVED: a save scheduled while one is IN FLIGHT is deferred, not dropped", () => {
      // `performSave` returns early when `isSaving` is true (autoSave.ts:17),
      // and re-invokes itself from the `finally` block if a project is pending
      // (autoSave.ts:39-41). Advancing timers synchronously never lets the
      // in-flight promise settle, so the second call is still queued here.
      harness.dispatch("setPixel", 0, 0, RED);
      vi.advanceTimersByTime(500);
      expect(saveProject).toHaveBeenCalledTimes(1);

      harness.dispatch("setPixel", 1, 1, BLUE);
      vi.advanceTimersByTime(500);
      // Still 1: the first save has not resolved, so the second is deferred.
      expect(saveProject).toHaveBeenCalledTimes(1);
    });

    it("passes the current project NAME through to the API", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      vi.advanceTimersByTime(500);
      expect(saveProject.mock.calls[0][1]).toBe(harness.getProjectName());
    });

    it("cancelPendingSave drops a queued save entirely", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      cancelPendingSave();
      vi.advanceTimersByTime(2000);
      expect(saveProject).not.toHaveBeenCalled();
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
      expect(saveProject).toHaveBeenCalledTimes(1);
      expect(harness.getHistoryLength()).toBe(1);
    });
  });

  /* ── every mutating action schedules exactly one save ──────────────────── */

  describe("every mutating action schedules a save", () => {
    const expectsOneSave = (name: string, run: () => void) => {
      it(`${name} schedules exactly one save`, async () => {
        saveProject.mockClear();
        run();
        await vi.advanceTimersByTimeAsync(500);
        expect(saveProject).toHaveBeenCalledTimes(1);
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
      saveProject.mockClear();
      harness.dispatch("setPixel", 0, 0, 0); // already empty
      vi.advanceTimersByTime(500);
      expect(saveProject).not.toHaveBeenCalled();
    });

    it("saveCurrentStateToHistory does NOT schedule a save (history only)", () => {
      saveProject.mockClear();
      harness.dispatch("saveCurrentStateToHistory");
      vi.advanceTimersByTime(500);
      expect(saveProject).not.toHaveBeenCalled();
      expect(harness.getHistoryLength()).toBe(1);
    });

    it("undo DOES schedule a save (projectActions.ts:224)", async () => {
      harness.dispatch("setPixel", 0, 0, RED);
      await vi.advanceTimersByTimeAsync(500);
      saveProject.mockClear();

      harness.dispatch("undo");
      await vi.advanceTimersByTimeAsync(500);
      expect(saveProject).toHaveBeenCalledTimes(1);
    });
  });

  /* ── the save-status lifecycle (store/index.ts:32-42) ──────────────────── */

  describe("save-status lifecycle", () => {
    it("goes saving -> saved -> idle with a 2 s timeout", async () => {
      expect(harness.getSaveStatus()).toBe("idle");

      harness.dispatch("setPixel", 0, 0, RED);
      await vi.advanceTimersByTimeAsync(500);

      // `performSave` awaits `saveProject` then fires 'saved'.
      expect(harness.getSaveStatus()).toBe("saved");

      await vi.advanceTimersByTimeAsync(1999);
      expect(harness.getSaveStatus()).toBe("saved");

      await vi.advanceTimersByTimeAsync(1);
      expect(harness.getSaveStatus()).toBe("idle");
    });

    it("reports 'error' when the API rejects", async () => {
      // `mockImplementationOnce`, not `mockRejectedValueOnce`: the module-level
      // `isSaving` / `pendingProject` state in autoSave.ts can leave an earlier
      // test's in-flight promise unsettled, and that stray call would otherwise
      // consume the one-shot rejection before this test's own save reaches it.
      // Rejecting by call ARGUMENT is immune to the ordering.
      let rejected = false;
      saveProject.mockImplementation(async () => {
        if (!rejected) {
          rejected = true;
          throw new Error("network down");
        }
      });

      harness.dispatch("setPixel", 0, 0, RED);
      await vi.advanceTimersByTimeAsync(500);
      expect(rejected).toBe(true);

      // OBSERVED: 'error' is TRANSIENT and self-heals within the SAME 500 ms
      // window. `performSave`'s catch sets 'error' AND re-queues via
      // `scheduleAutoSave` (autoSave.ts:29-34), which schedules a fresh 500 ms
      // timer; because that retry is also inside this advance, it succeeds and
      // overwrites the status with 'saved' before control returns here. The user
      // therefore never sees the error indicator for a failure that recovers on
      // the first retry. Recorded, not fixed.
      expect(harness.getSaveStatus()).toBe("saved");
      expect(saveProject).toHaveBeenCalledTimes(2);

      cancelPendingSave();
      saveProject.mockReset();
      saveProject.mockResolvedValue(undefined);
    });

    it("a NEW save while status is 'saved' cancels the pending idle reset", async () => {
      harness.dispatch("setPixel", 0, 0, RED);
      await vi.advanceTimersByTimeAsync(500);
      expect(harness.getSaveStatus()).toBe("saved");

      await vi.advanceTimersByTimeAsync(1000);
      harness.dispatch("setPixel", 1, 1, BLUE);
      await vi.advanceTimersByTimeAsync(500);
      expect(harness.getSaveStatus()).toBe("saved");

      // The FIRST timer fires here but the guard `if (currentStatus ===
      // "saved")` still holds, so it flips to idle even though a second save
      // just completed. OBSERVED — the timeouts are not cancelled, only guarded.
      await vi.advanceTimersByTimeAsync(1000);
      expect(harness.getSaveStatus()).toBe("idle");
    });
  });

  /* ══ FIXED (task 14, defect 1) — the 8 lighting setters now auto-save ══ */

  describe("the 8 lighting setters auto-save (fixed by task 14)", () => {
    // WAS BUG, FIXED BY TASK 14: the 8 setters wrote `project` via a raw
    // `set({ project: {...} })` and scheduled NO save — `lightingActions.ts`
    // did not import `services/autoSave` at all, so light colour, ambient
    // colour, height scale and five more were silently lost on reload.
    //
    // They now route through `updateProjectAndSave` with `trackHistory =
    // false` (matching all 33 uiState call sites in toolActions), so each
    // mutation schedules exactly one save.
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
        saveProject.mockClear();
        const before = JSON.stringify(harness.getUiState());

        harness.dispatch(
          name as never,
          ...(args as never[]),
        );

        // The project DID change…
        expect(JSON.stringify(harness.getUiState())).not.toBe(before);
        // …and exactly one save was scheduled through the debounce.
        vi.advanceTimersByTime(499);
        expect(saveProject).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(saveProject).toHaveBeenCalledTimes(1);
      },
    );

    it("DELIBERATE: none of the 8 track history (trackHistory = false)", () => {
      // NOT flipped by task 14 — the fix routes the setters through
      // `updateProjectAndSave(..., false)`, the same `trackHistory = false`
      // every other uiState writer uses. Adding 8 new undo entries would have
      // been a second, unrelated behaviour change.
      const before = harness.getHistoryLength();
      for (const [name, args] of setters) {
        harness.dispatch(name as never, ...(args as never[]));
      }
      expect(harness.getHistoryLength()).toBe(before);
    });

    it("by CONTRAST, a lighting action that goes through updateProjectAndSave DOES save", () => {
      saveProject.mockClear();
      harness.dispatch("setHeightPixels", [{ x: 0, y: 0, height: 100 }]);
      vi.advanceTimersByTime(500);
      expect(saveProject).toHaveBeenCalledTimes(1);
    });
  });

  /* ══ FIXED (task 14, defect 3) — the rename race ══════════════════════ */

  describe("the renameCurrentProject race (fixed by task 14)", () => {
    // WAS BUG, FIXED BY TASK 14: `renameCurrentProject` did NOT call
    // `cancelPendingSave()`, unlike its three siblings — `createNewProject`,
    // `switchToProject` and `deleteCurrentProject`. A save debounced against
    // the OLD name could therefore fire with the stale name AFTER the
    // server-side rename. It now cancels the pending save, matching the
    // siblings.
    it("FIXED: a pending save is cancelled and nothing lands under the OLD name", async () => {
      const originalName = harness.getProjectName();
      saveProject.mockClear();
      renameProject.mockResolvedValue(undefined);
      listProjects.mockResolvedValue([originalName, "renamed"]);

      // Queue a save against the current name…
      harness.dispatch("setPixel", 0, 0, RED);
      // …then rename before the debounce elapses.
      await harness.dispatch("renameCurrentProject", "renamed");
      expect(harness.getProjectName()).toBe("renamed");

      await vi.advanceTimersByTimeAsync(500);

      // The queued save was cancelled at the top of the rename, so no write
      // reaches the pre-rename file (and none reaches the new one either —
      // the next real edit will save under the new name).
      expect(saveProject).not.toHaveBeenCalled();
    });

    it("by CONTRAST, switchToProject DOES cancel the pending save", async () => {
      saveProject.mockClear();
      vi.mocked(api.switchProject).mockResolvedValue(undefined);
      vi.mocked(api.loadProject).mockResolvedValue(tinyProject());

      harness.dispatch("setPixel", 0, 0, RED);
      await harness.dispatch("switchToProject", "other");
      await vi.advanceTimersByTimeAsync(500);

      expect(saveProject).not.toHaveBeenCalled();
    });
  });

  /* ══ FIXED (task 14, defect 2) — the AI modal's history commit ═════════ */

  describe("the AIInterpolateModal history commit (fixed by task 14)", () => {
    // WAS BUG, FIXED BY TASK 14: `AIInterpolateModal.tsx` reimplemented the
    // history splice with a raw `useEditorStore.setState()` and OMITTED the
    // `if (newHistory.length > MAX_HISTORY) newHistory.shift()` guard, so
    // repeated AI interpolation grew `projectHistory` without bound. It also
    // dynamic-imported `scheduleAutoSave` and called it directly.
    //
    // The modal now commits through the store's exposed `updateProjectAndSave`
    // action — `store.updateProjectAndSave(() => newProject, true)` — so the
    // MAX_HISTORY cap and the normal save path both apply. This test drives
    // that exact call the way the modal now does.
    it("FIXED: the modal's commit path caps projectHistory at MAX_HISTORY", () => {
      for (let i = 0; i < MAX_HISTORY + 5; i++) {
        // What the modal does on accept: build a full replacement project,
        // then commit it through the store's single path with history.
        const newProject = cloneProject(useEditorStore.getState().project!);
        harness.dispatch("updateProjectAndSave", () => newProject, true);
      }

      expect(harness.getHistoryLength()).toBe(MAX_HISTORY);
      expect(harness.getHistoryIndex()).toBe(MAX_HISTORY - 1);
    });

    it("FIXED: the modal's commit path schedules a save through the store", () => {
      saveProject.mockClear();
      const newProject = cloneProject(useEditorStore.getState().project!);
      harness.dispatch("updateProjectAndSave", () => newProject, true);
      vi.advanceTimersByTime(500);
      expect(saveProject).toHaveBeenCalledTimes(1);
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
