const fs = require('fs');
const path = require('path');

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');

const {
    DEFAULT_SERVER_PORT,
    DEPLOYMENT_MODES,
    buildDefaultLocalDataDirectory,
    normalizeLauncherConfig,
    normalizeTrimmedString
} = require('./launcher-config');

if (require('electron-squirrel-startup')) {
    app.quit();
}

const APP_NAME = 'App de Escalas';
const APP_ID = 'com.squirrel.appdeescalas.appdeescalas';
const WINDOW_ICON_PATH = path.join(__dirname, 'assets', 'app-icon.png');
const PRELOAD_PATH = path.join(__dirname, 'preload.js');
const SETUP_HTML_PATH = path.join(__dirname, 'setup.html');
const LAUNCHER_CONFIG_NAME = 'launcher.local.json';

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
    app.quit();
}

const userDataDirectory = app.getPath('userData');
const launcherConfigPath = path.join(userDataDirectory, LAUNCHER_CONFIG_NAME);
const sessionDataDirectory = path.join(userDataDirectory, 'session');

fs.mkdirSync(sessionDataDirectory, { recursive: true });
app.setPath('sessionData', sessionDataDirectory);
process.env.APP_DE_ESCALAS_DESKTOP = 'true';

let mainWindow = null;
let splashWindow = null;
let setupWindow = null;
let serverController = null;
let shutdownPromise = null;
let isQuitting = false;
let currentLauncherConfig = null;
let currentDataDirectory = '';
let currentLaunchTargetUrl = '';
let currentServerInfo = null;
let allowedAppOrigins = new Set();
let activeSetupSession = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function normalizeAbsoluteUrl(value) {
    return String(value || '').replace(/\/+$/, '');
}

function readLauncherConfig() {
    if (!fs.existsSync(launcherConfigPath)) {
        return null;
    }

    try {
        const rawConfig = JSON.parse(fs.readFileSync(launcherConfigPath, 'utf8'));
        return normalizeLauncherConfig(rawConfig, {
            allowIncomplete: true,
            defaultLocalDataDirectory: buildDefaultLocalDataDirectory()
        });
    } catch (error) {
        console.error('Falha ao ler a configuracao local do desktop.');
        console.error(error);
        return null;
    }
}

function writeLauncherConfig(config) {
    const normalized = normalizeLauncherConfig(config, {
        defaultLocalDataDirectory: buildDefaultLocalDataDirectory()
    });

    fs.mkdirSync(path.dirname(launcherConfigPath), { recursive: true });
    fs.writeFileSync(launcherConfigPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
}

function getSetupContext() {
    const savedConfig = currentLauncherConfig || readLauncherConfig();

    return {
        config: savedConfig || normalizeLauncherConfig({}, {
            allowIncomplete: true,
            defaultLocalDataDirectory: buildDefaultLocalDataDirectory()
        }),
        defaultLocalDataDirectory: buildDefaultLocalDataDirectory(),
        appVersion: app.getVersion(),
        isFirstRun: !savedConfig
    };
}

function persistLaunchMetadata() {
    if (!currentLauncherConfig) {
        return;
    }

    currentLauncherConfig = writeLauncherConfig({
        ...currentLauncherConfig,
        lastRunVersion: app.getVersion(),
        lastSuccessfulLaunchAt: new Date().toISOString()
    });
}

function buildInstallerOutputDirectory() {
    return path.join(process.cwd(), 'out', 'make', 'squirrel.windows', 'x64');
}

function getDataDirectoryToOpen() {
    return currentDataDirectory || userDataDirectory;
}

function focusMainWindow() {
    if (!mainWindow) {
        return;
    }

    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }

    mainWindow.focus();
}

