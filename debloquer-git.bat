@echo off
chcp 65001 >nul
title Debloquer Git
cd /d "%~dp0"

echo.
echo   ================================================================
echo     DEBLOCAGE DE GIT
echo   ================================================================
echo.
echo   Un fichier de verrou empeche Git d'enregistrer vos modifications.
echo   Ce script le retire. Vos fichiers ne sont pas touches.
echo.

if not exist ".git" (
  echo   Ce dossier n'est pas un depot Git.
  pause
  exit /b 1
)

echo   Verrous presents avant nettoyage :
echo   ----------------------------------------------------------------
dir /a /b ".git\*.lock" 2>nul
dir /a /b ".git\refs\heads\*.lock" 2>nul
echo   ----------------------------------------------------------------
echo.

rem  /a retire aussi les fichiers caches ou en lecture seule.
attrib -r -h -s ".git\*.lock" >nul 2>&1
del /f /q /a ".git\index.lock" >nul 2>&1
del /f /q /a ".git\HEAD.lock" >nul 2>&1
del /f /q /a ".git\config.lock" >nul 2>&1
del /f /q /a ".git\refs\heads\*.lock" >nul 2>&1

set "RESTE="
if exist ".git\index.lock" set "RESTE=1"
if exist ".git\HEAD.lock" set "RESTE=1"

if defined RESTE (
  echo   ECHEC : un verrou resiste encore.
  echo.
  echo   Cela signifie qu'un programme le tient ouvert. Fermez :
  echo     - Visual Studio Code
  echo     - toute fenetre Git Bash ou invite de commandes
  echo     - GitHub Desktop
  echo   puis relancez ce fichier.
  echo.
  echo   En dernier recours, redemarrez le PC : les verrous ne survivent
  echo   pas a un redemarrage.
  echo.
  pause
  exit /b 1
)

echo   Verrous retires.
echo.
echo   Etat du depot :
echo   ----------------------------------------------------------------
git status --short
echo   ----------------------------------------------------------------
echo.
echo   Vous pouvez maintenant lancer  envoyer-sur-github.bat
echo.
pause
