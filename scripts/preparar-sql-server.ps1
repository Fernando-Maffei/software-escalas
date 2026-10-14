# Prepara um SQL Server ja instalado na maquina para o App de Escalas rodar
# direto no Windows (sem Docker). Rode UMA vez, no PowerShell como Administrador:
#
#   powershell -ExecutionPolicy Bypass -File scripts\preparar-sql-server.ps1
#
# O que faz, nesta ordem (tudo pode ser repetido sem estragar nada):
#   1. habilita o TCP/IP da instancia numa porta fixa - o app so conecta por
#      TCP/IP, e o SQL Server Express vem com ele desabilitado;
#   2. liga o modo de autenticacao misto (o app entra com usuario e senha do SQL);
#   3. reinicia o servico do SQL Server, se mudou algo nos passos 1 e 2;
#   4. cria o banco e um login proprio do app, dono so desse banco (nao usa o sa);
#   5. libera a porta do APP no firewall, para o time acessar pela rede.
#
# A porta do SQL NAO e liberada no firewall: app e banco ficam na mesma maquina,
# e o time so precisa alcancar o app.
param(
    [string]$Instancia = '',
    [int]$PortaSql = 1433,
    [string]$Banco = 'SoftwareEscalas',
    [string]$Login = 'escalas_app',
    [int]$PortaApp = 4450,
    [switch]$SemFirewall
)

$ErrorActionPreference = 'Stop'
$RAIZ_SQL = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server'

function Test-Administrador {
    $identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidade)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Nome da instancia -> id interno (ex.: SQLEXPRESS -> MSSQL16.SQLEXPRESS).
function Get-InstanciasSql {
    $chave = "$RAIZ_SQL\Instance Names\SQL"

    if (-not (Test-Path $chave)) {
        return @{}
    }

    $instancias = @{}
    $propriedades = Get-ItemProperty $chave
    $propriedades.PSObject.Properties |
        Where-Object { $_.Name -notlike 'PS*' } |
        ForEach-Object { $instancias[$_.Name] = $_.Value }
    return $instancias
}

function Invoke-Sql {
    param(
        [string]$Servidor,
        [string]$BancoAlvo,
        [string]$Comando,
        [hashtable]$Parametros = @{}
    )

    # lpc: = memoria compartilhada, que funciona mesmo antes de o TCP/IP subir.
    $conexao = New-Object System.Data.SqlClient.SqlConnection(
        "Server=lpc:$Servidor;Database=$BancoAlvo;Integrated Security=True;Connect Timeout=30"
    )
    $conexao.Open()

    try {
        $sql = $conexao.CreateCommand()
        $sql.CommandText = $Comando

        foreach ($nome in $Parametros.Keys) {
            [void]$sql.Parameters.AddWithValue("@$nome", $Parametros[$nome])
        }

        return $sql.ExecuteScalar()
    } finally {
        $conexao.Dispose()
    }
}

function Read-SenhaNova {
    while ($true) {
        $primeira = Read-Host "Crie a senha do login '$Login' (8+ caracteres, com maiuscula, minuscula, numero e simbolo)" -AsSecureString
        $segunda = Read-Host 'Repita a senha' -AsSecureString
        $a = (New-Object System.Net.NetworkCredential('', $primeira)).Password
        $b = (New-Object System.Net.NetworkCredential('', $segunda)).Password

        if ($a -and $a -ceq $b) {
            return $a
        }

        Write-Host 'As senhas nao conferem (ou estao vazias). Tente de novo.' -ForegroundColor Yellow
    }
}

if (-not (Test-Administrador)) {
    Write-Host 'Este script precisa do PowerShell aberto como Administrador.' -ForegroundColor Red
    Write-Host 'Menu Iniciar > digite PowerShell > botao direito > Executar como administrador.'
    exit 1
}

# ---- Qual instancia ---------------------------------------------------------
$instancias = Get-InstanciasSql

if ($instancias.Count -eq 0) {
    Write-Host 'Nenhum SQL Server encontrado nesta maquina. Instale o SQL Server Express e rode de novo.' -ForegroundColor Red
    exit 1
}

if (-not $Instancia) {
    if ($instancias.Count -gt 1) {
        Write-Host "Ha mais de uma instancia: $($instancias.Keys -join ', ')." -ForegroundColor Red
        Write-Host 'Rode de novo informando qual usar:  -Instancia NOME'
        exit 1
    }

    $Instancia = @($instancias.Keys)[0]
}

if (-not $instancias.ContainsKey($Instancia)) {
    Write-Host "Instancia '$Instancia' nao existe. Disponiveis: $($instancias.Keys -join ', ')." -ForegroundColor Red
    exit 1
}

$idInstancia = $instancias[$Instancia]
$instanciaPadrao = $Instancia -eq 'MSSQLSERVER'
$servico = if ($instanciaPadrao) { 'MSSQLSERVER' } else { "MSSQL`$$Instancia" }
$servidorLocal = if ($instanciaPadrao) { '(local)' } else { "(local)\$Instancia" }
$chaveServidor = "$RAIZ_SQL\$idInstancia\MSSQLServer"
$chaveTcp = "$chaveServidor\SuperSocketNetLib\Tcp"

Write-Host "Instancia: $Instancia ($idInstancia), servico $servico"

# ---- 1 e 2. TCP/IP em porta fixa e autenticacao mista ----------------------
$precisaReiniciar = $false
$tcp = Get-ItemProperty $chaveTcp
$ipAll = Get-ItemProperty "$chaveTcp\IPAll"