function buildMenuTemplate() {
    return [
        {
            label: 'Aplicativo',
            submenu: [
                {
                    label: 'Configurar modo de acesso',
                    click: async () => {
                        await reconfigureDesktopAccess();
                    }
                },
                {
                    label: 'Abrir pasta de dados',
                    click: async () => {
                        await shell.openPath(getDataDirectoryToOpen());
                    }
                },
                {
                    label: 'Abrir pasta de instaladores',
                    click: async () => {
                        await shell.openPath(buildInstallerOutputDirectory());
                    }
                },
                { type: 'separator' },
                {
                    label: 'Recarregar janela',
                    accelerator: 'F5',
                    click: () => {
                        mainWindow?.reload();
                    }
                },
                {
                    label: 'Fechar aplicativo',
                    accelerator: 'Alt+F4',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Ajuda',
            submenu: [
                {
                    label: 'Sobre',
                    click: async () => {
                        const accessModeLabel = currentLauncherConfig?.mode === DEPLOYMENT_MODES.SERVER
                            ? 'Servidor da rede'
                            : currentLauncherConfig?.mode === DEPLOYMENT_MODES.CLIENT
                                ? 'Cliente da rede'
                                : 'Nesta maquina';

                        await dialog.showMessageBox({
                            type: 'info',
                            title: `Sobre ${APP_NAME}`,
                            message: APP_NAME,
                            detail: [
                                `Versao: ${app.getVersion()}`,
                                `Modo: ${accessModeLabel}`,
                                currentLaunchTargetUrl ? `Endereco atual: ${currentLaunchTargetUrl}` : ''
                            ].filter(Boolean).join('\n')
                        });
                    }
                }
            ]
        }
    ];
}

function createApplicationMenu() {
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}

function isAllowedAppUrl(url) {
    try {
        const parsedUrl = new URL(url);
        return allowedAppOrigins.has(parsedUrl.origin);
    } catch (error) {
        return false;
    }
}

function attachWindowBehaviors(window) {
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedAppUrl(url)) {
            return { action: 'allow' };
        }

        shell.openExternal(url).catch(() => {});
        return { action: 'deny' };
    });

    window.webContents.on('will-navigate', (event, url) => {
        if (isAllowedAppUrl(url)) {
            return;
        }

        event.preventDefault();
        shell.openExternal(url).catch(() => {});
    });

    window.webContents.on('did-fail-load', async (_event, errorCode, errorDescription, validatedURL) => {
        if (errorCode === -3) {
            return;
        }

        await dialog.showMessageBox(window, {
            type: 'error',
            title: 'Falha ao carregar a interface',
            message: 'Nao foi possivel abrir a interface do aplicativo.',
            detail: [
                errorDescription || 'Erro desconhecido ao carregar a janela principal.',
                validatedURL ? `Endereco: ${validatedURL}` : ''
            ].filter(Boolean).join('\n')
        });
    });
}

function renderSplashHtml(payload) {
    const title = escapeHtml(payload?.title || 'Carregando aplicativo...');
    const message = escapeHtml(payload?.message || 'Preparando a interface.');
    const detail = escapeHtml(payload?.detail || '');
    const badge = escapeHtml(payload?.badge || `v${app.getVersion()}`);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(APP_NAME)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #08111f;
      --bg-soft: #13233b;
      --accent: #38bdf8;
      --accent-soft: rgba(56, 189, 248, 0.16);
      --text: #f8fafc;
      --muted: #94a3b8;
      --line: rgba(148, 163, 184, 0.18);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", Arial, sans-serif;
      background:
        radial-gradient(circle at top right, rgba(56, 189, 248, 0.18), transparent 32%),
        radial-gradient(circle at bottom left, rgba(14, 165, 233, 0.14), transparent 28%),
        linear-gradient(160deg, var(--bg) 0%, #0b1628 52%, #12233b 100%);
      color: var(--text);
      display: grid;
      place-items: center;
      overflow: hidden;
    }

    .panel {
      width: min(520px, calc(100vw - 48px));
      padding: 32px;
      border-radius: 28px;
      background: rgba(8, 17, 31, 0.86);
      border: 1px solid var(--line);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
      position: relative;
      overflow: hidden;
    }

    .panel::after {
      content: "";
      position: absolute;
      inset: auto -60px -60px auto;
      width: 180px;
      height: 180px;
      background: radial-gradient(circle, rgba(56, 189, 248, 0.22), transparent 68%);
      pointer-events: none;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: #e0f2fe;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    h1 {
      margin: 22px 0 12px;
      font-size: 32px;
      line-height: 1.12;
    }

    p {
      margin: 0;
      line-height: 1.6;
      color: var(--muted);
      font-size: 15px;
    }

    .detail {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--line);
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .loader {
      display: flex;
      gap: 12px;
      margin-top: 26px;
      align-items: center;
    }

    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--accent);
      opacity: 0.25;
      animation: pulse 1.2s infinite ease-in-out;
    }

    .dot:nth-child(2) { animation-delay: 0.18s; }
    .dot:nth-child(3) { animation-delay: 0.36s; }

    @keyframes pulse {
      0%, 100% { transform: translateY(0); opacity: 0.22; }
      50% { transform: translateY(-8px); opacity: 1; }
    }
  </style>
