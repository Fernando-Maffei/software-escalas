@echo off
rem Cria o atalho "Central de Escalas" nas maquinas do TIME (nao no servidor).
rem Copie so este arquivo para o computador e de dois cliques. Ele pergunta o
rem endereco do servidor, testa a conexao e cria o atalho na Area de Trabalho e
rem no menu Iniciar. O atalho abre o sistema numa janela propria do Edge, sem
rem barra de endereco. Nao instala nada e nao precisa de Administrador.
rem
rem Para ja vir com o endereco:  CRIAR-ATALHO.cmd SERVIDOR-ESCALAS
rem Para trocar de servidor: rode de novo (o atalho e substituido).
setlocal
set "CRIAR_ATALHO_ENDERECO=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$codigo = (Get-Content -LiteralPath '%~f0' -Raw) -split '#INICIO-POWERSHELL#'; Invoke-Expression $codigo[2]"
echo.
pause
exit /b

#INICIO-POWERSHELL#
$ErrorActionPreference = 'Stop'
$NOME = 'Central de Escalas'
$PORTA_PADRAO = 4450

# "servidor", "192.168.0.50", "servidor:4450" ou "http://servidor:4450/" viram
# "http://servidor:4450".
function Convert-Endereco([string]$Texto) {
    $texto = $Texto.Trim().TrimEnd('/')

    if (-not $texto) {
        return ''
    }

    if ($texto -notmatch '^https?://') {
        $texto = "http://$texto"
    }

    $uri = [Uri]$texto

    if ($texto -notmatch '^https?://[^/]+:\d+') {
        # https sem porta (sistema na nuvem) fica na porta padrao do https.
        if ($uri.Scheme -eq 'https') {
            return "https://$($uri.Host)"
        }

        return "http://$($uri.Host):$PORTA_PADRAO"
    }

    return "$($uri.Scheme)://$($uri.Host):$($uri.Port)"
}

function Test-Servidor([string]$Url) {
    try {
        $saude = Invoke-RestMethod -Uri "$Url/api/health" -TimeoutSec 8
        return $saude.status -eq 'ok'
    } catch {
        return $false
    }
}

function Get-Navegador {
    $candidatos = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )

    return $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}

Write-Host "Atalho do $NOME" -ForegroundColor Green
Write-Host ''

$url = ''

if ($env:CRIAR_ATALHO_ENDERECO) {
    $url = Convert-Endereco $env:CRIAR_ATALHO_ENDERECO
}

while ($true) {
    if (-not $url) {
        Write-Host 'Endereco do servidor - o nome ou o IP da maquina servidora,'
        Write-Host 'o mesmo que aparece no final do instalador do servidor.'
        $url = Convert-Endereco (Read-Host 'Ex.: SERVIDOR-ESCALAS ou 192.168.0.50')

        if (-not $url) {
            continue
        }
    }

    Write-Host "Testando $url ..."

    if (Test-Servidor $url) {
        Write-Host 'Servidor respondeu.' -ForegroundColor Green
        break
    }

    Write-Host "O servidor nao respondeu em $url." -ForegroundColor Yellow
    Write-Host 'Confira o endereco, se o servidor esta ligado e se este computador esta na mesma rede.'
    $resposta = Read-Host 'Digite outro endereco, C para criar o atalho mesmo assim, ou Enter para sair'

    if (-not $resposta) {
        exit 1
    }

    if ($resposta -match '^[cC]$') {
        break
    }

    $url = Convert-Endereco $resposta
}

$navegador = Get-Navegador

if (-not $navegador) {
    Write-Host 'Nao achei o Microsoft Edge nem o Google Chrome neste computador.' -ForegroundColor Red
    Write-Host "Abra $url no navegador que tiver."
    exit 1
}

# Icone vem do proprio servidor; sem ele, o atalho fica com o icone do navegador.
$pasta = Join-Path $env:LOCALAPPDATA 'CentralEscalas'
New-Item -ItemType Directory -Force -Path $pasta | Out-Null
$icone = Join-Path $pasta 'central-escalas.ico'

try {
    Invoke-WebRequest -Uri "$url/assets/branding/central-escalas.ico" -OutFile $icone -UseBasicParsing -TimeoutSec 8
} catch {
    $icone = $null
}

$shell = New-Object -ComObject WScript.Shell
$destinos = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('Programs')
)

foreach ($destino in $destinos) {
    $atalho = $shell.CreateShortcut((Join-Path $destino "$NOME.lnk"))
    $atalho.TargetPath = $navegador
    $atalho.Arguments = "--app=$url"
    $atalho.WorkingDirectory = Split-Path $navegador
    $atalho.Description = "$NOME ($url)"

    if ($icone) {
        $atalho.IconLocation = "$icone,0"
    }

    $atalho.Save()
}

Write-Host ''
Write-Host "Pronto! Atalho '$NOME' criado na Area de Trabalho e no menu Iniciar." -ForegroundColor Green
Write-Host "Ele abre $url numa janela propria. Para fixar na barra de tarefas:"
Write-Host 'abra pelo atalho, clique com o botao direito no icone da barra e escolha "Fixar".'
$abrir = Read-Host 'Abrir agora? [S/n]'

if ($abrir -notmatch '^[nN]') {
    Start-Process -FilePath $navegador -ArgumentList "--app=$url"
}
