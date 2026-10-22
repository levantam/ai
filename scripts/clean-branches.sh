#!/usr/bin/env bash
# Pick local branches to delete: ↑/↓ (j/k) move, Space mark/unmark, Enter delete marked, q quit.
# The checked-out branch can't be marked. Marked branches are force-deleted (-D) after a y/N confirm.
set -u

git rev-parse --git-dir >/dev/null 2>&1 || { echo "Not a git repo."; exit 1; }

cur=$(git branch --show-current)
mapfile -t br < <(git for-each-ref --format='%(refname:short)' refs/heads)
n=${#br[@]}
[ "$n" -gt 0 ] || { echo "No local branches."; exit 0; }

sel=0
mark=()
trap 'tput cnorm 2>/dev/null' EXIT
tput civis 2>/dev/null

draw() {
  local rows avail start i m
  rows=$(tput lines 2>/dev/null || echo 24); avail=$((rows - 4)); [ "$avail" -lt 3 ] && avail=3
  start=$((sel - avail / 2)); [ "$start" -gt $((n - avail)) ] && start=$((n - avail)); [ "$start" -lt 0 ] && start=0
  printf '\033[H\033[J\033[1mDelete local branches\033[0m  (current: %s)\n\n' "$cur"
  for ((i = start; i < start + avail && i < n; i++)); do
    m='[ ]'; [ -n "${mark[i]:-}" ] && m='[x]'
    if [ "${br[i]}" = "$cur" ]; then m='[-]'; fi
    if [ "$i" -eq "$sel" ]; then printf '\033[1;36m❯ %s %s\033[0m\n' "$m" "${br[i]}"; else printf '  %s %s\n' "$m" "${br[i]}"; fi
  done
  printf '\n\033[2m↑/↓ move · Space mark · Enter delete marked · q quit\033[0m'
}

while true; do
  draw
  IFS= read -rsn1 key
  if [[ $key == $'\033' ]]; then read -rsn2 -t 0.1 key; fi
  case "$key" in
    '[A'|k) sel=$(( (sel - 1 + n) % n )) ;;
    '[B'|j) sel=$(( (sel + 1) % n )) ;;
    ' ') if [ "${br[sel]}" != "$cur" ]; then if [ -n "${mark[sel]:-}" ]; then mark[sel]=''; else mark[sel]=1; fi; fi ;;
    q) exit 0 ;;
    '') break ;;
  esac
done

del=()
for i in "${!br[@]}"; do [ -n "${mark[i]:-}" ] && del+=("${br[i]}"); done
printf '\033[H\033[J'; tput cnorm 2>/dev/null
[ "${#del[@]}" -gt 0 ] || { echo "Nothing marked."; exit 0; }

printf 'Delete %d branch(es):\n' "${#del[@]}"; printf '  %s\n' "${del[@]}"
read -rp "Force delete (git branch -D)? [y/N]: " ok
[[ $ok =~ ^[Yy] ]] || { echo "Aborted."; exit 0; }
git branch -D "${del[@]}"
