@echo off
cd /d "%~dp0"
node preview\yard-courtyard\qa\run-qa.mjs --root "%CD%" %*
pause
