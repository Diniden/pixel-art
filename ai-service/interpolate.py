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

    # Add Practical-RIFE to path so we can import their model code
    if RIFE_DIR not in sys.path:
        sys.path.insert(0, RIFE_DIR)
    if MODEL_DIR not in sys.path:
        sys.path.insert(0, MODEL_DIR)

    try:
        from model.RIFE import Model
    except ImportError:
        # Fallback: try importing from the copied model dir
        from RIFE import Model

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


def _pad_to_multiple(tensor: torch.Tensor, multiple: int = 32) -> tuple[torch.Tensor, tuple[int, int]]:
    """Pad tensor dimensions to be multiples of `multiple`. Returns padded tensor and original (H, W)."""
    _, _, h, w = tensor.shape
    pad_h = (multiple - h % multiple) % multiple
    pad_w = (multiple - w % multiple) % multiple
    if pad_h > 0 or pad_w > 0:
        tensor = torch.nn.functional.pad(tensor, (0, pad_w, 0, pad_h), mode="replicate")
    return tensor, (h, w)


def interpolate_frames(
    img_start: Image.Image,
    img_end: Image.Image,
    num_frames: int,
    scale: int = 4,
) -> list[Image.Image]:
    """
    Generate `num_frames` intermediate frames between img_start and img_end.

    Args:
        img_start: The starting frame (PIL Image).
        img_end: The ending frame (PIL Image).
        num_frames: Number of intermediate frames to generate.
        scale: Upscale factor applied before inference (pixel art is tiny).

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

    # Pad to 32-multiple for the network
    t0_padded, (oh, ow) = _pad_to_multiple(t0)
    t1_padded, _ = _pad_to_multiple(t1)

    timesteps = [(i + 1) / (num_frames + 1) for i in range(num_frames)]
    results: list[Image.Image] = []

    with torch.no_grad():
        for t in timesteps:
            # RIFE inference at arbitrary timestep
            mid = _model.inference(t0_padded, t1_padded, timestep=t)
            # Crop back to original padded size
            mid = mid[:, :, :oh, :ow]

            # Interpolate alpha linearly
            interp_alpha = None
            if has_alpha and alpha_start is not None and alpha_end is not None:
                blended = (alpha_start * (1.0 - t) + alpha_end * t).clip(0, 255).astype(np.uint8)
                interp_alpha = blended

            frame = _tensor_to_img(mid, has_alpha, interp_alpha, original_size)
            results.append(frame)

    return results
