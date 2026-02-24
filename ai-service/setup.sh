#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== AI Service Setup ==="

if nvidia-smi &>/dev/null; then
  echo "NVIDIA GPU detected -- installing full requirements."
  pip install -r "$SCRIPT_DIR/requirements.txt"
  pip install gdown

  echo ""
  "$SCRIPT_DIR/setup_model.sh"
else
  echo "No NVIDIA GPU detected -- installing proxy-only requirements."
  pip install -r "$SCRIPT_DIR/requirements-proxy.txt"

  echo ""
  echo "This machine will run in PROXY mode."
  echo "Set the AI_REMOTE_URL environment variable to point to a GPU machine."
  echo "  Example: AI_REMOTE_URL=http://192.168.1.100:8100"
fi

echo ""
echo "Setup complete!"
