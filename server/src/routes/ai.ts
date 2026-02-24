import { Router, type Request, type Response } from 'express';
import { loadConfig } from '../backup.js';

export const aiRouter = Router();

interface InterpolateBody {
  frame_start: string;
  frame_end: string;
  num_frames: number;
  scale?: number;
  ai_service_url?: string;
}

// ---------------------------------------------------------------------------
// Helper: resolve the AI service URL from request, config, env, or default.
//
// Priority (highest → lowest):
//   1. Per-request parameter  (UI manual override)
//   2. Persisted server config (config.json — also set from UI)
//   3. AI_SERVICE_URL env var  (.env / shell environment)
//   4. Hard-coded default      (http://localhost:8100)
// ---------------------------------------------------------------------------

const DEFAULT_AI_URL = 'http://localhost:8100';

function getEnvAiUrl(): string | undefined {
  const v = process.env.AI_SERVICE_URL?.trim();
  return v || undefined;
}

async function resolveAiUrl(reqUrl?: string): Promise<string> {
  if (reqUrl) return reqUrl.replace(/\/+$/, '');

  const config = await loadConfig() as { currentProject: string; aiServiceUrl?: string };
  if (config.aiServiceUrl) return config.aiServiceUrl.replace(/\/+$/, '');

  const envUrl = getEnvAiUrl();
  if (envUrl) return envUrl.replace(/\/+$/, '');

  return DEFAULT_AI_URL;
}

// ---------------------------------------------------------------------------
// Async job endpoints -- proxy to AI service
// ---------------------------------------------------------------------------

aiRouter.post('/ai/jobs', async (req: Request, res: Response) => {
  try {
    const aiUrl = await resolveAiUrl(req.body?.ai_service_url);
    if (!aiUrl) {
      return res.status(400).json({ error: 'AI service URL not configured.' });
    }

    const response = await fetch(`${aiUrl}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: `AI service returned ${response.status}: ${text}`,
      });
    }

    return res.json(await response.json());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: `Proxy error: ${message}` });
  }
});

aiRouter.get('/ai/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const aiUrl = await resolveAiUrl(req.query.ai_service_url as string | undefined);
    if (!aiUrl) {
      return res.status(400).json({ error: 'AI service URL not configured.' });
    }

    const response = await fetch(`${aiUrl}/jobs/${req.params.jobId}`);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: `AI service returned ${response.status}: ${text}`,
      });
    }

    return res.json(await response.json());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: `Proxy error: ${message}` });
  }
});

aiRouter.get('/ai/jobs', async (req: Request, res: Response) => {
  try {
    const aiUrl = await resolveAiUrl(req.query.ai_service_url as string | undefined);
    if (!aiUrl) {
      return res.status(400).json({ error: 'AI service URL not configured.' });
    }

    const params = new URLSearchParams();
    if (req.query.status) params.set('status', req.query.status as string);
    if (req.query.page) params.set('page', req.query.page as string);
    if (req.query.per_page) params.set('per_page', req.query.per_page as string);
    const qs = params.toString();

    const response = await fetch(`${aiUrl}/jobs${qs ? `?${qs}` : ''}`);
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: `AI service returned ${response.status}: ${text}`,
      });
    }

    return res.json(await response.json());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: `Proxy error: ${message}` });
  }
});

/**
 * Proxy endpoint that forwards interpolation requests to the remote AI service.
 * The AI service URL can be provided in the request body or read from server config.
 */
aiRouter.post('/ai/interpolate', async (req: Request, res: Response) => {
  try {
    const body = req.body as InterpolateBody;
    const { frame_start, frame_end, num_frames, scale } = body;

    if (!frame_start || !frame_end || !num_frames) {
      return res.status(400).json({
        error: 'Missing required fields: frame_start, frame_end, num_frames',
      });
    }

    const aiUrl = await resolveAiUrl(body.ai_service_url);

    const payload = {
      frame_start,
      frame_end,
      num_frames,
      ...(scale != null ? { scale } : {}),
    };

    const response = await fetch(`${aiUrl}/interpolate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: `AI service returned ${response.status}: ${text}`,
      });
    }

    const result = await response.json();
    return res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('AI interpolation proxy error:', message);
    return res.status(500).json({ error: `Proxy error: ${message}` });
  }
});

/**
 * Lightweight health check -- just verifies the AI service is reachable.
 * Does NOT run a model inference test (use /heartbeat for that).
 */
aiRouter.get('/ai/health', async (req: Request, res: Response) => {
  try {
    const aiUrl = await resolveAiUrl(req.query.ai_service_url as string | undefined);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${aiUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return res.json({ status: 'error', detail: `AI service returned ${response.status}` });
      }

      return res.json(await response.json());
    } catch (fetchErr: unknown) {
      clearTimeout(timeout);
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      return res.json({ status: 'error', detail: `Cannot reach AI service: ${msg}` });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.json({ status: 'error', detail: message });
  }
});

/**
 * Heartbeat check that verifies the remote AI service is reachable and the
 * model can actually produce output (runs a micro-inference test on the service).
 */
aiRouter.get('/ai/heartbeat', async (req: Request, res: Response) => {
  try {
    const aiUrl = await resolveAiUrl(req.query.ai_service_url as string | undefined);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${aiUrl}/heartbeat`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return res.json({
          status: 'error',
          model_ready: false,
          detail: `AI service returned ${response.status}`,
        });
      }

      const result = await response.json();
      return res.json(result);
    } catch (fetchErr: unknown) {
      clearTimeout(timeout);
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      return res.json({
        status: 'error',
        model_ready: false,
        detail: `Cannot reach AI service: ${msg}`,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.json({ status: 'error', model_ready: false, detail: message });
  }
});

/**
 * Save/update the AI service URL in server config.
 */
aiRouter.post('/ai/config', async (req: Request, res: Response) => {
  try {
    const { aiServiceUrl } = req.body as { aiServiceUrl: string };
    const config = await loadConfig() as Record<string, unknown>;
    config.aiServiceUrl = aiServiceUrl || '';

    // Re-use the saveConfig pattern but extend for extra fields
    const { saveConfig } = await import('../backup.js');
    await saveConfig(config as { currentProject: string });

    return res.json({ success: true, aiServiceUrl: config.aiServiceUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
});

/**
 * Get the current AI service config.
 *
 * Returns:
 *   aiServiceUrl       – value persisted in config.json (may be empty)
 *   envAiServiceUrl    – value from AI_SERVICE_URL env var (may be empty)
 *   effectiveAiServiceUrl – the URL that would actually be used when no
 *                           per-request override is supplied
 */
aiRouter.get('/ai/config', async (_req: Request, res: Response) => {
  try {
    const config = await loadConfig() as { currentProject: string; aiServiceUrl?: string };
    const envUrl = getEnvAiUrl() || '';
    const effective = config.aiServiceUrl || envUrl || DEFAULT_AI_URL;

    return res.json({
      aiServiceUrl: config.aiServiceUrl || '',
      envAiServiceUrl: envUrl,
      effectiveAiServiceUrl: effective,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
});
