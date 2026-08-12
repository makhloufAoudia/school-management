@echo off
chcp 65001 >nul
title Ajouter maxschool.duckdns.org au projet Vercel
cd /d "%~dp0"

set "DOMAINE=maxschool.duckdns.org"
set "PROJET=school-management"

echo.
echo   ================================================================
echo     AJOUT DU DOMAINE %DOMAINE%
echo   ================================================================
echo.
echo   Ce script fait, en ligne de commande, ce que le formulaire du
echo   site rendait compliquee : rattacher le domaine au projet, puis
echo   afficher la configuration DNS attendue.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js n'est pas installe. https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo   ----------------------------------------------------------------
echo   ETAPE 1 sur 3 : connexion a Vercel
echo   ----------------------------------------------------------------
echo.
echo   Votre navigateur va s'ouvrir. Cliquez sur le bouton de
echo   confirmation, puis revenez ici. Si vous etes deja connecte,
echo   cette etape passe toute seule.
echo.
pause

call npx --yes vercel@latest whoami >nul 2>nul
if errorlevel 1 (
  call npx --yes vercel@latest login
  if errorlevel 1 (
    echo.
    echo   La connexion a echoue. Relancez ce fichier.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo   Connecte en tant que :
call npx --yes vercel@latest whoami
echo.

echo   ----------------------------------------------------------------
echo   ETAPE 2 sur 3 : rattachement du domaine
echo   ----------------------------------------------------------------
echo.
call npx --yes vercel@latest domains add %DOMAINE% %PROJET%
echo.

echo   ----------------------------------------------------------------
echo   ETAPE 3 sur 3 : configuration DNS attendue
echo   ----------------------------------------------------------------
echo.
echo   C'est CE QUI SUIT qui compte : Vercel indique l'enregistrement
echo   a creer. Recopiez tout et envoyez-le moi.
echo.
call npx --yes vercel@latest domains verify %DOMAINE% --project %PROJET%
echo.

echo   ================================================================
echo   TERMINE
echo   ================================================================
echo.
echo   Copiez tout le contenu de cette fenetre :
echo     clic droit sur la barre de titre  ^>  Modifier  ^>  Selectionner tout
echo     puis Entree pour copier.
echo.
pause
