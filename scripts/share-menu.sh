#!/usr/bin/env bash
# Shareable cleanup menu: ↑/↓ (or j/k) move, 1-9 jump, Enter run, q quit.
# Keep this file in the same folder as the clean-*.sh scripts (paths are relative to it).
set -u
D="$(cd "$(dirname "$0")" && pwd)"

ITEMS=(
  "Clean ALL (daily/weekly)|$D/clean-all.sh"
  "Clean dev caches|$D/clean-cache.sh"
  "Clean Docker unused images|$D/clean-docker.sh"
  "Clean Android emulator leftovers|$D/clean-android.sh"
  "Clean Chrome cache (keep tabs)|$D/clean-chrome.sh"
  "Clean node_modules (npkill)|npx npkill"
)

sel=0
n=${#ITEMS[@]}
trap 'tput cnorm 2>/dev/null' EXIT
tput civis 2>/dev/null

draw() {
  local i label
  printf '\033[H\033[J\033[1;38;5;203m  Clear storage\033[0m\n\n'
  for i in "${!ITEMS[@]}"; do
    label=${ITEMS[$i]%%|*}
    if [ "$i" -eq "$sel" ]; then printf '  \033[1;38;5;203m❯ %2d. %s\033[0m\n' $((i + 1)) "$label"
    else printf '    \033[2m%2d.\033[0m %s\n' $((i + 1)) "$label"; fi
  done
  printf '\n  \033[2m$ %s\033[0m\n\n  \033[2m↑/↓ j/k move · 1-9 jump · Enter run · q quit\033[0m\n' "${ITEMS[$sel]#*|}"
}

while true; do
  draw
  IFS= read -rsn1 key || break
  if [[ $key == $'\033' ]]; then read -rsn2 -t 0.1 key; fi
  case "$key" in
    '[A'|k) sel=$(( (sel - 1 + n) % n )) ;;
    '[B'|j) sel=$(( (sel + 1) % n )) ;;
    '')
      printf '\033[H\033[J'; tput cnorm 2>/dev/null
      bash -c "${ITEMS[$sel]#*|}"
      echo; read -rsn1 -p "Press any key to return to menu..."
      tput civis 2>/dev/null ;;
    [1-9]) [ $((key - 1)) -lt "$n" ] && sel=$((key - 1)) ;;
    q) break ;;
  esac
done
