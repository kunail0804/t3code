#!/usr/bin/env bash
# Publie l'AppImage et latest-linux.yml construits par fork/build-linux.sh
# en release GitHub du fork. Ne construit rien : relance build-linux.sh si
# les artefacts manquent ou ne sont pas coherents.
#
# La release doit etre publiee (ni brouillon ni prerelease) et tagguee
# v<version> : electron-updater, canal "latest", resout la release via
# .../releases/latest et deduit la version du tag.
#
# Variables :
#   T3CODE_DESKTOP_VERSION        version a publier (defaut : apps/server/package.json)
#   T3CODE_FORK_RELEASE_DIR       repertoire des artefacts (defaut : <repo>/release)
#   T3CODE_FORK_RELEASE_CLOBBER=1 remplace les assets si la release existe deja
#   T3CODE_FORK_RELEASE_DRY_RUN=1 verifie tout, affiche la commande gh, n'appelle rien
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$1" >&2; exit 1; }

DRY_RUN="${T3CODE_FORK_RELEASE_DRY_RUN:-0}"
CLOBBER="${T3CODE_FORK_RELEASE_CLOBBER:-0}"
RELEASE_DIR="${T3CODE_FORK_RELEASE_DIR:-$REPO_DIR/release}"

VERSION="${T3CODE_DESKTOP_VERSION:-}"
if [ -z "$VERSION" ]; then
  VERSION="$(node -p "require('$REPO_DIR/apps/server/package.json').version")"
fi
info "Version a publier : $VERSION"

APPIMAGE="$RELEASE_DIR/T3-Code-$VERSION-x86_64.AppImage"
YML="$RELEASE_DIR/latest-linux.yml"

[ -f "$APPIMAGE" ] || die "AppImage introuvable : $APPIMAGE. Lance ./fork/build-linux.sh d'abord."

if [ ! -f "$YML" ]; then
  die "latest-linux.yml introuvable dans $RELEASE_DIR : la config de publication n'a pas ete prise en compte au build. Relance ./fork/build-linux.sh, sinon l'AppImage n'aura pas d'app-update.yml et la mise a jour automatique restera muette."
fi

# tr/sed : un yml en CRLF laisse un \r en fin de valeur, qui ferait echouer
# la comparaison avec un message affichant deux valeurs identiques.
YML_VERSION="$(awk '$1 == "version:" {print $2; exit}' "$YML" | tr -d '\r' | sed 's/[[:space:]]*$//')"
if [ "$YML_VERSION" != "$VERSION" ]; then
  die "latest-linux.yml annonce la version $YML_VERSION, pas $VERSION. Les artefacts de $RELEASE_DIR ne correspondent pas a la version a publier : relance ./fork/build-linux.sh."
fi

APPIMAGE_NAME="$(basename "$APPIMAGE")"
YML_PATH="$(awk '$1 == "path:" {print $2; exit}' "$YML" | tr -d '\r' | sed 's/[[:space:]]*$//')"
if [ "$YML_PATH" != "$APPIMAGE_NAME" ]; then
  die "latest-linux.yml reference \"$YML_PATH\", mais l'AppImage a televerser s'appelle \"$APPIMAGE_NAME\". L'updater telechargerait un 404. Relance ./fork/build-linux.sh."
fi
info "Artefacts coherents : $APPIMAGE_NAME + latest-linux.yml (version $VERSION)"

# Depot GitHub cible : le remote origin du fork, format owner/repo.
REPO_SLUG="$(git remote get-url origin | sed -E 's#.*github\.com[:/]##; s#\.git$##')"
TAG="v$VERSION"

FORK_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo inconnu)"
UPSTREAM_BASE="$(git rev-parse --short main 2>/dev/null || echo inconnu)"
NOTES="Build du fork (commit $FORK_COMMIT, base upstream $UPSTREAM_BASE).

Assets : $APPIMAGE_NAME et latest-linux.yml, consommes par la mise a jour automatique du fork."

# Avertissement, pas refus : gh release create sans --target taggue le HEAD
# distant de la branche par defaut, alors que les notes annoncent le commit
# local. Publier depuis un HEAD non pousse produirait des notes designant un
# commit que le tag ne contient pas. Un --target sur le SHA local ferait
# echouer gh si le commit n'est pas pousse : on ne le fait pas.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if git rev-parse --verify -q "origin/$BRANCH" >/dev/null; then
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$BRANCH")" ]; then
    info "Attention : HEAD local ($FORK_COMMIT) differe de origin/$BRANCH ($(git rev-parse --short "origin/$BRANCH")). Le tag $TAG pointera sur le HEAD distant de la branche par defaut, pas sur le commit annonce dans les notes. Pousse la branche avant de publier."
  fi
else
  info "Attention : origin/$BRANCH n'existe pas localement ; impossible de verifier que le commit des notes ($FORK_COMMIT) est pousse."
fi

if [ "$DRY_RUN" = "1" ]; then
  info "Simulation : toutes les verifications locales sont passees, rien n'a ete appele chez GitHub."
  if [ "$CLOBBER" = "1" ]; then
    info "Clobber demande. La commande reelle serait (apres gh release view $TAG, qui decide entre create et upload) :"
    printf 'gh release upload %s "%s" "%s" --clobber --repo %s\n' "$TAG" "$APPIMAGE" "$YML" "$REPO_SLUG"
  else
    info "La commande reelle serait (apres gh release view $TAG, qui decide entre create et upload) :"
    printf 'gh release create %s "%s" "%s" --repo %s --title "%s" --notes "%s"\n' \
      "$TAG" "$APPIMAGE" "$YML" "$REPO_SLUG" "T3 Code fork $VERSION" "$NOTES"
  fi
  exit 0
fi

command -v gh >/dev/null || die "gh introuvable. Voir docs/internals/scripts.md"

if gh release view "$TAG" --repo "$REPO_SLUG" >/dev/null 2>&1; then
  if [ "$CLOBBER" = "1" ]; then
    info "Release $TAG existe deja : remplacement des assets"
    gh release upload "$TAG" "$APPIMAGE" "$YML" --clobber --repo "$REPO_SLUG"
  else
    die "La release $TAG existe deja. Pose T3CODE_FORK_RELEASE_CLOBBER=1 pour remplacer ses assets."
  fi
else
  info "Publication de $TAG sur $REPO_SLUG"
  gh release create "$TAG" "$APPIMAGE" "$YML" \
    --repo "$REPO_SLUG" \
    --title "T3 Code fork $VERSION" \
    --notes "$NOTES"
fi

info "Publie. La release doit rester non-brouillon et non-prerelease, sinon l'updater ne la verra pas."
