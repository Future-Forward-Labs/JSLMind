#!/usr/bin/env bash
# Pulls all Ollama models needed by JSLMind.
# Run AFTER: docker compose up -d ollama
# This takes 15-25 minutes on first run. Models are cached in the ollama_models volume.

set -euo pipefail

OLLAMA_CONTAINER="${OLLAMA_CONTAINER:-ollama}"

echo "==> Pulling Ollama models for JSLMind"
echo "    This will take 15-25 minutes on first run."
echo ""

models=(
  "llama3.2:3b"          # jsl-fast: ~3.5 GB, ~45 tok/s on M2
  "mistral:7b-instruct"  # jsl-quality: ~4.1 GB, ~25 tok/s on M2
  "bge-m3"               # jsl-embed: ~1.2 GB, embedding dim=1024
)

for model in "${models[@]}"; do
  echo "--- Pulling $model"
  docker compose exec "$OLLAMA_CONTAINER" ollama pull "$model"
  echo ""
done

echo "==> All models pulled. Verifying:"
docker compose exec "$OLLAMA_CONTAINER" ollama list
