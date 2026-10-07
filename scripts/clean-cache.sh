#!/usr/bin/env bash
# Frees disk by deleting only regenerable dev caches (re-downloaded/rebuilt on next use).
# Shows sizes first, asks before deleting. Add a path to TARGETS to include more.
# Not touched: node_modules, nvm node versions, Docker, ~/.cache, app data, project files.
set -u

TARGETS=(
  "$HOME/.npm/_cacache"
  "$HOME/.bun/install/cache"
  "$HOME/Library/Caches/Homebrew"
  "$HOME/Library/Caches/go-build"
  "$HOME/Library/Caches/pip"
  "$HOME/Library/Caches/typescript"
  "$HOME/Library/Caches/Yarn"
  "$HOME/Library/Caches/CocoaPods"
  "$HOME/Library/Developer/Xcode/DerivedData"
  "$HOME/.nvm/.cache"
)

found=()
for t in "${TARGETS[@]}"; do
  [ -d "$t" ] || continue
  printf '%8s  %s\n' "$(du -sh "$t" 2>/dev/null | cut -f1)" "${t/#$HOME/~}"
  found+=("$t")
done
[ ${#found[@]} -eq 0 ] && { echo "Nothing to clean."; exit 0; }

before=$(df -k "$HOME" | awk 'NR==2{print $4}')
read -rp "Delete the caches above? [y/N] " ans
[[ $ans =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

for t in "${found[@]}"; do
  # guard: never rm anything that isn't a real dir under $HOME
  case "$t" in "$HOME"/?*) rm -rf -- "$t" ;; esac
done
command -v brew >/dev/null && brew cleanup -s >/dev/null 2>&1

after=$(df -k "$HOME" | awk 'NR==2{print $4}')
echo "Freed ~$(( (after - before) / 1024 )) MB."
