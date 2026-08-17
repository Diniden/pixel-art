/**
 * Canned payloads for the MSW handler catalogue (REFRESH task 15).
 *
 * Shared by Vitest (contract tests) and Storybook (story parameters), so this
 * module must stay BROWSER-SAFE: no node imports, no test-framework imports.
 * Payload shapes mirror what the Express server actually sends (verified
 * against `server/src/routes/*.ts` and `server/src/export/exportRouter.ts`).
 */
import type { CompactProject } from "../../types";
import type { BackupEntry } from "../resources/backupApi";
import type {
  AiConfigResult,
  AiHealthResult,
  JobStatusResult,
  JobSubmitResult,
} from "../resources/aiApi";
import type { ExportRunResult } from "../resources/exportApi";
import type { ServerConfig } from "../resources/configApi";

export const FIXTURE_PROJECT_NAME = "Base Unit";

export const fixtureServerConfig: ServerConfig = {
  currentProject: FIXTURE_PROJECT_NAME,
};

export const fixtureProjectList: string[] = [FIXTURE_PROJECT_NAME, "Scratch"];

/**
 * A minimal MODERN compact project: `[colorHex, normalPacked, height]` pixel
 * tuples, project-level `variants` — nothing for the migration chain to do.
 */
export function fixtureCompactProject(): CompactProject {
  return {
    version: "1.1.0",
    objects: [
      {
        id: "o1",
        name: "Object 1",
        gridSize: { width: 2, height: 2 },
        frames: [
          {
            id: "o1-f0",
            name: "Frame 0",
            layers: [
              {
                id: "o1-f0-l0",
                name: "Layer 1",
                visible: true,
                pixels: [
                  [0, [0xff_00_00_ff, 0, 1]],
                  [[0x00_ff_00_ff, 0, 1], 0],
                ] as CompactProject["objects"][0]["frames"][0]["layers"][0]["pixels"],
              },
            ],
          },
        ],
      },
    ],
    palettes: [{ id: "pal", name: "Palette", colors: [0x00_00_00_ff] }],
    uiState: {
      selectedObjectId: "o1",
      selectedFrameId: "o1-f0",
      selectedLayerId: "o1-f0-l0",
      selectedTool: "pixel",
      selectedColor: 0x00_00_00_ff,
      brushSize: 1,
      bitDepth: 8,
      shapeMode: "both",
      borderRadius: 0,
      zoom: 10,
      panOffset: { x: 0, y: 0 },
      moveAllLayers: false,
      studioMode: "pixel",
      selectedNormal: 0x80_80_ff,
      lightDirection: 0x40_40_b4,
      lightColor: 0xff_fa_f0_ff,
      ambientColor: 0x28_2d_3c_ff,
    },
    variants: [],
  };
}

export const fixtureBackups: BackupEntry[] = [
  { date: "08-15-2026", time: "10-30-00", filename: "backup-1.json" },
  { date: "08-15-2026", time: "14-45-10", filename: "backup-2.json" },
  { date: "08-16-2026", time: "09-00-05", filename: "backup-3.json" },
];

export const fixtureExportResult: ExportRunResult = {
  success: true,
  path: "/srv/exports/base-unit",
  kebabName: "base-unit",
  frameCount: 54,
  textureCount: 214,
  bytes: 72_893,
};

/** Whatever `frames.json` holds; the API layer passes it through untyped. */
export const fixtureFramesJson = {
  version: 1,
  data: { objects: [] as unknown[] },
};

export const fixtureAiConfig: AiConfigResult = {
  aiServiceUrl: "",
  envAiServiceUrl: "",
  effectiveAiServiceUrl: "http://localhost:8100",
};

export const fixtureAiHealthOk: AiHealthResult = {
  status: "ok",
  mode: "proxy",
  remote_configured: true,
};

/** The lying health: proxy up, remote unconfigured — every job will fail. */
export const fixtureAiHealthUnconfigured: AiHealthResult = {
  status: "ok",
  mode: "proxy",
  remote_configured: false,
};

export const fixtureJobSubmit: JobSubmitResult = {
  job_id: "job-1",
  status: "queued",
};

export function fixtureJob(
  status: JobStatusResult["status"],
  overrides: Partial<JobStatusResult> = {},
): JobStatusResult {
  return {
    id: "job-1",
    status,
    num_frames: 3,
    scale: 4,
    flow_scale: 1,
    created_at: 1_755_300_000,
    completed_at: status === "completed" ? 1_755_300_060 : null,
    error: status === "failed" ? "CUDA out of memory" : null,
    output_count: status === "completed" ? 3 : 0,
    frames:
      status === "completed" ? ["ZnJhbWUx", "ZnJhbWUy", "ZnJhbWUz"] : undefined,
    ...overrides,
  };
}
