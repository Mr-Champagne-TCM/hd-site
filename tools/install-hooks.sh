#!/bin/sh
set -e
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath tools/hooks
chmod +x tools/hooks/* 2>/dev/null || true
echo "hooks installed: $(git config core.hooksPath)"
