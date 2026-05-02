param(
    [string]$Version = ''
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$installerPath = Join-Path $projectRoot 'out\make\squirrel.windows\x64\AppDeEscalasSetup.exe'
$stdoutLogPath = Join-Path ([System.IO.Path]::GetTempPath()) ("app-escalas-release-" + [System.Guid]::NewGuid().ToString('N') + ".log")
$stderrLogPath = Join-Path ([System.IO.Path]::GetTempPath()) ("app-escalas-release-" + [System.Guid]::NewGuid().ToString('N') + ".err.log")

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Gerador de Setup - App de Escalas'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(920, 700)
$form.MinimumSize = New-Object System.Drawing.Size(920, 700)
$form.BackColor = [System.Drawing.Color]::FromArgb(8, 17, 31)
$form.ForeColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $true

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Location = New-Object System.Drawing.Point(26, 22)
$titleLabel.Size = New-Object System.Drawing.Size(840, 34)
$titleLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 19)
$titleLabel.Text = 'Gerando o novo setup do projeto'
$form.Controls.Add($titleLabel)

$subtitleLabel = New-Object System.Windows.Forms.Label
$subtitleLabel.Location = New-Object System.Drawing.Point(28, 62)
$subtitleLabel.Size = New-Object System.Drawing.Size(840, 46)
$subtitleLabel.ForeColor = [System.Drawing.Color]::FromArgb(173, 189, 208)
$subtitleLabel.Text = 'A janela acompanha validacoes, testes e a criacao do instalador. Quando terminar, o resultado aparece aqui na tela.'
$form.Controls.Add($subtitleLabel)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(28, 120)
$statusLabel.Size = New-Object System.Drawing.Size(840, 30)
$statusLabel.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 12)
$statusLabel.Text = 'Preparando ambiente...'
$form.Controls.Add($statusLabel)

$detailLabel = New-Object System.Windows.Forms.Label
$detailLabel.Location = New-Object System.Drawing.Point(28, 152)
$detailLabel.Size = New-Object System.Drawing.Size(840, 42)
$detailLabel.ForeColor = [System.Drawing.Color]::FromArgb(173, 189, 208)
$detailLabel.Text = 'Verificando scripts do projeto e iniciando a automacao.'
$form.Controls.Add($detailLabel)

$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Location = New-Object System.Drawing.Point(30, 205)
$progressBar.Size = New-Object System.Drawing.Size(840, 22)
$progressBar.Style = 'Marquee'
$progressBar.MarqueeAnimationSpeed = 28
$form.Controls.Add($progressBar)

$phaseList = New-Object System.Windows.Forms.Label
$phaseList.Location = New-Object System.Drawing.Point(30, 238)
$phaseList.Size = New-Object System.Drawing.Size(840, 56)
$phaseList.ForeColor = [System.Drawing.Color]::FromArgb(173, 189, 208)
$phaseList.Text = "Etapas previstas:`r`n1. Validacoes e smoke test  2. Testes do projeto  3. Empacotamento e geracao do AppDeEscalasSetup.exe"
$form.Controls.Add($phaseList)

$logTextBox = New-Object System.Windows.Forms.TextBox
$logTextBox.Location = New-Object System.Drawing.Point(30, 302)
$logTextBox.Size = New-Object System.Drawing.Size(840, 270)
$logTextBox.Multiline = $true
$logTextBox.ScrollBars = 'Vertical'
$logTextBox.ReadOnly = $true
$logTextBox.BackColor = [System.Drawing.Color]::FromArgb(13, 27, 46)
$logTextBox.ForeColor = [System.Drawing.Color]::FromArgb(226, 232, 240)
$logTextBox.Font = New-Object System.Drawing.Font('Consolas', 9.5)
$form.Controls.Add($logTextBox)

$resultLabel = New-Object System.Windows.Forms.Label
$resultLabel.Location = New-Object System.Drawing.Point(30, 584)
$resultLabel.Size = New-Object System.Drawing.Size(840, 42)
$resultLabel.ForeColor = [System.Drawing.Color]::FromArgb(173, 189, 208)
$resultLabel.Text = ''
$form.Controls.Add($resultLabel)

$openFolderButton = New-Object System.Windows.Forms.Button
$openFolderButton.Location = New-Object System.Drawing.Point(466, 628)
$openFolderButton.Size = New-Object System.Drawing.Size(190, 34)
$openFolderButton.Text = 'Abrir pasta do setup'
$openFolderButton.Enabled = $false
$form.Controls.Add($openFolderButton)

$openInstallerButton = New-Object System.Windows.Forms.Button
$openInstallerButton.Location = New-Object System.Drawing.Point(662, 628)
$openInstallerButton.Size = New-Object System.Drawing.Size(208, 34)
$openInstallerButton.Text = 'Mostrar AppDeEscalasSetup.exe'
$openInstallerButton.Enabled = $false
$form.Controls.Add($openInstallerButton)

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Location = New-Object System.Drawing.Point(30, 628)
$closeButton.Size = New-Object System.Drawing.Size(150, 34)
$closeButton.Text = 'Fechar'
$form.Controls.Add($closeButton)

$script:lastStdoutLength = 0
$script:lastStderrLength = 0
$script:releaseProcess = $null
$script:completed = $false

function Add-LogChunk {
    param(
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return
    }

    $logTextBox.AppendText($Text)
    $logTextBox.SelectionStart = $logTextBox.TextLength
    $logTextBox.ScrollToCaret()
}

