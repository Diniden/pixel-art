"""
FastAPI server that exposes a frame interpolation endpoint powered by
Practical-RIFE. Intended to run on a GPU-equipped machine.
"""

import base64
import io
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn
from PIL import Image

from interpolate import interpolate_frames

app = FastAPI(title="AI Frame Interpolation Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class InterpolateRequest(BaseModel):
    frame_start: str = Field(..., description="Base64-encoded PNG of the start frame")
    frame_end: str = Field(..., description="Base64-encoded PNG of the end frame")
    num_frames: int = Field(3, ge=1, le=64, description="Number of intermediate frames to generate")
    scale: int = Field(4, ge=1, le=16, description="Upscale factor before inference (for small pixel art)")


class InterpolateResponse(BaseModel):
    frames: list[str] = Field(..., description="List of base64-encoded PNG intermediate frames")


def _decode_image(b64: str) -> Image.Image:
    """Decode a base64 string (with or without data URI prefix) to a PIL Image."""
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    return Image.open(io.BytesIO(raw))


def _encode_image(img: Image.Image) -> str:
    """Encode a PIL Image to a base64 PNG string (no data URI prefix)."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/heartbeat")
def heartbeat():
    """
    Deep health check that verifies the model is loaded and can produce output.
    Runs a tiny 4x4 interpolation as a micro-test.
    """
    try:
        # Create two small solid-color test images
        img_a = Image.new("RGB", (4, 4), (0, 0, 0))
        img_b = Image.new("RGB", (4, 4), (255, 255, 255))
        result = interpolate_frames(img_a, img_b, num_frames=1, scale=1)
        if len(result) != 1:
            return {"status": "error", "detail": "Micro-test produced unexpected frame count"}
        return {"status": "ok", "model_ready": True}
    except Exception as e:
        return {"status": "error", "model_ready": False, "detail": str(e)}


@app.post("/interpolate", response_model=InterpolateResponse)
def interpolate(req: InterpolateRequest):
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
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Interpolation failed: {e}")

    encoded = [_encode_image(f) for f in result_frames]
    return InterpolateResponse(frames=encoded)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8100"))
    print(f"Starting AI Frame Interpolation Service on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
