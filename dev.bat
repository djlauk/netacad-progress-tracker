@echo off
rem Startet den Server im Vordergrund im DEVELOP mode. Doppelklick oeffnet ein eigenes Fenster;
rem Aufruf aus einer bestehenden Konsole laeuft direkt darin. Beenden: Strg+C.
cd /d "%~dp0"
if not exist node_modules (
  echo node_modules fehlt - installiere Abhaengigkeiten...
  call npm install || goto :fail
)
call npm run dev
:fail
echo.
pause
