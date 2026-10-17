# Instala o App de Escalas como servidor central desta maquina, num passo so.
# O jeito facil e dar dois cliques em INSTALAR-SERVIDOR.cmd (na raiz da pasta),
# que abre este script como Administrador.
#
# Antes: SQL Server Express instalado e a pasta do app copiada para um lugar
# FORA do OneDrive (ex.: C:\CentralEscalas). O resto e com este script:
#
#   1. confere o Node 22.12+ (oferece instalar pelo winget se faltar);
#   2. instala as dependencias (npm ci --omit=dev);
#   3. prepara o SQL Server: TCP/IP na porta 1433, banco, login proprio do
#      app e porta do app no firewall (scripts\preparar-sql-server.ps1);
#   4. grava o .env com a conexao e a senha do primeiro administrador - a tela
#      de configuracao inicial nem aparece;
#   5. liga o backup automatico (a cada 3 h e ao desligar);
#   6. registra a tarefa que sobe o servidor no boot, sem ninguem logar, e o
#      reinicia se cair;
#   7. sobe o servidor, confere que respondeu e mostra o endereco do time.
#
# Pode rodar de novo sem estragar nada: o que ja existe e mantido.
param(
    [int]$Porta = 4450,
    [string]$Instancia = '',
    [int]$PortaSql = 1433,
    [string]$Banco = 'SoftwareEscalas',
    [string]$Login = 'escalas_app',
    [string]$PastaBackup = 'C:\Backups-Escalas'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'servidor\comum.ps1')

$PASTA_APP = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ARQUIVO_ENV = Join-Path $PASTA_APP '.env'
$PASTA_CONFIG = Join-Path $PASTA_APP 'backend\config'

function Read-Senha([string]$Pergunta) {
    $segura = Read-Host $Pergunta -AsSecureString
    return (New-Object System.Net.NetworkCredential('', $segura)).Password
}

function Read-SenhaConfirmada([string]$Pergunta, [int]$Minimo) {
    while ($true) {
        $primeira = Read-Senha $Pergunta
        $segunda = Read-Senha 'Repita a senha'

        if ($primeira.Length -lt $Minimo) {
            Write-Host "Use pelo menos $Minimo caracteres." -ForegroundColor Yellow
        } elseif ($primeira -cne $segunda) {
            Write-Host 'As senhas nao conferem. Tente de novo.' -ForegroundColor Yellow
        } else {
            return $primeira
        }
    }
}

Write-Host 'Instalacao do servidor - App de Escalas' -ForegroundColor Green
Write-Host "Pasta do app: $PASTA_APP"

if (-not (Test-Administrador)) {
    Stop-ComFalha 'Rode como Administrador: de dois cliques em INSTALAR-SERVIDOR.cmd e aceite o aviso do Windows.'
}

if ($PASTA_APP -match 'OneDrive|Google Drive|Dropbox') {
    Stop-ComFalha 'A pasta do app esta dentro de uma pasta sincronizada (OneDrive/Drive/Dropbox), que corrompe a instalacao. Copie a pasta para C:\CentralEscalas e rode de la.'
}

# ---- 1. Node ----------------------------------------------------------------
Write-Etapa 'Node.js'
Update-PathDaSessao
$node = Get-NodeInstalado

if (-not $node -or $node.Versao -lt $NODE_MINIMO) {
    $atual = if ($node) { "versao $($node.Versao)" } else { 'nao instalado' }
    Write-Host "O app precisa do Node.js $NODE_MINIMO ou mais novo ($atual)."

    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        Stop-ComFalha 'Instale o Node.js LTS por https://nodejs.org e rode este instalador de novo.'
    }

    $resposta = Read-Host 'Instalar o Node.js LTS agora pelo winget? [S/n]'

    if ($resposta -match '^[nN]') {
        Stop-ComFalha 'Instale o Node.js LTS por https://nodejs.org e rode este instalador de novo.'
    }

    & winget.exe install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements
    Update-PathDaSessao
    $node = Get-NodeInstalado

    if (-not $node -or $node.Versao -lt $NODE_MINIMO) {
        Stop-ComFalha 'O Node.js nao ficou disponivel. Feche esta janela, abra o instalador de novo e, se repetir, instale por https://nodejs.org.'
    }
}

