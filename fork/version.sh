#!/usr/bin/env bash
# Affiche la version que porte la prochaine build du fork.
#
# Forme : <version upstream, patch + 1>-fork.<n>, par exemple 0.0.43-fork.1
# construite sur upstream 0.0.42.
#
# Pourquoi pas la version d'upstream telle quelle : upstream ne change de
# numero que de loin en loin (240 commits sous 0.0.42 en septembre 2026).
# Avec son numero, une release du fork par numero au plus, et l'updater ne
# propose rien entre deux : 0.0.42 -> 0.0.42 n'est pas une mise a jour.
#
# Pourquoi patch + 1 : semver classe 0.0.42-fork.1 AVANT 0.0.42. Monter le
# patch garde chaque build du fork au-dessus de la version d'upstream dont
# elle part, et 0.0.43-fork.n reste sous le 0.0.43 d'upstream, que le fork
# ne publiera jamais : a ce moment-la il passera a 0.0.44-fork.1.
#
# n = plus grand n deja tague sur origin pour cette base, + 1.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
die() { printf '\033[1;31mxx\033[0m %s\n' "$1" >&2; exit 1; }

UPSTREAM="$(node -p "require('$REPO_DIR/apps/server/package.json').version")"
case "$UPSTREAM" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) die "version upstream inattendue : $UPSTREAM" ;;
esac
case "$UPSTREAM" in
  *[!0-9.]*) die "version upstream avec suffixe, non geree : $UPSTREAM" ;;
esac

BASE="${UPSTREAM%.*}.$(( ${UPSTREAM##*.} + 1 ))"
LAST="$(git -C "$REPO_DIR" ls-remote --tags origin "v$BASE-fork.*" \
  | sed '/\^{}$/d' \
  | sed -E 's#.*/v[0-9.]+-fork\.([0-9]+)$#\1#' \
  | sort -n | tail -1)"

printf '%s-fork.%s\n' "$BASE" "$(( ${LAST:-0} + 1 ))"
