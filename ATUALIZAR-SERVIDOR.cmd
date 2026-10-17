@echo off
rem Dois cliques aqui para atualizar o App de Escalas nesta maquina (servidor).
rem Pede permissao de Administrador e roda scripts\atualizar-servidor.ps1.
net session >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\atualizar-servidor.ps1" %*
echo.
pause