Write-Host "Node $($node.Versao) em $($node.Caminho)"

# ---- 2. Dependencias ----------------------------------------------------------
Write-Etapa 'Dependencias do app (npm ci)'
$npm = Join-Path (Split-Path $node.Caminho) 'npm.cmd'
Push-Location $PASTA_APP

try {
    & $npm ci --omit=dev --no-audit --no-fund

    if ($LASTEXITCODE -ne 0) {
        Stop-ComFalha 'O npm ci falhou (veja as mensagens acima). Confira a internet desta maquina e rode de novo.'
    }
} finally {
    Pop-Location
}

# ---- 3. SQL Server ------------------------------------------------------------
Write-Etapa 'SQL Server'
$env_atual = Read-ArquivoEnv $ARQUIVO_ENV
$senhaBanco = ''

if ($env_atual['DB_USER'] -eq $Login -and $env_atual['DB_PASSWORD']) {
    $senhaBanco = $env_atual['DB_PASSWORD']
    Write-Host "Usando a senha do login '$Login' que ja esta no .env."
} else {
    Write-Host "O app entra no banco com o login '$Login' (nao com o sa)."
    Write-Host 'Se o login ainda nao existe, a senha que voce digitar sera a dele; se ja existe, digite a senha atual.'
    $senhaBanco = Read-SenhaConfirmada "Senha do login '$Login' (8+ caracteres, com maiuscula, minuscula, numero e simbolo)" 8
}

$argumentosSql = @{
    PortaSql = $PortaSql
    Banco = $Banco
    Login = $Login
    PortaApp = $Porta
    SenhaLogin = $senhaBanco
}

if ($Instancia) {
    $argumentosSql['Instancia'] = $Instancia
}

& (Join-Path $PSScriptRoot 'preparar-sql-server.ps1') @argumentosSql

if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    Stop-ComFalha 'A preparacao do SQL Server falhou (veja as mensagens acima).'
}

$erroLogin = Test-LoginSql -Porta $PortaSql -Banco $Banco -Login $Login -Senha $senhaBanco

while ($erroLogin) {
    Write-Host "O SQL Server recusou o login '$Login': $erroLogin" -ForegroundColor Yellow
    $senhaBanco = Read-Senha "Digite a senha ATUAL do login '$Login' (ou feche a janela para desistir)"
    $erroLogin = Test-LoginSql -Porta $PortaSql -Banco $Banco -Login $Login -Senha $senhaBanco
}

Write-Host "Login '$Login' conectou pela porta $PortaSql."

# ---- 4. Configuracao (.env) ----------------------------------------------------
Write-Etapa 'Configuracao do app (.env)'
$senhaAdmin = $null

if (-not $env_atual.Contains('DB_PASSWORD')) {
    Write-Host 'Senha do usuario "admin" do sistema (so vale se o banco ainda nao tem usuarios).'
    $senhaAdmin = Read-SenhaConfirmada 'Senha do admin (8+ caracteres)' 8
}

Set-ValoresEnv $ARQUIVO_ENV @{
    PORT = "$Porta"
    DB_SERVER = 'localhost'
    DB_PORT = "$PortaSql"
    DB_DATABASE = $Banco
    DB_USER = $Login
    DB_PASSWORD = $senhaBanco
    DB_ENCRYPT = 'true'
    DB_TRUST_CERT = 'true'
    ADMIN_USERNAME = 'admin'
    ADMIN_PASSWORD = $senhaAdmin
}
Protect-Arquivo $ARQUIVO_ENV
Write-Host "Gravado $ARQUIVO_ENV (so administradores leem)."

# A conexao salva pela tela de configuracao vence o .env: se houver uma antiga,
# ela e guardada com outro nome para valer a do instalador.
$conexaoAntiga = Join-Path $PASTA_CONFIG 'database.local.json'