</head>
<body>
  <section class="panel">
    <div class="badge">${badge}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="detail">${detail}</p>
    <div class="loader" aria-hidden="true">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  </section>
</body>
</html>`;
}

async function updateSplashWindow(payload) {
    if (!splashWindow || splashWindow.isDestroyed()) {
        return;
    }

    const url = `data:text/html;charset=UTF-8,${encodeURIComponent(renderSplashHtml(payload))}`;
    await splashWindow.loadURL(url);
}

async function createSplashWindow(payload) {
    if (splashWindow && !splashWindow.isDestroyed()) {
        await updateSplashWindow(payload);
        return splashWindow;
    }

    splashWindow = new BrowserWindow({
        width: 560,
        height: 360,
        show: false,
        frame: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        alwaysOnTop: true,
        backgroundColor: '#08111f',
        title: APP_NAME,
        icon: fs.existsSync(WINDOW_ICON_PATH) ? WINDOW_ICON_PATH : undefined,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    splashWindow.on('closed', () => {
        splashWindow = null;
    });

    await updateSplashWindow(payload);
    splashWindow.show();

    return splashWindow;
}

function closeSplashWindow() {
    if (!splashWindow || splashWindow.isDestroyed()) {
        return;
    }

    splashWindow.close();
}

function buildLaunchNotice(config, setupResult) {
    const currentVersion = app.getVersion();
    const previousVersion = normalizeTrimmedString(config?.lastRunVersion);
    const isFirstRun = Boolean(setupResult?.isFirstRun) || process.argv.includes('--squirrel-firstrun') || !previousVersion;
    const isUpdated = Boolean(previousVersion && previousVersion !== currentVersion);

    if (isUpdated) {
        return {
            kind: 'updated',
            title: 'Atualizacao concluida',
            message: `O aplicativo foi atualizado da versao ${previousVersion} para ${currentVersion}.`,
            splashTitle: 'Atualizando aplicativo...',
            splashMessage: 'Aplicando a nova versao e preparando o ambiente.',
            previousVersion,
            currentVersion
        };
    }

    if (isFirstRun) {
        return {
            kind: 'installed',
            title: 'Instalacao concluida',
            message: `A versao ${currentVersion} ja esta pronta para uso neste computador.`,
            splashTitle: 'Finalizando instalacao...',
            splashMessage: 'Preparando o aplicativo para a primeira abertura.',
            currentVersion
        };
    }

    return {
        kind: 'default',
        title: '',
        message: '',
        splashTitle: 'Carregando aplicativo...',
        splashMessage: 'Iniciando os modulos do sistema.',
        currentVersion
    };
}

function getModeDescription(mode) {
    if (mode === DEPLOYMENT_MODES.SERVER) {
        return 'Servidor da rede';
    }

    if (mode === DEPLOYMENT_MODES.CLIENT) {
        return 'Cliente da rede';
    }

    return 'Uso nesta maquina';
}

async function maybeShowLaunchNotice(launchNotice, bootResult) {
    const messageLines = [];

    if (launchNotice.kind === 'updated' || launchNotice.kind === 'installed') {
        messageLines.push(launchNotice.message);
    }

    if (currentLauncherConfig?.mode === DEPLOYMENT_MODES.SERVER && Array.isArray(bootResult?.serverInfo?.urls)) {
        const networkUrls = bootResult.serverInfo.urls.filter((url) => !url.includes('localhost'));

        if (networkUrls.length > 0) {
            messageLines.push('');
            messageLines.push('Outras maquinas da mesma rede podem usar estes enderecos:');
            networkUrls.forEach((url) => {
                messageLines.push(url);
            });
        }
    }

    if (messageLines.length === 0) {
        return;
    }

    await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: launchNotice.title || APP_NAME,
        message: `${APP_NAME} - ${getModeDescription(currentLauncherConfig?.mode)}`,
        detail: messageLines.join('\n')
    });
}

function buildInitialSplashPayload(launchNotice, config) {
    const mode = config?.mode || DEPLOYMENT_MODES.STANDALONE;
    const modeText = mode === DEPLOYMENT_MODES.CLIENT
        ? 'Conectando no servidor configurado.'
        : mode === DEPLOYMENT_MODES.SERVER
            ? 'Inicializando o servidor local para outras maquinas.'
            : 'Abrindo o ambiente local desta maquina.';

    return {
        badge: `v${app.getVersion()}`,
        title: launchNotice.splashTitle,
        message: launchNotice.splashMessage,
        detail: `${modeText} Modo atual: ${getModeDescription(mode)}.`
    };
}

function buildAppUrl(port) {
    return `http://127.0.0.1:${port}`;
}

