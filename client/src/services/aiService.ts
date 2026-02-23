const API_BASE = "/api";

export interface HeartbeatResult {
  status: "ok" | "error";
  model_ready: boolean;
  detail?: string;
}

export interface InterpolateResult {
  frames: string[];
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
 * Send two frames to the AI interpolation service and receive intermediate frames.
 * Images should be raw base64 PNG (no data URI prefix).
 */
export async function interpolateFrames(
  frameStartBase64: string,
  frameEndBase64: string,
  numFrames: number,
  aiServiceUrl?: string,
  scale: number = 4,
): Promise<string[]> {
  const body: Record<string, unknown> = {
    frame_start: frameStartBase64,
    frame_end: frameEndBase64,
    num_frames: numFrames,
    scale,
  };

  if (aiServiceUrl) {
    body.ai_service_url = aiServiceUrl;
  }

  const response = await fetch(`${API_BASE}/ai/interpolate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `AI service error: ${response.status}`);
  }

  const result: InterpolateResult = await response.json();
  return result.frames;
}
