#!/usr/bin/env bash
# Construit l'AppImage du fork et l'installe comme "T3 Code (fork)".
#
# Contourne la toolchain rustup orpheline (1.94.1) qui masque le rustc
# systeme dans le PATH : le composant natif resource-monitor exige >= 1.95.
#
# Pose T3CODE_DESKTOP_UPDATE_REPOSITORY pour que electron-builder embarque
# app-update.yml dans l'AppImage et produise latest-linux.yml : sans eux,
# l'updater de l'AppImage reste muet.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$1" >&2; exit 1; }

# rustc systeme d'abord, toolchain rustup orpheline retiree.
PATH="/usr/bin:$HOME/.local/share/vite-plus/bin:$(printf '%s' "$PATH" | tr ':' '\n' | grep -v rustup | paste -sd:)"
export PATH

# Depot cible de la mise a jour automatique (format owner/repo). Lu par
# scripts/build-desktop-artifact.ts pour construire buildConfig.publish.
T3CODE_DESKTOP_UPDATE_REPOSITORY="${T3CODE_DESKTOP_UPDATE_REPOSITORY:-kunail0804/t3code}"
export T3CODE_DESKTOP_UPDATE_REPOSITORY
info "Depot de mise a jour : $T3CODE_DESKTOP_UPDATE_REPOSITORY"

RUSTC_VERSION="$(rustc --version | awk '{print $2}')"
info "rustc $RUSTC_VERSION"
case "$RUSTC_VERSION" in
  1.9[5-9]*|1.[0-9][0-9][0-9]*|2.*) ;;
  *) die "rustc >= 1.95 requis pour resource-monitor (trouve $RUSTC_VERSION)" ;;
esac

command -v vp >/dev/null || die "vp introuvable. Voir docs/internals/scripts.md"

# Verifie que le build a produit les metadonnees de mise a jour et qu'elles
# sont coherentes avec l'AppImage present. Fonction contigue : extractible
# seule pour test. Affiche le chemin de l'AppImage valide sur stdout.
check_update_metadata() {
  local release_dir="$1"
  local appimage yml_version yml_path file_version

  appimage="$(ls -t "$release_dir"/T3-Code-*-x86_64.AppImage 2>/dev/null | head -1 || true)"
  [ -n "$appimage" ] || die "Aucun AppImage dans $release_dir"

  if [ ! -f "$release_dir/latest-linux.yml" ]; then
    die "latest-linux.yml absent de $release_dir : la config de publication n'a pas ete prise en compte par electron-builder (T3CODE_DESKTOP_UPDATE_REPOSITORY). L'AppImage n'embarquera pas app-update.yml et la mise a jour automatique restera muette."
  fi

  # tr/sed : un yml en CRLF laisse un \r en fin de valeur, qui ferait echouer
  # la comparaison avec un message affichant deux valeurs identiques.
  yml_version="$(awk '$1 == "version:" {print $2; exit}' "$release_dir/latest-linux.yml" | tr -d '\r' | sed 's/[[:space:]]*$//')"
  yml_path="$(awk '$1 == "path:" {print $2; exit}' "$release_dir/latest-linux.yml" | tr -d '\r' | sed 's/[[:space:]]*$//')"
  file_version="$(basename "$appimage" | sed -E 's/^T3-Code-(.+)-x86_64\.AppImage$/\1/')"
  if [ "$yml_version" != "$file_version" ]; then
    die "Incoherence dans $release_dir : latest-linux.yml annonce la version $yml_version mais l'AppImage le plus recent est $file_version. Un vieil artefact traine dans release/, nettoie-le et relance le build."
  fi
  if [ "$yml_path" != "$(basename "$appimage")" ]; then
    die "Incoherence dans $release_dir : latest-linux.yml reference le path \"$yml_path\", mais l'AppImage le plus recent s'appelle \"$(basename "$appimage")\". L'updater telechargerait un 404. Nettoie release/ et relance le build."
  fi
  printf '%s\n' "$appimage"
}

info "Build AppImage linux/x64"
vp run dist:desktop:linux

ARTIFACT="$(check_update_metadata "$REPO_DIR/release")"

install -d "$HOME/Applications"
ln -sfn "$ARTIFACT" "$HOME/Applications/T3-Code-fork.AppImage"

info "Build OK : $(basename "$ARTIFACT")"
info "Lie a ~/Applications/T3-Code-fork.AppImage"
info "Lancer avec : t3code-fork  (ou le menu KDE : T3 Code (fork))"
info "Publier la release : ./fork/release.sh"
