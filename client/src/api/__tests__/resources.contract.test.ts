/**
 * Contract tests (REFRESH task 15, step 9): every `__mocks__/fixtures.ts`
 * payload runs through its resource method and the shape is asserted. Because
 * the resources are the real production modules and MSW intercepts at the
 * network boundary, URL construction and error mapping are under test too —
 * no per-module stubbing anywhere.
 */
import { describe, expect, it } from "vitest";
import { HttpResponse, http } from "msw";

import { server } from "@test/mswServer";
import {
  aiApi,
  backupApi,
  configApi,
  exportApi,
  isKind,
  projectApi,
} from "@/api";
import {
  FIXTURE_PROJECT_NAME,
  fixtureBackups,
  fixtureCompactProject,
  fixtureExportResult,
  fixtureFramesJson,
  fixtureJob,
  fixtureProjectList,
} from "@api/__mocks__/fixtures";
import {
  aiJobFailureHandlers,
  notFoundHandlers,
  serverDownHandlers,
} from "@api/__mocks__/handlers";

describe("configApi", () => {
  it("get() returns the server config", async () => {
    await expect(configApi.get()).resolves.toEqual({
      currentProject: FIXTURE_PROJECT_NAME,
    });
  });
});

describe("projectApi", () => {
  it("list() unwraps {projects}", async () => {
    await expect(projectApi.list()).resolves.toEqual(fixtureProjectList);
  });

  it("get() returns the RAW CompactProject byte-for-byte — no migration, no defaulting", async () => {
    const raw = fixtureCompactProject();
    server.use(http.get("*/api/project", () => HttpResponse.json(raw)));
    await expect(projectApi.get()).resolves.toEqual(raw);
  });

  it("get() throws kind 'notFound' instead of inventing a project (R5, first half)", async () => {
    server.use(...notFoundHandlers());
    const err = await projectApi.get("Missing").then(
      () => null,
      (e: unknown) => e,
    );
    expect(isKind(err, "notFound")).toBe(true);
  });

  it("get() throws kind 'network' when the server is down (R5, first half)", async () => {
    server.use(...serverDownHandlers());
    const err = await projectApi.get().then(
      () => null,
      (e: unknown) => e,
    );
    expect(isKind(err, "network")).toBe(true);
  });

  it("save() surfaces backupCreated instead of discarding the body", async () => {
    await expect(
      projectApi.save(fixtureCompactProject(), FIXTURE_PROJECT_NAME),
    ).resolves.toEqual({ success: true, backupCreated: false });
  });

  it("create() returns the server-confirmed name; a duplicate is kind 'conflict'", async () => {
    await expect(projectApi.create("New Thing")).resolves.toEqual({
      success: true,
      projectName: "New Thing",
    });
    server.use(
      http.post("*/api/project/create", () =>
        HttpResponse.json({ error: "Project already exists" }, { status: 409 }),
      ),
    );
    const err = await projectApi.create("New Thing").then(
      () => null,
      (e: unknown) => e,
    );
    expect(isKind(err, "conflict")).toBe(true);
  });

  it("rename(), remove(), switchTo() resolve void on success", async () => {
    await expect(projectApi.rename("a", "b")).resolves.toBeUndefined();
    await expect(projectApi.remove("a")).resolves.toBeUndefined();
    await expect(projectApi.switchTo("b")).resolves.toBeUndefined();
  });
});

describe("backupApi", () => {
  it("list() unwraps {backups}", async () => {
    await expect(backupApi.list(FIXTURE_PROJECT_NAME)).resolves.toEqual(
      fixtureBackups,
    );
  });

  it("list() THROWS when the server is down — never a fabricated empty list", async () => {
    server.use(...serverDownHandlers());
    const err = await backupApi.list().then(
      () => null,
      (e: unknown) => e,
    );
    expect(isKind(err, "network")).toBe(true);
  });

  it("restore() maps the server's 500-for-missing-backup as kind 'server' (contract fact — no invented 404)", async () => {
    server.use(...notFoundHandlers());
    const err = await backupApi.restore("01-01-2026", "nope.json").then(
      () => null,
      (e: unknown) => e,
    );
    expect(isKind(err, "server")).toBe(true);
  });

  it("createMigrationBackup() POSTs the project and returns the message", async () => {
    await expect(
      backupApi.createMigrationBackup(fixtureCompactProject()),
    ).resolves.toEqual({ success: true, message: "Backup created" });
  });
});

