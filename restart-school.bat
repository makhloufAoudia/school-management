@echo off
REM ==== Arret propre + rebuild + relance de School (port 3001) ====
cd /d "E:\claude 2026\school"

echo [%date% %time%] Arret du serveur node en cours...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 >nul

echo [%date% %time%] Build en cours... > "school-launch.log"
call npm run build >> "school-launch.log" 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERREUR pendant le build. Voir school-launch.log >> "school-launch.log"
    echo ERREUR pendant le build. Voir school-launch.log
    pause
    exit /b 1
)

echo [%date% %time%] Demarrage du serveur sur http://localhost:3001 >> "school-launch.log"
call npm run start >> "school-launch.log" 2>&1
