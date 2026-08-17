/**
 * SessionStore — anything whose lifetime is the browser tab, not the project
 * (task 14).
 *
 * Five tenants on day one:
 *
 *  1. Persistence health: `saveStatus` / `lastSaveError` / `saveSuspended`.
 *  2. App-level configuration: `aiServiceUrl` / `aiConnection`. SessionStore
 *     is the SINGLE READ SOURCE for the AI endpoint. The value nevertheless
 *     still ROUND-TRIPS to the persisted project file unchanged (owner
 *     decision 2026-08-16) — only the read source lives here; the wire format
 *     does not change.
 *  3-4. Cross-project buffers: `layerClipboard` / `timelineCellClipboard`.
 *  5. User preference trail: `colorHistory` (capped at MAX_COLOR_HISTORY).
 *
 * ── THE CONTRACT (R14): nothing here is reset by a project switch. ─────────
 * The clipboards deliberately OUTLIVE the project — `copyLayerFromObject`
 * exists precisely to move layers between projects, and nothing in
 * `projectActions` clears them today. `UIStore` (task 24) is project-scoped,
 * which is exactly why these fields must NOT live there. This class has no
 * `reset()`, `clear()` or project-switch hook BY CONSTRUCTION; do not add one.
 *
 * ── Observability kinds are load-bearing ───────────────────────────────────
 * Both clipboards contain `PixelData[][]` grids, so they are `observable.ref`
 * — MobX must never see inside a pixel grid (MASTER.md §10 rule 11; the real
 * project has 300,249 cells). `colorHistory` is `observable.shallow`: the
 * array identity is tracked, the ~10 tiny `Color` objects are not proxied.
 */
// MobX 7 renamed the sub-annotations: `observable.ref` → `observableRef`,
// `observable.shallow` → `observableShallow`.
import {
  action,
  computed,
  makeObservable,
  observable,
  observableRef,
  observableShallow,
} from "mobx";
import type { ApiError } from "../../api";
import type {
  LayerClipboard,
  SaveStatus,
  TimelineCellClipboard,
} from "../../store/storeTypes";
import { MAX_COLOR_HISTORY } from "../../store/storeTypes";
import type { Color } from "../../types";

/** AI-service reachability, as last observed. */
export type AiConnectionState = "unknown" | "ok" | "unconfigured" | "error";

export class SessionStore {
  /* ── persistence health (moved from EditorState.saveStatus) ───────────── */
  saveStatus: SaveStatus = "idle";
  // The typed API layer's `ApiError` (task 15): a failed save carries `kind`
  // (network/timeout/server/…) so consumers branch on it, never on message
  // strings. Wired up by task 16's auto-save reaction.
  lastSaveError: ApiError | null = null;
  /** Set during rename/switch/delete flows (wired up by task 16). */
  saveSuspended = false;

  /* ── app-level configuration — the SINGLE READ SOURCE ─────────────────── */
  // Adopted from `compact.uiState.aiServiceUrl` on load (via the bridge in
  // Phase A); still round-trips to the project file unchanged.
  aiServiceUrl: string | null = null;
  aiConnection: AiConnectionState = "unknown";

  /* ── cross-project buffers (MUST survive project switch — R14) ────────── */
  layerClipboard: LayerClipboard | null = null;
  timelineCellClipboard: TimelineCellClipboard | null = null;

  /* ── user preference trail ────────────────────────────────────────────── */
  /** Newest first, capped at MAX_COLOR_HISTORY. Not persisted in task 14. */
  colorHistory: Color[] = [];

  constructor() {
    makeObservable(this, {
      saveStatus: observable,
      lastSaveError: observableRef,
      saveSuspended: observable,
      aiServiceUrl: observable,
      aiConnection: observable,
      // ⚠️ ref, never deep: clipboards carry pixel grids.
      layerClipboard: observableRef,
      timelineCellClipboard: observableRef,
      colorHistory: observableShallow,
      isSaving: computed,
      canPaste: computed,
      setSaveStatus: action,
      setSaveError: action,
      setSaveSuspended: action,
      setAiServiceUrl: action,
      setAiConnection: action,
      setLayerClipboard: action,
      setTimelineCellClipboard: action,
      addToColorHistory: action,
    });
  }

  get isSaving(): boolean {
    return this.saveStatus === "saving";
  }

  get canPaste(): boolean {
    return this.layerClipboard !== null;
  }

  setSaveStatus(status: SaveStatus): void {
    this.saveStatus = status;
  }

  setSaveError(error: ApiError | null): void {
    this.lastSaveError = error;
  }

  setSaveSuspended(suspended: boolean): void {
    this.saveSuspended = suspended;
  }

  setAiServiceUrl(url: string | null): void {
    this.aiServiceUrl = url;
  }

  setAiConnection(state: AiConnectionState): void {
    this.aiConnection = state;
  }

  setLayerClipboard(clipboard: LayerClipboard | null): void {
    this.layerClipboard = clipboard;
  }

  setTimelineCellClipboard(clipboard: TimelineCellClipboard | null): void {
    this.timelineCellClipboard = clipboard;
  }

  /**
   * Newest-first, de-duplicated, capped — the exact semantics of the Zustand
   * `addToColorHistory` in `toolActions.ts`: an existing colour moves to the
   * front; a new one is prepended and the list is trimmed to the cap.
   */
  addToColorHistory(color: Color): void {
    const existingIndex = this.colorHistory.findIndex(
      (c) =>
        c.r === color.r && c.g === color.g && c.b === color.b && c.a === color.a,
    );
    if (existingIndex !== -1) {
      this.colorHistory = [
        color,
        ...this.colorHistory.filter((_, i) => i !== existingIndex),
      ];
    } else {
      this.colorHistory = [color, ...this.colorHistory].slice(
        0,
        MAX_COLOR_HISTORY,
      );
    }
  }
}
