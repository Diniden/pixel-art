"""
Core interpolation logic wrapping Practical-RIFE for frame generation.

Loads the RIFE model once at startup and provides a function to interpolate
between two PIL images, producing N intermediate frames at evenly spaced
timesteps.
"""

import sys
import os
import torch
import numpy as np
from PIL import Image

_model = None
_device = None

MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")
RIFE_DIR = os.path.join(os.path.dirname(__file__), "Practical-RIFE")


def _ensure_model():
    """Lazy-load the RIFE model on first use."""
    global _model, _device

    if _model is not None:
        return

    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    ai_service_dir = os.path.dirname(__file__)

    # ai-service/ root on path so `model.X` resolves to ai-service/model/X
    if ai_service_dir not in sys.path:
        sys.path.insert(0, ai_service_dir)
    # Practical-RIFE on path for its own model/ subpackage
    if RIFE_DIR not in sys.path:
        sys.path.insert(0, RIFE_DIR)
    # model/ on path for direct imports (e.g. `from IFNet_HDv3 import *`)
    if MODEL_DIR not in sys.path:
        sys.path.insert(0, MODEL_DIR)

    # RIFE_HDv3.py (from the model weights archive) uses
    #   `from train_log.IFNet_HDv3 import *`
    # but IFNet_HDv3.py lives in model/, not train_log/.
    # Register an alias so that import resolves correctly.
    import importlib
    if "train_log" not in sys.modules:
        train_log_mod = importlib.import_module("model")
        sys.modules["train_log"] = train_log_mod

    from model.RIFE_HDv3 import Model

    model = Model()
    model.load_model(MODEL_DIR, -1)
    model.eval()
    model.device()
    _model = model

    print(f"RIFE model loaded on {_device}")


def _img_to_tensor(img: Image.Image) -> torch.Tensor:
    """Convert a PIL RGBA/RGB image to a float32 [1, C, H, W] tensor on device."""
    img_rgb = img.convert("RGB")
    arr = np.array(img_rgb).astype(np.float32) / 255.0
    # HWC -> CHW -> NCHW
    tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)
    return tensor.to(_device)


def _tensor_to_img(tensor: torch.Tensor, has_alpha: bool, alpha_arr: np.ndarray | None, size: tuple[int, int]) -> Image.Image:
    """Convert a [1, 3, H, W] tensor back to a PIL Image, optionally restoring alpha."""
    arr = tensor.squeeze(0).permute(1, 2, 0).cpu().numpy()
    arr = (arr * 255.0).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    img = img.resize(size, Image.NEAREST)

    if has_alpha and alpha_arr is not None:
        result = Image.new("RGBA", size)
        result.paste(img, (0, 0))
        # Interpolated alpha: just use a blended alpha for now
        result.putalpha(Image.fromarray(alpha_arr, "L"))
        return result

    return img


def _pad_to_safe_size(tensor: torch.Tensor, multiple: int = 64, min_dim: int = 64) -> tuple[torch.Tensor, tuple[int, int]]:
    """
    Pad tensor so both dimensions are multiples of `multiple` and at least
    `min_dim` pixels.  Uses edge-replication so the padded border doesn't
    introduce colour artefacts.  Returns (padded_tensor, original (H, W)).
    """
    _, _, h, w = tensor.shape
    target_h = max(min_dim, h)
    target_w = max(min_dim, w)
    # Round up to next multiple
    target_h = target_h + (multiple - target_h % multiple) % multiple
    target_w = target_w + (multiple - target_w % multiple) % multiple
    pad_h = target_h - h
    pad_w = target_w - w
    if pad_h > 0 or pad_w > 0:
        tensor = torch.nn.functional.pad(tensor, (0, pad_w, 0, pad_h), mode="replicate")
    return tensor, (h, w)


def interpolate_frames(
    img_start: Image.Image,
    img_end: Image.Image,
    num_frames: int,
    scale: int = 4,
    flow_scale: float = 1.0,
) -> list[Image.Image]:
    """
    Generate `num_frames` intermediate frames between img_start and img_end.

    Args:
        img_start: The starting frame (PIL Image).
        img_end: The ending frame (PIL Image).
        num_frames: Number of intermediate frames to generate.
        scale: Upscale factor applied before inference (pixel art is tiny).
        flow_scale: RIFE flow estimation precision. Higher = finer but slower.

    Returns:
        List of `num_frames` PIL Images (the intermediates, not including start/end).
    """
    _ensure_model()

    original_size = img_start.size  # (W, H)
    has_alpha = img_start.mode == "RGBA"

    # Upscale for better RIFE performance on small pixel-art sprites
    upscaled_size = (original_size[0] * scale, original_size[1] * scale)
    start_up = img_start.resize(upscaled_size, Image.NEAREST)
    end_up = img_end.resize(upscaled_size, Image.NEAREST)

    # Prepare alpha channel interpolation
    alpha_start = None
    alpha_end = None
    if has_alpha:
        alpha_start = np.array(img_start.split()[-1]).astype(np.float32)
        alpha_end = np.array(img_end.split()[-1]).astype(np.float32)

    t0 = _img_to_tensor(start_up)
    t1 = _img_to_tensor(end_up)

    # Pad to model-safe dimensions (64-multiple, min 64px per side)
    t0_padded, (oh, ow) = _pad_to_safe_size(t0)
    t1_padded, _ = _pad_to_safe_size(t1)

    timesteps = [(i + 1) / (num_frames + 1) for i in range(num_frames)]
    results: list[Image.Image] = []

    with torch.no_grad():
        for t in timesteps:
            mid = _model.inference(t0_padded, t1_padded, timestep=t, scale=flow_scale)
            mid = mid[:, :, :oh, :ow]

            interp_alpha = None
            if has_alpha and alpha_start is not None and alpha_end is not None:
                blended = (alpha_start * (1.0 - t) + alpha_end * t).clip(0, 255).astype(np.uint8)
                interp_alpha = blended

            frame = _tensor_to_img(mid, has_alpha, interp_alpha, original_size)
            results.append(frame)

    return results
