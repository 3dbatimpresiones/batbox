@echo off
title BATBOX - servidor local
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install
)
start "" http://localhost:5173/batbox/
call npm run dev
