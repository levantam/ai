#!/usr/bin/env bash
# Frees disk from Chrome's regenerable caches WITHOUT closing Chrome or losing open tabs.
# Not touched: cookies, logins, history, bookmarks, extensions, Local/IndexedDB storage.
# Tabs already loaded keep working; pages just re-fetch assets when next loaded.
set -u

C="$HOME/Library/Caches/Google/Chrome"
A="$HOME/Library/Application Support/Google/Chrome"
SUB=(Cache "Code Cache" GPUCache DawnCache "Service Worker/CacheStorage" "Service Worker/ScriptCache")

targets=()
for d in "$C"/*/ ; do [ -d "$d" ] && targets+=("${d%/}"); done          # per-profile HTTP cache
for p in "$A"/Default "$A"/Profile\ *; do
  for s in "${SUB[@]}"; do [ -d "$p/$s" ] && targets+=("$p/$s"); done
done
for g in GrShaderCache ShaderCache GraphiteDawnCache GPUPersistentCache; do
  [ -d "$A/$g" ] && targets+=("$A/$g")
done
[ ${#targets[@]} -eq 0 ] && { echo "Nothing to clean."; exit 0; }

for t in "${targets[@]}"; do
  printf '%8s  %s\n' "$(du -sh "$t" 2>/dev/null | cut -f1)" "${t/#$HOME/~}"
done
before=$(df -k "$HOME" | awk 'NR==2{print $4}')
read -rp "Delete the Chrome caches above? (tabs stay open) [y/N] " ans
[[ $ans =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

for t in "${targets[@]}"; do
  case "$t" in "$HOME"/?*) rm -rf -- "$t" ;; esac
done
after=$(df -k "$HOME" | awk 'NR==2{print $4}')
echo "Freed ~$(( (after - before) / 1024 )) MB."
