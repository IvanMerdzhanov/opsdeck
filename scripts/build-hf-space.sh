#!/usr/bin/env bash
# Assembles the Hugging Face Space for the live demo into a folder (default: _space).
# The Space is a separate git repo, so it gets its own README (with Space config) and a root Dockerfile.
set -euo pipefail
out=${1:-_space}
cd "$(dirname "$0")/.."
rm -rf "$out" && mkdir -p "$out"

# Only what the image needs, from the committed tree.
git archive HEAD package.json package-lock.json packages services db deploy | tar -x -C "$out"

# Same image as CI tests, but explicitly non-root: Spaces runs containers as uid 1000 (node).
{ cat deploy/demo-bundled.Dockerfile; printf '\n# Hugging Face Spaces runs containers as uid 1000, which is the node user.\nUSER node\n'; } \
  > "$out/Dockerfile"

cat > "$out/README.md" <<'MD'
---
title: OpsDeck
emoji: 🛠️
colorFrom: gray
colorTo: green
sdk: docker
app_port: 10000
pinned: false
short_description: Internal service toolchain - monitoring & incidents demo
---

# OpsDeck: live demo

Press **Break demo-target** and watch OpsDeck detect the failure, open an incident and resolve it on recovery.
Demo data resets whenever the Space restarts.

Source, docs and architecture: https://github.com/IvanMerdzhanov/opsdeck
This Space is deployed automatically from `main` after CI passes. Don't edit it here.
MD
echo "assembled $out"
