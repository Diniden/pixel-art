/**
 * useInterpolationJob — health check, job submission and bounded polling for
 * the AI interpolation flow (REFRESH task 34).
 *
 * ── Why this is in `containers/hooks/`, not `ui/hooks/` ───────────────────
 * It CALLS THE API. `ui/hooks/` holds pure DOM/gesture hooks and obeys the
 * `ui/` import ban; anything that fetches or reads a store lives here. The
 * ESLint boundary rule is the arbiter — a hook that trips the ban belongs
 * outside `ui/`, and this one would trip it on the `aiApi` import alone.
 *
 * ── ⚠️ W9 / task 15 — PRESERVED, do not regress ──────────────────────────
 * The original modal polled with an unbounded `while (true)` loop that kept
 * running behind a closed dialog. `aiApi.pollJob` replaced it: a REQUIRED
 * `AbortSignal`, a 300 s deadline and ×1.3 backoff. This hook keeps that
 * shape and adds the lifecycle half:
 *
 *  - ONE `AbortController` per generation run, stored in a ref;
 *  - starting a new run aborts the previous one;
 *  - {@link InterpolationJob.cancel} and UNMOUNT both abort it.
 *
 * An `AbortError` is swallowed rather than surfaced — the user closed the
 * modal, which is not an error condition.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { aiApi } from "../../api";
import type { JobStatusResult } from "../../api/resources/aiApi";

/**
 * Per-pair job state.
 *
 * ⚠️ W14: this union has FIVE members while the wire type
 * (`JobStatusResult["status"]`) has four. `"pending"` is CLIENT-SIDE ONLY —
 * the state a pair sits in after the run starts but before its job id comes
 * back. `GeneratingStep` renders the status into a BEM modifier by runtime
 * interpolation, and only four of the five are styled; `pending` deliberately
 * falls through to the base style. No static search will find those class
 * names — do not delete or rename them.
 */
export type PairJobStatus =
  "pending" | "queued" | "processing" | "completed" | "failed";

export interface PairJobState {
  pairIdx: number;
  jobId: string | null;
  status: PairJobStatus;
  frames: string[];
  error: string | null;
}

/** One keyframe pair's encoded endpoints, ready to submit. */
export interface EncodedPair {
  startB64: string;
  endB64: string;
}

export interface GenerateOptions {
  pairs: EncodedPair[];
  numFrames: number;
  scale: number;
  flowScale: number;
  aiServiceUrl?: string | undefined;
}

/** What the health check concluded. */
export type HealthOutcome =
  { available: true } | { available: false; detail: string };

export interface InterpolationJob {
  pairJobs: PairJobState[];
  isGenerating: boolean;
  /** Reset the per-pair state (a new configuration invalidates the old run). */
  reset: () => void;
  /**
   * Probe the service. Resolves with the outcome rather than throwing, so the
   * caller renders a step instead of handling an exception.
   */
  checkHealth: (aiServiceUrl?: string) => Promise<HealthOutcome>;
  /**
   * Submit every pair, then poll them all. Resolves `true` when every job
   * completed, `false` when the run was aborted. Rejects with the first real
   * failure.
   */
  generate: (options: GenerateOptions) => Promise<boolean>;
  /** Abort the in-flight run (modal close). Safe to call when idle. */
  cancel: () => void;
}

/** True for the abort the user caused by closing the modal. */
function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export function useInterpolationJob(): InterpolationJob {
  const [pairJobs, setPairJobs] = useState<PairJobState[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // W9: ONE controller per generation run. Closing the modal aborts it, so a
  // job can no longer poll forever behind a closed dialog.
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Unmount aborts. Preserves the original's cleanup.
  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    setPairJobs([]);
    setIsGenerating(false);
  }, []);

  const checkHealth = useCallback(
    async (aiServiceUrl?: string): Promise<HealthOutcome> => {
      try {
        const result = await aiApi.health(aiServiceUrl);
        // ⚠️ Health can LIE: the proxy is up but no remote is configured, so
        // jobs would fail. Ported verbatim from the modal.
        if (result.status === "ok" && result.remote_configured === false) {
          return {
            available: false,
            detail:
              "The AI proxy is running but no remote service is configured (AI_REMOTE_URL unset).",
          };
        }
        if (result.status === "ok") return { available: true };
        return {
          available: false,
          detail: result.detail || "The AI service is not reachable.",
        };
      } catch (err: unknown) {
        // Task 15: a THROW means the Express server itself is unreachable.
        return {
          available: false,
          detail:
            err instanceof Error ? err.message : "The server is not reachable.",
        };
      }
    },
    [],
  );

  const generate = useCallback(
    async (options: GenerateOptions): Promise<boolean> => {
      const { pairs, numFrames, scale, flowScale, aiServiceUrl } = options;
      if (pairs.length === 0) return false;

      // Starting a run supersedes any previous one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsGenerating(true);
      setPairJobs(
        pairs.map((_, i) => ({
          pairIdx: i,
          jobId: null,
          status: "pending" as const,
          frames: [],
          error: null,
        })),
      );

      try {
        const jobIds: string[] = [];
        for (let i = 0; i < pairs.length; i++) {
          const { job_id } = await aiApi.submitJob(
            {
              frameStartBase64: pairs[i].startB64,
              frameEndBase64: pairs[i].endB64,
              numFrames,
              ...(aiServiceUrl ? { aiServiceUrl } : {}),
              scale,
              flowScale,
            },
            controller.signal,
          );
          jobIds.push(job_id);
          setPairJobs((prev) =>
            prev.map((pj, idx) =>
              idx === i ? { ...pj, jobId: job_id, status: "queued" } : pj,
            ),
          );
        }

        // W9: `aiApi.pollJob` — REQUIRED signal, 300 s deadline, backoff.
        await Promise.all(
          jobIds.map((jobId, i) =>
            aiApi
              .pollJob(jobId, {
                ...(aiServiceUrl ? { aiServiceUrl } : {}),
                signal: controller.signal,
                onStatus: (job: JobStatusResult) => {
                  if (job.status === "completed") {
                    setPairJobs((prev) =>
                      prev.map((pj, idx) =>
                        idx === i
                          ? {
                              ...pj,
                              status: "completed",
                              frames: job.frames ?? [],
                            }
                          : pj,
                      ),
                    );
                  } else if (job.status !== "failed") {
                    setPairJobs((prev) =>
                      prev.map((pj, idx) =>
                        idx === i ? { ...pj, status: job.status } : pj,
                      ),
                    );
                  }
                },
              })
              .then((job) => {
                if (job.status === "failed") {
                  throw new Error(
                    job.error || `Interpolation job ${i + 1} failed`,
                  );
                }
                return job;
              }),
          ),
        );

        return true;
      } catch (e) {
        // Stop any sibling polls that are still running.
        controller.abort();
        // The modal was closed (or a new run started): stay silent.
        if (isAbort(e)) return false;
        throw e;
      } finally {
        setIsGenerating(false);
      }
    },
    [],
  );

  return { pairJobs, isGenerating, reset, checkHealth, generate, cancel };
}
