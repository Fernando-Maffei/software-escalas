@echo off
setlocal enabledelayedexpansion

set "PORTA=%PORT%"
if "%PORTA%"=="" set "PORTA=4450"

echo Procurando o servidor na porta %PORTA%...

set "PID_ENCONTRADO="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /C:"LISTENING" ^| findstr /C:":%PORTA% "') do (
    set "PID_ENCONTRADO=%%P"
)

if not defined PID_ENCONTRADO (
    echo Nenhum servidor encontrado escutando na porta %PORTA%.
    echo.
    pause
    exit /b 0
)

echo Encerrando processo (PID !PID_ENCONTRADO!) na porta %PORTA%...
taskkill /F /PID !PID_ENCONTRADO!

if errorlevel 1 (
    echo Nao foi possivel encerrar o processo automaticamente.
) else (
    echo Servidor encerrado com sucesso.
)

echo.
pause
