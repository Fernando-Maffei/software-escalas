# Funcoes usadas pelo instalar-servidor.ps1 e pelo atualizar-servidor.ps1.
# Carregado com ". $PSScriptRoot\servidor\comum.ps1" - nao roda sozinho.

$NOME_TAREFA = 'CentralDeEscalasServidor'

function Test-Administrador {
    $identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidade)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Etapa([string]$Texto) {
    Write-Host ''
    Write-Host "==> $Texto" -ForegroundColor Cyan
}

function Write-Falha([string]$Texto) {
    Write-Host $Texto -ForegroundColor Red
}

function Stop-ComFalha([string]$Texto) {
    Write-Falha $Texto
    exit 1
}

# ---- Node ------------------------------------------------------------------

# Versao minima: o driver do banco (tedious 20) exige Node 22.12.
$NODE_MINIMO = [version]'22.12.0'

function Update-PathDaSessao {
    $maquina = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $usuario = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$maquina;$usuario"
}

function Get-NodeInstalado {
    $comando = Get-Command node.exe -ErrorAction SilentlyContinue

    if (-not $comando) {
        return $null
    }

    $texto = (& $comando.Source --version) -replace '^v', ''

    return [pscustomobject]@{
        Caminho = $comando.Source
        Versao = [version]$texto
    }
}

# ---- Arquivo .env -------------------------------------------------------------

# Le KEY=valor do .env (o mesmo formato que o servidor le com
# process.loadEnvFile). Aspas simples ou duplas em volta do valor sao tiradas.
function Read-ArquivoEnv([string]$Caminho) {
    $valores = [ordered]@{}

    if (-not (Test-Path $Caminho)) {
        return $valores
    }

    foreach ($linha in Get-Content -LiteralPath $Caminho -Encoding UTF8) {
        if ($linha -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            $valor = $Matches[2].Trim()

            if ($valor.Length -ge 2 -and (($valor[0] -eq "'" -and $valor[-1] -eq "'") -or ($valor[0] -eq '"' -and $valor[-1] -eq '"'))) {
                $valor = $valor.Substring(1, $valor.Length - 2)
            }

            $valores[$Matches[1]] = $valor
        }
    }

    return $valores
}

# Aspas simples: o Node le o conteudo ao pe da letra (sem \n, sem comentario
# com #). Valor que tem aspa simples vai entre aspas duplas.
function Format-ValorEnv([string]$Valor) {
    if (-not $Valor.Contains("'")) {
        return "'$Valor'"
    }

    if (-not $Valor.Contains('"')) {
        return "`"$Valor`""
    }

    throw 'A senha nao pode ter aspas simples e aspas duplas ao mesmo tempo.'
}

# Troca (ou acrescenta) so as chaves informadas e mantem o resto do arquivo,
# inclusive comentarios. Valor $null remove a chave.
function Set-ValoresEnv([string]$Caminho, [hashtable]$Valores) {
    $linhas = New-Object System.Collections.Generic.List[string]
    $pendentes = @{} + $Valores

    if (Test-Path $Caminho) {
        foreach ($linha in Get-Content -LiteralPath $Caminho -Encoding UTF8) {
            if ($linha -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=' -and $pendentes.ContainsKey($Matches[1])) {
                $chave = $Matches[1]

                if ($null -ne $pendentes[$chave]) {
                    $linhas.Add("$chave=$(Format-ValorEnv $pendentes[$chave])")
                }

                $pendentes.Remove($chave)
                continue
            }

            $linhas.Add($linha)
        }
    }

    foreach ($chave in $pendentes.Keys) {
        if ($null -ne $pendentes[$chave]) {
            $linhas.Add("$chave=$(Format-ValorEnv $pendentes[$chave])")
        }
    }

    # UTF-8 sem BOM: o BOM grudaria no nome da primeira variavel.
    [IO.File]::WriteAllLines($Caminho, $linhas, (New-Object Text.UTF8Encoding($false)))
}

# O .env guarda a senha do banco: so administradores e o SYSTEM (que roda o
# servidor) leem.
function Protect-Arquivo([string]$Caminho) {
    & icacls.exe $Caminho /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
}

# ---- SQL Server ---------------------------------------------------------------

function Test-LoginSql([int]$Porta, [string]$Banco, [string]$Login, [string]$Senha) {
    $construtor = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $construtor['Data Source'] = "tcp:localhost,$Porta"
    $construtor['Initial Catalog'] = $Banco
    $construtor['User ID'] = $Login
    $construtor['Password'] = $Senha
    $construtor['Connect Timeout'] = 10
    $conexao = New-Object System.Data.SqlClient.SqlConnection($construtor.ConnectionString)

    try {
        $conexao.Open()
        return $null
    } catch {
        return $_.Exception.Message
    } finally {
        $conexao.Dispose()
    }
}

# ---- Servidor (tarefa agendada) -------------------------------------------------

# Para a tarefa e o que ela sobe (o laco do rodar-servidor.cmd e o node). O
# Stop-ScheduledTask nem sempre derruba os processos filhos, por isso o resto
# e encerrado pela linha de comando, que traz o caminho desta instalacao.
function Stop-ServidorEscalas([string]$PastaApp) {
    Stop-ScheduledTask -TaskName $NOME_TAREFA -ErrorAction SilentlyContinue

    $alvo = [regex]::Escape($PastaApp)
    $processos = Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe' OR Name = 'node.exe'" |
        Where-Object { $_.CommandLine -match $alvo -and $_.CommandLine -match 'rodar-servidor\.cmd|backend\\server\.js' }

    foreach ($processo in $processos) {
        Stop-Process -Id $processo.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Get-DonoDaPorta([int]$Porta) {
    $conexao = Get-NetTCPConnection -State Listen -LocalPort $Porta -ErrorAction SilentlyContinue | Select-Object -First 1

    if (-not $conexao) {
        return $null
    }

    return Get-CimInstance Win32_Process -Filter "ProcessId = $($conexao.OwningProcess)"
}

# Espera o app responder com o banco conectado e o schema aplicado: /api/health
# com database "connected" e uma rota de dados pedindo login (401). 503 nessa
# rota quer dizer banco ou migration com problema.
function Wait-ServidorPronto([int]$Porta, [int]$Segundos = 120) {
    $limite = (Get-Date).AddSeconds($Segundos)
    $ultimo = 'sem resposta'

    while ((Get-Date) -lt $limite) {
        try {
            $saude = Invoke-RestMethod -Uri "http://127.0.0.1:$Porta/api/health" -TimeoutSec 5

            if ($saude.database -eq 'connected') {
                try {
                    Invoke-WebRequest -Uri "http://127.0.0.1:$Porta/api/colaboradores" -UseBasicParsing -TimeoutSec 5 | Out-Null
                    $ultimo = 'rota de dados respondeu sem pedir login'
                } catch {
                    $codigo = [int]$_.Exception.Response.StatusCode

                    if ($codigo -eq 401) {
                        return $true
                    }

                    $ultimo = "rota de dados respondeu $codigo"
                }
            } else {
                $ultimo = "banco: $($saude.database)"
            }
        } catch {
            $ultimo = 'sem resposta'
        }

        Start-Sleep -Seconds 3
    }

    Write-Falha "O servidor nao ficou pronto em $Segundos s ($ultimo)."
    return $false
}

function Get-EnderecosDaRede([int]$Porta) {
    $enderecos = @("http://$($env:COMPUTERNAME):$Porta")

    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
        ForEach-Object { $enderecos += "http://$($_.IPAddress):$Porta" }

    return $enderecos
}
