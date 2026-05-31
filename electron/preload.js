const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopSetup', {
    getContext() {
        return ipcRenderer.invoke('desktop-setup:get-context');
    },
    browseDirectory(initialDirectory = '') {
        return ipcRenderer.invoke('desktop-setup:browse-directory', initialDirectory);
    },
    save(payload) {
        return ipcRenderer.invoke('desktop-setup:save', payload);
    }
});

contextBridge.exposeInMainWorld('desktopBackgroundServer', {
    status() {
        return ipcRenderer.invoke('background-server:status');
    },
    install() {
        return ipcRenderer.invoke('background-server:install');
    },
    uninstall() {
        return ipcRenderer.invoke('background-server:uninstall');
    },
    start() {
        return ipcRenderer.invoke('background-server:start');
    },
    stop() {
        return ipcRenderer.invoke('background-server:stop');
    }
});
