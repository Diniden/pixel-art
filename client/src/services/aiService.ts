const API_BASE = "/api";

export interface HeartbeatResult {
  status: "ok" | "error";
  model_ready: boolean;
  detail?: string;
}

export interface InterpolateResult {
  frames: string[];
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

/**
 * Lightweight check that verifies the AI service is reachable.
 * Does NOT run a model inference test.
 */
export async function checkAiHealth(
  aiServiceUrl?: string,
): Promise<{ status: string; mode?: string; detail?: string }> {
  const params = new URLSearchParams();
  if (aiServiceUrl) {
    params.set("ai_service_url", aiServiceUrl);
  }

  const qs = params.toString();
  const url = `${API_BASE}/ai/health${qs ? `?${qs}` : ""}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { status: "error", detail: `Proxy returned ${response.status}` };
    }
    return await response.json();
  } catch (err) {
    return {
      status: "error",
      detail: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Check whether the remote AI service is reachable and the model is warm.
 * Runs a micro-inference test on the service side.
 */
export async function checkAiHeartbeat(
  aiServiceUrl?: string,
): Promise<HeartbeatResult> {
  const params = new URLSearchParams();
  if (aiServiceUrl) {
    params.set("ai_service_url", aiServiceUrl);
  }

  const qs = params.toString();
  const url = `${API_BASE}/ai/heartbeat${qs ? `?${qs}` : ""}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        status: "error",
        model_ready: false,
        detail: `Proxy returned ${response.status}`,
      };
    }
    return await response.json();
  } catch (err) {
    return {
      status: "error",
      model_ready: false,
      detail: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Submit an async interpolation job. Returns immediately with a job_id.
 */
export async function submitJob(
  frameStartBase64: string,
  frameEndBase64: string,
  numFrames: number,
  aiServiceUrl?: string,
  scale: number = 4,
  flowScale: number = 1.0,
): Promise<JobSubmitResult> {
  const body: Record<string, unknown> = {
    frame_start: frameStartBase64,
    frame_end: frameEndBase64,
    num_frames: numFrames,
    scale,
    flow_scale: flowScale,
  };

  if (aiServiceUrl) {
    body.ai_service_url = aiServiceUrl;
  }

  const response = await fetch(`${API_BASE}/ai/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `AI service error: ${response.status}`);
  }

  return await response.json();
}

/**
 * Poll a job's status. Returns the full job object including frames when completed.
 */
export async function getJobStatus(
  jobId: string,
  aiServiceUrl?: string,
): Promise<JobStatusResult> {
  const params = new URLSearchParams();
  if (aiServiceUrl) {
    params.set("ai_service_url", aiServiceUrl);
  }
  const qs = params.toString();
  const url = `${API_BASE}/ai/jobs/${jobId}${qs ? `?${qs}` : ""}`;

  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `AI service error: ${response.status}`);
  }

  return await response.json();
}

/**
 * Submit a job and poll until completion. Calls onStatus on each poll.
 * Returns the completed job's base64 frames.
 */
export async function interpolateFrames(
  frameStartBase64: string,
  frameEndBase64: string,
  numFrames: number,
  aiServiceUrl?: string,
  scale: number = 4,
  flowScale: number = 1.0,
  onStatus?: (status: JobStatusResult) => void,
): Promise<string[]> {
  const { job_id } = await submitJob(
    frameStartBase64,
    frameEndBase64,
    numFrames,
    aiServiceUrl,
    scale,
    flowScale,
  );

  let pollInterval = 500;
  const maxInterval = 3000;

  while (true) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const job = await getJobStatus(job_id, aiServiceUrl);
    onStatus?.(job);

    if (job.status === "completed") {
      return job.frames ?? [];
    }

    if (job.status === "failed") {
      throw new Error(job.error || "Interpolation job failed");
    }

    pollInterval = Math.min(pollInterval * 1.3, maxInterval);
  }
}
