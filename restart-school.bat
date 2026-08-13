@echo off
REM ==== Arret propre + rebuild + relance de School (port 3001) ====
REM Le build est enregistre dans school-launch.log PUIS affiche a l'ecran.
REM Le serveur, lui, ecrit directement dans cette fenetre.
chcp 65001 >nul
cd /d "E:\claude 2026\school"
set "LOG=school-launch.log"

echo.
echo ============================================================
echo   REDEMARRAGE DE SCHOOL
echo ============================================================
echo [%time%] Arret du serveur node en cours...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 >nul

echo [%time%] Build en cours... (30 a 60 secondes, patientez)
call npm run build > "%LOG%" 2>&1
set "BUILD_ERR=%errorlevel%"

echo.
type "%LOG%"
echo.

if not "%BUILD_ERR%"=="0" (
    echo ============================================================
    echo   *** ERREUR PENDANT LE BUILD *** Details ci-dessus.
    echo ============================================================
    pause
    exit /b 1
)

echo ============================================================
echo   BUILD OK - demarrage du serveur sur http://localhost:3001
echo   Laissez CETTE FENETRE OUVERTE : elle fait tourner le site.
echo   Pour arreter : Ctrl+C, ou fermez la fenetre.
echo.
echo   NB : l'avertissement "next start does not work with
echo        output: standalone" est normal et sans consequence.
echo ============================================================
echo.
call npm run start