describe("exportApi", () => {
  it("run() returns the full export result (path retained — Header shows it)", async () => {
    await expect(exportApi.run(FIXTURE_PROJECT_NAME)).resolves.toEqual(
      fixtureExportResult,
    );
  });

  it("fetchFramesJson() reads the static /exports tree outside /api", async () => {
    await expect(exportApi.fetchFramesJson("base-unit")).resolves.toEqual(
      fixtureFramesJson,
    );
  });
});

describe("aiApi", () => {
  it("getConfig() returns the effective URL — and THROWS when the server is down instead of inventing localhost:8100", async () => {
    await expect(aiApi.getConfig()).resolves.toMatchObject({
      effectiveAiServiceUrl: "http://localhost:8100",
    });
    server.use(...serverDownHandlers());
    const err = await aiApi.getConfig().then(
      () => null,
      (e: unknown) => e,
    );
    expect(isKind(err, "network")).toBe(true);
  });

  it("health() surfaces remote_configured (the health that can lie)", async () => {
    await expect(aiApi.health()).resolves.toMatchObject({
      status: "ok",
      remote_configured: true,
    });
  });

  it("submitJob() maps the input to the wire body with defaults", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post("*/api/ai/jobs", async ({ request: req }) => {
        body = (await req.json()) as Record<string, unknown>;
        return HttpResponse.json({ job_id: "job-9", status: "queued" });
      }),
    );
    const result = await aiApi.submitJob({
      frameStartBase64: "AAAA",
      frameEndBase64: "BBBB",
      numFrames: 3,
    });
    expect(result.job_id).toBe("job-9");
    expect(body).toEqual({
      frame_start: "AAAA",
      frame_end: "BBBB",
      num_frames: 3,
      scale: 4,
      flow_scale: 1,
    });
  });

  it("getJob() returns the job payload", async () => {
    await expect(aiApi.getJob("job-1")).resolves.toEqual(
      fixtureJob("completed"),
    );
  });

  describe("pollJob", () => {
    const controller = () => new AbortController();

    it("polls until 'completed', reporting every observed status", async () => {
      let call = 0;
      server.use(
        http.get("*/api/ai/jobs/:jobId", () => {
          call += 1;
          return HttpResponse.json(
            fixtureJob(call < 3 ? "processing" : "completed"),
          );
        }),
      );
      const seen: string[] = [];
      const job = await aiApi.pollJob("job-1", {
        signal: controller().signal,
        pollIntervalMs: 5,
        onStatus: (j) => seen.push(j.status),
      });
      expect(job.status).toBe("completed");
      expect(seen).toEqual(["processing", "processing", "completed"]);
    });

    it("returns a 'failed' job for the CALLER to interpret — no throw, no invention", async () => {
      server.use(...aiJobFailureHandlers());
      const job = await aiApi.pollJob("job-1", {
        signal: controller().signal,
        pollIntervalMs: 5,
      });
      expect(job.status).toBe("failed");
      expect(job.error).toBe("CUDA out of memory");
    });

    it("aborting the REQUIRED signal stops the loop with an unwrapped AbortError", async () => {
      server.use(
        http.get("*/api/ai/jobs/:jobId", () =>
          HttpResponse.json(fixtureJob("processing")),
        ),
      );
      const c = controller();
      const pending = aiApi.pollJob("job-1", {
        signal: c.signal,
        pollIntervalMs: 50,
      });
      setTimeout(() => c.abort(), 20);
      const err = await pending.then(
        () => null,
        (e: unknown) => e,
      );
      expect((err as Error).name).toBe("AbortError");
      expect(isKind(err, "timeout")).toBe(false);
    });

    it("a job stuck in 'processing' hits the deadline as kind 'timeout' — the old while(true) is unrepresentable", async () => {
      server.use(
        http.get("*/api/ai/jobs/:jobId", () =>
          HttpResponse.json(fixtureJob("processing")),
        ),
      );
      const err = await aiApi
        .pollJob("job-1", {
          signal: controller().signal,
          pollIntervalMs: 5,
          maxWaitMs: 30,
        })
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(isKind(err, "timeout")).toBe(true);
    });
  });
});
