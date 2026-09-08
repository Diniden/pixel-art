/**
 * The MSW handler catalogue (REFRESH task 15) — shared by Vitest (via
 * `src/test/mswServer.ts`, `onUnhandledRequest: "error"`) and Storybook (via
 * `msw-storybook-addon` in `.storybook/preview.tsx`).
 *
 * `handlers` is the happy path. The named scenario factories below let a test
 * or story flip the world into a failure mode: `serverDownHandlers`,
 * `notFoundHandlers`, `slowExportHandlers`, `aiJobFailureHandlers`.
 *
 * Path predicates are origin-less (`/api/...`), so they match both the
 * browser origin (Storybook) and the `http://localhost` fallback the
 * httpClient uses in the Vitest node lane.
 */
import { HttpResponse, delay, http } from "msw";

import {
  fixtureAiConfig,
  fixtureAiHealthOk,
  fixtureBackups,
  fixtureBrushDocument,
  fixtureBrushList,
  fixtureCompactProject,
  fixtureExportResult,
  fixtureFramesJson,
  fixtureJob,
  fixtureJobSubmit,
  fixtureProjectList,
  fixtureServerConfig,
} from "./fixtures";

export const handlers = [
  http.get("*/api/config", () => HttpResponse.json(fixtureServerConfig)),
  http.get("*/api/projects", () =>
    HttpResponse.json({ projects: fixtureProjectList }),
  ),
  http.get("*/api/project", () => HttpResponse.json(fixtureCompactProject())),
  http.post("*/api/project", () =>
    HttpResponse.json({ success: true, backupCreated: false }),
  ),
  http.post("*/api/project/create", async ({ request }) => {
    const body = (await request.json()) as { name?: string };
    return HttpResponse.json({
      success: true,
      projectName: body?.name ?? "unnamed",
    });
  }),
  http.post("*/api/project/rename", () => HttpResponse.json({ success: true })),
  http.delete("*/api/project", () => HttpResponse.json({ success: true })),
  http.post("*/api/project/switch", () => HttpResponse.json({ success: true })),
  // Brush Studio (task 04). `*/api/brush/create` and `*/api/brush/rename` are
  // registered BEFORE the bare `*/api/brush` predicates so nothing can swallow
  // them (MSW matches in array order). `*/api/brush` and `*/api/brushes` are
  // distinct paths.
  http.get("*/api/brushes", () =>
    HttpResponse.json({ brushes: fixtureBrushList }),
  ),
  http.post("*/api/brush/create", async ({ request }) => {
    const body = (await request.json()) as { name?: string };
    const name = body?.name ?? "unnamed";
    if (fixtureBrushList.includes(name)) {
      return HttpResponse.json(
        { error: "Brush already exists" },
        { status: 409 },
      );
    }
    return HttpResponse.json({ success: true, name });
  }),
  http.post("*/api/brush/rename", () => HttpResponse.json({ success: true })),
  http.get("*/api/brush", ({ request }) => {
    const name = new URL(request.url).searchParams.get("name") ?? "";
    if (!fixtureBrushList.includes(name)) {
      return HttpResponse.json(
        { error: "No brush found", name },
        { status: 404 },
      );
    }
    return HttpResponse.json(fixtureBrushDocument());
  }),
  http.post("*/api/brush", () => HttpResponse.json({ success: true })),
  http.delete("*/api/brush", () => HttpResponse.json({ success: true })),
  http.get("*/api/project/backups", () =>
    HttpResponse.json({ backups: fixtureBackups }),
  ),
  http.post("*/api/project/restore-backup", () =>
    HttpResponse.json({ success: true }),
  ),
  http.post("*/api/project/backup", () =>
    HttpResponse.json({ success: true, message: "Backup created" }),
  ),
  http.post("*/api/project/export", () =>
    HttpResponse.json(fixtureExportResult),
  ),
  http.get("*/exports/:kebabName/frames.json", () =>
    HttpResponse.json(fixtureFramesJson),
  ),
  http.get("*/api/ai/config", () => HttpResponse.json(fixtureAiConfig)),
  http.get("*/api/ai/health", () => HttpResponse.json(fixtureAiHealthOk)),
  http.post("*/api/ai/jobs", () => HttpResponse.json(fixtureJobSubmit)),
  http.get("*/api/ai/jobs/:jobId", ({ params }) =>
    HttpResponse.json(fixtureJob("completed", { id: String(params.jobId) })),
  ),
];

/** Every endpoint answers with a network error — the server is unreachable. */
export function serverDownHandlers() {
  return [
    http.all("*/api/*", () => HttpResponse.error()),
    http.all("*/exports/*", () => HttpResponse.error()),
  ];
}

/** The named resources do not exist: 404 with the server's `{error}` shape. */
export function notFoundHandlers() {
  return [
    http.get("*/api/project", () =>
      HttpResponse.json({ error: "No project found" }, { status: 404 }),
    ),
    http.get("*/api/brush", () =>
      HttpResponse.json({ error: "No brush found" }, { status: 404 }),
    ),
    http.get("*/exports/:kebabName/frames.json", () =>
      HttpResponse.json({ error: "Not found" }, { status: 404 }),
    ),
    http.post("*/api/project/restore-backup", () =>
      // Contract fact: the server answers 500 (not 404) for a missing backup.
      HttpResponse.json({ error: "Failed to restore backup" }, { status: 500 }),
    ),
  ];
}

/** The export takes `ms` (default 400 ms) — long enough to show a spinner. */
export function slowExportHandlers(ms = 400) {
  return [
    http.post("*/api/project/export", async () => {
      await delay(ms);
      return HttpResponse.json(fixtureExportResult);
    }),
  ];
}

/** Jobs submit fine, then land in `failed` with a real error message. */
export function aiJobFailureHandlers() {
  return [
    http.post("*/api/ai/jobs", () => HttpResponse.json(fixtureJobSubmit)),
    http.get("*/api/ai/jobs/:jobId", ({ params }) =>
      HttpResponse.json(fixtureJob("failed", { id: String(params.jobId) })),
    ),
  ];
}
