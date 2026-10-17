@echo off
rem Dois cliques aqui para instalar o App de Escalas nesta maquina (servidor).
rem Pede permissao de Administrador e roda scripts\instalar-servidor.ps1.
net session >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\instalar-servidor.ps1" %*
echo.
pause
