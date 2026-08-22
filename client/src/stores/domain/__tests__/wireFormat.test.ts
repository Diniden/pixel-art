/**
 * The wire-format guard for task 23's tree migration.
 *
 * The pivot moved `version`/`objects`/`palettes`/`variants`/`referenceImage`
 * into MobX, so `serialize()` now rebuilds its `Project` from observable
 * members rather than reading one plain object out of Zustand. **The saved
 * bytes must not change** — that file is 1.1 MB of the owner's real work.
 *
 * Two things could have broken it, both checked here:
 *  1. `objects`/`palettes` are observable ARRAYS, not `Array` instances.
 *     `projectToCompact` maps over them and `JSON.stringify` walks them, so
 *     this pins that both still emit real JSON arrays.
 *  2. `variants: []` must round-trip as `undefined`, NOT `[]` — task 07's R1
 *     pinned that the load path drops an empty variants array, and
 *     `projectToCompact` omits a falsy one. Emitting `[]` would change the
 *     bytes for every project without variants.
 */
import { describe, it, expect } from "vitest";
import { runInAction } from "mobx";
import { DomainStore, type ProjectHost } from "@/stores/domain/DomainStore";
import { SessionStore } from "@/stores/session/SessionStore";
import { tinyProject } from "@/store/__tests__/storeContract";
import { projectToCompact } from "@/types";
import type { Project } from "@/types";

describe("wire format is byte-identical through the MobX tree", () => {
  it("serialize() equals projectToCompact(originalProject)", () => {
    const project: Project = tinyProject();
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
    const domain = new DomainStore({ session: new SessionStore(), host });
    runInAction(() => domain.adoptTree(project));

    const viaStore = domain.serialize();
    const direct = projectToCompact(project);
    expect(JSON.stringify(viaStore)).toBe(JSON.stringify(direct));
    expect(Array.isArray(viaStore!.objects)).toBe(true);
    expect(Array.isArray(viaStore!.palettes)).toBe(true);
  });

  it("empty variants round-trips as undefined, not []", () => {
    const project: Project = { ...tinyProject(), variants: [] };
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
    const domain = new DomainStore({ session: new SessionStore(), host });
    runInAction(() => domain.adoptTree(project));
    expect(JSON.stringify(domain.serialize())).toBe(
      JSON.stringify(projectToCompact(project)),
    );
  });
});
