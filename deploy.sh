#!/usr/bin/env bash
# Publish dist/ to the gh-pages branch.
#
# Uses a throwaway worktree rather than switching branches in this checkout: switching
# in place can fail halfway on uncommitted changes and then run against `main`.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(pwd)
WT=$(mktemp -d)/gh-pages

git fetch -q origin gh-pages 2>/dev/null || true
git worktree add -q --force -B gh-pages "$WT" origin/gh-pages 2>/dev/null \
  || git worktree add -q --force -B gh-pages "$WT"
trap 'git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT

# Replace the published files only — never a bare rm in a directory that could still be
# the source checkout.
find "$WT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r dist/. "$WT"/
touch "$WT/.nojekyll"

git -C "$WT" add -A
git -C "$WT" commit -q -m "Deploy build $(date -u +%Y-%m-%dT%H:%MZ)" || { echo "nothing to deploy"; exit 0; }
git -C "$WT" push -q origin gh-pages
echo "deployed: https://kutukam.github.io/perfios-unified-kyc/"
