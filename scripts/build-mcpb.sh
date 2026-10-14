#!/usr/bin/env bash
# Builds korea-mcp.mcpb (one-click install for Claude Desktop) from dist/ and data/.
# Run from the repo root after `npm run build`.
set -euo pipefail
stage=$(mktemp -d)
cp -R dist data manifest.json package.json package-lock.json LICENSE DATA_LICENSE.md README.md "$stage"/
(cd "$stage" && npm ci --omit=dev --ignore-scripts --silent)
npx -y @anthropic-ai/mcpb@2.1.2 validate "$stage/manifest.json"
npx -y @anthropic-ai/mcpb@2.1.2 pack "$stage" korea-mcp.mcpb
rm -rf "$stage"
