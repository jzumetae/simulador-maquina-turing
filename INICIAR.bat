@echo off
rem =========================================================
rem  Simulador - Maquina de Turing
rem  Doble clic para abrir el proyecto en el navegador.
rem  Inicia un servidor local (sin instalar nada) y abre el menu.
rem  Deja abierta la ventana negra mientras usas el simulador.
rem =========================================================
title Simulador - Maquina de Turing
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0herramientas\servidor.ps1" %*
if errorlevel 1 (
  echo.
  echo  No se pudo iniciar el servidor. Revisa el mensaje de arriba.
  pause
)
