#!/usr/bin/env bash
# Resynchronise le fork sur upstream/main puis rebase la branche de travail.
#
#   main    : miroir strict de upstream/main. On n'y commit jamais.
#   kunail  : le travail. Rebasée sur main a chaque sync.
#
# git rerere est actif : un conflit resolu une fois est rejoue tout seul
# aux syncs suivants.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

WORK_BRANCH="${T3CODE_FORK_BRANCH:-kunail}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$1" >&2; exit 1; }

[ -z "$(git status --porcelain)" ] || die "Working tree sale. Commit ou stash d'abord."

START_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

info "Fetch upstream"
git fetch upstream --tags --prune

BEHIND="$(git rev-list --count main..upstream/main)"
if [ "$BEHIND" -eq 0 ]; then
  info "Deja a jour sur upstream/main. Rien a faire."
  exit 0
fi
info "$BEHIND nouveaux commits upstream"

info "Fast-forward de main sur upstream/main"
git switch main
git merge --ff-only upstream/main

info "Push de main vers le fork"
git push origin main

info "Rebase de $WORK_BRANCH sur main"
git switch "$WORK_BRANCH"
if ! git rebase main; then
  warn "Conflit de rebase. Resous, puis: git rebase --continue"
  warn "Pour tout annuler : git rebase --abort"
  exit 1
fi

info "Diff de $WORK_BRANCH par rapport a upstream :"
git diff --stat main.."$WORK_BRANCH"

info "Termine. Push avec : git push --force-with-lease origin $WORK_BRANCH"
[ "$START_BRANCH" = "$WORK_BRANCH" ] || info "(tu etais sur $START_BRANCH avant)"
