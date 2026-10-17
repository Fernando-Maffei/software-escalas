# Atualiza o App de Escalas instalado pelo instalar-servidor.ps1. O jeito facil
# e dar dois cliques em ATUALIZAR-SERVIDOR.cmd (na raiz da pasta).
#
#   1. backup na hora (nada muda se ele falhar);
#   2. codigo novo: "git pull" se a pasta veio do Git; se veio de um .zip,
#      extraia o zip novo POR CIMA desta pasta antes de rodar (a configuracao
#      em backend\config e o .env nao estao no zip e ficam como estao);
#   3. para o servidor, instala as dependencias, sobe de novo e confere.
#
# As migrations de banco rodam sozinhas quando o servidor sobe.
param(
    [int]$Porta = 0
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'servidor\comum.ps1')

$PASTA_APP = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ARQUIVO_ENV = Join-Path $PASTA_APP '.env'

Write-Host 'Atualizacao do servidor - App de Escalas' -ForegroundColor Green
Write-Host "Pasta do app: $PASTA_APP"

if (-not (Test-Administrador)) {
    Stop-ComFalha 'Rode como Administrador: de dois cliques em ATUALIZAR-SERVIDOR.cmd e aceite o aviso do Windows.'
}

if (-not (Get-ScheduledTask -TaskName $NOME_TAREFA -ErrorAction SilentlyContinue)) {
    Stop-ComFalha 'Este servidor ainda nao foi instalado. Rode o INSTALAR-SERVIDOR.cmd primeiro.'
}

if (-not $Porta) {
    $Porta = [int]((Read-ArquivoEnv $ARQUIVO_ENV)['PORT'])

    if (-not $Porta) {
        $Porta = 4450
    }
}

Update-PathDaSessao
$node = Get-NodeInstalado

if (-not $node -or $node.Versao -lt $NODE_MINIMO) {
    Stop-ComFalha "O app precisa do Node.js $NODE_MINIMO ou mais novo. Instale por https://nodejs.org e rode de novo."
}

$versaoAntes = (Get-Content (Join-Path $PASTA_APP 'package.json') -Raw | ConvertFrom-Json).version

# ---- 1. Backup ---------------------------------------------------------------
Write-Etapa 'Backup antes de atualizar'
Push-Location $PASTA_APP

try {
    & $node.Caminho 'scripts\backup-agora.js'

    if ($LASTEXITCODE -ne 0) {
        Stop-ComFalha 'Sem backup, a atualizacao foi cancelada. Nada foi alterado.'
    }

    # ---- 2. Codigo novo ---------------------------------------------------------
    Write-Etapa 'Codigo novo'

    if (Test-Path (Join-Path $PASTA_APP '.git')) {
        & git.exe pull --ff-only

        if ($LASTEXITCODE -ne 0) {
            Stop-ComFalha 'O git pull falhou (veja acima). O servidor continua na versao atual.'
        }
    } else {
        Write-Host 'Pasta sem Git: usando os arquivos que ja estao nela (o zip novo deve ter sido extraido por cima).'
    }

    $versaoDepois = (Get-Content (Join-Path $PASTA_APP 'package.json') -Raw | ConvertFrom-Json).version
    Write-Host "Versao: $versaoAntes -> $versaoDepois"

    # ---- 3. Trocar a versao --------------------------------------------------------
    Write-Etapa 'Parando o servidor'
    Stop-ServidorEscalas $PASTA_APP

    Write-Etapa 'Dependencias (npm ci)'
    $npm = Join-Path (Split-Path $node.Caminho) 'npm.cmd'
    & $npm ci --omit=dev --no-audit --no-fund

    if ($LASTEXITCODE -ne 0) {
        Write-Falha 'O npm ci falhou. Subindo o servidor mesmo assim para tentar manter o sistema no ar...'
    }
} finally {
    Pop-Location
}

Write-Etapa 'Subindo o servidor'
Start-ScheduledTask -TaskName $NOME_TAREFA

if (-not (Wait-ServidorPronto -Porta $Porta)) {
    Stop-ComFalha "Veja o log em $(Join-Path $PASTA_APP 'logs\servidor.log'). O backup de antes da atualizacao esta na pasta de backup."
}

Write-Host ''
Write-Host "Pronto! App de Escalas $versaoDepois no ar." -ForegroundColor Green
