# AI Frame Interpolation Service

A standalone FastAPI server that generates intermediate animation frames between two input images using [Practical-RIFE](https://github.com/hzwer/Practical-RIFE) (MIT license).

This service is designed to run on a **GPU-equipped machine** separate from the main pixel-art editor.

## Prerequisites

- Python 3.10+
- NVIDIA GPU with CUDA support (recommended)
- `git` and `pip`

## Setup

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install gdown for model download
pip install gdown

# Clone Practical-RIFE and download model weights
./setup_model.sh
```

If `gdown` fails (Google Drive rate limits), download the model manually:
1. Go to https://drive.google.com/file/d/1ZKjcbmt1hypiFprJPIKW0Tt0lr_2i7bg/view
2. Extract the archive
3. Copy `flownet.pkl` and all `.py` files into the `model/` directory

## Running

```bash
python server.py
```

The server starts on port **8100** by default. Override with the `PORT` environment variable:

```bash
PORT=9000 python server.py
```

## API

### `GET /health`

Health check endpoint.

### `POST /interpolate`

Generate intermediate frames between two images.

**Request body:**

```json
{
  "frame_start": "<base64 PNG>",
  "frame_end": "<base64 PNG>",
  "num_frames": 3,
  "scale": 4
}
```

- `frame_start` / `frame_end`: Base64-encoded PNG images (with or without `data:image/png;base64,` prefix)
- `num_frames`: How many intermediate frames to generate (1-64)
- `scale`: Upscale factor before inference (default 4, helps with small pixel art)

**Response:**

```json
{
  "frames": ["<base64 PNG>", "<base64 PNG>", "<base64 PNG>"]
}
```

The returned frames are the **intermediates only** (does not include the start/end frames).

## Connecting to the Pixel Art Editor

In the pixel art editor, configure the AI Service URL in the header settings to point to this machine:

```
http://<this-machine-ip>:8100
```

The editor's Express server proxies requests to avoid CORS issues.
