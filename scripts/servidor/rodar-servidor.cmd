@echo off
rem Mantem o servidor no ar. A tarefa agendada CentralDeEscalasServidor (criada
rem pelo instalar-servidor.ps1) roda este arquivo no boot, como SYSTEM:
rem
rem   rodar-servidor.cmd "C:\Program Files\nodejs\node.exe"
rem
rem Se o node cair, ele sobe de novo em 10 s. A saida vai para logs\servidor.log
rem (sem console, e ali que aparecem erros e avisos); passando de 10 MB, o log
rem atual vira servidor.log.1.
setlocal

set "NODE=%~1"
if "%NODE%"=="" set "NODE=node.exe"

cd /d "%~dp0..\.."
set "PASTA=%CD%"
if not exist "%PASTA%\logs" mkdir "%PASTA%\logs"
set "LOG=%PASTA%\logs\servidor.log"

:laco
if exist "%LOG%" for %%A in ("%LOG%") do if %%~zA GTR 10485760 move /y "%LOG%" "%LOG%.1" >nul
echo [%date% %time%] iniciando o servidor>> "%LOG%"
"%NODE%" "%PASTA%\backend\server.js" >> "%LOG%" 2>&1
echo [%date% %time%] o servidor parou (codigo %errorlevel%); reinicio em 10 s>> "%LOG%"
rem ping no lugar de timeout: timeout falha quando nao ha console (SYSTEM).
ping -n 11 127.0.0.1 >nul
goto laco
