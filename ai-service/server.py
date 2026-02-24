"""
AI Frame Interpolation Service.

Runs in one of two modes (auto-detected at startup):

  GPU mode  -- NVIDIA GPU present: processes interpolation jobs locally.
  Proxy mode -- No GPU: transparently forwards all requests to AI_REMOTE_URL.
"""

import base64
import io
import os
import select
import shutil
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field
import uvicorn

# ---------------------------------------------------------------------------
# Mode detection
# ---------------------------------------------------------------------------

def _has_nvidia_gpu() -> bool:
    try:
        return shutil.which("nvidia-smi") is not None and (
            subprocess.run(
                ["nvidia-smi"], capture_output=True, timeout=10
            ).returncode == 0
        )
    except Exception:
        return False


REMOTE_URL = os.environ.get("AI_REMOTE_URL", "").strip()
GPU_MODE = _has_nvidia_gpu() and not REMOTE_URL

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="AI Frame Interpolation Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMPLATES_DIR = Path(__file__).parent / "templates"

# ---------------------------------------------------------------------------
# Proxy mode: mount proxy router and skip local routes
# ---------------------------------------------------------------------------

if not GPU_MODE:
    import proxy as proxy_module

    if REMOTE_URL:
        proxy_module.configure(REMOTE_URL)
    app.include_router(proxy_module.router)

# ---------------------------------------------------------------------------
# GPU mode: local job-based endpoints
# ---------------------------------------------------------------------------

