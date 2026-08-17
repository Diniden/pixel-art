/**
 * AI interpolation service (REFRESH task 15). Replaces the deleted
 * aiService module.
 *
 * Contract facts encoded here:
 *
 *  - `GET /api/ai/health` ALWAYS returns HTTP 200 and encodes failure in
 *    `{status:'error'}` — the old `!response.ok` branch was unreachable dead
 *    code and was not carried over. A `health()` THROW therefore means the
 *    EXPRESS server is unreachable, not the AI service.
 *  - Health can lie: in proxy mode with `AI_REMOTE_URL` unset the Python
 *    service reports `{"status":"ok","mode":"proxy","remote_configured":false}`
 *    while every job will fail. `remote_configured` is surfaced so consumers
 *    can distinguish.
 *  - `pollJob` takes a REQUIRED `signal` — the old `while (true)` poll loop
 *    (no abort, no deadline) is unrepresentable through this API.
 */
import { LONG_TIMEOUT_MS } from "../client/config";
import { TimeoutError } from "../client/errors";
import { request } from "../client/httpClient";

export interface AiConfigResult {
  aiServiceUrl: string;
  envAiServiceUrl: string;
  effectiveAiServiceUrl: string;
}

export interface AiHealthResult {
  status: string;
  mode?: string;
  detail?: string;
  /**
   * Sent by the Python service in proxy mode. `false` means the proxy is up
   * but has no remote AI service configured — "Connected" would be a lie.
   */
  remote_configured?: boolean;
}

export interface JobSubmitInput {
  frameStartBase64: string;
  frameEndBase64: string;
  numFrames: number;
  aiServiceUrl?: string;
  scale?: number;
  flowScale?: number;
}

export interface JobSubmitResult {
  job_id: string;
  status: string;
}

export interface JobStatusResult {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  num_frames: number;
  scale: number;
  flow_scale: number;
  created_at: number;
  completed_at: number | null;
  error: string | null;
  output_count: number;
  frames?: string[];
}

export interface PollJobOptions {
  aiServiceUrl?: string;
  /**
   * REQUIRED. Aborting it stops the polling loop; the abort rethrows
   * unwrapped, like every caller-signal abort in this layer.
   */
  signal: AbortSignal;
  /** Overall deadline for the job, default 300 000 ms (5 minutes). */
  maxWaitMs?: number;
  /** Called with every observed status, including the terminal one. */
  onStatus?: (job: JobStatusResult) => void;
  /** First delay between polls; grows ×1.3 up to 3 s. Tests shrink it. */
  pollIntervalMs?: number;
}

/** Sleep that rejects (with the signal's unwrapped AbortError) on abort. */
function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortReason(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

export const aiApi = {
  /** GET /api/ai/config — the effective default AI URL, per the server. */
  async getConfig(signal?: AbortSignal): Promise<AiConfigResult> {
    return request<AiConfigResult>({ path: "/ai/config", signal });
  },

  /** GET /api/ai/health — see the contract notes in the module header. */
  async health(
    aiServiceUrl?: string,
    signal?: AbortSignal,
  ): Promise<AiHealthResult> {
    return request<AiHealthResult>({
      path: "/ai/health",
      query: { ai_service_url: aiServiceUrl },
      signal,
    });
  },

  /** POST /api/ai/jobs — returns immediately with a job id. */
  async submitJob(
    input: JobSubmitInput,
    signal?: AbortSignal,
  ): Promise<JobSubmitResult> {
    const body: Record<string, unknown> = {
      frame_start: input.frameStartBase64,
      frame_end: input.frameEndBase64,
      num_frames: input.numFrames,
      scale: input.scale ?? 4,
      flow_scale: input.flowScale ?? 1.0,
    };
    if (input.aiServiceUrl) body.ai_service_url = input.aiServiceUrl;
    return request<JobSubmitResult>({
      method: "POST",
      path: "/ai/jobs",
      body,
      timeoutMs: LONG_TIMEOUT_MS,
      signal,
    });
  },

  /** GET /api/ai/jobs/:id */
  async getJob(
    jobId: string,
    aiServiceUrl?: string,
    signal?: AbortSignal,
  ): Promise<JobStatusResult> {
    return request<JobStatusResult>({
      path: `/ai/jobs/${encodeURIComponent(jobId)}`,
      query: { ai_service_url: aiServiceUrl },
      signal,
    });
  },

  /**
   * Poll a job until it reaches a terminal state (`completed` OR `failed` —
   * the caller decides what a failed job means), the deadline passes
   * (`TimeoutError`), or the signal aborts (unwrapped `AbortError`).
   */
  async pollJob(
    jobId: string,
    opts: PollJobOptions,
  ): Promise<JobStatusResult> {
    const {
      aiServiceUrl,
      signal,
      maxWaitMs = 300_000,
      onStatus,
      pollIntervalMs = 500,
    } = opts;

    const deadline = Date.now() + maxWaitMs;
    let interval = pollIntervalMs;

    for (;;) {
      const job = await aiApi.getJob(jobId, aiServiceUrl, signal);
      onStatus?.(job);
      if (job.status === "completed" || job.status === "failed") return job;
      if (Date.now() >= deadline) {
        throw new TimeoutError(
          `/ai/jobs/${jobId}`,
          `AI job ${jobId} did not finish within ${maxWaitMs} ms`,
        );
      }
      await abortableDelay(interval, signal);
      interval = Math.min(interval * 1.3, 3000);
    }
  },
};
