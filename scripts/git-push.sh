#!/usr/bin/env bash
# git add . → commit → push, with optional GPG signing (default on).
set -e

read -rp "Commit message: " msg
[ -z "$msg" ] && { echo "Empty message, aborted."; exit 1; }
read -rp "GPG sign? [Y/n]: " sign

if [[ $sign =~ ^[Nn] ]]; then flag=--no-gpg-sign; else flag=-S; fi

git add .
git commit $flag -m "$msg"
git push
