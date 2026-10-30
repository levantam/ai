#!/usr/bin/env bash
# Arrow-key menu: ↑/↓ (or j/k) to move, 1-9 to jump, Enter to run, q to quit.
# To add a script: append a "Category|Label|command" line to ITEMS below
# (keep items of the same category together; a header is drawn when it changes).
set -u

ITEMS=(
  'General|Git - add, commit, push|/Users/tam.le/WORKSPACE/AI/levantam-ai/scripts/git-push.sh'
  'General|Git - new branch from base|/Users/tam.le/WORKSPACE/AI/levantam-ai/scripts/new-branch.sh'
  'General|Git - delete local branches|/Users/tam.le/WORKSPACE/AI/levantam-ai/scripts/clean-branches.sh'
  'AI|Claude code - Headroom start|headroom wrap claude'
  'beGroup|Tix Admin Environment|Z=$(mktemp -d) && printf "ZDOTDIR=\"$HOME\"\n[ -f ~/.zshrc ] && source ~/.zshrc\nsource ~/.nvm/nvm.sh && nvm use 12.13.0 && export PATH=\"$HOME/.nvm/versions/node/v12.13.0/bin:$PATH\"\n" > "$Z/.zshrc" && ZDOTDIR="$Z" exec zsh -i'
  'beGroup|Start Staging env|zsh -ic "k8swe stage && /Users/tam.le/WORKSPACE/src/web-api/start_local.sh"'
  'beGroup|Start SaaS env|zsh -ic "k8swe saas && /Users/tam.le/WORKSPACE/src/web-api/start_local_saas.sh"'
  'Clear storage|Clean ALL (daily/weekly)|/Users/tam.le/WORKSPACE/AI/levantam-ai/scripts/clean-all.sh'
  'Clear storage|Clean dev caches|/Users/tam.le/WORKSPACE/AI/levantam-ai/scripts/clean-cache.sh'
  'Clear storage|Clean Docker unused images|/Users/tam.le/WORKSPACE/AI/levantam-ai/scripts/clean-docker.sh'
  'Clear storage|Clean Android emulator leftovers|/Users/tam.le/WORKSPACE/AI/levantam-ai/scripts/clean-android.sh'
  'Clear storage|Clean Chrome cache (keep tabs)|/Users/tam.le/WORKSPACE/AI/levantam-ai/scripts/clean-chrome.sh'
  'Clear storage|Clean node_modules (npkill)|npx npkill'
  'Tools utils|Tami - Run local|TAMI_PORT=7777 docker-compose -f /Users/tam.le/WORKSPACE/src/web/be-uploader-client/docker-compose.yml up -d --build && open http://localhost:7777'
  'Tools utils|Tami - Stop local|docker-compose -f /Users/tam.le/WORKSPACE/src/web/be-uploader-client/docker-compose.yml down'
  'Tools utils|Android Emulator - Pixel 6 Pro|emulator -avd Pixel_6_Pro'
  'Tools utils|Public tunnel (localhost.run)|read -rp "Local port: " p; [[ $p =~ ^[0-9]+$ ]] || { echo "Invalid port."; exit 1; }; ssh -R 80:localhost:$p -i ~/.ssh/localhost_run localhost.run'
  'About|About|printf "Name:  Tam Le\nEmail: cvtamle@gmail.com\n"'
)

# Chocolate-tan puppy: brown ears/head, tan muzzle, pink tongue (colors built once).
R=$'\033[0m' B=$'\033[38;5;94m' BB=$'\033[48;5;94m' T=$'\033[38;5;180m' TB=$'\033[48;5;180m'
W=$'\033[38;5;255m' N=$'\033[38;5;52m' P=$'\033[38;5;211m'
tick=0
draw_dog() {  # blinks every 8th tick, pants (tongue U/u) every tick
  [ "$cols" -ge 80 ] || return 0
  local e=◕ t=U r=5 d
  [ $((tick % 8)) -eq 7 ] && e=─
  [ $((tick % 2)) -eq 1 ] && t=u
  local DOG=(
    " ${B}▄▄▄▄▄▄▄▄▄▄▄▄▄${R}"
    "${B}███${BB}  ${T}˙${BB}   ${T}˙${BB}  ${R}${B}███${R}"
    "${B}███${BB}  ${W}${e}${BB}   ${W}${e}${BB}  ${R}${B}███${R}"
    "${B}███${TB}  ${N}▄███▄${TB}  ${R}${B}███${R}"
    "${B}▐██${TB}   ${N}╰${P}${t}${N}╯${TB}   ${R}${B}██▌${R}"
    " ${B}▀█▌${TB}       ${R}${B}▐█▀${R}"
    "   ${B}▀▀▀▀▀▀▀▀▀${R}"
  )
  for d in "${DOG[@]}"; do printf '\033[%d;54H%s' "$r" "$d"; ((r++)); done
}

