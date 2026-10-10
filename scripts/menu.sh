#!/usr/bin/env bash
# Arrow-key menu: ↑/↓ (or j/k) to move, Enter to run, q to quit.
# To add a script: append a "Label|command" line to ITEMS below.
set -u

ITEMS=(
  "Say hello|echo 'Hello from menu.sh'"
  "Show git status|git status -sb"
  "List scripts dir|ls -la"
  'Tix Admin Environment|Z=$(mktemp -d) && printf "ZDOTDIR=\"$HOME\"\n[ -f ~/.zshrc ] && source ~/.zshrc\nsource ~/.nvm/nvm.sh && nvm use 12.13.0 && export PATH=\"$HOME/.nvm/versions/node/v12.13.0/bin:$PATH\"\n" > "$Z/.zshrc" && ZDOTDIR="$Z" exec zsh -i'
  'Clean dev caches|/Users/tam.le/WORKSPACE/AI/levantam-ai/scripts/clean-cache.sh'
  'Claude code - Headroom start|headroom wrap claude'
  'Clean node_modules (npkill)|npx npkill'
  'Tami - Run local|TAMI_PORT=7777 docker-compose -f /Users/tam.le/WORKSPACE/src/web/be-uploader-client/docker-compose.yml up -d --build && open http://localhost:7777'
  'Tami - Stop local|docker-compose -f /Users/tam.le/WORKSPACE/src/web/be-uploader-client/docker-compose.yml down'
  'Android Emulator - Pixel 6 Pro|emulator -avd Pixel_6_Pro'
  'Git - add, commit, push|/Users/tam.le/WORKSPACE/AI/levantam-ai/scripts/git-push.sh'
)

sel=0
n=${#ITEMS[@]}

draw() {
  printf '\033[H\033[J'  # clear
  echo "Select a script (↑/↓ move, Enter run, q quit)"
  echo
  for i in "${!ITEMS[@]}"; do
    if [ "$i" -eq "$sel" ]; then printf '  \033[7m> %s\033[0m\n' "${ITEMS[$i]%%|*}"
    else printf '    %s\n' "${ITEMS[$i]%%|*}"; fi
  done
}

tput civis 2>/dev/null; trap 'tput cnorm 2>/dev/null' EXIT

while true; do
  draw
  IFS= read -rsn1 key
  if [[ $key == $'\033' ]]; then read -rsn2 -t 0.1 key; fi
  case "$key" in
    '[A'|k) sel=$(( (sel - 1 + n) % n )) ;;
    '[B'|j) sel=$(( (sel + 1) % n )) ;;
    '') # Enter
      printf '\033[H\033[J'
      tput cnorm 2>/dev/null
      bash -c "${ITEMS[$sel]#*|}"
      echo; read -rsn1 -p "Press any key to return to menu..."
      tput civis 2>/dev/null ;;
    q) break ;;
  esac
done
