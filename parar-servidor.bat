@echo off
setlocal

echo Encerrando processos Node.js em execucao...
taskkill /F /IM node.exe >nul 2>nul

if errorlevel 1 (
    echo Nenhum processo node.exe estava em execucao.
) else (
    echo Servidor encerrado com sucesso.
)

echo.
pause
