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
