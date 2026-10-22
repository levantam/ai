#!/usr/bin/env bash
# Start a task: pull latest of a base branch (default master), then create + checkout a new branch.
# Input may be a branch name (used as-is) or a description (slugified: "Fix login bug" → fix-login-bug).
set -e

git rev-parse --git-dir >/dev/null 2>&1 || { echo "Not a git repo."; exit 1; }

read -rp "Base branch [master]: " base
base=${base:-master}
read -rp "Branch name or description: " input
[ -z "$input" ] && { echo "Empty input, aborted."; exit 1; }

if [[ $input =~ [[:space:]] ]]; then
  name=$(printf '%s' "$input" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
else
  name=$input
fi
[ -z "$name" ] && { echo "Could not build a branch name from: $input"; exit 1; }
git check-ref-format --branch "$name" >/dev/null || { echo "Invalid branch name: $name"; exit 1; }

echo "→ $name (from $base)"
git checkout "$base"
git pull --ff-only
git checkout -b "$name"