async function startEmbeddedServer(launcherConfig) {
    const { start } = require('../backend/server');
    const isNetworkServer = launcherConfig.mode === DEPLOYMENT_MODES.SERVER;

    serverController = start({
        host: isNetworkServer ? '0.0.0.0' : '127.0.0.1',
        port: isNetworkServer ? launcherConfig.serverPort || DEFAULT_SERVER_PORT : 0,
        installSignalHandlers: false,
        logNetworkUrls: isNetworkServer
    });

    return serverController.ready;
}

async function resolveLaunchTarget(launcherConfig, launchNotice) {
    if (launcherConfig.mode === DEPLOYMENT_MODES.CLIENT) {
        const targetUrl = normalizeAbsoluteUrl(launcherConfig.serverUrl);
        allowedAppOrigins = new Set([new URL(targetUrl).origin]);
        currentLaunchTargetUrl = targetUrl;
        currentDataDirectory = userDataDirectory;
        currentServerInfo = null;

        await updateSplashWindow({
            badge: `v${app.getVersion()}`,
            title: launchNotice.splashTitle,
            message: 'Conectando ao servidor da rede configurado.',
            detail: `Endereco informado: ${targetUrl}`
        });

        return {
            targetUrl,
            serverInfo: null
        };
    }

    currentDataDirectory = launcherConfig.dataDirectory;
    fs.mkdirSync(currentDataDirectory, { recursive: true });
    process.env.APP_DE_ESCALAS_DATA_DIR = currentDataDirectory;

    await updateSplashWindow({
        badge: `v${app.getVersion()}`,
        title: launchNotice.splashTitle,
        message: launcherConfig.mode === DEPLOYMENT_MODES.SERVER
            ? 'Ligando o servidor local para a rede.'
            : 'Ligando o servidor interno desta maquina.',
        detail: `Pasta de dados: ${currentDataDirectory}`
    });

    const serverInfo = await startEmbeddedServer(launcherConfig);
    const targetUrl = buildAppUrl(serverInfo.port);

    allowedAppOrigins = new Set(
        (serverInfo.urls || [])
            .map((url) => {
                try {
                    return new URL(url).origin;
                } catch (error) {
                    return null;
                }
            })
            .filter(Boolean)
    );
    allowedAppOrigins.add(new URL(targetUrl).origin);
    currentLaunchTargetUrl = targetUrl;
    currentServerInfo = serverInfo;

    return {
        targetUrl,
        serverInfo
    };
}

function createMainWindow(targetUrl) {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1100,
        minHeight: 720,
        show: false,
        autoHideMenuBar: false,
        backgroundColor: '#101820',
        title: APP_NAME,
        icon: fs.existsSync(WINDOW_ICON_PATH) ? WINDOW_ICON_PATH : undefined,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    attachWindowBehaviors(mainWindow);
    mainWindow.loadURL(targetUrl);
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    return mainWindow;
}

async function shutdownDesktopApp() {
    if (!serverController) {
        app.exit(0);
        return;
    }

    try {
        await serverController.shutdown('desktop-app');
        app.exit(0);
    } catch (error) {
        console.error('Erro ao encerrar o servidor interno do aplicativo.');
        console.error(error);
        app.exit(1);
    }
}

async function reconfigureDesktopAccess() {
    const setupResult = await openDesktopSetupWindow({ isFirstRun: false });

    if (!setupResult?.config) {
        return;
    }

    currentLauncherConfig = setupResult.config;

    await dialog.showMessageBox({
        type: 'info',
        title: 'Configuracao salva',
        message: 'O aplicativo sera reiniciado para aplicar o novo modo de acesso.'
    });

    app.relaunch();
    app.quit();
}

