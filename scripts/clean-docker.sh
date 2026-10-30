#!/usr/bin/env bash
# Frees Docker disk by removing only images not used by ANY container (running or stopped).
# Not touched: containers, volumes, networks -> your apps and their data keep working.
# Removed images are re-pulled/rebuilt on next use.
set -u

command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "Docker is not running."; exit 1; }

docker system df
read -rp "Remove all unused images? (containers & volumes are kept) [y/N] " ans
[[ $ans =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

docker image prune -a -f
echo; docker system df
