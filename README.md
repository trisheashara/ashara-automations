# Ashara Automations

Module maison pour Foundry VTT, créé pour le serveur **Ashara**.

Ce module ajoute des automatisations personnalisées pour D&D 5e sans remplacer complètement DAE, Midi-QOL ou les autres modules d'automatisation. L'objectif est de garder un contrôle simple, lisible et adapté aux besoins du serveur Ashara.

## Compatibilité

- Foundry VTT : v13
- Système : D&D5e 5.3.0
- Module testé avec :
  - Midi-QOL
  - DAE
  - Times Up
  - libWrapper

## Installation via Foundry

Dans Foundry, utiliser l'URL de manifest suivante :

```text
https://raw.githubusercontent.com/trisheashara/ashara-automations/main/module.json
```

Puis activer le module **Ashara Automations** dans le monde concerné.

## Mise à jour

Le module contient dans son `module.json` les liens nécessaires pour les mises à jour Foundry :

```json
"manifest": "https://raw.githubusercontent.com/trisheashara/ashara-automations/main/module.json",
"download": "https://github.com/trisheashara/ashara-automations/archive/refs/heads/main.zip"
```

À chaque modification locale du module sur le serveur Foundry :

```bash
cd /foundrydata/Data/modules/ashara-automations
node --check scripts/main.js
git add .
git commit -m "Update Ashara Automations"
git push
sudo systemctl restart foundryvtt
```

## Automatisations actuellement gérées

Le module contient notamment des automatisations pour :

- Aid / Aide
- Longstrider / Grande foulée
- Darkvision / Vision dans le noir
- Mage Armor / Armure du mage
- Shield of Faith / Bouclier de la foi
- False Life / Simulacre de vie
- Heroism / Héroïsme
- Armor of Agathys / Armure d'Agathys
- Protection from Evil and Good / Protection contre le mal et le bien
- Sanctuary / Sanctuaire
- Jump / Saut
- Expeditious Retreat / Repli expéditif

### Automatisations en cours de refonte / non finalisées

Les automatisations suivantes sont présentes dans le code mais ne doivent pas encore être considérées comme stables :

- Hex / Maléfice
  - cible et flags Ashara en cours de stabilisation ;
  - effets visibles non finalisés ;
  - interaction avec DAE / Midi-QOL encore à revoir ;
  - dégâts bonus à ne pas considérer comme fiables pour le moment.

- Hunter's Mark / Marque du chasseur
  - cible et flags Ashara en cours de stabilisation ;
  - effets visibles non finalisés ;
  - interaction avec DAE / Midi-QOL encore à revoir ;
  - dégâts bonus à ne pas considérer comme fiables pour le moment.

Certaines automatisations peuvent être encore en test selon la version en cours.

## Commandes utiles en console Foundry

Vérifier la version chargée :

```js
window.ASHARA_AUTOMATIONS.version
```

Afficher l'API disponible :

```js
window.ASHARA_AUTOMATIONS
```

Appliquer Sanctuary manuellement au token sélectionné, si disponible dans la version courante :

```js
await window.ASHARA_AUTOMATIONS.applySanctuaryToSelected()
```

## Vérification avant chaque mise à jour

Avant de pousser une modification sur GitHub, vérifier que le fichier principal ne contient pas d'erreur de syntaxe :

```bash
node --check /foundrydata/Data/modules/ashara-automations/scripts/main.js
```

Si la commande ne retourne rien, le fichier JavaScript est valide.

## Sauvegardes

Les fichiers de sauvegarde locaux sont ignorés par Git grâce au `.gitignore` :

```gitignore
*.bak*
*.log
.DS_Store
node_modules/
```

## Notes

Ce module est conçu pour le serveur privé Ashara. Il n'a pas vocation à remplacer les grands modules d'automatisation généralistes. Il sert surtout à stabiliser les effets les plus utilisés sur le serveur, avec des règles adaptées à notre configuration Foundry.
