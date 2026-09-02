#!/usr/bin/env bash
# Construit l'AppImage du fork et l'installe comme "T3 Code (fork)".
#
# Contourne la toolchain rustup orpheline (1.94.1) qui masque le rustc
# systeme dans le PATH : le composant natif resource-monitor exige >= 1.95.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

info() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31mxx\033[0m %s\n' "$1" >&2; exit 1; }

# rustc systeme d'abord, toolchain rustup orpheline retiree.
PATH="/usr/bin:$HOME/.local/share/vite-plus/bin:$(printf '%s' "$PATH" | tr ':' '\n' | grep -v rustup | paste -sd:)"
export PATH

RUSTC_VERSION="$(rustc --version | awk '{print $2}')"
info "rustc $RUSTC_VERSION"
case "$RUSTC_VERSION" in
  1.9[5-9]*|1.[0-9][0-9][0-9]*|2.*) ;;
  *) die "rustc >= 1.95 requis pour resource-monitor (trouve $RUSTC_VERSION)" ;;
esac

command -v vp >/dev/null || die "vp introuvable. Voir docs/internals/scripts.md"

info "Build AppImage linux/x64"
vp run dist:desktop:linux

ARTIFACT="$(ls -t "$REPO_DIR"/release/T3-Code-*-x86_64.AppImage 2>/dev/null | head -1)"
[ -n "$ARTIFACT" ] || die "Aucun AppImage produit dans release/"

install -d "$HOME/Applications"
ln -sfn "$ARTIFACT" "$HOME/Applications/T3-Code-fork.AppImage"

info "Build OK : $(basename "$ARTIFACT")"
info "Lie a ~/Applications/T3-Code-fork.AppImage"
info "Lancer avec : t3code-fork  (ou le menu KDE : T3 Code (fork))"
