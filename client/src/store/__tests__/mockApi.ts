/**
 * The `services/api` stub every store behaviour test installs.
 *
 * The store imports `services/autoSave`, which imports `services/api`. Nothing
 * in this suite should ever touch the network, and `performSave` re-queues on a
 * rejected `saveProject` (autoSave.ts:29-34), so an unmocked failure would spin.
 *
 * ⚠️ Lives HERE, inside `store/__tests__/`, rather than in a
 * `src/services/__mocks__/` directory: that path is owned by task 07, which is
 * running in parallel on this same branch. `vi.mock` factories are hoisted above
 * imports, so each test file calls this from inside its own factory closure.
 */
import { vi } from "vitest";

export function apiMockFactory() {
  return {
    API_BASE: "/api",
    getConfig: vi.fn(async () => ({ currentProject: "test" })),
    listProjects: vi.fn(async () => ["test"]),
    loadProject: vi.fn(async () => {
      throw new Error("api mock: loadProject was not stubbed for this test");
    }),
    saveProject: vi.fn(async () => undefined),
    createProject: vi.fn(async () => undefined),
    renameProject: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
    switchProject: vi.fn(async () => undefined),
    listBackups: vi.fn(async () => []),
    restoreBackup: vi.fn(async () => undefined),
    exportProject: vi.fn(async () => undefined),
  };
}
