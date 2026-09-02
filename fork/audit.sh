#!/usr/bin/env bash
# Mesure la dette de fork : quels fichiers de base ta branche modifie,
# et lesquels upstream vient de toucher (= tes futurs conflits).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

WORK_BRANCH="${T3CODE_FORK_BRANCH:-kunail}"
BASE="${1:-main}"

git fetch upstream --quiet --prune 2>/dev/null || true

echo "=== Fichiers ajoutes par le fork (zero risque de conflit) ==="
git diff --diff-filter=A --name-only "$BASE".."$WORK_BRANCH" | sed 's/^/  + /' || true

echo
echo "=== Fichiers de base MODIFIES par le fork (la dette) ==="
TOUCHED="$(git diff --diff-filter=M --name-only "$BASE".."$WORK_BRANCH" || true)"
if [ -z "$TOUCHED" ]; then
  echo "  (aucun — fork purement additif, ideal)"
else
  echo "$TOUCHED" | while read -r f; do
    LINES="$(git diff --numstat "$BASE".."$WORK_BRANCH" -- "$f" | awk '{print "+"$1" -"$2}')"
    printf '  M %-70s %s\n' "$f" "$LINES"
  done
fi

echo
echo "=== Collisions a venir (upstream a touche TES fichiers) ==="
if [ -n "$TOUCHED" ]; then
  BEHIND="$(git rev-list --count "$BASE"..upstream/main 2>/dev/null || echo 0)"
  if [ "$BEHIND" -eq 0 ]; then
    echo "  (upstream n'a rien de nouveau)"
  else
    HITS=0
    echo "$TOUCHED" | while read -r f; do
      N="$(git rev-list --count "$BASE"..upstream/main -- "$f" 2>/dev/null || echo 0)"
      [ "$N" -gt 0 ] && printf '  ! %-70s %s commits upstream\n' "$f" "$N" && HITS=1
    done
    [ "$HITS" -eq 0 ] && echo "  (aucune collision sur les $BEHIND commits upstream en attente)"
  fi
else
  echo "  (rien a collisionner)"
fi

echo
echo "=== Resume ==="
printf '  branche      : %s\n' "$WORK_BRANCH"
printf '  commits fork : %s\n' "$(git rev-list --count "$BASE".."$WORK_BRANCH" 2>/dev/null || echo 0)"
printf '  retard sur upstream : %s commits\n' "$(git rev-list --count "$BASE"..upstream/main 2>/dev/null || echo 0)"
