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

    // Resolve AI service URL: body override > config > error
    let aiUrl = body.ai_service_url;

    if (!aiUrl) {
      const config = await loadConfig() as { currentProject: string; aiServiceUrl?: string };
      aiUrl = config.aiServiceUrl;
    }

    if (!aiUrl) {
      return res.status(400).json({
        error: 'AI service URL not configured. Set it in the editor settings or provide ai_service_url in the request body.',
      });
    }

    // Normalize URL: strip trailing slash
    aiUrl = aiUrl.replace(/\/+$/, '');

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
 * Heartbeat check that verifies the remote AI service is reachable and the
 * model can actually produce output (runs a micro-inference test on the service).
 */
aiRouter.get('/ai/heartbeat', async (req: Request, res: Response) => {
  try {
    // Resolve AI service URL from query param, config, or error
    let aiUrl = req.query.ai_service_url as string | undefined;

    if (!aiUrl) {
      const config = await loadConfig() as { currentProject: string; aiServiceUrl?: string };
      aiUrl = config.aiServiceUrl;
    }

    if (!aiUrl) {
      return res.json({
        status: 'error',
        model_ready: false,
        detail: 'AI service URL not configured.',
      });
    }

    aiUrl = aiUrl.replace(/\/+$/, '');

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
 */
aiRouter.get('/ai/config', async (_req: Request, res: Response) => {
  try {
    const config = await loadConfig() as { currentProject: string; aiServiceUrl?: string };
    return res.json({ aiServiceUrl: config.aiServiceUrl || '' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
});
