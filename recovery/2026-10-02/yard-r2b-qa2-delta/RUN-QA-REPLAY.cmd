@echo off
setlocal
cd /d "%~dp0"
node "preview\yard-courtyard\qa\run-qa.mjs" --root "%CD%" --case mouse-full
set "QA_EXIT=%ERRORLEVEL%"
pause
exit /b %QA_EXIT%
