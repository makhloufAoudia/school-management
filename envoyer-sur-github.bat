@echo off
chcp 65001 >nul
title Enregistrer et envoyer le code sur GitHub
cd /d "%~dp0"

echo.
echo   ================================================================
echo     ENREGISTREMENT ET ENVOI DU CODE
echo   ================================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo   Git n'est pas installe sur cette machine.
  echo   Telechargez-le sur https://git-scm.com puis relancez ce fichier.
  echo.
  start https://git-scm.com/download/win
  pause
  exit /b 1
)

rem  Verrous laisses par une operation interrompue. Sans danger a retirer
rem  si aucune fenetre Git n'est ouverte : Git les recree au besoin.
set "VERROU="
if exist ".git\index.lock" set "VERROU=1"
if exist ".git\HEAD.lock" set "VERROU=1"
if defined VERROU (
  echo   Verrous Git residuels detectes, suppression...
  del /f /q ".git\index.lock" >nul 2>&1
  del /f /q ".git\HEAD.lock" >nul 2>&1
  del /f /q ".git\config.lock" >nul 2>&1
  del /f /q ".git\refs\heads\*.lock" >nul 2>&1
  echo.
)

echo   Fichiers modifies :
echo   ----------------------------------------------------------------
git status --short
echo   ----------------------------------------------------------------
echo.

git add -A
if errorlevel 1 (
  echo   Impossible de preparer les fichiers.
  pause
  exit /b 1
)

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Mode domaine unique : plus de sous-domaine par ecole"
  if errorlevel 1 (
    echo.
    echo   ----------------------------------------------------------------
    echo   L'ENREGISTREMENT A ECHOUE - on s'arrete ici.
    echo   Rien ne sera envoye. Copiez le message ci-dessus et envoyez-le moi.
    echo   ----------------------------------------------------------------
    echo.
    pause
    exit /b 1
  )
) else (
  echo   Rien de nouveau a enregistrer.
)
echo.

echo   Ce qui va partir sur GitHub :
echo   ----------------------------------------------------------------
git log --oneline origin/main..HEAD
echo   ----------------------------------------------------------------
echo.
echo   Une fenetre peut demander vos identifiants GitHub.
echo   Si un mot de passe est reclame, ce n'est PAS celui du site :
echo   il faut un "personal access token", a creer sur
echo   https://github.com/settings/tokens
echo.
pause

echo.
git push
if errorlevel 1 (
  echo.
  echo   ----------------------------------------------------------------
  echo   L'envoi a echoue. Copiez le message ci-dessus et envoyez-le moi.
  echo   ----------------------------------------------------------------
  echo.
  pause
  exit /b 1
)

echo.
echo   ================================================================
echo     ENVOYE
echo   ================================================================
echo.
echo   Vercel reconstruit automatiquement l'application.
echo   Comptez deux minutes, puis ouvrez :
echo.
echo       https://maxschool.duckdns.org/fr/login
echo.
pause
