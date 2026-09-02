# Fork kunail de T3 Code

Objectif : ajouter des fonctionnalités sans jamais empêcher de suivre `pingdotgg/t3code`.

Upstream n'accepte pas les contributions (`CONTRIBUTING.md`). Ce fork est donc
permanent : la charge de merge ne partira jamais. Toute la stratégie consiste à
la garder proche de zéro.

## Branches

| Branche | Rôle |
|---|---|
| `main` | Miroir strict de `upstream/main`. **On n'y commit jamais.** Fast-forward uniquement. |
| `kunail` | Le travail. Rebasée sur `main` à chaque sync. |

`main` reste intact pour que `gh repo sync` et le bouton *Sync fork* de GitHub
continuent de fonctionner sans intervention.

## Se mettre à jour

```bash
./fork/sync.sh          # fetch upstream, ff main, rebase kunail
./fork/audit.sh         # dette de fork + collisions à venir
```

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

| Objectif | Seam | Coût en fichiers de base |
|---|---|---|
| OpenRouter en direct | Nouveau driver + adapter, inscrit dans `BUILT_IN_DRIVERS` | 1 ligne (`apps/server/src/provider/Layers/builtInDrivers.ts`) |
| Speech to prompt | Implémenter le contrat `VoiceTranscriber` de `packages/client-runtime` | Frontière déjà documentée (`docs/internals/voice-input.md`) |
| Lancer ComfyUI | Serveur MCP externe | zéro |
| Affichage multimédia | `CanonicalItemType` dans `packages/contracts/src/providerRuntime.ts` + rendu | invasif, voir plus bas |
| Text to speech | Aucun seam existant | à concevoir |

L'affichage multimédia est le seul qui touche le contrat wire partagé par les
trois clients (web, desktop, mobile). C'est la fonctionnalité qui coûtera le
plus cher en maintenance : à traiter en dernier, et à isoler dans un commit
unique et minimal.
