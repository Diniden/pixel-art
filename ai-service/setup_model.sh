#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODEL_DIR="$SCRIPT_DIR/model"
RIFE_DIR="$SCRIPT_DIR/Practical-RIFE"

echo "=== AI Frame Interpolation Service Setup ==="

# Clone Practical-RIFE if not present
if [ ! -d "$RIFE_DIR" ]; then
  echo "Cloning Practical-RIFE..."
  git clone https://github.com/hzwer/Practical-RIFE.git "$RIFE_DIR"
else
  echo "Practical-RIFE already cloned."
fi

# Create model directory
mkdir -p "$MODEL_DIR"

# Download model v4.25 (recommended for most scenes including animation)
MODEL_FILE="$MODEL_DIR/flownet.pkl"
if [ ! -f "$MODEL_FILE" ]; then
  echo "Downloading RIFE v4.25 model weights..."
  GDRIVE_ID="1ZKjcbmt1hypiFprJPIKW0Tt0lr_2i7bg"
  # Use gdown if available, otherwise provide manual instructions
  if command -v gdown &> /dev/null; then
    gdown "https://drive.google.com/uc?id=$GDRIVE_ID" -O /tmp/rife_v4.25.zip
    unzip -o /tmp/rife_v4.25.zip -d /tmp/rife_model
    for f in /tmp/rife_model/train_log/*; do
      [ -f "$f" ] && cp "$f" "$MODEL_DIR/"
    done
    rm -rf /tmp/rife_v4.25.zip /tmp/rife_model
  else
    echo ""
    echo "gdown is not installed. Install it with: pip install gdown"
    echo "Then re-run this script, or manually download the model:"
    echo ""
    echo "  1. Download from: https://drive.google.com/file/d/$GDRIVE_ID/view"
    echo "  2. Extract the archive"
    echo "  3. Copy flownet.pkl and *.py files into: $MODEL_DIR/"
    echo ""
    exit 1
  fi
else
  echo "Model weights already present."
fi

# Copy the RIFE model Python files needed at runtime (only when missing or source newer)
for f in "$RIFE_DIR/model"/*.py; do
  if [ -f "$f" ]; then
    dest="$MODEL_DIR/$(basename "$f")"
    if [ ! -f "$dest" ] || [ "$f" -nt "$dest" ]; then
      cp "$f" "$dest"
    fi
  fi
done

echo ""
echo "Setup complete! Start the server with:"
echo "  cd $SCRIPT_DIR && python server.py"
