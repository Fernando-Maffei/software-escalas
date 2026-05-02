@echo off
setlocal

cd /d "%~dp0"

set "VERSAO=%~1"

if "%VERSAO%"=="" (
    echo.
    echo Informe a nova versao no formato x.y.z.
    echo Exemplo: 1.0.1
    echo.
    set /p VERSAO=Versao (deixe vazio para manter a atual): 
)

echo.
if "%VERSAO%"=="" (
    echo Abrindo gerador visual do instalador com a versao atual...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\show-installer-builder.ps1"
) else (
    echo Abrindo gerador visual do instalador para a versao %VERSAO%...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\show-installer-builder.ps1" "%VERSAO%"
)