if ($tcp.Enabled -ne 1 -or $ipAll.TcpPort -ne "$PortaSql" -or $ipAll.TcpDynamicPorts) {
    $ocupada = Get-NetTCPConnection -State Listen -LocalPort $PortaSql -ErrorAction SilentlyContinue

    if ($ocupada) {
        $dono = (Get-Process -Id $ocupada[0].OwningProcess -ErrorAction SilentlyContinue).ProcessName
        Write-Host "A porta $PortaSql ja esta em uso por '$dono'. Feche esse programa ou rode com outra porta:  -PortaSql 1434" -ForegroundColor Red
        exit 1
    }

    Set-ItemProperty $chaveTcp -Name Enabled -Value 1
    Set-ItemProperty "$chaveTcp\IPAll" -Name TcpPort -Value "$PortaSql"
    Set-ItemProperty "$chaveTcp\IPAll" -Name TcpDynamicPorts -Value ''
    $precisaReiniciar = $true
    Write-Host "TCP/IP habilitado na porta $PortaSql."
} else {
    Write-Host "TCP/IP ja estava habilitado na porta $PortaSql."
}

if ((Get-ItemProperty $chaveServidor).LoginMode -ne 2) {
    Set-ItemProperty $chaveServidor -Name LoginMode -Value 2
    $precisaReiniciar = $true
    Write-Host 'Autenticacao mista (Windows + SQL Server) habilitada.'
}

# ---- 3. Reinicio do servico -------------------------------------------------
if ($precisaReiniciar) {
    Write-Host "Reiniciando o servico $servico..."
    Restart-Service -Name $servico -Force
}

(Get-Service -Name $servico).WaitForStatus('Running', '00:01:00')

# O servico fica "Running" alguns segundos antes de aceitar conexoes.
$pronto = $false
foreach ($tentativa in 1..20) {
    try {
        [void](Invoke-Sql -Servidor $servidorLocal -BancoAlvo 'master' -Comando 'SELECT 1')
        $pronto = $true
        break
    } catch {
        Start-Sleep -Seconds 3
    }
}

if (-not $pronto) {
    Write-Host 'O SQL Server nao aceitou a conexao com o seu usuario do Windows.' -ForegroundColor Red
    Write-Host 'Rode com o usuario que instalou o SQL Server (ele e o administrador do banco).'
    exit 1
}

# ---- 4. Banco e login do app ------------------------------------------------
Invoke-Sql -Servidor $servidorLocal -BancoAlvo 'master' -Parametros @{ banco = $Banco } -Comando @'
IF DB_ID(@banco) IS NULL
BEGIN
    DECLARE @criar nvarchar(400) = N'CREATE DATABASE ' + QUOTENAME(@banco);
    EXEC (@criar);
END
'@ | Out-Null
Write-Host "Banco '$Banco' pronto."

$loginExiste = Invoke-Sql -Servidor $servidorLocal -BancoAlvo 'master' -Parametros @{ login = $Login } `
    -Comando 'SELECT COUNT(*) FROM sys.sql_logins WHERE name = @login'

if ($loginExiste -eq 0) {
    $criado = $false

    while (-not $criado) {
        $senha = Read-SenhaNova

        try {
            Invoke-Sql -Servidor $servidorLocal -BancoAlvo 'master' -Parametros @{ login = $Login; senha = $senha } -Comando @'
DECLARE @criar nvarchar(1000) =
    N'CREATE LOGIN ' + QUOTENAME(@login) + N' WITH PASSWORD = ' + QUOTENAME(@senha, '''') + N', CHECK_POLICY = ON';
EXEC (@criar);
'@ | Out-Null
            $criado = $true
        } catch {
            Write-Host "O SQL Server recusou a senha: $($_.Exception.InnerException.Message)" -ForegroundColor Yellow
        }
    }

    Write-Host "Login '$Login' criado."
} else {
    Write-Host "Login '$Login' ja existia - a senha dele foi mantida."
}

Invoke-Sql -Servidor $servidorLocal -BancoAlvo $Banco -Parametros @{ login = $Login } -Comando @'
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = @login)
BEGIN
    DECLARE @usuario nvarchar(400) = N'CREATE USER ' + QUOTENAME(@login) + N' FOR LOGIN ' + QUOTENAME(@login);
    EXEC (@usuario);
END

DECLARE @papel nvarchar(400) = N'ALTER ROLE db_owner ADD MEMBER ' + QUOTENAME(@login);
EXEC (@papel);
'@ | Out-Null
Write-Host "Login '$Login' e dono do banco '$Banco' (e so dele)."

# ---- 5. Firewall do app -----------------------------------------------------
if (-not $SemFirewall) {
    $regra = "App de Escalas $PortaApp"

    if (-not (Get-NetFirewallRule -DisplayName $regra -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $regra -Direction Inbound -Protocol TCP -LocalPort $PortaApp -Action Allow | Out-Null
        Write-Host "Porta $PortaApp liberada no firewall."
    } else {
        Write-Host "Porta $PortaApp ja estava liberada no firewall."
    }
}

Write-Host ''
Write-Host 'Pronto. Na tela "Configuracao inicial" do app, informe:' -ForegroundColor Green
Write-Host '  Servidor:  localhost'
Write-Host "  Porta:     $PortaSql"
Write-Host '  Instancia: (deixe vazio)'
Write-Host "  Banco:     $Banco"
Write-Host "  Usuario:   $Login"
Write-Host '  Senha:     a que voce acabou de criar'