sel=0
n=${#ITEMS[@]}

# Static parts built once: forking tput/seq on every keypress is what made it lag.
size() { cols=$(tput cols 2>/dev/null || echo 80); rows=$(tput lines 2>/dev/null || echo 40); }
size; trap 'size; printf "\033[H\033[J"' WINCH
bar=$(printf '─%.0s' $(seq 48))
printf -v HEADER '\033[38;5;141m╭%s╮\033[0m\n\033[38;5;141m│\033[0m  \033[1;38;5;213m✻ Welcome to Tami tools. Have a good day\033[0m      \033[38;5;141m│\033[0m\n\033[38;5;141m╰%s╯\033[0m\n\n' "$bar" "$bar"

draw() {  # no subshells: build one string, write once
  local out line i it cat prev='' c lines=() selline=0 start avail=$((rows - 8))
  for i in "${!ITEMS[@]}"; do
    it=${ITEMS[$i]}; cat=${it%%|*}; it=${it#*|}
    case $cat in General) c=75 ;; beGroup) c=214 ;; AI) c=177 ;; About) c=246 ;; "Clear storage") c=203 ;; *) c=114 ;; esac
    if [ "$cat" != "$prev" ]; then
      printf -v line '  \033[1;38;5;%sm%s\033[0m\033[K\n' "$c" "$cat"; lines+=("$line"); prev=$cat
    fi
    if [ "$i" -eq "$sel" ]; then printf -v line '  \033[1;38;5;%sm❯ %2d. %s\033[0m\033[K\n' "$c" $((i + 1)) "${it%%|*}"
    else printf -v line '    \033[2;38;5;%sm%2d.\033[0;38;5;%sm %s\033[0m\033[K\n' "$c" $((i + 1)) "$c" "${it%%|*}"; fi
    [ "$i" -eq "$sel" ] && selline=${#lines[@]}
    lines+=("$line")
  done
  # Window the list to the terminal height; overflow would scroll and break the \033[H repaint.
  [ "$avail" -lt 3 ] && avail=3
  start=$((selline - avail / 2)); [ "$start" -gt $((${#lines[@]} - avail)) ] && start=$((${#lines[@]} - avail)); [ "$start" -lt 0 ] && start=0
  printf -v out '%s' "${lines[@]:start:avail}"
  it=${ITEMS[$sel]}; it=${it#*|}; local cmd=${it#*|}
  printf '\033[H%s%s\n  \033[2m$ %s\033[0m\033[K\n\n  \033[2m↑/↓ j/k move · 1-9 jump · Enter run · q quit\033[0m\033[K\033[J' "$HEADER" "$out" "${cmd:0:$((cols - 6))}"
  draw_dog
}

printf '\033[H\033[J'; tput civis 2>/dev/null; trap 'tput cnorm 2>/dev/null' EXIT

while true; do
  draw
  IFS= read -rsn1 -t 0.4 key || { ((tick++)); draw_dog; continue; }  # timeout = animation tick
  if [[ $key == $'\033' ]]; then read -rsn2 -t 0.1 key; fi
  case "$key" in
    '[A'|k) sel=$(( (sel - 1 + n) % n )) ;;
    '[B'|j) sel=$(( (sel + 1) % n )) ;;
    '') # Enter
      printf '\033[H\033[J'
      tput cnorm 2>/dev/null
      it=${ITEMS[$sel]}; it=${it#*|}
      bash -c "${it#*|}"
      echo; read -rsn1 -p "Press any key to return to menu..."
      tput civis 2>/dev/null ;;
    [1-9]) [ $((key - 1)) -lt "$n" ] && sel=$((key - 1)) ;;
    q) break ;;
  esac
done
