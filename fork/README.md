# Fork kunail de T3 Code

Objectif : ajouter des fonctionnalités sans jamais empêcher de suivre `pingdotgg/t3code`.

Upstream n'accepte pas les contributions (`CONTRIBUTING.md`). Ce fork est donc
permanent : la charge de merge ne partira jamais. Toute la stratégie consiste à
la garder proche de zéro.

## Branches

| Branche  | Rôle                                                                                 |
| -------- | ------------------------------------------------------------------------------------ |
| `main`   | Miroir strict de `upstream/main`. **On n'y commit jamais.** Fast-forward uniquement. |
| `kunail` | Le travail. Rebasée sur `main` à chaque sync.                                        |

`main` reste intact pour que `gh repo sync` et le bouton _Sync fork_ de GitHub
continuent de fonctionner sans intervention.

## Se mettre à jour

```bash
./fork/sync.sh          # fetch upstream, ff main, rebase kunail
./fork/audit.sh         # dette de fork + collisions à venir
./fork/build-linux.sh   # build AppImage + latest-linux.yml
./fork/release.sh       # publie la release v<version> sur le fork
```

Les deux dernières étapes ne servent qu'à la mise à jour automatique (voir plus
bas). Le sync seul suffit si tu n'attends pas de release.

`git rerere` est actif : un conflit résolu une fois est rejoué automatiquement
aux syncs suivants. C'est ce qui rend un rebase répété supportable.

## La règle qui décide de tout

**Ajouter des fichiers ne coûte rien. Modifier des fichiers de base coûte à chaque sync.**

Un fichier que seul le fork crée ne peut pas entrer en conflit : git résout les
conflits fichier par fichier. Un fichier que le fork et upstream modifient tous
les deux est un conflit à rejouer à chaque rebase.

Donc :

1. Tout code nouveau va dans un chemin qu'upstream ne créera jamais
   (`fork/`, ou un suffixe `.fork.ts` à côté du fichier concerné).
2. Un fichier de base n'est modifié qu'au **point d'enregistrement** : la ligne
   qui déclare l'extension, rien d'autre. Si une modification dépasse quelques
   lignes, c'est que la logique doit sortir dans un fichier à part.
3. Chaque modification de fichier de base vit dans **son propre commit**,
   préfixé `fork:`. Un conflit reste ainsi rattachable à une seule fonctionnalité,
   et une fonctionnalité peut être abandonnée sans démêler les autres.
4. `./fork/audit.sh` doit rester lisible. Le jour où la liste des fichiers
   modifiés s'allonge, la dette est en train de devenir le problème.

## Points d'extension repérés dans T3 Code

| Objectif             | Seam                                                                         | Coût en fichiers de base                                      |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| OpenRouter en direct | Nouveau driver + adapter, inscrit dans `BUILT_IN_DRIVERS`                    | 1 ligne (`apps/server/src/provider/Layers/builtInDrivers.ts`) |
| Speech to prompt     | Implémenter le contrat `VoiceTranscriber` de `packages/client-runtime`       | Frontière déjà documentée (`docs/internals/voice-input.md`)   |
| Lancer ComfyUI       | Serveur MCP externe                                                          | zéro                                                          |
| Affichage multimédia | `CanonicalItemType` dans `packages/contracts/src/providerRuntime.ts` + rendu | invasif, voir plus bas                                        |
| Text to speech       | Aucun seam existant                                                          | à concevoir                                                   |

L'affichage multimédia est le seul qui touche le contrat wire partagé par les
trois clients (web, desktop, mobile). C'est la fonctionnalité qui coûtera le
plus cher en maintenance : à traiter en dernier, et à isoler dans un commit
unique et minimal.

## Utiliser le fork sur cette machine

```bash
./fork/build-linux.sh    # build AppImage + lien ~/Applications/T3-Code-fork.AppImage
t3code-fork              # lance le fork  (menu KDE : "T3 Code (fork)")
./fork/release.sh        # publie la release, pour la mise à jour auto
```

L'app officielle reste installée et lançable à côté, inchangée.

### Comment les deux cohabitent

Deux variables d'environnement dans `~/.local/bin/t3code-fork`, **sans aucune
modification du code de base** :