function Read-NewFileChunk {
    param(
        [string]$Path,
        [ref]$LengthState
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    try {
        $content = [System.IO.File]::ReadAllText($Path)
    } catch {
        return
    }

    if ($content.Length -le $LengthState.Value) {
        return
    }

    $chunk = $content.Substring($LengthState.Value)
    $LengthState.Value = $content.Length
    Add-LogChunk -Text $chunk
}

function Update-PhaseStatus {
    $logText = $logTextBox.Text

    if ($logText -match 'Gerando instalador desktop') {
        $statusLabel.Text = 'Empacotando e gerando o instalador...'
        $detailLabel.Text = 'Esta etapa cria o executavel final do setup.'
        return
    }

    if ($logText -match 'Executando validacoes') {
        $statusLabel.Text = 'Executando validacoes e testes...'
        $detailLabel.Text = 'O projeto esta passando por smoke test e pela suite automatizada.'
        return
    }

    if ($logText -match 'Atualizando versao do projeto') {
        $statusLabel.Text = 'Atualizando a versao do projeto...'
        $detailLabel.Text = 'Package.json e package-lock.json estao sendo alinhados antes da geracao.'
    }
}

function Finish-Success {
    $script:completed = $true
    $progressBar.Style = 'Blocks'
    $progressBar.Value = 100
    $statusLabel.Text = 'Setup gerado com sucesso.'
    $detailLabel.Text = 'A compilacao terminou sem erros e o instalador ja esta pronto para uso.'
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(52, 211, 153)

    if (Test-Path -LiteralPath $installerPath) {
        $resultLabel.Text = "Arquivo final: $installerPath"
        $openFolderButton.Enabled = $true
        $openInstallerButton.Enabled = $true
    } else {
        $resultLabel.Text = 'O processo terminou, mas o arquivo final nao foi encontrado no caminho esperado.'
    }
}

function Finish-Error {
    param(
        [int]$ExitCode
    )

    $script:completed = $true
    $progressBar.Style = 'Blocks'
    $progressBar.Value = 100
    $statusLabel.Text = 'A geracao do setup terminou com erro.'
    $detailLabel.Text = "Revise o log abaixo. Codigo de saida: $ExitCode"
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(248, 113, 113)
    $resultLabel.Text = 'O instalador nao foi gerado. Corrija o erro e rode novamente.'
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 700
$timer.Add_Tick({
    if ($null -eq $script:releaseProcess) {
        return
    }

    Read-NewFileChunk -Path $stdoutLogPath -LengthState ([ref]$script:lastStdoutLength)
    Read-NewFileChunk -Path $stderrLogPath -LengthState ([ref]$script:lastStderrLength)
    Update-PhaseStatus

    $script:releaseProcess.Refresh()

    if (-not $script:releaseProcess.HasExited) {
        return
    }

    $timer.Stop()
    Read-NewFileChunk -Path $stdoutLogPath -LengthState ([ref]$script:lastStdoutLength)
    Read-NewFileChunk -Path $stderrLogPath -LengthState ([ref]$script:lastStderrLength)

    if ($script:releaseProcess.ExitCode -eq 0) {
        Finish-Success
    } else {
        Finish-Error -ExitCode $script:releaseProcess.ExitCode
    }
})

$closeButton.Add_Click({
    if ($script:releaseProcess -and -not $script:releaseProcess.HasExited -and -not $script:completed) {
        [System.Windows.Forms.MessageBox]::Show(
            'A geracao ainda esta em andamento. Aguarde terminar antes de fechar esta janela.',
            'Geracao em andamento',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
        return
    }

    $form.Close()
})

$openFolderButton.Add_Click({
    if (Test-Path -LiteralPath (Split-Path -Parent $installerPath)) {
        Start-Process explorer.exe -ArgumentList (Split-Path -Parent $installerPath) | Out-Null
    }
})

$openInstallerButton.Add_Click({
    if (Test-Path -LiteralPath $installerPath) {
        Start-Process explorer.exe -ArgumentList "/select,`"$installerPath`"" | Out-Null
    }
})

$form.Add_Shown({
    try {
        $arguments = @('run', 'desktop:release')

        if (-not [string]::IsNullOrWhiteSpace($Version)) {
            $arguments += '--'
            $arguments += $Version.Trim()
            $detailLabel.Text = "Versao solicitada: $($Version.Trim())"
        }

        $script:releaseProcess = Start-Process `
            -FilePath 'npm.cmd' `
            -ArgumentList $arguments `
            -WorkingDirectory $projectRoot `
            -PassThru `
            -WindowStyle Hidden `
            -RedirectStandardOutput $stdoutLogPath `
            -RedirectStandardError $stderrLogPath

        Add-LogChunk -Text ("Projeto: " + $projectRoot + [Environment]::NewLine)
        Add-LogChunk -Text ("Comando: npm.cmd " + ($arguments -join ' ') + [Environment]::NewLine + [Environment]::NewLine)
        $timer.Start()
    } catch {
        $timer.Stop()
        Finish-Error -ExitCode 1
        $detailLabel.Text = $_.Exception.Message
        Add-LogChunk -Text ($_.Exception.ToString() + [Environment]::NewLine)
    }
})

$form.Add_FormClosed({
    $timer.Stop()

    if (Test-Path -LiteralPath $stdoutLogPath) {
        Remove-Item -LiteralPath $stdoutLogPath -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path -LiteralPath $stderrLogPath) {
        Remove-Item -LiteralPath $stderrLogPath -Force -ErrorAction SilentlyContinue
    }
})

[void]$form.ShowDialog()
