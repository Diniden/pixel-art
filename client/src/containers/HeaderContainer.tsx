/**
 * HeaderContainer — the first observer-driven consumer of the MobX tree
 * (task 14); PURIFIED in task 36 (W27).
 *
 * Reads the two SESSION fields `Header` needs — `saveStatus` (Header is its
 * sole reader) and `aiServiceUrl` — from `SessionStore`. Task 36 moved the
 * rest of the header's store and API access here too.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE AI HEALTH POLL LIVES HERE NOW — AND IT MUST STAY ONE POLL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The 15-second `setInterval` and the two `aiApi` calls were inside `Header`.
 * They are API access, so they cannot follow the component into `ui/`.
 *
 * Both behavioural subtleties are transcribed deliberately:
 *
 *  1. **The health that can lie.** `status === "ok"` with
 *     `remote_configured === false` means the proxy is up but has NO remote
 *     AI service, so every job would fail. That is reported as an ERROR, not
 *     as "Connected". Collapsing this branch is a silent regression: the UI
 *     would show a green light for a service that cannot do any work.
 *  2. **`serverDefaultUrl === null` means UNKNOWN, never a fabricated URL.**
 *     Task 15 stopped the API layer inventing `http://localhost:8100` when
 *     the server is down. A `.catch` that substituted a default here would
 *     put that invented URL back in front of the user as "the server
 *     default".
 *
 * `setAiServiceUrl` still WRITES through the Zustand store (Phase A: Zustand
 * is the source of truth; the bridge mirrors it back into `SessionStore`,
 * which re-renders this container). The 500ms re-poll after a save is
 * transcribed from the component — it gives the write time to round-trip
 * before health is re-checked.
 *
 * ── W29c: three of the four Zustand members migrated; ONE could not ───────
 *
 * `projectName`, `projectList` and `renameCurrentProject` now read/dispatch
 * straight off `DomainStore`. All three were already MobX-owned — the first
 * two are PHASE_B_FIELDS (Zustand held a read-only mirror) and
 * `renameCurrentProject` was a pass-through bridge delegate to
 * `domain.renameProject`. Nothing is duplicated by calling them directly.
 *
 * ── W29d: the fourth member moved too — through a NEW seam ───────────────
 *
 * W29c left `setAiServiceUrl` on Zustand and was right to: the legacy action
 * (`store/toolActions.ts:514`) does not merely set a field, it runs
 * `updateProjectAndSave`, writing `project.uiState.aiServiceUrl` so the value
 * PERSISTS, while `SessionStore.setAiServiceUrl` only assigns the observable —
 * which the next Phase A sync then overwrites from `project.uiState`. A naive
 * swap compiles and silently stops the URL persisting across reloads.
 *
 * W29d built the missing seam rather than performing the naive swap:
 * `ApplicationStore.setAiServiceUrl` writes the Phase A SOURCE and lets the
 * established mirror carry it into `SessionStore`. That is one writer, not
 * two. **This container must call THAT method, never `session.setAiServiceUrl`.**
 *
 * ⚠️ W29d also found and fixed the OTHER half of this blocker, which nothing
 * had measured: `AutoSaveController`'s trigger tuple did not observe
 * `UIStore.persistedUIVersion`, so a MobX-owned UI write bumped the counter
 * and produced ZERO saves. Every UI setting persisted only because a legacy
 * Zustand setter ran `updateProjectAndSave` beside it. See
 * `AutoSaveController`'s header.
 *
 * ⚠️ `aiServiceUrl` REMAINS IN `PHASE_A_FIELDS`. It did NOT flip. Every
 * MobX-side hydration point is still bridge-driven, so an authoritative
 * `session.aiServiceUrl` would never be populated from a loaded project.
 * Task 38 replaces those hydration points when it deletes the bridge; the
 * list move belongs there, in one piece.
 */
