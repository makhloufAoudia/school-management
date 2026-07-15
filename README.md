# Gestion Scolaire — École Privée

Application de gestion d'école privée : élèves, enseignants, classes, cours, paiements et finances.

## Stack

- **Next.js 15** (App Router) + TypeScript + Tailwind CSS 4
- **Supabase** : base PostgreSQL + authentification + RLS
- **next-intl** : 4 langues — Français, العربية (RTL), Tamaziɣt, English
- **Vercel** : déploiement

## Rôles

| Rôle | Accès |
|---|---|
| `admin` | Tout : élèves, enseignants, classes, cours, paiements, finances |
| `teacher` | Ses cours, ses élèves, présences, notes, ses salaires |
| `parent` | Ses enfants : notes, présences, paiements |

## Démarrage

1. **Installer les dépendances**
   ```bash
   npm install
   ```

2. **Créer le projet Supabase**
   - Sur [supabase.com](https://supabase.com), créer un projet
   - SQL Editor → coller et exécuter `supabase/schema.sql`

3. **Configurer l'environnement**
   ```bash
   copy .env.example .env.local
   ```
   Remplir avec les clés (Dashboard Supabase → Settings → API).

4. **Créer le premier admin**
   - Supabase → Authentication → Add user (email + mot de passe)
   - SQL Editor : `update profiles set role = 'admin', full_name = 'Votre Nom' where id = '<user-id>';`

5. **Lancer**
   ```bash
   npm run dev
   ```

## Déploiement Vercel

1. Pousser le code sur GitHub
2. Importer le repo sur [vercel.com](https://vercel.com)
3. Ajouter les variables d'environnement (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Deploy

## Structure

```
app/[locale]/            Pages (préfixe de langue : /fr, /ar, /tzm, /en)
  login/                 Connexion
  (dashboard)/           Espace protégé (dashboard, élèves, enseignants...)
components/              Sidebar, sélecteur de langue...
i18n/                    Configuration des langues
lib/supabase/            Clients Supabase (browser, server, middleware)
messages/                Traductions (fr, ar, tzm, en)
supabase/schema.sql      Schéma complet de la base + RLS
```
