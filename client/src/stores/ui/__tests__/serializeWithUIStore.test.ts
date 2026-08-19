/**
 * END-TO-END R3 PROOF: `DomainStore.serialize()` with the UI provider wired.
 *
 * `persistedUIState.test.ts` pins the BUILDER against `projectToCompact`'s
 * own output. This pins the SEAM: that `ApplicationStore` wires the provider
 * correctly, that `serialize()` merges the two halves without disturbing the
 * domain half, and that the whole payload — domain and UI together — is
 * wire-identical to what the legacy path produced.
 *
 * A builder that is correct in isolation but mis-wired here would still
 * silently overwrite the owner's UI settings on every save, so the two tests
 * are complementary rather than redundant.
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { DomainStore, type ProjectHost } from "@/stores/domain/DomainStore";
import { SessionStore } from "@/stores/session/SessionStore";
import { SelectionMirror } from "@/stores/SelectionMirror";
import { UIStore } from "@/stores/ui/UIStore";
import { tinyProject } from "@/store/__tests__/storeContract";
import { normalToPacked, projectToCompact, rgbaToHex } from "@/types";
import type { Project } from "@/types";

function wired(project: Project) {
  let current: Project | null = project;
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
  const selection = new SelectionMirror();
  const ui = new UIStore({ session, selection });
  const domain = new DomainStore({ session, host });

  runInAction(() => {
    domain.adoptTree(project);
    selection.adopt({
      selectedObjectId: project.uiState.selectedObjectId,
      selectedFrameId: project.uiState.selectedFrameId,
      selectedLayerId: project.uiState.selectedLayerId,
      variantFrameIndices: project.uiState.variantFrameIndices ?? {},
    });
    session.aiServiceUrl = project.uiState.aiServiceUrl ?? null;
    ui.hydrate(project.uiState);
    ui.lighting = {
      studioMode: project.uiState.studioMode,
      lightingDataLayerEditMode: project.uiState.lightingDataLayerEditMode,
      selectedNormal: normalToPacked(project.uiState.selectedNormal),
      lightDirection: normalToPacked(project.uiState.lightDirection),
      lightColor: rgbaToHex(project.uiState.lightColor),
      ambientColor: rgbaToHex(project.uiState.ambientColor),
      heightScale: project.uiState.heightScale,
      heightBrushValue: project.uiState.heightBrushValue,
      normalBrushShape: project.uiState.normalBrushShape,
    };
  });

  // The wiring under test — the same line `ApplicationStore` runs.
  domain.setUIStateProvider(() => ui.toPersistedUIState());
  return { domain, ui, session };
}

describe("R3 — serialize() with the UI provider wired stays wire-identical", () => {
  it("emits the same uiState key set and values as the legacy path", () => {
    const project = tinyProject();
    const { domain } = wired(project);

    const built = domain.serialize()!;
    const legacy = projectToCompact(project);

    expect(Object.keys(built.uiState).sort()).toEqual(
      Object.keys(legacy.uiState).sort(),
    );
    for (const key of Object.keys(legacy.uiState).sort()) {
      const k = key as keyof typeof legacy.uiState;
      expect({ [key]: built.uiState[k] }).toEqual({ [key]: legacy.uiState[k] });
    }
  });

  it("leaves the DOMAIN half untouched", () => {
    const project = tinyProject();
    const { domain } = wired(project);
    const built = domain.serialize()!;
    const legacy = projectToCompact(project);

    expect(JSON.stringify(built.objects)).toBe(JSON.stringify(legacy.objects));
    expect(JSON.stringify(built.palettes)).toBe(
      JSON.stringify(legacy.palettes),
    );
    expect(built.version).toBe(legacy.version);
    expect(built.variants).toEqual(legacy.variants);
  });

  it("a UI edit reaches the payload — the provider is live, not a snapshot", () => {
    const project = tinyProject();
    const { domain, ui } = wired(project);

    runInAction(() => ui.viewport.setZoom(37));
    expect(domain.serialize()!.uiState.zoom).toBe(37);

    runInAction(() => ui.tool.setTool("ellipse"));
    expect(domain.serialize()!.uiState.selectedTool).toBe("ellipse");
  });

  it("without a provider, serialize() falls back to the host's uiState", () => {
    // The pre-task-24 path, kept working so domain-only tests need no UI store.
    const project = tinyProject();
    const { domain } = wired(project);
    domain.setUIStateProvider(null);

    expect(JSON.stringify(domain.serialize())).toBe(
      JSON.stringify(projectToCompact(project)),
    );
  });
});
