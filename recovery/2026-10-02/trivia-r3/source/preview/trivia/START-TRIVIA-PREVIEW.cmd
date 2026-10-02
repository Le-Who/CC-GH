@echo off
cd /d "%~dp0"
if not exist scripts\trivia-preview-serve.mjs cd /d "%~dp0\..\.."
echo Trivia OFFLINE LOCAL PREVIEW - local static files only
echo Open http://127.0.0.1:4185/ after the server starts.
echo Stop with Ctrl+C. Nothing is installed or downloaded.
node scripts\trivia-preview-serve.mjs
if errorlevel 1 pause