import { useState, useEffect, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { isTouchDevice } from "../ui/utils/pointerDevice";
import { flowResult } from "mobx";
import { Header } from "../ui/components/Header/Header";
import type { AiHealthStatus } from "../ui/components/AiConfigPopover/AiConfigPopover";
import { ProjectSelectModalContainer } from "./ProjectSelectModalContainer";
import { BrowseBackupsModalContainer } from "./BrowseBackupsModalContainer";
import { ExportPreviewModalContainer } from "./ExportPreviewModalContainer";
import { useSessionStore, useStores } from "../stores/context";
import { aiApi, exportApi } from "../api";
import {
  applyTheme,
  DEFAULT_THEME,
  loadStoredTheme,
  type ThemeId,
} from "../ui/theme/themes";

export const HeaderContainer = observer(function HeaderContainer() {
  const app = useStores();
  const { domain } = app;
  const session = useSessionStore();
  const aiServiceUrl = session.aiServiceUrl;

  // Phase B — MobX owns these; Zustand only held a mirror (W29c).
  const projectName = domain.projectName;
  const projectList = domain.projectList;

  // ⚠️ W29d: THE LAST ONE MOVED — but read
  // `ApplicationStore.setAiServiceUrl`'s header before touching it. It is NOT
  // `session.setAiServiceUrl`, and the difference is silent data loss: the
  // session setter assigns the observable only, while this one also writes
  // the PHASE A SOURCE (`project.uiState.aiServiceUrl`), which is what makes
  // the URL survive a reload and what stops the next `syncPhaseA` from
  // overwriting it.
  const setAiServiceUrl = (url: string) => app.setAiServiceUrl(url);

  // ══════════════════════════════════════════════════════════════════════
  //  THEME IS PROJECT STATE NOW (owner decision, 2026-08-25)
  // ══════════════════════════════════════════════════════════════════════
  //
  // It used to be a device preference held in `localStorage` and deliberately
  // kept out of `uiState`. The owner reversed that: one theme per project,
  // applied on every device that opens it.
  //
  // `localStorage` survives as a SEED, not as a second source of truth. A
  // project that has never had a theme saved (`layout.theme === null`) shows
  // whatever this device last used, so nobody's existing preference is lost
  // the first time they open a file. The moment the user picks a theme it is
  // written to the project and the project wins from then on.
  //
  // ⚠️ `applyTheme` is what actually paints — it flips `<html data-theme>`.
  // It runs in an EFFECT keyed on the resolved theme rather than only in the
  // change handler, because the theme also changes when a PROJECT LOADS, and
  // no click is involved in that path. Applying it only on click would leave
  // the DOM showing the previous project's theme.
  const layoutStore = app.ui.layout;
  const viewport = app.ui.viewport;
  const deviceTheme = useState(loadStoredTheme)[0];
  const theme: ThemeId = layoutStore.theme ?? deviceTheme ?? DEFAULT_THEME;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleThemeChange = useCallback(
    (next: ThemeId) => {
      // Writes BOTH: the project (the source of truth) and the device seed,
      // so a brand-new project opens in the theme this machine was last using.
      layoutStore.setTheme(next);
      applyTheme(next);
    },
    [layoutStore],
  );

  const [aiHealthStatus, setAiHealthStatus] =
    useState<AiHealthStatus>("unknown");
  const [aiHealthDetail, setAiHealthDetail] = useState<string | null>(null);
  // `null` = the server default is UNKNOWN — never an invented URL.
  const [serverDefaultUrl, setServerDefaultUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    aiApi
      .getConfig(controller.signal)
      .then((cfg) => {
        setServerDefaultUrl(cfg.effectiveAiServiceUrl || null);
      })
      .catch(() => {
        // Explicit unknown state — never a fabricated default.
        setServerDefaultUrl(null);
      });
    return () => controller.abort();
  }, []);

  const pollAiHealth = useCallback(() => {
    const url = aiServiceUrl || undefined;
    aiApi
      .health(url)
      .then((result) => {
        if (result.status === "ok" && result.remote_configured === false) {
          // The health that can lie — see the note above.
          setAiHealthStatus("error");
          setAiHealthDetail(
            "AI proxy is running but no remote service is configured (AI_REMOTE_URL unset)",
          );
        } else if (result.status === "ok") {
          setAiHealthStatus("ok");
          setAiHealthDetail(null);
        } else {
          setAiHealthStatus("error");
          setAiHealthDetail(result.detail || "AI service is not reachable");
        }
      })
      .catch((err: unknown) => {
        // A THROW here means the Express server itself is unreachable
        // (health always answers HTTP 200 when the server is up).
        setAiHealthStatus("error");
        setAiHealthDetail(
          err instanceof Error ? err.message : "Cannot reach the server",
        );
      });
  }, [aiServiceUrl]);

  useEffect(() => {
    pollAiHealth();
    const interval = setInterval(pollAiHealth, 15_000);
    return () => clearInterval(interval);
  }, [pollAiHealth]);

  return (
    <Header
      saveStatus={session.saveStatus}
      saveErrorDetail={session.lastSaveError?.message ?? null}
      saveSuspended={session.saveSuspended}
      aiServiceUrl={aiServiceUrl}
      projectName={projectName}
      projectList={projectList}
      onRenameProject={(name) => flowResult(domain.renameProject(name))}
      aiHealthStatus={aiHealthStatus}
      aiHealthDetail={aiHealthDetail}
      serverDefaultUrl={serverDefaultUrl}
      onSaveAiServiceUrl={(url) => {
        setAiServiceUrl(url);
        // Give the write time to round-trip before re-checking health.
        setTimeout(pollAiHealth, 500);
      }}
      theme={theme}
      onThemeChange={handleThemeChange}
      /* Pencil-only input (2026-08-31).

         ⚠️ THE DEVICE DECIDES TWO THINGS HERE, and the store deliberately
         decides neither. Whether the button exists at all (`isTouchDevice`),
         and what the toggle means when the project file says nothing —
         `pencilOnly` is tri-state on the wire, so `?? isTouchDevice()`
         resolves it. Storing a `true` default instead would switch the mode on
         for a mouse-only desktop, where no contact ever reports as a stylus
         and drawing would stop working entirely. */
      showPencilOnly={isTouchDevice()}
      pencilOnly={viewport.pencilOnly ?? isTouchDevice()}
      onTogglePencilOnly={() =>
        viewport.setPencilOnly(!(viewport.pencilOnly ?? isTouchDevice()))
      }
      layoutMode={layoutStore.layoutMode}
      onToggleLayoutMode={() => layoutStore.toggleLayoutMode()}
      onExport={() => exportApi.run(projectName)}
      projectModal={(props) => <ProjectSelectModalContainer {...props} />}
      backupsModal={(props) => <BrowseBackupsModalContainer {...props} />}
      exportPreviewModal={(props) => <ExportPreviewModalContainer {...props} />}
    />
  );
});
