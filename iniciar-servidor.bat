@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js nao encontrado nesta maquina.
    echo.
    echo Instale o Node.js 20 ou superior e tente novamente:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Instalando dependencias pela primeira vez...
    call npm.cmd install
    if errorlevel 1 (
        echo.
        echo Falha ao instalar as dependencias.
        pause
        exit /b 1
    )
)

echo.
echo Iniciando o servidor em http://localhost:3000
echo Feche esta janela para encerrar o servidor.
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
call npm.cmd start

echo.
echo Servidor encerrado.
pause
