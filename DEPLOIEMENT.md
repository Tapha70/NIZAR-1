# 🚀 Déploiement - NTV Stock (Nizar Transport Voyageurs)

## Architecture

```
┌─────────────────┐      HTTPS/WSS      ┌──────────────────┐
│  Mobile (PWA)   │◄────────────────────►│  API Backend     │
│  (téléphone)    │                      │  Node.js +       │
│  • Scan code-barres│                   │  Express +       │
│  • Entrée/Sortie│                      │  MongoDB Atlas   │
└─────────────────┘                      │  • Auth JWT      │
                                         │  • Sync temps réel│
                                         └─────────┬────────┘
                                                   │
┌─────────────────┐                               │
│  Desktop        │◄──────────────────────────────┘
│  (Windows,      │      HTTPS/WSS
│  Electron)      │
│  • Tout sauf    │
│    le scan      │
└─────────────────┘
```

---

## 📋 Prérequis

- Node.js >= 16
- Compte MongoDB Atlas (gratuit)
- Compte Render ou Railway (pour héberger le backend)

---

## 1. Base de données MongoDB Atlas

1. Créer un compte sur [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Créer un cluster gratuit (shared)
3. Créer un utilisateur de base de données
4. Ajouter votre IP à la liste d'autorisation (ou 0.0.0.0/0 pour accès partout)
5. Récupérer la chaîne de connexion : `mongodb+srv://user:password@cluster.xxxxx.mongodb.net/nizar_stock?retryWrites=true&w=majority`

---

## 2. Backend (Render / Railway)

### Option A : Render

1. Pousser le code du dossier `backend/` sur un dépôt GitHub
2. Connecter Render au dépôt
3. Ajouter les variables d'environnement :
   ```
   PORT=5000
   NODE_ENV=production
   MONGODB_URI=mongodb+srv://...
   JWT_SECRET=une-clef-secrete-tres-longue
   CORS_ORIGIN=*
   ```
4. Déployer

### Option B : Railway

1. Connecter le dépôt GitHub
2. Ajouter les mêmes variables d'environnement
3. Déployer

---

## 3. Application Mobile (PWA)

Le dossier `mobile/` contient une PWA complète.

### Installation sur Android

1. Héberger les fichiers `mobile/` sur GitHub Pages, Netlify, ou tout hébergement statique
2. Ouvrir l'URL dans Chrome sur Android
3. Menu ⋮ → "Installer l'application"
4. L'icône NTV Stock apparaît sur l'écran d'accueil

### Configuration

Dans `mobile/app.js`, modifier `API_BASE` pour pointer vers votre backend :
```javascript
const API_BASE = 'https://votre-backend.onrender.com';
```

---

## 4. Application Desktop Windows

### Prérequis

- Node.js installé sur Windows
- Git

### Installation

```bash
cd desktop
npm install
npm start
```

### Création de l'installeur Windows (.exe)

```bash
cd desktop
npm install
npx electron-builder --win
```

L'installeur se trouve dans `desktop/dist/`.

---

## 5. Synchronisation temps réel

Le backend utilise Socket.io pour diffuser les modifications :
- Quand un utilisateur modifie une donnée sur mobile → tous les autres appareils sont notifiés
- Quand un utilisateur supprime un article → la suppression est répercutée partout
- Mode hors-ligne : les modifications sont mises en file d'attente et synchronisées à la reconnexion

---

## 6. Sécurité

- Authentification JWT (7 jours d'expiration)
- Hachage des mots de passe (bcrypt)
- Rate limiting (100 requêtes/15min par IP)
- Helmet.js pour les en-têtes de sécurité
- Validation des données avec express-validator
- CORS configuré

---

## 7. Structure des dossiers

```
nizar-stock/
├── backend/           # API Node.js + Express + MongoDB
│   ├── models/        # Modèles Mongoose
│   ├── routes/        # Routes API
│   ├── middleware/    # Auth, gestion d'erreurs
│   ├── server.js      # Point d'entrée
│   └── .env           # Variables d'environnement
├── mobile/            # PWA (HTML/CSS/JS)
│   ├── index.html
│   ├── app.js         # Logique métier
│   ├── style.css      # Charte graphique Nizar
│   ├── manifest.webmanifest
│   └── sw.js          # Service Worker
├── desktop/           # Application Windows (Electron)
│   ├── main.js        # Processus principal
│   ├── preload.js     # Script de préchargement
│   └── renderer/      # Interface utilisateur
│       ├── index.html
│       ├── style.css
│       └── app.js
└── DEPLOIEMENT.md     # Ce fichier
```

---

## 8. Charte graphique

- **Bleu ciel Nizar** : `#3B9AD9`
- **Bleu marine** : `#1A5C96`
- **Gris anthracite** : `#333333`
- **Blanc** : `#FFFFFF`

Le logo de l'aigle Nizar Transport est utilisé dans l'entête des deux applications.

---

## 9. Fonctionnalités

| Fonction | Mobile | Desktop |
|----------|--------|---------|
| Scan code-barres | ✅ | ❌ (webcam insuffisante) |
| Consulter stock | ✅ | ✅ |
| Entrée / Sortie | ✅ | ✅ |
| Inventaire | ✅ | ✅ |
| Bon de sortie | ✅ | ✅ |
| Fiche de réception | ✅ | ✅ |
| Export Excel | ✅ | ✅ |
| Synchronisation temps réel | ✅ | ✅ |
| Mode hors-ligne | ✅ | ✅ |
| Suppression globale | ✅ | ✅ |

---

## 10. Support

Pour toute question, contacter le développeur ou ouvrir une issue sur le dépôt GitHub.