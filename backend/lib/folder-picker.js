const { execFile } = require('child_process');

const { AppError } = require('./errors');

function openNativeFolderPicker(options = {}) {
    if (process.platform !== 'win32') {
        throw new AppError(501, 'A selecao nativa de pasta esta disponivel apenas no Windows.');
    }

    const initialDirectory = typeof options.initialDirectory === 'string'
        ? options.initialDirectory.trim()
        : '';
    const script = [
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        'Add-Type -AssemblyName System.Windows.Forms',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        "$dialog.Description = 'Selecione a pasta para salvar os backups do sistema.'",
        '$dialog.ShowNewFolderButton = $true',
        '$initialPath = $env:CODEX_BACKUP_INITIAL_DIRECTORY',
        'if ($initialPath -and (Test-Path -LiteralPath $initialPath -PathType Container)) {',
        '    $dialog.SelectedPath = $initialPath',
        '}',
        '$result = $dialog.ShowDialog()',
        'if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dialog.SelectedPath) {',
        '    [Console]::Write($dialog.SelectedPath)',
        '}'
    ].join('\n');

    return new Promise((resolve, reject) => {
        execFile(
            'powershell.exe',
            ['-NoProfile', '-STA', '-Command', script],
            {
                windowsHide: true,
                timeout: 300000,
                env: {
                    ...process.env,
                    CODEX_BACKUP_INITIAL_DIRECTORY: initialDirectory
                }
            },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new AppError(
                        500,
                        'Nao foi possivel abrir a janela de selecao de pasta neste computador.',
                        {
                            code: error.code || null,
                            stderr: String(stderr || '').trim() || null
                        }
                    ));
                    return;
                }

                const directory = String(stdout || '').trim();

                resolve({
                    canceled: !directory,
                    directory: directory || ''
                });
            }
        );
    });
}

module.exports = {
    openNativeFolderPicker
};
