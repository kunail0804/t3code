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
git fetch origin --prune

BEHIND="$(git rev-list --count main..upstream/main)"
if [ "$BEHIND" -eq 0 ]; then
  info "main est deja sur upstream/main."
else
  info "$BEHIND nouveaux commits upstream"
  info "Fast-forward de main sur upstream/main"
  git switch main
  git merge --ff-only upstream/main
fi

# Push decide sur l'ecart reel avec le fork, pas sur celui qu'on vient de
# combler : un fast-forward fait localement puis jamais pousse laissait sinon
# origin/main derriere pour toujours.
if [ "$(git rev-list --count origin/main..main)" -ne 0 ]; then
  info "Push de main vers le fork"
  git push origin main
else
  info "origin/main est deja a jour."
fi

# Le rebase se decide sur l'ecart entre la branche de travail et main, jamais
# sur celui entre main et upstream. main peut avoir ete avance par un autre
# chemin — le bouton Sync fork de GitHub, un push a la main, la CI si un PAT
# est pose — et l'ancien test sortait alors en exit 0 sur « deja a jour »
# AVANT le rebase, en laissant la branche de travail derriere sans le dire.
TO_REPLAY="$(git rev-list --count "$WORK_BRANCH"..main)"
if [ "$TO_REPLAY" -eq 0 ]; then
  info "$WORK_BRANCH est deja sur main. Rien a rejouer."
  exit 0
fi

info "Rebase de $WORK_BRANCH sur main : $TO_REPLAY commits a rejouer dessous"
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
