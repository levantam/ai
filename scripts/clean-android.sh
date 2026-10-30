#!/usr/bin/env bash
# Frees disk from Android emulator leftovers. Keeps your AVDs (apps, data, settings) intact.
# Removes: (1) AVD quick-boot snapshots (regenerated on next launch, first boot is slower),
#          (2) SDK system images that no AVD uses (re-download via sdkmanager/Android Studio).
set -u

AVD="$HOME/.android/avd"
SDK="$HOME/Library/Android/sdk/system-images"
pgrep -x 'qemu-system-aarch64|qemu-system-x86_64|emulator' >/dev/null && { echo "Emulator is running - close it first."; exit 1; }

targets=()
for d in "$AVD"/*.avd/snapshots; do [ -d "$d" ] && targets+=("$d"); done

used=$(cat "$AVD"/*.avd/config.ini 2>/dev/null | sed -n 's/^image.sysdir.[0-9]*=//p')
for img in "$SDK"/*/*; do
  [ -d "$img" ] || continue
  rel="system-images/${img#$SDK/}/"
  grep -qF "$rel" <<<"$used" || targets+=("$img")
done
[ ${#targets[@]} -eq 0 ] && { echo "Nothing to clean."; exit 0; }

for t in "${targets[@]}"; do printf '%8s  %s\n' "$(du -sh "$t" 2>/dev/null | cut -f1)" "${t/#$HOME/~}"; done
before=$(df -k "$HOME" | awk 'NR==2{print $4}')
read -rp "Delete the items above? (AVDs are kept) [y/N] " ans
[[ $ans =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

for t in "${targets[@]}"; do
  case "$t" in "$HOME"/?*) rm -rf -- "$t" ;; esac
done
after=$(df -k "$HOME" | awk 'NR==2{print $4}')
echo "Freed ~$(( (after - before) / 1024 )) MB."