| Variable                            | Ce qu'elle isole                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `T3CODE_HOME=~/.t3-fork`            | État applicatif : threads, settings, secrets, `state.sqlite`. Initialisé par un `sqlite3 .backup` de `~/.t3/userdata`.                                                                                                                                                                                                                                                                             |
| `XDG_CONFIG_HOME=~/.t3-fork/config` | Profil Electron. Indispensable : `userDataDirName` vaut `"t3code"` en dur (`apps/desktop/src/app/DesktopEnvironment.ts:181`) et ignore `T3CODE_HOME`. Sans ça, le fork partagerait `~/.config/t3code` — dont le verrou single-instance tenu par le bridge Clerk (`apps/desktop/src/app/DesktopClerk.ts:128`) : le fork se contenterait de révéler la fenêtre de l'app officielle, puis de quitter. |

`XDG_CONFIG_HOME` est hérité par les CLI d'agents que le serveur lance
(`opencode` lit `~/.config/opencode`, git lit `~/.config/git`). Le lanceur
reflète donc tout `~/.config` par symlink, sauf `t3code`, et rejoue ce miroir
à chaque démarrage.

Le lanceur retire aussi `ELECTRON_RUN_AS_NODE`, hérité par tout terminal ouvert
**dans** T3 Code. Sans ça l'AppImage démarre en simple Node : aucune fenêtre,
et le processus attend sur stdin indéfiniment.

### Mise à jour automatique

L'updater de l'AppImage ne s'active que si quatre conditions sont réunies
(`apps/desktop/src/updates/DesktopUpdates.ts:248`, `getAutoUpdateDisabledReason`) :

1. un `app-update.yml` est embarqué dans les resources de l'AppImage ;
2. la build est empaquetée (pas un `electron-vite dev`) ;
3. `T3CODE_DISABLE_AUTO_UPDATE` est absent — c'est la variable que le lanceur
   posait avant, elle a été retirée ;
4. sur Linux, l'app tourne depuis l'AppImage.

Seule la première manquait. Elle est débloquée par `T3CODE_DESKTOP_UPDATE_REPOSITORY`
posée par `fork/build-linux.sh` (défaut `kunail0804/t3code`, surchargeable) :
`scripts/build-desktop-artifact.ts` s'en sert pour construire la config de
publication d'electron-builder, qui embarque alors `app-update.yml` et produit
`latest-linux.yml` à côté de l'AppImage. Le build vérifie que ce fichier existe
et refuse de finir sinon.

Le cycle est : `sync.sh` → `build-linux.sh` → `release.sh`. La release doit être
publiée (ni brouillon ni prerelease), tagguée `v<version>` où `<version>` est le
champ `version` de `apps/server/package.json`, et porter les deux assets
`T3-Code-<version>-x86_64.AppImage` et `latest-linux.yml` : c'est ce que
electron-updater, canal « latest », vient chercher.

Conséquence assumée : l'updater ne verra **plus jamais** les releases upstream.
Sans release du fork après un sync, on reste sur une vieille build en croyant
être à jour. Le workflow `.github/workflows/fork-sync.yml` ferme ce trou : après
chaque sync, s'il n'existe pas de release `v<version>` exploitable (publiée et
portant les deux assets), il ouvre une issue pour le rappeler. Il ne construit
pas d'AppImage en CI — décision prise.

Le cron de ce workflow n'est exécuté par GitHub Actions que depuis la branche
par défaut du fork — `kunail` aujourd'hui, là où vit le fichier, et c'est
uniquement par là qu'il fonctionne. Passer la branche par défaut à `main` (le
réglage standard pour un miroir destiné à _Sync fork_) arrêterait le cron sans
un bruit : ne pas le faire, ou assumer de perdre la surveillance.

Détail d'installation : electron-updater garde le nom du fichier existant quand
il n'y trouve pas de numéro de version, et `T3-Code-fork.AppImage` n'en a pas.
La mise à jour remplace donc le symlink posé par `build-linux.sh` par un vrai
fichier, qui garde le même nom. Le `ln -sfn` du build suivant le recolle. À
savoir, pas à corriger.

### Prérequis de build

`resource-monitor` (Rust) exige rustc >= 1.95. Le paquet système est en 1.98,
mais une toolchain rustup orpheline en 1.94.1 la masque dans le PATH, déclarée
dans `~/.config/fish/config.fish:13` et `~/.zshrc:11`. `fork/build-linux.sh`
la contourne et vérifie la version avant de lancer le build.