async function openDesktopSetupWindow(options = {}) {
    if (setupWindow && !setupWindow.isDestroyed()) {
        setupWindow.focus();
        return activeSetupSession?.promise || null;
    }

    let resolveSession;
    let rejectSession;
    const sessionPromise = new Promise((resolve, reject) => {
        resolveSession = resolve;
        rejectSession = reject;
    });

    setupWindow = new BrowserWindow({
        width: 760,
        height: 700,
        show: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        backgroundColor: '#0b1727',
        title: `${APP_NAME} - Configuracao Inicial`,
        icon: fs.existsSync(WINDOW_ICON_PATH) ? WINDOW_ICON_PATH : undefined,
        parent: mainWindow || undefined,
        modal: Boolean(mainWindow),
        webPreferences: {
            preload: PRELOAD_PATH,
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    activeSetupSession = {
        isFirstRun: Boolean(options.isFirstRun),
        completed: false,
        promise: sessionPromise,
        resolve: resolveSession,
        reject: rejectSession
    };

    setupWindow.on('closed', () => {
        if (activeSetupSession && !activeSetupSession.completed) {
            activeSetupSession.resolve(null);
        }

        setupWindow = null;
        activeSetupSession = null;
    });

    await setupWindow.loadFile(SETUP_HTML_PATH);
    setupWindow.show();

    return sessionPromise;
}

ipcMain.handle('desktop-setup:get-context', async () => {
    return getSetupContext();
});

ipcMain.handle('desktop-setup:browse-directory', async (_event, initialDirectory) => {
    const result = await dialog.showOpenDialog(setupWindow || mainWindow || undefined, {
        title: 'Selecione a pasta de dados',
        defaultPath: normalizeTrimmedString(initialDirectory) || buildDefaultLocalDataDirectory(),
        properties: ['openDirectory']
    });

    return {
        canceled: result.canceled,
        directory: result.canceled ? '' : result.filePaths[0]
    };
});

ipcMain.handle('desktop-setup:save', async (_event, payload) => {
    if (!activeSetupSession) {
        throw new Error('Nenhuma sessao de configuracao esta ativa.');
    }

    const normalized = writeLauncherConfig({
        ...payload,
        lastRunVersion: currentLauncherConfig?.lastRunVersion || '',
        lastSuccessfulLaunchAt: currentLauncherConfig?.lastSuccessfulLaunchAt || ''
    });

    activeSetupSession.completed = true;
    activeSetupSession.resolve({
        config: normalized,
        isFirstRun: activeSetupSession.isFirstRun
    });

    setupWindow?.close();
    return { success: true };
});

if (hasSingleInstanceLock) {
    app.on('second-instance', () => {
        focusMainWindow();
    });
}

app.whenReady().then(async () => {
    createApplicationMenu();

    try {
        currentLauncherConfig = readLauncherConfig();

        if (!currentLauncherConfig) {
            const setupResult = await openDesktopSetupWindow({ isFirstRun: true });

            if (!setupResult?.config) {
                app.exit(0);
                return;
            }

            currentLauncherConfig = setupResult.config;
        }

        const launchNotice = buildLaunchNotice(currentLauncherConfig, {
            isFirstRun: !normalizeTrimmedString(currentLauncherConfig.lastRunVersion)
        });

        await createSplashWindow(buildInitialSplashPayload(launchNotice, currentLauncherConfig));
        const bootResult = await resolveLaunchTarget(currentLauncherConfig, launchNotice);
        const window = createMainWindow(bootResult.targetUrl);

        window.once('ready-to-show', async () => {
            window.show();
            closeSplashWindow();
            await maybeShowLaunchNotice(launchNotice, bootResult);
            persistLaunchMetadata();
        });
    } catch (error) {
        console.error('Falha ao iniciar o aplicativo desktop.');
        console.error(error);

        closeSplashWindow();

        await dialog.showMessageBox({
            type: 'error',
            title: 'Falha ao abrir o aplicativo',
            message: 'Nao foi possivel iniciar o ambiente desktop do sistema.',
            detail: error?.message || 'Erro desconhecido ao iniciar o aplicativo.'
        });

        app.exit(1);
    }
});

app.on('activate', () => {
    if (mainWindow) {
        focusMainWindow();
        return;
    }

    if (currentLaunchTargetUrl) {
        const window = createMainWindow(currentLaunchTargetUrl);
        window.once('ready-to-show', () => {
            window.show();
        });
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', (event) => {
    if (isQuitting) {
        return;
    }

    event.preventDefault();
    isQuitting = true;
    shutdownPromise = shutdownPromise || shutdownDesktopApp();
});
