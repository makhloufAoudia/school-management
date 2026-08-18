> **Adresse unique — état actuel du projet.**
> L'application vit sur **une seule adresse : <https://maxschool.duckdns.org>**.
> Il n'y a plus de sous-domaine par école (`el-nour.maxschool...`) : tout le
> monde se connecte au même endroit, l'école est déduite du compte. Toute
> autre adresse publique est redirigée automatiquement (voir
> `ADRESSE-UNIQUE.md`). Les passages ci-dessous qui décrivent des
> sous-domaines ou un certificat wildcard ne s'appliquent plus.

# Déploiement sur Vercel

Guide pour mettre l'application (multi-écoles, Next.js 15 + Supabase + Google Drive) en ligne sur Vercel.

## Ce qui a été corrigé pour Vercel

L'upload des PDF de cours passait par un *server action* : le fichier transitait par le serveur Next.js. Sur Vercel, le corps d'une requête serverless est limité à **~4,5 Mo**, donc les gros PDF auraient échoué.

Désormais, l'upload se fait **directement du navigateur vers Google Drive** (session « resumable ») :

1. `startMaterialUpload()` (serveur) ouvre une session et renvoie une URL d'upload.
2. Le navigateur envoie le PDF directement à cette URL (le fichier ne passe plus par Vercel).
3. `finalizeMaterial()` (serveur) rend le fichier lisible et enregistre la fiche en base.

Résultat : plus aucune limite Vercel sur la taille des fichiers. La limite reste fixée à **15 Mo** côté application (modifiable dans `MAX_PDF_BYTES`, `components/courses/courses-view.tsx`). Aucun token Google n'est exposé au navigateur (l'URL de session porte son propre jeton d'upload).

## Variables d'environnement à configurer sur Vercel

Dans le dashboard Vercel : **Settings → Environment Variables**. Ne jamais committer ces valeurs.

| Variable | Type | Où la trouver |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | publique | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publique | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **secrète** | Supabase → Settings → API → service_role |
| `GOOGLE_OAUTH_CLIENT_ID` | publique | Google Cloud Console → client OAuth « Web » |
| `GOOGLE_OAUTH_CLIENT_SECRET` | **secrète** | Google Cloud Console |
| `GOOGLE_REFRESH_TOKEN` | **secrète** | obtenu via `/api/google/auth` |
| `GOOGLE_DRIVE_FOLDER_ID` | — | ID du dossier Drive de destination |
| `NEXT_PUBLIC_CURRENCY` | publique (option.) | ex : `DA`, `€`, `MAD` — défaut `DA` |
| `NEXT_PUBLIC_SITE_URL` | publique | l'adresse unique du site : `https://maxschool.duckdns.org` |

Les valeurs actuelles sont dans ton `.env.local` (à ne PAS pousser). Le `GOOGLE_REFRESH_TOKEN` que tu utilises en local reste valable en production (même client OAuth).

## Étapes de déploiement

1. **Initialiser Git** (le projet n'a pas encore de dépôt) et pousser sur GitHub/GitLab :

   ```bash
   git init
   git add .
   git commit -m "Prêt pour Vercel"
   git remote add origin <url-de-ton-depot>
   git push -u origin main
   ```

   Vérifie d'abord que `git status` ne liste **pas** `.env.local` ni `service-account-google.json` (ils sont dans `.gitignore`, donc normalement exclus).

2. **Importer le projet sur Vercel** : New Project → sélectionne le dépôt. Vercel détecte Next.js automatiquement, aucun réglage de build à changer.

3. **Ajouter les variables d'environnement** (tableau ci-dessus) pour l'environnement *Production* (et *Preview* si tu veux tester les branches).

4. **Déployer.** Vercel construit et met en ligne l'application.

## Configuration Google OAuth pour la production

Le client OAuth n'autorise pour l'instant que `http://localhost:3001/api/google/callback`. Pour la production, dans **Google Cloud Console → Identifiants → ton client OAuth Web**, ajoute l'URI de redirection :

```
https://<ton-domaine-vercel>/api/google/callback
```

Tu n'as besoin de re-générer un refresh token (via `/api/google/auth` sur le domaine de prod) que si tu changes de compte ou de client OAuth. Sinon, réutilise le token existant.

## Rappels importants

- **Secrets** : `.env.local` et `service-account-google.json` ne doivent jamais être commités (ils sont déjà ignorés par Git). Si `service-account-google.json` n'est pas utilisé par le code (l'app utilise OAuth), tu peux le supprimer du dossier.
- **Usage commercial** : le plan gratuit *Hobby* de Vercel est réservé au non-commercial. Une app qui gère des écoles clientes est un usage commercial → prévois le plan **Pro (~20 $/mois)** pour être en règle.
- **Base de données** : Supabase est externe et reste hébergé chez Supabase (son propre plan gratuit ou payant), indépendamment de Vercel.
- **Fichiers temporaires** : `build.log`, `.env.build` et `lib/_synctest.txt` (vides) ont été créés pendant la préparation — tu peux les supprimer.

## Limites du plan gratuit à garder en tête

- Fonctions serverless : ~10 s d'exécution max. Le téléchargement en `.zip` de nombreux gros PDF (`/api/courses/materials/zip`) pourrait dépasser ce délai si le volume est important — à surveiller.
- 100 Go de bande passante/mois.