if GPU_MODE:
    from PIL import Image as PILImage
    import job_manager

    class JobCreateRequest(BaseModel):
        frame_start: str = Field(..., description="Base64-encoded PNG of the start frame")
        frame_end: str = Field(..., description="Base64-encoded PNG of the end frame")
        num_frames: int = Field(3, ge=1, le=64, description="Number of intermediate frames")
        scale: int = Field(4, ge=1, le=16, description="Upscale factor before inference")
        flow_scale: float = Field(1.0, ge=0.25, le=4.0, description="RIFE flow estimation precision (higher=finer, slower)")

    class InterpolateRequest(BaseModel):
        frame_start: str
        frame_end: str
        num_frames: int = Field(3, ge=1, le=64)
        scale: int = Field(4, ge=1, le=16)
        flow_scale: float = Field(1.0, ge=0.25, le=4.0)

    class InterpolateResponse(BaseModel):
        frames: list[str]

    def _decode_image(b64: str) -> PILImage.Image:
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        return PILImage.open(io.BytesIO(base64.b64decode(b64)))

    def _encode_image(img: PILImage.Image) -> str:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("ascii")

    # -- Health ---------------------------------------------------------------

    @app.get("/health")
    def health():
        try:
            from interpolate import _ensure_model
            _ensure_model()
            return {"status": "ok", "mode": "gpu"}
        except Exception as e:
            return {"status": "error", "mode": "gpu", "detail": str(e)}

    @app.get("/heartbeat")
    def heartbeat():
        try:
            from interpolate import interpolate_frames
            img_a = PILImage.new("RGB", (4, 4), (0, 0, 0))
            img_b = PILImage.new("RGB", (4, 4), (255, 255, 255))
            result = interpolate_frames(img_a, img_b, num_frames=1, scale=1)
            if len(result) != 1:
                return {"status": "error", "detail": "Micro-test produced unexpected frame count"}
            return {"status": "ok", "model_ready": True}
        except Exception as e:
            return {"status": "error", "model_ready": False, "detail": str(e)}

    # -- Async job endpoints --------------------------------------------------

    @app.post("/jobs")
    def create_job(req: JobCreateRequest):
        job = job_manager.create_job(
            frame_start_b64=req.frame_start,
            frame_end_b64=req.frame_end,
            num_frames=req.num_frames,
            scale=req.scale,
            flow_scale=req.flow_scale,
        )
        return {"job_id": job.id, "status": job.status.value}

    @app.get("/jobs/{job_id}")
    def get_job(job_id: str):
        job = job_manager.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")

        result = job.to_dict()
        if job.status == job_manager.JobStatus.COMPLETED:
            result["frames"] = job_manager.get_job_output_b64(job_id)
        return result

    @app.get("/jobs")
    def list_jobs(
        status: Optional[str] = Query(None),
        page: int = Query(1, ge=1),
        per_page: int = Query(20, ge=1, le=100),
    ):
        return job_manager.list_jobs(status=status, page=page, per_page=per_page)

    @app.get("/dashboard")
    def dashboard(
        queued_page: int = Query(1, ge=1),
        completed_page: int = Query(1, ge=1),
        errors_page: int = Query(1, ge=1),
        per_page: int = Query(20, ge=1, le=100),
    ):
        result = job_manager.get_dashboard(
            queued_page=queued_page,
            completed_page=completed_page,
            errors_page=errors_page,
            per_page=per_page,
        )
        result["mode"] = "gpu"
        return result

    @app.delete("/jobs/{job_id}")
    def delete_job_endpoint(job_id: str):
        job = job_manager.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.status in (job_manager.JobStatus.QUEUED, job_manager.JobStatus.PROCESSING):
            raise HTTPException(status_code=409, detail="Cannot delete a job that is still in progress")
        job_manager.delete_job(job_id)
        return {"deleted": True, "job_id": job_id}

    @app.get("/jobs/{job_id}/input/{filename}")
    def get_job_input(job_id: str, filename: str):
        path = job_manager.job_input_path(job_id, filename)
        if path is None:
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(path, media_type="image/png")

    @app.get("/jobs/{job_id}/output/{filename}")
    def get_job_output(job_id: str, filename: str):
        path = job_manager.job_output_path(job_id, filename)
        if path is None:
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(path, media_type="image/png")

    # -- Legacy sync endpoint (kept for backward compat) ----------------------

    @app.post("/interpolate", response_model=InterpolateResponse)
    def interpolate(req: InterpolateRequest):
        from interpolate import interpolate_frames
        try:
            img_start = _decode_image(req.frame_start)
            img_end = _decode_image(req.frame_end)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to decode images: {e}")

        if img_start.size != img_end.size:
            raise HTTPException(
                status_code=400,
                detail=f"Image sizes must match: start={img_start.size}, end={img_end.size}",
            )

        try:
            result_frames = interpolate_frames(
                img_start, img_end,
                num_frames=req.num_frames,
                scale=req.scale,
                flow_scale=req.flow_scale,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Interpolation failed: {e}")

        return InterpolateResponse(frames=[_encode_image(f) for f in result_frames])

# ---------------------------------------------------------------------------
# Web UI
# ---------------------------------------------------------------------------

@app.get("/ui", response_class=HTMLResponse)
async def web_ui():
    html_path = TEMPLATES_DIR / "index.html"
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Web UI template not found")
    return HTMLResponse(html_path.read_text())

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

def _keypress_listener(url: str) -> None:
    """Listen for 'o' keypress on stdin and open the browser."""
    import tty
    import termios

    if not sys.stdin.isatty():
        return

    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setcbreak(fd)
        while True:
            if select.select([sys.stdin], [], [], 0.5)[0]:
                ch = sys.stdin.read(1)
                if ch.lower() == "o":
                    print(f"\n  Opening {url} ...\n")
                    webbrowser.open(url)
    except Exception:
        pass
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8100"))
    ui_url = f"http://localhost:{port}/ui"

    print("")
    print("=== AI Frame Interpolation Service ===")
    def _cleanup_loop():
        """Periodically remove completed jobs older than 1 hour."""
        import time as _time
        while True:
            _time.sleep(300)
            try:
                removed = job_manager.cleanup_old_completed(max_age_seconds=3600)
                if removed:
                    print(f"[cleanup] Removed {removed} completed job(s) older than 1 hour")
            except Exception as exc:
                print(f"[cleanup] Error: {exc}")

    if GPU_MODE:
        print("Mode:   GPU (local processing)")
        job_manager.start_worker()
        threading.Thread(target=_cleanup_loop, daemon=True).start()
    elif REMOTE_URL:
        print(f"Mode:   Proxy -> {REMOTE_URL}")
    else:
        print("Mode:   Proxy (AI_REMOTE_URL not set -- configure it to connect to a GPU machine)")
    print(f"API:    http://0.0.0.0:{port}")
    print(f"Web UI: {ui_url}")
    print("")
    print("  Press \033[1mo\033[0m to open the Web UI in your browser")
    print("")

    threading.Thread(target=_keypress_listener, args=(ui_url,), daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=port)
