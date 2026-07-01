# Sciage — Optimiseur de schéma de sciage

Application autonome (indépendante de Cubeur) pour générer des schémas de sciage
de grumes : placement des produits, cotes de départ par face, rendement.

---

## Déploiement (même recette que Cubeur)

| Info | Valeur |
|------|--------|
| **Stack** | Create React App (`react-scripts 5.0.1`) — PAS Vite |
| **Fichier principal** | `sciage/src/App.js` (React, tout en un seul fichier) |
| **URL cible** | `sciage-scierie.vercel.app` (au choix) |

### Étapes

1. **GitHub** — créer un dépôt `sciage-scierie`. Y déposer le contenu du dossier
   `sciage/` (donc `package.json`, `src/`, `public/`, `.gitignore`).

2. **Vercel** — « New Project » → importer le dépôt GitHub. Vercel détecte
   automatiquement Create React App. Laisser les réglages par défaut :
   - Build Command : `react-scripts build` (auto)
   - Output Directory : `build` (auto)
   - Install Command : `npm install` (auto)
   Cliquer « Deploy ». En ~2 min l'URL est en ligne.

### Mettre à jour l'app plus tard
GitHub → `sciage/src/App.js` → ✏️ (éditer) → coller la nouvelle version →
« Commit changes ». Vercel redéploie tout seul en ~2 min.

---

## Structure des fichiers

```
sciage/
├── package.json          ← dépendances (ne pas toucher)
├── .gitignore
├── public/
│   └── index.html        ← page hôte (fond #1E2023, titre "Sciage")
└── src/
    ├── index.js          ← point d'entrée React (monte <App/>)
    └── App.js            ← toute l'application (optimiseur + schémas)
```

---

## Ce que fait l'application

- **Saisie grume** : diamètre culée + fin bout (tronc de cône), longueur,
  trait de scie, épaisseur d'aubier.
- **Produits** : nom, essence, épaisseur, largeur, longueur de débit, quantité.
  L'ordre de la liste = ordre de priorité au sciage.
- **Schéma de section 2D** : coupe de la grume avec les pièces placées
  (grosses au centre, planches sur les flancs), cotes largeur × épaisseur.
- **Cotes de départ** : distance du 1ᵉʳ trait depuis le bord du duramen
  (hors aubier) dans les 4 directions.
- **Profil du tronc** : vue en longueur culée → fin bout.
- **Objectif** : rendement matière (remplir au max) ou respecter les quantités.

---

## Notes techniques

- Aucune dépendance externe (pas de npm autre que React), aucun `localStorage`.
  L'app est 100 % autonome et fonctionne hors ligne une fois chargée.
- Le composant principal est exporté par défaut depuis `App.js`
  (`export default function App()`).
- Pour intégrer plus tard cette fonctionnalité dans Cubeur comme 6ᵉ onglet 📐,
  il suffira de reprendre la logique de `App.js` et de la brancher sur la
  navigation par onglets de Cubeur.