if (Test-Path $conexaoAntiga) {
    $guardada = "$conexaoAntiga.antes-do-instalador"
    Move-Item -LiteralPath $conexaoAntiga -Destination $guardada -Force
    Write-Host "A conexao antiga (database.local.json) foi guardada em $guardada."
}

# ---- 5. Backup automatico --------------------------------------------------------
Write-Etapa 'Backup automatico'
$configBackup = Join-Path $PASTA_CONFIG 'backup.local.json'

if (Test-Path $configBackup) {
    Write-Host 'Ja existe configuracao de backup; mantida como esta.'
} else {
    New-Item -ItemType Directory -Force -Path $PASTA_CONFIG, $PastaBackup | Out-Null
    $backup = [ordered]@{
        directory = $PastaBackup
        autoBackupEnabled = $true
        autoBackupIntervalMinutes = 180
        autoBackupOnShutdown = $true
        autoBackupRetencao = 240
    }
    [IO.File]::WriteAllText($configBackup, ($backup | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    Write-Host "Backup a cada 3 h e ao desligar, em $PastaBackup (guarda os 240 mais recentes)."
    Write-Host 'Dica: copie essa pasta para fora da maquina de vez em quando (pendrive, rede, nuvem).'
}

# ---- 6. Inicio automatico ----------------------------------------------------------
Write-Etapa 'Inicio automatico (tarefa agendada)'
Stop-ServidorEscalas $PASTA_APP
$dono = Get-DonoDaPorta $Porta

if ($dono) {
    Stop-ComFalha "A porta $Porta ja esta em uso por '$($dono.Name)' (PID $($dono.ProcessId)). Feche esse programa (outra copia do app?) e rode de novo."
}

$rodar = Join-Path $PSScriptRoot 'servidor\rodar-servidor.cmd'
$acao = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$rodar`" `"$($node.Caminho)`"`"" -WorkingDirectory $PASTA_APP
$gatilho = New-ScheduledTaskTrigger -AtStartup
$conta = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
# Sem limite de tempo (o padrao de 3 dias derrubaria o servidor) e uma
# instancia so. Quem reinicia o node quando ele cai e o rodar-servidor.cmd.
$ajustes = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $NOME_TAREFA -Action $acao -Trigger $gatilho -Principal $conta -Settings $ajustes `
    -Description 'App de Escalas: servidor central (sobe no boot, sem login).' -Force | Out-Null
Write-Host "Tarefa '$NOME_TAREFA' registrada: sobe com o Windows, sem ninguem logar."

# ---- 7. Subir e conferir --------------------------------------------------------------
Write-Etapa 'Subindo o servidor'
Start-ScheduledTask -TaskName $NOME_TAREFA

if (-not (Wait-ServidorPronto -Porta $Porta)) {
    Stop-ComFalha "Veja o log em $(Join-Path $PASTA_APP 'logs\servidor.log') e rode o instalador de novo depois de corrigir."
}

# O admin ja foi criado (ou ja existia): a senha nao precisa ficar no disco.
if ($senhaAdmin) {
    Set-ValoresEnv $ARQUIVO_ENV @{ ADMIN_PASSWORD = $null }
    Protect-Arquivo $ARQUIVO_ENV
}

$versao = (Get-Content (Join-Path $PASTA_APP 'package.json') -Raw | ConvertFrom-Json).version
Write-Host ''
Write-Host "Pronto! App de Escalas $versao no ar." -ForegroundColor Green
Write-Host ''
Write-Host 'Enderecos para o time abrir no navegador (Chrome ou Edge):'
Get-EnderecosDaRede $Porta | ForEach-Object { Write-Host "   $_" -ForegroundColor White }
Write-Host ''
Write-Host 'Login: admin, com a senha que voce escolheu (se o banco ja tinha usuarios, valem os de antes).'
Write-Host 'Importante: fixe o IP desta maquina (reserva no roteador), senao o endereco muda um dia.'
Write-Host 'Dados de outra instalacao: Configuracoes > Banco de dados > Importar Dados (os usuarios nao vem no backup).'
Write-Host "Log do servidor: $(Join-Path $PASTA_APP 'logs\servidor.log')"
