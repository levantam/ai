#!/usr/bin/env bash
# Runs every cleanup below with ONE confirmation. Use -y to skip it (cron/launchd).
# Same safety as each script: regenerable caches only; keeps node_modules, containers,
# Docker volumes (your DB data), AVDs and project files. Skips a step if it can't run.
set -u
D="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" != "-y" ]; then
  read -rp "Run ALL cleanups (dev caches, Docker images, Android leftovers, Chrome cache, pnpm)? [y/N] " ans
  [[ $ans =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }
fi

before=$(df -k "$HOME" | awk 'NR==2{print $4}')
for s in clean-cache clean-docker clean-android clean-chrome; do
  echo; echo "=== $s ==="
  yes | "$D/$s.sh" || echo "(skipped: $s exited non-zero)"
done
command -v pnpm >/dev/null && { echo; echo "=== pnpm store prune ==="; pnpm store prune; }

after=$(df -k "$HOME" | awk 'NR==2{print $4}')
echo; echo "Total freed ~$(( (after - before) / 1024 )) MB."
